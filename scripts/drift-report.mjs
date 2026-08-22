#!/usr/bin/env node
/**
 * scripts/drift-report.mjs — uncommitted-work drift report.
 *
 * Answers "how big is the collision surface right now?" in one command:
 * buckets dirty/untracked files by hours-since-last-modification and flags
 * the dangerous classes:
 *
 *   - STALE  (>6h silent): owner likely gone; candidate for main-lane triage
 *   - WARM   (1-6h):       a wave may have paused mid-flight
 *   - HOT    (<1h):        an active lane — do not touch, coordinate first
 *
 * Report-only: exit 0 always. Wire into session start or run manually.
 *
 * Usage:
 *   node scripts/drift-report.mjs            # human report
 *   node scripts/drift-report.mjs --json     # machine-readable
 */

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const STALE_H = 6
const WARM_H = 1

const raw = execSync('git status --short', { encoding: 'utf8' })
const now = Date.now()
const rows = []
for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    const st = line.slice(0, 2)
    const p = line.slice(3).trim().replace(/^"|"$/g, '')
    // Untracked directories (trailing /) have no meaningful mtime of their own;
    // use the newest file inside instead of the dir handle.
    let ageH = -1
    try {
        let newest = fs.statSync(p).mtimeMs
        if (p.endsWith('/')) {
            for (const f of fs.readdirSync(p)) {
                try {
                    newest = Math.max(newest, fs.statSync(path.join(p, f)).mtimeMs)
                } catch {
                    /* ignore */
                }
            }
        }
        ageH = (now - newest) / 36e5
    } catch {
        /* deleted-but-reported */
    }
    rows.push({ status: st === ' ' ? 'M' : st.trim() || 'M', path: p, ageH })
}

const bucketOf = (r) => (r.ageH < 0 ? 'GONE' : r.ageH > STALE_H ? 'STALE' : r.ageH > WARM_H ? 'WARM' : 'HOT')
const BUCKET_ORDER = ['STALE', 'WARM', 'HOT', 'GONE']

if (process.argv.includes('--json')) {
    const out = {}
    for (const b of BUCKET_ORDER) out[b] = []
    for (const r of rows) out[bucketOf(r)].push({ status: r.status, path: r.path, ageHours: +r.ageH.toFixed(2) })
    console.log(JSON.stringify({ total: rows.length, ...out }, null, 2))
} else {
    console.log(`Drift report — ${rows.length} uncommitted entr${rows.length === 1 ? 'y' : 'ies'}`)
    console.log(
        `(STALE >${STALE_H}h = triage candidate · WARM ${WARM_H}-${STALE_H}h = paused wave · HOT <${WARM_H}h = active lane, hands off)\n`
    )
    for (const b of BUCKET_ORDER) {
        const items = rows.filter((r) => bucketOf(r) === b).sort((a, z) => z.ageH - a.ageH)
        if (!items.length) continue
        console.log(`── ${b} (${items.length}) ──`)
        for (const r of items) console.log(`  ${r.ageH.toFixed(1).padStart(6)}h  ${r.status.padEnd(2)}  ${r.path}`)
        console.log('')
    }
    const stale = rows.filter((r) => bucketOf(r) === 'STALE').length
    if (stale > 0) {
        console.log(
            `${stale} STALE file(s): owners likely gone. Triage: land coherent pieces,` +
                ' git checkout the rest AFTER switchboard/ownership check (parallel-lane rule).'
        )
    }
}
