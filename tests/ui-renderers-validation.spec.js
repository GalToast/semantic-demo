import { test, expect } from '@playwright/test'

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:8795'

test.describe('UI Renderers Module Validation', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(`${BASE_URL}/index.html?v=renderer-test`)
        await page.waitForSelector('#loading-overlay', { state: 'hidden', timeout: 30000 })
    })

    test('Search Result Badge Rendering', async ({ page }) => {
        // 1. Search for coffee (uses mock results 1, 2, 3)
        const input = page.locator('#search-input')
        await input.fill('coffee')
        await page.keyboard.press('Enter')
        await page.waitForSelector('.search-result-item', { state: 'visible' })

        // 2. Verify contact badges are rendered for 1845 Solutions (ID: 1)
        // 1845 Solutions has website, email, phone in real data
        const firstResult = page.locator('.search-result-item').first()
        const badges = firstResult.locator('.search-result-badges')
        await expect(badges).toBeVisible()

        const badgeIcons = badges.locator('svg.search-result-badge-icon')
        await expect(badgeIcons).toHaveCount(3)
    })

    test('Legend Component Integration', async ({ page }) => {
        // 1. Open Legend
        await page.click('#btn-legend')
        const legend = page.locator('#legend-panel')
        await expect(legend).toBeVisible()

        // 2. Verify cluster items are rendered
        const legendItems = legend.locator('.legend-item')
        await expect(legendItems.count()).resolves.toBeGreaterThan(0)

        // 3. Verify color matching
        const firstDot = legendItems.first().locator('.legend-dot')
        const color = await firstDot.evaluate((el) => window.getComputedStyle(el).backgroundColor)
        expect(color).toContain('rgb')
    })

    test('Focus Meta Strip Formatting', async ({ page }) => {
        // 1. Click a search result to focus
        const input = page.locator('#search-input')
        await input.fill('coffee')
        await page.keyboard.press('Enter')
        await page.locator('.search-result-item').first().click()

        // 2. Verify focus metadata is visible, while the legacy selected card renderer
        // still keeps its cached metadata text current for panel/map surfaces.
        const focusMeta = page.locator('#focus-stage-meta')
        await expect(focusMeta).toBeVisible({ timeout: 15000 })
        await expect(focusMeta).toContainText('Conroe')

        const metaStrip = page.locator('#selected-meta-strip')
        const text = await metaStrip.textContent()
        // 1845 Solutions is in Conroe
        expect(text).toContain('Conroe')
    })
})
