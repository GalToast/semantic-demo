/**
 * mobile-chip-aaa.spec.js
 *
 * PR-A1: WCAG AAA 2.5.5 — mobile Header mode chips must have a 44x44 CSS-px
 * touch target. The visible chips are icon-only and ~24x24 px to fit the
 * mobile viewport budget; the clickable area is expanded via a centered
 * ::before pseudo-element in header.css.
 */

import { test, expect } from '@playwright/test'

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5173'

test('mobile mode chips have at least 44x44 px touch target', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${BASE_URL}?nodemo=1&webgl=1`, { waitUntil: 'domcontentloaded' })

    // Wait for the chip rail to render
    await page.locator('#mode-chips .mode-chip').first().waitFor({ state: 'visible', timeout: 10000 })

    const chips = await page.locator('#mode-chips .mode-chip').all()
    expect(chips.length).toBeGreaterThan(0)

    for (const chip of chips) {
        // boundingBox() measures the element's own layout box, not the
        // ::before pseudo-element that expands the touch target. Read the
        // pseudo-element size directly via getComputedStyle.
        const touchTarget = await chip.evaluate((el) => {
            const pseudo = window.getComputedStyle(el, '::before')
            return {
                width: parseFloat(pseudo.width),
                height: parseFloat(pseudo.height)
            }
        })
        expect(touchTarget.width, 'chip ::before touch target width should be >= 44px').toBeGreaterThanOrEqual(44)
        expect(touchTarget.height, 'chip ::before touch target height should be >= 44px').toBeGreaterThanOrEqual(44)
    }
})
