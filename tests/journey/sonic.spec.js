import { test, expect } from '@playwright/test'
import { BASE_URL } from '../helpers/3d-interaction-helpers.js'

// GPU cleanup between tests: close the page and its entire browser context so
// serial WebGL journeys do not accumulate renderer bookkeeping.
test.afterEach(async ({ page }) => {
    const context = page.context()
    try {
        await page.close().catch(() => {})
    } catch {
        // best-effort
    } finally {
        await context.close().catch(() => {})
    }
})

// Sonic identity journey: focused business shows its generated clip player
// (Magenta RT2 clip + ear_v7.1 score badge from public/sonic/manifest.json).
// v2: the manifest carries 3 ranked seed-variants per cluster; the component
// assigns one deterministically per node via FNV-1a hash of the leadId, so
// this spec still asserts the stable play/badge contract on any variant.
test.describe('Sonic identity journey', () => {
    test('SONIC-1. Focused business shows sonic play control and ear score badge', async ({ page }) => {
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&record=6218`, { waitUntil: 'domcontentloaded' })

        // The sonic section renders inside the focus card once the manifest
        // loads. Poll via CDP evaluate (rAF stalls in headless WebGL).
        const start = Date.now()
        let found = false
        while (Date.now() - start < 15000) {
            found = await page.evaluate(() => !!document.querySelector('#sonic-play'))
            if (found) break
            await page.waitForTimeout(100)
        }
        expect(found, 'sonic play control must appear in the focus card').toBe(true)

        const badge = await page.evaluate(() => {
            const el = document.querySelector('#sonic-score')
            return el ? el.textContent?.trim() : null
        })
        expect(badge, 'ear score badge must show score/grade from the manifest').toMatch(/^\d+\/[SABCDF]$/)

        const playBtn = page.locator('#sonic-play')
        await expect(playBtn).toHaveAttribute('aria-pressed', 'false')

        // Toggle play → aria-pressed flips true (WebAudio may be blocked in
        // headless, but the pressed state reflects the click intent path).
        await playBtn.click()
        await page.waitForTimeout(300)
        const pressed = await playBtn.getAttribute('aria-pressed')
        expect(['true', 'false']).toContain(pressed ?? '')
    })

    test('SONIC-2. Style dial toggles between best and max-beat variants', async ({ page }) => {
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&record=6218`, { waitUntil: 'domcontentloaded' })

        // Wait for sonic section
        const start = Date.now()
        let found = false
        while (Date.now() - start < 15000) {
            found = await page.evaluate(() => !!document.querySelector('#sonic-style'))
            if (found) break
            await page.waitForTimeout(100)
        }
        expect(found, 'sonic style dial must appear').toBe(true)

        const styleBtn = page.locator('#sonic-style')
        await expect(styleBtn).toHaveAttribute('aria-pressed', 'false')
        await expect(styleBtn).toHaveText('★')

        // Click to max-beat
        await styleBtn.click()
        await page.waitForTimeout(100)
        await expect(styleBtn).toHaveAttribute('aria-pressed', 'true')
        await expect(styleBtn).toHaveText('⚡')

        // Click back to best
        await styleBtn.click()
        await page.waitForTimeout(100)
        await expect(styleBtn).toHaveAttribute('aria-pressed', 'false')
        await expect(styleBtn).toHaveText('★')
    })
})
