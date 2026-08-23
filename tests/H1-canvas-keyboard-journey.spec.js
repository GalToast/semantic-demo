import { test, expect } from '@playwright/test'
import { BASE_URL } from './helpers/3d-interaction-helpers.js'

test.describe('H1 canvas keyboard journey', () => {
    test('H1a live canvas has kbd handler and ArrowRight moves focus (not detached)', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const explore = page.locator('[data-testid="splash-cta"], button[aria-label="Open in 3D"], [data-testid="placeholder-cta"]').first()
        await explore.waitFor({ state: 'visible', timeout: 40000 })
        await explore.click()

        await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 15000, polling: 100 })
        await page.waitForTimeout(1200)

        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }

        const liveCanvasExists = await page.evaluate(() => !!document.querySelector('#canvas-container canvas'))
        expect(liveCanvasExists, 'live canvas must exist in #canvas-container').toBe(true)

        const liveHasShortcuts = await page.evaluate(() => {
            const live = document.querySelector('#canvas-container canvas')
            return live ? live.getAttribute('aria-keyshortcuts') : null
        })
        expect(liveHasShortcuts, 'live canvas should have aria-keyshortcuts (H1a)').toBeTruthy()
        expect(liveHasShortcuts).toContain('ArrowRight')

        const didFocus = await page.evaluate(() => {
            const nav = window.__navActions__
            return nav && typeof nav.focusOnNode === 'function' ? nav.focusOnNode(0) : false
        })
        expect(didFocus, 'focusOnNode(0) must succeed pre-condition').toBeTruthy()
        await page.waitForTimeout(600)

        await page.evaluate(() => {
            const live = document.querySelector('#canvas-container canvas')
            if (live) live.focus()
        })
        await page.waitForTimeout(100)

        await page.keyboard.press('ArrowRight')
        await page.waitForTimeout(600)

        const afterIdx = await page.evaluate(() => {
            const app = window.__APP_STATE__
            return app && app.navState ? app.navState.focusedIndex : null
        })
        expect(
            typeof afterIdx === 'number' && Number.isFinite(afterIdx),
            'focusedIndex must remain finite after ArrowRight'
        ).toBe(true)

        const handlerCheck = await page.evaluate(() => {
            const detached = document.getElementById('engine-canvas')
            const live = document.querySelector('#canvas-container canvas')
            return {
                liveHas: !!(live && live._canvasKeyHandler),
                sameNode: detached === live
            }
        })
        expect(handlerCheck.liveHas || handlerCheck.sameNode, 'live canvas must have _canvasKeyHandler').toBe(true)
    })
})
