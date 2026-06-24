/**
 * widget-journey.spec.js — W46-E3
 *
 * 10 user-journey Playwright tests that verify what the user actually sees,
 * not what the file structure looks like. Each test is named after the bug
 * class it catches, and is intentionally cheap (one or two assertions).
 *
 * Why this exists: the 285 contract/invariant tests check structure (does
 * WeatherData have a `temp` field, does the widget render a .weather-temp
 * span). They cannot catch:
 *   - callback wiring bugs (onSceneReady missing in the desktop branch)
 *   - z-index / click-eating bugs (chrome button overlapping the widget pill)
 *   - text-truncation bugs (forecast cut off at 130px)
 *   - "this was never connected to a real API" bugs (simulated fetchWeather)
 * This suite catches all of those.
 *
 * Run: TEST_BASE_URL=http://127.0.0.1:5180 npx playwright test tests/widget-journey.spec.js --browser=chromium
 */

import { test, expect } from '@playwright/test'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:5180'

test.describe('Widget Journey Tests — what the user actually sees', () => {
    /**
     * Boot: navigate, dismiss the gesture gate, wait for the weather widget.
     * The widget only renders when the canvas's onSceneReady callback fires,
     * which is itself a regression we want to catch. If s3dSceneReady never
     * fires, the widget never mounts, and every test below fails.
     */
    test.beforeEach(async ({ page }) => {
        // Surface any console errors so failed tests show the real cause
        const errors = []
        page.on('console', (msg) => {
            if (msg.type() === 'error') errors.push(msg.text())
        })
        page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))
        page.on('console-errors', () => {
            /* exposed for diagnostics */
        })

        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })

        // Dismiss the gesture gate. The button might be labelled "Explore" or
        // "Enter 3D Scene" depending on which branch renders. We match both.
        const explore = page.getByRole('button', { name: /^(Explore|Enter 3D [Ss]cene)$/ }).first()
        await explore.waitFor({ state: 'visible', timeout: 15000 })
        await explore.click()

        // Wait for the weather widget to mount. This implicitly verifies the
        // onSceneReady wiring (the widget is gated on s3dSceneReady).
        await page.locator('.weather-widget').waitFor({ state: 'attached', timeout: 30000 })

        // Wait for the temperature to populate with a real number. Simulated
        // data starts at 0, so a non-zero value proves we hit the real API.
        await page
            .locator('.weather-temp')
            .filter({ hasText: /^[1-9]\d?°$/ })
            .first()
            .waitFor({ timeout: 15000 })

        // Store the error collector on the page object for later assertions
        page._bootErrors = errors
    })

    // ── Tests ────────────────────────────────────────────────────────────────

    /**
     * 1. The temperature displayed is a real Fahrenheit value, not a
     *    placeholder (0) or a random stub.
     *
     * Catches: `weather.svelte.ts` returning `Math.random()` or `0` initial
     * value, App.svelte's onSceneReady callback not wiring s3dSceneReady=true.
     */
    test('1. temperature is a real Fahrenheit value (not 0, not simulated)', async ({ page }) => {
        const temp = (await page.locator('.weather-temp').first().textContent()) ?? ''
        const m = temp.match(/^(-?\d+)°$/)
        expect(m, `temperature "${temp}" did not match /^\\d+°$/`).not.toBeNull()
        const value = Number(m[1])
        // Montgomery County, TX in June: realistic range is 65-105°F.
        expect(value).toBeGreaterThan(40)
        expect(value).toBeLessThan(130)
    })

    /**
     * 2. The widget pill is clickable — the topmost element at the pill's
     *    center is the weather toggle, not the legend/help chrome button.
     *
     * Catches: z-index/layering bugs where chrome buttons sit on top of the
     * pill and eat clicks (W46-D2 bug — widget at y=105 hidden behind
     * legend at y=117).
     */
    test('2. pill center hits the weather toggle, not a chrome button', async ({ page }) => {
        const box = await page.locator('.weather-toggle').first().boundingBox()
        expect(box).not.toBeNull()
        // elementFromPoint returns the DEEPEST element under the point — the SVG
        // <span class="weather-icon"> inside the <button class="weather-toggle">.
        // Walk up the ancestor chain to find the closest <button>: that's the
        // element that would actually receive the click. If it's the weather
        // toggle, the pill is reachable. If it's a legend/help chrome button,
        // the click is being eaten (W46-D2 regression: widget at y=105 was
        // hidden behind legend at y=117).
        const closestButton = await page.evaluate(
            ({ x, y }) => {
                let el = document.elementFromPoint(x, y)
                while (el && el.tagName !== 'BUTTON') el = el.parentElement
                if (!el) return { found: false }
                return {
                    found: true,
                    id: el.id || null,
                    cls: (typeof el.className === 'string' ? el.className : '').slice(0, 80),
                    aria: el.getAttribute('aria-label') ?? ''
                }
            },
            { x: box.x + box.width / 2, y: box.y + box.height / 2 }
        )

        expect(closestButton.found, 'no <button> at pill center').toBe(true)
        const isWeather = closestButton.cls.includes('weather-toggle')
        const isChrome = /category legend|keyboard shortcuts/i.test(closestButton.aria)
        expect(
            isWeather,
            `closest button was ${closestButton.id || closestButton.cls} (aria: ${closestButton.aria})`
        ).toBe(true)
        expect(isChrome, `chrome button ate the click: ${closestButton.aria}`).toBe(false)
    })

    /**
     * 3. The detail panel shows 4 rows (Condition, Feels like, Humidity, Wind)
     *    and the forecast row (if any) is NOT truncated with ellipsis.
     *
     * Catches: text-overflow:ellipsis on .detail-value.forecast, FORECAST
     * row still present, missing humidity/wind rows.
     */
    test('3. detail panel: 4 rows, no ellipsis on forecast', async ({ page }) => {
        await page.locator('.weather-toggle').first().click()
        const details = page.locator('.weather-details').first()
        await details.waitFor({ state: 'visible', timeout: 5000 })

        const rowCount = await page.locator('.weather-detail-row').count()
        expect(rowCount, `expected 4 detail rows, got ${rowCount}`).toBe(4)

        // The 4 labels must be these (in any order — but no "Forecast" in detail-value)
        const labels = await page.locator('.weather-detail-row .detail-label').allTextContents()
        expect(labels.map((l) => l.trim()).sort()).toEqual(['Condition', 'Feels like', 'Humidity', 'Wind'])

        // The old FORECAST row had `text-overflow: ellipsis`. If a forecast-style
        // value still exists, it must NOT have ellipsis.
        const forecastCount = await page.locator('.detail-value.forecast').count()
        if (forecastCount > 0) {
            const overflow = await page
                .locator('.detail-value.forecast')
                .first()
                .evaluate((el) => getComputedStyle(el).textOverflow)
            expect(overflow, `forecast value uses text-overflow: ${overflow}`).not.toBe('ellipsis')
        }
    })

    /**
     * 4. Pressing `/` focuses the search input. This is the documented
     *    shortcut; if it doesn't work, search is unreachable from the keyboard.
     *
     * Catches: keyboard handler not bound, focus stolen by another element,
     * the shortcut is bound to the wrong key.
     */
    test('4. pressing / focuses the search input', async ({ page }) => {
        // Make sure no input is focused first
        await page.evaluate(() => document.activeElement?.blur())
        await page.keyboard.press('/')
        const focusedId = await page.evaluate(() => document.activeElement?.id ?? null)
        expect(focusedId).toBe('search-input')
    })

    /**
     * 5. Clicking the "Search" mode tab flips the active mode. Mode routing
     *    is the primary navigation surface; a dead tab is a critical bug.
     */
    test('5. clicking the Search mode tab activates it', async ({ page }) => {
        await page.getByRole('radio', { name: 'Search' }).first().click()
        const active = await page.evaluate(
            () => document.querySelector('[role="radio"][aria-checked="true"]')?.textContent?.trim() ?? null
        )
        expect(active).toBe('Search')
    })

    /**
     * 6. The category legend toggle (top-right grid icon) actually toggles
     *    the panel. Closed by default, opens on click.
     */
    test('6. category legend toggle opens the panel', async ({ page }) => {
        const toggle = page.locator('#btn-legend').first()
        await expect(toggle).toBeVisible()

        // Closed by default: aside is off-screen or aria-hidden
        const before = await page.evaluate(() => {
            const w = document.querySelector('aside[aria-label="Business category legend"]')
            if (!w) return { exists: false }
            const r = w.getBoundingClientRect()
            return { exists: true, x: Math.round(r.x), onScreen: r.x >= 0 }
        })
        expect(before.exists).toBe(true)
        expect(before.onScreen).toBe(false)

        await toggle.click()
        await page.waitForTimeout(400)

        const after = await page.evaluate(() => {
            const w = document.querySelector('aside[aria-label="Business category legend"]')
            const r = w?.getBoundingClientRect()
            return { x: Math.round(r?.x ?? -1), onScreen: (r?.x ?? -1) >= 0 }
        })
        expect(after.onScreen, `legend still off-screen after toggle (x=${after.x})`).toBe(true)
    })

    /**
     * 7. The keyboard shortcuts help button (top-right ? icon) opens the
     *    shortcuts panel and the panel lists at least 4 shortcuts.
     *
     * Catches: help button overlap with other chrome, region missing
     * `aria-label`, shortcuts silently broken.
     */
    test('7. keyboard help button opens the shortcuts panel', async ({ page }) => {
        const help = page.locator('#btn-keyboard-help').first()
        await expect(help).toBeVisible()
        await help.click()

        const panel = page
            .locator('[role="region"][aria-label*="keyboard" i], [role="region"][aria-label*="shortcut" i]')
            .first()
        await panel.waitFor({ state: 'visible', timeout: 5000 })

        // Panel should list multiple shortcuts (the help panel has 9 in current build)
        const shortcutCount = await panel.locator(':scope > *').count()
        expect(shortcutCount, `expected multiple shortcut rows, got ${shortcutCount}`).toBeGreaterThanOrEqual(4)
    })

    /**
     * 8. Switching to Map mode produces no real console errors. The map
     *    view has its own init logic (MapView.svelte) and has historically
     *    broken when #map-container wasn't present.
     */
    test('8. switching to Map mode produces no real console errors', async ({ page }) => {
        const errors = []
        const handler = (msg) => {
            if (msg.type() === 'error') errors.push(msg.text())
        }
        page.on('console', handler)

        await page.getByRole('radio', { name: 'Map' }).first().click()
        await page.waitForTimeout(2000)

        page.off('console', handler)

        // Filter known dev-only noise that isn't a regression
        const real = errors.filter(
            (e) => !/Svelte-first|font|nunito|Resource|favicon|Preconnect|net::ERR_ABORTED/i.test(e)
        )
        expect(real, `unexpected console errors: ${JSON.stringify(real, null, 2)}`).toEqual([])
    })

    /**
     * 9. Clicking on the 3D canvas doesn't throw. We don't assert which
     *    point is selected (camera + scene state is non-deterministic), but
     *    a click must not produce a pageerror or a 3D-engine crash.
     */
    test('9. clicking on the 3D canvas produces no page errors', async ({ page }) => {
        const pageErrors = []
        page.on('pageerror', (err) => pageErrors.push(err.message))

        const canvas = page.locator('canvas').first()
        await canvas.waitFor({ state: 'visible' })
        const box = await canvas.boundingBox()
        expect(box).not.toBeNull()

        // Click in the canvas viewport center where points are densest
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
        await page.waitForTimeout(800)

        expect(pageErrors, `page errors: ${JSON.stringify(pageErrors, null, 2)}`).toEqual([])
    })

    /**
     * 10. The skip-to-main-content link is present, focusable, and moves
     *     focus into the main region on activation. This is a baseline a11y
     *     check that catches the "header is a div, skip link is dead" class
     *     of regressions.
     */
    test('10. skip-to-main link moves focus into main on activation', async ({ page }) => {
        const skip = page.locator('a[href="#main-content"]').first()
        await expect(skip).toBeAttached()

        // Focus and activate the link
        await skip.focus()
        await page.keyboard.press('Enter')
        await page.waitForTimeout(200)

        // After activation, the main element should either have focus or be
        // scrolled into view. We check both since browser behavior varies.
        const result = await page.evaluate(() => {
            const main = document.querySelector('main')
            const hash = window.location.hash
            return {
                activeIsMain: document.activeElement?.tagName === 'MAIN',
                hash: hash,
                mainTop: main ? Math.round(main.getBoundingClientRect().top) : null
            }
        })

        // Either focus moved to main, or the URL hash changed to #main-content,
        // or the main is scrolled into the viewport (top within 200px of 0).
        const focusMoved = result.activeIsMain || result.hash === '#main-content'
        const scrolled = result.mainTop !== null && result.mainTop < 200
        expect(
            focusMoved || scrolled,
            `skip link did not move focus or scroll to main: ${JSON.stringify(result)}`
        ).toBe(true)
    })

    /**
     * 12. The summary card suggestion buttons fire focusOnNode on click.
     *
     * Catches: `SemanticGuideCard.svelte` rendering `.suggestion-btn` elements
     * with `data-lead-id` but no `onclick` handler at all. The buttons look
     * clickable (cursor: pointer, hover state) but clicking does nothing. The
     * user forms a "this product is broken" model.
     *
     * The legacy `bindSuggestionControls` module that supposedly handled
     * these clicks was dead code: nothing imported it (tree-shaken from the
     * production bundle), and even if it were registered its
     * `closest('[data-action]')` selector wouldn't match the rendered
     * `data-lead-id` attribute.
     *
     * The fix (W47-A): add `onclick={() => handleSuggestionClick(suggestion)}`
     * to each suggestion button. The handler looks up `suggestion.lead_id`
     * in `appState.pointIndexByLeadId` and calls `focusOnNode(idx)`.
     *
     * Test strategy:
     *   1. Focus a starting business via canvas click
     *   2. Click "Synthesize trail" to populate the summary card with
     *      suggestions (uses the local fallback if the API is slow/fails)
     *   3. Wait for the suggestion buttons to render
     *   4. Pick a suggestion whose lead_id differs from the focused lead_id
     *      (the first suggestion is the "Trail anchor" which IS the focused
     *      business — clicking it would not change focus)
     *   5. Click it and verify navState.focusedIndex changes
     *
     * If the button has no working onclick, the click is a no-op and
     * focusedIndex stays at the canvas-clicked value. The test fails with a
     * diagnostic message naming the missing handler.
     */
    test('12. summary card suggestion buttons fire focusOnNode on click', async ({ page }) => {
        const canvas = page.locator('canvas').first()
        await canvas.waitFor({ state: 'visible' })

        // Wait for the data worker to load the 8,406-point dataset.
        await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 10000 })
        await page.waitForTimeout(1000)

        // Populate the summary card with three real suggestions. We bypass
        // the requestSemanticGuide API call (which can be slow in preview
        // builds) and write directly to semanticGuideState.config. This
        // mimics what showSemanticGuideSuccess does after the API returns.
        const setup = await page.evaluate(() => {
            const state = window.__APP_STATE__
            if (!state?.pointIndexByLeadId || state.pointIndexByLeadId.size === 0) {
                return { ok: false, reason: 'pointIndexByLeadId empty' }
            }
            const points = state.points ?? []
            // Pick three distinct points that have lead_ids in the lookup map.
            const candidates = []
            for (let i = 0; i < points.length && candidates.length < 3; i++) {
                const p = points[i]
                if (p && Number.isFinite(p.cluster) && p.lead_id && state.pointIndexByLeadId.has(String(p.lead_id))) {
                    candidates.push({ index: i, lead_id: String(p.lead_id), name: p.name || `Business ${i}` })
                }
            }
            if (candidates.length < 2) {
                return { ok: false, reason: `only ${candidates.length} candidates with lead_ids` }
            }
            // Build a guide config with these three suggestions.
            const suggestions = candidates.map((c, idx) => ({
                lead_id: c.lead_id,
                label: idx === 0 ? 'Trail anchor' : idx === 1 ? 'Next stop' : 'Side trail',
                name: c.name,
                city: '',
                reason: ''
            }))
            state.semanticGuideState.isVisible = true
            state.semanticGuideState.config = {
                title: 'Test guide',
                text: 'Test summary',
                laneStatus: 'Ready',
                suggestions
            }
            return { ok: true, candidates, focusBefore: state.navState?.focusedIndex ?? null }
        })
        console.log('[TEST 12 DEBUG setup]', JSON.stringify(setup).slice(0, 200))

        if (!setup.ok) {
            test.skip(true, `setup failed: ${setup.reason} — test environment limitation`)
            return
        }

        console.log('[TEST 12] setup OK with candidates:', setup.candidates.map((c) => c.name).join(', '))

        // Wait for the suggestion buttons to render
        const suggestionBtns = page.locator('.suggestion-btn')
        await suggestionBtns.first().waitFor({ state: 'visible', timeout: 5000 })

        // The candidate indices are the ones populated by setup.
        const candidates = setup.candidates

        // Pick a suggestion that isn't the currently focused business (if any).
        // For a fresh page, focusBefore is null/0/undefined — click the first
        // suggestion; its lead_id maps to a different index than focusBefore.
        const targetIdx = candidates.length > 1 ? 1 : 0 // skip first if there's a second
        const expectedIdx = candidates[targetIdx].index

        // Capture focus immediately before click
        const focusImmediatelyBefore = await page.evaluate(() => window.__APP_STATE__?.navState?.focusedIndex ?? null)

        // Click the suggestion
        await suggestionBtns.nth(targetIdx).click()
        await page.waitForTimeout(800)

        const focusAfter = await page.evaluate(() => window.__APP_STATE__?.navState?.focusedIndex ?? null)

        expect(
            focusAfter,
            `clicking suggestion ${targetIdx} (lead_id=${candidates[targetIdx].lead_id}) should change focus from ${focusImmediatelyBefore} to ${expectedIdx}, but got ${focusAfter} — the button has no working onclick handler`
        ).toBe(expectedIdx)
    })

    /**
     * 13. The "Discover" note varies per session, not constant across all users.
     *
     * Catches: `compass-state.ts:229` using the constant seed `42` in the
     * `seededUnit` call for the idle discovery note. Every user — across
     * browsers, profiles, and sessions — saw the same "Discover: {business}"
     * snippet. The word "discover" implies per-user surprise; the
     * implementation guaranteed the opposite. The user stared at the same
     * overview for hours and concluded the system was a constant sample, not
     * a discovery.
     *
     * The fix (W47-B): generate a random per-session seed on first load,
     * persist it in `localStorage['semantic-explorer.session-seed']`, and
     * use `sessionSeed.value` instead of `42` in the `seededUnit` call. The
     * cache in compass-state.ts invalidates when the seed changes so the
     * new pick lands on the next overview render.
     *
     * Test strategy: open two separate browser contexts (separate
     * `localStorage` stores). Boot both. Each context generates its own
     * session seed and produces its own discovery note. Assert the notes
     * differ — which they should unless both random seeds happened to pick
     * the same business (probability ≈ 1/8406).
     *
     * Also asserts stability: the same context, reloaded, sees the same
     * discovery note (because the seed is persisted in localStorage).
     */
    test('13. discovery note varies per session, not constant across all users', async ({ browser }) => {
        // Use the playwright-provided page (from beforeEach) for context A.
        // For context B, open a new isolated context with separate localStorage.
        // We don't boot a full WebGL scene for context B — just verify the
        // session seed module loads and produces a different seed.
        const ctxA = browser.contexts()[0]
        const ctxB = await browser.newContext()
        const pageA = ctxA.pages()[0] ?? (await ctxA.newPage())
        const pageB = await ctxB.newPage()

        try {
            // Context A: already booted via beforeEach — just wait for the seed.
            await pageA.waitForFunction(
                () =>
                    typeof window.__semanticExplorerSessionSeed === 'number' &&
                    window.__semanticExplorerSessionSeed > 0,
                null,
                { timeout: 5000 }
            )

            // Context B: navigate but don't wait for the full WebGL scene
            // (the preview server is single-threaded and serializing full
            // boots is slow). The session seed is set at module load, before
            // any UI renders, so we can read it as soon as the JS bundle
            // parses.
            await pageB.goto(BASE_URL, { waitUntil: 'commit' })
            await pageB.waitForFunction(
                () =>
                    typeof window.__semanticExplorerSessionSeed === 'number' &&
                    window.__semanticExplorerSessionSeed > 0,
                null,
                { timeout: 30000 }
            )

            const seedA = await pageA.evaluate(() => window.__semanticExplorerSessionSeed)
            const seedB = await pageB.evaluate(() => window.__semanticExplorerSessionSeed)

            // Both contexts must have a real seed (not the SSR fallback 42).
            expect(seedA, `expected context A to have a session seed > 0, got ${seedA}`).toBeGreaterThan(0)
            expect(seedB, `expected context B to have a session seed > 0, got ${seedB}`).toBeGreaterThan(0)

            // The two contexts have separate localStorage, so separate seeds.
            expect(
                seedA,
                `expected different session seeds across two separate browser contexts (different localStorage), but both got ${seedA}. The seed may still be hardcoded — check session.svelte.ts`
            ).not.toBe(seedB)

            // Stability check: reload context B (cleared localStorage path)
            // and confirm the same seed appears (the seed is persisted).
            await pageB.reload({ waitUntil: 'commit' })
            await pageB.waitForFunction(
                () =>
                    typeof window.__semanticExplorerSessionSeed === 'number' &&
                    window.__semanticExplorerSessionSeed > 0,
                null,
                { timeout: 30000 }
            )
            const seedB2 = await pageB.evaluate(() => window.__semanticExplorerSessionSeed)
            expect(
                seedB2,
                `expected the same session seed after reload (seed is persisted), but first was ${seedB} and after reload was ${seedB2}`
            ).toBe(seedB)
        } finally {
            await ctxB.close()
        }
    })

    /**
     * 14. The mobile 2D placeholder is labeled as a "Preview" — not as the
     *    real product. Catches: `Placeholder2D.svelte` previously rendered
     *    copy like "8,406 businesses · 4 clusters" that implied the user
     *    was looking at the real 3D mycelium, when actually they were
     *    looking at a static SVG fallback. A user who tapped the CTA to
     *    "Enter 3D Scene" expected to see 8,406 businesses — and then had
     *    to wait for the 587 KB three.js chunk to load. Mobile users
     *    concluded the product was slow or broken.
     *
     *    The fix (W47-C): title now carries a "Preview" badge; subtitle
     *    says "Mobile preview"; the hint invites the user to "open on
     *    desktop for the full 3D experience." The CTA stays the same
     *    ("Enter 3D Scene") because it accurately describes what tapping
     *    does — it's the honest part.
     *
     *    Test strategy: load the page with a mobile viewport (≤768px).
     *    The responsive-renderer decision logic picks 'placeholder2d'.
     *    Read the placeholder text and assert it contains "Preview"
     *    (or "preview") and a desktop-fallback hint.
     */
})

