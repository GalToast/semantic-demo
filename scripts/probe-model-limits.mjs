#!/usr/bin/env node
/**
 * probe-model-limits.mjs
 *
 * Probes max_tokens acceptance of any OpenAI-compatible model route through
 * the local key router. For each candidate token value it sends a minimal
 * chat completion request, records the HTTP status, whether usage.completion_tokens
 * is present, and any error message.
 *
 * Usage:
 *   node scripts/probe-model-limits.mjs \
 *     --baseUrl http://127.0.0.1:8788/opencode-zen/v1 \
 *     --model laguna-s-2.1-free \
 *     [--token-values 32768,131072,131073,200000,262144,500000,1000000] \
 *     [--api-key sk-...]
 *
 * Defaults:
 *   --token-values  32768,131072,131073,200000,262144,500000,1000000
 *   --api-key       $OPENAI_API_KEY or empty
 *   --sleep         30 (seconds between requests)
 *   --prompt        "hi"
 *
 * Output:
 *   tmp/probe-<model>-<timestamp>.json   — full results
 *   stdout summary table
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ── CLI args ────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    baseUrl: '',
    model: '',
    tokenValues: '32768,131072,131073,200000,262144,500000,1000000',
    apiKey: process.env.OPENAI_API_KEY || '',
    sleep: 30,
    prompt: 'hi',
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = args[i + 1];
    if (a === '--baseUrl' && next) { opts.baseUrl = next; i++; }
    else if (a === '--model' && next) { opts.model = next; i++; }
    else if (a === '--token-values' && next) { opts.tokenValues = next; i++; }
    else if (a === '--api-key' && next) { opts.apiKey = next; i++; }
    else if (a === '--sleep' && next) { opts.sleep = Number(next); i++; }
    else if (a === '--prompt' && next) { opts.prompt = next; i++; }
    else if (a === '--help' || a === '-h') {
      console.log(usage());
      process.exit(0);
    }
  }

  if (!opts.baseUrl || !opts.model) {
    console.error('Error: --baseUrl and --model are required.\n');
    console.error(usage());
    process.exit(1);
  }

  opts.tokens = opts.tokenValues.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0);
  if (!opts.tokens.length) {
    console.error('Error: no valid token values parsed from --token-values');
    process.exit(1);
  }

  return opts;
}

function usage() {
  return `Usage: node scripts/probe-model-limits.mjs --baseUrl <url> --model <id> [options]

Options:
  --baseUrl        Base URL for the OpenAI-compatible endpoint (required)
  --model          Model identifier (required)
  --token-values   Comma-separated max_tokens to test (default: 32768,131072,...)
  --api-key        API key (default: $OPENAI_API_KEY or empty)
  --sleep          Seconds between requests (default: 30)
  --prompt         User message to send (default: "hi")`;
}

// ── Probe logic ─────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function probeOne({ baseUrl, model, maxTokens, prompt, apiKey }) {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const headers = {
    'Content-Type': 'application/json',
    ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
  };

  const body = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  };

  const start = Date.now();
  let httpStatus = 0;
  let latencyMs;
  let completionTokens = null;
  let totalTokens = null;
  let finishReason = null;
  let errorMsg = null;
  let raw;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    httpStatus = res.status;
    raw = await res.text();
    latencyMs = Date.now() - start;

    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      errorMsg = `Non-JSON response (${raw.slice(0, 200)})`;
      return { httpStatus, latencyMs, completionTokens, totalTokens, finishReason, errorMsg };
    }

    // Check for error
    if (json.error) {
      errorMsg = json.error.message || JSON.stringify(json.error);
    }

    // Check for usage
    if (json.usage) {
      completionTokens = json.usage.completion_tokens ?? null;
      totalTokens = json.usage.total_tokens ?? null;
    }

    // Check for finish reason in first choice
    if (Array.isArray(json.choices) && json.choices.length > 0) {
      finishReason = json.choices[0].finish_reason ?? null;
    }
  } catch (err) {
    latencyMs = Date.now() - start;
    errorMsg = `Network error: ${err.message}`;
  }

  return { httpStatus, latencyMs, completionTokens, totalTokens, finishReason, errorMsg };
}

function printTable(results) {
  const hdr = 'max_tokens'.padStart(12) + '  ' +
              'HTTP'.padStart(4) + '  ' +
              'cmp_tokens'.padStart(11) + '  ' +
              'total'.padStart(8) + '  ' +
              'finish_reason'.padEnd(14) + '  ' +
              'latency'.padStart(8) + '  ' +
              'error';

  console.log(hdr);
  console.log('-'.repeat(hdr.length));

  for (const r of results) {
    const errStr = r.errorMsg ? r.errorMsg.slice(0, 60) : '';
    console.log(
      String(r.maxTokens).padStart(12) + '  ' +
      String(r.httpStatus).padStart(4) + '  ' +
      String(r.completionTokens ?? '-').padStart(11) + '  ' +
      String(r.totalTokens ?? '-').padStart(8) + '  ' +
      String(r.finishReason ?? '-').padEnd(14) + '  ' +
      (r.latencyMs + 'ms').padStart(8) + '  ' +
      errStr
    );
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs(process.argv);
  const ts = timestamp();

  console.log(`\nProbing model="${opts.model}" at ${opts.baseUrl}`);
  console.log(`Token values: ${opts.tokens.join(', ')}`);
  console.log(`Sleep between requests: ${opts.sleep}s\n`);

  const results = [];

  for (let i = 0; i < opts.tokens.length; i++) {
    const maxTokens = opts.tokens[i];
    const progress = `[${i + 1}/${opts.tokens.length}]`;
    process.stdout.write(`${progress} Probing max_tokens=${maxTokens} ... `);

    const result = await probeOne({
      baseUrl: opts.baseUrl,
      model: opts.model,
      maxTokens,
      prompt: opts.prompt,
      apiKey: opts.apiKey,
    });

    results.push({ maxTokens, ...result });

    const status = result.errorMsg ? `✗ ${result.errorMsg.slice(0, 50)}` : `✓ ${result.latencyMs}ms`;
    console.log(status);

    // Sleep between requests (but not after the last one)
    if (i < opts.tokens.length - 1) {
      process.stdout.write(`  Sleeping ${opts.sleep}s ...\r`);
      await sleep(opts.sleep * 1000);
    }
  }

  // Save results
  const outDir = join(process.cwd(), 'tmp');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `probe-${opts.model}-${ts}.json`);

  const output = {
    model: opts.model,
    baseUrl: opts.baseUrl,
    tokenValues: opts.tokens,
    probeTimestamp: new Date().toISOString(),
    results,
  };

  writeFileSync(outFile, JSON.stringify(output, null, 2));

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  printTable(results);

  const accepted = results.filter(r => r.completionTokens !== null);
  const maxAccepted = accepted.length
    ? Math.max(...accepted.map(r => r.maxTokens))
    : null;

  console.log('\n' + '-'.repeat(80));
  console.log(`Accepted with completion_tokens: ${accepted.map(r => r.maxTokens).join(', ') || 'none'}`);
  console.log(`Max accepted max_tokens: ${maxAccepted ?? 'unknown'}`);
  console.log(`Results saved to: ${outFile}\n`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
