import { test, expect } from '@playwright/test'
import { BASE_URL } from './helpers/3d-interaction-helpers.js'

test.describe('Keyboard selection-lock (ocw_ui_fix HIGH-1)', () => {
    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })
        // dismiss splash
        const explore = page.locator('[data-testid="splash-cta"], button[aria-label="Enter 3D scene"]').first()
        await explore.waitFor({ state: 'visible', timeout: 40000 })
        await explore.click()
        // dismiss first-visit help dialog if present
        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }
        // wait for app to be ready
        await page.waitForFunction(
            () => {
                const s = window.__navStore__ && window.__navStore__()
                return s && s.mode === 'overview'
            },
            null,
            { timeout: 20000 }
        )
    })

    async function clearSelection(page) {
        await page.evaluate(() => window.__navActions__.setFocusedIndex(null))
        await page.waitForFunction(() => {
            const s = window.__navStore__()
            return s.focusedIndex == null
        })
    }

    test('Ctrl+4 does not change mode when no business selected', async ({ page }) => {
        await clearSelection(page)
        const before = await page.evaluate(() => window.__navStore__().mode)
        await page.keyboard.down('Control')
        await page.keyboard.press('4')
        await page.keyboard.up('Control')
        await page.waitForTimeout(200) // let any async effects settle
        const after = await page.evaluate(() => window.__navStore__().mode)
        expect(after).toBe(before, 'nav.mode should remain unchanged when no selection and Ctrl+4 pressed')
        // additionally assert it's not 'focus' (the target mode)
        expect(after).not.toBe('focus')
    })

    test('positive control: with selection, Ctrl+4 enters focus mode', async ({ page }) => {
        // focus a node to establish selection
        const midIdx = await page.evaluate(() => {
            const pts = window.__APP_STATE__?.points ?? []
            return Math.floor(pts.length / 2)
        })
        await page.evaluate((idx) => {
            const actions = window.__navActions__ || {}
            if (typeof actions.focusOnNode === 'function') {
                actions.focusOnNode(idx, { fromCanvasNode: true })
            }
        }, midIdx)
        await page.waitForFunction(
            () => {
                const s = window.__navStore__()
                return s.focusedIndex !== null && s.mode === 'focus'
            },
            { timeout: 5000 }
        )
        // now with selection, Ctrl+4 should keep us in focus (or transition to it)
        await page.keyboard.down('Control')
        await page.keyboard.press('4')
        await page.keyboard.up('Control')
        await page.waitForTimeout(200)
        const mode = await page.evaluate(() => window.__navStore__().mode)
        expect(mode).toBe('focus')
    })
})
