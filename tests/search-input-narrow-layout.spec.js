/**
 * Regression coverage for the active search row at narrow mobile widths.
 *
 * The 44px touch targets are intentional. The decorative shortcut hint must
 * leave the flex layout once back/clear/cancel controls are visible, or the
 * row develops internal horizontal overflow at 320px.
 */

import { test, expect } from '@playwright/test'
import { ONBOARDING_STORAGE_KEY } from '@lib/onboarding/onboarding-storage'

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8796').replace(/\/$/, '')

test.describe('narrow active search layout', () => {
    test('keeps 44px controls inside the 320px search row while searching', async ({ page }) => {
        test.setTimeout(60_000)

        await page.addInitScript((key) => {
            localStorage.setItem(key, 'true')
        }, ONBOARDING_STORAGE_KEY)

        await page.route('**/api.php?action=semantic_lane_health**', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    ok: true,
                    state: 'healthy',
                    provenance: { label: 'Search ready', detail: 'Semantic search is ready.' }
                })
            })
        )
        await page.route('**/api.php?action=semantic_search**', async () => {
            // Keep the request in-flight so all active-row controls are present.
            await new Promise(() => {})
        })

        await page.setViewportSize({ width: 320, height: 640 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?view=galaxy&nodemo=1&webgl=1`, {
            waitUntil: 'domcontentloaded'
        })
        await page.waitForFunction(() => window.__APP_STATE__?.points?.length > 100, { timeout: 30_000 })

        await page.locator('#search-input').fill('narrow layout check')
        await expect(page.locator('#search-cancel-btn')).toBeVisible({ timeout: 15_000 })

        const layout = await page.locator('.search-input-wrap').evaluate((wrapper) => {
            const buttonRect = (selector) => document.querySelector(selector)?.getBoundingClientRect()
            return {
                clientWidth: wrapper.clientWidth,
                scrollWidth: wrapper.scrollWidth,
                back: buttonRect('.search-back-btn'),
                clear: buttonRect('#search-clear-btn'),
                cancel: buttonRect('#search-cancel-btn')
            }
        })

        expect(layout.scrollWidth, 'active search row must not overflow horizontally').toBeLessThanOrEqual(
            layout.clientWidth
        )
        expect(layout.back?.width).toBe(44)
        expect(layout.back?.height).toBe(44)
        expect(layout.clear?.width).toBe(44)
        expect(layout.clear?.height).toBe(44)
        expect(layout.cancel?.height).toBe(44)
    })
})
