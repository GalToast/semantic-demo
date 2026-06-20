#!/usr/bin/env node
/**
 * w9-bridge-audit.mjs
 *
 * W9-B Bridge Audit: Apply the 5-signal dead-code rule
 * (docs/migration-plan.md §Bridge File Doctrine) to every
 * `src/lib/engine/*-bridge.ts` file. Emit a markdown table.
 *
 * 5 signals per bridge:
 *   (1) Imported by another src/lib/ or src/ file
 *   (2) Imported by name in docs/, tests/, or legacy-reference/
 *   (3) Exports public types or functions used by src/components/
 *   (4) Has a commit in the last 60 days
 *   (5) Is a *-bridge.ts file with active callers
 *
 * A bridge passes "dead" only when all five signals are zero.
 *
 * Usage: node scripts/w9-bridge-audit.mjs [output.md]
 *        (default output: docs/w9-bridge-audit-2026-06-20.md)
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, resolve, basename } from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(__dirname, '..')
const ENGINE_DIR = join(ROOT, 'src/lib/engine')
const SRC_LIB = join(ROOT, 'src/lib')
const SRC_COMPONENTS = join(ROOT, 'src/components')
const DOCS = join(ROOT, 'docs')
const TESTS = join(ROOT, 'tests')
const LEGACY = join(ROOT, 'legacy-reference')

const SINCE_DAYS = 60

function listBridges() {
    return readdirSync(ENGINE_DIR)
        .filter((f) => f.endsWith('-bridge.ts'))
        .sort()
}

function findTsFiles(dir) {
    if (!existsSync(dir)) return []
    const out = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
        const full = join(dir, entry.name)
        if (entry.isDirectory()) out.push(...findTsFiles(full))
        else if (/\.(ts|svelte)$/.test(entry.name)) out.push(full)
    }
    return out
}

function findMjsFiles(dir) {
    if (!existsSync(dir)) return []
    const out = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
        const full = join(dir, entry.name)
        if (entry.isDirectory()) out.push(...findMjsFiles(full))
        else if (entry.name.endsWith('.mjs')) out.push(full)
    }
    return out
}

function readAll(dir, pattern = /\.(ts|svelte|mjs|js|md)$/) {
    if (!existsSync(dir)) return []
    const out = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
        const full = join(dir, entry.name)
        if (entry.isDirectory()) out.push(...readAll(full, pattern))
        else if (pattern.test(entry.name)) out.push(full)
    }
    return out
}

function grepInFiles(files, pattern) {
    const hits = []
    for (const f of files) {
        try {
            const txt = readFileSync(f, 'utf8')
            if (pattern.test(txt)) hits.push(f)
        } catch {
            /* skip unreadable */
        }
    }
    return hits
}

function getBridgeExports(file) {
    const txt = readFileSync(file, 'utf8')
    const exports = []
    const reExportRe = /export\s+(?:const|function|class|type|interface|\{)\s+([A-Za-z0-9_]+)/g
    let m
    while ((m = reExportRe.exec(txt))) {
        exports.push(m[1])
    }
    const reExportStarRe = /export\s+\*\s+from/g
    if (reExportStarRe.test(txt)) exports.push('*(re-export)')
    const bridgeExportRe = /export\s*\{\s*([^}]+)\s*\}/g
    while ((m = bridgeExportRe.exec(txt))) {
        const inner = m[1]
        const names = inner
            .split(',')
            .map((s) => s.trim().split(/\s+as\s+/)[0])
            .filter(Boolean)
        exports.push(...names)
    }
    return [...new Set(exports)]
}

function getLineCount(file) {
    return readFileSync(file, 'utf8').split('\n').length
}

function getLastCommitDate(file) {
    try {
        const out = execSync(`git log -1 --format=%cI -- "${file.replace(/\\/g, '/')}"`, {
            cwd: ROOT,
            encoding: 'utf8'
        }).trim()
        return out || null
    } catch {
        return null
    }
}

