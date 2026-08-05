/* vision-v4-probe.mjs — zydit/v4 chat (no /v1 in path), real image, all v4-model ids.
 * Usage: node vision-v4-probe.mjs <ids.json> <out.jsonl> [gapMs]
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve()
const ids = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const OUT = process.argv[3]
const GAP = Number(process.argv[4]) || 3500
const KEY = process.env.ZYDIT_API_KEY || ''
const IMG = fs.readFileSync(path.join(ROOT, 'tmp', 'vision-jury', '11-postfix-card.png')).toString('base64')
const PROMPT = 'In one sentence: (a) business name shown, (b) any tag visible, (c) button color or label?'

const done = new Set()
try {
  for (const l of fs.readFileSync(OUT, 'utf8').split('\n')) {
    const t = l.trim(); if (!t) continue
    try { done.add(JSON.parse(t).model) } catch {}
  }
} catch {}
const queue = ids.filter(i => !done.has(i))
console.log(`V4-PROBE: total=${ids.length} pending=${queue.length}`)

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

for (let i = 0; i < queue.length; i++) {
  const model = queue[i]
  const t0 = Date.now()
  try {
    const r = await fetch(`http://127.0.0.1:8788/zydit/v4/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Authorization': `Bearer ${KEY}` },
      body: JSON.stringify({ model, max_tokens: 300, messages: [{ role: 'user', content: [
        { type: 'text', text: PROMPT },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${IMG}` } }] }] }),
      signal: AbortSignal.timeout(65000),
    })
    const j = await r.json().catch(() => null)
    const ms = Date.now() - t0
    const msg = j?.choices?.[0]?.message || {}
    const txt = String(msg.content || '') + ' ' + String(msg.reasoning_content || '')
    const up = txt.toUpperCase()
    const hits = ['ANGEL FIRE COFFEE', 'CLEVELAND', 'FOOD & HOSPITALITY', 'ACTIVE', 'PHONE', 'VIEW ON MAP'].filter(x => up.includes(x)).length
    const verdict = r.status === 200 ? (hits >= 2 ? 'PIXELS_OK' : (txt.length > 20 ? 'TEXT_EMPTY' : 'EMPTY')) : `HTTP_${r.status}`
    fs.appendFileSync(OUT, JSON.stringify({ ts: new Date().toISOString(), model, verdict, ms, hits, detail: txt.slice(0, 120) }) + '\n')
    console.log(`[${i + 1}/${queue.length}] ${verdict} ${model.padEnd(34)} ${ms}ms hits=${hits}`)
  } catch (e) {
    fs.appendFileSync(OUT, JSON.stringify({ ts: new Date().toISOString(), model, verdict: 'NETERR', detail: String(e).slice(0, 60) }) + '\n')
    console.log(`[${i + 1}/${queue.length}] ERR ${model.padEnd(34)} ${String(e).slice(0, 60)}`)
  }
  await sleep(GAP)
}
console.log('V4-PROBE-DONE')