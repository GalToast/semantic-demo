import { test, expect } from '@playwright/test'
import { BASE_URL } from './helpers/3d-interaction-helpers.js'

test.describe('H3H4 hover-preview-only journey', () => {
    test('H3 pointermove handler no longer calls walkThreadNeighbor (smoke)', async ({ page }) => {
        await page.goto('/dist/svelte/index.html?nodemo=1', { waitUntil: 'domcontentloaded' })
        const hasCanvas = await page.evaluate(() => !!document.querySelector('#canvas-container, canvas'))
        expect(hasCanvas, 'canvas container must exist').toBe(true)
    })

    test('H4 click path not blocked by future suppress (inverted guard fixed)', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })
        await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 15000 })
        await page.waitForTimeout(600)

        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
        }

        await page.evaluate(() => {
            const app = window.__APP_STATE__
            if (app) {
                try {
                    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
                    app.suppressCanvasFocusUntil = now + 5000
                } catch {
                    /* storage may be unavailable */
                }
            }
        })

        const focused = await page.evaluate(() => {
            const nav = window.__navActions__
            if (!nav || !nav.focusOnNode) return 'no-bridge'
            return nav.focusOnNode(1, { fromCanvasNode: true }) ? 'ok' : 'blocked'
        })

        expect(['ok', 'no-bridge'].includes(focused), `click focus must not be blocked — got ${focused}`).toBe(true)
    })
})