function isWithinDays(dateStr, days) {
    if (!dateStr) return false
    const d = new Date(dateStr)
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    return d > cutoff
}

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const srcLibFiles = findTsFiles(SRC_LIB)
const srcCompFiles = findTsFiles(SRC_COMPONENTS)
const docFiles = readAll(DOCS, /\.md$/)
const testMjsFiles = findMjsFiles(TESTS)
const testTsFiles = findTsFiles(TESTS)
const testFiles = [...testMjsFiles, ...testTsFiles]
const legacyFiles = existsSync(LEGACY) ? readAll(LEGACY, /\.(ts|js|svelte|mjs|md)$/) : []

const allConsumerFiles = [...srcLibFiles, ...srcCompFiles]
const allNonConsumerFiles = [...docFiles, ...testFiles, ...legacyFiles]

const bridges = listBridges()
const auditDate = new Date().toISOString().slice(0, 10)

console.log(`W9-B Bridge Audit — ${auditDate}`)
console.log(`Bridges found: ${bridges.length}`)
console.log(`Consumer file corpus: ${allConsumerFiles.length}`)
console.log(`Docs/tests/legacy corpus: ${allNonConsumerFiles.length}`)
console.log('')

const rows = []

for (const bridge of bridges) {
    const bridgePath = join(ENGINE_DIR, bridge)
    const bridgeBase = bridge.replace(/\.ts$/, '')
    const alias = `@lib/engine/${bridgeBase}`

    // Signal (1): imported by src/lib or src/components
    const aliasRe = new RegExp(`from\\s+['"](?:${escapeRegex(alias)}|\\.\\.?/[^'"]*${escapeRegex(bridgeBase)})['"]`)
    const signal1Hits = grepInFiles(allConsumerFiles, aliasRe).filter((f) => f !== bridgePath)

    // Signal (2): imported by docs/, tests/, or legacy-reference/
    const signal2Hits = grepInFiles(allNonConsumerFiles, aliasRe)

    // Signal (3): exports types/functions used by components
    const exports = getBridgeExports(bridgePath)
    const exportNamesRe = new RegExp(
        `\\b(${exports
            .filter((e) => e !== '*(re-export)')
            .map(escapeRegex)
            .join('|')})\\b`
    )
    const signal3Hits = exports.length ? grepInFiles(srcCompFiles, exportNamesRe).filter((f) => f !== bridgePath) : []

    // Signal (4): last commit within 60 days
    const lastCommit = getLastCommitDate(bridgePath)
    const signal4 = isWithinDays(lastCommit, SINCE_DAYS)

    // Signal (5): is *-bridge.ts with active callers (caller count > 0)
    const signal5 = signal1Hits.length > 0 || signal2Hits.length > 0

    const activeSignals = [
        signal1Hits.length > 0,
        signal2Hits.length > 0,
        signal3Hits.length > 0,
        signal4,
        signal5
    ].filter(Boolean).length

    const verdict =
        activeSignals === 5
            ? 'KEEP (load-bearing)'
            : activeSignals === 0
              ? 'RETIRE (5-signal dead)'
              : `AUDIT (${activeSignals}/5 signals)`

    rows.push({
        bridge,
        loc: getLineCount(bridgePath),
        consumers: signal1Hits.length,
        docsTestsLegacy: signal2Hits.length,
        componentExports: signal3Hits.length,
        lastCommit: lastCommit ? lastCommit.slice(0, 10) : 'never',
        within60: signal4,
        activeSignals,
        verdict,
        exports: exports.length,
        consumersList:
            signal1Hits
                .map((f) => f.replace(ROOT + '/', ''))
                .slice(0, 3)
                .join(', ') + (signal1Hits.length > 3 ? ` (+${signal1Hits.length - 3})` : '')
    })
}

const outPath = process.argv[2] || join(ROOT, `docs/w9-bridge-audit-${auditDate}.md`)

