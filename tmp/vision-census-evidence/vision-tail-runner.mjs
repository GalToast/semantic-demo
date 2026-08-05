/* vision-tail-runner.mjs — patient sweep for the never-probed tail.
 * Retries 429 with cooldown-aware backoff, records usage.image_tokens, resume-capable.
 * Usage: node vision-tail-runner.mjs <plan.json> <out.jsonl> [concurrency] [maxRetries]
 */
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'

const ROOT = path.resolve()
const planPath = process.argv[2]
const OUT = process.argv[3]
const CONC = Math.max(1, Math.min(3, Number(process.argv[4]) || 2))
const RETRIES = Math.max(1, Math.min(5, Number(process.argv[5]) || 3))
const IMG = path.join(ROOT, 'tmp', 'vision-jury', '11-postfix-card.png')
const PROMPT = 'In one sentence: (a) business name shown, (b) any tag visible, (c) button color/label?'
const BACKOFF = [4000, 9000, 16000, 28000, 45000]

const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'))
const done = new Set()
try {
  for (const l of fs.readFileSync(OUT, 'utf8').split('\n')) {
    if (!l.trim()) continue
    try { done.add(JSON.parse(l).model) } catch {}
  }
} catch {}
const queue = plan.filter(p => !done.has(p.model))
console.log(`TAIL-RUN: plan=${plan.length} pending=${queue.length} out=${OUT} retries=${RETRIES}`)

function record(r) { fs.appendFileSync(OUT, JSON.stringify({ ts: new Date().toISOString(), ...r }) + '\n') }

function classify(text, usage) {
  const t = (text || '').trim()
  const ut = usage || {}
  const img = ut.image_tokens ?? ut.prompt_tokens_details?.image_tokens ?? null
  if (/cannot see|can't see|don't have the ability|no image|cannot process|text-only|cannot view/i.test(t)) return 'REFUSAL'
  if (/business|card|coffee|button|tag|label|angel|catering|map|search|phone/i.test(t) && t.length > 30) return 'PIXELS_OK'
  if (img !== null && img > 0 && t.length > 8) return 'PIXELS_LIKELY'
  if (img !== null && img > 0) return 'PIXELS_INGEST'
  if (t.length > 0) return 'TEXT_EMPTY'
  return 'EMPTY'
}

function probeOne(model, provider, attempt = 0) {
  return new Promise((resolve) => {
    const child = spawn('node', ['tmp/vision-ask.mjs', provider, model, IMG, PROMPT], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    const t0 = Date.now()
    child.stdout.on('data', d => (out += d))
    child.stderr.on('data', d => (out += d))
    const timer = setTimeout(() => { try { child.kill() } catch {} }, 90000)
    child.on('close', () => {
      clearTimeout(timer)
      const ms = Date.now() - t0
      const text = out.trim()
      const http = /HTTP (\d{3})/.exec(text)
      const usageM = /usage=(\{.*?\})/.exec(text)
      let usage = null; try { usage = usageM ? JSON.parse(usageM[1]) : null } catch {}
      const code = http ? http[1] : null
      if (code === '429' && attempt < RETRIES) {
        const back = BACKOFF[Math.min(attempt, BACKOFF.length - 1)]
        setTimeout(() => probeOne(model, provider, attempt + 1).then(resolve), back)
        return
      }
      const verdict = code ? 'HTTP_' + code : classify(text, usage)
      // cooldown breather after any probe on 429-heavy gates
      const postGap = (code === '429' || code === '503' || code === '502') ? 8000 : 1200
      record({ model, provider, verdict, ms, usage, attempt })
      setTimeout(resolve, postGap)
    })
    child.on('error', () => { record({ model: model, provider, verdict: 'SPAWN_ERR' }); resolve() })
  })
}

async function main() {
  let idx = 0
  const pump = async () => {
    const batch = []
    while (idx < queue.length && batch.length < CONC) batch.push(queue[idx++])
    if (!batch.length) { console.log('TAIL-RUN DONE'); return }
    await Promise.all(batch.map(p => probeOne(p.model, p.probe_order[0])))
    await pump()
  }
  await pump()
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1) })