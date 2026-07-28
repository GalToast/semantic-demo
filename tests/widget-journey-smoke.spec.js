/**
 * Smoke tests — lightweight journey checks that do NOT boot the full WebGL
 * engine. They exercise the placeholder2d (mobile 2D) path, URL deep-links,
 * and CSS-invariant assertions. Kept separate from the main WebGL-heavy spec
 * so `qa:journey:smoke` can run fast (< 1 min) without GPU resource
 * accumulation.
 *
 * Split from tests/widget-journey.spec.js (2026-07-28) to fix flaky
 * timeouts caused by serial WebGL context teardown under heavy load.
 */
import { test, expect } from '@playwright/test'
import { BASE_URL } from './helpers/3d-interaction-helpers.js'

test.afterEach(async ({ page }) => {
    try {
        await page.evaluate(() => {
            const canvas = document.querySelector('canvas')
            if (canvas) {
                const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
                if (gl && !gl.isContextLost()) {
                    const ext = gl.getExtension('WEBGL_lose_context')
                    if (ext) ext.loseContext()
                }
            }
        }).catch(() => {})
        await page.waitForTimeout(150)
    } catch {
        /* best-effort cleanup */
    }
})

test.describe('Journey smoke (no WebGL engine)', () => {
    test('W51-mobile-h1: only one H1 visible on mobile (placeholder2d path)', async ({ page }) => {
        // W51 audit #2. On mobile viewport with renderKind=placeholder2d,
        // the App.svelte H1 must be hidden so screen readers see ONE H1,
        // not two (App's "Semantic Explorer — ..." + Placeholder2D's
        // "Semantic Explorer Preview").
        await page.setViewportSize({ width: 375, height: 667 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        // Wait for hydration + renderKind=placeholder2d to take effect
        await page.waitForFunction(() => document.body.classList.contains('render-kind-placeholder2d'), null, {
            timeout: 10000
        })
        await page.waitForTimeout(500)

        // Count visible H1s in the accessibility tree
        const visibleH1s = await page.evaluate(() => {
            const all = Array.from(document.querySelectorAll('h1'))
            return all
                .filter((h) => {
                    const r = h.getBoundingClientRect()
                    const cs = getComputedStyle(h)
                    return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'
                })
                .map((h) => ({ text: h.textContent.trim().slice(0, 60), visible: true }))
        })
        expect(
            visibleH1s,
            `Expected exactly 1 visible H1 on mobile, got ${visibleH1s.length}: ${JSON.stringify(visibleH1s)}`
        ).toHaveLength(1)
    })

    test('W54 visual audit: placeholder2d Search chip reveals #info-panel + #search-input', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        // Dismiss the first-visit help dialog if it auto-opens; it blocks taps
        // on the mode-chip rail on mobile just like it blocks search input.
        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }

        // The header/mode chips are visible above the 2D placeholder CTA.
        const searchChip = page.locator('.mode-chip[data-mode="search"]')
        await searchChip.waitFor({ state: 'visible', timeout: 10000 })
        await searchChip.click()

        // Regression: body.render-kind-placeholder2d .info-panel used display:none
        // unconditionally, hiding the search panel in the 2D placeholder path.
        await page.waitForFunction(
            () => {
                const info = document.querySelector('#info-panel')
                const input = document.querySelector('#search-input')
                const r = info?.getBoundingClientRect()
                const ir = input?.getBoundingClientRect()
                return (
                    document.body.classList.contains('surface-search') &&
                    r != null &&
                    r.width > 0 &&
                    r.height > 0 &&
                    ir != null &&
                    ir.width > 0 &&
                    ir.height > 0
                )
            },
            null,
            { timeout: 5000 }
        )
    })

    test('W54 visual audit: map back button returns to overview from ?view=map deep-link', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&view=map`, { waitUntil: 'domcontentloaded' })

        await page.waitForFunction(() => window.__APP_STATE__?.currentView === 'map', null, { timeout: 10000 })

        const backBtn = page.locator('.map-back-btn')
        await backBtn.waitFor({ state: 'visible', timeout: 10000 })
        await backBtn.click()

        await page.waitForFunction(() => window.__APP_STATE__?.currentView === 'galaxy', null, { timeout: 5000 })
        expect(page.url(), 'URL should drop view=map after returning to overview').not.toContain('view=map')
    })
})
