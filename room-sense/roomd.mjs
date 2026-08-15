/* global URL, console, process, setInterval */
/* Sense-Tissue daemon (phone-side, Node).
 *   node roomd.mjs serve → HTTP :8081 (page + /sensors POST + /sketch)
 *   node roomd.mjs status → prints the room-skeleton sentence (reads the NDJSON log)
 */
import { createServer } from 'node:http'
import { readFile, appendFile, access, writeFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const PORT = 8081
const LOG = join(ROOT, 'room-ndjson.log')
const SKETCH = join(ROOT, 'room-sk.txt')
const MODE = process.argv[2] || 'serve'

const ring = []
const add = (o) => {
    ring.push(o)
    while (ring.length > 240) ring.shift()
    appendFile(LOG, JSON.stringify(o) + '\n').catch(() => {})
}
const tickNow = (r) => (r.t ?? 0) / 1000

const std = (a) => {
    if (!a.length) return 0
    const m = a.reduce((x, y) => x + y, 0) / a.length
    return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length)
}
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)
const dominantFreq = (vals, sr) => {
    if (vals.length < 8) return 0
    const s = vals.filter(Number.isFinite)
    let c = 0
    for (let i = 1; i < s.length; i++) if (s[i - 1] < 0 !== s[i] < 0) c++
    const dt = (1 / sr) * (s.length - 1)
    return dt > 0 ? c / 2 / dt : 0
}

function composeSketch() {
    const tNow = Date.now() / 1000
    const win = ring.filter((x) => tickNow(x) > tNow - 30)
    if (!win.length)
        return 'The room is silent — no sensor samples in the last 30s. (Keep the sense page open and awake.)'
    const out = []
    const acc = win.map((r) => Math.hypot(...(r.a || [0, 0, 9.8])))
    const vib = dominantFreq(
        win.map((r) => (r.a || [0, 0, 0])[2] ?? 0),
        20
    )
    if (mean(acc) > 9.2 && std(acc) > 0.06) {
        if (vib > 3) out.push(`steady vibration ≈ ${vib.toFixed(1)} Hz — a motor/fan near the phone`)
        else out.push('notable motion in the room (something moved the phone or its surface)')
    }
    const gr = win.map((r) => Math.hypot(...(r.g || [0, 0, 0])))
    if (gr.length && Math.max(...gr) > 0.5) out.push('the phone is rotating or swaying')
    const mg = win.map((r) => (r.m ? Math.hypot(...r.m) : NaN)).filter(Number.isFinite)
    if (mg.length > 2 && std(mg) > 0.8)
        out.push(`magnetic disturbance — steel/current nearby (σ ${std(mg).toFixed(2)} µT)`)
    const ps = win.map((r) => r.b).filter(Number.isFinite)
    if (ps.length > 2 && Math.max(...ps) - Math.min(...ps) > 0.12)
        out.push('pressure jump — a door or window moved air')
    return [
        `The room sketches (${win.length} samples, 30s window):`,
        out.length ? '▸ ' + out.join('\n▸ ') : '▸ quiet and stable — no moving mass, no tilt, steady pressure.',
        `sensor pulse ~${(win.length / 30).toFixed(1)} Hz`
    ].join('\n')
}

async function serve() {
    const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
    createServer(async (req, res) => {
        try {
            const url = new URL(req.url, 'http://x')
            if (url.pathname === '/sensors' && req.method === 'POST') {
                let body = ''
                for await (const c of req) body += c
                const o = JSON.parse(body)
                if (o && typeof o.t === 'number' && (o.a || o.g || o.m || o.b || o.l)) add(o)
                res.writeHead(200, { 'Content-Type': 'application/json' })
                res.end('{"ok":1}')
                return
            }
            if (url.pathname === '/sketch') {
                res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
                res.end(composeSketch())
                return
            }
            const p = url.pathname === '/' ? '/room-web.html' : url.pathname
            const f = join(ROOT, p)
            await access(f)
            res.writeHead(200, { 'Content-Type': MIME[extname(f).toLowerCase()] || 'application/octet-stream' })
            res.end(await readFile(f))
        } catch {
            res.writeHead(404, { 'Content-Type': 'text/plain' })
            res.end('404 — sense-tissue')
        }
    }).listen(PORT, () => console.log(`sense-tissue on :${PORT}`))
    setInterval(async () => {
        try {
            await writeFile(SKETCH, composeSketch())
        } catch {
            void 0
        }
    }, 4000)
}

if (MODE === 'serve') {
    serve()
} else if (MODE === 'status') {
    try {
        const rows = (await readFile(LOG, 'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse).slice(-240)
        for (const o of rows) if ((o.t ?? 0) / 1000 > Date.now() / 1000 - 30) ring.push(o)
    } catch {
        void 0
    }
    console.log(composeSketch())
}