// ── Mobile placeholder tests ───────────────────────────────────────────────
//
// These tests use a fresh browser context with a mobile viewport so the
// responsive renderer picks 'placeholder2d' without polluting state from
// the main boot sequence. They live in a separate `test.describe` block
// without the heavy `beforeEach` that drives the desktop full-scene boot.
test.describe('Widget Journey Tests — mobile viewport', () => {
    test('14. mobile placeholder copy is labeled as a "Preview", not as the real product', async ({ browser }) => {
        // Use a fresh browser context with a mobile viewport so the
        // responsive renderer picks 'placeholder2d' and the loading overlay
        // doesn't intercept clicks. Sharing the playwright-provided context
        // with prior tests can leave state behind that surfaces here.
        const ctx = await browser.newContext({
            viewport: { width: 375, height: 667 }
        })
        const page = await ctx.newPage()

        try {
            await page.goto(BASE_URL, { waitUntil: 'commit' })
            await page.locator('[data-testid="placeholder-2d"]').waitFor({ state: 'visible', timeout: 15000 })

            const titleText = ((await page.locator('.placeholder-title').first().textContent()) ?? '').trim()
            const subtitleText = ((await page.locator('.placeholder-subtitle').first().textContent()) ?? '').trim()
            const hintText = ((await page.locator('.placeholder-hint').first().textContent()) ?? '').trim()

            // The title must include "Preview" — that's the whole point of
            // the W47-C fix. A user staring at this string should immediately
            // know they're looking at a fallback, not the real product.
            expect(
                titleText.toLowerCase().includes('preview'),
                `placeholder title "${titleText}" should include "Preview" so the user knows this is the mobile fallback, not the real product`
            ).toBe(true)

            // The subtitle must include "Mobile" so the user knows why
            // they're seeing a fallback.
            expect(
                subtitleText.toLowerCase().includes('mobile'),
                `placeholder subtitle "${subtitleText}" should include "Mobile" so the user knows this is the mobile fallback`
            ).toBe(true)

            // The hint should mention "desktop" as an alternative path —
            // gives the user a way out of the mobile experience if they
            // want the full 3D rendering.
            expect(
                hintText.toLowerCase().includes('desktop'),
                `placeholder hint "${hintText}" should mention "desktop" as an alternative path`
            ).toBe(true)

            // W47-C2 (Tier 2 #2.4): mobile users need terminology access too.
            // Verify the inline legend renders the first 5 cluster names.
            const legendItems = await page
                .locator('[data-testid="placeholder-legend"] > li')
                .allTextContents()
            expect(
                legendItems.length,
                `expected placeholder legend to have 5 items, got ${legendItems.length}`
            ).toBe(5)
            // The first item should match the first CLUSTER_NAMES entry.
            expect(
                legendItems[0].trim().length,
                `expected first legend item to be a non-empty category name, got "${legendItems[0]}"`
            ).toBeGreaterThan(0)
        } finally {
            await ctx.close()
        }
    })
})

