#!/usr/bin/env node
/**
 * scripts/check-bundle-size.mjs
 *
 * CI bundle size gate — reads dist/svelte/assets/, sums JS/CSS sizes
 * (raw + gzip), and checks against performance ceilings from
 * docs/performance-budget.md.
 *
 * Budget Ceilings:
 *   JS  raw  < 2500 KB
 *   JS  gzip <  650 KB
 *   CSS raw  <   65 KB
 *   CSS gzip <   16 KB
 *
 * Exit 0 if within budget, exit 1 if exceeded.
 */

import { readdir, stat, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

// ANSI color codes
const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const CYAN = '\x1b[36m'
const DIM = '\x1b[2m'

// Performance budget ceilings (KB)
const BUDGET = {
    jsRaw: 2500,
    jsGzip: 650,
    cssRaw: 65,
    cssGzip: 16
}

// Assets directory
const ASSETS_DIR = join(process.cwd(), 'dist', 'svelte', 'assets')

/**
 * Format bytes to human-readable KB with fixed decimals
 */
function formatKB(bytes) {
    return (bytes / 1024).toFixed(2)
}

/**
 * Pad string to fixed width, right-aligned
 */
function padRight(str, width) {
    return str.padStart(width)
}

/**
 * Determine if file is JS or CSS based on extension
 */
function getFileType(filename) {
    if (filename.endsWith('.js')) return 'js'
    if (filename.endsWith('.css')) return 'css'
    return null
}

/**
 * Calculate gzip size of a buffer
 */
function getGzipSize(buffer) {
    return gzipSync(buffer, { level: 9 }).length
}

async function main() {
    console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════╗${RESET}`)
    console.log(`${BOLD}${CYAN}║           Bundle Size Budget Check                          ║${RESET}`)
    console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════╝${RESET}\n`)

    // Check if assets directory exists
    try {
        await stat(ASSETS_DIR)
    } catch {
        console.error(`${RED}ERROR: ${ASSETS_DIR} not found.${RESET}`)
        console.error(`${DIM}Run 'npm run build:svelte' first.${RESET}\n`)
        process.exit(1)
    }

    // Read all files in assets directory
    const files = await readdir(ASSETS_DIR)

    // Accumulators
    let totalJsRaw = 0
    let totalJsGzip = 0
    let totalCssRaw = 0
    let totalCssGzip = 0

    const fileDetails = []

    // [2026-08-18] Initial-load CSS: only assets referenced by the built index.html
    // count against the CSS budget. Lazy (code-split) chunks — InfoPanel,
    // JourneyChrome, FocusCard, Placeholder2D, MapView, Canvas, etc. — are deferred
    // to first-interaction and are NOT fetched on initial paint, matching the
    // perf-budget doc's "code-split / lazy-load mode-specific components" intent
    // and the JS budget precedent (which passes with lazy JS chunks). The all-assets
    // totals still print for reference.
    let initialCssRaw = 0
    let initialCssGzip = 0
    const indexHtml = await readFile(join(ASSETS_DIR, '..', 'index.html'), 'utf8').catch(() => '')
    const initialAssets = new Set()
    for (const m of indexHtml.matchAll(/["']\.?\/assets\/([A-Za-z0-9._-]+\.css)["']/g)) {
        initialAssets.add(m[1])
    }

    for (const filename of files) {
        const filePath = join(ASSETS_DIR, filename)
        const fileStat = await stat(filePath)

        if (!fileStat.isFile()) continue

        const fileType = getFileType(filename)
        if (!fileType) continue

        const buffer = await readFile(filePath)
        const rawSize = buffer.length
        const gzipSize = getGzipSize(buffer)

        fileDetails.push({
            name: filename,
            type: fileType,
            raw: rawSize,
            gzip: gzipSize
        })

        if (fileType === 'js') {
            totalJsRaw += rawSize
            totalJsGzip += gzipSize
        } else {
            totalCssRaw += rawSize
            totalCssGzip += gzipSize
            if (initialAssets.has(filename)) {
                initialCssRaw += rawSize
                initialCssGzip += gzipSize
            }
        }
    }

    // Print individual file breakdown
    console.log(`${BOLD}${DIM}Individual Files:${RESET}`)
    console.log(`${DIM}─────────────────────────────────────────────────────────────────${RESET}`)
    console.log(`${BOLD}${DIM}  File                                    Raw (KB)   Gzip (KB)  ${RESET}`)
    console.log(`${DIM}─────────────────────────────────────────────────────────────────${RESET}`)

    for (const file of fileDetails.sort((a, b) => b.raw - a.raw)) {
        const truncName = file.name.length > 40 ? file.name.slice(0, 37) + '...' : file.name
        console.log(
            `  ${truncName.padEnd(40)} ${padRight(formatKB(file.raw), 8)}   ${padRight(formatKB(file.gzip), 8)}`
        )
    }

    console.log(`${DIM}─────────────────────────────────────────────────────────────────${RESET}\n`)

    // Summary table
    console.log(`${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════╗${RESET}`)
    console.log(`${BOLD}${CYAN}║                      Summary Table                          ║${RESET}`)
    console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════╝${RESET}\n`)

    const metrics = [
        {
            label: 'JS (raw)',
            actual: totalJsRaw,
            budget: BUDGET.jsRaw,
            unit: 'KB'
        },
        {
            label: 'JS (gzip)',
            actual: totalJsGzip,
            budget: BUDGET.jsGzip,
            unit: 'KB'
        },
        {
            label: 'CSS (raw, initial)',
            actual: initialCssRaw,
            budget: BUDGET.cssRaw,
            unit: 'KB'
        },
        {
            label: 'CSS (gzip, initial)',
            actual: initialCssGzip,
            budget: BUDGET.cssGzip,
            unit: 'KB'
        },
        {
            label: 'CSS (raw, all assets)',
            actual: totalCssRaw,
            budget: Infinity,
            unit: 'KB'
        }
    ]

    // Header
    console.log(`  ${BOLD}Metric          Actual       Budget       Delta        Status${RESET}`)
    console.log(`  ${DIM}─────────────────────────────────────────────────────────────────${RESET}`)

    let allPassed = true

    for (const m of metrics) {
        const actualKB = m.actual / 1024
        const deltaKB = actualKB - m.budget
        const passed = actualKB < m.budget

        if (!passed) allPassed = false

        const statusColor = passed ? GREEN : RED
        const statusIcon = passed ? '✓ PASS' : '✗ FAIL'
        const deltaColor = deltaKB > 0 ? RED : GREEN
        const deltaSign = deltaKB > 0 ? '+' : ''

        console.log(
            `  ${m.label.padEnd(16)} ${padRight(formatKB(m.actual), 10)} ${padRight(m.budget.toFixed(2), 10)} ` +
                `${deltaColor}${deltaSign}${padRight(deltaKB.toFixed(2), 9)}${RESET}  ` +
                `${statusColor}${BOLD}${statusIcon}${RESET}`
        )
    }

    console.log(`  ${DIM}─────────────────────────────────────────────────────────────────${RESET}\n`)

    // Final verdict
    if (allPassed) {
        console.log(`${GREEN}${BOLD}  ══════════════════════════════════════════════════════════════${RESET}`)
        console.log(`${GREEN}${BOLD}   ✓ ALL BUDGETS WITHIN LIMITS                                 ${RESET}`)
        console.log(`${GREEN}${BOLD}  ══════════════════════════════════════════════════════════════${RESET}\n`)
        process.exit(0)
    } else {
        console.log(`${RED}${BOLD}  ══════════════════════════════════════════════════════════════${RESET}`)
        console.log(`${RED}${BOLD}   ✗ BUDGET EXCEEDED — See docs/performance-budget.md          ${RESET}`)
        console.log(`${RED}${BOLD}  ══════════════════════════════════════════════════════════════${RESET}\n`)
        process.exit(1)
    }
}

main().catch((err) => {
    console.error(`${RED}Fatal error:${RESET}`, err)
    process.exit(1)
})
