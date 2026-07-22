import { test, expect } from '@playwright/test'
import { BASE_URL } from './helpers/3d-interaction-helpers.js'

/**
 * MapView + Placeholder2D journey coverage (closes the big-components
 * cleanup plan §6 / §175–184 journey-test gap — those two surfaces
 * previously had only unit + contract tests; this is the first dedicated
 * headless-journey spec for them).
 *
 * Structural precedent: tests/map-empty-state-journey.spec.js (a separate
 * `*-journey.spec.js` for the map view using `?view=map&nodemo=1`).
 *
 * Verification: it `--list`s under `npx playwright test … --list` and passes
 * `npm run lint:tests`. The full runtime run (`npm run qa:mapview-placeholder`)
 * is gated to the main lane + run AFTER `npm run build:svelte && npm run
 * qa:server:ensure`, because it depends on the qa-server serving
 * `dist/svelte/index.html` and the vendored `dist/svelte/vendor/leaflet/*`
 * assets at `127.0.0.1:8795` (see M2).
 *
 * Key seams (verified at author time, HEAD 48fd247e):
 *  - `src/lib/orchestration/responsive-renderer.ts:55` — `?placeholder=1`
 *    URL param is the FORCE hook for `renderKind='placeholder2d'`
 *    (decision factor #2, deterministic; the webdriver narrow-viewport rule
 *    `getInitialRenderKind()` decision #3 also yields placeholder2d at ≤768px)
 *  - `src/lib/engine/map-state.ts:121-166` — `loadLeafletAssets()` rejects via
 *    `<script onerror>` (line 160) when its `vendor/leaflet/leaflet.js` fetch
 *    fails; the catch re-throws → `initMap()` rejects (line 240) → MapView's
 *    `activateLeafletMap` catch sets `status='error'` → renders the shared
 *    `<ErrorState variant="map" … onRetry={activateLeafletMap}>` (the
 *    `.map-retry-btn` retry button + `.map-status-text > strong` title).
 *  - `src/lib/stores/engine-ready.svelte.ts:30-31` — `signalReady()`
 *    synchronously calls `setRenderKind('webgl')`; the body render-kind class
 *    flips `render-kind-placeholder2d` → `render-kind-webgl`.
 *
 * NOT edited here: the splash CTA. On `?placeholder=1&nodemo=1` at 375px, the
 * splash stays (per AGENTS.md PR-B2/B4 — placeholder2d keeps the CTA gate).
 * That is the surface this file's `Placeholder2D journey` block exercises.
 */

const LEAFLET_JS_ROUTE = '**/vendor/leaflet/leaflet.js'
const LEAFLET_CSS_ROUTE = '**/vendor/leaflet/leaflet.css'

