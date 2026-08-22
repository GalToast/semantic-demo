/**
 * reduced-motion-interruption-sweep.mjs
 *
 * Consolidated sweep: merges reduced-motion-interruption-contract.mjs +
 * reduced-motion-interruption.spec.js + reduced-motion-interruption-proof.spec.js
 * (W2 Phase 3+4). Proves state-consistency for the reduced-motion path:
 * search/focus → Step Inside → interruption/recovery.
 *
 * Sweep sources (loc before/after):
 *   tests/reduced-motion-interruption-contract.mjs      587 LOC
 *   tests/reduced-motion-interruption.spec.js            309 LOC
 *   tests/reduced-motion-interruption-proof.spec.js      116 LOC
 *   Total originals: 1,012 LOC → ~580 LOC in this sweep
 *
 * The mobile-viewport device-emulation test from proof.spec.js is preserved
 * as a second browser context within the same run.
 *
 * Pass-fail criterion: exit 0 = no violations; exit 1 + error messages = fail.
 */

import { createServer } from 'node:http'
import { readFileSync, mkdirSync } from 'node:fs'
import { resolve, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const forceSoftwareWebgl = process.env.SEMANTIC_FORCE_WEBGL_SOFTWARE === '1'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ROOT = resolve(__dirname, '..')
const HTML_FILE = 'dist/svelte/index.html'
const OUT_DIR = resolve(ROOT, 'tmp', 'reduced-motion-interruption-proof')

const MIME = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.ts': 'application/javascript',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.br': 'application/octet-stream',
    '.gz': 'application/octet-stream',
    '.dat': 'application/octet-stream'
}

// ── HTTP server ────────────────────────────────────────────────────────────────

function startServer() {
    return new Promise((resolve) => {
        const server = createServer((req, res) => {
            let urlPath = req.url.split('?')[0]
            if (urlPath === '/' || !extname(urlPath)) {
                urlPath = `/${HTML_FILE}`
            }
            const isFullDistPath = urlPath.startsWith(`/${HTML_FILE.split('/')[0]}/`)
            const base = isFullDistPath ? ROOT : join(ROOT, 'dist', 'svelte')
            const filePath = join(base, urlPath.replace(/^\//, '').replace(/^dist\//, ''))
            try {
                const data = readFileSync(filePath)
                const ext = extname(filePath)
                res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' })
                res.end(data)
            } catch {
                res.writeHead(404)
                res.end('Not found')
            }
        })
        server.listen(0, '127.0.0.1', () => {
            const actualPort = server.address().port
            resolve({ server, port: actualPort })
        })
    })
}

// ── Page helpers ───────────────────────────────────────────────────────────────

async function waitForReady(page) {
    await page.waitForLoadState('domcontentloaded', { timeout: 8000 }).catch(() => {})
    await page
        .waitForFunction(
            () => {
                const canvas = document.querySelector('#canvas-container canvas')
                // 1fe9c8d0 moved data-graphics-mode from <body> to #canvas-container.
                return (
                    document.querySelector('#canvas-container')?.dataset?.graphicsMode === 'webgl' &&
                    canvas &&
                    window.__TEST_STATE__?.renderer &&
                    window.__TEST_STATE__?.scene &&
                    window.__TEST_STATE__?.camera &&
                    window.__TEST_STATE__?.pointsMesh?.geometry?.attributes?.position?.count > 0
                )
            },
            { timeout: 12000 }
        )
        .catch(() => {})
    await page
        .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 })
        .catch(() => {})
}

async function executeSearch(page, term) {
    await page.fill('#search-input', term)
    await page
        .waitForFunction(() => window.__TEST_STATE__?.currentSearchSummary?.query != null, { timeout: 8000 })
        .catch(() => {})
    await page.focus('#search-input')
    await page.keyboard.press('Enter')
    await page
        .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 })
        .catch(() => {})
}

async function clearSearch(page) {
    const focused = await page.evaluate(() => {
        const input = document.getElementById('search-input')
        if (!input) return false
        input.focus()
        return true
    })
    if (focused) {
        await page.keyboard.press('Escape')
        await page
            .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 })
            .catch(() => {})
    }
}

