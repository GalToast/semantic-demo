import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ROUTER = process.env.KEY_ROUTER_URL || 'http://127.0.0.1:8788'
const OUT_DIR = 'tmp/model-health'
const now = new Date().toISOString().replace(/[:.]/g, '-')

const args = new Set(process.argv.slice(2))
const smoke = args.has('--smoke')
const allSafe = args.has('--all-safe')
const includePaid = args.has('--include-paid')
const includeQuota = args.has('--include-quota')
const providerArg = process.argv.find((arg) => arg.startsWith('--provider='))
const providerFilter = providerArg ? new Set(providerArg.slice('--provider='.length).split(',').filter(Boolean)) : null
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))
const perProviderLimit = limitArg ? Number(limitArg.slice('--limit='.length)) : 12
const smokeDelayArg = process.argv.find((arg) => arg.startsWith('--smoke-delay='))
const smokeDelayMs = smokeDelayArg
    ? Number(smokeDelayArg.slice('--smoke-delay='.length))
    : 250

// Reasoning-emission check (opt-in, key-rate-limited). Detects models wired for reasoning that no
// longer stream a reasoning_content/reasoning delta (the DeepSeek V4 Pro hang class).
const reasoningCheck = args.has('--reasoning-check')
const reasonLimitArg = process.argv.find((arg) => arg.startsWith('--reasoning-limit='))
const reasonLimit = reasonLimitArg ? Number(reasonLimitArg.slice('--reasoning-limit='.length)) : 4
const reasonDelayArg = process.argv.find((arg) => arg.startsWith('--reasoning-delay='))
const reasonDelay = reasonDelayArg ? Number(reasonDelayArg.slice('--reasoning-delay='.length)) : 2000
const reasonMaxTokensArg = process.argv.find((arg) => arg.startsWith('--reasoning-max-tokens='))
const reasonMaxTokens = reasonMaxTokensArg ? Number(reasonMaxTokensArg.slice('--reasoning-max-tokens='.length)) : 4096
const reasonTimeoutArg = process.argv.find((arg) => arg.startsWith('--reasoning-timeout='))
const reasonTimeout = reasonTimeoutArg ? Number(reasonTimeoutArg.slice('--reasoning-timeout='.length)) : 90000

const explicitPaidProviderKeys = new Set(['openrouter', 'kilo', 'zen'])
const freeOrShadowProviderKeys = new Set([
    'nvidia',
    'modelscope',
    'freemodel',
    'logfare',
    'zydit',
    'zyditv4',
    'cloudflare'
])
const directQuotaProviderKeys = new Set(['gemini', 'mistral'])
const piModelProvidersPath =
    process.env.PI_MODEL_PROVIDERS || path.join(os.homedir(), '.pi', 'agent', 'model-providers.json')

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
]

const timeoutArg = process.argv.find((arg) => arg.startsWith('--timeout='))
const TIMEOUT_MS = timeoutArg ? Number(timeoutArg.slice('--timeout='.length)) : 120000

function isLikelyNonChat(id) {
    return /embedding|rerank|image|tts|audio|whisper|lyria|banana|deplot|safety/i.test(id)
}

function isFreeLike(providerKey, id) {
    if (/:free\b/i.test(id)) return true
    if (/-free\b/i.test(id)) return true
    if (providerKey === 'freemodel') return true
    if (providerKey === 'logfare') return true
    return false
}

function isAllowedPaidException(providerKey, id) {
    if (providerKey === 'opencode-go') {
        return /^(mimo-v2\.5|deepseek-v4-flash)$/i.test(id)
    }
    if (providerKey === 'minimax-direct') {
        return /minimax/i.test(id)
    }
    return false
}

function costClassFor(providerKey, id) {
    if (isLikelyNonChat(id)) return 'non_chat'
    if (isFreeLike(providerKey, id)) return 'free'
    if (isAllowedPaidException(providerKey, id)) return 'allowed_paid'
    if (freeOrShadowProviderKeys.has(providerKey)) return 'free_or_shadow'
    if (directQuotaProviderKeys.has(providerKey)) return 'direct_quota'
    if (explicitPaidProviderKeys.has(providerKey)) return 'paid'
    return 'unknown'
}

function isDefaultSmokeClass(costClass) {
    return costClass === 'free' || costClass === 'free_or_shadow' || costClass === 'allowed_paid'
}

