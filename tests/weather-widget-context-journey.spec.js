import { test, expect } from '@playwright/test'
import { ONBOARDING_STORAGE_KEY } from '@lib/onboarding/onboarding-storage'

// Rectified to the canonical journey-test boot contract (2026-07-30):
//   - shared BASE_URL / dist path (was hardcoded localhost:5173 + bare host)
//   - __PLAYWRIGHT__ auto-signal forces WebGL render-kind
//   - suppress the W52 first-visit help dialog before the post-splash mount
//   - dismiss the "Enter 3D scene" CTA so s3dSceneReady gates the lazy widget
// The widget's aria contract (WeatherWidget.svelte) is unchanged, so the
// assertions below are preserved verbatim.
const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8795').replace(/\/$/, '')
const APP = `${BASE_URL}/dist/svelte/index.html`

test.describe('Weather widget context journey', () => {
    test('weather widget exposes accurate location context', async ({ page }) => {
        await page.addInitScript(() => {
            window.__PLAYWRIGHT__ = true
        })

        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${APP}?nodemo=1`, { waitUntil: 'domcontentloaded' })

        // Suppress the post-splash first-visit help dialog so the weather pill is
        // unobstructed. Set before dismissing the splash — localStorage persists for
        // the context, and the dialog only auto-opens after the WebGL boot.
        try {
            await page.evaluate(() => {
                localStorage.setItem(
                    ONBOARDING_STORAGE_KEY,
                    JSON.stringify({ seen: true, seenAt: new Date().toISOString() })
                )
            })
        } catch {
            /* localStorage may be unavailable pre-navigation; best-effort */
        }

        // Desktop splash gate: WeatherWidget mounts only after s3dSceneReady
        // (App.svelte:411). With __PLAYWRIGHT__ the production build auto-signals
        // ready and bypasses the CTA; if the CTA is present (older build / non-auto
        // path), dismiss it to boot WebGL. Mirrors the canonical widget-journey boot.
        const explore = page.locator('[data-testid="splash-cta"], button[aria-label="Enter 3D scene"]').first()
        try {
            await explore.waitFor({ state: 'visible', timeout: 3000 })
            await explore.click()
        } catch {
            // Auto-booted via __PLAYWRIGHT__; no splash gate on this build.
        }

        const widget = page.locator('#weather-widget')
        await widget.waitFor({ state: 'visible', timeout: 30000 })

        const wrapperAria = await widget.getAttribute('aria-label')
        const wrapperTitle = await widget.getAttribute('title')
        const toggle = widget.locator('button.weather-toggle')
        const toggleAria = await toggle.getAttribute('aria-label')
        const toggleTitle = await toggle.getAttribute('title')

        expect(wrapperAria).toBe('Weather conditions for Montgomery County')
        expect(wrapperTitle).toBe('Current conditions for Montgomery County')
        expect(toggleAria).toBe('Toggle weather details — current conditions for Montgomery County')
        expect(toggleTitle).toBe('Current conditions for Montgomery County')
    })
})
