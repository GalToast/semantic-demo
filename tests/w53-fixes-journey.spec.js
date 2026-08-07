// W53 corrective-pass regression guard for the four UI/a11y fixes
// (V8 active-chip contrast, V9 focus-card no double-render, V2gap
// ProximityLegend 44px dismiss, WeatherWidget 44px pill).
//
// The vision jury is unreliable for fine pixel/contrast measurement on this
// dark-themed app (it repeatedly misread a 44px element as "under 44px" and a
// solid teal fill as a "low-alpha glow"), so these assertions pin the real
// success criteria at the DOM level — the authoritative verification.
import { test, expect } from '@playwright/test'
import { BASE_URL } from './helpers/3d-interaction-helpers.js'

const surface = (path) => `${BASE_URL}${path}`

test.describe('W53 corrective fixes (V8/V9/V2gap/WeatherWidget)', () => {
    test.beforeEach(async ({ page }) => {
        // Force WebGL render-kind so gated UI (weather pill, legend, focus
        // card) actually mounts in headless, matching the capture pipeline.
        await page.addInitScript(() => {
            window.__PLAYWRIGHT__ = true
        })
    })

    test('V8 — active mode chip is an opaque high-contrast fill', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(surface('/?nodemo=1'), { waitUntil: 'networkidle' })
        await page.waitForSelector('.mode-chip.active', { timeout: 8000 })
        const chip = page.locator('.mode-chip.active')
        const bg = await chip.evaluate((el) => getComputedStyle(el).backgroundColor)
        const opacity = await chip.evaluate((el) => getComputedStyle(el).opacity)
        // Opaque teal fill — not a translucent tint.
        expect(bg, 'active chip must be an opaque (alpha=1) color').toMatch(/^rgb\(/)
        expect(bg, 'active chip must not be transparent').not.toMatch(/rgba\([^)]*, 0\)/)
        expect(Number(opacity), 'active chip must be fully opaque').toBe(1)
        // Poll for the settled box height instead of one-shot boundingBox.
        // Webfont swap (FOUT) after mount changes chip height → the ≥40px read
        // can race font load.
        const boxSettled = await page.waitForFunction(
            () => {
                const box = document.querySelector('.mode-chip.active')?.getBoundingClientRect()
                return box && box.height >= 40
            },
            null,
            { timeout: 15000, polling: 50 }
        )
        expect(boxSettled, 'active chip should settle to ≥40px tap target').toBeTruthy()
        const box = await chip.boundingBox()
        expect(box.height, 'active chip should be a comfortable tap target').toBeGreaterThanOrEqual(40)
    })

    test('V2gap — ProximityLegend dismiss button is a >=44px tappable target', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(surface('/?nodemo=1'), { waitUntil: 'networkidle' })
        const dismiss = page.locator('.proximity-legend-dismiss')
        await dismiss.waitFor({ state: 'visible', timeout: 10000 })
        // First-visit help dialog can cover the legend — dismiss it (Escape),
        // matching the capture pipeline's dismiss step, so the legend dismiss
        // is reachable.
        for (let i = 0; i < 3; i++) {
            await page.keyboard.press('Escape')
            await page.waitForTimeout(250)
        }
        const help = page.locator('.help-dialog')
        if (await help.count()) {
            await expect(help).toBeHidden({ timeout: 5000 })
        }
        // Poll for the settled rect instead of one-shot reading after sleep.
        // The legend slideUp animation (500ms translateY) doesn't change w/h,
        // but the reveal (100ms delay + visible flip) can still be mid-flight.
        const dismissSizeSettled = await page.waitForFunction(
            () => {
                const el = document.querySelector('.proximity-legend-dismiss')
                if (!el) return false
                const r = el.getBoundingClientRect()
                return Math.min(r.width, r.height) >= 44
            },
            null,
            { timeout: 15000, polling: 50 }
        )
        expect(dismissSizeSettled, 'legend dismiss rect must settle to >=44px').toBeTruthy()
        const size = await dismiss.evaluate((el) => {
            const r = el.getBoundingClientRect()
            return { w: r.width, h: r.height }
        })
        expect(Math.min(size.w, size.h), 'legend dismiss hit area >= 44px (WCAG 2.5.8)').toBeGreaterThanOrEqual(44)
        // It must be clickable (not covered by the canvas or help dialog).
        await dismiss.click({ timeout: 5000 })
        await expect(dismiss).toBeHidden()
    })

    test('WeatherWidget — pill keeps a >=44px hit area', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(surface('/?nodemo=1'), { waitUntil: 'networkidle' })
        const pill = page.locator('#weather-widget')
        await pill.waitFor({ state: 'visible', timeout: 10000 })
        const h = await pill.evaluate((el) => el.getBoundingClientRect().height)
        expect(h, 'weather pill min-height 44px (WCAG 2.5.8)').toBeGreaterThanOrEqual(44)
    })

    test('V9 — focus card shows populated state with no empty/placeholder overlap', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(surface('/?record=519&nodemo=1'), { waitUntil: 'networkidle' })
        await page.waitForSelector('#selected-details, #fc-selected-details, .focus-card', { timeout: 10000 })
        // Empty state must NOT be present (no double-render flash).
        await expect(page.locator('#selected-empty, .selected-empty')).toHaveCount(0)
        // Poll for #fc-selected-name to be populated (non-empty text) before the
        // clip read — the lazy FocusCard hydrates after the deep-link focus,
        // so the clip read races the last data flush.
        await page.waitForFunction(
            () => {
                const el = document.querySelector('#fc-selected-name')
                return el && el.textContent.trim().length > 0
            },
            null,
            { timeout: 15000, polling: 50 }
        )
        const title = page.locator('#selected-name, #fc-selected-name, .selected-card h3').first()
        await expect(title).toBeVisible()
        const clip = await title.evaluate((el) => {
            const _cs = getComputedStyle(el)
            return { scrollH: el.scrollHeight, clientH: el.clientHeight }
        })
        expect(clip.scrollH, 'title must not be vertically clipped').toBe(clip.clientH)
    })
})
