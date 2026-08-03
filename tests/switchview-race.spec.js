import { test, expect } from '@playwright/test'

/**
 * Regression test: switchView must not allow a stale prelude timer to override
 * a subsequent switchView call when the user changes view target rapidly.
 *
 * Bug: The setTimeout in switchView (terrain prelude) checked `state.currentView !== 'galaxy'`
 * only AFTER the timer fired. If switchView was called twice in quick succession — first to
 * map (with prelude), then back to galaxy before the 430ms timer fired — the timer would
 * still fire and call switchView('map') with stale options, overriding the galaxy target.
 *
 * Fix: Added `state.currentView !== 'galaxy'` guard inside the timer callback, and a defensive
 * early-return at the top of switchView when the view is already current.
 *
 * Repaired 2026-08-03: the original spec drove switchView through the dead legacy
 * #btn-map/#btn-galaxy buttons (zero render sites since the controls overlay was retired;
 * f0bceb84 removed the bindings). The tests now drive the real switchView function via the
 * Playwright test-globals hook (window.__navActions__.switchView), keeping the exact race
 * semantics + body.dataset.activeView parity assertions. Runs against the standard dist
 * server (port 8796, auto-booted by playwright.config) instead of a manual 9876 dev server.
 */
test.describe('switchView race condition regression', () => {
    test('rapid switchView calls settle without the prelude timer overriding the final view', async ({ page }) => {
        test.setTimeout(90000) // WebGL boot under concurrent load can exceed 60s (flaky under parallel tsc/worker load, 2026-08-03)
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${process.env.TEST_BASE_URL || 'http://127.0.0.1:8796'}/dist/svelte/index.html?nodemo=1`, {
            waitUntil: 'domcontentloaded'
        })

        // App boot + scene init; __navActions__ is installed by test-globals.ts at init.
        await page.waitForFunction(() => typeof window.__navActions__?.switchView === 'function', { timeout: 40000 })

        // Switch to map through the real switchView function (prelude path).
        await page.evaluate(() => window.__navActions__.switchView('map'))
        await page.waitForFunction(() => document.body.dataset.activeView === 'map', { timeout: 15000, polling: 50 })

        // Rapidly switch back to galaxy — before any prelude timer could fire.
        await page.evaluate(() => window.__navActions__.switchView('galaxy'))

        // The body dataset must reflect galaxy, not be overridden by a stale map prelude.
        await page.waitForFunction(() => document.body.dataset.activeView === 'galaxy', null, {
            timeout: 5000,
            polling: 50
        })
        const activeView = await page.evaluate(() => document.body.dataset.activeView)
        expect(activeView).toBe('galaxy')

        // The stale prelude timer may still fire (up to 430ms later); it must no-op.
        await page.waitForTimeout(700)
        expect(
            await page.evaluate(() => document.body.dataset.activeView),
            'stale prelude must not override galaxy'
        ).toBe('galaxy')
    })

    test('switchView returns early when called with the already-current view', async ({ page }) => {
        test.setTimeout(90000) // WebGL boot under concurrent load can exceed 60s (flaky under parallel tsc/worker load, 2026-08-03)
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${process.env.TEST_BASE_URL || 'http://127.0.0.1:8796'}/dist/svelte/index.html?nodemo=1`, {
            waitUntil: 'domcontentloaded'
        })

        await page.waitForFunction(() => typeof window.__navActions__?.switchView === 'function', { timeout: 40000 })

        // Establish map as current view.
        await page.evaluate(() => window.__navActions__.switchView('map'))
        await page.waitForFunction(() => document.body.dataset.activeView === 'map', { timeout: 15000, polling: 50 })

        // Re-calling switchView with the already-current view must be a safe no-op
        // (no throw, no view flip) — the prelude path must not restart.
        await page.evaluate(() => window.__navActions__.switchView('map'))
        await page.waitForTimeout(600)
        expect(await page.evaluate(() => document.body.dataset.activeView), 'same-view switch must stay on map').toBe(
            'map'
        )
    })
})