const totalLoC = rows.reduce((s, r) => s + r.loc, 0)
const keepCount = rows.filter((r) => r.verdict.startsWith('KEEP')).length
const retireCount = rows.filter((r) => r.verdict.startsWith('RETIRE')).length
const auditCount = rows.filter((r) => r.verdict.startsWith('AUDIT')).length

let md = `# W9-B Bridge Audit — ${auditDate}

## Summary

| Metric | Value |
|--------|-------|
| Total bridge files | ${rows.length} |
| Total LoC | ${totalLoC} |
| **KEEP (5/5 signals — load-bearing)** | ${keepCount} |
| **RETIRE (0/5 signals — confirmed dead)** | ${retireCount} |
| **AUDIT (1-4/5 signals — needs review)** | ${auditCount} |

## 5-Signal Rule (per docs/migration-plan.md §Bridge File Doctrine)

A bridge passes "dead" only when **all five signals are zero**:

1. Imported by another src/lib/ or src/ file
2. Imported by name in docs/, tests/, or legacy-reference/
3. Exports public types or functions used by src/components/
4. Has a commit in the last 60 days
5. Is a *-bridge.ts file with active callers

## Bridge Inventory

| # | Bridge | LoC | Consumers | Docs/Tests | Comp Exports | Last Commit | Within 60d | Active Signals | Verdict | Sample Consumers |
|---|--------|-----|-----------|------------|--------------|-------------|------------|----------------|---------|------------------|
`

for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    md += `| ${i + 1} | \`${r.bridge}\` | ${r.loc} | ${r.consumers} | ${r.docsTestsLegacy} | ${r.componentExports} | ${r.lastCommit} | ${r.within60 ? '✓' : '✗'} | ${r.activeSignals}/5 | ${r.verdict} | ${r.consumersList || '—'} |\n`
}

md += `
## Methodology Notes

- **Consumer scan**: Recursively greps \`src/lib/**\` and \`src/components/**\` for \`from '@lib/engine/<bridge>'\` imports. Excludes the bridge file itself.
- **Docs/Tests/Legacy scan**: Recursively greps \`docs/**\`, \`tests/**\`, and \`legacy-reference/**\` for the same alias. Hits here count as Signal 2 even though they're not runtime callers (they indicate the bridge is part of the documented contract surface).
- **Component exports scan**: Parses the bridge file for \`export const|function|class|type|interface|{ ... }\` declarations, then greps \`src/components/**\` for any of those names appearing as bare identifiers (catches indirect usage via \`import { foo } from '@lib/engine/anything'\`).
- **Last commit**: \`git log -1 --format=%cI\` on the bridge file.
- **Verdict thresholds**: 5/5 = KEEP (load-bearing); 0/5 = RETIRE (5-signal dead); 1–4/5 = AUDIT (needs human review).

## Per-Bridge Detail

`

for (const r of rows) {
    md += `### ${r.bridge} — ${r.verdict}\n\n`
    md += `- **LoC**: ${r.loc}\n`
    md += `- **Exports**: ${r.exports} symbol(s)\n`
    md += `- **Signal 1** (src/lib+components consumers): ${r.consumers}\n`
    md += `- **Signal 2** (docs/tests/legacy refs): ${r.docsTestsLegacy}\n`
    md += `- **Signal 3** (component-export usages): ${r.componentExports}\n`
    md += `- **Signal 4** (last commit within 60d): ${r.within60 ? `yes (${r.lastCommit})` : `no (${r.lastCommit})`}\n`
    md += `- **Signal 5** (active callers): ${r.consumers + r.docsTestsLegacy > 0 ? 'yes' : 'no'}\n\n`
}

import { writeFileSync } from 'node:fs'
writeFileSync(outPath, md)

console.log(`Audit written to: ${outPath}`)
console.log(`KEEP: ${keepCount} | RETIRE: ${retireCount} | AUDIT: ${auditCount}`)
