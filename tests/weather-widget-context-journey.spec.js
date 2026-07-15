import { test, expect } from '@playwright/test'
import { ONBOARDING_STORAGE_KEY } from '@lib/onboarding/onboarding-storage'

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5173'

test.describe('Weather widget context journey', () => {
    test('weather widget exposes accurate location context', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${BASE_URL}?nodemo=1&webgl=1`, { waitUntil: 'domcontentloaded' })

        // Suppress onboarding help dialog via localStorage and reload so the
        // widget is unobstructed.
        await page.evaluate(() => {
            localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ seen: true, ts: Date.now() }))
        })
        await page.goto(`${BASE_URL}?nodemo=1&webgl=1`, { waitUntil: 'domcontentloaded' })

        const widget = page.locator('#weather-widget')
        await widget.waitFor({ state: 'visible', timeout: 10000 })

        const wrapperAria = await widget.getAttribute('aria-label')
        const wrapperTitle = await widget.getAttribute('title')
        const toggle = widget.locator('button.weather-toggle')
        const toggleAria = await toggle.getAttribute('aria-label')
        const toggleTitle = await toggle.getAttribute('title')

        expect(wrapperAria).toBe('Weather conditions for Montgomery County')
        expect(wrapperTitle).toBe('Current conditions for Montgomery County')
        expect(toggleAria).toBe('Toggle weather details — current conditions for Montgomery County')
        expect(toggleTitle).toBe('Current conditions for Montgomery County')
    })
})
