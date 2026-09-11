import { test, expect } from '@playwright/test'
import { BASE_URL } from '../helpers/3d-interaction-helpers.js'

// GPU cleanup between tests: close the page and its entire browser context so
// serial WebGL journeys do not accumulate renderer bookkeeping. Do not call
// WEBGL_lose_context here: that deliberately fires the app's recovery path and
// can race the next test while the context is being torn down.
test.afterEach(async ({ page }) => {
    const context = page.context()
    try {
        await page.close().catch(() => {})
    } catch {
        // Cleanup is best-effort — don't mask the real test failure.
    } finally {
        // Close this exact per-test context. Playwright fixture teardown
        // tolerates this idempotent close when it runs again after the test.
        await context.close().catch(() => {})
    }
})

// pollFor: CDP-channel state polling used by the F5 journey tests. Uses
// `page.evaluate` + `page.waitForTimeout` on a fixed interval instead of
// `page.waitForFunction`'s default rAF polling. The headless-chromium WebGL
// pipeline (the app mounts the mycelium WebGL scene) is subject to GPU
// ReadPixels stalls that delay rAF for several seconds at a time, and
// `page.waitForFunction` can time out before its predicate is ever evaluated
// even though the underlying state has already flipped (verified via an
// explicit `page.evaluate` poll seeing `class:hidden` removed at ~250ms).
// `page.evaluate` is dispatched over the CDP request channel and is immune to
// rAF stalls, so polling it on a fixed interval reliably captures the state.
const pollFor = async (page, predicate, timeoutMs, intervalMs = 50, evalArg) => {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
        if (await page.evaluate(predicate, evalArg)) return true
        await page.waitForTimeout(intervalMs)
    }
    return false
}


