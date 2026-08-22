/* qa-lighthouse-gate.mjs — CI-able performance gate vs the committed baselines.
 *   - expects QA server at http://127.0.0.1:8795/dist/svelte/index.html
 *   - runs scripts/qa-lighthouse-baseline.mjs (no --baseline) for mobile+desktop
 *   - compares PERF / TBT / LCP against the newest docs/lighthouse-baseline-*.json
 *   - exit 0 = all gates pass; 1 = regression; 2 = infra (server/baseline) problem
 * Usage: node scripts/qa-lighthouse-gate.mjs
 */
import { execSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const SERVER_URL = 'http://127.0.0.1:8795/dist/svelte/index.html'
const CWD = process.cwd()
const LIMITS = { perf: -5, tbt: 100, lcp: 300 } // perf ≥ base-5; tbt ≤ base+100ms; lcp ≤ base+300ms

function newestBaseline(preset) {
    const dir = join(CWD, 'docs')
    const files = readdirSync(dir)
        .filter((f) => f.startsWith(`lighthouse-baseline-${preset}-`) && f.endsWith('.json'))
        .sort()
    if (!files.length) {
        throw new Error(`no ${preset} baseline; seed with scripts/qa-lighthouse-baseline.mjs --baseline`)
    }
    return JSON.parse(readFileSync(join(dir, files[files.length - 1]), 'utf8'))
}

function readCurrentScores(preset) {
    const file = join(CWD, 'tmp', `lighthouse-${preset}-latest.json`)
    const j = JSON.parse(readFileSync(file, 'utf8'))
    const a = j.categories ?? {}
    const m = j.audits ?? {}
    return {
        perf: Math.round((a.performance?.score ?? 0) * 100),
        tbt: m['total-blocking-time']?.numericValue ?? 0,
        lcp: m['largest-contentful-paint']?.numericValue ?? 0
    }
}

async function serverUp(url) {
    try {
        const r = await fetch(url)
        return r.ok
    } catch {
        return false
    }
}

if (!(await serverUp(SERVER_URL))) {
    console.error('[gate] server down — start `node scripts/qa-server.mjs start` first (exit 2)')
    process.exit(2)
}

let failures = 0
for (const preset of ['mobile', 'desktop']) {
    console.log(`-- ${preset} gate --`)
    try {
        execSync(`node scripts/qa-lighthouse-baseline.mjs`, { cwd: CWD, encoding: 'utf8', timeout: 600000 })
    } catch (e) {
        // qa-lighthouse-baseline exits 1 when its gates FAIL — a measured
        // result, not an infra crash. Only other statuses/timeouts are
        // genuine runner failures (exit 2 = infra, per header contract).
        if (e.status !== 1) {
            console.error(`  runner failed: ${e.message}`)
            process.exit(2)
        }
        console.error(`  ${preset} gate FAILED (baseline-runner verdict)`)
        failures += 1
        continue
    }
    const base = newestBaseline(preset)
    const cur = readCurrentScores(preset)
    const ok =
        cur.perf >= base.perf + LIMITS.perf && cur.tbt <= base.tbt + LIMITS.tbt && cur.lcp <= base.lcp + LIMITS.lcp
    console.log(
        `  perf ${cur.perf} (base ${base.perf}) tbt ${Math.round(cur.tbt)}ms (${Math.round(base.tbt)}ms)` +
            ` lcp ${Math.round(cur.lcp)}ms (${Math.round(base.lcp)}ms) — ${ok ? 'pass' : 'FAIL'}`
    )
    if (!ok) failures += 1
}

process.exit(failures ? 1 : 0)
