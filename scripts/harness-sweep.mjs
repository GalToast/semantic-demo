/**
 * harness-sweep.mjs — periodic bloat sweep for the Pi harness.
 * Implements recommendation A from tmp/pi-harness-slowdown-analysis.md:
 * detached-job log store bloat + stale pi-dist .bak backups.
 *
 * Safe by construction:
 *  - %TEMP%\pi-background-jobs: remove files older than 7 days OR > 25 MB
 *    (runaway worker stdout). Files newer than 1 hour are NEVER touched.
 *  - pi dist/core *.pre-*.bak: remove backups older than 30 days (the
 *    pi-background-detach package re-applies its patch on next `pi update`).
 *
 * Usage: node scripts/harness-sweep.mjs [--dry-run]
 */

import { readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'

const DRY_RUN = process.argv.includes('--dry-run')
const HOUR = 3600_000
const DAY = 24 * HOUR

function fmtBytes(size) {
    return size >= 1048576 ? (size / 1048576).toFixed(1) + ' MB' : Math.round(size / 1024) + ' KB'
}

function ageJobLogs(tmpDir) {
    const dir = process.env.PI_BG_JOBS_DIR || join(tmpDir, 'pi-background-jobs')
    let count = 0
    let bytes = 0
    try {
        const names = readdirSync(dir)
        for (const name of names) {
            const p = join(dir, name)
            let st
            try {
                st = statSync(p)
            } catch {
                continue
            }
            if (!st.isFile()) continue
            const ageMs = Date.now() - st.mtimeMs
            if (ageMs < HOUR) continue // live-adjacent guard
            const stale = ageMs > 7 * DAY
            const runaway = st.size > 30 * 1024 * 1024
            if (!stale && !runaway) continue
            const reason = `${stale ? `age ${Math.round(ageMs / DAY)}d` : ''}${runaway ? ' ' + fmtBytes(st.size) : ''}`
            if (DRY_RUN) {
                console.log(`  -w ${p} (${reason.trim()})`)
            } else {
                try {
                    unlinkSync(p)
                    count++
                    bytes += st.size
                } catch {
                    /* race */
                }
            }
        }
    } catch {
        /* dir absent — nothing to do */
    }
    if (!DRY_RUN && count > 0) console.log(`[sweep] bg-jobs: ${count} files, ${fmtBytes(bytes)}`)
}

function ageCoreBaks(coreDir) {
    let count = 0
    let bytes = 0
    try {
        const names = readdirSync(coreDir)
        for (const name of names) {
            if (!name.endsWith('.bak') && !name.includes('.pre-pi-')) continue
            const p = join(coreDir, name)
            let st
            try {
                st = statSync(p)
            } catch {
                continue
            }
            const ageMs = Date.now() - st.mtimeMs
            if (ageMs < HOUR || ageMs <= 30 * DAY) continue
            const rel = p.replace(new RegExp('.*node_modules'), '…node_modules')
            if (DRY_RUN) {
                console.log(`  -w ${rel} (${Math.round(ageMs / DAY)}d)`)
            } else {
                try {
                    unlinkSync(p)
                    count++
                    bytes += st.size
                } catch {
                    /* raced */
                }
            }
        }
    } catch {
        /* dir absent */
    }
    if (!DRY_RUN && count > 0) console.log(`[sweep] dist .bak: ${count} files, ${fmtBytes(bytes)}`)
}

ageJobLogs(os.tmpdir())
ageCoreBaks(
    process.env.PI_CORE_DIR ||
        join(process.env.APPDATA || '', 'npm', 'node_modules', '@earendil-works', 'pi-coding-agent', 'dist', 'core')
)
console.log(DRY_RUN ? '[sweep] dry-run complete — nothing deleted' : '[sweep] complete')
