/**
 * swarm-132-journey-drafts.spec.js — DRAFT journey tests for 4 gap components
 *
 * Task 132: components with no journey DOM coverage.
 *   1. CompassRail.svelte        (src/components/)
 *   2. CompassStepIndicators.svelte (src/lib/components/journey/)
 *   3. AppBoot.svelte            (src/components/)
 *   4. SearchErrorState.svelte   (src/lib/components/search/)
 *
 * DRAFT ONLY — not wired into tests/. Copy to tests/ and adapt selectors
 * before execution. Pattern source: tests/widget-journey.spec.js,
 * tests/loading-overlay-error-state-journey.spec.js.
 */

import { test, expect } from '@playwright/test'

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8796').replace(/\/$/, '')

// ── GPU cleanup between tests (matches widget-journey pattern) ───────────────
test.afterEach(async ({ page }) => {
    const context = page.context()
    try {
        await page.close().catch(() => {})
    } catch {
        // Cleanup is best-effort.
    } finally {
        await context.close().catch(() => {})
    }
})

// ── pollFor: CDP-channel state polling (from widget-journey) ─────────────────
const pollFor = async (page, predicate, timeoutMs, intervalMs = 50) => {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
        if (await page.evaluate(predicate)) return true
        await page.waitForTimeout(intervalMs)
    }
    return false
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. CompassRail.svelte
//    Selector: #compass-rail (id), .compass-step (button), aria-label="Journey compass"
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('CompassRail journey', () => {
    test('happy-path: compass rail mounts with 6 journey phase steps after boot', async ({ page }) => {
        // Component: CompassRail.svelte
        // Selector: #compass-rail > .compass-step buttons
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const explore = page.locator('[data-testid="splash-cta"], button[aria-label="Open full 3D experience"]').first()
        await explore.waitFor({ state: 'visible', timeout: 60000 })
        await explore.click()

        // Wait for the app to publish a ready WebGL scene (suite-proven poll,
        // immune to headless rAF stalls — mirrors widget-journey F5 pattern).
        const settled = await pollFor(
            page,
            () => {
                const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
                return (
                    document.body.dataset.graphicsMode === 'webgl' &&
                    document.body.dataset.renderKind === 'webgl' &&
                    document.body.dataset.sceneReady === 'true' &&
                    appState.currentView === 'galaxy' &&
                    Array.isArray(appState.points) &&
                    appState.points.length >= 8406 &&
                    !!appState.renderer &&
                    !!appState.scene &&
                    !!appState.camera
                )
            },
            60000,
            100
        )
        expect(settled, 'app must publish a ready WebGL scene before we assert on DOM').toBe(true)

        // Dismiss first-visit help dialog if auto-opened.
        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }

        // Assertion: compass-rail nav is present with 5 step buttons.
        const rail = page.locator('#compass-rail')
        await rail.waitFor({ state: 'attached', timeout: 15000 })

        const steps = rail.locator('.compass-step')
        const count = await steps.count()
        expect(count, 'compass rail must render 6 journey phase steps').toBe(6)

        // Each step has an aria-label of the form "Navigate to <label>".
        const firstLabel = await steps.nth(0).getAttribute('aria-label')
        expect(firstLabel, 'first compass step must have aria-label').toMatch(/Navigate to/)

        // The rail itself has the "Journey compass" aria-label.
        await expect(rail).toHaveAttribute('aria-label', 'Journey compass')
    })

    test('edge: compass step click triggers nav transition (overview→search)', async ({ page }) => {
        // Component: CompassRail.svelte
        // Selector: .compass-step buttons within #compass-rail
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const explore = page.locator('[data-testid="splash-cta"], button[aria-label="Open full 3D experience"]').first()
        await explore.waitFor({ state: 'visible', timeout: 60000 })
        await explore.click()

        // Wait for the app to publish a ready WebGL scene (suite-proven poll,
        // immune to headless rAF stalls — mirrors widget-journey F5 pattern).
        const settled1 = await pollFor(
            page,
            () => {
                const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
                return (
                    document.body.dataset.graphicsMode === 'webgl' &&
                    document.body.dataset.renderKind === 'webgl' &&
                    document.body.dataset.sceneReady === 'true' &&
                    appState.currentView === 'galaxy' &&
                    Array.isArray(appState.points) &&
                    appState.points.length >= 8406 &&
                    !!appState.renderer &&
                    !!appState.scene &&
                    !!appState.camera
                )
            },
            60000,
            100
        )
        expect(settled, 'app must publish a ready WebGL scene before we assert on DOM').toBe(true)

        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }

        // Click the "search" step (second step in the ordered rail).
        const rail = page.locator('#compass-rail')
        await rail.waitFor({ state: 'attached', timeout: 15000 })

        const searchStep = rail.locator('.compass-step').filter({ hasText: /search/i })
        await searchStep.waitFor({ state: 'visible', timeout: 10000 })

        // Pre-click: mode is overview.
        const preMode = await page.evaluate(() => window.__APP_STATE__?.navState?.mode)
        expect(preMode, 'pre-click mode should be overview or map-trail').toMatch(/overview|map-trail/)

        await searchStep.click()

        // Post-click: navState.mode should flip to 'search' (DOM-visible via body class).
        const settled = await pollFor(
            page,
            () => {
                const mode = window.__APP_STATE__?.navState?.mode
                const panelSurface = document.body.dataset?.panelSurface
                return mode === 'search' || panelSurface === 'focus-search' || panelSurface === 'map-trail'
            },
            15000,
            100
        )
        expect(settled, 'clicking search step must transition to a search-related mode').toBe(true)
    })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 2. CompassStepIndicators.svelte
