/* vision-census-runner.mjs — probe every candidate vision model through the bridge.
 * Usage: node tmp/vision-census-runner.mjs tmp/vision-census-probeplan.json tmp/vision-census-results.jsonl [concurrency]
 * Verdicts: PIXELS_OK | TEXT_ONLY | HTTP_xxx | EMPTY | SKIP
 */
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'

const ROOT = path.resolve()
const candidatesPath = process.argv[2] || path.join(ROOT, 'tmp', 'vision-census-probeplan.json')
const OUT = process.argv[3] || path.join(ROOT, 'tmp', 'vision-census-results.jsonl')
const CONCURRENCY = Math.max(1, Math.min(8, Number(process.argv[4]) || 4))
const IMG = path.join(ROOT, 'tmp', 'vision-jury', '11-postfix-card.png')
const PROMPT = 'Describe the right-side UI card you see: any business name, tags, button labels, phone. One sentence.'

const candidates = JSON.parse(fs.readFileSync(candidatesPath, 'utf8'))
const LIVE_PROVIDERS = ['zenmux', 'novita', 'modelscope', 'nvidia', 'mistral', 'kilo', 'openrouter', 'infron', 'groq']
const RETRYABLE = ['HTTP_429', 'HTTP_500', 'HTTP_503']

let wrote = 0
function record(r) {
  fs.appendFileSync(OUT, JSON.stringify({ ts: new Date().toISOString(), ...r }) + '\n')
  wrote++
}

function probe(model, provider) {
  return new Promise((resolve) => {
    const args = ['tmp/vision-ask.mjs', provider, model, IMG, PROMPT]
    const child = spawn('node', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    const t0 = Date.now()
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (out += d))
    const timer = setTimeout(() => { try { child.kill() } catch {} }, 40000)
    child.on('close', () => {
      clearTimeout(timer)
      const t = out.trim()
      const ms = Date.now() - t0
      let verdict
      if (/VISION UNAVAILABLE|does not support images|text-only|cannot be read as text/i.test(t)) verdict = 'TEXT_ONLY'
      else if (/HTTP (\d{3})/.test(t)) verdict = 'HTTP_' + t.match(/HTTP (\d{3})/)[1]
      else if (/PIXELS OK|SEARCH RESULT|View on Map|coffee/i.test(t)) verdict = 'PIXELS_OK'
      else if (t.length > 2) verdict = 'EMPTY'
      else verdict = 'NO_OUTPUT'
      record({ model, provider, verdict, detail: t.slice(0, 150), ms })
      resolve(verdict)
    })
    child.on('error', () => { clearTimeout(timer); record({ model, provider, verdict: 'SPAWN_ERR' }); resolve('SPAWN_ERR') })
  })
}

async function withFailover(candidate) {
  const model = typeof candidate === 'string' ? candidate : candidate.model
  const order = (typeof candidate === 'object' && Array.isArray(candidate.probe_order) ? candidate.probe_order : ['modelscope']).filter((p) => LIVE_PROVIDERS.includes(p))
  if (!order.length) { record({ model, provider: 'none', verdict: 'SKIP' }); return }
  for (const provider of order) {
    const v = await probe(model, provider)
    if (v === 'PIXELS_OK') return
    if (!RETRYABLE.includes(v)) return
  }
}

async function main() {
  const start = Date.now()
  let idx = 0
  console.log(`START census ${candidates.length} models, concurrency ${CONCURRENCY}`)
  const pump = async () => {
    const batch = []
    while (idx < candidates.length && batch.length < CONCURRENCY) batch.push(candidates[idx++])
    if (!batch.length) { console.log(`DONE ${wrote} lines in ${((Date.now() - start) / 1000).toFixed(0)}s -> ${OUT}`); return }
    await Promise.all(batch.map(withFailover))
    await pump()
  }
  await pump()
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(1) })