test.describe('Mobile and semantic upgrade', () => {
    test('B1. deep-link search renders result strength bars (setSearchResults population fix)', async ({ page }) => {
        // Fix B (2026-08-06): setSearchResults now populates renderContext/topScore +
        // appState.searchResults on the runSearch path — SearchResults.svelte reads
        // renderContext for strength-bar widths and getFirstSearchHit for the deep-link.
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.addInitScript(() => {
            window.__PLAYWRIGHT__ = true
        })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&q=coffee`, {
            waitUntil: 'domcontentloaded'
        })
        await page.waitForFunction(
            () =>
                (Array.isArray(window.__APP_STATE__?.searchResults) && window.__APP_STATE__.searchResults.length > 0) ||
                document.querySelectorAll('#search-results .search-result-bar').length > 0,
            null,
            { timeout: 30000, polling: 100 }
        )
        const bars = await page.locator('#search-results .search-result-bar').count()
        expect(bars, 'deep-link search must render strength bars (was always-undefined renderContext)').toBeGreaterThan(
            0
        )
        const firstBox = await page.locator('#search-results .search-result-bar').first().boundingBox()
        expect(firstBox?.width ?? 0, 'first strength bar must have positive rendered width').toBeGreaterThan(0)
    })

    test('C1. semantic dive wins over trail in compass phase (insideActive-before-inTrailMode fix)', async ({
        page
    }) => {
        // Fix C (2026-08-06): compass evaluates insideActive before inTrailMode, so a
        // dive in progress emits phase='inside' (not 'trail'). Session-4 rewrite of
        // the driver: the old Inside RADIO locators match nothing (the affordance is
        // ModeChipRail chips now), and the old evaluate() fallback wrote plain fields
        // into window.__APP_STATE__, which is NOT the live $state proxy — both were
        // dead doors. Real doors today, in preference order:
        //   (a) Header chip `.mode-chip[data-mode="inside"]` — its selectMode() chains
        //       executeJourneyCompassAction(ENTER_INSIDE) (Header.svelte Bug-2 fix),
        //       which arms trailDepth=2 + semanticDiveMode via the canonical funnel.
        //   (b) Compass dive button `[data-journey-action="enter-inside"]`.
        //   (c) Ctrl+5 (global-shortcuts KH-INSIDE-SHORTCUT-FIX chains ENTER_INSIDE).
        // Boot stays in GALAXY view: on ?view=map composites the chip rail is
        // intentionally hidden (A2-4) and insideActive requires galaxy anyway.
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.addInitScript(() => {
            window.__PLAYWRIGHT__ = true
        })
        // Establish a real focused node (deep-link record) so the Inside mode is unlocked.
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&record=519`, {
            waitUntil: 'domcontentloaded'
        })
        await page.waitForFunction(
            () => document.body.dataset.panelSurface === 'focus' || !!document.body.dataset.focusedNode,
            null,
            { timeout: 20000, polling: 100 }
        )

        // Dismiss the first-visit help dialog if it auto-opened over the chrome.
        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }

        const chip = page.locator('.mode-chip[data-mode="inside"]').first()
        const diveBtn = page.locator('[data-journey-action="enter-inside"]').first()
        if ((await chip.count()) > 0 && (await chip.isVisible().catch(() => false))) {
            await chip.click({ timeout: 8000 })
        } else if ((await diveBtn.count()) > 0 && (await diveBtn.isVisible().catch(() => false))) {
            await diveBtn.click({ timeout: 8000 })
        } else {
            // Door (c): the keyboard shortcut routes through the same ENTER_INSIDE action.
            await page.keyboard.press('Control+5')
        }
        await page.waitForFunction(() => document.querySelector('#journey-compass')?.dataset.phase === 'inside', null, {
            timeout: 8000,
            polling: 100
        })
        const phase = await page.getAttribute('#journey-compass', 'data-phase')
        expect(phase, 'during a dive the compass must show inside phase (was trail)').toBe('inside')
    })

    test('W10: Esc on a visible toast dismisses ONLY the toast (no RETURN_OVERVIEW dump)', async ({ page }) => {
        // Wave-10 bugsweep BS-B#1: a toast's Escape handler dismissed the toast
        // but the SAME keypress also reached the global Esc → return-to-overview
        // handler (RETURN_OVERVIEW wiped the query + dumped the user out of the
        // current surface). Fixed by the toast claiming the shared window Escape event. This pins
        // the contract: Esc while a toast is visible → toast gone, surface steady.
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.addInitScript(() => {
            window.__PLAYWRIGHT__ = true
        })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })
        await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, {
            timeout: 20000,
            polling: 100
        })
        await page.waitForTimeout(1500)

        // Dismiss the first-visit help dialog if present (it can cover the mode
        // chips + eat the click — the established tests dismiss it before
        // interacting).
        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }

        // Enter search mode first so there's a non-idle surface to lose. Poll for
        // the search INPUT (the durable signal the working journey tests use — the
        // search surface mounts it) rather than navState.surface (which may lag the
        // engine boot gate).
        await page.click('.mode-chip[data-mode="search"]', { force: true })
        const searchInputEl = page.locator('#search-input').first()
        await searchInputEl.waitFor({ state: 'visible', timeout: 15000 })
        const surfaceBefore = await page.evaluate(() => window.__APP_STATE__?.navState?.surface ?? null)
        expect(surfaceBefore, 'search chip click must put us in the search surface').toBe('search')

        // Type a search query so we can verify the global Escape handler's
        // setSearchQuery('') side effect did NOT fire while the toast was open.
        const testQuery = 'toast-escape-test'
        await searchInputEl.fill(testQuery)
        await page.waitForTimeout(300)
        const queryBefore = await searchInputEl.inputValue()
        expect(queryBefore, 'search input must hold the typed query before toast').toBe(testQuery)

        // Pop a toast through the canonical test hook.
        await page.waitForFunction(() => typeof window.__toastHooks__?.showToastSpec === 'function', null, {
            timeout: 8000,
            polling: 100
        })
        await page.evaluate(() => {
            window.__toastHooks__?.showToastSpec({
                title: 'Test toast',
                copy: 'Esc should dismiss me only',
                variant: 'info',
                duration: 120000
            })
        })
        await page.waitForFunction(
            () => document.getElementById('experience-reset-toast')?.classList.contains('active') === true,
            null,
            { timeout: 8000, polling: 100 }
        )
        const toast = page.locator('#experience-reset-toast')
        await toast.focus()
        await expect(toast).toBeFocused()

        // Press Escape — MUST dismiss the toast but NOT leave the search surface.
        await toast.press('Escape')
        const surfAfterEsc = await page.evaluate(() => window.__APP_STATE__?.navState?.surface ?? null)
        expect(surfAfterEsc, 'Esc on a toast must NOT drop out of search-surface while the toast dismisses').toBe(
            'search'
        )
        await page.waitForFunction(() => !document.querySelector('#experience-reset-toast.active'), null, {
            timeout: 8000,
            polling: 100
        })

        const surfaceAfter = await page.evaluate(() => window.__APP_STATE__?.navState?.surface ?? null)
        expect(surfaceAfter, 'Esc on a toast must NOT return to overview (double-fire bug)').toBe('search')

        // Strengthened assertion (2026-08-08): the global Escape handler also
        // calls setSearchQuery('') + updateUrlState({ q: null }). If it fired,
        // the input would be cleared. Verify it survived.
        const queryAfter = await searchInputEl.inputValue()
        expect(queryAfter, 'Esc on a toast must NOT clear the search query (global Escape gate)').toBe(testQuery)
    })

    test('W72 UX sweep: no container aria-live on journey chrome + idle filter reset reads plain "Reset"', async ({
        page
    }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const explore = page
            .locator('[data-testid="splash-cta"], button[aria-label="Open in 3D"], [data-testid="placeholder-cta"]')
            .first()
        await explore.waitFor({ state: 'visible', timeout: 60000 })
        await explore.click()

        await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, {
            timeout: 20000,
            polling: 100
        })
        await page.locator('.weather-widget').waitFor({ state: 'attached', timeout: 45000 })

        // First-visit help dialog may auto-open after splash dismissal — close it.
        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
        }

        // (idle) Harmonized invite — gap check for 8b029ac4 / c038df64.
        // 2026-09-11: the M3 idle gate hides #journey-chrome entirely while the
        // journey AND compass are both idle, so the invite is not reachable in
        // pure idle (it renders when the chrome is visible without focus, e.g.
        // compass-active transitions). The harmonized copy is pinned by the
        // structural twin tests (da149c01c); here we mount the chrome via a
        // shim focus and assert the reachable harmonized states.
        await page.evaluate(() => {
            const actions = window.__navActions__
            if (!actions || typeof actions.focusOnNode !== 'function') {
                throw new Error('__navActions__.focusOnNode is not exposed')
            }
            if (!actions.focusOnNode(3)) throw new Error('focusOnNode(3) returned falsy')
        })
        const chrome = page.locator('#journey-chrome')
        await chrome.waitFor({ state: 'attached', timeout: 15000 })

        // (1) Focus a node so the journey stage mounts, then assert the chrome
        // container carries NO live region: trail context/progress text changes on
        // every focus step, and a container-level aria-live spams screen readers
        // while double-announcing the scoped role=status regions inside.
        await expect(chrome, 'container-level aria-live must stay removed (SR announcement spam)').not.toHaveAttribute(
            'aria-live',
            /.+/
        )

        // (2) Idle filter reset button shows plain "Reset" — "Reset (0)" on a
        // disabled control read like it was counting something invisible.
        const resetBtn = page.locator('#filter-clear-btn')
        await expect(resetBtn).toHaveText(/^Reset$/)
        await expect(resetBtn).toBeDisabled()
    })

    test('W73 UX sweep: progress reads Step not Stop with nearby count', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })
        const explore = page
            .locator('[data-testid="splash-cta"], button[aria-label="Open in 3D"], [data-testid="placeholder-cta"]')
            .first()
        await explore.waitFor({ state: 'visible', timeout: 60000 })
        await explore.click()
        await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, {
            timeout: 20000,
            polling: 100
        })
        await page.locator('.weather-widget').waitFor({ state: 'attached', timeout: 45000 })
        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
        }
        await page.evaluate(() => {
            const a = window.__navActions__
            if (!a?.focusOnNode) throw new Error('focusOnNode missing')
            if (!a.focusOnNode(7)) throw new Error('focusOnNode(7) failed')
            // 2026-09-11: the legacy focus shim populates the focus pocket but
            // does not run the journey trail seed (that fires behind the real
            // interaction's CAMERA_NODE_FOCUSED publish — proven by probe: a
            // real canvas click shows "Step 1 · N nearby" immediately). Seed
            // via the sanctioned journey action so the candidate pipeline
            // matches the real user path.
            const actions = window.__APP_ACTIONS__
            if (!actions?.setTrailFromSeed) throw new Error('setTrailFromSeed missing')
            actions.setTrailFromSeed(7)
            // Start the trail like a real interaction does (depth 0 shows the
            // "N nearby to explore" invite; the Step counter needs depth >= 1).
            if (typeof actions.traverseNeighbor !== 'function') throw new Error('traverseNeighbor missing')
            actions.traverseNeighbor(1)
        })
        const progress = page.locator('#focus-stage-progress .progress-text, .progress-text')
        await progress.waitFor({ state: 'visible', timeout: 15000 })
        await expect(progress).toContainText(/Step \d+ · \d+ nearby/)
        // also ensure old jargon is gone
        await expect(progress).not.toContainText(/Stop \d+/)
    })

    test('mobile placeholder reload (persisted engineReady) never shows the scene-timeout error alert (#187)', async ({
        page
    }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        // Seed the persisted-ready flag BEFORE any app script runs — this is
        // the "user entered 3D earlier, now reloads on mobile" flow.
        await page.addInitScript(() => {
            sessionStorage.setItem('semantic-explorer.engineReady', '1')
        })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&placeholder=1`, { waitUntil: 'domcontentloaded' })

        // Give the engine-init safety valve (8s after heavy init starts) its
        // full window plus margin before asserting on the error surface.
        await page.waitForTimeout(9_500)

        // No error overlay may appear over the placeholder…
        await expect(page.locator('[data-loading-state="error"]')).toHaveCount(0)
        await expect(page.locator('[aria-label="Loading failed"]')).toHaveCount(0)
        // …and the user sees the placeholder OR a live scene — never the error
        // alert. (If init finished within the window the placeholder legitimately
        // hands off to the canvas, so either outcome is correct.)
        const outcome = await page.evaluate(() => ({
            placeholder: !!document.querySelector(
                '[data-testid="splash-cta"], button[aria-label="Open in 3D"], [data-testid="placeholder-cta"]'
            ),
            canvas: !!document.querySelector('canvas')
        }))
        expect(outcome.placeholder || outcome.canvas, 'placeholder or live scene must be present').toBe(true)
    })

    test('boot scene upgrades from geometric to the dense semantic mycelium after the threads artifact lands', async ({
        page
    }) => {
        test.setTimeout(180_000)
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const explore = page
            .locator('[data-testid="splash-cta"], button[aria-label="Open in 3D"], [data-testid="placeholder-cta"]')
            .first()
        await explore.waitFor({ state: 'visible', timeout: 60000 })
        await explore.click()

        // Phase 1 — boot settle: geometric mycelium present (any density > 0).
        const booted = await pollFor(
            page,
            () => {
                const s = window.__APP_STATE__ ?? {}
                const d = s.scenePerformanceDiagnostics ?? {}
                return (d.myceliumCoreSegments ?? 0) + (d.myceliumBridgeSegments ?? 0) > 0
            },
            60_000
        )
        expect(booted, 'boot mycelium (geometric fallback) must render').toBe(true)

        // Phase 2 — semantic upgrade: neighbor map arrives, rebuild fires,
        // scene jumps to the dense semantic contract (>100k core segments).
        const upgraded = await pollFor(
            page,
            () => {
                const s = window.__APP_STATE__ ?? {}
                const d = s.scenePerformanceDiagnostics ?? {}
                return (s.semanticNeighborMapByLeadId?.size ?? 0) > 0 && (d.myceliumCoreSegments ?? 0) > 100_000
            },
            120_000
        )
        expect(upgraded, 'semantic rebuild must land the dense contract (core > 100k segments)').toBe(true)

        // Phase 3 — the upgrade must not blank the scene mid-flight: after the
        // swap the canvas still holds the dense group (no pale gap regression).
        const dense = await page.evaluate(() => {
            const s = window.__APP_STATE__ ?? {}
            const d = s.scenePerformanceDiagnostics ?? {}
            return {
                core: d.myceliumCoreSegments ?? 0,
                bridge: d.myceliumBridgeSegments ?? 0,
                mapSize: s.semanticNeighborMapByLeadId?.size ?? 0
            }
        })
        expect(dense.core).toBeGreaterThan(100_000)
        expect(dense.bridge).toBeGreaterThan(10_000)
        expect(dense.mapSize).toBe(8_406)
    })

    test('camera toolbar zoom + reset operate on the live Three camera (regression: inert store-only writes)', async ({
        page
    }) => {
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const explore = page
            .locator('[data-testid="splash-cta"], button[aria-label="Open in 3D"], [data-testid="placeholder-cta"]')
            .first()
        await explore.waitFor({ state: 'visible', timeout: 60000 })
        await explore.click()

        const settled = await pollFor(
            page,
            () => {
                const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
                return (
                    document.body.dataset.graphicsMode === 'webgl' &&
                    document.body.dataset.sceneReady === 'true' &&
                    !!appState.camera &&
                    !!appState.controls
                )
            },
            60000,
            100
        )
        expect(settled, 'desktop boot must publish a ready WebGL scene with camera + controls').toBe(true)

        // Dismiss first-visit help dialog if present — it intercepts pointer
        // events on the camera toolbar (covers bottom-right chrome) and would
        // block the zoom/reset clicks (verified failure: help-dialog blocks
        // Zoom In at 2.0m timeout). Same pattern as other widget-journey
        // desktop boots (see "desktop cold boot" + "5g. Focus-panel" above).
        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }

        const readDist = () =>
            page.evaluate(() => {
                const s = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
                const cam = s.camera
                const t = s.controls?.target
                if (!cam || !t) return null
                const dx = cam.position.x - t.x
                const dy = cam.position.y - t.y
                const dz = cam.position.z - t.z
                return Math.sqrt(dx * dx + dy * dy + dz * dz)
            })

        // Distance-based assertions are robust to idle auto-rotate (rotation
        // preserves the camera-target distance).
        const overviewDist = await readDist()
        expect(overviewDist, 'boot overview camera must sit at a positive distance').toBeGreaterThan(0)

        // Zoom in twice: the LIVE camera distance must shrink (old code: no-op).
        const zoomIn = page.locator('button[aria-label="Zoom in"]')
        await zoomIn.click()
        await page.waitForTimeout(300)
        await zoomIn.click()
        await page.waitForTimeout(300)
        const afterZoomIn = await readDist()
        expect(afterZoomIn, 'zoom-in must dolly the live Three camera closer to the target').toBeLessThan(overviewDist)
        expect(afterZoomIn).toBeCloseTo(overviewDist / 1.2 / 1.2, 2)

        // Reset: back to the canonical overview distance (≈3.764).
        await page.locator('button[aria-label="Reset view"]').click()
        await page.waitForTimeout(500)
        const afterReset = await readDist()
        expect(
            Math.abs((afterReset ?? 0) - overviewDist),
            'reset view must restore the canonical boot overview pose'
        ).toBeLessThan(0.05)
    })

    test('mobile bare boot defaults to map view (3D mycelium stays opt-in)', async ({ page }) => {
        // Mobile-default flip (2026-08-28): fresh mobile boot with no
        // view/surface/placeholder/q/anchor/etc. lands in the Leaflet map
        // (place-first). Previous behavior was galaxy/placeholder-2d.
        await page.setViewportSize({ width: 375, height: 667 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        await page.waitForFunction(() => window.__APP_STATE__?.currentView === 'map', null, {
            timeout: 20000,
            polling: 100
        })
        expect(
            await page.evaluate(() => window.__APP_STATE__?.currentView),
            'fresh mobile boot with no view param must land in the map view (3D stays opt-in)'
        ).toBe('map')
    })
})