async function collectState(page) {
    return page.evaluate(() => {
        const body = document.body?.dataset || {}
        const focusStage = document.getElementById('focus-stage')
        const searchResults = document.getElementById('search-results')
        const searchInput = document.getElementById('search-input')
        const s = window.__TEST_STATE__ || {}
        return {
            searchGlow: body.searchGlow,
            graphContext: body.graphContext,
            panelSurface: body.panelSurface,
            panelSurfaceDetail: body.panelSurfaceDetail,
            focusTransition: body.focusTransition,
            focusTransitionPhase: body.focusTransitionPhase,
            semanticDive: body.semanticDive,
            routeMotion: body.routeMotion,
            focusStageHidden: focusStage?.hidden ?? true,
            focusStageActive: focusStage?.classList?.contains('active') ?? false,
            searchResultsActive: searchResults?.classList?.contains('active') ?? false,
            searchInputValue: searchInput?.value ?? '',
            js: {
                currentSearchSummary: s.currentSearchSummary ? 'present' : null,
                focusedNode: s.focusedNode,
                selectedPoint: s.selectedPoint ? 'present' : null,
                navStateMode: s.navState?.mode,
                trailDepth: s.trailDepth,
                searchGlowActive: s.searchState?.searchGlowActive,
                focusTransitionMode: s.focusState?.focusTransitionMode,
                cameraAssist: body.cameraAssist
            }
        }
    })
}

// ── Assertion helpers ──────────────────────────────────────────────────────────

function assertEqual(actual, expected, label) {
    if (actual !== expected) {
        throw new Error(`ASSERTION FAILED [${label}]: expected "${expected}", got "${actual}"`)
    }
}

function assertNotNull(value, label) {
    if (value === null || value === undefined) {
        throw new Error(`ASSERTION FAILED [${label}]: expected non-null value, got ${value}`)
    }
}

// ── Test sequence (shared across viewports) ────────────────────────────────────

