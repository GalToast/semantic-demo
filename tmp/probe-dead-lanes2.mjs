// probe-dead-lanes2.mjs — probe against the router's REAL segments (from /v1/models probe):
// opencode-zen, zenmux, poolside, zydit, novita, agnes, airforce, etc. Verdict DEAD only
// if a 4xx/5xx/timed-out on an EXISTING segment.
import fs from 'node:fs'
const ROUTER = 'http://127.0.0.1:8788'
const OUT = 'tmp/dead-lane-probes2.jsonl'
fs.writeFileSync(OUT, '')

// family -> [realRouterSegment, exact model id as the router expects]
const candidates = [
  ['hy3', 'opencode-zen', 'hy3-free'],
  ['qwen3.6-plus', 'opencode-zen', 'qwen3.6-plus-free'],
  ['qwen3.6-plus', 'zenmux', 'qwen/qwen3.6-plus'],
  ['kimi-k2.6', 'zenmux', 'moonshotai/kimi-k2.6'],
  ['kimi-k2.6', 'novita', 'moonshotai/kimi-k2.6'],
  ['gpt-5.6-sol', 'zenmux', 'openai/gpt-5.6-sol'],
  ['gpt-5.6-terra', 'zenmux', 'openai/gpt-5.6-terra'],
  ['gpt-oss-20b', 'zenmux', 'openai/gpt-oss-20b:free'],
  ['gpt-oss-120b', 'zenmux', 'openai/gpt-oss-120b:free'],
  ['qwen3-14b', 'zenmux', 'qwen/qwen3-14b'],
  ['laguna-xs', 'opencode-zen', 'laguna-xs-2.1-free'],
  ['nemotron-super', 'opencode-zen', 'nemotron-3-super-free'],
  ['deepseek-v4-pro', 'opencode-zen', 'deepseek-v4-pro-free'],
  // controls (known-live today)
  ['deepseek-v4-flash (control)', 'opencode-zen', 'deepseek-v4-flash-free'],
  ['deepseek-v4-flash (control2)', 'zenmux', 'deepseek/deepseek-v4-flash-free'],
  ['mimo-v2.5 (control3)', 'opencode-zen', 'mimo-v2.5-free']
]

for (const [fam, seg, model] of candidates) {
  const url = `${ROUTER}/${seg}/v1/chat/completions`
  const t0 = Date.now()
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 2 }),
      signal: AbortSignal.timeout(15000)
    })
    let verdict = 'LIVE'
    if (res.status === 422) verdict = 'DEAD-422'
    else if (res.status === 404) verdict = 'DEAD-404'
    else if (res.status === 401) verdict = 'DEAD-401'
    else if (res.status === 402 || res.status === 403) verdict = 'DEAD-402/403'
    else if (res.status >= 500) verdict = 'ERR-5xx'
    const row = { name: fam, seg, model, verdict, status: res.status, ms: Date.now() - t0 }
    console.log(`${verdict.padEnd(10)} ${seg}/${model}  [${res.status}] ${Date.now() - t0}ms`)
    fs.appendFileSync(OUT, JSON.stringify(row) + '\n')
  } catch (e) {
    const row = { name: fam, seg, model, verdict: 'DEAD-TIMEOUT', status: 0, ms: Date.now() - t0, err: String(e.message).split('\n')[0].slice(0, 90) }
    console.log(`${'DEAD-TIMEOUT'.padEnd(10)} ${seg}/${model} :: ${row.err}`)
    fs.appendFileSync(OUT, JSON.stringify(row) + '\n')
  }
}
console.log('DONE2')