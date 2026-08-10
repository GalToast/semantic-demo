#!/usr/bin/env node
/**
 * logfare-model-probe.mjs — "which logfare models are up right now?"
 *
 * logfare models constantly come on/offline upstream (500°/429°/timeouts are
 * per-model, transient). This probes EVERY logfare catalog model with a tiny
 * chat-completion through the router lane, then prints a live status table.
 *
 * Usage:
 *   node scripts/logfare-model-probe.mjs                # all models, 20s each
 *   node scripts/logfare-model-probe.mjs --concurrency=4
 *   node scripts/logfare-model-probe.mjs qwen-3.6-35b-a3b kiro-auto
 *
 * Exit 0 always (diagnostic). Output lines are machine-readable:
 *   ok      <model>  <ms>
 *   down    <model>  <reason>
 */

const BASE = process.env.LOGFARE_PROBE_BASE || 'http://127.0.0.1:8788/logfare/v1'
const TIMEOUT_MS = Number(process.env.LOGFARE_PROBE_TIMEOUT_MS || 15000)

const args = process.argv.slice(2)
let concurrency = 3
const named = []
for (const a of args) {
    if (a.startsWith('--concurrency=')) concurrency = Number(a.split('=')[1])
    else if (!a.startsWith('--')) named.push(a)
}

async function probe(model) {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    const t0 = Date.now()
    try {
        const res = await fetch(`${BASE}/chat/completions`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 4, stream: false }),
            signal: ctrl.signal
        })
        const ms = Date.now() - t0
        if (res.ok) {
            console.log(`ok      ${model}  200 (${ms}ms)`)
            return { model, ok: true, ms }
        }
        const body = await res.text().catch(() => '')
        const reason = body.includes('rate-limited')
            ? '429 rate-limited'
            : body.includes('Service temporarily')
              ? '503 upstream'
              : `http ${res.status}`
        console.log(`down    ${model}  ${reason} (${ms}ms)`)
        return { model, ok: false, ms, reason }
    } catch (e) {
        const ms = Date.now() - t0
        const reason = e.name === 'AbortError' ? `timeout>${TIMEOUT_MS}ms` : String(e.message || e).slice(0, 60)
        console.log(`down    ${model}  ${reason} (${ms}ms)`)
        return { model, ok: false, ms, reason }
    } finally {
        clearTimeout(t)
    }
}

async function catalog() {
    const res = await fetch(`${BASE}/models`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const d = await res.json()
    const data = d.data || d
    return (Array.isArray(data) ? data.map((m) => m.id) : Object.keys(d)).filter(Boolean)
}

async function main() {
    const models = named.length ? named : await catalog()
    if (!models.length) {
        console.error('no models; router not reachable or catalog empty')
        process.exit(1)
    }
    console.log(`# logfare model probe  ${new Date().toISOString()}  n=${models.length}`)
    const queue = [...models]
    const results = []
    const workers = Array.from({ length: Math.min(concurrency, models.length) }, () =>
        (async () => {
            while (queue.length) {
                const m = queue.shift()
                results.push(await probe(m))
            }
        })()
    )
    await Promise.all(workers)
    const up = results.filter((r) => r.ok)
    console.log(`\nsummary: ${up.length}/${results.length} up — ${up.map((r) => r.model).join(', ') || 'none'}`)
    console.log(up.length ? `lanes:   ${up.map((r) => r.model).join('\n         ')}` : '')
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