test.describe('MapView journey', () => {
    test('M1: ?view=map mounts the map chrome with an accessible header + status region', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?view=map&nodemo=1`, {
            waitUntil: 'domcontentloaded'
        })

        // Deep-link ?view=map on desktop (1280>768) → webgl renderKind (decision
        // #5; webdriver→placeholder rule #4 is gated on `!isDeepLinkParams`) →
        // MapView.svelte mounts because currentView flips to 'map'.
        const map = page.locator('section.map-view')
        await map.waitFor({ state: 'attached', timeout: 30000 })

        await expect(map).toHaveAttribute('role', 'application')
        await expect(map).toHaveAttribute(
            'aria-label',
            'Interactive business map of Montgomery County'
        )

        const header = map.locator('.map-view-header')
        await expect(header).toHaveCount(1)
        await expect(map.locator('.map-view-kicker')).toHaveText('MAP | MONTGOMERY COUNTY')
        await expect(map.locator('.map-view-title')).toHaveText('County terrain')

        // `.map-status` is rendered while `status !== 'ready'` — i.e. during the
        // initial 'loading' state MapView's onMount activates the leaflet map via
        // `activateLeafletMap()`. We only assert the structural carrier (the
        // status region + dot); we do NOT assert tile presence (network-dependent).
        const status = map.locator('.map-status')
        await status.waitFor({ state: 'attached', timeout: 30000 })
        await expect(status.locator('.map-status-dot')).toHaveCount(1)
    })

    test('M2: Leaflet load failure surfaces the shared ErrorState retry surface + Retry re-fires activateLeafletMap', async ({
        page
    }) => {
        await page.setViewportSize({ width: 1280, height: 800 })

        // Aborting just the tile host would FLAKE: Leaflet swallows async
        // tile-fetch errors so `initMap` resolves (with blank tiles) and
        // `status` never flips to 'error'. Aborting the LOCALLY-VENDORED
        // leaflet library asset deterministically fires `<script onerror>` →
        // `loadLeafletAssets()` rejects → `initMap()` re-throws → MapView's
        // catch sets `status='error'`. Belt+suspenders: abort both leaflet.js
        // and leaflet.css so either onLoad path triggers the reject.
        await page.route(LEAFLET_JS_ROUTE, (route) => route.abort('failed'))
        await page.route(LEAFLET_CSS_ROUTE, (route) => route.abort('failed'))

        await page.goto(`${BASE_URL}/dist/svelte/index.html?view=map&nodemo=1`, {
            waitUntil: 'domcontentloaded'
        })

        const map = page.locator('section.map-view')
        await map.waitFor({ state: 'attached', timeout: 30000 })

        // Error overlay surfaces once status='error' is set by the catch.
        await expect(map).toHaveClass(/is-error/, { timeout: 30000 })
        const status = map.locator('.map-status')
        await expect(status).toHaveClass(/is-error/)
        await expect(status.locator('.map-status-text strong')).not.toHaveText('')

        // The shared ErrorState (map variant) renders the retry button
        // `.map-retry-btn` with text "Retry" (retryLabel passed by MapView).
        const retryBtn = map.locator('.map-retry-btn')
        await expect(retryBtn).toHaveCount(1)
        await expect(retryBtn).toContainText('Retry')

        // Clear the leaflet abort so the next attempted load can proceed, then
        // click Retry. `activateLeafletMap()` synchronously sets `status='loading'`
        // BEFORE awaiting initMap() → `.map-view.is-error` disappears (the
        // module may briefly show `is-loading`).
        await page.unroute(LEAFLET_JS_ROUTE)
        await page.unroute(LEAFLET_CSS_ROUTE)
        await retryBtn.click()

        await page.waitForFunction(
            () => {
                const m = document.querySelector('.map-view')
                if (!m) return false
                return (
                    !m.classList.contains('is-error') || m.classList.contains('is-loading')
                )
            },
            null,
            { timeout: 10000 }
        )
    })
})

test.describe('Placeholder2D journey', () => {
    test('P1: mobile cold-load renders the placeholder CTA + title/badge + subtitle + 5-item legend + hint', async ({
        page
    }) => {
        // `?placeholder=1` is the responsive-renderer force hook for renderKind=
        // 'placeholder2d' (factor #2, deterministic on any viewport). At 375px
        // the narrow-viewport rule (#3) would also yield placeholder2d —
        // belt+suspenders. No `__PLAYWRIGHT__` is set so App.svelte's test
        // auto-signal does NOT flip renderKind to webgl.
        await page.setViewportSize({ width: 375, height: 667 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?placeholder=1&nodemo=1`, {
            waitUntil: 'domcontentloaded'
        })

        await page.waitForFunction(
            () => document.body.classList.contains('render-kind-placeholder2d'),
            null,
            { timeout: 10000 }
        )

        const placeholder = page.locator('[data-testid="placeholder-2d"]')
        await placeholder.waitFor({ state: 'visible', timeout: 15000 })

        await expect(placeholder).toHaveAttribute('role', 'region')
        await expect(placeholder).toHaveAttribute('aria-label', 'Semantic explorer preview')

        // Title + badge + subtitle copy (W47-C "Preview" framing).
        await expect(placeholder.locator('.placeholder-title')).toContainText('Semantic Explorer')
        await expect(placeholder.locator('.placeholder-badge')).toHaveText('Preview')
        await expect(placeholder.locator('.placeholder-subtitle')).toContainText('Montgomery County')

        // CTA: aria-label uses the lowercase 'scene' phrase; visible text uses
        // 'Scene' (capital S). Tap target ≥ 44×44 + aria-describedby points to hint.
        const cta = placeholder.locator('[data-testid="placeholder-cta"]')
        await expect(cta).toHaveCount(1)
        await expect(cta).toHaveAttribute('aria-label', 'Enter 3D scene')
        await expect(cta).toContainText('Enter 3D Scene')
        await expect(cta).toHaveAttribute('aria-describedby', 'placeholder-hint')
        const ctaRect = await cta.evaluate((el) => {
            const r = el.getBoundingClientRect()
            return { w: r.width, h: r.height }
        })
        expect(Math.min(ctaRect.w, ctaRect.h), 'CTA min dimension >= 44px').toBeGreaterThanOrEqual(44)

        // Legend: exactly 5 category items, each with an aria-hidden dot + a label.
        const legend = placeholder.locator('[data-testid="placeholder-legend"]')
        await expect(legend).toHaveCount(1)
        await expect(legend).toHaveAttribute('aria-label', 'Business categories in the dataset')
        const items = legend.locator('.placeholder-legend-item')
        await expect(items).toHaveCount(5)
        const count = await items.count()
        for (let i = 0; i < count; i++) {
            const item = items.nth(i)
            await expect(item.locator('.placeholder-legend-dot')).toHaveAttribute('aria-hidden', 'true')
            await expect(item.locator('.placeholder-legend-label')).not.toHaveText('')
        }

        // Hint copy.
        await expect(placeholder.locator('#placeholder-hint')).toContainText('load the full 3D scene')
    })

    test('P2: clicking the CTA fires engineReady → renderKind flips to webgl', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?placeholder=1&nodemo=1`, {
            waitUntil: 'domcontentloaded'
        })

        await page.waitForFunction(
            () => document.body.classList.contains('render-kind-placeholder2d'),
            null,
            { timeout: 10000 }
        )

        const cta = page.locator('[data-testid="placeholder-cta"]')
        await cta.waitFor({ state: 'visible', timeout: 15000 })

        // `enter3d()` (Placeholder2D.svelte) calls `engineReady.signalReady()`.
        // `signalReady()` synchronously calls `setRenderKind('webgl')`
        // (engine-ready.svelte.ts:30) → body class flips from
        // `render-kind-placeholder2d` to `render-kind-webgl`, and App.svelte's
        // render-gate unmounts the Placeholder2D component (gated on
        // renderKind==='placeholder2d').
        await cta.click()

        await page.waitForFunction(
            () => document.body.classList.contains('render-kind-webgl'),
            null,
            { timeout: 15000 }
        )
        await expect(cta).toBeHidden({ timeout: 10000 })
    })

    test('P3: legend dot colors are distinct + each dot carries an inline background-color directive', async ({
        page
    }) => {
        // We assert STRUCTURAL color coverage (each dot has an inline
        // `background-color` directive + the 5 dots compute distinct colors),
        // NOT exact CLUSTER_COLORS equality — the dot style is injected as
        // inline `style="background-color: {cat.color}"` where `cat.color` is
        // the canonical CLUSTER_COLORS[i] hex, but the computed value can
        // resolve via CSS variables / rgba() / currentColor depending on tokens
        // active at paint time, making exact-equality fragile. The distinctness
        // + directive-presence guards are deterministic and catch the real
        // regression (collapsed colors / missing color on a legend item).
        await page.setViewportSize({ width: 375, height: 667 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?placeholder=1&nodemo=1`, {
            waitUntil: 'domcontentloaded'
        })

        await page.waitForFunction(
            () => document.body.classList.contains('render-kind-placeholder2d'),
            null,
            { timeout: 10000 }
        )

        const dots = page.locator('[data-testid="placeholder-legend"] .placeholder-legend-dot')
        await dots.first().waitFor({ state: 'attached', timeout: 15000 })
        expect(await dots.count(), 'legend must render 5 dots').toBe(5)

        const inlineStyles = await page.evaluate(() => {
            const els = Array.from(
                document.querySelectorAll('[data-testid="placeholder-legend"] .placeholder-legend-dot')
            )
            return els.map((el) => el.getAttribute('style') || '')
        })
        expect(inlineStyles).toHaveLength(5)
        for (const style of inlineStyles) {
            expect(
                style.toLowerCase(),
                'each legend dot must carry an inline background-color directive'
            ).toContain('background-color')
        }

        const computedColors = await page.evaluate(() => {
            const els = Array.from(
                document.querySelectorAll('[data-testid="placeholder-legend"] .placeholder-legend-dot')
            )
            return els.map((el) => getComputedStyle(el).backgroundColor)
        })
        for (const c of computedColors) {
            expect(c, 'legend dot must compute a non-empty background color').toBeTruthy()
        }
        expect(
            new Set(computedColors).size,
            'legend dots must compute 5 distinct colors (collapsed-color regression guard)'
        ).toBe(computedColors.length)
    })
})
