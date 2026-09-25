import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROUTER = process.env.KEY_ROUTER_URL || 'http://127.0.0.1:8788';
const OUT_DIR = 'tmp/model-health';
const now = new Date().toISOString().replace(/[:.]/g, '-');

const args = new Set(process.argv.slice(2));
const smoke = args.has('--smoke');
const allSafe = args.has('--all-safe');
const includePaid = args.has('--include-paid');
const includeQuota = args.has('--include-quota');
const providerArg = process.argv.find((arg) => arg.startsWith('--provider='));
const providerFilter = providerArg ? new Set(providerArg.slice('--provider='.length).split(',').filter(Boolean)) : null;
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const perProviderLimit = limitArg ? Number(limitArg.slice('--limit='.length)) : 12;

const explicitPaidProviderKeys = new Set(['openrouter', 'kilo', 'zen']);
const freeOrShadowProviderKeys = new Set(['nvidia', 'modelscope', 'freemodel', 'logfare', 'zydit', 'zyditv4', 'cloudflare']);
const directQuotaProviderKeys = new Set(['gemini', 'mistral']);
const piModelProvidersPath =
  process.env.PI_MODEL_PROVIDERS ||
  path.join(os.homedir(), '.pi', 'agent', 'model-providers.json');

const notablePatterns = [
  /gpt-5\.5/i,
  /gemini-3\.5-flash/i,
  /gemini-3\.1/i,
  /kimi-k2\.7/i,
  /kimi-k2\.6/i,
  /north-mini/i,
  /fusion/i,
  /owl-alpha/i,
  /glm-5\.[12]/i,
  /mistral-medium-3-5/i,
  /mistral-small-4/i,
  /minimax.*m3/i,
  /nemotron-3/i,
  /qwen3\.[67]/i,
  /nex-n2/i,
  /laguna/i,
  /perceptron/i,
  /ring-2\.6/i,
  /grok-4\.3/i,
  /deepseek.*v4/i
];

function isLikelyNonChat(id) {
  return /embedding|rerank|image|tts|audio|whisper|lyria|banana|deplot|safety/i.test(id);
}

function isFreeLike(providerKey, id) {
  if (/:free\b/i.test(id)) return true;
  if (/-free\b/i.test(id)) return true;
  if (providerKey === 'freemodel') return true;
  if (providerKey === 'logfare') return true;
  return false;
}

function isAllowedPaidException(providerKey, id) {
  if (providerKey === 'opencode-go') {
    return /^(mimo-v2\.5|deepseek-v4-flash)$/i.test(id);
  }
  if (providerKey === 'minimax-direct') {
    return /minimax/i.test(id);
  }
  return false;
}

function costClassFor(providerKey, id) {
  if (isLikelyNonChat(id)) return 'non_chat';
  if (isFreeLike(providerKey, id)) return 'free';
  if (isAllowedPaidException(providerKey, id)) return 'allowed_paid';
  if (freeOrShadowProviderKeys.has(providerKey)) return 'free_or_shadow';
  if (directQuotaProviderKeys.has(providerKey)) return 'direct_quota';
  if (explicitPaidProviderKeys.has(providerKey)) return 'paid';
  return 'unknown';
}

function isDefaultSmokeClass(costClass) {
  return costClass === 'free' || costClass === 'free_or_shadow' || costClass === 'allowed_paid';
}

function isAllowedToSmoke(providerKey, id) {
  const costClass = costClassFor(providerKey, id);
  if (isDefaultSmokeClass(costClass)) return true;
  if (includeQuota && costClass === 'direct_quota') return true;
  if (includePaid && costClass === 'paid') return true;
  return false;
}

function isNotable(id) {
  return notablePatterns.some((re) => re.test(id));
}

function selectSmokeIds(providerKey, ids) {
  const safe = ids.filter((id) => isAllowedToSmoke(providerKey, id));
  if (allSafe) return safe;
  const notable = safe.filter(isNotable);
  const starter = notable.length ? notable : safe;
  return starter.slice(0, perProviderLimit);
}

function inferConfiguredProviderKey(model) {
  const baseUrl = String(model.baseUrl || '').toLowerCase();
  const envKey = String(model.envKey || '').toUpperCase();
  const name = String(model.name || '').toLowerCase();
  if (baseUrl.includes('opencode.ai/zen/go')) return 'opencode-go';
  if (baseUrl.includes('minimax') || envKey === 'MINIMAX_API_KEY' || name.includes('[minimax direct]')) {
    return 'minimax-direct';
  }
  return null;
}

