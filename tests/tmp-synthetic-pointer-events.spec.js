import { test, expect } from '@playwright/test'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:5173'

test('synthetic pointermove + click on canvas', async ({ page }) => {
    page.on('console', (msg) => {
        console.log('[page]', msg.type(), msg.text())
    })
    page.on('pageerror', (err) => console.log('[pageerror]', err.message))

    await page.emulateMedia({ reducedMotion: 'reduce' })

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

    // Dispatch synthetic click without any prior pointermove. The click
    // handler should focus the node and update the URL because the
    // suppressCanvasFocusUntil guard is not set for fromCanvasNode walks.
    await canvas.evaluate((el, coords) => {
        const canvas = el
        const ev = new Event('click', { bubbles: true })
        Object.assign(ev, {
            clientX: coords.cx,
            clientY: coords.cy,
            pointerId: 1,
            isPrimary: true,
            pointerType: 'mouse',
            buttons: 1,
            relatedTarget: null
        })
        canvas.dispatchEvent(ev)
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
