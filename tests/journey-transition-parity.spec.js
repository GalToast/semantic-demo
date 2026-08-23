import { test, expect } from '@playwright/test'

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8796').replace(/\/$/, '')

test.describe('Journey transition parity', () => {
    test('Ctrl+2 enters search without manufacturing trail depth', async ({ page }) => {
        test.setTimeout(60000)
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const explore = page.locator('[data-testid="splash-cta"], button[aria-label="Open in 3D"], [data-testid="placeholder-cta"]').first()
        await explore.waitFor({ state: 'visible', timeout: 60000 })
        await explore.click()

        await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, {
            timeout: 20000,
            polling: 100
        })

        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
        }
        await page.locator('#btn-legend').focus()

        // Chromium reserves physical Ctrl+number for tab switching in this
        // runner, so deliver the same cancellable keydown to the app window.
        await page.evaluate(() => {
            window.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: '2',
                    ctrlKey: true,
                    bubbles: true,
                    cancelable: true
                })
            )
        })
        await page.waitForFunction(
            () =>
                window.__TEST_STATE__?.navState?.mode === 'search' &&
                window.__TEST_STATE__?.trailDepth === 0 &&
                document.body.classList.contains('surface-search'),
            null,
            { timeout: 15000, polling: 100 }
        )

        const state = await page.evaluate(() => ({
            mode: window.__TEST_STATE__?.navState?.mode,
            surface: window.__TEST_STATE__?.navState?.surface,
            trailDepth: window.__TEST_STATE__?.trailDepth,
            trailState: document.body.dataset.trailState || ''
        }))
        expect(state.mode).toBe('search')
        expect(state.surface).toBe('search')
        expect(state.trailDepth).toBe(0)
        expect(state.trailState).toBe('inactive')
    })
})
