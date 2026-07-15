/**
 * loading-overlay-error-state-journey.spec.js — LoadingOverlay role=alert transition
 *
 * Verifies that the Svelte LoadingOverlay component flips to role=alert,
 * aria-label, and data-loading-state='error' when dataLoadState.status
 * is set to 'error' at runtime. Originally a deferred WIP from the W47-D
 * session — see `tests/unit-active/loading-overlay-error-state.test.ts`
 * for the always-on behavioral coverage. This journey test completes the
 * end-to-end coverage: confirms the LoadingOverlay Svelte component mounts
 * inside the live app (after the static `app-loading-placeholder` rename
 * removed the mount collision with the index.html first-paint shell).
 *
 * Drive mechanism (matches the route-interception style of
 * search-input-escape-cancel-journey.spec.js): forces the boot-time load
 * error state via the test global `window.__dataLoadState__.error()`,
 * then asserts the DOM transitions without depending on a real PHP failure.
 */

import { test, expect } from '@playwright/test'
import { ONBOARDING_STORAGE_KEY } from '@lib/onboarding/onboarding-storage'

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8797').replace(/\/$/, '')

test.describe('LoadingOverlay error-state role=alert transition', () => {
    test('LoadingOverlay flips to role=alert when dataLoadState.status === error', async ({ page }) => {
        test.setTimeout(60_000)

        // Pre-seed onboarding-seen flag so the welcome dialog does not overlay.
        await page.addInitScript(() => {
            localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true')
        })

        await page.setViewportSize({ width: 1280, height: 800 })
        // nodemo=1: skip demo choreograhy. webgl=1: force webgl path.
        await page.goto(`${BASE_URL}/?nodemo=1&webgl=1`)

        // Wait for the test-globals installer to run (Phase 2 of app-init).
        // The installer places window.__dataLoadState__ on window before async work
        // begins, so this resolves once the JS bundle has mounted.
        await page.waitForFunction(
            () => {
                const w = /** @type {any} */ (window)
                return typeof w.__dataLoadState__?.error === 'function'
            },
            { timeout: 15_000 }
        )

        // Force the boot-time load error so LoadingOverlay's isError branch fires.
        await page.evaluate(() => {
            const w = /** @type {any} */ (window)
            w.__dataLoadState__.error('Test forced error from journey test')
        })

        // The overlay's $derived isError → true → role flips to 'alert'.
        // Wait for the role transition explicitly. The Svelte component owns
        // id="loading-overlay"; the static index.html placeholder is
        // id="app-loading-placeholder" (W47-D rename) so the two never collide.
        const alertOverlay = page.locator('#loading-overlay[role="alert"]')
        await alertOverlay.waitFor({ state: 'visible', timeout: 10_000 })

        await expect(alertOverlay).toHaveAttribute('aria-label', 'Loading failed — Semantic Explorer')
        await expect(alertOverlay).toHaveAttribute('data-loading-state', 'error')
        await expect(alertOverlay).toHaveAttribute('id', 'loading-overlay')

        // The error-state copy + retry button are rendered in the error branch.
        await expect(alertOverlay.locator('.loading-title')).toHaveText('Unable to load')
        await expect(alertOverlay.locator('.loading-retry-btn')).toBeVisible()

        // W48-H: the visible note now shows a friendly title + detail
        // (not the raw 'Test forced error...' message). The raw message
        // is preserved in the <details> block for diagnostics.
        const note = alertOverlay.locator('#loading-error-message')
        await expect(note).toContainText('Something went wrong')
        const technical = alertOverlay.locator('.loading-error-technical code')
        await expect(technical).toHaveText('Test forced error from journey test')

        // The aria-valuenow attribute is intentionally absent in the error state
        // (a progressbar with no value would be invalid). Assert by absence.
        const ariaValueNow = await alertOverlay.getAttribute('aria-valuenow')
        expect(ariaValueNow).toBeNull()
    })
})
