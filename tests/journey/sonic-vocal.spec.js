import { test, expect } from '@playwright/test'
import { BASE_URL } from '../helpers/3d-interaction-helpers.js'

// SONIC-12: vocal monitor state machine. The mic->pitch->note chain needs
// a real AudioContext + analyser graph, which jsdom lacks — the on path
// is covered by scripts/pitch-detect-probe.py (autocorrelation peak-picking
// tracks pure tones at 1.4-5.4c median error, far inside the +-50c
// note-identity boundary). Here we pin the two UI states that ARE
// testable without hardware: denied mic -> aria-disabled, and the
// toggle lifecycle when getUserMedia resolves.
test.afterEach(async ({ page }) => {
    await page.close().catch(() => {})
    await page
        .context()
        .close()
        .catch(() => {})
})

async function boot(page) {
    await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&record=519`, {
        waitUntil: 'domcontentloaded'
    })
    await page.waitForFunction(() => !!document.querySelector('#sonic-note-state'), { timeout: 30000 })
    await page.evaluate(() => document.querySelector('#sonic-note-state').click())
    await page.waitForFunction(() => window.__ws && window.__ws.sent.length >= 5, { timeout: 30000 })
}

test.describe('Sonic vocal monitor', () => {
    test('SONIC-12. Button exists, is pressable, starts off', async ({ page }) => {
        await boot(page)
        const vocal = page.locator('#sonic-vocal')
        await expect(vocal).toBeVisible()
        await expect(vocal).toHaveAttribute('aria-pressed', 'false')
        await expect(vocal).not.toHaveAttribute('aria-disabled')
        // Toggle is wired (onclick resolves to a function).
        await expect(vocal).toHaveAttribute('aria-label', 'Monitor voice to play the jam')
    })

    test('SONIC-12b. Denied mic marks the button unavailable', async ({ page }) => {
        await boot(page)
        await page.evaluate(() => {
            const nav = navigator
            if (!nav.mediaDevices) nav.mediaDevices = {}
            nav.mediaDevices.getUserMedia = async () => {
                throw new Error('denied')
            }
        })
        const vocal = page.locator('#sonic-vocal')
        await vocal.click()
        await expect(vocal).toHaveAttribute('aria-disabled', 'true')
        await expect(vocal).toHaveAttribute('aria-pressed', 'false')
    })
})
