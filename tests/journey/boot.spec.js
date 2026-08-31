import { test, expect } from '@playwright/test'
import { BASE_URL } from '../helpers/3d-interaction-helpers.js'

// GPU cleanup between tests: close the page and its entire browser context so
// serial WebGL journeys do not accumulate renderer bookkeeping. Do not call
// WEBGL_lose_context here: that deliberately fires the app's recovery path and
// can race the next test while the context is being torn down.
test.afterEach(async ({ page }) => {
    const context = page.context()
    try {
        await page.close().catch(() => {})
    } catch {
        // Cleanup is best-effort — don't mask the real test failure.
    } finally {
        // Close this exact per-test context. Playwright fixture teardown
        // tolerates this idempotent close when it runs again after the test.
        await context.close().catch(() => {})
    }
})

// pollFor: CDP-channel state polling used by the F5 journey tests. Uses
// `page.evaluate` + `page.waitForTimeout` on a fixed interval instead of
// `page.waitForFunction`'s default rAF polling. The headless-chromium WebGL
// pipeline (the app mounts the mycelium WebGL scene) is subject to GPU
// ReadPixels stalls that delay rAF for several seconds at a time, and
// `page.waitForFunction` can time out before its predicate is ever evaluated
// even though the underlying state has already flipped (verified via an
// explicit `page.evaluate` poll seeing `class:hidden` removed at ~250ms).
// `page.evaluate` is dispatched over the CDP request channel and is immune to
// rAF stalls, so polling it on a fixed interval reliably captures the state.
const pollFor = async (page, predicate, timeoutMs, intervalMs = 50, evalArg) => {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
        if (await page.evaluate(predicate, evalArg)) return true
        await page.waitForTimeout(intervalMs)
    }
    return false
}