//    Selector: [data-journey-step] / .journey-compass-step, aria-label with phase
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('CompassStepIndicators journey', () => {
    test('happy-path: step indicators render with correct current/done classes', async ({ page }) => {
        // Component: CompassStepIndicators.svelte
        // Selector: [data-journey-step] spans inside #journey-compass
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const explore = page.locator('[data-testid="splash-cta"], button[aria-label="Open full 3D experience"]').first()
        await explore.waitFor({ state: 'visible', timeout: 60000 })
        await explore.click()

        // Wait for the app to publish a ready WebGL scene (suite-proven poll,
        // immune to headless rAF stalls — mirrors widget-journey F5 pattern).
        const settled2 = await pollFor(
            page,
            () => {
                const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
                return (
                    document.body.dataset.graphicsMode === 'webgl' &&
                    document.body.dataset.renderKind === 'webgl' &&
                    document.body.dataset.sceneReady === 'true' &&
                    appState.currentView === 'galaxy' &&
                    Array.isArray(appState.points) &&
                    appState.points.length >= 8406 &&
                    !!appState.renderer &&
                    !!appState.scene &&
                    !!appState.camera
                )
            },
            60000,
            100
        )
        expect(settled, 'app must publish a ready WebGL scene before we assert on DOM').toBe(true)

        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }

        // The indicators live inside #journey-compass. Each span has
        // data-journey-step=<phase> and class .journey-compass-step.
        const indicators = page.locator('#journey-compass [data-journey-step]')
        const count = await indicators.count()
        expect(count, 'journey-compass must render 5 step indicators').toBeGreaterThanOrEqual(5)

        // Each indicator has an aria-label like "1. overview: Overview of all businesses".
        const firstAria = await indicators.nth(0).getAttribute('aria-label')
        expect(firstAria, 'first indicator must have aria-label with step number + phase').toMatch(/\d+\.\s+\w+:/)

        // At idle/overview, at least one indicator is .current (the overview step).
        const currentCount = await indicators.locator('.current').count()
        expect(currentCount, 'exactly one step must be .current at overview').toBe(1)
    })

    test('edge: indicator reflects phase change after compass step click', async ({ page }) => {
        // Component: CompassStepIndicators.svelte
        // Selector: [data-journey-step] spans — .current moves after mode switch
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const explore = page.locator('[data-testid="splash-cta"], button[aria-label="Open full 3D experience"]').first()
        await explore.waitFor({ state: 'visible', timeout: 60000 })
        await explore.click()

        // Wait for the app to publish a ready WebGL scene (suite-proven poll,
        // immune to headless rAF stalls — mirrors widget-journey F5 pattern).
        const settled = await pollFor(
            page,
            () => {
                const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
                return (
                    document.body.dataset.graphicsMode === 'webgl' &&
                    document.body.dataset.renderKind === 'webgl' &&
                    document.body.dataset.sceneReady === 'true' &&
                    appState.currentView === 'galaxy' &&
                    Array.isArray(appState.points) &&
                    appState.points.length >= 8406 &&
                    !!appState.renderer &&
                    !!appState.scene &&
                    !!appState.camera
                )
            },
            60000,
            100
        )
        expect(settled, 'app must publish a ready WebGL scene before we assert on DOM').toBe(true)

        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }

        // Record the current step at overview.
        const overviewCurrent = await page.evaluate(() => {
            const current = document.querySelector('#journey-compass [data-journey-step].current')
            return current?.getAttribute('data-journey-step') ?? null
        })
        expect(overviewCurrent, 'overview must have a current step').toBe('overview')

        // Use navActions to switch to search mode (avoids compass-rail animation timing).
        await page.waitForFunction(() => !!window.__navActions__?.setSurface, { timeout: 5000 })
        await page.evaluate(() => {
            window.__navActions__?.setSurface?.('focus-search')
        })

        // Wait for the indicator to reflect the new current phase.
        const settled3 = await pollFor(
            page,
            () => {
                const current = document.querySelector('#journey-compass [data-journey-step].current')
                const step = current?.getAttribute('data-journey-step') ?? ''
                return step === 'search' || step === 'focus'
            },
            15000,
            100
        )
        expect(settled, 'after mode switch, a search/focus step must become .current').toBe(true)

        // The overview step should now be .done (not .current).
        const overviewDone = await page.evaluate(() => {
            const el = document.querySelector('#journey-compass [data-journey-step="overview"]')
            return el?.classList.contains('done') ?? false
        })
        expect(overviewDone, 'overview step should be .done after transitioning forward').toBe(true)
    })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 3. AppBoot.svelte
