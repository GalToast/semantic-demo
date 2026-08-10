#!/usr/bin/env node
/**
 * tmp-ttl-sweep.mjs — TTL sweep for the tmp/ directory.
 *
 * tmp/ grew to 886MB / 13.5k files before a manual cleanup (2026-08-10);
 * this script keeps it from regrowing. Default is DRY-RUN; pass --apply to
 * actually delete. Never touches reports/briefs/current-wave artifacts.
 *
 * Usage:
 *   node scripts/tmp-ttl-sweep.mjs                 # dry-run, 14 days
 *   node scripts/tmp-ttl-sweep.mjs --days=30       # dry-run, 30 days
 *   node scripts/tmp-ttl-sweep.mjs --apply         # delete (14 days)
 *   node scripts/tmp-ttl-sweep.mjs --apply --days=7
 */
import { readdirSync, statSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..')
const TMP = join(ROOT, 'tmp')
const DEFAULT_DAYS = 14

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const daysArg = args.find((a) => a.startsWith('--days='))
const days = daysArg ? Number(daysArg.split('=')[1]) : DEFAULT_DAYS
if (!Number.isFinite(days) || days <= 0) {
    console.error(`bad --days value: ${daysArg}`)
    process.exit(2)
}
const cutoff = Date.now() - days * 24 * 60 * 60 * 1000

// Patterns that must NEVER be deleted (reports, briefs, active-wave artifacts).
const PROTECTED = [
    /[Rr]eport.*\.md$/,
    /[Bb]rief.*\.md$/,
    /contract-suite.*\.out$/,
    /unit-.*\.out$/,
    /^TA\d+.*\.md$/,
    /^TI\d+.*\.md$/,
    /^DE\d+.*\.md$/,
    /^wave.*\.md$/i
]
const protectedName = (name) => PROTECTED.some((re) => re.test(name))

function olderThan(path, cut) {
    try {
        return statSync(path).mtimeMs < cut
    } catch {
        return false // EPERM/EBUSY/race — skip silently-ish (warned by caller)
    }
}

function dirAllOld(dir, cut, warn) {
    try {
        const entries = readdirSync(dir)
        if (entries.length === 0) return true
        for (const e of entries) {
            const p = join(dir, e)
            let st
            try {
                st = statSync(p)
            } catch {
                warn.push(`  [warn] stat failed: ${p}`)
                return false
            }
            if (st.isDirectory()) {
                if (!dirAllOld(p, cut, warn)) return false
            } else if (st.mtimeMs >= cut) {
                return false
            }
        }
        return true
    } catch (err) {
        warn.push(`  [warn] readdir failed: ${dir} (${err.message})`)
        return false
    }
}

function dirSize(dir) {
    let total = 0
    try {
        for (const e of readdirSync(dir)) {
            const p = join(dir, e)
            let st
            try {
                st = statSync(p)
            } catch {
                continue
            }
            if (st.isDirectory()) total += dirSize(p)
            else total += st.size
        }
    } catch {
        /* ignore */
    }
    return total
}

const candidates = [] // { path, size, ageDays }
const warns = []

// 1) Top-level files older than cutoff (excluding protected).
for (const name of readdirSync(TMP)) {
    const p = join(TMP, name)
    let st
    try {
        st = statSync(p)
    } catch {
        warns.push(`  [warn] stat failed: ${p}`)
        continue
    }
    if (st.isDirectory()) continue
    if (protectedName(name)) continue
    if (st.mtimeMs < cutoff) {
        candidates.push({ path: p, size: st.size, ageDays: (Date.now() - st.mtimeMs) / 86400000 })
    }
}

// 2) Top-level directories older-than-cutoff in ALL contents (excluding protected names).
for (const name of readdirSync(TMP)) {
    const p = join(TMP, name)
    let st
    try {
        st = statSync(p)
    } catch {
        continue
    }
    if (!st.isDirectory()) continue
    if (protectedName(name)) continue
    if (dirAllOld(p, cutoff, warns)) {
        candidates.push({ path: p, size: dirSize(p), ageDays: (Date.now() - st.mtimeMs) / 86400000 })
    }
}

candidates.sort((a, b) => b.size - a.size)
const totalMB = candidates.reduce((s, c) => s + c.size, 0) / 1048576

console.log(
    `tmp TTL sweep (${days}d${apply ? ', APPLY' : ', dry-run'}): ${candidates.length} candidate(s), ${totalMB.toFixed(1)}MB ${apply ? 'freed' : 'would free'}`
)
for (const c of candidates.slice(0, 10)) {
    console.log(`  ${(c.size / 1048576).toFixed(2).padStart(8)}MB  ${c.ageDays.toFixed(1).padStart(6)}d  ${c.path}`)
}
if (candidates.length > 10) console.log(`  ... and ${candidates.length - 10} more`)
for (const w of warns) console.log(w)

if (apply) {
    for (const c of candidates) {
        try {
            rmSync(c.path, { recursive: true, force: true })
        } catch (err) {
            console.warn(`  [warn] delete failed: ${c.path} (${err.message})`)
        }
    }
    writeFileSync(
        join(TMP, 'tmp-ttl-sweep-last-run.txt'),
        `${new Date().toISOString()} ${days}d ${candidates.length} entries ${totalMB.toFixed(1)}MB\n`
    )
    console.log(`deleted ${candidates.length} candidate(s)`)
}