function isAllowedToSmoke(providerKey, id) {
    const costClass = costClassFor(providerKey, id)
    if (isDefaultSmokeClass(costClass)) return true
    if (includeQuota && costClass === 'direct_quota') return true
    if (includePaid && costClass === 'paid') return true
    return false
}

function isNotable(id) {
    return notablePatterns.some((re) => re.test(id))
}

function selectSmokeIds(providerKey, ids) {
    const safe = ids.filter((id) => isAllowedToSmoke(providerKey, id))
    if (allSafe) return safe
    const notable = safe.filter(isNotable)
    const starter = notable.length ? notable : safe
    return starter.slice(0, perProviderLimit)
}

function inferConfiguredProviderKey(model) {
    const baseUrl = String(model.baseUrl || '').toLowerCase()
    const envKey = String(model.envKey || '').toUpperCase()
    const name = String(model.name || '').toLowerCase()
    if (baseUrl.includes('opencode.ai/zen/go')) return 'opencode-go'
    if (baseUrl.includes('minimax') || envKey === 'MINIMAX_API_KEY' || name.includes('[minimax direct]')) {
        return 'minimax-direct'
    }
    return null
}

function loadConfiguredAllowedPaid() {
    if (!fs.existsSync(piModelProvidersPath)) return []
    const raw = JSON.parse(fs.readFileSync(piModelProvidersPath, 'utf8'))
    const records = []
    const seenObjects = new Set()

    function walk(value) {
        if (!value || typeof value !== 'object' || seenObjects.has(value)) return
        seenObjects.add(value)
        if (typeof value.id === 'string' && typeof value.baseUrl === 'string') {
            const providerKey = inferConfiguredProviderKey(value)
            if (providerKey && isAllowedPaidException(providerKey, value.id)) {
                records.push({
                    provider: providerKey,
                    id: value.id,
                    name: value.name || value.id,
                    contextWindow: value.contextWindow ?? value.limits?.context_window ?? null,
                    maxTokens: value.maxTokens ?? value.limits?.max_tokens ?? null,
                    metadataLastVerified: value.metadataLastVerified ?? null
                })
            }
        }
        if (Array.isArray(value)) {
            for (const item of value) walk(item)
        } else {
            for (const item of Object.values(value)) walk(item)
        }
    }

    walk(raw)
    const seen = new Set()
    return records.filter((record) => {
        const key = `${record.provider}:${record.id}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
}

function countByCostClass(providerKey, ids) {
    const counts = {}
    for (const id of ids) {
        const costClass = costClassFor(providerKey, id)
        counts[costClass] = (counts[costClass] || 0) + 1
    }
    return counts
}

async function getJson(url, init) {
    const res = await fetch(url, init)
    const text = await res.text()
    let json
    try {
        json = text ? JSON.parse(text) : null
    } catch {
        json = { raw: text.slice(0, 500) }
    }
    return { res, json, text }
}

function modelIdsFromPayload(payload) {
    const data = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : []
    return data.map((item) => (typeof item === 'string' ? item : item?.id || item?.name || item?.model)).filter(Boolean)
}

async function smokeModel(route, model) {
    const base = route.baseUrl.replace(/\/$/, '')
    const url = `${base}/chat/completions`
    const payload = {
        model,
        messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
        max_tokens: 8,
        temperature: 0.01
    }
    const started = Date.now()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
        const { res, json, text } = await getJson(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
        })
        const elapsedMs = Date.now() - started
        const choice = json?.choices?.[0]
        const content = choice?.message?.content ?? choice?.delta?.content ?? ''
        const reasoning =
            choice?.message?.reasoning_content ?? choice?.message?.reasoning ?? choice?.delta?.reasoning_content ?? null
        return {
            model,
            ok: res.ok && Boolean(choice),
            status: res.status,
            elapsedMs,
            finish_reason: choice?.finish_reason ?? null,
            contentPreview: String(content).slice(0, 80),
            reasoningSeen: Boolean(reasoning),
            error: res.ok ? null : json?.error?.message || json?.message || text.slice(0, 300)
        }
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
        }
    } finally {
        clearTimeout(timeout)
    }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
function normalizeBaseUrl(s) {
    return String(s || '')
        .trim()
        .toLowerCase()
        .replace(/\/+$/, '')
}

// Walk model-providers.json and return every entry wired for reasoning (reasoning:true OR thinking
// wiring). These are the models that DEPEND on a reasoning_content stream; if a provider silently
// stops emitting it, Pi can hang waiting. `effort` prefers the model's own high/xhigh level map.
function loadReasoningWired() {
    if (!fs.existsSync(piModelProvidersPath)) return []
    const raw = JSON.parse(fs.readFileSync(piModelProvidersPath, 'utf8'))
    const out = []
    const seen = new Set()
    ;(function walk(value) {
        if (!value || typeof value !== 'object') return
        if (typeof value.id === 'string' && typeof value.baseUrl === 'string') {
            const c = value.compat || {}
            const extra = c.extra_body || {}
            const wired =
                value.reasoning === true ||
                Boolean(c.thinkingFormat) ||
                c.requiresReasoningContentOnAssistantMessages === true ||
                Boolean(extra.include_reasoning) ||
                Boolean(extra.reasoning_split)
            if (wired) {
                const key = `${value.baseUrl}::${value.id}`
                if (!seen.has(key)) {
                    seen.add(key)
                    out.push({
                        id: value.id,
                        baseUrl: value.baseUrl,
                        provider: (value.normalizedModel && value.normalizedModel.provider) || value.provider || null,
                        thinkingFormat: c.thinkingFormat || null,
                        requiresReasoningContentOnAssistantMessages:
                            c.requiresReasoningContentOnAssistantMessages === true,
                        includeReasoning: Boolean(extra.include_reasoning),
                        reasoningSplit: Boolean(extra.reasoning_split),
                        supportsReasoningEffort: c.supportsReasoningEffort === true,
                        effort:
                            (value.thinkingLevelMap && (value.thinkingLevelMap.high || value.thinkingLevelMap.xhigh)) ||
                            'high'
                    })
                }
            }
        }
        if (Array.isArray(value)) {
            for (const item of value) walk(item)
        } else {
            for (const item of Object.values(value)) walk(item)
        }
    })(raw)
    return out
}

// Stream one reasoning-wired model and report whether a reasoning_content/reasoning delta arrives.
// Faithfully reproduces what Pi sends: reasoning_effort when supported/wired, include_reasoning /
// reasoning_split from extra_body. A 200 with no reasoning delta = suspected regression.
async function probeReasoning(route, w, opts) {
    const base = route.baseUrl.replace(/\/$/, '')
    const url = `${base}/chat/completions`
    const body = {
        model: w.id,
        stream: true,
        max_tokens: opts.maxTokens,
        temperature: 0,
        messages: [{ role: 'user', content: 'What is 7*9? Think step by step and show your reasoning.' }]
    }
    if (w.supportsReasoningEffort || w.thinkingFormat || w.requiresReasoningContentOnAssistantMessages) {
        body.reasoning_effort = w.effort || 'high'
    }
    // OpenRouter-format reasoning uses its own `reasoning: { enabled, effort }` shape, not the generic
    // reasoning_effort field. Without this, openrouter-format models (e.g. tencent/hy3) never emit a
    // reasoning stream and the check false-flags them as regressed.
    if (w.thinkingFormat === 'openrouter') {
        body.reasoning = { enabled: true, effort: w.effort || 'high' }
    }
    if (w.includeReasoning || w.requiresReasoningContentOnAssistantMessages) body.include_reasoning = true
    if (w.reasoningSplit) body.reasoning_split = true
    const started = Date.now()
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs)
    let status = '?'
    let reason = ''
    let rLen = 0
    let cLen = 0
    let contentText = ''
    let firstR = null
    let firstC = null
    const fields = new Set()
    let finish = null
    try {
        const r = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
            signal: ctrl.signal
        })
        status = r.status
        if (!r.ok) {
            reason = (await r.text()).slice(0, 220)
        } else {
            const reader = r.body.getReader()
            const dec = new TextDecoder()
            let buf = ''
            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                buf += dec.decode(value, { stream: true })
                const lines = buf.split('\n')
                buf = lines.pop()
                for (const line of lines) {
                    const s = line.startsWith('data:') ? line.slice(5).trim() : line.trim()
                    if (!s || s === '[DONE]') continue
                    try {
                        const e = JSON.parse(s)
                        const d = e.choices?.[0]?.delta || {}
                        for (const k of Object.keys(d)) fields.add(k)
                        if (d.reasoning_content) {
                            if (firstR === null) firstR = Date.now() - started
                            rLen += d.reasoning_content.length
                        }
                        if (d.reasoning) {
                            if (firstR === null) firstR = Date.now() - started
                            rLen += d.reasoning.length
                        }
                        if (d.content) {
                            if (firstC === null) firstC = Date.now() - started
                            cLen += d.content.length
                            contentText += d.content
                        }
                        if (e.choices?.[0]?.finish_reason) finish = e.choices[0].finish_reason
                    } catch {
                        /* ignore partial/non-JSON lines */
                    }
                }
            }
        }
    } catch (error) {
        reason = error?.name === 'AbortError' ? 'timeout' : error?.message || String(error)
    } finally {
        clearTimeout(timer)
    }
    const reasoningEmitted = rLen > 0
    // Some providers embed reasoning inside content (e.g. <think>...</think>, <reasoning>); those are
    // NOT regressed even without a separate reasoning_content field.
    const reasoningEmbedded = /<\s*think\s*>|<\s*\/?\s*reasoning\s*>|<\s*\/?\s*thought\s*>/i.test(contentText)
    return {
        id: w.id,
        status,
        elapsedMs: Date.now() - started,
        reasoningEmitted,
        reasoningEmbedded,
        reasoningLen: rLen,
        contentLen: cLen,
        firstReasoningMs: firstR,
        firstContentMs: firstC,
        finish,
        fields: [...fields],
        error: reason || null,
        errored: Boolean(reason),
        // Reachable, completed (no error/timeout), no separate reasoning stream AND no embedded
        // reasoning = the DeepSeek V4 Pro hang class. Timeouts/errors are a different failure.
        regressed: status === 200 && !reason && !reasoningEmitted && !reasoningEmbedded
    }
}

// Run the reasoning check across live catalog routes only (skips external providers so we don't
// hammer their keys). Sequential with inter-probe delay; per-provider cap to bound key usage.
async function runReasoningChecks(result, reasoningWired, opts) {
    const matched = new Set()
    const checks = []
    for (const p of result.providers) {
        const pnorm = normalizeBaseUrl(p.baseUrl)
        const cands = reasoningWired.filter((w) => normalizeBaseUrl(w.baseUrl) === pnorm && p.ids.includes(w.id))
        cands.forEach((w) => matched.add(w))
        const notVisible = reasoningWired
            .filter((w) => normalizeBaseUrl(w.baseUrl) === pnorm && !p.ids.includes(w.id))
            .map((w) => w.id)
        const capped = opts.limit > 0 ? cands.slice(0, opts.limit) : cands
        const overLimit = cands.length - capped.length
        const cappedIds = opts.limit > 0 ? cands.slice(opts.limit).map((w) => w.id) : []
        const perRoute = []
        for (let i = 0; i < capped.length; i++) {
            const w = capped[i]
            const r = await probeReasoning({ baseUrl: p.baseUrl, providerKey: p.provider }, w, opts)
            checks.push({ provider: p.provider, id: w.id, ...r })
            perRoute.push({ id: w.id, ...r })
            if (i < capped.length - 1) await sleep(opts.delay)
        }
        if (cands.length) {
            p.reasoning = {
                visibleCount: cands.length,
                checkedCount: capped.length,
                overLimit,
                cappedIds,
                notVisible,
                checks: perRoute
            }
        }
    }
    const skippedNoRoute = reasoningWired.filter((w) => !matched.has(w))
    let capped = 0
    const cappedList = []
    let notVisible = 0
    const notVisibleList = []
    for (const p of result.providers) {
        if (!p.reasoning) continue
        capped += p.reasoning.overLimit || 0
        for (const id of p.reasoning.cappedIds || []) cappedList.push(`${p.provider}:${id}`)
        notVisible += (p.reasoning.notVisible || []).length
        for (const id of p.reasoning.notVisible || []) notVisibleList.push(`${p.provider}:${id}`)
    }
    const ok = checks.filter((c) => c.status === 200 && (c.reasoningEmitted || c.reasoningEmbedded)).length
    const regressed = checks.filter((c) => c.regressed).length
    const errors = checks.filter((c) => c.errored).length
    const embedded = checks.filter((c) => c.reasoningEmbedded).length
    return {
        total: reasoningWired.length,
        probed: checks.length,
        checks,
        skippedNoRoute,
        capped,
        cappedList,
        notVisible,
        notVisibleList,
        summary: { ok, regressed, errors, embedded }
    }
}

function markdownReport(result) {
    const lines = []
    lines.push(`# Model Health Check`)
    lines.push('')
    lines.push(`Generated: ${result.generatedAt}`)
    lines.push(`Router: ${ROUTER}`)
    lines.push(`Mode: ${smoke ? 'catalog + smoke' : 'catalog only'}`)
    lines.push(`Paid smoke: ${includePaid ? 'enabled' : 'disabled'}`)
    lines.push(`Direct quota smoke: ${includeQuota ? 'enabled' : 'disabled'}`)
    lines.push('')
    lines.push(
        `| Provider | Catalog | Free | Free/shadow | Direct quota | Allowed paid | Paid | Unknown | Smoke OK | Smoke Fail | Skipped | Notes |`
    )
    lines.push(`|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|`)
    for (const p of result.providers) {
        const c = p.classCounts || {}
        lines.push(
            `| ${p.provider} | ${p.count} | ${c.free || 0} | ${c.free_or_shadow || 0} | ${c.direct_quota || 0} | ${c.allowed_paid || 0} | ${c.paid || 0} | ${c.unknown || 0} | ${p.smokeOk} | ${p.smokeFail} | ${p.skippedCount} | ${p.error ? p.error.replace(/\|/g, '/') : ''} |`
        )
    }
    lines.push('')
    if (result.configuredAllowedPaid?.length) {
        lines.push(`## Configured Allowed Paid Exceptions`)
        lines.push('')
        lines.push(`These are allowed to smoke even though they are paid because the user explicitly approved them.`)
        lines.push('')
        lines.push(`| Provider | Model | Name | Context | Max Output | Verified |`)
        lines.push(`|---|---|---|---:|---:|---|`)
        for (const model of result.configuredAllowedPaid) {
            lines.push(
                `| ${model.provider} | ${model.id} | ${(model.name || '').replace(/\|/g, '/')} | ${model.contextWindow ?? ''} | ${model.maxTokens ?? ''} | ${model.metadataLastVerified ?? ''} |`
            )
        }
        lines.push('')
    }
    for (const p of result.providers) {
        lines.push(`## ${p.provider} (${p.label})`)
        lines.push('')
        if (p.error) {
            lines.push(`Error: ${p.error}`)
            lines.push('')
            continue
        }
        lines.push(`Catalog count: ${p.count}`)
        lines.push(`Cost classes: ${JSON.stringify(p.classCounts)}`)
        lines.push(`Smoke candidates: ${p.smokeCandidates.length}`)
        lines.push('')
        if (p.smokes.length) {
            lines.push(`| Model | OK | Status | ms | Reasoning | Error |`)
            lines.push(`|---|---|---:|---:|---|---|`)
            for (const s of p.smokes) {
                lines.push(
                    `| ${s.model} | ${s.ok ? 'yes' : 'no'} | ${s.status ?? ''} | ${s.elapsedMs} | ${s.reasoningSeen ? 'yes' : 'no'} | ${(s.error || '').replace(/\|/g, '/').slice(0, 160)} |`
                )
            }
            lines.push('')
        }
        const notable = p.ids.filter(isNotable).slice(0, 40)
        if (notable.length) {
            lines.push(`Notable visible models:`)
            for (const id of notable) lines.push(`- ${id}`)
            lines.push('')
        }
    }
    if (result.reasoning) {
        const R = result.reasoning
        lines.push(`## Reasoning Emission Checks`)
        lines.push('')
        lines.push(
            `Wired-for-reasoning models streamed once; a 200 with no reasoning_content/reasoning delta is a suspected regression (Pi can hang waiting for it).`
        )
        lines.push('')
        lines.push(`- Total wired in config: ${R.total}`)
        lines.push(`- Probed (live routes, per-provider cap): ${R.probed}`)
        lines.push(`- Surfaces reasoning (field or embedded in content): ${R.summary.ok}`)
        lines.push(`- Embedded reasoning in content (e.g. <think>): ${R.summary.embedded}`)
        lines.push(`- **Regressed (reachable, no reasoning anywhere): ${R.summary.regressed}**`)
        lines.push(`- Errors (non-200 or timeout): ${R.summary.errors}`)
        lines.push(`- Capped by --reasoning-limit (not probed; raise limit or use 0): ${R.capped}`)
        lines.push(`- Wired but NOT in route catalog (skipped): ${R.notVisible}`)
        lines.push(`- Skipped (no live router route / external): ${R.skippedNoRoute.length}`)
        lines.push('')
        if (R.cappedList.length) {
            lines.push(`Capped (over --reasoning-limit) — re-run with a higher --reasoning-limit or 0 to include:`)
            for (const id of R.cappedList) lines.push(`- ${id}`)
            lines.push('')
        }
        if (R.notVisibleList.length) {
            lines.push(`Wired but absent from route catalog (not probed):`)
            for (const id of R.notVisibleList) lines.push(`- ${id}`)
            lines.push('')
        }
        lines.push(`| Provider | Model | Status | ms | Field? | Emb? | rLen | cLen | Regressed | Error |`)
        lines.push(`|---|---|---:|---:|---|---|---:|---:|---|---|`)
        for (const c of R.checks) {
            lines.push(
                `| ${c.provider} | ${c.id} | ${c.status} | ${c.elapsedMs} | ${c.reasoningEmitted ? 'yes' : 'no'} | ${c.reasoningEmbedded ? 'yes' : 'no'} | ${c.reasoningLen} | ${c.contentLen} | ${c.errored ? 'ERR' : c.regressed ? 'YES' : 'no'} | ${(c.error || '').replace(/\|/g, '/').slice(0, 120)} |`
            )
        }
        if (R.skippedNoRoute.length) {
            lines.push('')
            lines.push(
                `Skipped (no matching live router route — external/direct providers, not probed to avoid key load):`
            )
            for (const w of R.skippedNoRoute) lines.push(`- ${w.id} @ ${w.baseUrl}`)
        }
        lines.push('')
    }
    return lines.join('\n')
}

async function main() {
    fs.mkdirSync(OUT_DIR, { recursive: true })
    const catalog = await getJson(`${ROUTER}/catalog`)
    if (!catalog.res.ok) throw new Error(`catalog failed ${catalog.res.status}`)
    const routes = (catalog.json.routes || []).filter(
        (route) => !providerFilter || providerFilter.has(route.providerKey)
    )
    const reasoningWired = reasoningCheck ? loadReasoningWired() : []
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
    }

    for (const route of routes) {
        const entry = {
            provider: route.providerKey,
            baseUrl: route.baseUrl,
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
        }
        try {
            const models = await getJson(`${route.baseUrl.replace(/\/$/, '')}/models`)
            entry.status = models.res.status
            if (!models.res.ok) {
                entry.error = models.json?.error?.message || models.json?.error || `models failed ${models.res.status}`
            } else {
                entry.ids = modelIdsFromPayload(models.json)
                entry.count = entry.ids.length
                entry.classCounts = countByCostClass(route.providerKey, entry.ids)
                entry.smokeCandidates = selectSmokeIds(route.providerKey, entry.ids)
                entry.skippedCount = entry.ids.length - entry.smokeCandidates.length
                if (smoke) {
                    for (let si = 0; si < entry.smokeCandidates.length; si++) {
                        const id = entry.smokeCandidates[si]
                        const s = await smokeModel(route, id)
                        entry.smokes.push(s)
                        if (s.ok) entry.smokeOk += 1
                        else entry.smokeFail += 1
                        // Throttle between requests to avoid triggering provider rate limits
                        // (especially Cloudflare-backed providers like Zydit)
                        if (smokeDelayMs > 0 && si < entry.smokeCandidates.length - 1) {
                            await sleep(smokeDelayMs)
                        }
                    }
                }
            }
        } catch (error) {
            entry.error = error?.message || String(error)
        }
        result.providers.push(entry)
        console.log(
            `${entry.provider}: catalog=${entry.count} classes=${JSON.stringify(entry.classCounts)} smoke=${entry.smokeOk}/${entry.smokeCandidates.length} fail=${entry.smokeFail} ${entry.error || ''}`
        )
    }

    if (reasoningCheck) {
        result.reasoning = await runReasoningChecks(result, reasoningWired, {
            limit: reasonLimit,
            delay: reasonDelay,
            maxTokens: reasonMaxTokens,
            timeoutMs: reasonTimeout
        })
        const rs = result.reasoning.summary
        console.log(
            `REASONING: total=${result.reasoning.total} probed=${result.reasoning.probed} ok=${rs.ok} regressed=${rs.regressed} errors=${rs.errors} skippedNoRoute=${result.reasoning.skippedNoRoute.length}`
        )
    }

    const jsonPath = path.join(OUT_DIR, `health-${now}.json`)
    const mdPath = path.join(OUT_DIR, `health-${now}.md`)
    fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2))
    fs.writeFileSync(mdPath, markdownReport(result))
    console.log(`WROTE ${jsonPath}`)
    console.log(`WROTE ${mdPath}`)
}

main().catch((error) => {
    console.error(error.stack || error.message || String(error))
    process.exitCode = 1
})
