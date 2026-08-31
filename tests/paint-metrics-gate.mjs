#!/usr/bin/env node
/**
 * tests/paint-metrics-gate.mjs
 *
 * Paint-metrics drift gate — enforces LCP / FCP / CLS / TTFB against frozen
 * budgets so first-paint regressions can no longer ship silently.
 *
 * Canonical run (must match the rendering path budgets were frozen on):
 *   SEMANTIC_USE_D3D11=1 node tests/paint-metrics-gate.mjs
 *
 * Budget policy (docs/performance-budget.md §Core Web Vitals):
 *   Budgets are ANTI-DRIFT FREEZES taken from a measured baseline run
 *   (docs/paint-metrics-baseline-*.json), with headroom for run-to-run
 *   variance. They are NOT the aspirational CWV targets — the gap between
 *   the freeze and the CWV target (e.g. LCP < 2.5s) is documented debt.
 *   Budgets may be RATCHETED DOWN any time; ratcheting UP requires a new
 *   measured baseline artifact + a commit message that names the cause.
 *
 * Exit 0 if within budget, exit 1 if exceeded (or if the app never paints).
 *
 * PROTOCOLS — first-paint numbers on this box are BIMODAL (measured 2026-08-30:
 * cold LCP 6764ms vs warm LCP 2428ms — OS file cache, GPU shader cache, and
 * Defender scans dominate). One budget cannot govern both regimes honestly,
 * so the gate pins two explicit protocols:
 *   cold (default): fresh daemon + fresh dist, first navigation measured.
 *                   Catches catastrophic + bundle-size regressions.
 *   --warm:         throwaway warm-up navigation first, then a FRESH context
 *                   is measured (new-visitor-on-warm-box). Catches perf-code
 *                   drift during optimization work. Budgets are tight.
 */

import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const TARGET_URL = process.env.PAINT_GATE_URL || null // resolved after server ensure

// Budgets frozen 2026-08-30 (baseline: docs/paint-metrics-baseline-2026-08-30.json,
// headed + D3D11, desktop 1280x800, managed qa-server). Headroom = measured +15%.
const PROTOCOL = process.argv.includes('--warm') ? 'warm' : 'cold'
const BUDGETS = {
    cold: {
        lcpMs: 7780, // measured 6764 (first nav after fresh daemon + fresh dist)
        fcpMs: 2830, // measured 2460
        cls: 0.1, // measured 0 (CWV cap)
        ttfbMs: 2400 // measured 2048 cold (server/OS warm-up noise, not network)
    },
    warm: {
        lcpMs: 2800, // measured 2428
        fcpMs: 1100, // measured 952
        cls: 0.1,
        ttfbMs: 700 // measured 541 (n=1 — revisit when n>3)
    }
}
const BUDGET = BUDGETS[PROTOCOL]

const headed = !process.env.PW_HEADLESS && !process.env.PLAYWRIGHT_HEADLESS
const forceSoftwareWebgl = process.env.SEMANTIC_FORCE_WEBGL_SOFTWARE === '1'
const launchOptions = {
    headless: !headed,
    args: headed
        ? [
              '--ignore-gpu-blocklist',
              '--use-gl=angle',
              '--enable-webgl',
              ...(process.platform === 'win32' && process.env.SEMANTIC_USE_D3D11 === '1' ? ['--use-angle=d3d11'] : []),
              ...(forceSoftwareWebgl ? ['--enable-unsafe-swiftshader', '--enable-webgl-software-rendering'] : [])
          ]
        : [
              ...(forceSoftwareWebgl
                  ? [
                        '--ignore-gpu-blocklist',
                        '--use-gl=angle',
                        '--enable-webgl',
                        '--enable-unsafe-swiftshader',
                        '--enable-webgl-software-rendering'
                    ]
                  : [])
          ]
}

