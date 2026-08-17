// qa-gate-compare.mjs — compare-only LH gate (OUR lane, deterministic).
// Reads the newest harvested reports + newest baselines → six-metric verdict.
// No Chrome, no EPERM, no re-audit. Usage: node scripts/qa-gate-compare.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const CWD = process.cwd()
const TMP = join(CWD, 'tmp')
const DOCS = join(CWD, 'docs')
const LIMITS = { perf: -5, tbt: 100, lcp: 300 } // perf >= base-5; tbt <= base+100ms; lcp <= base+300ms

function newest(dir, prefix) {
    return readdirSync(dir)
        .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
        .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t)[0]?.f
}

function metrics(json) {
    return {
        perf: Math.round((json.categories?.performance?.score ?? 0) * 100),
        lcp: json.audits?.['largest-contentful-paint']?.numericValue ?? 0,
        tbt: json.audits?.['total-blocking-time']?.numericValue ?? 0
    }
}

let allPass = true
for (const preset of ['mobile', 'desktop']) {
    const rep = newest(TMP, `lighthouse-${preset}-`)
    const base = newest(DOCS, `lighthouse-baseline-${preset}-`)
    if (!rep || !base) {
        console.log(`[${preset}] missing report/base`)
        allPass = false
        continue
    }
    const cur = metrics(JSON.parse(readFileSync(join(TMP, rep), 'utf8')))
    const b = JSON.parse(readFileSync(join(DOCS, base), 'utf8'))
    const bm = metrics(b)
    const dPerf = cur.perf - bm.perf
    const dTbt = Math.round(cur.tbt - bm.tbt)
    const dLcp = (cur.lcp - bm.lcp) / 1000
    const ok = cur.perf >= bm.perf + LIMITS.perf && cur.tbt <= bm.tbt + LIMITS.tbt && cur.lcp <= bm.lcp + LIMITS.lcp
    allPass &&= ok
    console.log(
        `[${preset}] perf ${cur.perf} (${bm.perf}, Δ${dPerf >= 0 ? '+' : ''}${dPerf}) · LCP ${(cur.lcp / 1000).toFixed(1)}s (${(bm.lcp / 1000).toFixed(1)}s, Δ${dLcp >= 0 ? '+' : ''}${dLcp.toFixed(1)}s) · TBT ${cur.tbt.toFixed(0)}ms (${bm.tbt.toFixed(0)}ms, Δ${dTbt}) → ${ok ? 'PASS' : 'FAIL'}`
    )
}

console.log(allPass ? '\nALL PASS' : '\nGATE FAIL')
process.exit(allPass ? 0 : 1)
