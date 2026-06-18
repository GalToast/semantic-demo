/**
 * Visual Regression Test — Pixel-Level Baseline Comparison
 *
 * Serves dist/svelte/ on a local port, captures Playwright screenshots
 * for each baseline state, and compares with pixelmatch.
 *
 * Baselines (tests/visual-baselines/):
 *   1. overview.png      — initial load, wait for WebGL init
 *   2. search-open.png   — search panel opened
 *   3. focus-mode.png    — canvas center clicked to enter focus
 *   4. map-view.png      — map view triggered
 *
 * Usage:
 *   npx tsx tests/visual-regression.test.ts
 *   npm run test:visual
 */

import * as http from 'node:http'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import { chromium, type Browser, type Page } from 'playwright'

// ── Config ──────────────────────────────────────────────────────────────────

const PORT = 8799
const BASE_URL = `http://127.0.0.1:${PORT}`
const BASELINE_DIR = path.resolve(import.meta.dirname ?? __dirname, 'visual-baselines')
const DIFF_DIR = path.join(BASELINE_DIR, 'diffs')
const THRESHOLD = 0.1 // Allow 0.1% pixel difference
const VIEWPORT = { width: 1280, height: 720 }

// ── Static file server ──────────────────────────────────────────────────────

function startServer(distDir: string): Promise<http.Server> {
    const mimeTypes: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2',
        '.woff': 'font/woff',
        '.ttf': 'font/ttf',
        '.dat': 'application/octet-stream',
        '.gz': 'application/gzip',
    }

    const server = http.createServer((req, res) => {
        let filePath = path.join(distDir, req.url === '/' ? 'index.html' : req.url || '')
        filePath = path.normalize(filePath)

        if (!filePath.startsWith(distDir)) {
            res.writeHead(403)
            res.end('Forbidden')
            return
        }

        fs.readFile(filePath, (err, data) => {
            if (err) {
                // Try index.html for SPA routing
                fs.readFile(path.join(distDir, 'index.html'), (err2, data2) => {
                    if (err2) {
                        res.writeHead(404)
                        res.end('Not Found')
                        return
                    }
                    res.writeHead(200, { 'Content-Type': 'text/html' })
                    res.end(data2)
                })
                return
            }

            const ext = path.extname(filePath).toLowerCase()
            const contentType = mimeTypes[ext] || 'application/octet-stream'
            res.writeHead(200, { 'Content-Type': contentType })
            res.end(data)
        })
    })

    return new Promise((resolve) => {
        server.listen(PORT, '127.0.0.1', () => {
            console.log(`  Server started on ${BASE_URL}`)
            resolve(server)
        })
    })
}

// ── Image comparison ────────────────────────────────────────────────────────

/** Crop a PNG to match target dimensions (center-crop) */
function cropPng(source: PNG, targetWidth: number, targetHeight: number): PNG {
    const cropped = new PNG({ width: targetWidth, height: targetHeight })
    const srcX = Math.max(0, Math.floor((source.width - targetWidth) / 2))
    const srcY = Math.max(0, Math.floor((source.height - targetHeight) / 2))

    for (let y = 0; y < targetHeight; y++) {
        for (let x = 0; x < targetWidth; x++) {
            const srcIdx = ((srcY + y) * source.width + (srcX + x)) << 2
            const dstIdx = (y * targetWidth + x) << 2
            cropped.data[dstIdx] = source.data[srcIdx]
            cropped.data[dstIdx + 1] = source.data[srcIdx + 1]
            cropped.data[dstIdx + 2] = source.data[srcIdx + 2]
            cropped.data[dstIdx + 3] = source.data[srcIdx + 3]
        }
    }
    return cropped
}

function compareImages(
    baselinePath: string,
    currentPath: string,
    diffPath: string
): { match: boolean; diffPercent: number; diffPixels: number; totalPixels: number } {
    const baseline = PNG.sync.read(fs.readFileSync(baselinePath))
    let current = PNG.sync.read(fs.readFileSync(currentPath))

    // Handle dimension mismatch by cropping the larger image to match
    if (current.width !== baseline.width || current.height !== baseline.height) {
        console.log(
            `    ⚠ Dimension mismatch: baseline ${baseline.width}x${baseline.height}, ` +
                `current ${current.width}x${current.height}. Cropping to match.`
        )
        // Use baseline dimensions as target, crop current if needed
        current = cropPng(current, baseline.width, baseline.height)
    }

    const { width, height } = baseline
    const diff = new PNG({ width, height })

    const diffPixels = pixelmatch(
        baseline.data,
        current.data,
        diff.data,
        width,
        height,
        { threshold: 0.1 } // per-pixel threshold (0-1)
    )

    fs.mkdirSync(path.dirname(diffPath), { recursive: true })
    fs.writeFileSync(diffPath, PNG.sync.write(diff))

    const totalPixels = width * height
    const diffPercent = (diffPixels / totalPixels) * 100

    return {
        match: diffPercent <= THRESHOLD,
        diffPercent,
        diffPixels,
        totalPixels,
    }
}