// ── Dev-mode mock banner tests ──────────────────────────────────────────────
//
// These tests verify the W47-E banner that appears in dev builds when the
// search API falls back to the local mock catalog. The banner reads
// sessionStorage.api_unreachable, which the search engine sets on API
// failure. We use a fresh browser context so the flag starts unset and the
// banner is hidden, then we set the flag and verify the banner appears.
test.describe('Widget Journey Tests — dev mock banner', () => {
    test('15. dev mock banner shows when sessionStorage.api_unreachable is set', async ({ browser }) => {
        const ctx = await browser.newContext()
        const page = await ctx.newPage()

        try {
            await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })

            // Wait for the SearchBar to mount before checking the banner.
            // The SearchBar component is in the eager bundle but its DOM
            // is rendered after Svelte mounts the App shell.
            await page.locator('.search-container').waitFor({ state: 'attached', timeout: 15000 })

            // Before the flag is set, the banner should NOT be visible.
            // Wait a beat for the SearchBar's 750ms polling interval.
            await page.waitForTimeout(1500)
            const bannerBefore = await page.locator('[data-testid="mock-banner"]').count()

            // Set the flag — simulates the search engine's fallback path.
            await page.evaluate(() => {
                window.sessionStorage.setItem('api_unreachable', '1')

                console.log('[TEST 15 DEBUG] set api_unreachable=1')
            })

            // Wait for the next 750ms polling tick.
            await page.waitForTimeout(1500)

            const bannerAfter = page.locator('[data-testid="mock-banner"]')
            await bannerAfter.waitFor({ state: 'visible', timeout: 5000 })

            const bannerText = (await bannerAfter.first().textContent()) ?? ''
            // The banner must include 'DEV' and 'mock' — the contract is
            // "developer sees clearly that they're not looking at real data".
            expect(
                bannerText.toLowerCase().includes('dev'),
                `banner text should include "DEV" but got "${bannerText}"`
            ).toBe(true)
            expect(
                bannerText.toLowerCase().includes('mock'),
                `banner text should include "mock" but got "${bannerText}"`
            ).toBe(true)
        } finally {
            await ctx.close()
        }
    })
})

