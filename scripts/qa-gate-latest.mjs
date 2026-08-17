// qa-gate-latest.mjs — OUR shim: back-fill the gate's `latest.json` input.
//
// scripts/qa-lighthouse-gate.mjs (LANE-owned, being reworked) reads
// tmp/lighthouse-<preset>-latest.json, but the audit writers emit timestamped
// names (tmp/lighthouse-<preset>-<epoch>.json). This shim copies the NEWEST
// per-preset report to the -latest name, then runs the gate. Use it after any
// audit:  node scripts/qa-gate-latest.mjs  (runs gate in compare mode).
import { readdirSync, copyFileSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import { spawnSync } from 'node:child_process'

const CWD = process.cwd()
const TMP = join(CWD, 'tmp')

// 1. Back-fill latest.json per preset from the newest timestamped report.
const presets = ['mobile', 'desktop']
let filled = 0
for (const preset of presets) {
    const candidates = readdirSync(TMP)
        .filter((f) => f.startsWith(`lighthouse-${preset}-`) && f.endsWith('.json') && !f.endsWith('-latest.json'))
        .map((f) => ({ f, t: statSync(join(TMP, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t)
    if (candidates.length === 0) {
        console.warn(`[gate-latest] no reports for ${preset}; skipping`)
        continue
    }
    const newest = candidates[0].f
    copyFileSync(join(TMP, newest), join(TMP, `lighthouse-${preset}-latest.json`))
    console.log(`[gate-latest] ${preset}: ${newest} → lighthouse-${preset}-latest.json`)
    filled++
}

if (filled === 0) {
    console.error('[gate-latest] nothing to compare; run the audit first.')
    process.exit(3)
}

// 2. Run the gate with the back-filled inputs (its compare/verdict section).
const r = spawnSync(process.execPath, [join(CWD, 'scripts', 'qa-lighthouse-gate.mjs')], {
    cwd: CWD,
    stdio: 'inherit'
})
process.exit(r.status ?? 1)