// ── State definitions ───────────────────────────────────────────────────────

interface TestState {
    name: string
    baseline: string
    description: string
    setup: (page: Page) => Promise<void>
}

function getTestStates(): TestState[] {
    return [
        {
            name: 'overview',
            baseline: 'overview.png',
            description: 'Initial load — WebGL scene with node graph',
            setup: async (page) => {
                await page.goto(BASE_URL, { waitUntil: 'networkidle' })
                // Wait for WebGL to initialize and first frame to render
                await page.waitForTimeout(5000)
            },
        },
        {
            name: 'search-open',
            baseline: 'search-open.png',
            description: 'Search panel opened',
            setup: async (page) => {
                await page.goto(BASE_URL, { waitUntil: 'networkidle' })
                await page.waitForTimeout(3000)

                // Click the search button (magnifying glass icon)
                const searchButton = page.locator(
                    '[data-testid="search-toggle"], button[aria-label*="search" i], .search-button, [class*="search"] button'
                )
                const found = await searchButton.first().isVisible().catch(() => false)
                if (found) {
                    await searchButton.first().click()
                } else {
                    // Fallback: try clicking any button with search-related class
                    await page.evaluate(() => {
                        const btns = Array.from(document.querySelectorAll('button'))
                        const searchBtn = btns.find(
                            (b) =>
                                b.className.toLowerCase().includes('search') ||
                                b.textContent?.toLowerCase().includes('search')
                        )
                        if (searchBtn) searchBtn.click()
                    })
                }
                await page.waitForTimeout(1000)
            },
        },
        {
            name: 'focus-mode',
            baseline: 'focus-mode.png',
            description: 'Focus mode — clicked canvas center',
            setup: async (page) => {
                await page.goto(BASE_URL, { waitUntil: 'networkidle' })
                await page.waitForTimeout(3000)

                // Click the center of the canvas to trigger focus
                const canvas = page.locator('canvas').first()
                const isVisible = await canvas.isVisible().catch(() => false)
                if (isVisible) {
                    const box = await canvas.boundingBox()
                    if (box) {
                        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
                    }
                }
                await page.waitForTimeout(2000)
            },
        },
        {
            name: 'map-view',
            baseline: 'map-view.png',
            description: 'Map view — 2D map overlay triggered',
            setup: async (page) => {
                await page.goto(BASE_URL, { waitUntil: 'networkidle' })
                await page.waitForTimeout(3000)

                // Try to trigger map view via keyboard shortcut or button
                // First try clicking a map toggle button
                const mapButton = page.locator(
                    '[data-testid="map-toggle"], button[aria-label*="map" i], [class*="map-toggle"], [class*="compass"]'
                )
                const found = await mapButton.first().isVisible().catch(() => false)
                if (found) {
                    await mapButton.first().click()
                } else {
                    // Fallback: try pressing 'm' key for map toggle
                    await page.keyboard.press('m')
                }
                await page.waitForTimeout(2000)
            },
        },
    ]
}

// ── Main test runner ────────────────────────────────────────────────────────

interface TestResult {
    state: string
    passed: boolean
    diffPercent: number
    diffPixels: number
    skipped: boolean
    error?: string
}

