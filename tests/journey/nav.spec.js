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

test.describe('Navigation and UI hardening', () => {
    test('5o. demo replay restarts the choreography from phase 1 (M15 invariant)', async ({ page }) => {
        // M15 invariant: the keyboard-help "Replay tour" button dispatches
        // 'demo-replay-requested', which the canonical DemoChoreography
        // consumes to cancel any active demo, clear the session gate, and
        // re-enter the 10-phase choreography from Phase 1. No legacy
        // micro-demo is started, so veils do not stack.
        await page.setViewportSize({ width: 1440, height: 900 })

        // Force the auto-demo and use webgl so the scene becomes ready.
        await page.context().clearCookies()
        // contract-boot=1 (required since 682b3e82, 2026-08-23): bare automated
        // sessions intentionally never auto-fire engineReady, so a passive
        // ?demo=force load used to sit on the splash forever and time out here.
        // This spec tests REPLAY, not the splash flow (covered elsewhere), so we
        // opt into the documented boot shortcut.
        await page.goto(`${BASE_URL}/dist/svelte/index.html?demo=force&webgl=1&contract-boot=1`, {
            waitUntil: 'domcontentloaded'
        })
        // Pin no-preference motion: the qa-journey-headless low-contention
        // profile emulates prefers-reduced-motion:reduce suite-wide, and
        // requestReplay() deliberately refuses under reduced motion (P2 guard).
        // Without this override the replay click silently no-ops under the
        // canonical wrapper even though the feature works for default users.
        await page.emulateMedia({ reducedMotion: 'no-preference' })
        await page.evaluate(() => {
            try {
                sessionStorage.clear()
            } catch {
                /* ignore */
            }
            try {
                localStorage.clear()
            } catch {
                /* ignore */
            }
        })

        // The first-visit help dialog may auto-open and block the demo.
        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }

        // Wait for the canonical demo choreography box to appear.
        const demoBox = page.locator('#demo-choreography')
        // Raised 30->45s->80s: the forced-demo WebGL scene boot + first phase is
        // the heaviest test in the suite; isolation total is ~56s, but after
        // serial WebGL tests the boot chain exceeds 45s (verify-batch2 L4627
        // TimeoutError). 80s is practical headroom for this heavyweight.
        await demoBox.waitFor({ state: 'visible', timeout: 80000 })

        // Open the keyboard-help panel (the replay affordance lives there).
        const helpBtn = page.locator('#btn-keyboard-help').first()
        // `#btn-keyboard-help` lives inside <Header>, which App.svelte mounts only
        // when headerVisible holds (App.svelte ~L212: !mapModeActive &&
        // (idle | search-family | focus surface)). Under ?demo=force the 10-phase
        // choreography drives surface/phase transitions (OVERVIEW→SEARCH→FOCUS→…
        // map); the header does not mount until the demo reaches a headerVisible
        // surface. That lands ~3s after #demo-choreography appears on an idle
        // machine, but phase progression + headless/CI contention can push it past
        // 5s — wait generously for the header to mount.
        await helpBtn.waitFor({ state: 'visible', timeout: 30000 })
        // Settle one frame so Svelte 5's onclick={openKeyboardHelp} binding flushes
        // before the click dispatches (guards a freshly-mounted-button race where
        // the rect is visible but the listener is not yet attached).
        await page.waitForTimeout(150)
        await helpBtn.click()
        // 20s timeout accommodates WebGL GPU-stall delays during initial scene
        // setup that block Svelte's reactivity flush (~7-11s) — see W55 timeline diagnosis.
        await page
            .locator('#keyboard-hint-panel.visible, #keyboard-hint-panel[aria-hidden="false"]')
            .waitFor({ state: 'visible', timeout: 20000 })

        // Click the user-visible "Replay tour" button.
        const replayBtn = page.locator('#btn-replay-tour').first()
        // 20s timeout accommodates WebGL GPU-stall delays during initial scene
        // setup that block Svelte's reactivity flush (~7-11s) — see W55 timeline diagnosis.
        await replayBtn.waitFor({ state: 'visible', timeout: 20000 })
        await replayBtn.click()

        // The canonical replay path re-creates the choreography box.
        // Wait for it to re-appear with non-empty phase text (Phase 1).
        await demoBox.waitFor({ state: 'visible', timeout: 15000 })
        await page.waitForTimeout(300) // allow Svelte flush for text content

        const phaseText = await demoBox.locator('p').textContent()
        expect(phaseText, 'demo replay must render a phase caption from Phase 1').not.toBeNull()
        expect(phaseText?.trim().length, 'demo replay phase caption must be non-empty').toBeGreaterThan(0)

        // M15 invariant: exactly one demo choreography box (no stacked veils).
        const boxCount = await page.locator('#demo-choreography').count()
        expect(boxCount, 'M15 invariant: exactly one demo choreography box (no stacking)').toBe(1)
    })

    test('T1-4: mode chip clicks sync nav state (Bug #3 setJourneyPhase + Bug #5 currentView)', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const explore = page
            .locator('[data-testid="splash-cta"], button[aria-label="Open in 3D"], [data-testid="placeholder-cta"]')
            .first()
        await explore.waitFor({ state: 'visible', timeout: 60000 })
        await explore.click()

        // 20s timeout accommodates WebGL GPU-stall delays during initial scene
        // setup that block Svelte's reactivity flush (~7-11s) — see W55 timeline diagnosis.
        await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, {
            timeout: 20000,
            polling: 100
        })
        await page.waitForTimeout(1000)

        // Dismiss help dialog if present
        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }

        // Initial state: surface=idle, currentView=galaxy
        const initialSurface = await page.evaluate(() => window.__APP_STATE__?.navState?.surface)
        expect(initialSurface, 'initial nav surface should be idle').toBe('idle')

        // Click the 'search' mode chip; selectMode() calls SET_SURFACE +
        // setJourneyPhase + updateUrlState. Bug #3 fix ensures setJourneyPhase
        // is called from selectMode.
        await page.click('.mode-chip[data-mode="search"]', { force: true })
        await page.waitForTimeout(500)

        const searchSurface = await page.evaluate(() => window.__APP_STATE__?.navState?.surface)
        expect(searchSurface, 'clicking search chip should set nav surface to search').toBe('search')

        // Click the 'map' mode chip; selectMode() calls SET_VIEW + SET_SURFACE.
        // Bug #5 fix: writeNavStateMirror({ currentView: view }) in SET_VIEW
        // case ensures currentView is synced.
        // T1-4 rAF-stall: locator.click on this chip hung past the app test
        // timeout under serial WebGL accumulation (full-suite transcript: page.click
        // on .mode-chip[data-mode="map"] -> 120s timeout; force:true bypasses
        // visibility but not the post-click rAF settle). Dispatch at the chip
        // center via coordinates — same pattern as the W54/map-back fix.
        const mapChip = page.locator('.mode-chip[data-mode="map"]')
        await mapChip.waitFor({ state: 'visible', timeout: 10000 })
        const mapBox = await mapChip.boundingBox()
        if (!mapBox) throw new Error('map chip missing bounding box (expected visible)')
        await page.mouse.click(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2)
        await page.waitForTimeout(500)

        const mapView = await page.evaluate(() => window.__APP_STATE__?.currentView)
        expect(mapView, 'clicking map chip should set currentView to map').toBe('map')
    })

    test('F-search-8: search result scores are normalized to 0-1 range with granularity', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const explore = page
            .locator('[data-testid="splash-cta"], button[aria-label="Open in 3D"], [data-testid="placeholder-cta"]')
            .first()
        await explore.waitFor({ state: 'visible', timeout: 60000 })
        await explore.click()

        // 20s timeout accommodates WebGL GPU-stall delays during initial scene
        // setup that block Svelte's reactivity flush (~7-11s) — see W55 timeline diagnosis.
        await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, {
            timeout: 20000,
            polling: 100
        })
        await page.waitForTimeout(1000)

        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }

        // Click the 'search' mode chip (keyboard handler requires Ctrl+1-6;
        // mode chip clicks exercise selectMode directly).
        await page.click('.mode-chip[data-mode="search"]', { force: true })
        await page.waitForTimeout(500)

        const searchInput = page
            .locator('#search-input, input[placeholder*="Search"], input[placeholder*="search"]')
            .first()
        // 20s timeout accommodates WebGL GPU-stall delays during initial scene
        // setup that block Svelte's reactivity flush (~7-11s) — see W55 timeline diagnosis.
        await searchInput.waitFor({ state: 'visible', timeout: 20000 })
        await searchInput.fill('coffee')

        // Wait for at least one search result to render BEFORE reading scores.
        // Fixed 2000ms + one-shot score reads was a vacuous-pass hole: if no
        // results rendered, scores.length===0 and every assertion passed.
        await page.waitForFunction(() => document.querySelectorAll('.search-result-item').length >= 1, null, {
            timeout: 15000,
            polling: 100
        })

        // Result items render as .search-result-listitem with a button carrying
        // data-result-score (the presentation refactor moved the class)
        const scores = await page.evaluate(() => {
            const results = Array.from(document.querySelectorAll('[data-result-score]'))
            return results
                .map((r) => {
                    const score = r.getAttribute('data-result-score')
                    return score ? parseFloat(score) : null
                })
                .filter((s) => s !== null)
        })

        expect(scores.length, 'must have at least one scored search result').toBeGreaterThan(0)

        for (const s of scores) {
            expect(s).toBeGreaterThanOrEqual(0)
            expect(s).toBeLessThanOrEqual(1)
        }

        const maxScore = Math.max(...scores)
        expect(maxScore).toBeGreaterThan(0)
    })

    test('F-nav-5: clicking map chip syncs currentView to map (Bug #5 currentView sync)', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const explore = page
            .locator('[data-testid="splash-cta"], button[aria-label="Open in 3D"], [data-testid="placeholder-cta"]')
            .first()
        await explore.waitFor({ state: 'visible', timeout: 60000 })
        await explore.click()

        // 20s timeout accommodates WebGL GPU-stall delays during initial scene
        // setup that block Svelte's reactivity flush (~7-11s) — see W55 timeline diagnosis.
        await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, {
            timeout: 20000,
            polling: 100
        })
        await page.waitForTimeout(1000)

        // Dismiss help dialog if present
        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }

        // Initial currentView should be 'galaxy' (the default)
        const initialView = await page.evaluate(() => window.__APP_STATE__?.currentView)
        expect(initialView, 'initial currentView should be galaxy').toBe('galaxy')

        // Click the 'map' mode chip; selectMode() -> SET_VIEW dispatches
        // nav currentView='map'. Bug #5 fix: writeNavStateMirror({ currentView: view })
        // in SET_VIEW case ensures currentView is synced through the nav state mirror.
        await page.click('.mode-chip[data-mode="map"]', { force: true })
        await page.waitForTimeout(500)

        const mapView = await page.evaluate(() => window.__APP_STATE__?.currentView)
        expect(mapView, 'clicking map chip should set currentView to map').toBe('map')
    })

    test('F5.1: SemanticOverlay renders the correct mode badge for manifold (focus) and lens (Inside)', async ({
        page
    }) => {
        // SemanticOverlay.svelte mounts with visible={true} (App.svelte:400) and renders
        // #semantic-overlay + .overlay-badge only when `overlayActive` is true, which is
        // gated on the nav mirror: visible && (isFocused || surface==='inside' ||
        // surface==='thread-inspect' || threadInspectorActive()). overlayMode is derived:
        //   threadInspectorActive -> 'thread' | surface==='inside' -> 'lens' | isFocused -> 'manifold'
        // Entry points mirror existing journey tests: focusOnNode (Bug 2 / F14 idiom) ->
        // manifold; the Inside mode chip (#mode-chips [data-mode="inside"] -> SET_SURFACE
        // 'inside') -> lens. We assert the badge label + title attribute, reading them
        // via evaluate because the CSS `overlay-out @4s` animation zeroes the badge
        // opacity after 4s while the title/label textContent persist in the DOM.
        await page.addInitScript(() => {
            try {
                localStorage.setItem(
                    'moco_onboarding_seen_v1',
                    JSON.stringify({ seen: true, seenAt: new Date().toISOString() })
                )
            } catch {
                /* best-effort */
            }
        })
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const explore = page
            .locator('[data-testid="splash-cta"], button[aria-label="Open in 3D"], [data-testid="placeholder-cta"]')
            .first()
        await explore.waitFor({ state: 'visible', timeout: 60000 })
        await explore.click()

        // 20s timeout accommodates WebGL GPU-stall delays during initial scene
        // setup that block Svelte's reactivity flush (~7-11s) — see W55 timeline diagnosis.
        await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, {
            timeout: 20000,
            polling: 100
        })
        await page.waitForTimeout(1000)

        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }

        // Helper: read #semantic-overlay visibility + .overlay-badge title/label. Opacity
        // (the 4s fade) is intentionally NOT the signal — title/label are in the DOM regardless.
        const readOverlay = async () =>
            page.evaluate(() => {
                const overlay = document.querySelector('#semantic-overlay')
                const badge = document.querySelector('.overlay-badge')
                const label = badge?.querySelector('.badge-label')
                return {
                    overlayPresent: !!overlay,
                    overlayDisplay: overlay ? getComputedStyle(overlay).display : null,
                    badgePresent: !!badge,
                    badgeTitle: badge?.getAttribute('title') ?? null,
                    badgeLabel: label?.textContent?.trim() ?? null
                }
            })

        // ── MANIFOLD: focus a node -> hasFocus() true (nav mode='focus', surface='focus').
        // surface !== 'inside' so the lens branch is skipped; isFocused is true -> 'manifold'.
        await page.evaluate(() => {
            const actions = window.__navActions__
            if (!actions || typeof actions.focusOnNode !== 'function') {
                throw new Error('__navActions__.focusOnNode is not exposed')
            }
            const ok = actions.focusOnNode(518)
            if (!ok) throw new Error('focusOnNode(518) returned a falsy result')
        })
        await page.waitForFunction(() => window.__APP_STATE__?.navState?.mode === 'focus', null, {
            timeout: 15000,
            polling: 100
        })

        const manifold = await readOverlay()
        expect(manifold.overlayPresent, 'manifold: #semantic-overlay must render after focus').toBe(true)
        expect(manifold.overlayDisplay, 'manifold: #semantic-overlay must not be display:none').not.toBe('none')
        expect(manifold.badgePresent, 'manifold: .overlay-badge must render after focus').toBe(true)
        expect(
            manifold.badgeLabel,
            `manifold: .overlay-badge label must read "Manifold" (got "${manifold.badgeLabel}")`
        ).toBe('Manifold')
        expect(
            manifold.badgeTitle,
            'manifold: .overlay-badge title must describe nearby-business highlighting'
        ).toContain('Nearby businesses')

        // ── LENS: click the Inside mode chip. selectMode('inside') dispatches
        // SET_SURFACE {surface:'inside'} (mode-nav.ts) -> nav.surface='inside'.
        // The parity panelSurface separately resolves to 'semantic-dive' (via
        // semanticDiveMode/trailDepth===2), but SemanticOverlay reads nav.surface,
        // so surface==='inside' -> overlayMode 'lens'. The Inside chip is unlocked
        // once a node is focused (Bug 2 idiom); assert that before clicking.
        const insideChip = page.locator('#mode-chips [data-mode="inside"]')
        await insideChip.waitFor({ state: 'attached', timeout: 15000 })
        const insideLabel = await insideChip.getAttribute('aria-label')
        expect(
            insideLabel?.toLowerCase(),
            'Inside chip must be unlocked (no "lock" in aria-label) after a node is focused'
        ).not.toContain('lock')
        // F5.1 W61-fix: invoke the inside-mode dispatch directly via __navActions__.setSurface
        // instead of `insideChip.click()`. The inside chip can be CSS-occluded by the
        // surface-focus panel chrome and pointer-events / hit-testing make Playwright's
        // `locator.click({ timeout: 5000 })` time out despite the chip being unlocked;
        // the programmatic setSurface surfaces the same `SET_SURFACE 'inside'`
        // transition that selectMode('inside') dispatches (mode-nav.ts:152), so the
        // SemanticOverlay's `nav.surface === 'inside'` -> 'lens' branch is exercised.
        await page.evaluate(() => {
            if (!window.__navActions__ || typeof window.__navActions__.setSurface !== 'function') {
                throw new Error('__navActions__.setSurface is not exposed')
            }
            window.__navActions__.setSurface('inside')
        })
        await page.waitForFunction(
            () =>
                document.querySelector('#semantic-overlay') &&
                document.querySelector('.overlay-badge .badge-label')?.textContent?.trim() === 'Lens',
            null,
            { timeout: 10000, polling: 100 }
        )

        const lens = await readOverlay()
        expect(lens.overlayPresent, 'lens: #semantic-overlay must render after entering Inside mode').toBe(true)
        expect(lens.overlayDisplay, 'lens: #semantic-overlay must not be display:none').not.toBe('none')
        expect(lens.badgePresent, 'lens: .overlay-badge must render after entering Inside mode').toBe(true)
        expect(lens.badgeLabel, `lens: .overlay-badge label must read "Lens" (got "${lens.badgeLabel}")`).toBe('Lens')
        expect(lens.badgeTitle, 'lens: .overlay-badge title must describe the deep-exploration lens').toContain(
            'exploration lens'
        )
    })

    test('F5.2: SemanticGuideCard synthesize -> summary card -> suggestion chip drives focus', async ({ page }) => {
        test.setTimeout(300000)
        // SemanticGuideCard.svelte: #btn-synthesize onclick -> requestSemanticGuide()
        // (semantic-guide.ts). startSemanticGuideRequest() shows #semantic-summary-card
        // (class:hidden toggles off !isVisible) synchronously, then a fetch completes
        // and writes a card config whose suggestions render as
        // .suggestion-btn[data-lead-id] chips. handleSuggestionClick looks the
        // lead_id up in appState.pointIndexByLeadId and calls focusOnNode -> navState.mode='focus'.
        //
        // requestSemanticGuide() early-returns when buildSemanticGuideRequestPayload()
        // is null, which only happens before a search has run (the payload reads
        // currentSearchSummary). So we seed a 'coffee' search first. We also cap the
        // fetch via the dev override window.__SEMANTIC_GUIDE_TIMEOUT_MS__ (read by
        // getSemanticGuideTimeoutMs at fetch time) so a slow/absent API resolves to the
        // deterministic fallback card instead of stalling the suite — the fallback
        // still emits suggestion chips with lead_ids that map to real points.
        await page.addInitScript(() => {
            try {
                localStorage.setItem(
                    'moco_onboarding_seen_v1',
                    JSON.stringify({ seen: true, seenAt: new Date().toISOString() })
                )
            } catch {
                /* best-effort */
            }
            try {
                window.__SEMANTIC_GUIDE_TIMEOUT_MS__ = 2000
            } catch {
                /* dev hook */
            }
        })
        // pollFor is defined at module scope (see file top) — CDP-channel polling
        // immune to WebGL rAF stalls (W61 F5.2 fix).
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const explore = page
            .locator('[data-testid="splash-cta"], button[aria-label="Open in 3D"], [data-testid="placeholder-cta"]')
            .first()
        await explore.waitFor({ state: 'visible', timeout: 60000 })
        await explore.click()

        // 20s timeout accommodates WebGL GPU-stall delays during initial scene
        // setup that block Svelte's reactivity flush (~7-11s) — see W55 timeline diagnosis.
        await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, {
            timeout: 20000,
            polling: 100
        })
        await page.waitForTimeout(1000)

        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }

        // Seed a search so buildSemanticGuideRequestPayload() yields a non-null
        // payload with result rows (and therefore suggestion chips).
        const searchInput = page.locator('#search-input')
        await searchInput.waitFor({ state: 'attached', timeout: 20000 })
        await searchInput.fill('coffee')
        await page.keyboard.press('Enter')
        await page.waitForFunction(
            () => {
                const items = document.querySelectorAll('.search-result-listitem, [role="option"]')
                return items.length >= 4
            },
            null,
            { timeout: 45000, polling: 100 }
        )
        await page.waitForTimeout(800)

        // ── Step 1: trigger synthesize -> #semantic-summary-card reveals (loading card
        // shown synchronously before the fetch resolves).
        const btnSynthesize = page.locator('#btn-synthesize')
        await btnSynthesize.waitFor({ state: 'attached', timeout: 10000 })
        // F5.2 W61-fix: the synthesize CTA is intentionally CSS-hidden by
        // strands.css:1076 (`body:is([data-panel-surface='focus'], [data-panel-surface='focus-search']) .synthesize-trigger { display: none; }`)
        // and progressive_disclosure.css at every reachable `body.surface-*`
        // (idle/search/focus/semantic-dive/map). Svelte's `SemanticGuideCard`
        // `class:hidden` is NOT toggled here (isVisible is false, currentView !== 'map'),
        // so the button IS attached and Svelte-unhidden — but the global CSS keeps it
        // display:none. We assert `toBeAttached` (DOM presence check) replaces
        // `toBeVisible` (which collapses CSS visibility/display), then trigger the
        // `onclick={requestSemanticGuide}` handler via a programmatic `.click()`
        // that fires regardless of CSS display:none.
        await expect(btnSynthesize, '#btn-synthesize must be in the DOM at search surface').toBeAttached()
        // F5.2 W61-final: trigger synthesize. The button is CSS display:none'd by
        // global strands.css, so Playwright actionability-click would hang; a direct
        // DOM element.click() fires the Svelte onclick={requestSemanticGuide} handler.
        await page.evaluate(() => {
            const btn = document.querySelector('#btn-synthesize')
            if (!btn) throw new Error('#btn-synthesize not found at synthesize step')
            btn.click()
        })
        // Wait for the summary card to reveal. pollFor polls via the CDP-channel
        // page.evaluate on a fixed interval — immune to the WebGL rAF stalls that
        // make page.waitForFunction flaky here — and checks Svelte's authoritative
        // `class:hidden` (not CSS-computed display, which strands.css shadows). The
        // loading card reveals synchronously after the click (~250ms for Svelte's
        // reactivity flush), well within the 5s budget.
        const revealed = await pollFor(
            page,
            () => {
                const card = document.querySelector('#semantic-summary-card')
                return !!card && !card.classList.contains('hidden')
            },
            5000
        )
        expect(revealed, '#semantic-summary-card must reveal (un-hidden) after synthesize').toBe(true)
        const cardState = await page.evaluate(() => {
            const card = document.querySelector('#semantic-summary-card')
            if (!card) return null
            return {
                present: true,
                hidden: card.classList.contains('hidden'),
                title: document.querySelector('#summary-card-title-text')?.textContent?.trim() ?? null
            }
        })
        expect(cardState, '#semantic-summary-card must render after clicking #btn-synthesize').not.toBeNull()
        expect(cardState.hidden, '#semantic-summary-card must not be hidden after synthesize').toBe(false)

        // ── Step 2: wait for suggestion chips (after fetch resolves -> success or fallback).
        await page.waitForFunction(
            () => !!document.querySelector('#semantic-summary-card .suggestion-btn[data-lead-id]'),
            null,
            { timeout: 20000, polling: 100 }
        )
        const suggestionCount = await page.locator('#semantic-summary-card .suggestion-btn[data-lead-id]').count()
        expect(
            suggestionCount,
            'summary card must render >=1 suggestion chip with a data-lead-id'
        ).toBeGreaterThanOrEqual(1)

        // ── Step 3: click a suggestion chip -> handleSuggestionClick -> focusOnNode -> mode='focus'.
        const firstSuggestion = page.locator('#semantic-summary-card .suggestion-btn[data-lead-id]').first()
        const leadId = await firstSuggestion.getAttribute('data-lead-id')
        expect(leadId, 'suggestion chip must carry a data-lead-id').toBeTruthy()
        const modeBefore = await page.evaluate(() => window.__APP_STATE__?.navState?.mode)
        await firstSuggestion.click()

        // focusOnNode (current surface is 'search') sets FOCUS_NODE surface='focus-search',
        // mode='focus'. assert the navigation state changed from the pre-click mode.
        await page.waitForFunction(() => window.__APP_STATE__?.navState?.mode === 'focus', null, {
            timeout: 15000,
            polling: 100
        })
        const modeAfter = await page.evaluate(() => window.__APP_STATE__?.navState?.mode)
        expect(
            modeAfter,
            `clicking a suggestion chip must drive navState.mode to 'focus' (was "${modeBefore}", got "${modeAfter}")`
        ).toBe('focus')
    })

    test('F5.3: ProximityLegend reveals on first visit and dismiss hides it', async ({ page }) => {
        // ProximityLegend.svelte: first-visit concept card. onMount reads
        // `moco_onboarding_seen_v1`; if `{seen:true}` it sets dismissed=true and
        // never reveals. Otherwise, once engineReady.value && !isDemoActive(),
        // reveal() sets visible=true after a 100ms delay -> .proximity-legend-wrapper
        // renders. Dismiss via .proximity-legend-dismiss (aria-label=
        // "Dismiss proximity legend") -> handleDismiss() sets dismissed=true,
        // visible=false, markOnboardingSeen() -> wrapper removed from DOM. This test
        // forces first-visit (clear the onboarding key), waits for reveal, clicks
        // dismiss, and asserts the wrapper is gone + onboarding is marked seen.
        await page.addInitScript(() => {
            try {
                window.localStorage.removeItem('moco_onboarding_seen_v1')
            } catch {
                /* ignore */
            }
        })
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const explore = page
            .locator('[data-testid="splash-cta"], button[aria-label="Open in 3D"], [data-testid="placeholder-cta"]')
            .first()
        await explore.waitFor({ state: 'visible', timeout: 60000 })
        await explore.click()

        // 30s budget accommodates WebGL GPU-stall delays during initial scene
        // setup that block Svelte's reactivity flush (~7-11s) — see W55 timeline
        // diagnosis. Polled via the module-scope pollFor (CDP channel, immune to
        // rAF stalls) rather than waitForFunction's rAF polling (W61 F5.3 flake).
        const pointsReady = await pollFor(page, () => (window.__APP_STATE__?.points?.length ?? 0) > 100, 30000)
        expect(pointsReady, 'engine must populate >100 points within 30s (cold-start tolerant)').toBe(true)

        // The help dialog auto-opens on first visit (desktop, !isCompact, !isDeepLink)
        // right after engineReady; dismiss it so it cannot occlude the legend.
        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }

        // Wait for the ProximityLegend to reveal. It gates on engineReady.value (fires
        // after clicking Enter 3D Scene) + a 100ms reveal delay; auto-dismisses after
        // 10s (W49b), so assert promptly once attached. pollFor (CDP channel) instead
        // of waitForFunction's rAF polling (W61 F5.3 flake).
        const legendRevealed = await pollFor(
            page,
            () => {
                const wrapper = document.querySelector('.proximity-legend-wrapper')
                if (!wrapper) return false
                const cs = getComputedStyle(wrapper)
                return cs.display !== 'none' && cs.visibility !== 'hidden'
            },
            15000
        )
        expect(legendRevealed, 'ProximityLegend must reveal (visible) within 15s').toBe(true)
        const beforeDismiss = await page.evaluate(() => {
            const wrapper = document.querySelector('.proximity-legend-wrapper')
            const dismiss = document.querySelector('.proximity-legend-dismiss')
            return {
                wrapperPresent: !!wrapper,
                dismissPresent: !!dismiss,
                dismissAria: dismiss?.getAttribute('aria-label') ?? null
            }
        })
        expect(beforeDismiss.wrapperPresent, 'legend must reveal on first visit').toBe(true)
        expect(beforeDismiss.dismissPresent, 'legend must render the dismiss control').toBe(true)
        expect(beforeDismiss.dismissAria, 'dismiss control must carry aria-label "Dismiss proximity legend"').toBe(
            'Dismiss proximity legend'
        )

        // Click dismiss -> handleDismiss() -> wrapper removed from DOM + onboarding marked seen.
        // W61-F5.3: invoke dismiss via a programmatic DOM click (page.evaluate) instead
        // of `page.locator().click()`. Playwright's mouse-event-based `click()` hit-tests
        // through `pointer-events`, and both the wrapper (`pointer-events:none`) and the
        // slideUp CSS animation (translateY 12px -> 0 over 500ms) make actionability
        // retries report "element not stable". A direct `.click()` on the button element
        // invokes `onclick={handleDismiss}` synchronously, bypassing hit-testing entirely.
        await page.evaluate(() => {
            const btn = document.querySelector('.proximity-legend-dismiss')
            if (btn) btn.click()
        })
        const dismissed = await pollFor(page, () => document.querySelector('.proximity-legend-wrapper') === null, 8000)
        expect(dismissed, 'wrapper must be removed from DOM after dismiss').toBe(true)
        const afterDismiss = await page.evaluate(() => {
            const wrapper = document.querySelector('.proximity-legend-wrapper')
            const raw = window.localStorage.getItem('moco_onboarding_seen_v1')
            return {
                wrapperPresent: !!wrapper,
                onboardingSeen: raw ? JSON.parse(raw).seen === true : false
            }
        })
        expect(afterDismiss.wrapperPresent, 'legend wrapper must be removed after dismiss').toBe(false)
        expect(
            afterDismiss.onboardingSeen,
            'dismiss must mark onboarding as seen so the legend does not re-reveal'
        ).toBe(true)
    })

    test('F5.4: switchView URL sync via the typed event bus (regression d4e0f096)', async ({ page }) => {
        // Escape in map view routes handleGlobalKeydown -> returnToOverview() ->
        // switchView('galaxy'), which must publish EVENTS.URL_SYNC_REQUESTED on the
        // typed event bus (was an orphaned 'semantic:url-sync-requested' window
        // CustomEvent with zero listeners) so updateUrlState() drops view=map from
        // the URL. Regression d4e0f096. NOTE: the map-back button and mode chips
        // sync the URL via dispatchNavTransition / selectMode paths that bypass
        // switchView._requestUrlSync — Escape is the live user path that exercises
        // this fix (verified via mutation: reverting _requestUrlSync makes the
        // drop assertion fail).
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&view=map`, { waitUntil: 'domcontentloaded' })

        // Deep-link boot: currentView must settle to map and the URL must carry view=map.
        await page.waitForFunction(() => window.__APP_STATE__?.currentView === 'map', null, {
            timeout: 10000,
            polling: 100
        })
        expect(page.url(), 'deep-linked map view must be recorded in the URL').toContain('view=map')

        // Escape -> returnToOverview() -> switchView('galaxy') -> _requestUrlSync.
        await page.keyboard.press('Escape')

        await page.waitForFunction(() => window.__APP_STATE__?.currentView === 'galaxy', null, {
            timeout: 10000,
            polling: 100
        })

        // THE fix: the URL must drop view=map through the typed-bus sync.
        await page.waitForFunction(
            () => !(location.search.includes('view=map') || location.hash.includes('view=map')),
            null,
            { timeout: 10000, polling: 50 }
        )
        expect(page.url(), 'URL must drop view=map after switchView(galaxy)').not.toContain('view=map')

        // Round-trip: re-enter map via the mode chip (selectMode path) and confirm
        // view=map returns to the URL.
        await page.click('.mode-chip[data-mode="map"]', { force: true })
        await page.waitForFunction(() => window.__APP_STATE__?.currentView === 'map', null, {
            timeout: 10000,
            polling: 100
        })
        await page.waitForFunction(
            () => location.search.includes('view=map') || location.hash.includes('view=map'),
            null,
            { timeout: 10000, polling: 50 }
        )
        expect(page.url(), 'URL must record view=map after re-entering map view').toContain('view=map')
    })

    test('idle placeholder CTA is pill-radius + hint readable (design-call 2026-08-05)', async ({ page }) => {
        test.setTimeout(60000)
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })
        // Poll for the settled style predicate instead of a raw 4.2s sleep.
        // No existence wait: if hydration/placeholder mount lags past 4.2s
        // the one-shot read is null → fail; if it mounts mid-sleep the read
        // races the fade-in. The settled predicate gates on both elements
        // present AND the expected CSSOM values.
        const settled = await pollFor(
            page,
            () => {
                const cta = document.querySelector('.placeholder-cta')
                const hint = document.querySelector('.placeholder-hint')
                if (!cta || !hint) return false
                const c = getComputedStyle(cta)
                const h = getComputedStyle(hint)
                const radius = c.borderRadius
                const opacity = Number(h.opacity)
                return radius === '999px' && opacity >= 0.7
            },
            30000,
            100
        )
        expect(settled, 'idle CTA must settle to pill-radius + readable hint').toBe(true)
        const styles = await page.evaluate(() => {
            const cta = document.querySelector('.placeholder-cta')
            const hint = document.querySelector('.placeholder-hint')
            if (!cta || !hint) return null
            const c = getComputedStyle(cta)
            const h = getComputedStyle(hint)
            return { radius: c.borderRadius, hintOpacity: Number(h.opacity) }
        })
        expect(styles, 'idle must render the Enter-3D CTA + hint').not.toBeNull()
        expect(styles.radius, 'CTA uses pill radius for consistency').toBe('999px')
        expect(styles.hintOpacity, 'hint text must be readable (>= 0.7)').toBeGreaterThanOrEqual(0.7)
    })

    test('tablet focus: proximity legend self-collapses at 936', async ({ page }) => {
        test.setTimeout(60000)
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&anchor=519&view=galaxy`, {
            waitUntil: 'domcontentloaded'
        })
        await page.setViewportSize({ width: 936, height: 800 })
        // Wait for the SETTLED state, not just wrapper existence: the deep-link
        // focus transition starts on the idle surface (legend expanded), then
        // flips to focus-search (legend collapsed). Polling for existence alone
        // races that transition and flakes under machine load.
        await pollFor(
            page,
            () => {
                const w = document.querySelector('.proximity-legend-wrapper')
                return !!w && w.classList.contains('collapsed')
            },
            30000,
            100
        )
        const st = await page.evaluate(() => {
            const w = document.querySelector('.proximity-legend-wrapper')
            return w ? { collapsed: w.classList.contains('collapsed'), vis: getComputedStyle(w).visibility } : null
        })
        expect(st, 'legend wrapper must exist').not.toBeNull()
        expect(st.collapsed, 'legend is self-collapsed on focus at ≤1024').toBe(true)
        expect(st.vis, '…and hidden').toBe('hidden')
    })

    test('mobile focus: list toggle lifts above the dive strip', async ({ page }) => {
        test.setTimeout(60000)
        const runtimeErrors = []
        page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`))
        page.on('console', (message) => {
            if (message.type() === 'error') runtimeErrors.push(`console.error: ${message.text()}`)
        })
        await page.setViewportSize({ width: 390, height: 844 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&anchor=519&view=galaxy`, {
            waitUntil: 'domcontentloaded'
        })
        // Mobile cold-load entry depends on device capability since S5
        // auto-enter AND on deep-link self-entry (main.ts fires signalReady at
        // boot for ?anchor/?record/?q deep-links on non-placeholder2d boots).
        // Self-entry takes TWO forms: webgl (desktop-capable boot, splash
        // dismissed) or placeholder2d deep-link (mobile boot auto-enters the
        // journey — URL gains surface=focus-search, splash shell is
        // display:none'd, #btn-journey-primary mounts, and the CTA inside it
        // never becomes visible). Only a NON-deep-link placeholder boot shows
        // a clickable entry CTA.
        const selfEntered = await pollFor(
            page,
            () => {
                const webglEntered =
                    document.body.dataset.renderKind === 'webgl' &&
                    !document.querySelector('[data-testid="splash-cta"]:not([hidden])')
                const placeholderEntered =
                    document.body.dataset.renderKind === 'placeholder2d' &&
                    !!document.querySelector('#btn-journey-primary')
                return webglEntered || placeholderEntered
            },
            8000,
            100
        )
        if (!selfEntered) {
            await page
                .locator('[data-testid="splash-cta"], [aria-label="Open in 3D"], [data-testid="placeholder-cta"]')
                .waitFor({ state: 'visible', timeout: 30000 })
            await page.evaluate(() => {
                const cta = document.querySelector(
                    '[data-testid="splash-cta"], [aria-label="Open in 3D"], [data-testid="placeholder-cta"]'
                )
                if (cta) cta.click()
            })
        }
        // Surface-aware entry: the app self-enters into WebGL on capable
        // desktops, but mobile deep-link boots stay on placeholder2d by product
        // intent (S5 — mobile does NOT build the WebGL scene). Accept EITHER
        // surface as entered: webgl + dive strip, or placeholder2d mounted.
        const surfaceReady = await pollFor(
            page,
            () => {
                const dive = document.querySelector('#btn-focus-dive')
                const webglEntered = document.body.dataset.renderKind === 'webgl' && !!dive && !dive.hidden
                const placeholderEntered =
                    document.body.dataset.renderKind === 'placeholder2d' &&
                    !!document.querySelector('#btn-journey-primary')
                return webglEntered || placeholderEntered
            },
            30000,
            100
        )
        expect(surfaceReady, 'mobile focus overlap test must reach a real surface (webgl dive or placeholder2d)').toBe(true)

        // The toggle must lift above the surface's primary action: the bottom
        // dive strip on webgl, the top-mounted Step Inside on placeholder2d.
        const renderSurface = await page.evaluate(() => document.body.dataset.renderKind)
        const clearsAction = await pollFor(
            page,
            () => {
                const el = document.querySelector('#focus-pocket-list-toggle')
                const primary = document.querySelector('#btn-journey-primary')
                const dive = document.querySelector('#btn-focus-dive')
                if (!el || !el.classList.contains('lifted')) return false
                const r = el.getBoundingClientRect()
                if (document.body.dataset.renderKind === 'webgl' && dive && !dive.hidden) {
                    const dr = dive.getBoundingClientRect()
                    return r.y + 44 <= dr.top + 2
                }
                // placeholder2d: lift above the top-mounted primary action.
                if (primary) {
                    const pr = primary.getBoundingClientRect()
                    const overlap =
                        Math.max(0, Math.min(r.right, pr.right) - Math.max(r.left, pr.left)) *
                        Math.max(0, Math.min(r.bottom, pr.bottom) - Math.max(r.top, pr.top))
                    return overlap === 0
                }
                return true
            },
            30000,
            100
        )
        expect(clearsAction, `toggle lifted and clears the ${renderSurface} surface's primary action`).toBe(true)
        const st = await page.evaluate(() => {
            const el = document.querySelector('#focus-pocket-list-toggle')
            if (!el) return null
            const dive = document.querySelector('#btn-focus-dive')
            const dr = dive && !dive.hidden ? dive.getBoundingClientRect() : null
            const r = el.getBoundingClientRect()
            return { lifted: el.classList.contains('lifted'), y: r.y, diveTop: dr ? dr.top : null }
        })
        expect(st, 'toggle must exist').not.toBeNull()
        expect(st.lifted, 'toggle should carry the lifted class on mobile focus').toBe(true)
        if (st.diveTop != null) expect(st.y + 44 <= st.diveTop + 2, 'toggle bottom clears the dive strip').toBe(true)

        const compactAction = await page.evaluate(() => {
            const button = document.querySelector('#btn-journey-primary')
            if (!button) return null
            return {
                text: button.textContent?.trim() || '',
                clientWidth: button.clientWidth,
                scrollWidth: button.scrollWidth
            }
        })
        expect(compactAction, 'mobile focus must keep the primary journey action mounted').not.toBeNull()
        expect(compactAction.text, 'primary journey action keeps its accessible label').toBe('Step Inside')
        expect(
            compactAction.scrollWidth,
            'compact Step Inside action must not clip its visible label'
        ).toBeLessThanOrEqual(compactAction.clientWidth)

        await page.evaluate(() => {
            document.querySelector('#focus-pocket-list-toggle')?.click()
        })
        const listOpened = await pollFor(
            page,
            () => {
                const list = document.querySelector('#focus-pocket-a11y.visible')
                const toggle = document.querySelector('#focus-pocket-list-toggle[aria-expanded="true"]')
                return !!list && !!toggle && list.getBoundingClientRect().height > 100
            },
            10000,
            100
        )
        expect(listOpened, 'opening the nearby list must reveal a real panel, not a one-line strip').toBe(true)

        const openedLayout = await page.evaluate(() => {
            const list = document.querySelector('#focus-pocket-a11y.visible')
            const toggle = document.querySelector('#focus-pocket-list-toggle[aria-expanded="true"]')
            const primary = document.querySelector('#btn-journey-primary')
            const dive = document.querySelector('#btn-focus-dive')
            if (!list || !toggle || !primary) return null
            const rect = (element) => {
                const box = element.getBoundingClientRect()
                return { left: box.left, top: box.top, right: box.right, bottom: box.bottom }
            }
            const overlaps = (a, b) =>
                Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
                Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
            const listRect = rect(list)
            const toggleRect = rect(toggle)
            const primaryRect = rect(primary)
            const diveRect = dive && !dive.hidden ? rect(dive) : null
            return {
                listHeight: list.getBoundingClientRect().height,
                listScrollHeight: list.scrollHeight,
                listZIndex: Number.parseInt(getComputedStyle(list).zIndex, 10),
                togglePrimaryOverlap: overlaps(toggleRect, primaryRect),
                listDiveOverlap: diveRect ? overlaps(listRect, diveRect) : 0
            }
        })
        expect(openedLayout, 'opened nearby list must expose measurable layout').not.toBeNull()
        expect(openedLayout.listHeight, 'opened nearby list must have visible intrinsic height').toBeGreaterThan(100)
        expect(openedLayout.listHeight, 'opened nearby list must contain its scroll content').toBeGreaterThanOrEqual(
            openedLayout.listScrollHeight
        )
        expect(
            openedLayout.listZIndex,
            'opened nearby list must paint above the focus card stack'
        ).toBeGreaterThanOrEqual(500)
        expect(openedLayout.togglePrimaryOverlap, 'expanded list toggle must not cover Step Inside').toBe(0)
        expect(openedLayout.listDiveOverlap, 'opened nearby list must clear the bottom dive strip').toBe(0)
        expect(runtimeErrors, 'mobile focus journey must not emit runtime or console errors').toEqual([])
    })
})
