/**
 * tests/canvas-picking-perf.spec.js
 *
 * Visual proof that the mycelium canvas still renders after the picking perf fix.
 * Navigates to the app, dismisses the splash gate, waits for canvas + data,
 * captures screenshot of the rendered canvas.
 */

import { test, expect } from '@playwright/test'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8795'

test('canvas renders mycelium points after picking perf fix', async ({ page }) => {
    await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

    // Splash gate: click "Enter 3D scene" if visible
    const explore = page.locator('[data-testid="splash-cta"], button[aria-label="Open full 3D experience"]').first()
    if ((await explore.count()) > 0) {
        await explore.waitFor({ state: 'visible', timeout: 40000 })
        await explore.click()
    }

    // Wait for the app to be ready: canvas + app state has points.
    await page.waitForFunction(
        () => {
            const state = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
            return !!document.querySelector('canvas') && Array.isArray(state?.points) && state.points.length > 0
        },
        { timeout: 30000 }
    )
    const canvas = page.locator('canvas')
    await expect(canvas).toBeVisible({ timeout: 10000 })
    // Capture screenshot
    await canvas.screenshot({ path: 'tmp/eng-fix-screenshots/mycelium-rendered.png' })
})
