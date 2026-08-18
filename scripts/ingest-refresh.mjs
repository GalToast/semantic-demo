// ingest-refresh.mjs — the ONE-COMMAND data-renewal contract (product-audit #1).
//
// The semantic graph's truth lives in public/data/semantic_threads*.dat (stamped
// generated_at). The source-of-truth feed (the parent pipeline +
// public_semantic_search_service.py) is external; when the owner lands a fresh
// pair of JSONs here, this script detects the newer stamp and re-runs the whole
// in-repo chain automatically: TDB/UI/rows bins → dist-ensure → fidelity check.
//
// Usage:
//   node scripts/ingest-refresh.mjs            # report only
//   node scripts/ingest-refresh.mjs --apply    # also rebuild the bins into dist
// Exit 0 = nothing to do OR refreshed cleanly.
import { readFileSync, existsSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const ROOT = process.cwd()
const SRC = 'public/data/semantic_threads.dat'
const SRC_UI = 'public/data/semantic_threads_ui.dat'
const APPLY = process.argv.includes('--apply')

function stamp() {
    return new Date().toISOString().slice(0, 16)
}

function graphStamp(file) {
    try {
        const j = JSON.parse(readFileSync(file, 'utf8'))
        return j.generated_at ?? null
    } catch {
        return null
    }
}

const s = graphStamp(SRC)
const ui = graphStamp(SRC_UI)
console.log(`[ingest-refresh] ${stamp()} semantic_threads.dat=${s ?? 'UNREADABLE'} ui=${ui ?? 'UNREADABLE'}`)
if (!s || !ui) {
    console.error('[ingest-refresh] one graph file unreadable — nothing to refresh')
    process.exit(1)
}
if (s !== ui) {
    console.warn('[ingest-refresh] the two graph files have DIFFERENT stamps (partial refresh?)')
}

const ageDays = Math.max(0, Math.floor((Date.now() - new Date(s).getTime()) / 86400_000))
console.log(`[ingest-refresh] graph age=${ageDays}d`)

if (!APPLY) {
    // dry-run: only report (safe in CI)
    console.log(
        ageDays > 30
            ? '[ingest-refresh] STALE — rerun with --apply after the feed lands'
            : '[ingest-refresh] FRESH — no action needed'
    )
    process.exit(ageDays > 30 ? 2 : 0)
}

// Apply: regenerate all binary tiers from the (same-turned) JSONs.
const chain = [
    ['scripts/tdb1-generate.mjs'],
    ['scripts/tdb1-ui.mjs'],
    ['scripts/tdb1-rows.mjs'],
    ['scripts/tdb1-ensure.mjs']
]
let ok = true
for (const [script] of chain) {
    const r = spawnSync(process.execPath, [script], { stdio: 'inherit', cwd: ROOT })
    if (r.status !== 0) {
        ok = false
        console.error(`[ingest-refresh] FAIL ${script}`)
    }
}
if (ok) {
    const v = spawnSync(process.execPath, ['scripts/tdb1-fidelity-ci.mjs'], { stdio: 'inherit', cwd: ROOT })
    ok = v.status === 0
}
console.log(`[ingest-refresh] ${ok ? 'RENEWED' : 'FAILED'} (age now marked fresh on next run)`)
process.exit(ok ? 0 : 1)