/**
 * Ensure a qa-server-managed static server is serving the built app.
 * Returns { port } to build the measurement URL from.
 *
 * Port 8795 may legitimately be occupied by the unmanaged live-API PHP server
 * (php -S 127.0.0.1:8795 -t ., see docs/search-fallback.md). PHP cannot serve
 * the .br/.gz-only data twins in dist/svelte/data/ (2026-08-21 dist-integrity
 * trap), so measuring against it would corrupt LCP. In that case the gate
 * starts its own managed server on port 8798 instead (8796/8797 are the
 * Playwright webServer + fleet lanes — see docs/dev-commands.md port rule).
 */
function ensureServer() {
    if (TARGET_URL) return { port: null } // explicit URL: caller owns serving
    const explicitPort = process.env.QA_SERVER_PORT
    const run = (port) =>
        spawnSync(process.execPath, ['scripts/qa-server.mjs', 'ensure'], {
            stdio: 'inherit',
            env: port ? { ...process.env, QA_SERVER_PORT: String(port) } : process.env
        })
    if (run(explicitPort).status === 0) return { port: Number(explicitPort) || 8795 }
    if (explicitPort) {
        console.error(`qa-server ensure failed on requested port ${explicitPort} — aborting.`)
        process.exit(1)
    }
    console.warn('[paint-gate] 8795 occupied by an unmanaged server (live-API PHP?) — measuring on managed port 8798.')
    if (run(8798).status !== 0) {
        console.error('qa-server ensure failed on fallback port 8798 — cannot measure paint metrics.')
        process.exit(1)
    }
    return { port: 8798 }
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms))
}

async function waitForStableLcp(page, capMs = 12000) {
    const start = Date.now()
    let last = -1
    let stable = 0
    while (Date.now() - start < capMs) {
        const cur = await page.evaluate(() => window.__PAINT_METRICS__?.lcpMs ?? 0)
        if (cur > 0 && cur === last) {
            stable += 1
            if (stable >= 2) return cur
        } else {
            stable = 0
        }
        last = cur
        await sleep(400)
    }
    return last
}

