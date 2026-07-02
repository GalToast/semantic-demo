import { test, expect } from '@playwright/test'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8797'

test('widget-journey 21 with reduced motion', async ({ page }) => {
    await page.addInitScript(() => {
        try {
            localStorage.setItem(
                'moco_onboarding_seen_v1',
                JSON.stringify({ seen: true, seenAt: new Date().toISOString() })
            )
        } catch {
            /* ignore */
        }
    })

    await page.goto(`${BASE_URL}?nodemo=1`, { waitUntil: 'domcontentloaded' })
    const explore = page.locator('[data-testid="splash-cta"], button[aria-label="Enter 3D scene"]').first()
    await explore.waitFor({ state: 'visible', timeout: 40000 })
    await explore.click()
    await page.locator('.weather-widget').waitFor({ state: 'attached', timeout: 30000 })
    await page.waitForTimeout(2000)

    await page.emulateMedia({ reducedMotion: 'reduce' })

    const canvas = page.locator('canvas').first()
    const box = await canvas.boundingBox()
    const cx = Math.round(box.x + box.width / 2)
    const cy = Math.round(box.y + box.height / 2)
    await canvas.dispatchEvent('click', { clientX: cx, clientY: cy, bubbles: true })
    await page.waitForTimeout(2000)

    const navState = await page.evaluate(() => {
        const app = window.__APP_STATE__
        return {
            focusedIndex: app?.navState?.focusedIndex,
            mode: app?.navState?.mode,
            surface: app?.navState?.surface,
            url: window.location.href
        }
    })
    console.log('navState', navState)
    expect(navState.focusedIndex).not.toBeNull()
    expect(navState.mode).toBe('trail')
    expect(navState.surface).toBe('focus')
    expect(navState.url).toContain('record=')
})
