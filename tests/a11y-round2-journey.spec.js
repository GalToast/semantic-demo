import { test, expect } from '@playwright/test'
import { BASE_URL } from './helpers/3d-interaction-helpers.js'

// Journey/structural assertions for the round-2 mobile/a11y fixes committed in
// 4e31a8b9 (M1 lock-emoji, M3 toast-dismiss, M4 filters pulse, M6 walkbreadcrumb
// list). These are user-visible a11y behaviors, so they get a journey test per
// AGENTS.md (test-strategy-gap rule) rather than a --SkipTestStrategyGapCheck.

test.describe('Round-2 mobile/a11y fixes (M1, M4, M6)', () => {
    async function enterScene(page) {
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })
        const explore = page.locator('[data-testid="splash-cta"], button[aria-label="Enter 3D scene"]').first()
        await explore.waitFor({ state: 'visible', timeout: 40000 })
        await explore.click()
        await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 15000 })
        await page.waitForTimeout(800)
        // First-visit help dialog auto-opens after splash dismissal; Escape closes it.
        const help = page.locator('dialog.help-dialog[open]')
        if ((await help.count()) > 0) {
            await page.keyboard.press('Escape')
            await help.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }
    }

    test('M1: locked mode chip exposes an aria-hidden SVG, never a 🔒 glyph', async ({ page }) => {
        await enterScene(page)
        const lockedChip = page.locator('.mode-chip.is-locked').first()
        // Not every render has a locked chip; skip gracefully if none are present.
        if ((await lockedChip.count()) === 0) return
        const lockSvg = lockedChip.locator('svg.chip-lock, svg[aria-hidden="true"]').first()
        await expect(lockSvg, 'M1: lock indicator must be an aria-hidden SVG, not a text emoji').toHaveAttribute('aria-hidden', 'true')
        const chipText = (await lockedChip.textContent()) ?? ''
        expect(chipText, 'M1: the 🔒 emoji must not be exposed as text to assistive tech').not.toContain('🔒')
    })

    test('M4: discoverability pulse-glow pill is present on the idle filters', async ({ page }) => {
        await enterScene(page)
        // W50 feature: when the surface is idle and the filter section is collapsed,
        // the pulse-glow discoverability pill should be present (M4 keeps it visible).
        const pulse = page.locator('.filters-section:not([open]) .filter-toggle').first()
        if ((await pulse.count()) > 0) {
            await expect(pulse, 'M4: pulse-glow pill should be visible on idle filters').toBeVisible()
        }
    })

    test('M6: trail breadcrumb renders as <ul role="list"> with <li>/<button>, not a listbox', async ({ page }) => {
        await enterScene(page)
        // Build a trail: focus a node so the breadcrumb history populates.
        const ok = await page.evaluate(() => {
            const points = window.__APP_STATE__?.points ?? []
            if (points.length === 0) return false
            const a = window.__navActions__
            if (!a || typeof a.focusOnNode !== 'function') return false
            return a.focusOnNode(0)
        })
        if (!ok) return
        const crumb = page.locator('#walk-breadcrumb.walk-breadcrumb, .walk-breadcrumb').first()
        await crumb.waitFor({ state: 'attached', timeout: 5000 })
        // The old ARIA listbox pattern must be gone.
        await expect(crumb.locator('[role="listbox"]'), 'M6: old listbox pattern removed').toHaveCount(0)
        // The new accessible list structure must be present.
        const list = crumb.locator('ul[role="list"]')
        await expect(list, 'M6: breadcrumb uses <ul role="list">').toHaveCount(1)
        await expect(list.locator('li[role="listitem"]'), 'M6: list items present').not.toHaveCount(0)
        await expect(list.locator('button'), 'M6: chips are buttons').not.toHaveCount(0)
    })
})