async function runTestSequence(page, viewportLabel) {
    const failures = []
    const passes = []

    function record(name, ok, detail = '') {
        if (ok) {
            passes.push(`${viewportLabel}: ${name}`)
        } else {
            failures.push({ name: `${viewportLabel}: ${name}`, detail })
        }
    }

    // ── Phase 1: Baseline ────────────────────────────────────────────────────
    const baseline = await collectState(page)
    record(
        'baseline: searchGlow is inactive',
        !baseline.searchGlow || baseline.searchGlow === 'inactive',
        `got ${baseline.searchGlow}`
    )
    record('baseline: graphContext is idle', baseline.graphContext === 'idle', `got ${baseline.graphContext}`)
    record('baseline: panelSurface is idle', baseline.panelSurface === 'idle', `got ${baseline.panelSurface}`)
    record(
        'baseline: focusStage is not active (idle)',
        baseline.focusStageActive === false,
        `active=${baseline.focusStageActive}`
    )
    record(
        'baseline: currentSearchSummary null',
        baseline.js.currentSearchSummary === null,
        `got ${baseline.js.currentSearchSummary}`
    )
    record('baseline: focusedNode null', baseline.js.focusedNode === null, `got ${baseline.js.focusedNode}`)

    // ── Phase 2: Search → Focus via REAL UI interaction ─────────────────────
    const searchChip = page.locator('.mode-chip[data-mode="search"]')
    await searchChip.waitFor({ state: 'visible', timeout: 15000 })
    await searchChip.click({ force: true })

    const searchInput = page.locator('#search-input').first()
    await searchInput.waitFor({ state: 'visible', timeout: 20000 })
    await searchInput.fill('coffee')
    await page.waitForFunction(() => document.querySelectorAll('.search-result-item').length >= 1, null, {
        timeout: 25000,
        polling: 100
    })

    const firstResult = page.locator('.search-result-item button, [id^="search-result-"] button').first()
    await firstResult.waitFor({ state: 'visible', timeout: 10000 })
    await firstResult.click({ force: true })

    await page
        .waitForFunction(() => ['focus', 'focus-search'].includes(document.body.dataset.panelSurface), null, {
            timeout: 20000,
            polling: 100
        })
        .catch(() => {})
    await page
        .waitForFunction(
            () =>
                parseInt(document.body.dataset.focusTransitionPhase ?? '-1', 10) >= 3 ||
                document.body.dataset.focusTransition === 'idle',
            null,
            { timeout: 12000, polling: 100 }
        )
        .catch(() => {})
    await page.waitForTimeout(350)
    const afterSearch = await collectState(page)
    record(
        'search: results rendered (search settled)',
        afterSearch.js.currentSearchSummary === 'present',
        `summary=${afterSearch.js.currentSearchSummary} glow=${afterSearch.searchGlow}`
    )
    record(
        'search: graphContext reflects focus',
        ['focus', 'focus-search'].includes(afterSearch.graphContext),
        `got ${afterSearch.graphContext}`
    )
    record(
        'search: panelSurface reflects focus',
        ['focus', 'focus-search'].includes(afterSearch.panelSurface),
        `got ${afterSearch.panelSurface}`
    )
    record(
        'search: currentSearchSummary present',
        afterSearch.js.currentSearchSummary === 'present',
        `got ${afterSearch.js.currentSearchSummary}`
    )
    record(
        'search: focusedNode is set',
        afterSearch.js.focusedNode !== null && afterSearch.js.focusedNode !== undefined,
        `got ${afterSearch.js.focusedNode}`
    )
    record(
        'search: navState.mode is focus',
        afterSearch.js.navStateMode === 'focus',
        `got ${afterSearch.js.navStateMode}`
    )
    record('search: trailDepth >= 1', afterSearch.js.trailDepth >= 1, `got ${afterSearch.js.trailDepth}`)
    record(
        'search: focusTransition is idle',
        afterSearch.js.focusTransitionMode === 'idle',
        `got ${afterSearch.js.focusTransitionMode}`
    )

    // ── Phase 3: Step Inside via real Inside-mode chip ───────────────────────
    const insideChip = page.locator('.mode-chip[data-mode="inside"]')
    try {
        await insideChip.waitFor({ state: 'visible', timeout: 10000 })
        await insideChip.click({ force: true })
        await page
            .waitForFunction(() => document.body.dataset.panelSurface === 'semantic-dive', null, {
                timeout: 15000,
                polling: 100
            })
            .catch(() => {})
    } catch {
        // Inside may be locked without a selection in some boot paths.
    }

    await page
        .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 })
        .catch(() => {})
    const afterFocus = await collectState(page)
    record('step-inside: trailDepth is 2', afterFocus.js.trailDepth === 2, `got ${afterFocus.js.trailDepth}`)
    record(
        'step-inside: navState.mode is inside',
        afterFocus.js.navStateMode === 'inside',
        `got ${afterFocus.js.navStateMode}`
    )
    record(
        'step-inside: focusedNode still set',
        afterFocus.js.focusedNode !== null && afterFocus.js.focusedNode !== undefined,
        `got ${afterFocus.js.focusedNode}`
    )
    record(
        'step-inside: panelSurface consistent',
        ['focus', 'focus-search', 'semantic-dive'].includes(afterFocus.panelSurface),
        `got ${afterFocus.panelSurface}`
    )
    record(
        'step-inside: cameraAssist not stuck',
        afterFocus.js.cameraAssist !== 'arriving' || afterFocus.focusTransition !== 'arriving',
        `cameraAssist=${afterFocus.js.cameraAssist} focusTransition=${afterFocus.focusTransition}`
    )

    // ── Phase 4: Interruption — real Escape (app-level clear) ────────────────
    await page.keyboard.press('Escape')
    await page
        .waitForFunction(() => document.body.dataset.panelSurface === 'idle', null, {
            timeout: 15000,
            polling: 100
        })
        .catch(() => {})

    const overviewChip = page.locator('.mode-chip[data-mode="overview"]')
    try {
        await overviewChip.waitFor({ state: 'visible', timeout: 6000 })
        await overviewChip.click({ force: true })
        await page
            .waitForFunction(() => document.body.dataset.graphContext === 'idle', null, {
                timeout: 12000,
                polling: 100
            })
            .catch(() => {})
    } catch {
        // Overview chip may be covered in focus-search.
    }

    await page
        .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 })
        .catch(() => {})
    const afterInterrupt = await collectState(page)
    record(
        'interrupt: searchGlow is inactive',
        afterInterrupt.searchGlow === 'inactive',
        `got ${afterInterrupt.searchGlow}`
    )
    record(
        'interrupt: currentSearchSummary null',
        afterInterrupt.js.currentSearchSummary === null,
        `got ${afterInterrupt.js.currentSearchSummary}`
    )
    record('interrupt: trailDepth is 0', afterInterrupt.js.trailDepth === 0, `got ${afterInterrupt.js.trailDepth}`)
    record(
        'interrupt: focusedNode null',
        afterInterrupt.js.focusedNode === null,
        `got ${afterInterrupt.js.focusedNode}`
    )
    record(
        'interrupt: navState.mode is overview',
        afterInterrupt.js.navStateMode === 'overview',
        `got ${afterInterrupt.js.navStateMode}`
    )
    record(
        'interrupt: graphContext is idle',
        afterInterrupt.graphContext === 'idle',
        `got ${afterInterrupt.graphContext}`
    )
    record(
        'interrupt: panelSurface is idle',
        afterInterrupt.panelSurface === 'idle',
        `got ${afterInterrupt.panelSurface}`
    )
    record(
        'interrupt: focusStage not active after reset',
        afterInterrupt.focusStageActive === false,
        `got active=${afterInterrupt.focusStageActive}`
    )
    record(
        'interrupt: searchResults inactive',
        afterInterrupt.searchResultsActive === false,
        `got ${afterInterrupt.searchResultsActive}`
    )
    record(
        'interrupt: searchInput cleared',
        afterInterrupt.searchInputValue === '' || afterInterrupt.searchInputValue == null,
        `got "${afterInterrupt.searchInputValue}"`
    )

    return { failures, passes }
}

