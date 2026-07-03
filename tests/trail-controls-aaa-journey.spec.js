import { test, expect } from '@playwright/test'

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5173'

test.describe('Trail controls AAA touch targets', () => {
    test('desktop trail buttons are at least 44x44 px', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${BASE_URL}?record=1&nodemo=1&webgl=1`, { waitUntil: 'domcontentloaded' })

        // Close the first-visit help dialog if it opens.
        const helpDialog = page.locator('dialog.help-dialog[open]')
        if (await helpDialog.isVisible().catch(() => false)) {
            await helpDialog.locator('button').first().click()
        }

        // Wait for trail controls to render in focus mode.
        const trailControls = page.locator('#trail-controls')
        await trailControls.waitFor({ state: 'visible', timeout: 15000 })

        const buttons = await trailControls.locator('button').all()
        expect(buttons.length).toBeGreaterThanOrEqual(3)

        for (const btn of buttons) {
            const box = await btn.boundingBox()
            expect(box.width, 'trail button width >= 44px').toBeGreaterThanOrEqual(44)
            expect(box.height, 'trail button height >= 44px').toBeGreaterThanOrEqual(44)
        }
    })
})