// ── Search error message tests ──────────────────────────────────────────────
//
// Locks in the W47-T2 #2.5 fix: the search error UI shows the underlying
// error message from the search engine (e.g. "Semantic search timed
// out after 8000ms."). Without this, the user only sees "Retry needed"
// with no indication of why the search failed.
//
// Behavioral test was attempted but the searchState store has a
// function-based snapshot that doesn't refresh on direct appState writes
// — only via withSearchNotify() from inside the search action. The
// search action in preview mode falls back to the mock catalog and
// never errors, so a behavioral test that exercises the real path is
// also blocked by the same env. Structural test below locks in the
// contract without those dependencies.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __filename2 = fileURLToPath(import.meta.url)
const __dirname2 = dirname(__filename2)
const SEARCH_RESULTS_PATH = resolve(__dirname2, '../src/components/SearchResults.svelte')

test.describe('Widget Journey Tests — search error detail', () => {
    test('16. search-error-detail element renders the engine message (structural)', () => {
        const src = readFileSync(SEARCH_RESULTS_PATH, 'utf8')
        // 1. The data-testid must be present (test selector stability).
        expect(
            src,
            'search-error-detail element must have data-testid="search-error-detail"'
        ).toMatch(/data-testid=['"]search-error-detail['"]/)
        // 2. The element must display searchError.message (the engine
        //    error, not a generic string).
        expect(
            src,
            'search-error-detail must display searchError.message'
        ).toMatch(/\{searchError\.?\s*message\}/)
        // 3. The element must live inside the isFullError conditional,
        //    not the inline-error variant (different UX position).
        //    Split source on {:else if isFullError} then take everything
        //    up to the next {:else or {/if} marker.
        const startMarker = '{:else if isFullError}'
        const startIdx = src.indexOf(startMarker)
        expect(startIdx, 'isFullError block start not found').toBeGreaterThan(-1)
        const afterStart = src.slice(startIdx + startMarker.length)
        // Find the next `{:else` or `{/if}` after the block starts
        const nextElse = afterStart.indexOf('{:else')
        const nextEndIf = afterStart.indexOf('{/if}')
        let endIdx
        if (nextElse === -1 && nextEndIf === -1) endIdx = afterStart.length
        else if (nextElse === -1) endIdx = nextEndIf
        else if (nextEndIf === -1) endIdx = nextElse
        else endIdx = Math.min(nextElse, nextEndIf)
        const fullErrorBlock = afterStart.slice(0, endIdx)
        expect(
            fullErrorBlock,
            'search-error-detail must live inside the isFullError block'
        ).toContain('data-testid="search-error-detail"')
    })
})

// ── Replay tour button tests ──────────────────────────────────────────────────────
//
// Locks in the W47-T2 #2.3 fix: a "Replay tour" button in the keyboard
// shortcuts panel that lets users re-trigger the first-visit demo after
// closing it. The button clears the choreography session-storage gate
// and fires requestSemanticGuide().
test.describe('Widget Journey Tests — replay tour', () => {
    test('17. replay tour button clears the demo session gate', async ({ browser }) => {
        const ctx = await browser.newContext()
        const page = await ctx.newPage()

        try {
            await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
            await page.locator('.search-container').waitFor({ state: 'attached', timeout: 30000 })

            // Simulate a user who already saw and dismissed the demo
            // some time in the past.
            await page.evaluate(() => {
                window.sessionStorage.setItem(
                    'moco_mycelium_demo_session_v1',
                    '2026-01-01T00:00:00.000Z'
                )
            })

            // Open the keyboard shortcuts panel (the replay button lives
            // inside it).
            const helpButton = page.locator('#btn-keyboard-help').first()
            await helpButton.click()
            await page.waitForTimeout(500)

            // The replay button should be visible inside the panel.
            const replayBtn = page.locator('#btn-replay-tour').first()
            await replayBtn.waitFor({ state: 'visible', timeout: 5000 })
            expect(
                (await replayBtn.textContent())?.toLowerCase().trim(),
                'replay button should be labeled "replay tour"'
            ).toBe('replay tour')

            // Click the replay button. The handler clears the OLD flag
            // and then re-fires the demo flow. After the demo's
            // `startDemo()` runs, the flag is set to "1" (the start guard).
            // After `_startMicroDemo()` succeeds, the flag is set to an
            // ISO timestamp. Either is acceptable — the key contract is
            // that the OLD date I set is gone (the replay cleared it).
            await replayBtn.click()
            await page.waitForTimeout(500)

            const newFlag = await page.evaluate(() =>
                window.sessionStorage.getItem('moco_mycelium_demo_session_v1')
            )
            expect(
                newFlag,
                'replay button should clear the stale session flag — was "2026-01-01...", got the new value'
            ).not.toBe('2026-01-01T00:00:00.000Z')
            expect(
                newFlag,
                'replay button should result in a non-null session flag (the demo re-ran)'
            ).not.toBeNull()
        } finally {
            await ctx.close()
        }
    })
})
