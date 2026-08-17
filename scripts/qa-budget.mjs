#!/usr/bin/env node
/**
 * qa-budget.mjs — deterministic chunk-size meter for the perf campaign.
 *
 * Scans dist/svelte/assets (+ subdirs) for *.js and *.css, AND the CSS the
 * browser loads eagerly via <link rel=stylesheet> in dist/svelte/index.html
 * (e.g. dist/svelte/css/*.css, semantic-demo.css). The meter previously only
 * saw dist/svelte/assets/*.css and under-reported first-load CSS by ~4x.
 * Reports top-15, totals, and can write/compare against baseline JSON files.
 *
 * Usage:
 *   node scripts/qa-budget.mjs                          # compare vs newest baseline
 *   node scripts/qa-budget.mjs --baseline write <file>  # write current meter to file
 *   node scripts/qa-budget.mjs --baseline read  <file>  # compare vs that file
 *   node scripts/qa-budget.mjs --help
 */

import { readdir, stat, readFile, writeFile } from 'fs/promises'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __DIR__ = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__DIR__, '..')
const ASSETS_DIR = resolve(ROOT, 'dist', 'svelte', 'assets')

// ── helpers ──────────────────────────────────────────────────────────────────

function kb(n) {
    return (n / 1024).toFixed(1)
}

async function scanAssets() {
    const chunks = []
    const seen = new Set()
    async function walk(dir) {
        const entries = await readdir(dir, { withFileTypes: true })
        for (const e of entries) {
            const full = resolve(dir, e.name)
            if (e.isDirectory()) {
                await walk(full)
            } else if (/\.(js|css)$/.test(e.name) && !/\.br$/.test(e.name) && !/\.gz$/.test(e.name)) {
                try {
                    const s = await stat(full)
                    if (!seen.has(full)) {
                        seen.add(full)
                        chunks.push({ path: full, name: e.name, size: s.size })
                    }
                } catch {
                    return null // readdir or path-join failure → no baseline
                }
            }
        }
    }
    await walk(ASSETS_DIR)
    // Also scan CSS the browser loads eagerly via <link> in index.html
    // (dist/svelte/css/*.css, semantic-demo.css, etc.). Without this the meter
    // only saw dist/svelte/assets/*.css and under-reported first-load CSS ~4x.
    for (const c of await scanLinkedCss()) {
        if (!seen.has(c.path)) {
            seen.add(c.path)
            chunks.push(c)
        }
    }
    chunks.sort((a, b) => b.size - a.size)
    return chunks
}