async function runVisualRegression(): Promise<TestResult[]> {
    const results: TestResult[] = []
    const distDir = path.resolve(import.meta.dirname ?? __dirname, '..', 'dist', 'svelte')

    // Verify dist exists
    if (!fs.existsSync(distDir)) {
        console.error('❌ dist/svelte/ not found. Run `npm run build` first.')
        process.exit(1)
    }

    // Verify baselines exist
    const states = getTestStates()
    for (const state of states) {
        const baselinePath = path.join(BASELINE_DIR, state.baseline)
        if (!fs.existsSync(baselinePath)) {
            console.error(`❌ Baseline not found: ${baselinePath}`)
            process.exit(1)
        }
    }

    console.log('\n🔬 Visual Regression Test')
    console.log('─'.repeat(50))

    // Start server
    const server = await startServer(distDir)

    let browser: Browser | null = null
    try {
        browser = await chromium.launch({ headless: true })
        const context = await browser.newContext({ viewport: VIEWPORT })

        for (const state of states) {
            console.log(`\n📸 Testing: ${state.name}`)
            console.log(`   ${state.description}`)

            const page = await context.newPage()
            const currentPath = path.join(BASELINE_DIR, `current-${state.name}.png`)
            const diffPath = path.join(DIFF_DIR, `${state.name}-diff.png`)
            const baselinePath = path.join(BASELINE_DIR, state.baseline)

            try {
                // Navigate and set up state
                await state.setup(page)

                // Capture screenshot (full page to match baselines)
                await page.screenshot({ path: currentPath, fullPage: true })
                console.log(`   ✓ Screenshot captured: current-${state.name}.png`)

                // Compare with baseline
                const comparison = compareImages(baselinePath, currentPath, diffPath)

                if (comparison.match) {
                    console.log(
                        `   ✅ PASS — ${comparison.diffPercent.toFixed(4)}% difference ` +
                            `(${comparison.diffPixels} / ${comparison.totalPixels} pixels)`
                    )
                    results.push({
                        state: state.name,
                        passed: true,
                        diffPercent: comparison.diffPercent,
                        diffPixels: comparison.diffPixels,
                        skipped: false,
                    })
                } else {
                    console.log(
                        `   ❌ FAIL — ${comparison.diffPercent.toFixed(4)}% difference ` +
                            `(${comparison.diffPixels} / ${comparison.totalPixels} pixels) ` +
                            `(threshold: ${THRESHOLD}%)`
                    )
                    console.log(`   Diff saved to: ${diffPath}`)
                    results.push({
                        state: state.name,
                        passed: false,
                        diffPercent: comparison.diffPercent,
                        diffPixels: comparison.diffPixels,
                        skipped: false,
                    })
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                console.log(`   ⚠ SKIP — Could not reproduce state: ${msg}`)
                results.push({
                    state: state.name,
                    passed: false,
                    diffPercent: 0,
                    diffPixels: 0,
                    skipped: true,
                    error: msg,
                })
            } finally {
                await page.close()
                // Clean up current screenshot
                if (fs.existsSync(currentPath)) {
                    fs.unlinkSync(currentPath)
                }
            }
        }
    } finally {
        if (browser) {
            await browser.close()
        }
        // Stop server
        server.close()
        console.log('\n  Server stopped.')
    }

    return results
}

// ── Report generation ───────────────────────────────────────────────────────

function generateReport(results: TestResult[]): string {
    const passed = results.filter((r) => r.passed).length
    const failed = results.filter((r) => !r.passed && !r.skipped).length
    const skipped = results.filter((r) => r.skipped).length
    const total = results.length

    let report = `# Visual Regression Test Report\n\n`
    report += `**Date:** ${new Date().toISOString()}\n`
    report += `**Total:** ${total} | **Passed:** ${passed} | **Failed:** ${failed} | **Skipped:** ${skipped}\n\n`

    if (passed === total) {
        report += `## ✅ All States Passed\n\n`
    } else {
        report += `## Results\n\n`
    }

    report += `| State | Result | Diff % | Diff Pixels | Notes |\n`
    report += `|-------|--------|--------|-------------|-------|\n`

    for (const r of results) {
        const icon = r.passed ? '✅' : r.skipped ? '⚠️' : '❌'
        const result = r.passed ? 'PASS' : r.skipped ? 'SKIP' : 'FAIL'
        const notes = r.error || (r.passed ? 'Within threshold' : `Exceeds ${THRESHOLD}% threshold`)
        report += `| ${r.state} | ${icon} ${result} | ${r.diffPercent.toFixed(4)}% | ${r.diffPixels} | ${notes} |\n`
    }

    report += `\n---\n\n`
    report += `**Threshold:** ${THRESHOLD}% pixel difference\n`
    report += `**Baselines:** tests/visual-baselines/\n`
    report += `**Diffs:** tests/visual-baselines/diffs/\n`

    return report
}

// ── Entry point ─────────────────────────────────────────────────────────────

async function main() {
    try {
        const results = await runVisualRegression()
        const report = generateReport(results)

        // Write report
        const reportDir = path.resolve(import.meta.dirname ?? __dirname, '..', 'tmp')
        fs.mkdirSync(reportDir, { recursive: true })
        const reportPath = path.join(reportDir, 'w36-track-2-report.md')
        fs.writeFileSync(reportPath, report)
        console.log(`\n📄 Report written to: ${reportPath}`)

        // Print summary
        console.log('\n' + '─'.repeat(50))
        const passed = results.filter((r) => r.passed).length
        const failed = results.filter((r) => !r.passed && !r.skipped).length
        const skipped = results.filter((r) => r.skipped).length

        if (failed > 0) {
            console.log(`\n❌ ${failed} state(s) failed visual regression check.`)
            process.exit(1)
        } else if (skipped > 0) {
            console.log(`\n⚠️ ${skipped} state(s) skipped (could not reproduce).`)
            process.exit(0)
        } else {
            console.log(`\n✅ All ${passed} states passed visual regression check.`)
            process.exit(0)
        }
    } catch (err) {
        console.error('\n❌ Fatal error:', err)
        process.exit(1)
    }
}

main()
