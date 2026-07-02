import { test, expect } from '@playwright/test'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8797'

test('synthetic pointermove + click on canvas', async ({ page }) => {
    await page.goto(`${BASE_URL}?view=galaxy&nodemo=1`, { waitUntil: 'domcontentloaded' })

    const explore = page.locator('[data-testid="splash-cta"], button[aria-label="Enter 3D scene"]').first()
    await explore.waitFor({ state: 'visible', timeout: 40000 })
    await explore.click()

    await page.locator('.weather-widget').waitFor({ state: 'attached', timeout: 30000 })
    await page.waitForTimeout(2000)

    const canvas = page.locator('canvas').first()
    const box = await canvas.boundingBox()
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2

    // Close help dialog if open
    await page.evaluate(() => {
        const dialog = document.querySelector('dialog.help-dialog[open]')
        if (dialog) {
            const close = dialog.querySelector('.help-dialog-close')
            if (close) close.click()
        }
    })

    // Dispatch synthetic pointermove to an empty corner, then to the center
    await canvas.evaluate((el, coords) => {
        const canvas = el
        const makePointerEvent = (type, x, y, buttons) => {
            const ev = new Event(type, { bubbles: true })
            Object.assign(ev, {
                clientX: x,
                clientY: y,
                pointerId: 1,
                isPrimary: true,
                pointerType: 'mouse',
                buttons,
                relatedTarget: null
            })
            return ev
        }
        // Empty corner
        canvas.dispatchEvent(makePointerEvent('pointermove', 0, 0, 0))
        // Center (node likely here)
        canvas.dispatchEvent(makePointerEvent('pointermove', coords.cx, coords.cy, 0))
        canvas.dispatchEvent(makePointerEvent('click', coords.cx, coords.cy, 1))
    }, { cx, cy })

    await page.waitForTimeout(4000)

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