// CSS the browser pulls on first paint via <link rel=stylesheet> in
// dist/svelte/index.html. These are NOT in dist/svelte/assets/ and were
// previously invisible to the meter.
async function scanLinkedCss() {
    const out = []
    const htmlPath = resolve(ROOT, 'dist', 'svelte', 'index.html')
    let html
    try {
        html = await readFile(htmlPath, 'utf8')
    } catch {
        return out
    }
    const base = resolve(ROOT, 'dist', 'svelte')
    const re = /<link\b[^>]*?href\s*=\s*["']([^"']*?\.css[^"']*?)["'][^>]*?>/gi
    let m
    while ((m = re.exec(html)) !== null) {
        const href = m[1].replace(/^\.\//, '')
        const full = resolve(base, href)
        try {
            const s = await stat(full)
            out.push({ path: full, name: 'linked:' + href, size: s.size })
        } catch {
            // linked file missing from the build → skip
        }
    }
    return out
}

function summary(chunks) {
    const js = chunks.filter((c) => c.name.endsWith('.js'))
    const css = chunks.filter((c) => c.name.endsWith('.css'))
    const totalBytes = js.reduce((s, c) => s + c.size, 0)
    const cssBytes = css.reduce((s, c) => s + c.size, 0)
    const grand = totalBytes + cssBytes
    return { js, css, totalBytes, cssBytes, grand, top15: chunks.slice(0, 15) }
}

function tableRows(s) {
    const lines = []
    lines.push(''.padEnd(6) + '  ' + 'Size (KB)'.padEnd(10) + '  ' + '% JS'.padEnd(8) + '  ' + 'Name')
    lines.push('-'.repeat(80))
    for (const c of s.top15) {
        const pct = s.totalBytes > 0 ? ((c.size / s.totalBytes) * 100).toFixed(1) : '0.0'
        lines.push(kb(c.size).padStart(6) + '  ' + pct.padStart(8) + '%  ' + c.name)
    }
    lines.push('-'.repeat(80))
    lines.push('')
    lines.push(`TOTAL JS KB : ${(s.totalBytes / 1024).toFixed(1)} KB`)
    lines.push(`TOTAL CSS KB: ${(s.cssBytes / 1024).toFixed(1)} KB`)
    lines.push(`GRAND TOTAL : ${(s.grand / 1024).toFixed(1)} KB`)
    return lines
}

// ── baseline logic ────────────────────────────────────────────────────────────

function modeTransitionChunks(s) {
    return s.js.filter((c) => c.name.includes('mode-transition'))
}

async function readBaseline(file) {
    const raw = await readFile(file, 'utf8')
    return JSON.parse(raw)
}

async function writeBaseline(file, meter) {
    await writeFile(file, JSON.stringify(meter, null, 2) + '\n', 'utf8')
}

async function findNewestBaseline() {
    const docsDir = resolve(ROOT, 'docs')
    try {
        const entries = await readdir(docsDir)
        const matches = entries.filter((e) => /^budget-baseline-\d{4}-\d{2}-\d{2}\.json$/.test(e))
        if (matches.length === 0) return null
        matches.sort()
        return resolve(docsDir, matches[matches.length - 1])
    } catch {
        return null
    }
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2)

    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
qa-budget.mjs — deterministic chunk-size meter

Usage:
  node scripts/qa-budget.mjs                              # print table, compare vs newest baseline
  node scripts/qa-budget.mjs --baseline write <file>      # write current meter JSON to <file>
  node scripts/qa-budget.mjs --baseline read  <file>      # compare current vs <file>
  node scripts/qa-budget.mjs --help

Exit codes (comparison mode):
  0  total JS <= baseline + 32 KB  (perf slack)
  1  total grew more than 32 KB, OR any mode-transition chunk grew > 16 KB
  2  missing inputs (no baseline found when comparing)
`)
        return
    }

    // Parse --baseline flag
    const baselineIdx = args.indexOf('--baseline')
    let baselineFile = null
    let baselineMode = null // 'write' | 'read'

    if (baselineIdx !== -1) {
        baselineMode = args[baselineIdx + 1]
        baselineFile = args[baselineIdx + 2]
    }

    if (!baselineFile && !baselineMode) {
        // Default: compare vs newest baseline
        baselineFile = await findNewestBaseline()
        baselineMode = baselineFile ? 'read' : null
    }

    const chunks = await scanAssets()
    const s = summary(chunks)
    const meter = {
        timestamp: new Date().toISOString(),
        chunks: s.js.map((c) => ({ name: c.name, size: c.size })),
        totalBytes: s.totalBytes,
        cssBytes: s.cssBytes,
        grandBytes: s.grand
    }

    // Print table always
    const lines = tableRows(s)
    console.log(lines.join('\n'))

    // Determine exit code / mode
    if (baselineMode === 'write') {
        if (!baselineFile) {
            console.error('ERROR: --baseline write requires a file path')
            process.exit(2)
        }
        const out = resolve(ROOT, baselineFile)
        await writeBaseline(out, meter)
        console.log(`\nWrote baseline → ${out}`)
        process.exit(0)
    }

    if (baselineMode === 'read' && baselineFile) {
        const target = resolve(ROOT, baselineFile)
        let base
        try {
            base = await readBaseline(target)
        } catch {
            console.error(`ERROR: could not read baseline ${target}`)
            process.exit(2)
        }

        // Per-chunk delta for mode-transition chunks
        const baseMap = new Map(base.chunks.map((c) => [c.name, c.size]))
        const jSSize = base.totalBytes
        const diff = s.totalBytes - jSSize

        console.log(`\n── Baseline comparison: ${target} ──`)
        console.log(
            `Baseline JS total: ${kb(jSSize)} KB  |  Current JS total: ${kb(s.totalBytes)} KB  |  Delta: ${diff >= 0 ? '+' : ''}${kb(diff)} KB`
        )

        const mtChunks = modeTransitionChunks(s)
        // hash-rotation-safe: rebuilt chunks rotate content-hashes
        // (mode-transition-deps-*.js). Match by PREFIX family when the exact
        // name is absent, so a rename reports a REAL size diff, not fake `0→x`.
        const baselineMt = base.chunks.find((c) => c.name.startsWith('mode-transition-deps-'))
        let mtGrowth = false
        for (const c of mtChunks) {
            let bs = baseMap.get(c.name) ?? 0
            if (bs === 0 && baselineMt && c.name.startsWith('mode-transition-deps-')) bs = baselineMt.size
            const d = c.size - bs
            if (d > 16 * 1024) mtGrowth = true
            console.log(`  ${c.name}: ${kb(bs)} KB → ${kb(c.size)} KB  (${d >= 0 ? '+' : ''}${kb(d)} KB)`)
        }

        const slack = 32 * 1024
        const passed = diff <= slack && !mtGrowth
        console.log(
            passed
                ? `\nPASSED (total grew ≤ +${kb(slack)} KB; mode-transition chunks within +16 KB each)`
                : `\nFAILED — total grew > +${kb(slack)} KB or a mode-transition chunk grew > 16 KB`
        )

        process.exit(passed ? 0 : 1)
    }

    // No baseline to compare — just printed the table
    if (!baselineMode) {
        console.log('\n(No baseline found to compare against. Use --baseline write to seed one.)')
    }

    process.exit(0)
}

main().catch((err) => {
    console.error(err)
    process.exit(2)
})
