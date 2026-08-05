/* vision-census-runner2.mjs — v2: records usage tokens, retries 429, classifies by image-token evidence.
 * Usage: node vision-census-runner2.mjs <candidates.json> <out.jsonl> [concurrency] [maxRetries429]
 * Verdicts: PIXELS_OK | PIXELS_LIKELY (image_tokens>0 but weak text) | TEXT_ONLY | REFUSAL | HTTP_xxx | EMPTY
 */
import fs from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'

const ROOT = path.resolve()
const candidatesPath = process.argv[2]
const OUT = process.argv[3]
const CONCURRENCY = Math.max(1, Math.min(4, Number(process.argv[4]) || 3))
const RETRIES = Math.max(1, Math.min(4, Number(process.argv[5]) || 2))
const IMG = path.join(ROOT, 'tmp', 'vision-jury', '11-postfix-card.png')
const PROMPT = 'Answer in 1 short sentence: (a) name any business shown, (b) any tag text visible, (c) what color is a button/label?' 

const candidates = JSON.parse(fs.readFileSync(candidatesPath, 'utf8'))
const LIVE = ['openrouter', 'zenmux', 'novita', 'modelscope', 'nvidia', 'mistral', 'kilo', 'infron', 'groq', 'cloudflare', 'llm7', 'neuralwatt', 'agnes', 'gemini']

function record(r) { fs.appendFileSync(OUT, JSON.stringify({ ts: new Date().toISOString(), ...r }) + '\n') }

function classify(model, provider, text, usage, ms) {
  const t = (text || '').trim()
  const usageTok = usage || {}
  const imageTokens = usageTok.image_tokens ?? usageTok.prompt_tokens_details?.image_tokens ?? null
  const promptTok = usageTok.prompt_tokens ?? null
  const complete = usageTok.completion_tokens ?? null
  // refusal = model says it can't see
  if (/cannot see|can't see|cannot view|don't have the ability|not able to (see|view)|no image|doesn't support (image|vision)|text-only|cannot process (images|image)|I can't (see|view)/i.test(t)) return 'REFUSAL'
  // real content describing pixels
  if (/Name|business|card|coffee|button|tag|label|color|phone|restaurant|cafe|search|map|teal|blue|catering|food|angel/i.test(t) && t.length > 30) return 'PIXELS_OK'
  if (imageTokens !== null && imageTokens > 0 && t.length > 8) return 'PIXELS_LIKELY'
  if (imageTokens !== null && imageTokens > 0) return 'PIXELS_INGEST'
  if (t.length > 0) return 'TEXT_EMPTY'
  return 'EMPTY'
}

function probe(model, provider, attempt = 0) {
  return new Promise((resolve) => {
    const args = ['tmp/vision-ask.mjs', provider, model, IMG, PROMPT]
    const child = spawn('node', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    const t0 = Date.now()
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (out += d))
    const timer = setTimeout(() => { try { child.kill() } catch {} }, 60000)
    child.on('close', () => {
      clearTimeout(timer)
      const t = out.trim()
      const ms = Date.now() - t0
      const http = /HTTP (\d{3})/.exec(t)
      const usageMatch = /usage=(\{.*?\})/.exec(t)
      let usage = null
      try { usage = usageMatch ? JSON.parse(usageMatch[1]) : null } catch {}
      const code = http ? http[1] : null
      if (code === '429' && attempt < RETRIES) {
        setTimeout(() => probe(model, provider, attempt + 1).then(resolve), (attempt + 1) * 3500)
        return
      }
      const verdict = code ? `HTTP_${code}` : classify(provider, model, t, usage, ms)
      const detail = t.slice(0, 200)
      record({ model, provider, verdict, detail, ms, usage, attempt })
      resolve(verdict)
    })
    child.on('error', () => { record({ model, provider, verdict: 'SPAWN_ERR' }); resolve('SPAWN_ERR') })
  })
}

async function main() {
  const start = Date.now()
  let idx = 0
  console.log(`RUN2 START ${candidates.length} models, conc ${CONCURRENCY}, retries ${RETRIES}`)
  const results = new Map()
  const pump = async () => {
    const batch = []
    while (idx < candidates.length && batch.length < CONCURRENCY) batch.push(candidates[idx++])
    if (!batch.length) {
      console.log(`RUN2 DONE in ${((Date.now() - start) / 1000).toFixed(0)}s`)
      return
    }
    await Promise.all(batch.map(async (candidate) => {
      const model = typeof candidate === 'string' ? candidate : candidate.model
      const order = (typeof candidate === 'object' && Array.isArray(candidate.probe_order) ? candidate.probe_order : ['openrouter']).filter(p => LIVE.includes(p))
      for (const provider of order) {
        const v = await probe(model, provider)
        if (v === 'PIXELS_OK' || v === 'PIXELS_LIKELY' || v === 'PIXELS_INGEST') return
        if (v.startsWith('HTTP_') && !['HTTP_429','HTTP_500','HTTP_503','HTTP_504'].includes(v)) return
      }
    }))
    await pump()
  }
  await pump()
}
main().catch((e) => { console.error('FATAL', e.message); process.exit(1) })