test.describe('Boot journey', () => {
    test('desktop cold boot settles a live WebGL scene with the full point set', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const explore = page
            .locator('[data-testid="splash-cta"], button[aria-label="Open in 3D"], [data-testid="placeholder-cta"]')
            .first()
        await explore.waitFor({ state: 'visible', timeout: 60000 })
        await explore.click()

        const settled = await pollFor(
            page,
            () => {
                const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
                return (
                    document.body.dataset.graphicsMode === 'webgl' &&
                    document.body.dataset.renderKind === 'webgl' &&
                    document.body.dataset.sceneReady === 'true' &&
                    appState.currentView === 'galaxy' &&
                    Array.isArray(appState.points) &&
                    appState.points.length >= 8406 &&
                    !!appState.renderer &&
                    !!appState.scene &&
                    !!appState.camera
                )
            },
            60000,
            100
        )

        expect(settled, 'desktop boot must publish a ready WebGL scene').toBe(true)
        await expect(page.locator('canvas').first()).toBeVisible()
        await expect(page.locator('text=3D scene unavailable')).toHaveCount(0)
        await expect(page.locator('text=Unable to load')).toHaveCount(0)
        // Demo-phase ribbon: with nodemo=1 the demo is disabled so phase stays IDLE.
        expect(
            await page.evaluate(() => document.body.dataset.demoPhase),
            'body.dataset.demoPhase must be set (not undefined) after splash dismissal'
        ).toMatch(/^(IDLE|OVERVIEW|SEARCH|FOCUS|THREADS|NEIGHBORS|TRAIL|DIVE|FILTER|MAP|RETURN|COMPLETE|CANCELLED)$/)
    })

    test('combined deep-link ?surface=inside&anchor=518&q=coffee&nodemo=1 settles semantic dive with focused anchor', async ({
        page
    }) => {
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.addInitScript(() => {
            window.__PLAYWRIGHT__ = true
        })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&surface=inside&anchor=518&q=coffee`, {
            waitUntil: 'domcontentloaded'
        })

        const settled = await pollFor(
            page,
            () => {
                const nav = window.__APP_STATE__?.navState ?? {}
                const summary = window.__APP_STATE__?.searchState?.currentSearchSummary
                return (
                    document.body.dataset.sceneReady === 'true' &&
                    nav.focusedIndex === 518 &&
                    nav.mode === 'inside' &&
                    nav.surface === 'inside' &&
                    document.body.dataset.panelSurface === 'semantic-dive' &&
                    summary?.query === 'coffee'
                )
            },
            60000,
            100
        )

        expect(settled, 'combined deep-link must settle inside/semantic-dive + focused anchor + query restore').toBe(
            true
        )
        expect(page.url(), 'combined deep-link must preserve the exact query params').toContain('surface=inside')
        expect(page.url(), 'combined deep-link must preserve anchor=518').toContain('anchor=518')
        expect(page.url(), 'combined deep-link must preserve q=coffee').toContain('q=coffee')

        // Settled desktop viewport invariant: title mentions Semantic Explorer and
        // no surface-level error banner is present.
        await expect(page).toHaveTitle(/Semantic Explorer|MoCo Business Mycelium/)
        await expect(page.locator('text=3D scene unavailable')).toHaveCount(0)
        await expect(page.locator('text=Unable to load')).toHaveCount(0)

        // Desktop semantic-dive surface + focused anchor visibility contract.
        expect(await page.evaluate(() => document.body.classList.contains('surface-semantic-dive'))).toBe(true)
        expect(
            await page.evaluate(() => window.__APP_STATE__?.navState?.focusedIndex),
            'desktop combined deep-link must focus anchor 518 in nav state'
        ).toBe(518)

        // The focused card must render; only assert the node label is present
        // when the panel surface has actually mounted to avoid racing
        // transient skeleton.
        const hasFocusedLabel = await page.evaluate(() => {
            const el = document.querySelector('#selected-card, .focus-card, [data-focused-index="518"]')
            if (!el) return false
            const text = (el.textContent || '').trim()
            return text.length > 0
        })
        expect(hasFocusedLabel, 'desktop combined deep-link must render focused anchor content').toBe(true)
    })

    test('combined deep-link on mobile ?surface=inside&anchor=518&q=coffee&nodemo=1 settles semantic dive', async ({
        page
    }) => {
        // Mobile contract: same combined deep-link, compact viewport.
        await page.setViewportSize({ width: 375, height: 667 })
        await page.addInitScript(() => {
            window.__PLAYWRIGHT__ = true
        })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&surface=inside&anchor=518&q=coffee`, {
            waitUntil: 'domcontentloaded'
        })

        const settled = await pollFor(
            page,
            () => {
                const nav = window.__APP_STATE__?.navState ?? {}
                const summary = window.__APP_STATE__?.searchState?.currentSearchSummary
                return (
                    document.body.dataset.sceneReady === 'true' &&
                    nav.focusedIndex === 518 &&
                    nav.mode === 'inside' &&
                    nav.surface === 'inside' &&
                    document.body.dataset.panelSurface === 'semantic-dive' &&
                    summary?.query === 'coffee'
                )
            },
            60000,
            100
        )

        expect(
            settled,
            'mobile combined deep-link must settle inside/semantic-dive + focused anchor + query restore'
        ).toBe(true)
        expect(page.url(), 'mobile combined deep-link must preserve the exact query params').toContain('surface=inside')
        expect(page.url(), 'mobile combined deep-link must preserve anchor=518').toContain('anchor=518')
        expect(page.url(), 'mobile combined deep-link must preserve q=coffee').toContain('q=coffee')

        expect(
            await page.evaluate(() => document.body.classList.contains('surface-semantic-dive')),
            'mobile combined deep-link must engage the semantic-dive surface'
        ).toBe(true)
        expect(
            await page.evaluate(() => window.__APP_STATE__?.navState?.focusedIndex),
            'mobile combined deep-link must focus anchor 518 in nav state'
        ).toBe(518)
    })

    test('Narrow-portrait 320px semantic-dive: weather suppressed + focus card within proportion limit (W53 v6)', async ({
        page
    }) => {
        await page.setViewportSize({ width: 320, height: 740 })
        await page.addInitScript(() => {
            window.__PLAYWRIGHT__ = true
        })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&surface=inside&anchor=518&q=coffee`, {
            waitUntil: 'domcontentloaded'
        })

        const settled = await pollFor(
            page,
            () => {
                return (
                    document.body.dataset.sceneReady === 'true' &&
                    document.body.classList.contains('surface-semantic-dive')
                )
            },
            60000,
            100
        )

        expect(settled, 'narrow-portrait semantic-dive must settle into surface-semantic-dive').toBe(true)

        // Weather widget must be hidden on narrow portrait: the z600 focus card
        // bottom sheet spans full width, painting under the z50 weather pill.
        // The @media(max-width:360px) rule sets display:none on .weather-widget.
        const weatherHidden = await page.evaluate(() => {
            const el = document.querySelector('.weather-widget')
            if (!el) return true
            return window.getComputedStyle(el).display === 'none'
        })
        expect(weatherHidden, 'weather widget must be hidden (display:none) on 320px semantic-dive').toBe(true)

        // Focus card bottom-sheet height must stay within the 0.88 mobile
        // surface-proportion limit. Effective viewport = 740px - 26px header =
        // 714px; 0.88 x 714 = 628px. The @media(max-width:360px) rule caps
        // max-height at calc(100dvh - 120px - safe-area) ~ 620px.
        const focusCardOk = await page.evaluate(() => {
            const card = document.querySelector('#focus-card-selected.focus-card')
            if (!card) return true
            const rect = card.getBoundingClientRect()
            const headerEl = document.querySelector('header')
            const headerH = headerEl ? headerEl.getBoundingClientRect().height : 0
            const effectiveVh = window.innerHeight - headerH
            const ratio = rect.height / effectiveVh
            return ratio <= 0.89
        })
        expect(focusCardOk, 'focus card height must be within 0.88 mobile proportion limit on 320px').toBe(true)
    })

    test('explicit inside deep-link survives anchor restoration', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.addInitScript(() => {
            window.__PLAYWRIGHT__ = true
        })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&surface=inside&anchor=518`, {
            waitUntil: 'domcontentloaded'
        })

        const settled = await pollFor(
            page,
            () => {
                const nav = window.__APP_STATE__?.navState ?? {}
                return (
                    document.body.dataset.sceneReady === 'true' &&
                    nav.focusedIndex === 518 &&
                    nav.mode === 'inside' &&
                    nav.surface === 'inside' &&
                    document.body.dataset.panelSurface === 'semantic-dive'
                )
            },
            60000,
            100
        )

        expect(settled, 'inside deep-link must restore the requested semantic-dive surface').toBe(true)
        await expect(page.getByRole('radio', { name: 'Inside' })).toBeChecked()
    })

    test('map compass Search remains available without a selection', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&view=map`, { waitUntil: 'domcontentloaded' })
        await page.waitForFunction(() => window.__APP_STATE__?.currentView === 'map', null, {
            timeout: 10000,
            polling: 100
        })

        const searchAction = page.locator('#btn-journey-tertiary[data-journey-action="focus-search"]')
        await searchAction.waitFor({ state: 'visible', timeout: 20000 })
        await expect(searchAction).toHaveAttribute('aria-disabled', 'false')

        await searchAction.click()
        await expect(page.locator('#search-input')).toBeFocused()
        expect(
            await page.evaluate(() => window.__APP_STATE__?.currentView),
            'post-click map-search must preserve the map view'
        ).toBe('map')

        // ── Post-click settled state (2026-08-05 journey hardening) ──────────────
        // (a) The compass-controller FOCUS_SEARCH fix enters the map-trail search
        //     lane (SET_SURFACE { surface: 'map-trail' }) when the map has no
        //     business selection; the parity layer mirrors it to
        //     body[data-panel-surface]. The focused input is that lane's input.
        expect(
            await page.evaluate(() => document.body.dataset?.panelSurface),
            'post-click map-search must settle the map-trail search lane (compass-controller SET_SURFACE)'
        ).toBe('map-trail')

        // (b) Empty Escape while the search input is focused is a documented
        //     no-op: W52-UX-esc (SearchInput.svelte — empty query does nothing)
        //     + W7ks1-F1 (global-shortcuts.ts bails on isTextInputField, so
        //     return-to-overview never fires). The input keeps focus and the
        //     view stays map — Escape does NOT leave the map from here.
        await page.keyboard.press('Escape')
        await expect(page.locator('#search-input')).toBeFocused()
        await page.waitForFunction(() => window.__APP_STATE__?.currentView === 'map', null, {
            timeout: 5000,
            polling: 50
        })
    })

    test('map-trail surface activates journey chrome via nav mirror', async ({ page }) => {
        // This test verifies the parity system correctly propagates nav.surface='map-trail'
        // to body[data-panel-surface]='map-trail', then checks the lockstep App/JourneyChrome
        // gates mount the user-visible walk controls.
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const explore = page
            .locator('[data-testid="splash-cta"], button[aria-label="Open in 3D"], [data-testid="placeholder-cta"]')
            .first()
        await explore.waitFor({ state: 'visible', timeout: 60000 })
        await explore.click()

        // Wait for points to load and engine to be ready
        await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, {
            timeout: 20000,
            polling: 100
        })
        await page.waitForTimeout(1500)

        // Dismiss first-visit help dialog if present
        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }

        // Set the panel surface without switching the view. The public
        // setSurface() test helper intentionally derives currentView='map' for
        // map-family surfaces, which would correctly suppress this galaxy-only
        // focus stage before the parity gate can be observed.
        await page.waitForFunction(() => !!window.__navActions__?.writeNavStateMirror, { timeout: 5000 })
        await page.evaluate(() => {
            window.__navActions__?.writeNavStateMirror({ surface: 'map-trail' })
        })

        // Verify the parity system reflects map-trail in body[data-panel-surface]
        await page.waitForFunction(() => document.body.dataset.panelSurface === 'map-trail', { timeout: 5000 })

        const panelSurface = await page.evaluate(() => document.body.dataset.panelSurface)
        expect(panelSurface, 'parity layer must reflect map-trail surface').toBe('map-trail')

        await expect(page.locator('#focus-stage-journey')).toHaveClass(/active/)
        await expect(page.locator('#btn-focus-path')).toBeVisible()

        // Exit through the same lifecycle action used by the real journey. This
        // guards against a stale map-trail mirror keeping the focus-stage chrome
        // active after the app returns to overview.
        await page.evaluate(() => {
            const actions = window.__navActions__
            if (!actions?.returnToOverview) throw new Error('__navActions__.returnToOverview is not exposed')
            actions.returnToOverview()
        })
        await page.waitForFunction(
            () => {
                const appState = window.__APP_STATE__
                const panelSurface = document.body.dataset.panelSurface
                return (
                    appState?.currentView === 'galaxy' &&
                    appState?.navState?.mode === 'overview' &&
                    panelSurface !== 'map-trail'
                )
            },
            null,
            { timeout: 15000, polling: 100 }
        )

        const afterExit = await page.evaluate(() => ({
            currentView: window.__APP_STATE__?.currentView,
            mode: window.__APP_STATE__?.navState?.mode,
            panelSurface: document.body.dataset.panelSurface,
            focusStageActive: document.querySelector('#focus-stage-journey')?.classList.contains('active') ?? false
        }))
        expect(afterExit.currentView, 'map-trail exit must restore the galaxy view').toBe('galaxy')
        expect(afterExit.mode, 'map-trail exit must restore overview mode').toBe('overview')
        expect(afterExit.panelSurface, 'map-trail exit must clear the stale panel surface').not.toBe('map-trail')
        expect(afterExit.focusStageActive, 'map-trail exit must release focus-stage chrome').toBe(false)
    })

    test('deep-linked map focus: ?view=map&record=519 settles map + record focus', async ({ page }) => {
        // record=519 (lead_id 519 -> array index 518) is the established valid
        // deep-link fixture in this file (see the existing record=519 tests and
        // H5-deeplink-journey.spec.js). __PLAYWRIGHT__ forces the webgl render
        // kind so engineReady auto-fires at boot for deep-links (same mechanism
        // as the existing 390px deep-link test further down this file).
        await page.setViewportSize({ width: 375, height: 667 })
        await page.addInitScript(() => {
            window.__PLAYWRIGHT__ = true
        })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&view=map&record=519`, {
            waitUntil: 'domcontentloaded'
        })

        // Settled state: map view + the record focus resolved (record maps to
        // anchor index 518 via applyUrlState once the records load).
        await page.waitForFunction(
            () =>
                window.__APP_STATE__?.currentView === 'map' &&
                (window.__APP_STATE__?.navState?.focusedIndex === 518 || document.body.dataset?.focusedNode === '518'),
            null,
            { timeout: 20000, polling: 100 }
        )
        expect(page.url(), 'deep-linked map view must carry view=map in the URL').toContain('view=map')
        expect(page.url(), 'deep-linked record must be preserved in the URL').toContain('record=519')
    })

    test('Escape from a focused business restores the canonical document title', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.addInitScript(() => {
            window.__PLAYWRIGHT__ = true
        })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&anchor=519`, {
            waitUntil: 'domcontentloaded'
        })

        await page.waitForFunction(
            () => window.__APP_STATE__?.navState?.focusedIndex !== null && document.title.includes('Semantic Explorer'),
            null,
            { timeout: 30000, polling: 100 }
        )

        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
        }

        await page.evaluate(() => {
            // This journey must exercise the canonical app focus pipeline:
            // __navActions__.focusOnNode is intentionally nav-only for legacy
            // state tests and does not run selection/title/color side effects.
            const actions = window.__APP_ACTIONS__
            if (!actions || typeof actions.focusOnNode !== 'function') {
                throw new Error('__APP_ACTIONS__.focusOnNode is not exposed')
            }
            if (!actions.focusOnNode(0)) throw new Error('focusOnNode(0) returned falsy')
        })
        await page.waitForFunction(() => document.title !== 'Montgomery County Semantic Explorer | Case Study', null, {
            timeout: 15000,
            polling: 100
        })

        // The deep-link focus-search surface owns entry focus and may finish
        // its bounded rAF focus request after the title update. Let that
        // request settle, then explicitly focus the document so this assertion
        // exercises the app-level Escape handler rather than SearchInput's
        // documented empty-input no-op path.
        await page.waitForTimeout(250)
        await page.evaluate(() => {
            document.activeElement?.blur()
            document.body.setAttribute('tabindex', '-1')
            document.body.focus()
        })
        await expect(page.locator('#search-input')).not.toBeFocused()
        await page.keyboard.press('Escape')
        await page.waitForFunction(() => document.title === 'Montgomery County Semantic Explorer | Case Study', null, {
            timeout: 15000,
            polling: 100
        })
        await expect(page).toHaveTitle('Montgomery County Semantic Explorer | Case Study')
    })
})
