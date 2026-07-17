import { test, expect } from '@playwright/test'
import { BASE_URL } from './helpers/3d-interaction-helpers.js'

// W53 V2: the "Choose a business to map its neighborhood" empty-state overlay
// was centered over the densest map-marker cluster with NO dismiss affordance
// (cross-juror × cross-surface finding — D4 desktop + M4 mobile, both jurors
// flagged [HIGH]). The fix added a `.map-empty-state-close` ✕ that hides the
// overlay for the rest of the map session (persisted in sessionStorage). This
// test pins the dismiss button + persistence as a regression guard.
test.describe('Map empty-state dismiss (W53 V2)', () => {
    test.beforeEach(async ({ page }) => {
        // Fresh session per test — the dismiss is persisted via sessionStorage.
        await page.goto(`${BASE_URL}/dist/svelte/index.html`, {
            waitUntil: 'domcontentloaded'
        })
        await page.evaluate(() => {
            try {
                sessionStorage.removeItem('mco:map-empty-dismissed')
            } catch {
                /* sessionStorage unavailable */
            }
        })
    })

    test('V2.1 — empty-state shows an accessible dismissible ✕ that hides it and persists across map re-entry', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?view=map&nodemo=1`, {
            waitUntil: 'domcontentloaded'
        })

        // Map container + empty-state appear (no business selected → trail inactive).
        await page.locator('#map-container').waitFor({ state: 'attached', timeout: 20000 })
        await page
            .waitForFunction(() => !!document.querySelector('.map-empty-state'), null, { timeout: 20000 })
            .catch(() => {})

        const empty = page.locator('.map-empty-state')
        await expect(empty).toBeVisible()

        // V2 dismiss button present + accessible.
        const closeBtn = page.locator('.map-empty-state-close')
        await expect(closeBtn).toHaveCount(1)
        await expect(closeBtn).toBeVisible()
        await expect(closeBtn).toHaveAttribute('aria-label', 'Dismiss and explore the county map')
        await expect(closeBtn).toHaveText('✕')

        // The button opts back in to pointer-events (parent .map-empty-state is
        // pointer-events: none so underlying markers stay clickable).
        const pe = await closeBtn.evaluate((el) => getComputedStyle(el).pointerEvents)
        expect(pe, 'close button must accept pointer events despite parent pointer-events:none').toBe('auto')

        // Touch target >= 28px for comfortable tap/keyboard focus.
        const size = await closeBtn.evaluate((el) => {
            const r = el.getBoundingClientRect()
            return { w: r.width, h: r.height }
        })
        expect(Math.min(size.w, size.h), 'close button min dimension >= 28px').toBeGreaterThanOrEqual(28)

        // Click → empty-state hidden + dismiss persisted in sessionStorage.
        await closeBtn.click()
        await expect(empty).toBeHidden()
        const flag = await page.evaluate(() => {
            try {
                return sessionStorage.getItem('mco:map-empty-dismissed')
            } catch {
                return null
            }
        })
        expect(flag, 'dismiss must persist via sessionStorage').toBe('1')

        // Persistence: reload the map view → the empty-state must NOT reappear
        // (dismiss honored for the rest of the session).
        await page.goto(`${BASE_URL}/dist/svelte/index.html?view=map&nodemo=1`, {
            waitUntil: 'domcontentloaded'
        })
        await page.locator('#map-container').waitFor({ state: 'attached', timeout: 20000 })
        await page.waitForTimeout(800)
        await expect(page.locator('.map-empty-state')).toHaveCount(0)
    })
})
