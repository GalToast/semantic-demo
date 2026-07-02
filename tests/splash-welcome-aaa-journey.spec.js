import { test, expect } from '@playwright/test'

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5173'

test.describe('Welcome modal (Splash) journey — PR-B1', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            try {
                delete window.__PLAYWRIGHT__
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => false,
                    configurable: true
                })
            } catch {
                /* best-effort */
            }
        })
    })

    test('desktop welcome modal shows and has 44x44 touch targets', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${BASE_URL}?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const splash = page.locator('.splash[role="dialog"]')
        await splash.waitFor({ state: 'visible', timeout: 10000 })

        await expect(splash).toHaveAttribute('aria-modal', 'true')
        await expect(splash).toHaveAttribute('aria-labelledby', 'splash-title')

        const input = page.locator('.splash-search-input')
        const submit = page.locator('.splash-submit')
        const cta = page.locator('.splash-cta')
        await expect(input).toBeVisible()
        await expect(submit).toBeVisible()
        await expect(cta).toBeVisible()

        for (const locator of [input, submit, cta]) {
            const box = await locator.boundingBox()
            expect(box.width, `${locator} width should be >= 44px`).toBeGreaterThanOrEqual(44)
            expect(box.height, `${locator} height should be >= 44px`).toBeGreaterThanOrEqual(44)
        }
    })
})