// ── Mobile viewport proof (from proof.spec.js) ────────────────────────────────

async function runMobileProof(page) {
    const failures = []
    const passes = []

    // Collect page errors + console errors for the diagnostic dump.
    const pageErrors = []
    page.on('pageerror', (err) => pageErrors.push(String(err?.message ?? err)))
    page.on('console', (msg) => {
        if (msg.type() === 'error') pageErrors.push(`console.${msg.type()}: ${msg.text()}`)
    })

    function record(name, ok, detail = '') {
        if (ok) {
            passes.push(`mobile: ${name}`)
        } else {
            failures.push({ name: `mobile: ${name}`, detail })
        }
    }

    await page.addInitScript(() => {
        window.__PLAYWRIGHT__ = true
    })
    // Use same path as desktop server — the sweep server resolves /index.html
    // against dist/svelte/. Using /dist/svelte/index.html would hit the ROOT
    // base and look for svelte/index.html which does not exist.
    const url = `http://127.0.0.1:${globalThis._sweepPort}/index.html?nodemo=1`
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    // Use a lenient readiness check for mobile (matches proof.spec.js): only
    // require graphicsMode=webgl + canvas + pointsMesh, not the full __TEST_STATE__.
    await page.waitForFunction(
        () =>
            // 1fe9c8d0 moved data-graphics-mode from <body> to #canvas-container.
            document.querySelector('#canvas-container')?.dataset?.graphicsMode === 'webgl' &&
            document.querySelector('#canvas-container canvas') &&
            (window.__APP_STATE__ || window.__TEST_STATE__)?.pointsMesh,
        null,
        // polling:100 — rAF-polling starves under WebGL load (same class as the
        // sweep-driver mobile-proof + widget-journey fixes).
        { timeout: 30000, polling: 100 }
    )

    // Verify baseline
    await page.waitForFunction(
        () => {
            const canvas = document.querySelector('#canvas-container canvas')
            // 1fe9c8d0 moved data-graphics-mode from <body> to #canvas-container.
            return document.querySelector('#canvas-container')?.dataset?.graphicsMode === 'webgl' && canvas
        },
        null,
        { timeout: 60000, polling: 100 }
    )

    // Mobile: search and focus
    const input = page.locator('#search-input')
    await input.focus()
    await input.fill('restaurant')
    // Boot-race guard: a late init task can clear the input right after
    // pointsMesh appears; typing+Enter inside that window silently no-ops
    // (Enter reads empty $state). Wait until the value actually sticks.
    await page
        .waitForFunction(() => document.getElementById('search-input')?.value === 'restaurant', null, {
            timeout: 8000,
            polling: 100
        })
        .catch(async () => {
            await input.fill('restaurant')
        })
    await page.waitForTimeout(400)
    await page.keyboard.press('Enter')

    // Bounded retry: a delayed background reset (threads .dat / api.php probe /
    // semantic-lane reconnect cycles fire seconds after boot when serving from
    // static dist without PHP) can wipe the typed query between fill and Enter.
    // Re-fill + re-Enter up to 3× until results render. DOM-truth probe
    // (tmp/mobile-enter-probe.mjs) proves the flow itself works end-to-end.
    const enterDeadline = Date.now() + 25000
    let attempts = 0
    while (Date.now() < enterDeadline) {
        attempts++
        const gotResults = await page
            .waitForFunction(() => document.querySelectorAll('.search-result-item').length > 0, null, {
                timeout: 6000,
                polling: 100
            })
            .then(() => true)
            .catch(() => false)
        if (gotResults) break
        if (attempts > 3) break
        const cur = await page.evaluate(() => document.getElementById('search-input')?.value ?? '')
        await page.locator('#search-input').fill(cur || 'restaurant')
        await page.waitForTimeout(500)
        await page.keyboard.press('Enter')
    }
    // Diagnostic: capture why results fail to render (console + DOM + shot).
    await page.waitForTimeout(5000)
    const mobileDiag = await page
        .evaluate(() => {
            const input = document.querySelector('#search-input')
            const r = input?.getBoundingClientRect()
            const cx = r ? r.left + r.width / 2 : 0
            const cy = r ? r.top + r.height / 2 : 0
            const topEl = cx && cy ? document.elementFromPoint(cx, cy) : null
            return {
                resultItems: document.querySelectorAll('.search-result-item').length,
                resultsContainerHtmlLen:
                    (document.querySelector('.search-results') ?? document.querySelector('[class*=result]'))?.innerHTML
                        ?.length ?? -1,
                panelSurface: document.body.dataset.panelSurface,
                searchStatus: document.body.dataset.searchStatus ?? null,
                hasErrorCard: !!document.querySelector('.search-error, [class*=error-card]'),
                inputState: input ? { disabled: input.disabled, readOnly: input.readOnly, value: input.value } : null,
                topElementAtInput: topEl ? `${topEl.tagName}.${String(topEl.className).slice(0, 60)}` : null,
                topIsInputItself: topEl === input,
                visibleDialogs: [
                    ...document.querySelectorAll('dialog, [role=dialog], .sheet, [class*=overlay], [class*=veil]')
                ]
                    .filter((el) => {
                        const s = getComputedStyle(el)
                        return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0
                    })
                    .map((el) => `${el.tagName}.${String(el.className).slice(0, 50)}`)
                    .slice(0, 6)
            }
        })
        .catch((e) => ({ diagError: String(e) }))
    console.log('[sweep] mobile diag after Enter:', JSON.stringify(mobileDiag))
    if (pageErrors.length) console.log('[sweep] mobile page/console errors:', JSON.stringify(pageErrors.slice(0, 8)))
    await page.screenshot({ path: OUT_DIR + '/rmi-mobile-after-enter.png' }).catch(() => {})
    await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 15000, polling: 100 })

    const first = page.locator('.search-result-item').first()
    await first.click({ force: true })
    await page.waitForFunction(
        () =>
            document.body.dataset.panelSurface === 'focus-search' &&
            (window.__APP_STATE__ || window.__TEST_STATE__)?.focusedNode !== null,
        null,
        { timeout: 12000, polling: 100 }
    )

    const surface = await page.evaluate(() => document.body.dataset.panelSurface)
    record('mobile: panelSurface is focus-search', surface === 'focus-search', `got ${surface}`)

    // Mobile: Step Inside via dive button
    const diveBtn = page.locator('#btn-focus-dive')
    await diveBtn.waitFor({ state: 'visible', timeout: 10000 })
    await diveBtn.click({ force: true })

    await page.waitForFunction(() => (window.__APP_STATE__ ?? window.__TEST_STATE__)?.semanticDiveMode === true, null, {
        timeout: 8000,
        polling: 100
    })
    record('mobile: semanticDiveMode is true after dive click', true, '')

    // Mobile: Interrupt via Escape and verify clean recovery
    await page.keyboard.press('Escape')
    await page.waitForFunction(
        () => document.body.dataset.panelSurface === 'idle' && document.body.dataset.semanticDive === 'inactive',
        null,
        { timeout: 12000, polling: 100 }
    )

    const finalState = await page.evaluate(() => {
        const s = window.__APP_STATE__ || window.__TEST_STATE__
        return {
            mode: s.navState.mode,
            diveMode: s.semanticDiveMode,
            panelSurface: document.body.dataset.panelSurface
        }
    })
    record('mobile: mode is overview after interrupt', finalState.mode === 'overview', `got ${finalState.mode}`)
    record('mobile: diveMode is false after interrupt', finalState.diveMode === false, `got ${finalState.diveMode}`)
    record(
        'mobile: panelSurface is idle after interrupt',
        finalState.panelSurface === 'idle',
        `got ${finalState.panelSurface}`
    )

    return { failures, passes }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
    mkdirSync(OUT_DIR, { recursive: true })

    const { server, port } = await startServer()
    globalThis._sweepPort = port // shared across both viewports

    const browser = await chromium.launch({
        headless: false,
        args: [
            '--use-gl=angle',
            '--enable-webgl',
            '--no-sandbox',
            ...(forceSoftwareWebgl ? ['--enable-unsafe-swiftshader', '--enable-webgl-software-rendering'] : []),
            ...(process.env.SEMANTIC_USE_D3D11 === '1' ? ['--use-angle=d3d11'] : [])
        ]
    })

    // Desktop viewport (from contract.mjs)
    const desktopContext = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        reducedMotion: 'reduce'
    })
    const desktopPage = await desktopContext.newPage()
    await desktopPage.addInitScript(() => {
        window.__PLAYWRIGHT__ = true
    })
    const url = `http://127.0.0.1:${port}/index.html?nodemo=1`
    await desktopPage.goto(url, { waitUntil: 'commit', timeout: 15000 })
    await waitForReady(desktopPage)

    const desktopResult = await runTestSequence(desktopPage, 'desktop')

    // Mobile viewport (from proof.spec.js) — run in a SEPARATE browser to avoid
    // context pollution from the desktop run. The original proof.spec.js launches
    // its own browser; we replicate that here.
    const mobileBrowser = await chromium.launch({
        headless: false,
        args: [
            '--use-gl=angle',
            '--enable-webgl',
            '--no-sandbox',
            ...(forceSoftwareWebgl ? ['--enable-unsafe-swiftshader', '--enable-webgl-software-rendering'] : []),
            ...(process.env.SEMANTIC_USE_D3D11 === '1' ? ['--use-angle=d3d11'] : [])
        ]
    })
    const mobileContext = await mobileBrowser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        reducedMotion: 'reduce'
    })
    const mobilePage = await mobileContext.newPage()
    // Harness hardening: a mobile-section throw must NOT destroy the desktop
    // results — twice the sweep died at the mobile wait and the report block
    // (which holds the only record() output) never executed.
    let mobileResult
    try {
        mobileResult = await runMobileProof(mobilePage)
    } catch (err) {
        console.error('[sweep] mobile section threw (desktop results preserved):', err?.message ?? err)
        mobileResult = {
            passes: [],
            failures: [{ check: 'mobile: section completed', pass: false, detail: String(err?.message ?? err) }]
        }
    }
    await mobileBrowser.close().catch(() => {})

    await browser.close()
    server.close()

    // ── Report ───────────────────────────────────────────────────────────────
    const allPasses = [...desktopResult.passes, ...mobileResult.passes]
    const allFailures = [...desktopResult.failures, ...mobileResult.failures]
    const total = allPasses.length + allFailures.length
    const allPassed = allFailures.length === 0

    console.log(`\n=== reduced-motion-interruption-sweep ===`)
    console.log(
        `Desktop: ${desktopResult.passes.length}/${desktopResult.passes.length + desktopResult.failures.length} passed`
    )
    console.log(
        `Mobile:  ${mobileResult.passes.length}/${mobileResult.passes.length + mobileResult.failures.length} passed`
    )
    console.log(`Total:   ${allPasses.length}/${total} passed`)

    if (allFailures.length > 0) {
        console.log(`\nFAILURES (${allFailures.length}):`)
        for (const f of allFailures) {
            console.log(`  ✗ ${f.name}${f.detail ? ` — ${f.detail}` : ''}`)
        }
    }

    const report = {
        timestamp: new Date().toISOString(),
        overall: allPassed ? 'PASS' : 'FAIL',
        passes: allPasses.length,
        failures: allFailures.length,
        failureDetails: allFailures,
        desktop: {
            pass: desktopResult.passes.length,
            fail: desktopResult.failures.length,
            passes: desktopResult.passes,
            failures: desktopResult.failures
        },
        mobile: {
            pass: mobileResult.passes.length,
            fail: mobileResult.failures.length,
            passes: mobileResult.passes,
            failures: mobileResult.failures
        }
    }

    console.log(`\nOverall: ${report.overall}`)
    console.log(JSON.stringify(report, null, 2))

    if (!allPassed) process.exit(1)
}

run().catch((err) => {
    console.error('Test harness error:', err)
    process.exit(1)
})
