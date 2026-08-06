// probe-dead-lanes.mjs — live-probe candidate dead lanes against the key-router
// (127.0.0.1:8788/<provider>/v1/chat/completions). Verdict per ref: OK (>=200)
// / DEAD (4xx/5xx/timed-out). Writes tmp/dead-lane-probes.jsonl.
import fs from 'node:fs'
const ROUTER = 'http://127.0.0.1:8788'
const OUT = 'tmp/dead-lane-probes.jsonl'
fs.writeFileSync(OUT, '')

const candidates = [
  // family -> (provider segment, model id)
  ['hy3', 'opencode', 'hy3-free'],
  ['qwen3.6-plus', 'qwen', 'qwen3.6-plus'],
  ['qwen3.6-plus', 'opencode', 'qwen3.6-plus-free'],
  ['kimi-k2.6', 'moonshotai', 'kimi-k2.6'],
  ['gpt-5.6-sol', 'openai', 'gpt-5.6-sol'],
  ['gpt-5.6-terra', 'openai', 'gpt-5.6-terra'],
  ['gpt-oss-20b', 'openai', 'gpt-oss-20b:free'],
  ['gpt-oss-120b', 'openai', 'gpt-oss-120b:free'],
  ['qwen3-14b', 'qwen', 'qwen3-14b'],
  ['laguna-xs', 'opencode', 'laguna-xs-2.1-free'],
  ['nemotron-super', 'opencode', 'nemotron-3-super-free'],
  ['deepseek-v4-pro', 'opencode', 'deepseek-v4-pro-free'],
  ['codesmall', 'openai', 'codesmall'],
  ['deepseek-v4-flash (control: live)', 'opencode', 'deepseek-v4-flash-free']
]

const controller = new AbortController()
const t = setTimeout(() => controller.abort(), 25000)

for (const [fam, provider, model] of candidates) {
  const url = `${ROUTER}/${provider}/v1/chat/completions`
  const t0 = Date.now()
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 2 }),
      signal: AbortSignal.timeout(20000)
    })
    const ms = Date.now() - t0
    let verdict = 'LIVE'
    if (res.status >= 400) verdict = 'DEAD'
    if (res.status === 422) verdict = 'DEAD-422'
    if (res.status === 404) verdict = 'DEAD-404'
    if (res.status === 401) verdict = 'DEAD-401'
    if (res.status === 402 || res.status === 403) verdict = 'DEAD-402/403'
    const row = { family: fam, provider, model, verdict, status: res.status, ms: Date.now() - t0 }
    console.log(`${verdict.padEnd(10)} ${provider}/${model}`)
    fs.appendFileSync(OUT, JSON.stringify(row) + '\n')
  } catch (e) {
    const row = { family: fam, provider, model, verdict: 'DEAD-TIMEOUT', status: 0, ms: Date.now() - t0, err: String(e.message).split('\n')[0].slice(0, 80) }
    console.log(`${'DEAD-TIMEOUT'.padEnd(10)} ${provider}/${model} :: ${row.err}`)
    fs.appendFileSync(OUT, JSON.stringify(row) + '\n')
  }
}
clearTimeout(t)
console.log('DONE')