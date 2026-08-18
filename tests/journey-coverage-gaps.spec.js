/**
 * journey-coverage-gaps.spec.js — Journey DOM coverage for 4 gap components
 *
 * Components tested:
 *   1. CompassRail.svelte          — #compass-rail, .compass-step buttons
 *   2. CompassStepIndicators.svelte — [data-journey-step] inside #journey-compass
 *   3. AppBoot.svelte              — window.__forceSemanticDiveContractSurface hook
 *   4. SearchErrorState.svelte     — .search-error-state error card
 *
 * Pattern source: tests/widget-journey.spec.js
 * Each test is self-contained: setViewport → goto → poll settle → act → assert.
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

// ── Helpers ──────────────────────────────────────────────────────────────────
const APP_PATH = '/dist/svelte/index.html'
const BOOT_URL = `${BASE_URL}${APP_PATH}?nodemo=1&webgl=1`

/** Wait for the app to publish a ready WebGL scene. */
async function waitForSceneReady(page) {
    return pollFor(
        page,
        () => {
            const appState = window.__APP_STATE__ ?? {}
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
}

/** Dismiss first-visit help dialog if open. */
async function dismissHelpDialog(page) {
    const helpDialog = page.locator('dialog.help-dialog[open]')
    if ((await helpDialog.count()) > 0) {
        await page.keyboard.press('Escape')
        await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
        await page.waitForTimeout(200)
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. CompassRail.svelte
//    Visible when focusActive && !compact. Driven via window.__navActions__.setSurface.
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('CompassRail journey', () => {
    test('happy-path: rail mounts with 6 step buttons after setSurface(focus)', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(BOOT_URL, { waitUntil: 'domcontentloaded' })
        const settled = await waitForSceneReady(page)
        expect(settled, 'app must publish a ready WebGL scene before asserting on DOM').toBe(true)
        await dismissHelpDialog(page)

        // Rail needs both surface='focus' AND a focusedIndex (isFocusSurfaceActive requires
        // either focusedIndex != null or navMode matching). Without a focused index the rail
        // stays invisible even though setSurface('focus') was called.
        await page.waitForFunction(() => !!window.__navActions__?.setSurface, { timeout: 5000 })
        await page.evaluate(() => {
            window.__navActions__?.setSurface?.('focus')
            window.__navActions__?.setFocusedIndex?.(0)
        })
        await page.waitForTimeout(2000)

        const rail = page.locator('#compass-rail')
        await rail.waitFor({ state: 'attached', timeout: 15000 })

        const steps = rail.locator('.compass-step')
        const count = await steps.count()
        expect(count, 'compass rail must render 6 journey phase steps').toBe(6)

        const firstLabel = await steps.nth(0).getAttribute('aria-label')
        expect(firstLabel, 'first compass step must have aria-label').toMatch(/Navigate to/)

        await expect(rail).toHaveAttribute('aria-label', 'Journey compass')

        // At focus mode with focusedIndex=0, exactly one step should be .current.
        const currentCount = await rail.locator('.compass-step.current').count()
        expect(currentCount, 'exactly one step must be .current on the rail').toBe(1)
    })

    test('edge: canonical visible Search chip transitions navMode to search', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(BOOT_URL, { waitUntil: 'domcontentloaded' })
        const settled = await waitForSceneReady(page)
        expect(settled, 'app must publish a ready WebGL scene before asserting on DOM').toBe(true)
        await dismissHelpDialog(page)

        // Rail needs both surface='focus' AND a focusedIndex to be visible.
        await page.waitForFunction(() => !!window.__navActions__?.setSurface, { timeout: 5000 })
        await page.evaluate(() => {
            window.__navActions__?.setSurface?.('focus')
            window.__navActions__?.setFocusedIndex?.(0)
        })
        await page.waitForTimeout(2000)

        const preMode = await page.evaluate(() => window.__APP_STATE__?.navState?.mode)
        expect(preMode).toBe('focus')

        // Click the Search step via evaluate — rail is positioned off-screen in headless,
        // so a direct DOM click bypasses the Playwright visibility gate.
        const clicked = await page.evaluate(() => {
            const btn = document.querySelector('#compass-rail .compass-step[aria-label*="Search"]')
            if (btn) { btn.click(); return true }
            return false
        })
        expect(clicked, 'search step must exist on the rail').toBe(true)
        await page.waitForTimeout(1500)

        const postSettled = await pollFor(
            page,
            () => {
                const mode = window.__APP_STATE__?.navState?.mode
                const surface = document.body.dataset?.panelSurface
                return mode === 'search' || surface === 'search' || surface === 'focus-search'
            },
            15000,
            100
        )
        expect(postSettled, 'clicking search step must transition to a search-related mode').toBe(true)
    })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 2. CompassStepIndicators.svelte
//    Renders inside #journey-compass. Spans have data-journey-step + class journey-compass-step,
//    with .current and .done. 6 phases: overview, search, focus, trail, inside, map.
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('CompassStepIndicators journey', () => {
    test('happy-path: indicators render with overview as current at boot', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(BOOT_URL, { waitUntil: 'domcontentloaded' })
        const settled = await waitForSceneReady(page)
        expect(settled, 'app must publish a ready WebGL scene before asserting on DOM').toBe(true)
        // Query indicators BEFORE dismissing the help dialog — dismissing routes
        // focus into #search-input which creates an empty search summary and
        // flips the compass phase to 'search'. The DOM is queryable via evaluate
        // regardless of whether the dialog is open.
        const snapshot = await page.evaluate(() => {
            const indicators = document.querySelectorAll('#journey-compass [data-journey-step]')
            const current = document.querySelector('#journey-compass [data-journey-step].current')
            return {
                count: indicators.length,
                currentPhase: current?.getAttribute('data-journey-step') ?? null,
                overviewCurrent: current?.getAttribute('data-journey-step') === 'overview',
                firstAria: indicators[0]?.getAttribute('aria-label') ?? null
            }
        })

        expect(snapshot.count, 'journey-compass must render 6 step indicators').toBe(6)
        expect(snapshot.currentPhase, 'overview boot must have a current step').toBe('overview')
        expect(snapshot.overviewCurrent, 'overview must be .current at boot').toBe(true)
        expect(snapshot.firstAria, 'first indicator must have aria-label').toMatch(/\d+\.\s+\w+:/)
    })

    test('edge: indicator .current moves after setSurface search + setJourneyPhase', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(BOOT_URL, { waitUntil: 'domcontentloaded' })
        const settled = await waitForSceneReady(page)
        expect(settled, 'app must publish a ready WebGL scene before asserting on DOM').toBe(true)
        await dismissHelpDialog(page)

        // Record current phase at overview.
        const overviewCurrent = await page.evaluate(() => {
            const el = document.querySelector('#journey-compass [data-journey-step].current')
            return el?.getAttribute('data-journey-step') ?? null
        })
        expect(overviewCurrent, 'must have a current step at overview').not.toBeNull()

        // Drive nav to search surface AND update the journey compass phase.
        await page.waitForFunction(() => !!window.__navActions__, { timeout: 5000 })
        await page.evaluate(() => window.__navActions__?.setSurface?.('search'))
        await page.evaluate(() => {
            // journeyStore is exposed as __journeyStore__ on window (test-globals.ts).
            window.__journeyStore__?.update?.((s) => ({ ...s, phase: 'search' }))
        })
        await page.waitForTimeout(2000)

        const searchSnapshot = await page.evaluate(() => {
            const current = document.querySelector('#journey-compass [data-journey-step].current')
            const overviewEl = document.querySelector('#journey-compass [data-journey-step="overview"]')
            return {
                currentPhase: current?.getAttribute('data-journey-step') ?? null,
                overviewDone: overviewEl?.classList.contains('done') ?? false
            }
        })
        expect(searchSnapshot.currentPhase, 'search step must become .current').toBe('search')
        expect(searchSnapshot.overviewDone, 'overview step must be .done after transitioning forward').toBe(true)
    })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 3. AppBoot.svelte
//    Pure side-effect component. Exposes window.__forceSemanticDiveContractSurface.
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('AppBoot journey', () => {
    test('happy-path: __forceSemanticDiveContractSurface is installed and callable', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(BOOT_URL, { waitUntil: 'domcontentloaded' })
        const settled = await waitForSceneReady(page)
        expect(settled, 'app must publish a ready WebGL scene before asserting on DOM').toBe(true)
        await dismissHelpDialog(page)

        const hookPresent = await page.evaluate(() => {
            return typeof window.__forceSemanticDiveContractSurface === 'function'
        })
        expect(hookPresent, 'AppBoot must install __forceSemanticDiveContractSurface on window').toBe(true)
    })

    test('edge: calling hook sets body surface classes and shows #focus-stage', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(BOOT_URL, { waitUntil: 'domcontentloaded' })
        const settled = await waitForSceneReady(page)
        expect(settled, 'app must publish a ready WebGL scene before asserting on DOM').toBe(true)
        await dismissHelpDialog(page)

        await page.evaluate(() => {
            const hook = window.__forceSemanticDiveContractSurface
            if (typeof hook !== 'function') throw new Error('__forceSemanticDiveContractSurface not installed')
            hook()
        })
        await page.waitForTimeout(1000)

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
//    Rendered by SearchResults.svelte when searchError.type==='full'.
//    Error block classes: .search-error-state (root), .search-error-kicker,
//    .search-error-text strong, .search-error-retry-btn, .search-error-dismiss-btn,
//    .search-error-technical details[data-testid="search-error-detail"].
//
//    Trigger: route /api.php?action=semantic_search to 503, fill #search-input, Enter.
//    Pattern: tests/widget-journey.spec.js BUG-6 test (~line 1485).
// ═══════════════════════════════════════════════════════════════════════════════
test.describe('SearchErrorState journey', () => {
    test('happy-path: search error card renders with retry + dismiss buttons', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.addInitScript(() => {
            try {
                localStorage.setItem(
                    'moco_onboarding_seen_v1',
                    JSON.stringify({ seen: true, seenAt: new Date().toISOString() })
                )
            } catch {
                /* best-effort */
            }
        })

        // Intercept semantic_search to force a 503 so the error card renders.
        await page.route(
            (url) => {
                const parsed = new URL(url)
                return parsed.pathname.endsWith('/api.php') && parsed.searchParams.get('action') === 'semantic_search'
            },
            async (route) => {
                await route.fulfill({
                    status: 503,
                    contentType: 'application/json',
                    body: JSON.stringify({ ok: false, error: 'forced-journey-coverage-gaps' })
                })
            }
        )
        await page.route(
            (url) => {
                const parsed = new URL(url)
                return (
                    parsed.pathname.endsWith('/api.php') &&
                    parsed.searchParams.get('action') === 'semantic_lane_health'
                )
            },
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ ok: true, state: 'healthy' })
                })
            }
        )

        await page.goto(`${BOOT_URL}&staticDev=0`, { waitUntil: 'domcontentloaded' })
        await page.waitForLoadState('load', { timeout: 10000 }).catch(() => {})
        await page
            .waitForFunction(() => document.body.dataset.surfaceSettled === 'true', null, { timeout: 8000 })
            .catch(() => {})

        // Dismiss first-visit help dialog.
        const helpDialog = page.locator('dialog.help-dialog[open]')
        if (await helpDialog.isVisible().catch(() => false)) {
            await helpDialog.locator('button').first().click().catch(() => {})
            await page
                .waitForFunction(() => {
                    const d = document.querySelector('dialog.help-dialog')
                    return !d || !d.open
                }, null, { timeout: 5000 })
                .catch(() => {})
        }
        await page.waitForSelector('#search-input', { state: 'visible', timeout: 30000 })

        await page.locator('#search-input').first().fill('coffee')
        await page.waitForFunction(
            () => {
                const el = document.querySelector('#search-input')
                return !!el && el.value === 'coffee'
            },
            null,
            { timeout: 5000 }
        ).catch(() => {})

        await expect(page.locator('.search-error-state')).toBeVisible({ timeout: 45000 })
        await expect(page.locator('.search-error-kicker')).toHaveText('Retry needed')
        // 503 triggers the HTTP 5xx branch in friendlyErrorMessage → "The server is having trouble"
        await expect(page.locator('.search-error-text strong')).toHaveText('The server is having trouble')

        const retryBtn = page.locator('.search-error-retry-btn')
        const dismissBtn = page.locator('.search-error-dismiss-btn')
        await expect(retryBtn).toBeVisible()
        await expect(retryBtn).toHaveAttribute('aria-label', /Retry search for coffee/i)
        await expect(dismissBtn).toBeVisible()
        await expect(dismissBtn).toHaveAttribute('aria-label', 'Clear search and dismiss')

        const techDetails = page.locator('[data-testid="search-error-detail"], .search-error-technical')
        await expect(techDetails).toContainText('HTTP status 503')
    })

    test('edge: dismiss button clears the error state from DOM', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.addInitScript(() => {
            try {
                localStorage.setItem(
                    'moco_onboarding_seen_v1',
                    JSON.stringify({ seen: true, seenAt: new Date().toISOString() })
                )
            } catch {
                /* best-effort */
            }
        })

        await page.route(
            (url) => {
                const parsed = new URL(url)
                return parsed.pathname.endsWith('/api.php') && parsed.searchParams.get('action') === 'semantic_search'
            },
            async (route) => {
                await route.fulfill({
                    status: 503,
                    contentType: 'application/json',
                    body: JSON.stringify({ ok: false, error: 'forced-dismiss-test' })
                })
            }
        )
        await page.route(
            (url) => {
                const parsed = new URL(url)
                return (
                    parsed.pathname.endsWith('/api.php') &&
                    parsed.searchParams.get('action') === 'semantic_lane_health'
                )
            },
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ ok: true, state: 'healthy' })
                })
            }
        )

        await page.goto(`${BOOT_URL}&staticDev=0`, { waitUntil: 'domcontentloaded' })
        await page.waitForLoadState('load', { timeout: 10000 }).catch(() => {})
        await page
            .waitForFunction(() => document.body.dataset.surfaceSettled === 'true', null, { timeout: 8000 })
            .catch(() => {})

        const helpDialog = page.locator('dialog.help-dialog[open]')
        if (await helpDialog.isVisible().catch(() => false)) {
            await helpDialog.locator('button').first().click().catch(() => {})
            await page
                .waitForFunction(() => {
                    const d = document.querySelector('dialog.help-dialog')
                    return !d || !d.open
                }, null, { timeout: 5000 })
                .catch(() => {})
        }
        await page.waitForSelector('#search-input', { state: 'visible', timeout: 30000 })

        await page.locator('#search-input').first().fill('coffee')
        await page.waitForFunction(
            () => {
                const el = document.querySelector('#search-input')
                return !!el && el.value === 'coffee'
            },
            null,
            { timeout: 5000 }
        ).catch(() => {})

        await expect(page.locator('.search-error-state')).toBeVisible({ timeout: 45000 })

        await page.locator('.search-error-dismiss-btn').click()

        await expect(page.locator('.search-error-state')).toBeHidden({ timeout: 15000 })

        const queryValue = await page.inputValue('#search-input')
        expect(queryValue, 'dismiss must clear the search input').toBe('')
    })
})
