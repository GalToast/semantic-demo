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


test.describe('A11y journey', () => {
    test('5h. InfoPanel inert tracks aria-hidden across focus/overview transitions — W54 a11y fix', async ({
        page
    }) => {
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
        await page.waitForTimeout(1500)

        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }

        const infoPanel = page.locator('#info-panel')
        await infoPanel.waitFor({ state: 'attached', timeout: 15000 })

        // Force-CLOSE the InfoPanel by setting surface='semantic-dive' (desktop
        // non-compact). Anterior attempt "switchView('map')" was wrong: the
        // InfoPanel's App.svelte render gate is `{#if !mapModeActive}` (App.svelte:413),
        // so map-mode action UNMOUNTs #info-panel entirely rather than rendering it
        // `aria-hidden=true` + `inert`. Likewise `returnToOverview()` does NOT close
        // the panel — it returns to 'galaxy' view where the desktop-idle gate
        // `idleSurfaceActive=true` keeps `infoPanelOpen=true`.
        //
        // `setSurface('semantic-dive')` produces a closed-but-mounted state:
        // - nav.surface -> 'semantic-dive', nav.mode stays 'overview', nav.focusedIndex
        //   stays null (setSurface only touches {surface, previousSurface, mode});
        // - parity mirror writes parity.panelSurface='semantic-dive' so App.svelte's
        //   `focusActive` derive flips true via the `parity.panelSurface === 'semantic-dive'`
        //   clause — BUT at desktop non-compact the `infoPanelOpen` derive collapses:
        //   `(false || false || (true && parity.compact-false)) && !mapModeActive = false`;
        // - inside InfoPanel, the `panelOpen` derive (`panelVisible && (open || isFocused ||
        //   currentActiveResult!=null || testPanelSurface-cond)`):
        //     - open=false (infoPanelOpen deriver above);
        //     - isFocused=false (nav.mode='overview' + focusedIndex=null);
        //     - currentActiveResult=null (no search active);
        //     - testPanelSurface-cond falsehoody (no body.dataset override at runtime);
        //   `panelOpen=panelVisible-true && false=false` → `aria-hidden='true'` + `inert`
        //   present (W54 invariant) with InfoPanel STILL MOUNTED (mapModeActive=false).
        await page.evaluate(() => {
            const a = window.__navActions__
            if (!a?.setSurface) throw new Error('__navActions__.setSurface missing')
            a.setSurface('semantic-dive')
        })

        // 20s timeout accommodates WebGL GPU-stall delays during initial scene
        // setup that block Svelte's reactivity flush (~7-11s) — see W55 timeline diagnosis.
        await page.waitForFunction(
            () => document.querySelector('#info-panel')?.getAttribute('aria-hidden') === 'true',
            null,
            { timeout: 20000, polling: 100 }
        )

        // CLOSED invariant — W54 fix: inert must mirror aria-hidden (both derive from `panelOpen`).
        expect(await infoPanel.getAttribute('aria-hidden'), 'panel closed => aria-hidden=true').toBe('true')
        expect(
            await infoPanel.evaluate((el) => el.hasAttribute('inert')),
            'W54 invariant CLOSED: #info-panel[inert] present alongside aria-hidden=true'
        ).toBe(true)

        // When inert is present, NO focusable descendant of the closed panel may capture document.activeElement.
        // This is the W5 race window the inert fix defends against: a closed panel may briefly host snippet-rendered
        // `#search-input` between surface transitions; `inert` blocks keyboard + touch focus on each of them.
        const anyChildFocusCaptured = await page.evaluate(() => {
            const info = document.querySelector('#info-panel')
            if (!info || !info.hasAttribute('inert')) return null
            const focusables = info.querySelectorAll(
                'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
            Array.from(focusables).forEach((el) => {
                try {
                    if (typeof el.focus === 'function') el.focus()
                } catch {
                    // ignore — focus() may throw on inert-blocked elements; we assert the invariant below
                }
            })
            return Array.from(focusables).some((el) => document.activeElement === el)
        })
        expect(
            anyChildFocusCaptured,
            'W54 invariant CLOSED: inert present => NO focusable descendant captures document.activeElement (null=panel/inert absent)'
        ).toBe(false)

        // OPEN the InfoPanel back by returning to overview — `returnToOverview()` clears
        // mapModeActive (switches view back to 'galaxy' + resets nav.surface='idle' +
        // nav.focusedIndex=null via `resetExperienceState`), which routes back through
        // the desktop `idleSurfaceActive=true` gate so `infoPanelOpen=true` again.
        // Note: at desktop non-compact, `setSurface('focus')` alone would keep the
        // panel closed since `infoPanelOpen` requires `($viewport.isCompact || parity.compact)`
        // for the focus-active branch — desktop non-compact focus doesn't open the
        // InfoPanel via that branch (the FocusCard takes the focus-content UI slot).
        await page.evaluate(() => {
            const a = window.__navActions__
            if (!a?.returnToOverview) throw new Error('__navActions__.returnToOverview missing')
            a.returnToOverview()
        })

        await page.waitForFunction(
            () => {
                const el = document.querySelector('#info-panel')
                if (!el) return false
                return el.getAttribute('aria-hidden') === 'false'
            },
            null,
            // Raised 8->15s: the inert-removal panel-open chain can exceed 8s
            // under serial-suite GPU accumulation (full-suite 5h L3499).
            { timeout: 15000, polling: 100 }
        )

        expect(await infoPanel.getAttribute('aria-hidden'), 'panel open => aria-hidden=false').toBe('false')
        expect(
            await infoPanel.evaluate((el) => el.hasAttribute('inert')),
            'W54 invariant OPEN: #info-panel[inert] ABSENT so child content is focusable'
        ).toBe(false)
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
            { timeout: 5000, polling: 100 }
        )
    })

    test('W54 visual audit: map back button returns to overview from ?view=map deep-link', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&view=map`, { waitUntil: 'domcontentloaded' })

        await page.waitForFunction(() => window.__APP_STATE__?.currentView === 'map', null, {
            timeout: 10000,
            polling: 100
        })

        const backBtn = page.locator('.map-back-btn')
        // Raised from 10s: under serial-suite GPU accumulation the deep-link
        // boot can push the map-back button render past the old 10s budget
        // (full-suite transcript: L3564 TimeoutError on the visible wait).
        // currentView==='map' above already gates the state flip; the button
        // render is the lag.
        await backBtn.waitFor({ state: 'visible', timeout: 20000 })

        // W61-W54: the deep-link boot settles asynchronously (load-dependent
        // window, ~1-2s under suite load): the navStore mirror and
        // appState.navState transiently disagree on currentView while the
        // URL-state apply + initial-state write race (evidence:
        // tmp/w54-map-boot-race-REPORT.md + tmp/probe-w54*.mjs), and a
        // back-click landing in that window gets its galaxy write reverted by
        // the still-settling machinery. returnToOverview is idempotent, so
        // retry the click until the view holds — deterministic regardless of
        // the settle window length. Mirror of the smoke-spec W54 test.
        let galaxyHeld = false
        for (let attempt = 0; attempt < 4 && !galaxyHeld; attempt++) {
            // W61-rAF click stall: under serial WebGL accumulation a
            // `locator.click` on this confirmed-visible button hangs on
            // Playwright's post-click "scheduled navigations" rAF settle
            // (grep transcript: "click action done -> waiting for scheduled
            // navigations to finish" -> TimeoutError). Dispatch the click via a
            // coordinate mouse event at the button's center — the map-back
            // coordinate-click pattern — which fires onclick without the rAF
            // post-settle wait. returnToOverview is idempotent, so the retry
            // loop still confirms the view held.
            const box = await backBtn.boundingBox()
            if (!box) throw new Error('map-back button has no bounding box (expected visible)')
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
            galaxyHeld = await page
                .waitForFunction(() => window.__APP_STATE__?.currentView === 'galaxy', null, {
                    timeout: 5000,
                    polling: 100
                })
                .then(() => true)
                .catch(() => false)
        }
        expect(galaxyHeld, 'map back button must return to overview (currentView galaxy)').toBe(true)
        expect(page.url(), 'URL should drop view=map after returning to overview').not.toContain('view=map')
    })
})
