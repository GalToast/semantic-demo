import { test, expect } from '@playwright/test'
import { BASE_URL } from './helpers/3d-interaction-helpers.js'

/**
 * S5 (2026-08-19): mobile placeholder — honest copy + default energy path.
 *
 * On a 375×812 (mobile) cold load with no deep link, the app must present
 * the Placeholder2D preview (LCP = static SVG, three.js off the cold path)
 * and the copy must say the scene loads HERE on tap ("tap to explore in 3D" /
 * "Open in 3D") — NOT the old desktop-only promise ("full 3D on desktop"),
 * which was a factual lie: tapping the CTA always booted the scene on-device.
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
    await page.goto(`${BASE_URL}/?nodemo=1`)

    // Placeholder surface renders with honest copy.
    const placeholder = page.locator('.placeholder-overlay')
    await expect(placeholder).toBeVisible()
    await expect(
        placeholder.locator('.placeholder-subtitle'),
    ).toContainText('tap to explore in 3D')
    expect(await placeholder.locator('.placeholder-subtitle').innerText()).not.toContain(
        'desktop',
    )

    const cta = page.getByTestId('placeholder-cta')
    await expect(cta).toBeVisible()
    await expect(cta).toContainText('Open in 3D')

    // Cold-boot render-kind is placeholder2d (LCP = static SVG).
    await expect(page.locator('body')).toHaveAttribute(
        'data-render-kind',
        'placeholder2d',
    )

    // Tap → signalReady() flips to webgl synchronously (scene mount may lag).
    await cta.click()
    await expect(page.locator('body')).toHaveAttribute('data-render-kind', 'webgl')
})