async function main() {
    const { port } = ensureServer()
    const targetUrl = TARGET_URL || `http://127.0.0.1:${port ?? 8795}/dist/svelte/index.html`
    const bootUrl = (() => {
        const next = new URL(targetUrl)
        next.searchParams.set('nodemo', '1')
        next.searchParams.set('contract-boot', '1')
        return next.toString()
    })()

    const browser = await chromium.launch(launchOptions)
    try {
        if (PROTOCOL === 'warm') {
            // Throwaway warm-up: populates OS/shader caches so the measured
            // context below represents new-visitor-on-warm-box.
            const warm = await browser.newContext({ viewport: { width: 1280, height: 800 } })
            const warmPage = await warm.newPage()
            await warmPage.goto(bootUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {})
            await warmPage.waitForTimeout(4000) // no observer here — fixed warm-up window
            await warm.close()
            console.log('[paint-gate] warm-up navigation complete — measuring fresh context')
        }
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
        await context.addInitScript(() => {
            window.__PAINT_METRICS__ = { lcpMs: 0, fcpMs: 0, cls: 0, ttfbMs: 0 }
            const { PerformanceObserver } = globalThis
            try {
                new PerformanceObserver((list) => {
                    const entries = list.getEntries()
                    if (entries.length) {
                        window.__PAINT_METRICS__.lcpMs = entries[entries.length - 1].startTime
                    }
                }).observe({ type: 'largest-contentful-paint', buffered: true })
                new PerformanceObserver((list) => {
                    for (const e of list.getEntries()) {
                        if (e.name === 'first-contentful-paint') window.__PAINT_METRICS__.fcpMs = e.startTime
                    }
                }).observe({ type: 'paint', buffered: true })
                new PerformanceObserver((list) => {
                    for (const e of list.getEntries()) {
                        if (!e.hadRecentInput) window.__PAINT_METRICS__.cls += e.value
                    }
                }).observe({ type: 'layout-shift', buffered: true })
            } catch {
                // PerformanceObserver entry types unavailable in this engine — metrics stay 0
            }
            window.addEventListener('load', () => {
                const nav = performance.getEntriesByType('navigation')[0]
                if (nav) window.__PAINT_METRICS__.ttfbMs = nav.responseStart
            })
        })

        const page = await context.newPage()
        await page.goto(bootUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })

        // Soft-settle: wait for graph reveal like the visual audit, but never
        // hard-fail the run on settle checks — paint numbers are the evidence.
        await page
            .waitForFunction(
                () => {
                    const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
                    if (document.body.dataset.graphicsMode === 'fallback') return true
                    const pointCount = state.pointsMesh?.geometry?.attributes?.position?.count || 0
                    return pointCount > 0
                },
                { timeout: 15000 }
            )
            .catch(() => console.warn('[paint-gate] graph settle not confirmed — proceeding with paint numbers'))

        const lcpMs = await waitForStableLcp(page)
        const m = await page.evaluate(() => window.__PAINT_METRICS__)
        m.lcpMs = lcpMs || m.lcpMs
        await browser.close()

        const rendering = headed ? (process.env.SEMANTIC_USE_D3D11 === '1' ? 'headed + D3D11' : 'headed') : 'headless'
        const metrics = [
            { label: 'LCP (ms)', actual: m.lcpMs, budget: BUDGET.lcpMs },
            { label: 'FCP (ms)', actual: m.fcpMs, budget: BUDGET.fcpMs },
            { label: 'CLS', actual: m.cls, budget: BUDGET.cls },
            { label: 'TTFB (ms)', actual: m.ttfbMs, budget: BUDGET.ttfbMs }
        ]

        console.log(`\nPaint metrics gate — ${PROTOCOL} protocol, ${rendering}, desktop 1280x800, ${bootUrl}\n`)
        console.log('  Metric       Actual      Budget      Delta       Status')
        console.log('  ─────────────────────────────────────────────────────────')
        let allPassed = true
        for (const k of metrics) {
            const passed = Number.isFinite(k.actual) && k.actual > 0 && k.actual <= k.budget
            if (!passed) allPassed = false
            const delta = Number.isFinite(k.actual) ? k.actual - k.budget : NaN
            console.log(
                `  ${k.label.padEnd(12)} ${String(Math.round(k.actual * 100) / 100).padEnd(11)} ` +
                    `${String(k.budget).padEnd(11)} ${String(Math.round(delta * 100) / 100).padEnd(11)} ` +
                    `${passed ? '✓ PASS' : '✗ FAIL'}`
            )
        }
        console.log('')

        const outDir = path.resolve('tmp')
        await mkdir(outDir, { recursive: true })
        await writeFile(
            path.join(outDir, 'paint-metrics-last.json'),
            JSON.stringify(
                {
                    timestamp: new Date().toISOString(),
                    protocol: PROTOCOL,
                    rendering,
                    viewport: '1280x800',
                    url: bootUrl,
                    metrics: m,
                    budgets: BUDGET,
                    passed: allPassed
                },
                null,
                2
            )
        )

        if (m.lcpMs <= 0) {
            console.error('✗ No LCP recorded — app never painted. Not a budget failure; investigate boot.')
            process.exit(1)
        }
        if (allPassed) {
            console.log('  ✓ PAINT METRICS WITHIN BUDGET (details: tmp/paint-metrics-last.json)\n')
            process.exit(0)
        }
        console.log(
            '  ✗ PAINT BUDGET EXCEEDED — budgets are anti-drift freezes (docs/performance-budget.md).\n' +
                '    Fix the regression, or ratchet UP only with a new measured baseline artifact + commit naming the cause.\n'
        )
        process.exit(1)
    } finally {
        await browser.close().catch(() => {})
    }
}

main().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
})
