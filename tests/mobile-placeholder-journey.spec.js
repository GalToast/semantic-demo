import { test, expect } from '@playwright/test'
import { BASE_URL } from './helpers/3d-interaction-helpers.js'

/**
 * S5 (2026-08-19): mobile placeholder — honest copy + capability-gated
 * auto-enter. Updated 2026-08-19 for the flag-ON default (opt-out):
 *
 * 1. The placeholder path (honest copy + CTA flip) is exercised deterministically
 *    via `?placeholder=1` (the responsive-renderer force hook, decision factor
 *    #2) — on a capable machine the probe now auto-enters 3D on cold load, so
 *    without the force hook the placeholder never appears.
 * 2. The auto-enter path asserts render-kind matches the in-page capability
 *    probe outcome: webgl on capable hardware, placeholder2d on SwiftShader /
 *    low-memory / reduced-motion. Environment-independent — never flaky.
 *
 * Also locks: `signalReady()` (CTA tap) flips render-kind to webgl
 * synchronously, even when the software-GL scene never reaches scene-ready
 * (the harness's SwiftShader reality). We assert the render-kind flip, not
 * scene-ready — scene-ready is GPU-gated (see SEMANTIC_USE_D3D11 evidence).
 *
 * Run: npm run build:svelte && npm run qa:server:ensure
 *      npx playwright test tests/mobile-placeholder-journey.spec.js --workers=1
 */
test('mobile placeholder: honest copy + CTA flips to the 3D surface', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`${BASE_URL}/dist/svelte/index.html?placeholder=1&nodemo=1`)

    // Placeholder surface renders with honest copy.
    const placeholder = page.locator('.placeholder-overlay')
    await expect(placeholder).toBeVisible()
    await expect(placeholder.locator('.placeholder-subtitle')).toContainText('tap to explore in 3D')
    expect(await placeholder.locator('.placeholder-subtitle').innerText()).not.toContain('desktop')

    const cta = page.getByTestId('placeholder-cta')
    await expect(cta).toBeVisible()
    await expect(cta).toContainText('Open in 3D')

    // Cold-boot render-kind is placeholder2d (forced; LCP = static SVG).
    await expect(page.locator('body')).toHaveAttribute('data-render-kind', 'placeholder2d')

    // Tap → signalReady() flips to webgl synchronously (scene mount may lag).
    await cta.click()
    await expect(page.locator('body')).toHaveAttribute('data-render-kind', 'webgl')
})

test('mobile auto-enter: cold-load render-kind matches the capability probe', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`)

    // Mirror supportsCapableWebGL() in-page (same gates: reduced-motion,
    // deviceMemory, hardwareConcurrency, hardware WebGL2 with
    // failIfMajorPerformanceCaveat) so the assertion is environment-independent.
    const probe = await page.evaluate(() => {
        const mm = window.matchMedia('(prefers-reduced-motion: reduce)')
        if (mm?.matches) return false
        const nav = navigator
        const mem = nav.deviceMemory
        if (typeof mem === 'number' && Number.isFinite(mem) && mem > 0 && mem < 4) return false
        const cores = nav.hardwareConcurrency
        if (typeof cores === 'number' && Number.isFinite(cores) && cores > 0 && cores < 4) return false
        try {
            const gl = document.createElement('canvas').getContext('webgl2', {
                failIfMajorPerformanceCaveat: true
            })
            return !!gl
        } catch {
            return false
        }
    })

    const expected = probe ? 'webgl' : 'placeholder2d'
    await expect(page.locator('body')).toHaveAttribute('data-render-kind', expected, { timeout: 15000 })
})