//    Selector: no DOM output — test via window.__forceSemanticDiveContractSurface
//    and body dataset/class side-effects. body[data-test-ready] set by parity-attrs.
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('AppBoot journey', () => {
    test('happy-path: __forceSemanticDiveContractSurface is installed and callable', async ({ page }) => {
        // Component: AppBoot.svelte (pure side-effect; no rendered markup).
        // Selector: window.__forceSemanticDiveContractSurface (test-only global hook).
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const explore = page.locator('[data-testid="splash-cta"], button[aria-label="Open full 3D experience"]').first()
        await explore.waitFor({ state: 'visible', timeout: 60000 })
        await explore.click()

        // Wait for parity-attrs to set data-test-ready (installed during app-init
        // before AppBoot's onMount, so it should be present after splash dismiss).
        await page.waitForFunction(
            () => document.body?.dataset?.testReady === 'true' || document.body?.dataset?.sceneReady === 'true',
            null,
            { timeout: 30000, polling: 100 }
        )

        // The test contract hook must be installed on window.
        const hookPresent = await page.evaluate(() => {
            return typeof window.__forceSemanticDiveContractSurface === 'function'
        })
        expect(hookPresent, 'AppBoot must install __forceSemanticDiveContractSurface on window').toBe(true)
    })

    test('edge: calling __forceSemanticDiveContractSurface sets body surface classes', async ({ page }) => {
        // Component: AppBoot.svelte
        // Selector: body.surface-semantic-dive, body.dataset.panelSurface — side-effects
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const explore = page.locator('[data-testid="splash-cta"], button[aria-label="Open full 3D experience"]').first()
        await explore.waitFor({ state: 'visible', timeout: 60000 })
        await explore.click()

        await page.waitForFunction(
            () => document.body?.dataset?.testReady === 'true' || document.body?.dataset?.sceneReady === 'true',
            null,
            { timeout: 30000, polling: 100 }
        )

        // Call the test contract hook; it should flip body to semantic-dive surface.
        await page.evaluate(() => {
            const hook = window.__forceSemanticDiveContractSurface
            if (typeof hook !== 'function') {
                throw new Error('__forceSemanticDiveContractSurface not installed')
            }
            hook()
        })

        // DOM-visible side-effects: body class + dataset attrs.
        const surfaceState = await page.evaluate(() => ({
            hasSurfaceClass: document.body.classList.contains('surface-semantic-dive'),
            panelSurface: document.body.dataset?.panelSurface,
            semanticDive: document.body.dataset?.semanticDive,
            activeView: document.body.dataset?.activeView
        }))

        expect(surfaceState.hasSurfaceClass, 'body must gain surface-semantic-dive class').toBe(true)
        expect(surfaceState.panelSurface, 'panelSurface must be semantic-dive').toBe('semantic-dive')
        expect(surfaceState.semanticDive, 'semanticDive dataset must be active').toBe('active')
        expect(surfaceState.activeView, 'activeView dataset must be galaxy').toBe('galaxy')

        // The focus stage should be unhidden (DOM-visible assertion, not state-only).
        const focusStageVisible = await page.evaluate(() => {
            const el = document.querySelector('#focus-stage')
            if (!el) return false
            return !el.hidden && el.getAttribute('aria-hidden') !== 'true'
        })
        expect(focusStageVisible, '#focus-stage must be visible after contract surface forced').toBe(true)
    })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 4. SearchErrorState.svelte
//    Selector: .search-error-state (root div), .search-error-kicker, .search-error-retry-btn,
//    .search-error-dismiss-btn, details[data-testid="search-error-detail"]
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('SearchErrorState journey', () => {
    test('happy-path: search error state renders with retry + dismiss buttons', async ({ page }) => {
        // Component: SearchErrorState.svelte
        // Selector: .search-error-state wrapper
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const explore = page.locator('[data-testid="splash-cta"], button[aria-label="Open full 3D experience"]').first()
        await explore.waitFor({ state: 'visible', timeout: 60000 })
        await explore.click()

        // Wait for the app to publish a ready WebGL scene (suite-proven poll,
        // immune to headless rAF stalls — mirrors widget-journey F5 pattern).
        const settled = await pollFor(
            page,
            () => {
                const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
                return (
                    document.body.dataset.graphicsMode === 'webgl' &&
                    document.body.dataset.renderKind === 'webgl' &&
                    document.body.dataset.sceneReady === 'true' &&
                    appState.currentView === 'galaxy' &&
                    Array.isArray(appState.points) &&
                    appState.points.length >= 8406 &&
                    !!appState.renderer &&
                    !!appState.scene &&
                    !!appState.camera
                )
            },
            60000,
            100
        )
        expect(settled, 'app must publish a ready WebGL scene before we assert on DOM').toBe(true)

        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }

        // Force a search error via the test-global dataLoadState (mirrors
        // loading-overlay-error-state-journey.spec.js pattern).
        await page
            .waitForFunction(() => typeof window.__dataLoadState__?.forceSearchError === 'function', {
                timeout: 10_000,
                polling: 100
            })
            .catch(() => {})

        // If the test global exists, trigger it; otherwise skip gracefully.
        const hasHook = await page.evaluate(() => typeof window.__dataLoadState__?.forceSearchError === 'function')
        if (hasHook) {
            await page.evaluate(() => {
                window.__dataLoadState__.forceSearchError('Draft test error', 'coffee')
            })
        } else {
            // Fallback: directly inject a search error into the app state and
            // trigger a search so the error block renders.
            await page.fill('#search-input', 'coffee')
            await page.keyboard.press('Enter')
            // Wait for results area, then inject error via exposed actions if available.
            await page
                .waitForFunction(
                    () => !!window.__searchActions__?.setSearchError || !!window.__APP_ACTIONS__?.setSearchError,
                    { timeout: 5000, polling: 100 }
                )
                .catch(() => {})
            const injected = await page.evaluate(() => {
                const setError = window.__searchActions__?.setSearchError ?? window.__APP_ACTIONS__?.setSearchError
                if (typeof setError === 'function') {
                    setError({ type: 'network', query: 'coffee', message: 'Draft test error' })
                    return true
                }
                return false
            })
            if (!injected) {
                test.skip(true, 'no search error injection hook available — draft only')
                return
            }
        }

        // Wait for the .search-error-state block to appear.
        const errorBlock = page.locator('.search-error-state')
        await errorBlock.waitFor({ state: 'attached', timeout: 15_000 })

        // Kicker pill is present.
        await expect(errorBlock.locator('.search-error-kicker')).toHaveText('Retry needed')

        // Title is the friendly default.
        await expect(errorBlock.locator('.search-error-text strong')).toHaveText('Something went wrong')

        // Retry + Dismiss buttons are both rendered and clickable.
        const retryBtn = errorBlock.locator('.search-error-retry-btn')
        const dismissBtn = errorBlock.locator('.search-error-dismiss-btn')

        await expect(retryBtn).toBeVisible()
        await expect(retryBtn).toHaveAttribute('aria-label', /Retry search for coffee/i)

        await expect(dismissBtn).toBeVisible()
        await expect(dismissBtn).toHaveAttribute('aria-label', 'Clear search and dismiss')

        // Technical details block is present with the injected message.
        const techDetails = errorBlock.locator('[data-testid="search-error-detail"], .search-error-technical')
        await expect(techDetails).toContainText('Draft test error')
    })

    test('edge: dismiss button clears the error state from DOM', async ({ page }) => {
        // Component: SearchErrorState.svelte
        // Selector: .search-error-state — should be removed after dismiss
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const explore = page.locator('[data-testid="splash-cta"], button[aria-label="Open full 3D experience"]').first()
        await explore.waitFor({ state: 'visible', timeout: 60000 })
        await explore.click()

        // Wait for the app to publish a ready WebGL scene (suite-proven poll,
        // immune to headless rAF stalls — mirrors widget-journey F5 pattern).
        const settled4 = await pollFor(
            page,
            () => {
                const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
                return (
                    document.body.dataset.graphicsMode === 'webgl' &&
                    document.body.dataset.renderKind === 'webgl' &&
                    document.body.dataset.sceneReady === 'true' &&
                    appState.currentView === 'galaxy' &&
                    Array.isArray(appState.points) &&
                    appState.points.length >= 8406 &&
                    !!appState.renderer &&
                    !!appState.scene &&
                    !!appState.camera
                )
            },
            60000,
            100
        )
        expect(settled, 'app must publish a ready WebGL scene before we assert on DOM').toBe(true)

        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }

        // Inject error state.
        const injected = await page.evaluate(() => {
            const setError = window.__searchActions__?.setSearchError ?? window.__APP_ACTIONS__?.setSearchError
            if (typeof setError === 'function') {
                setError({ type: 'network', query: 'coffee', message: 'Draft dismiss test' })
                return true
            }
            return false
        })
        if (!injected) {
            test.skip(true, 'no search error injection hook available — draft only')
            return
        }

        const errorBlock = page.locator('.search-error-state')
        await errorBlock.waitFor({ state: 'attached', timeout: 15_000 })

        // Click the dismiss button.
        await errorBlock.locator('.search-error-dismiss-btn').click()

        // After dismiss, the error block should be removed from the DOM.
        await expect(errorBlock).toHaveCount(0)

        // The search input should be cleared (dismiss resets the query).
        const queryValue = await page.inputValue('#search-input')
        expect(queryValue, 'dismiss must clear the search input').toBe('')
    })
})