function loadConfiguredAllowedPaid() {
  if (!fs.existsSync(piModelProvidersPath)) return [];
  const raw = JSON.parse(fs.readFileSync(piModelProvidersPath, 'utf8'));
  const records = [];
  const seenObjects = new Set();

  function walk(value) {
    if (!value || typeof value !== 'object' || seenObjects.has(value)) return;
    seenObjects.add(value);
    if (typeof value.id === 'string' && typeof value.baseUrl === 'string') {
      const providerKey = inferConfiguredProviderKey(value);
      if (providerKey && isAllowedPaidException(providerKey, value.id)) {
        records.push({
          provider: providerKey,
          id: value.id,
          name: value.name || value.id,
          contextWindow: value.contextWindow ?? value.limits?.context_window ?? null,
          maxTokens: value.maxTokens ?? value.limits?.max_tokens ?? null,
          metadataLastVerified: value.metadataLastVerified ?? null
        });
      }
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
    } else {
      for (const item of Object.values(value)) walk(item);
    }
  }

  walk(raw);
  const seen = new Set();
  return records.filter((record) => {
    const key = `${record.provider}:${record.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function countByCostClass(providerKey, ids) {
  const counts = {};
  for (const id of ids) {
    const costClass = costClassFor(providerKey, id);
    counts[costClass] = (counts[costClass] || 0) + 1;
  }
  return counts;
}

async function getJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { res, json, text };
}

function modelIdsFromPayload(payload) {
  const data = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : [];
  return data.map((item) => (typeof item === 'string' ? item : item?.id || item?.name || item?.model)).filter(Boolean);
}

async function smokeModel(route, model) {
  const base = route.baseUrl.replace(/\/$/, '');
  const url = `${base}/chat/completions`;
  const payload = {
    model,
    messages: [
      { role: 'system', content: 'Reply with exactly: ok' },
      { role: 'user', content: 'health check' }
    ],
    max_tokens: 8,
    temperature: 0
  };
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const { res, json, text } = await getJson(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const elapsedMs = Date.now() - started;
    const choice = json?.choices?.[0];
    const content = choice?.message?.content ?? choice?.delta?.content ?? '';
    const reasoning =
      choice?.message?.reasoning_content ??
      choice?.message?.reasoning ??
      choice?.delta?.reasoning_content ??
      null;
    return {
      model,
      ok: res.ok && Boolean(choice),
      status: res.status,
      elapsedMs,
      finish_reason: choice?.finish_reason ?? null,
      contentPreview: String(content).slice(0, 80),
      reasoningSeen: Boolean(reasoning),
      error: res.ok ? null : (json?.error?.message || json?.message || text.slice(0, 300))
    };
  } catch (error) {
    return {
      model,
      ok: false,
      status: null,
      elapsedMs: Date.now() - started,
      finish_reason: null,
      contentPreview: '',
      reasoningSeen: false,
      error: error?.name === 'AbortError' ? 'timeout' : error?.message || String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function markdownReport(result) {
  const lines = [];
  lines.push(`# Model Health Check`);
  lines.push('');
  lines.push(`Generated: ${result.generatedAt}`);
  lines.push(`Router: ${ROUTER}`);
  lines.push(`Mode: ${smoke ? 'catalog + smoke' : 'catalog only'}`);
  lines.push(`Paid smoke: ${includePaid ? 'enabled' : 'disabled'}`);
  lines.push(`Direct quota smoke: ${includeQuota ? 'enabled' : 'disabled'}`);
  lines.push('');
  lines.push(`| Provider | Catalog | Free | Free/shadow | Direct quota | Allowed paid | Paid | Unknown | Smoke OK | Smoke Fail | Skipped | Notes |`);
  lines.push(`|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|`);
  for (const p of result.providers) {
    const c = p.classCounts || {};
    lines.push(`| ${p.provider} | ${p.count} | ${c.free || 0} | ${c.free_or_shadow || 0} | ${c.direct_quota || 0} | ${c.allowed_paid || 0} | ${c.paid || 0} | ${c.unknown || 0} | ${p.smokeOk} | ${p.smokeFail} | ${p.skippedCount} | ${p.error ? p.error.replace(/\|/g, '/') : ''} |`);
  }
  lines.push('');
  if (result.configuredAllowedPaid?.length) {
    lines.push(`## Configured Allowed Paid Exceptions`);
    lines.push('');
    lines.push(`These are allowed to smoke even though they are paid because the user explicitly approved them.`);
    lines.push('');
    lines.push(`| Provider | Model | Name | Context | Max Output | Verified |`);
    lines.push(`|---|---|---|---:|---:|---|`);
    for (const model of result.configuredAllowedPaid) {
      lines.push(`| ${model.provider} | ${model.id} | ${(model.name || '').replace(/\|/g, '/')} | ${model.contextWindow ?? ''} | ${model.maxTokens ?? ''} | ${model.metadataLastVerified ?? ''} |`);
    }
    lines.push('');
  }
  for (const p of result.providers) {
    lines.push(`## ${p.provider} (${p.label})`);
    lines.push('');
    if (p.error) {
      lines.push(`Error: ${p.error}`);
      lines.push('');
      continue;
    }
    lines.push(`Catalog count: ${p.count}`);
    lines.push(`Cost classes: ${JSON.stringify(p.classCounts)}`);
    lines.push(`Smoke candidates: ${p.smokeCandidates.length}`);
    lines.push('');
    if (p.smokes.length) {
      lines.push(`| Model | OK | Status | ms | Reasoning | Error |`);
      lines.push(`|---|---|---:|---:|---|---|`);
      for (const s of p.smokes) {
        lines.push(`| ${s.model} | ${s.ok ? 'yes' : 'no'} | ${s.status ?? ''} | ${s.elapsedMs} | ${s.reasoningSeen ? 'yes' : 'no'} | ${(s.error || '').replace(/\|/g, '/').slice(0, 160)} |`);
      }
      lines.push('');
    }
    const notable = p.ids.filter(isNotable).slice(0, 40);
    if (notable.length) {
      lines.push(`Notable visible models:`);
      for (const id of notable) lines.push(`- ${id}`);
      lines.push('');
    }
  }
  return lines.join('\n');
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const catalog = await getJson(`${ROUTER}/catalog`);
  if (!catalog.res.ok) throw new Error(`catalog failed ${catalog.res.status}`);
  const routes = (catalog.json.routes || []).filter((route) => !providerFilter || providerFilter.has(route.providerKey));
  const result = {
    generatedAt: new Date().toISOString(),
    router: ROUTER,
    mode: smoke ? 'smoke' : 'catalog',
    policy: {
      defaultSmokeClasses: ['free', 'free_or_shadow', 'allowed_paid'],
      includePaid,
      includeQuota,
      allowedPaidExceptions: [
        'opencode-go/mimo-v2.5',
        'opencode-go/deepseek-v4-flash',
        'minimax-direct/*minimax*'
      ]
    },
    configuredAllowedPaid: loadConfiguredAllowedPaid(),
    providers: []
  };

  for (const route of routes) {
    const entry = {
      provider: route.providerKey,
      label: route.label,
      status: null,
      count: 0,
      ids: [],
      smokeCandidates: [],
      skippedCount: 0,
      classCounts: {},
      smokes: [],
      smokeOk: 0,
      smokeFail: 0,
      error: null
    };
    try {
      const models = await getJson(`${route.baseUrl.replace(/\/$/, '')}/models`);
      entry.status = models.res.status;
      if (!models.res.ok) {
        entry.error = models.json?.error?.message || models.json?.error || `models failed ${models.res.status}`;
      } else {
        entry.ids = modelIdsFromPayload(models.json);
        entry.count = entry.ids.length;
        entry.classCounts = countByCostClass(route.providerKey, entry.ids);
        entry.smokeCandidates = selectSmokeIds(route.providerKey, entry.ids);
        entry.skippedCount = entry.ids.length - entry.smokeCandidates.length;
        if (smoke) {
          for (const id of entry.smokeCandidates) {
            const s = await smokeModel(route, id);
            entry.smokes.push(s);
            if (s.ok) entry.smokeOk += 1;
            else entry.smokeFail += 1;
          }
        }
      }
    } catch (error) {
      entry.error = error?.message || String(error);
    }
    result.providers.push(entry);
    console.log(`${entry.provider}: catalog=${entry.count} classes=${JSON.stringify(entry.classCounts)} smoke=${entry.smokeOk}/${entry.smokeCandidates.length} fail=${entry.smokeFail} ${entry.error || ''}`);
  }

  const jsonPath = path.join(OUT_DIR, `health-${now}.json`);
  const mdPath = path.join(OUT_DIR, `health-${now}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  fs.writeFileSync(mdPath, markdownReport(result));
  console.log(`WROTE ${jsonPath}`);
  console.log(`WROTE ${mdPath}`);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
