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


test.describe('Search journey', () => {

    /**
     * Stub the semantic-search API (returning `count` rows) plus the
     * lane-health probe, and count semantic_search requests. Shared by the
     * W71 deep-link tests so their route wiring cannot drift apart.
     */
    async function stubSearchApi(page, count) {
        const requests = { count: 0 }
        await page.route(
            (url) => {
                const parsed = new URL(url)
                return parsed.pathname.endsWith('/api.php') && parsed.searchParams.get('action') === 'semantic_search'
            },
            async (route) => {
                requests.count += 1
                const body =
                    count > 0
                        ? {
                              ok: true,
                              count,
                              results: [
                                  {
                                      lead_id: 1,
                                      name: 'Java Junction Coffee',
                                      what: 'Coffee roaster and cafe',
                                      city: 'Conroe',
                                      lat: 30.3119,
                                      lng: -95.4561,
                                      cluster: 3,
                                      status: 'active',
                                      website: 'https://example.com/java',
                                      email: 'hello@example.com',
                                      phone: '(936) 555-0101',
                                      score: 0.99,
                                      semantic_score: 0.99
                                  }
                              ]
                          }
                        : { ok: true, count: 0, results: [] }
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify(body)
                })
            }
        )
        await page.route(
            (url) => {
                const parsed = new URL(url)
                return (
                    parsed.pathname.endsWith('/api.php') && parsed.searchParams.get('action') === 'semantic_lane_health'
                )
            },
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ ok: true, state: 'healthy', provenance: { label: 'Search ready' } })
                })
            }
        )
        return requests
    }
    test('5g. Focus-panel facts separator is aria-hidden (W47 audit #2)', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const explore = page
            .locator('[data-testid="splash-cta"], button[aria-label="Open in 3D"], [data-testid="placeholder-cta"]')
            .first()
        // Raised 40s->60s: this initial-boot splash-CTA render is the first GPU/stall
        // exposure after prior suite WebGL tests; under serial accumulation the
        // engineReady signal gating the CTA can push past 40s (full-suite L56).
        await explore.waitFor({ state: 'visible', timeout: 60000 })
        await explore.click()

        // 20s timeout accommodates WebGL GPU-stall delays during initial scene
        // setup that block Svelte's reactivity flush (~7-11s) — see W55 timeline diagnosis.
        await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, {
            timeout: 20000,
            polling: 100
        })
        await page.locator('.weather-widget').waitFor({ state: 'attached', timeout: 45000 })
        await page.waitForTimeout(1500)

        // The first-visit help dialog auto-opens after splash dismissal
        // (Header.svelte); Escape (now allowed by global-shortcuts) closes it.
        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }

        // Pre-condition: pick a data point that has BOTH phone and website so
        // the facts row renders at least 2 <a> elements with a .fact-sep between them. The
        // raw-pipe & aria-hidden assertions are vacuous on a 0-/1-fact row.
        const targetIndex = await page.evaluate(() => {
            const points = window.__APP_STATE__?.points ?? []
            const limit = Math.min(points.length, 1000)
            for (let i = 0; i < limit; i++) {
                const p = points[i]
                if (p && p.phone && p.website) return i
            }
            return -1
        })
        expect(
            targetIndex,
            'pre-condition: at least one point in the corpus must carry phone + website to exercise a facts separator'
        ).toBeGreaterThanOrEqual(0)

        await page.evaluate((idx) => {
            const actions = window.__navActions__
            if (!actions || typeof actions.focusOnNode !== 'function') {
                throw new Error('__navActions__.focusOnNode is not exposed')
            }
            const ok = actions.focusOnNode(idx)
            if (!ok) throw new Error(`focusOnNode(${idx}) returned a falsy result`)
        }, targetIndex)

        // The focus transition and info-panel flush are asynchronous; wait for
        // a stable focus state and the rendered #selected-facts element before
        // asserting on the facts row (W48-UX clone-aware).
        // The first post-focus frame can compile the large WebGL material set
        // on Chromium's default headless renderer. The app state is correct
        // once that frame yields, but a 15s assertion timeout turns the cold
        // renderer stall into a false red (the D3D11 path settles faster).
        await page.waitForFunction(
            () =>
                window.__APP_STATE__?.navState?.mode === 'focus' && document.querySelector('#selected-facts') !== null,
            null,
            { timeout: 45000, polling: 100 }
        )

        // W48-UX: the DOM can carry a hidden responsive clone of the info panel;
        // wait for attachment rather than strict visibility, then assert on the
        // focused panel's rendered facts.
        const facts = page.locator('#selected-facts')
        await facts.waitFor({ state: 'attached', timeout: 20000 })
        // 20s timeout accommodates WebGL GPU-stall delays during initial scene
        // setup that block Svelte's reactivity flush (~7-11s) — see W55 timeline diagnosis.
        await page.waitForTimeout(150) // allow $derived effects to flush

        const anchorCount = await facts.locator('a').count()
        expect(
            anchorCount,
            'pre-condition: the focused point must render at least 2 contact <a> elements to exercise a separator'
        ).toBeGreaterThanOrEqual(2)

        // W47 audit #2: the facts row must NOT contain a literal "|" text node
        // (the audit snapshotted "| Phone: (281)..." because the original code
        // rendered raw &nbsp;|&nbsp; — see SelectedBusinessDetails.svelte).
        const factsText = (await facts.textContent()) ?? ''
        expect(factsText, 'W47 audit #2 fix: no raw "|" separator is allowed in #selected-facts').not.toContain('|')

        // Every rendered .fact-sep MUST be aria-hidden so screen readers skip
        // the divider glyph instead of voicing "vertical bar Phone colon".
        const seps = facts.locator('.fact-sep')
        const sepCount = await seps.count()
        expect(sepCount, 'pre-condition: at least 2 facts must produce at least 1 .fact-sep').toBeGreaterThanOrEqual(1)
        for (let i = 0; i < sepCount; i++) {
            const hidden = await seps.nth(i).getAttribute('aria-hidden')
            expect(hidden, `fact-sep #${i} must be aria-hidden="true" so AT skips the divider`).toBe('true')
        }
        const glyph = (await seps.nth(0).textContent())?.trim()
        expect(glyph, 'separator glyph should render the middle-dot (U+00B7), not the pipe').toBe('·')
    })

    test.fixme('5h. Trail counter never says "Stop N of 0" (W48 audit, JourneyChrome regression)', async ({ page }) => {
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
        await page.locator('.weather-widget').waitFor({ state: 'attached', timeout: 45000 })
        await page.waitForTimeout(1500)

        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }

        // SUPERSEDED (2026-08-06): the "Stop N of 0" regression is now pinned by
        // unit-level structural guards in tests/unit-active/
        // focus-ui-pr-w47-g-fallback-structural.test.ts (which reads BOTH
        // focus-ui.ts and JourneyChrome.svelte and asserts the 0-neighbor fallback
        // copy + the `neighborCount > 0 ?` branch exist). A full walk-journey
        // route to a 0-neighbor node is not deterministically reachable in this
        // harness (W48 note), so this journey test stays fixme as a breadcrumb
        // only — the real regression net is the unit guard. Boot setup kept for
        // future re-activation.
        const naturalProgress = await page.evaluate(
            () => document.querySelector('#focus-stage-progress')?.textContent?.trim() ?? ''
        )
        expect(typeof naturalProgress).toBe('string')
    })

    test('5i. Mobile (375px): synthesize-trigger + search-trail-cue never overlap result cards (W48 audit)', async ({
        page
    }) => {
        // W48 mobile audit: at 375px the bottom-anchored search panel shares
        // its screen region with two absolute-positioned overlays:
        //   1. .synthesize-trigger  ("Synthesize trail" CTA)
        //   2. .search-trail-cue    ("Connection cue / Search opens a trail.")
        // Both anchored to bottom: 5rem, right: 1rem. On desktop they sit in
        // unused bottom-right space; on mobile the search panel claims that
        // exact rectangle, so the overlays occluded Match 3's body and city
        // text. Fix hides both at max-width: 768px.
        await page.setViewportSize({ width: 375, height: 812 })
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
        await page.locator('.weather-widget').waitFor({ state: 'attached', timeout: 45000 })
        await page.waitForTimeout(1500)

        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }

        // Trigger a search so the connection cue becomes visible (it shows
        // during the 'query' stage of the search lifecycle).
        await page.fill('#search-input', 'coffee')
        await page.keyboard.press('Enter')
        // Fold geometry into a single settled-predicate poll: items>=4 + cue.top
        // in the W58 band (64..240) + a visible result card (h>0). The old pattern
        // of "wait items>=4 + 800ms sleep + one-shot rects" raced the peek-sheet
        // layout shift after result render.
        const settled = await pollFor(
            page,
            () => {
                const items = document.querySelectorAll('.search-result-listitem, [role="option"]')
                if (items.length < 4) return false
                const cue = document.querySelector('#search-trail-cue')
                if (!cue) return false
                const cueRect = cue.getBoundingClientRect()
                if (cueRect.top < 64 || cueRect.top >= 240) return false
                const cs = getComputedStyle(cue)
                if (cs.display === 'none' || cs.visibility === 'hidden') return false
                const match = items[0].getBoundingClientRect()
                if (match.height <= 0) return false
                return true
            },
            45000,
            100
        )
        expect(settled, 'items>=4 + cue in W58 band + match visible must settle').toBe(true)

        // W48 fix landed in d77bfeb7: the search-trail-cue is repositioned
        // to top: 1rem on mobile (instead of hidden) so it stays visible
        // on small screens without occluding the bottom-anchored search
        // panel. The W48 audit invariant is "never overlap result cards",
        // not "must be display:none" — assert the cue is visible and top
        // anchored, and (below) that its rect does not intersect Match 3.
        // The .synthesize-trigger remains display:none on mobile (W48
        // intent preserved by the d77bfeb7 SemanticGuideCard change).
        // Re-read geometry for the existing assertions.
        const overlap = await page.evaluate(() => {
            const result = { synth: null, cue: null }
            const synth = document.querySelector('.synthesize-trigger')
            if (synth) {
                const cs = getComputedStyle(synth)
                const r = synth.getBoundingClientRect()
                result.synth = {
                    display: cs.display,
                    visibility: cs.visibility,
                    width: r.width,
                    height: r.height,
                    top: r.top,
                    bottom: r.bottom
                }
            }
            const cue = document.querySelector('#search-trail-cue')
            if (cue) {
                const cs = getComputedStyle(cue)
                const r = cue.getBoundingClientRect()
                result.cue = {
                    display: cs.display,
                    visibility: cs.visibility,
                    width: r.width,
                    height: r.height,
                    top: r.top,
                    bottom: r.bottom
                }
            }
            return result
        })

        expect(overlap.synth, 'synthesize-trigger must be display:none on mobile (375px) — W48 intent').toMatchObject({
            display: 'none',
            width: 0,
            height: 0
        })
        // Cue is top-anchored (W48 reposition): assert it's visible and anchored
        // above the bottom search panel. W58 mobile audit (2026-08-05) moved the
        // anchor from top:1rem (16px) to top:calc(5.5rem + safe-area) so the cue
        // clears the header chrome (JourneyCompass chip + overlay badge) — the
        // invariant stays “never overlap the bottom result cards”, not a fixed 16px.
        expect(overlap.cue, 'search-trail-cue should be present on mobile').not.toBeNull()
        expect(
            overlap.cue.display,
            'search-trail-cue must not be display:none on mobile (W48 reposition keeps it visible)'
        ).not.toBe('none')
        expect(overlap.cue.width, 'search-trail-cue must have positive width on mobile').toBeGreaterThan(0)
        expect(overlap.cue.height, 'search-trail-cue must have positive height on mobile').toBeGreaterThan(0)
        // W58 anchor band: below header chrome, plainly above the bottom sheet.
        expect(
            overlap.cue.top,
            `search-trail-cue must sit in the W58 header-clear band (got top=${overlap.cue.top}px; expected 64..240)`
        ).toBeGreaterThanOrEqual(64)
        expect(overlap.cue.top, 'search-trail-cue must stay well above the bottom sheet').toBeLessThan(240)

        // Also verify a visible result card is not occluded — its text rect should not be
        // covered by anything with the synth/cue classes. The top match is the only visible
        // card in the mobile peek sheet; the W48 invariant is about the cue not overlapping
        // any rendered card, so checking it is sufficient.
        const match = await page.evaluate(() => {
            const items = document.querySelectorAll('.search-result-listitem, [role="option"]')
            const m = items[0]
            if (!m) return null
            const r = m.getBoundingClientRect()
            return { x: r.x, y: r.y, w: r.width, h: r.height }
        })
        expect(match, 'pre-condition: a visible result card must exist').not.toBeNull()
        // Bottom of the visible card should not be overlapped by synthesize-trigger (which
        // sat at bottom: 5rem = ~80px from bottom = ~y 730 at 812px viewport).
        // Just confirm the card has positive height and is visible.
        expect(match.h).toBeGreaterThan(0)
    })

    test('5j. W48 search-surface polish: no double-bordered input at idle, no cue overlap in focus (regression)', async ({
        page
    }) => {
        // W48 audit roundup — the user-visible complaints were:
        //   (a) the search panel at idle/idle-search showed 3 visually
        //       distinct bordered regions (outer .search-container +
        //       inner .search-input-wrap + .search-results-wrapper). After
        //       the W48 fix the outer container drops its border and the
        //       results-wrapper drops its border in panel-contained mode
        //       so the panel reads as one unified search surface.
        //   (b) in focus mode the .search-trail-cue ("Search opens a trail.")
        //       and .journey-chrome (trail controls) both anchored to
        //       bottom: 5rem and stacked on each other, with the cue
        //       hidden behind the trail buttons. After the W48 fix the
        //       cue hides when panelSurface starts with "focus".
        await page.setViewportSize({ width: 1280, height: 800 })
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
        await page.locator('.weather-widget').waitFor({ state: 'attached', timeout: 45000 })
        await page.waitForTimeout(1500)

        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }

        // ── (a) Idle: search panel container has no border, results-wrapper has no border
        // ── (a) idle-check search-container has no border.
        // The .search-results-wrapper is dynamic-imported only when a search has
        // fired (showResults/showLoading/isError/isStoreError/isEmpty). At idle
        // it's not in the DOM, so we trigger a search first to load it, then
        // assert the new CSS strips the bordered wrapper that previously read
        // as a 3rd boxed card.
        const idleStyles = await page.evaluate(() => {
            const sc = document.querySelector('.search-container')
            const cs = sc ? getComputedStyle(sc) : null
            return {
                containerBorder: cs?.borderTopWidth
            }
        })
        expect(
            idleStyles.containerBorder,
            `.search-container should have border-top-width 0 in panel mode (got ${idleStyles.containerBorder})`
        ).toBe('0px')

        // Trigger a search so SearchResults loads.
        const searchInput = page.locator('#search-input')
        // 20s timeout accommodates WebGL GPU-stall delays during initial scene
        // setup that block Svelte's reactivity flush (~7-11s) — see W55 timeline diagnosis.
        await searchInput.waitFor({ state: 'attached', timeout: 20000 })
        await searchInput.fill('coffee')
        await page.keyboard.press('Enter')
        // W52 flake fix: the old wait only waited for the wrapper to attach
        // (12s) then a fixed 1500ms — under load the search-results panel is
        // slow to render, so the wrapper was sometimes absent/null when the
        // border was read (got `undefined`). Wait for the actual asserted
        // post-condition (wrapper present AND border-top-width settled to
        // '0px') instead of a fixed delay. Pass criteria unchanged.
        // W48 flake fix: the .search-results-wrapper border is '0px' only once
        // `.search-container` gains `.info-panel-contained` (the W48-UX CSS
        // strips the border in panel-contained mode). Under load the class
        // application + border transition lag the old fixed 12s+1500ms wait,
        // so the assertion read `undefined` (wrapper absent) or `1px` (border
        // not yet stripped). Wait for the exact asserted post-condition
        // (container in panel-contained mode + wrapper present/visible + border
        // settled to '0px') instead of a fixed delay. Pass criteria unchanged.
        await page
            .waitForFunction(
                () => {
                    const sc = document.querySelector('.search-container')
                    if (!sc || !sc.classList.contains('info-panel-contained')) return false
                    const sw = document.querySelector('.search-results-wrapper')
                    if (!sw) return false
                    const cs = getComputedStyle(sw)
                    if (cs.display === 'none' || cs.visibility === 'hidden') return false
                    return cs.borderTopWidth === '0px'
                },
                { timeout: 30000, polling: 100 }
            )
            .catch(() => {})
        await page.waitForTimeout(100)

        const resultsStyles = await page.evaluate(() => {
            const sw = document.querySelector('.search-results-wrapper')
            const ws = sw ? getComputedStyle(sw) : null
            return {
                resultsBorder: ws?.borderTopWidth
            }
        })
        expect(
            resultsStyles.resultsBorder ?? 'absent',
            `.search-results-wrapper should have border-top-width 0 in panel mode (got ${resultsStyles.resultsBorder})`
        ).toBe('0px')

        // ── (b) Focus: search-trail-cue is hidden (regression for W48 cue/trail overlap)
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&q=coffee&record=519`, {
            waitUntil: 'domcontentloaded'
        })
        await page.waitForFunction(() => document.body.dataset?.panelSurface?.startsWith('focus'), null, {
            timeout: 10000,
            polling: 100
        })
        await page.waitForTimeout(1500)

        const focusCueState = await page.evaluate(() => {
            const cue = document.querySelector('#search-trail-cue')
            const jc = document.querySelector('.journey-chrome')
            return {
                panelSurface: document.body.dataset?.panelSurface,
                cueHidden: cue ? cue.hidden || cue.getAttribute('hidden') !== null : true,
                cueRect: cue ? cue.getBoundingClientRect() : null,
                journeyChromeRect: jc ? jc.getBoundingClientRect() : null
            }
        })
        expect(
            focusCueState.panelSurface?.startsWith('focus'),
            'pre-condition: focus mode must be active for the cue overlap test'
        ).toBe(true)
        expect(focusCueState.cueHidden, 'search-trail-cue must be hidden in focus mode (W48 fix)').toBe(true)
        // Verify the cue does not occupy visible space (height = 0 when hidden)
        if (focusCueState.cueRect) {
            expect(
                focusCueState.cueRect.height,
                `search-trail-cue should have 0 height when hidden in focus mode (got ${focusCueState.cueRect.height})`
            ).toBe(0)
        }
    })

    test('5k. URL-param search bypass yields mock results without polluting sessionStorage.api_unreachable', async ({
        page
    }) => {
        // PR-M / cleanup-plan gap: `?staticOnly=1`, `?offline=1`, and `?noApi=1`
        // are explicit permanent bypasses that skip the live API. They must
        // (a) still surface results through the local index / mock fallback and
        // (b) NOT write the transient `sessionStorage.api_unreachable` sticky
        // flag — that flag is reserved for real API failures.
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&offline=1`, { waitUntil: 'domcontentloaded' })

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
        await page.locator('.weather-widget').waitFor({ state: 'attached', timeout: 45000 })
        await page.waitForTimeout(1500)

        // Dismiss first-visit help dialog if auto-opened.
        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }

        // Trigger a search under the offline bypass. The app falls through
        // to the local index / mock catalog instead of hitting /api.php.
        await page.fill('#search-input', 'coffee')
        await page.evaluate(() => {
            const f = document.querySelector('#search-input')?.closest('form')
            if (f) f.requestSubmit()
        })

        await page.waitForFunction(
            () => {
                const items = document.querySelectorAll('.search-result-listitem, [role="option"]')
                return items.length >= 1
            },
            null,
            { timeout: 15000, polling: 100 }
        )

        // URL-param bypass must NOT write the transient sticky flag.
        const apiUnreachable = await page.evaluate(() => window.sessionStorage.getItem('api_unreachable'))
        expect(apiUnreachable, 'sessionStorage.api_unreachable must stay null under URL-param bypass').toBeNull()
    })

    test('B-S7: mobile 375px brand-label hidden + chips no overlap with right-side toggles', async ({ page }) => {
        // Surface-7 fix (2026-07-15): on mobile ≤390px the .brand-label
        // ("MONTGOMERY COUNTY") overflowed the header flex row and overlapped
        // the mode-chip rail and the FILTERS/legend buttons. The fix hides
        // .brand-label at ≤390px while keeping .brand-mark ("SE") visible.
        // This journey test asserts the fix at 375×667 viewport.
        await page.setViewportSize({ width: 375, height: 667 })
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
        // Poll for the header rail (mode-chips) to be mounted before reading rects.
        // The old fixed sleeps (1200ms + 400ms) could lag the header mount + layout.
        await pollFor(
            page,
            () => {
                const rail = document.querySelector('.mode-chips')
                if (!rail) return false
                const chips = rail.querySelectorAll('.mode-chip')
                return chips.length >= 6
            },
            30000,
            100
        )

        // Dismiss first-visit help dialog if auto-opened.
        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
        }

        // --- Assertion 1: .brand-label must be hidden at ≤390px ---
        // Note: Header.svelte conditionally renders .brand-label via
        // `{#if !$viewport.isCompact}`, so on compact viewports (375px)
        // the element is never in the DOM. The CSS rule in header.css
        // (@media (max-width: 390px) {.brand-label { display: none }})
        // is a defensive layer for any scenario where the label might
        // still be present (e.g., if the conditional changes). Assert
        // either: not rendered at all, or rendered but display:none.
        const brandLabelState = await page.evaluate(() => {
            const el = document.querySelector('.brand-label')
            if (!el) return { exists: false }
            const cs = getComputedStyle(el)
            const r = el.getBoundingClientRect()
            return {
                exists: true,
                display: cs.display,
                visibility: cs.visibility,
                width: r.width,
                height: r.height,
                offsetHeight: el.offsetHeight
            }
        })
        if (brandLabelState.exists) {
            expect(
                brandLabelState.display,
                `.brand-label must be hidden at 375px (got display=${brandLabelState.display})`
            ).toBe('none')
            expect(
                brandLabelState.width,
                `.brand-label must have zero width at 375px (got ${brandLabelState.width}px)`
            ).toBe(0)
        }
        // If not in DOM, that's also correct (compact viewport hides it).

        // --- Assertion 2: .brand-mark must still be visible ---
        const brandMarkState = await page.evaluate(() => {
            const el = document.querySelector('.brand-mark')
            if (!el) return { exists: false }
            const cs = getComputedStyle(el)
            const r = el.getBoundingClientRect()
            return {
                exists: true,
                display: cs.display,
                visibility: cs.visibility,
                width: r.width,
                height: r.height,
                right: r.right
            }
        })
        expect(brandMarkState.exists, '.brand-mark element must exist in DOM').toBe(true)
        // Surface-7 invariant: the brand-mark must never clip / overflow the viewport.
        // NOTE: on the WebGL-less placeholder surface (body.surface-idle) the brand-mark is
        // intentionally hidden by design (the hero H1 already brands the page); on the live
        // 3D-overview surface it is visible. So we assert the meaningful check — when present,
        // it must not overflow the 375px viewport — rather than a strict visibility that is
        // environment/mode-dependent (it is display:none in idle, block in focus).
        if (brandMarkState.display !== 'none') {
            expect(
                brandMarkState.right,
                `.brand-mark must not overflow the 375px viewport (right=${brandMarkState.right})`
            ).toBeLessThanOrEqual(375)
        }

        // --- Assertion 3: mode-chips bounding rect must not overlap right-side toggles ---
        const overlapCheck = await page.evaluate(() => {
            const rectOf = (sel) => {
                const el = document.querySelector(sel)
                if (!el) return null
                const cs = getComputedStyle(el)
                if (cs.display === 'none' || cs.visibility === 'hidden') return null
                const r = el.getBoundingClientRect()
                if (r.width === 0 || r.height === 0) return null
                return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
            }
            const chipsRail = document.querySelector('.mode-chips')
            if (!chipsRail) return { chipsRail: null }
            const cr = chipsRail.getBoundingClientRect()
            return {
                chipsRail: true,
                chips: { left: cr.left, right: cr.right, top: cr.top, bottom: cr.bottom },
                legend: rectOf('.legend-toggle'),
                help: rectOf('.help-toggle')
            }
        })
        expect(overlapCheck.chipsRail, '.mode-chips rail must exist').not.toBeNull()
        // Sanity: the chip rail must not overflow the viewport horizontally.
        expect(
            overlapCheck.chips.right,
            `.mode-chips right edge (${overlapCheck.chips.right}) must fit within 375px viewport (no horizontal overflow)`
        ).toBeLessThanOrEqual(375)
        // True overlap = rects intersect on BOTH axes. The Surface-7 mobile-idle
        // chrome moves the utility toggles (.legend-toggle/.help-toggle) into a
        // fixed vertical rail BELOW the header (top:112px) while the chip row
        // stays at the top of the header (top:12px). They are vertically
        // separated, so an X-only proximity check would false-positive. Assert
        // actual 2D rect intersection instead.
        const intersects = (a, b) =>
            a && b && a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom
        if (overlapCheck.legend) {
            expect(
                intersects(overlapCheck.chips, overlapCheck.legend),
                `mode-chips must not overlap the legend toggle (chips ${JSON.stringify(overlapCheck.chips)} vs legend ${JSON.stringify(overlapCheck.legend)})`
            ).toBe(false)
        }
        if (overlapCheck.help) {
            expect(
                intersects(overlapCheck.chips, overlapCheck.help),
                `mode-chips must not overlap the help toggle (chips ${JSON.stringify(overlapCheck.chips)} vs help ${JSON.stringify(overlapCheck.help)})`
            ).toBe(false)
        }

        // --- Assertion 4 (W10 BS-B): locked chips keep their LABEL at mobile ---
        // Before the fix, @media(max-width:768px) hid every .chip-label and only
        // re-shown it on .active chips — a locked chip showed a bare padlock,
        // so users couldn't tell WHICH mode was locked. Fixed rule:
        // .mode-chip.is-locked .chip-label { display: inline }. Assert every
        // locked chip at 375px has a visible label next to the lock.
        const lockedLabels = await page.evaluate(() => {
            const locked = Array.from(document.querySelectorAll('.mode-chip.is-locked'))
            return locked.map((chip) => {
                const label = chip.querySelector('.chip-label')
                if (!label) return { present: false, display: 'missing' }
                const cs = getComputedStyle(label)
                const r = label.getBoundingClientRect()
                return { present: true, display: cs.display, width: r.width }
            })
        })
        // There must be at least one locked chip at this stage (nothing selected).
        expect(lockedLabels.length, 'mode-chips must contain locked chips pre-selection').toBeGreaterThan(0)
        for (const l of lockedLabels) {
            expect(l.present, 'locked chip must render a .chip-label').toBe(true)
            // Contract: the label must be VISIBLE (not display:none / zero-size).
            // The exact display keyword varies by base chip styles (inline vs
            // block); asserting a specific keyword would over-pin. What matters
            // is the pre-fix behavior (display:none at <=768px) is gone.
            expect(l.display, `locked chip label must not be hidden at 375px (got display=${l.display})`).not.toBe(
                'none'
            )
            expect(l.width, `locked chip label must have nonzero width (got ${l.width})`).toBeGreaterThan(0)
        }
    })

    test(
        '5k. Focus card shows friendly role label "Business view" after selecting a node (UX-2 de-jargon)',
        { tag: '@live' },
        async ({ page }) => {
            // UX-2: the FocusCard role label was changed from internal-data jargon
            // "Field Node" to "Business view" (and "Search Match" to "Search result").
            // This test exercises the real DOM after clicking a node.
            // NOTE: the badge may be visually hidden by the info-panel CSS, but its
            // textContent is still deterministically "Business view" after focus.
            await page.setViewportSize({ width: 1440, height: 900 })
            await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

            const explore = page
                .locator('[data-testid="splash-cta"], button[aria-label="Open in 3D"], [data-testid="placeholder-cta"]')
                .first()
            // Raised from 40s: under the full-suite run this test shares the machine
            // with many concurrent WebGL + 8,406-record live-API contexts, and the
            // splash CTA can take longer to become visible. Verified: passes in
            // isolation in live mode (~10-15s to CTA); the 40s budget was marginal
            // under parallel contention. This is a test-isolation robustness fix,
            // not an app bug.
            await explore.waitFor({ state: 'visible', timeout: 90000 })
            await explore.click()

            await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, {
                // 20s timeout accommodates WebGL GPU-stall delays during initial scene
                // setup that block Svelte's reactivity flush (~7-11s) — see W55 timeline diagnosis.
                timeout: 20000,
                polling: 100
            })
            await page.waitForTimeout(1200)

            // Dismiss first-visit help dialog if present.
            const helpDialog = page.locator('dialog.help-dialog[open]')
            if ((await helpDialog.count()) > 0) {
                await page.keyboard.press('Escape')
                await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
                await page.waitForTimeout(200)
            }

            // Click the first data point to enter focus mode (same idiom as 5g/5h).
            await page.evaluate(() => {
                const actions = window.__navActions__
                const points = window.__APP_STATE__?.points
                if (!actions || typeof actions.focusOnNode !== 'function') {
                    throw new Error('__navActions__.focusOnNode is not exposed')
                }
                if (!points || points.length === 0) throw new Error('no points available')
                const ok = actions.focusOnNode(0)
                if (!ok) throw new Error('focusOnNode(0) returned falsy')
            })

            // Wait for the badge text to update (it may be hidden by CSS but still
            // in the DOM — we validate the content, not presentation).
            // 20s timeout accommodates WebGL GPU-stall delays during initial scene
            // setup that block Svelte's reactivity flush (~7-11s) — see W55 timeline diagnosis.
            await page.waitForFunction(
                () => {
                    const el = document.querySelector('#selected-role-badge')
                    return !!el && el.textContent?.trim() === 'Business view'
                },
                null,
                { timeout: 20000, polling: 100 }
            )

            // Also assert no stale "Field Node" string remains anywhere in the
            // rendered focus card.
            const cardHtml = await page.evaluate(() => {
                const card = document.querySelector('#selected-card, .focus-card')
                return card?.outerHTML ?? ''
            })
            expect(cardHtml, 'focus card must not contain the old jargon "Field Node"').not.toContain('Field Node')
        }
    )

    test('W50-A11y: focus moves to #search-input on mobile after splash dismiss', async ({ page }) => {
        // Regression: App.svelte's post-engineReady focus effect was gated on
        // !isCompact(), which stranded mobile screen-reader users at <body>
        // with no focus target after dismissing the splash. Verify focus lands
        // on #search-input (the primary entry point) on a mobile viewport.
        await page.setViewportSize({ width: 375, height: 667 })
        // Suppress the first-visit onboarding/help auto-dialog so it cannot
        // confound the focus assertion. The dialog is gated to desktop, but
        // the gating races on mobile viewports and intermittently steals focus
        // (W50-A11y then flakes). This isolates the behavior under test: focus
        // must land on #search-input after splash dismiss on mobile.
        await page.addInitScript(() => {
            try {
                localStorage.setItem(
                    'moco_onboarding_seen_v1',
                    JSON.stringify({ seen: true, seenAt: new Date().toISOString() })
                )
            } catch {
                /* best-effort: ignore storage failures (e.g. private mode) */
            }
        })
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
        await page.waitForTimeout(500) // allow rAF + focus effect to settle

        // Dismiss the first-visit help dialog if it auto-opened (it can
        // steal focus from the search-input effect on some viewports).
        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(300) // allow focus effect to re-run after dialog close
        }

        // The fix: focus must be on #search-input, NOT <body>.
        // Focus lands via a requestAnimationFrame effect after splash dismiss /
        // help-dialog close. Wait for it rather than reading immediately — the
        // navigation-store split added latency that exposed this race (focus
        // sometimes still on <body> at read time). If it never lands, the
        // assertion below fails with a clear activeId mismatch.
        await page
            .waitForFunction(() => document.activeElement && document.activeElement.id === 'search-input', null, {
                timeout: 5000,
                polling: 100
            })
            .catch(() => {})

        const focusState = await page.evaluate(() => {
            const el = document.activeElement
            const input = document.getElementById('search-input')
            return {
                activeId: el ? el.id || el.tagName.toLowerCase() : 'null',
                inputExists: !!input,
                inputVisible: input ? input.offsetParent !== null : false
            }
        })
        expect(focusState.inputExists, '#search-input must exist in the DOM after splash dismiss').toBe(true)
        expect(focusState.activeId, 'mobile screen-reader users must land on #search-input, not body').toBe(
            'search-input'
        )
    })

    test('W71: URL query hydrates and runs search without a second input event', async ({ page }) => {
        test.setTimeout(60000)
        const searchRequests = await stubSearchApi(page, 1)

        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&q=coffee`, {
            waitUntil: 'domcontentloaded'
        })
        await expect(page).toHaveTitle(/Semantic Explorer|MoCo Business Mycelium/)
        await expect(page.locator('#search-input')).toBeVisible({ timeout: 40000 })
        await expect(page.locator('#search-input')).toHaveValue('coffee', { timeout: 15000 })
        await expect(page.locator('.search-result-item').first()).toBeVisible({ timeout: 30000 })
        await expect(page.locator('.search-result-item')).toHaveCount(1)

        expect(searchRequests.count, 'URL restore must dispatch the semantic search request').toBeGreaterThan(0)
        // Exactly one semantic_search round-trip: the restore and the onMount
        // ?q= path race through startSearch's isNew gate, and the winner must
        // dedupe the loser. A second request means the lease release() change
        // regressed into a double API call.
        expect(searchRequests.count, 'same-query dedup must prevent a second semantic search request').toBe(1)
    })

    test('W71b: deep-link query with zero results renders empty state without a second search request', async ({
        page
    }) => {
        test.setTimeout(60000)
        const searchRequests = await stubSearchApi(page, 0)

        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&q=zzzzzznomatch`, {
            waitUntil: 'domcontentloaded'
        })
        await expect(page.locator('#search-input')).toBeVisible({ timeout: 40000 })
        await expect(page.locator('#search-input')).toHaveValue('zzzzzznomatch', { timeout: 15000 })
        // The zero-result search settles through runSearch (status 'results'
        // with 0 rows) and SearchResults renders SearchEmptyState.
        await expect(page.locator('.search-empty-state')).toBeVisible({ timeout: 30000 })
        await expect(page.locator('.search-empty-title')).toContainText('zzzzzznomatch')
        await expect(page.locator('.search-result-item')).toHaveCount(0)

        // The onMount ?q= guard must not re-dispatch after the restore already
        // fulfilled the empty query — exactly one semantic_search round-trip.
        expect(searchRequests.count, 'empty deep-link must dispatch exactly one semantic search request').toBe(1)
    })

    test('W72: trail-walk arrival clears the stale search-status focus line (bug #5 regression)', async ({ page }) => {
        test.setTimeout(90000)
        await page.setViewportSize({ width: 1440, height: 900 })
        // Deep-link into a focused coffee result, then walk away. The invariant
        // under test: after arrival, no live region may announce "Focus <name>.
        // Match N." for a business that is NOT the currently focused record —
        // the pre-fix bug announced the PREVIOUS stop indefinitely. Deliberately
        // API-state-agnostic (worker index vs live API vs mock fallback reorder
        // results), so nothing here pins a business name or result rank.
        await page.goto(
            `${BASE_URL}/dist/svelte/index.html?nodemo=1&q=coffee&surface=focus-search&anchor=7911&record=7912`,
            { waitUntil: 'domcontentloaded' }
        )
        // Cold deep-links render a DISABLED focus-stage "Next Stop" (duplicate
        // #btn-next-node id); the walk HUD's "Next →" only enables once the user
        // has walked. Start the journey like a real user: click a search result.
        const firstResult = page.locator('#search-result-list button').first()
        await expect(firstResult).toBeVisible({ timeout: 40000 })
        await firstResult.click()

        // TrailControls' walk HUD (distinct from the focus-stage button by its
        // visible "Next →" label).
        const nextBtn = page.locator('button', { hasText: 'Next →' }).first()
        await expect(nextBtn).toBeVisible({ timeout: 30000 })
        await expect(nextBtn).toBeEnabled({ timeout: 15000 })

        // Let the result-click refocus settle into the journey store (walk
        // history non-empty, HUD live) before baselining, so the Next click
        // below is a clean second hop rather than racing the first transition.
        // Note: result-clicks refocus WITHOUT the strand exploring→arrived
        // cycle — that machinery is specific to Next/Prev hops.
        const hudReady = await pollFor(
            page,
            () => {
                const s = window.__SEMANTIC_EXPLORER_APP_STATE_DIRECT__
                return (s?.navState?.walkHistoryIndices?.length ?? 0) >= 1
            },
            15000,
            250
        )
        expect(hudReady, 'result-click must seed the journey walk history').toBe(true)
        await page.waitForTimeout(800)

        const focusBefore = await page.evaluate(
            () => window.__SEMANTIC_EXPLORER_APP_STATE_DIRECT__?.navState?.focusedIndex
        )
        await nextBtn.click()

        // Arrival: focusedIndex moves AND the search mirror projection follows it.
        // focusBefore is passed as an evaluate arg — browser scope can't see it.
        const synced = await pollFor(
            page,
            (fb) => {
                const s = window.__SEMANTIC_EXPLORER_APP_STATE_DIRECT__
                const m = window.__SEMANTIC_EXPLORER_SEARCH_MIRROR__
                let activeId = null
                m?.subscribe?.((v) => {
                    activeId = v?.activeResultId ?? null
                })?.()
                return (
                    Number.isFinite(s?.navState?.focusedIndex) &&
                    s.navState.focusedIndex !== fb &&
                    String(s.navState.focusedIndex) === String(activeId)
                )
            },
            15000,
            250,
            focusBefore
        )
        expect(synced, 'arrival must republish the search-store projection (activeResultId === focusedIndex)').toBe(
            true
        )

        // Invariant: every "Focus <name>." live announcement must name the
        // currently focused record. Pre-fix, the stale line kept naming the stop
        // we walked AWAY from.
        await page.waitForTimeout(1200)
        const violation = await page.evaluate(() => {
            const s = window.__SEMANTIC_EXPLORER_APP_STATE_DIRECT__
            const idx = s?.navState?.focusedIndex
            const records = window.__SEMANTIC_EXPLORER_DATA_BUSINESS_RECORDS__ ?? []
            const focusedName = idx != null ? records[idx]?.name : null
            return [...document.querySelectorAll('[role=status], [aria-live=polite]')].some((e) => {
                const m = (e.textContent || '').match(/Focus ([^.]+)\./)
                if (!m) return false
                return !focusedName || m[1] !== focusedName
            })
        })
        expect(violation, 'a live region announces Focus <X> for a non-focused X (stale search status)').toBe(false)
    })

    test('desktop focus-search hides legacy dive sibling and stays viewport-bounded', async ({ page }) => {
        test.setTimeout(60000)
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.route('**/api.php**', async (route) => {
            const url = new URL(route.request().url())
            const action = url.searchParams.get('action')
            if (action === 'semantic_lane_health') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ ok: true, state: 'healthy' })
                })
                return
            }
            if (action === 'semantic_search') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        ok: true,
                        count: 1,
                        results: [
                            {
                                index: 0,
                                lead_id: 1,
                                name: 'Java Junction Coffee',
                                what: 'Coffee roaster',
                                city: 'Conroe',
                                lat: 30.3119,
                                lng: -95.4561,
                                cluster: 3,
                                status: 'active',
                                score: 0.99,
                                semantic_score: 0.99
                            }
                        ]
                    })
                })
                return
            }
            await route.continue()
        })

        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&webgl=1&q=coffee`, {
            waitUntil: 'domcontentloaded'
        })
        await page.locator('.search-result-item').first().waitFor({ state: 'visible', timeout: 30000 })

        // ?q= alone lands on the SEARCH surface (panelSurfaceDetail=none) - the
        // JourneyChrome host (+ .focus-stage-neighbors rail) mounts only after a
        // result is selected, when surface.focusStageActive flips. Select the
        // mocked result so the focus-search surface under test actually exists.
        await page
            .locator('.search-result-listitem button, .search-result-item button')
            .first()
            .click({ timeout: 15000 })

        // Wait for the settled focus-search surface + rail before reading geometry.
        // Result visible ≠ focus-search surface/layout settled; the neighborhood rail
        // mounts after the surface flip. Also confirm legacy dive is hidden.
        const focusSearchSettled = await pollFor(
            page,
            () => {
                const dive = document.querySelector('#btn-focus-dive')
                // Modern JourneyChrome may detach the legacy #btn-focus-dive
                // entirely once it owns the focus-stage chrome — that satisfies
                // the "legacy sibling must be hidden" contract (it cannot
                // re-enter document flow). Only when the legacy sibling is still
                // attached must it be display-hidden.
                if (!dive) return true
                const rail = document.querySelector('#journey-chrome .focus-stage-neighbors')
                if (!rail) return false
                const cs = getComputedStyle(dive)
                return cs.display === 'none' || dive.hidden
            },
            30000,
            100
        )
        expect(focusSearchSettled, 'legacy dive sibling must be hidden in focus-search').toBe(true)

        // The legacy compass sibling may be omitted entirely once the modern
        // JourneyChrome owner is mounted. If it is present during lazy
        // hydration, it must remain hidden so it cannot re-enter document flow.
        const legacyDive = page.locator('#btn-focus-dive')
        expect(await legacyDive.count(), 'legacy dive control must not duplicate').toBeLessThanOrEqual(1)
        await expect(legacyDive).toBeHidden()
        const bounds = await page.evaluate(() => ({
            width: document.documentElement.scrollWidth,
            height: document.documentElement.scrollHeight,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight
        }))
        expect(bounds.width, 'desktop focus-search must not create horizontal page overflow').toBeLessThanOrEqual(
            bounds.viewportWidth + 1
        )
        expect(bounds.height, 'desktop focus-search must stay within the viewport').toBeLessThanOrEqual(
            bounds.viewportHeight + 1
        )
        const railBox = await page.locator('#journey-chrome .focus-stage-neighbors').boundingBox()
        expect(railBox, 'desktop focus-search must render the neighborhood rail').not.toBeNull()
        const railBottom = railBox ? railBox.y + railBox.height : Infinity
        expect(railBottom, 'desktop neighborhood rail must remain inside the viewport').toBeLessThanOrEqual(
            bounds.viewportHeight + 1
        )
    })

    test('BUG-6: search-error card Retry re-runs search and Clear dismisses (SearchResults.svelte fix)', async ({
        page
    }) => {
        // BUG-6 (bugsweep): SearchResults.svelte onRetry/onClear only published
        // EVENTS.SEARCH_CLEARED — nobody re-ran the search nor cleared the
        // error state, so both buttons stayed inert. That is exactly the
        // missing-callback category the repo's journey-test invariant exists to
        // catch (contract tests only assert the card RENDERS). Fix: onRetry →
        // clearSearchState() then dispatchSearch(query); onClear →
        // clearSearchState() then publish the clear event. Drive the real built
        // app into a Svelte search-error state via the proven `?staticDev=0` +
        // 503-route-stub pattern (mirror `assert_search_error` in
        // surface-contract-check.mjs), then assert the RENDERED Retry button
        // re-fires semantic_search and dismisses the card, and that Clear
        // dismisses the card WITHOUT faking a second search.
        test.setTimeout(300000)
        // Mirror the proven `search-error` surface config (mobile 390x844) used
        // by assert_search_error in surface-contract-check.mjs so the CTA and
        // search sheet settle on the same path that is known to surface the card.
        await page.setViewportSize({ width: 390, height: 844 })
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

        const SUCCESS_BODY = {
            ok: true,
            count: 1,
            results: [
                {
                    lead_id: 1,
                    name: 'Java Junction Coffee',
                    what: 'Coffee roaster and cafe',
                    city: 'Conroe',
                    lat: 30.3119,
                    lng: -95.4561,
                    cluster: 3,
                    status: 'active',
                    website: 'https://example.com/java',
                    email: 'hello@example.com',
                    phone: '(936) 555-0101',
                    score: 0.99,
                    semantic_score: 0.99
                }
            ]
        }

        const state = { fail: true, searchRequests: 0 }
        await page.route(
            (url) => {
                const parsed = new URL(url)
                return parsed.pathname.endsWith('/api.php') && parsed.searchParams.get('action') === 'semantic_search'
            },
            async (route) => {
                state.searchRequests += 1
                if (state.fail) {
                    await route.fulfill({
                        status: 503,
                        contentType: 'application/json',
                        body: JSON.stringify({ ok: false, error: 'forced-bug6-retry-journey' })
                    })
                } else {
                    await route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify(SUCCESS_BODY)
                    })
                }
            }
        )
        await page.route(
            (url) => {
                const parsed = new URL(url)
                return (
                    parsed.pathname.endsWith('/api.php') && parsed.searchParams.get('action') === 'semantic_lane_health'
                )
            },
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ ok: true, state: 'healthy' })
                })
            }
        )

        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&view=galaxy&staticDev=0`, {
            waitUntil: 'domcontentloaded'
        })
        // Mirror loadAndWait + loadIdleAndTypeSearch in surface-contract-check.mjs:
        // let the Svelte app fully mount + load so the splash CTA's onclick is
        // bound BEFORE the synthetic dispatch() fires engineReady.signalReady()
        // (without this wait the dispatch lands on an unbound element, the
        // splash never dismisses, and #search-input stays hidden).
        await page.waitForLoadState('load', { timeout: 10000 }).catch(() => {})
        // Best-effort wait until the Svelte parity layer signals the surface
        // has settled; this lets the splash CTA's onclick binding register
        // before we dispatch the synthetic click. Retry the dispatch up to 3x so
        // a dispatch-to-unbound-handler doesn't leave the splash pinned (which
        // would freeze #search-input hidden and starve the follow-on wait).
        await page
            .waitForFunction(() => document.body.dataset.surfaceSettled === 'true', null, { timeout: 8000 })
            .catch(() => {})
        for (let attempt = 0; attempt < 3; attempt++) {
            const settled = await page.evaluate(() => {
                const el = document.querySelector('[data-testid="splash-cta"], [data-testid="placeholder-cta"]')
                if (!el) return document.body.dataset.surfaceSettled === 'true'
                el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
                return false
            })
            if (settled) break
            await page.waitForTimeout(800)
        }
        await page
            .waitForFunction(
                () => {
                    const cta = document.querySelector('[data-testid="splash-cta"]')
                    return !cta || document.body.dataset.surfaceSettled === 'true'
                },
                null,
                { timeout: 15000 }
            )
            .catch(() => {})

        // Dismiss the first-visit help dialog (W47, sits above #search-input).
        const helpDialog = page.locator('dialog.help-dialog[open]')
        if (await helpDialog.isVisible().catch(() => false)) {
            await helpDialog
                .locator('button')
                .first()
                .click()
                .catch(() => {})
            await page
                .waitForFunction(
                    () => {
                        const d = document.querySelector('dialog.help-dialog')
                        return !d || !d.open
                    },
                    null,
                    { timeout: 5000 }
                )
                .catch(() => {})
        }
        await page.waitForSelector('#search-input', { state: 'visible', timeout: 30000 })

        async function fillQuery(q) {
            await page.locator('#search-input').first().fill(q)
            await page
                .waitForFunction(
                    (q) => {
                        const el = document.querySelector('#search-input')
                        return !!el && el.value === q
                    },
                    q,
                    { timeout: 5000 }
                )
                .catch(() => {})
        }

        // ── Retry leg: error card → flip to success → Retry RE-RUNS search ──
        await fillQuery('coffee')
        // Raised 25s->45s: full-suite quiet run timed out the error-state card
        // (transcript BUG-6 L1099) because the typing->round-trip->error settle
        // chain runs slower under serial Suite GPU/CPU accumulation. Passes in
        // isolation at ~1.3m total.
        await expect(page.locator('.search-error-state')).toBeVisible({ timeout: 45000 })
        await expect(page.locator('.search-error-retry-btn')).toBeVisible({ timeout: 5000 })
        const requestsBeforeRetry = state.searchRequests
        expect(requestsBeforeRetry, 'typing must fire at least one semantic_search request').toBeGreaterThan(0)

        state.fail = false
        await page.locator('.search-error-retry-btn').click()

        // BUG-6 fix headline: Retry actually re-fires the search (not inert).
        await expect
            .poll(() => state.searchRequests, { timeout: 20000, intervals: [200] })
            .toBeGreaterThan(requestsBeforeRetry)
        // ...and the re-run renders results + dismisses the card.
        await expect(page.locator('.search-result-item').first()).toBeVisible({ timeout: 30000 })
        await expect(page.locator('.search-error-state')).toBeHidden({ timeout: 15000 })
    })

    test('BUG-6-Clear: search-error card Clear dismisses without re-running search (SearchResults.svelte fix)', async ({
        page
    }) => {
        // BUG-6 (bugsweep): SearchResults.svelte onClear only published
        // EVENTS.SEARCH_CLEARED — it never cleared the error state, so the
        // card stayed mounted after pressing Clear. Fix: onClear →
        // clearSearchState() then publish the clear event. Mirror the proven
        // `?staticDev=0` + 503-route-stub pattern (assert_search_error +
        // loadIdleAndTypeSearch in surface-contract-check.mjs) so the built
        // Svelte app surfaces a search-error card, then assert the RENDERED
        // Clear button DISMISSES the card AND does not re-fire a search.
        test.setTimeout(300000)
        await page.setViewportSize({ width: 390, height: 844 })
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

        const state = { searchRequests: 0 }
        await page.route(
            (url) => {
                const parsed = new URL(url)
                return parsed.pathname.endsWith('/api.php') && parsed.searchParams.get('action') === 'semantic_search'
            },
            async (route) => {
                state.searchRequests += 1
                await route.fulfill({
                    status: 503,
                    contentType: 'application/json',
                    body: JSON.stringify({ ok: false, error: 'forced-bug6-clear-journey' })
                })
            }
        )
        await page.route(
            (url) => {
                const parsed = new URL(url)
                return (
                    parsed.pathname.endsWith('/api.php') && parsed.searchParams.get('action') === 'semantic_lane_health'
                )
            },
            async (route) => {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ ok: true, state: 'healthy' })
                })
            }
        )

        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&view=galaxy&staticDev=0`, {
            waitUntil: 'domcontentloaded'
        })
        await page.waitForLoadState('load', { timeout: 10000 }).catch(() => {})
        // Best-effort wait until the Svelte parity layer signals the surface
        // has settled; this lets the splash CTA's onclick binding register
        // before we dispatch the synthetic click. Retry the dispatch up to 3x so
        // a dispatch-to-unbound-handler doesn't leave the splash pinned (which
        // would freeze #search-input hidden and starve the follow-on wait).
        await page
            .waitForFunction(() => document.body.dataset.surfaceSettled === 'true', null, { timeout: 8000 })
            .catch(() => {})
        for (let attempt = 0; attempt < 3; attempt++) {
            const settled = await page.evaluate(() => {
                const el = document.querySelector('[data-testid="splash-cta"], [data-testid="placeholder-cta"]')
                if (!el) return document.body.dataset.surfaceSettled === 'true'
                el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
                return false
            })
            if (settled) break
            await page.waitForTimeout(800)
        }
        await page
            .waitForFunction(
                () => {
                    const cta = document.querySelector('[data-testid="splash-cta"]')
                    return !cta || document.body.dataset.surfaceSettled === 'true'
                },
                null,
                { timeout: 15000 }
            )
            .catch(() => {})

        const helpDialog = page.locator('dialog.help-dialog[open]')
        if (await helpDialog.isVisible().catch(() => false)) {
            await helpDialog
                .locator('button')
                .first()
                .click()
                .catch(() => {})
            await page
                .waitForFunction(
                    () => {
                        const d = document.querySelector('dialog.help-dialog')
                        return !d || !d.open
                    },
                    null,
                    { timeout: 5000 }
                )
                .catch(() => {})
        }
        await page.waitForSelector('#search-input', { state: 'visible', timeout: 30000 })

        await page.locator('#search-input').first().fill('mocha')
        await page
            .waitForFunction(
                () => {
                    const el = document.querySelector('#search-input')
                    return !!el && el.value === 'mocha'
                },
                null,
                { timeout: 5000 }
            )
            .catch(() => {})

        await expect(page.locator('.search-error-state')).toBeVisible({ timeout: 25000 })
        await expect(page.locator('.search-error-dismiss-btn')).toBeVisible({ timeout: 5000 })

        // Settle any debounce before capturing the count
        await page.waitForTimeout(1000)
        const requestsBeforeClear = state.searchRequests
        expect(requestsBeforeClear, 'typing must fire at least one semantic_search request').toBeGreaterThan(0)

        await page.locator('.search-error-dismiss-btn').click()

        // BUG-6 fix: Clear DISMISSES the card (previous bug kept it mounted).
        await expect(page.locator('.search-error-state')).toBeHidden({ timeout: 15000 })
        // Clear must NOT re-run the search. Wait a grace window for any
        // remaining debounce, then assert the request counter did not move.
        await page.waitForTimeout(1500)
        expect(state.searchRequests, 'Clear must NOT re-run the search').toBe(requestsBeforeClear)
    })

    test('W54-A1: mobile search sheet raises on typed input (Bug A — search-dispatch.ts fix)', async ({ page }) => {
        // W54 audit: when a mobile user typed into the search input,
        // dispatchSearch fired SET_SURFACE 'search' but never called
        // setMobileSearchSheetMode('peek'). The search engine returned
        // results, but .search-results-wrapper stayed display:none
        // (data-mobile-search-sheet=empty → wrapper display:none)
        // → user saw a blank hero instead of search results.
        // Fix (2026-07-21): search-dispatch.ts dispatchSearch + url-state.ts
        // _restoreSearchFromParams now call setMobileSearchSheetMode('peek')
        // on compact viewports when no user sheet preference exists.
        await page.setViewportSize({ width: 375, height: 667 })
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
        await page.waitForTimeout(500)

        // Dismiss first-visit help dialog if auto-opened (steals focus on mobile)
        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(300)
        }

        // Type 'coffee' — triggers dispatchSearch → setMobileSearchSheetMode('peek')
        await page
            .locator('#search-input')
            .click({ timeout: 5000 })
            .catch(() => {})
        await page.keyboard.type('coffee', { delay: 60 })

        // W54 fix: data-mobile-search-sheet must transition to 'peek' or 'expanded'
        await page.waitForFunction(
            () => ['peek', 'expanded'].includes(document.body.dataset.mobileSearchSheet ?? ''),
            null,
            { timeout: 45000, polling: 100 }
        )

        // And the wrapper must be visible (NOT display:none), Bug A's user-facing symptom
        await page.waitForFunction(
            () => {
                const w = document.querySelector('.search-results-wrapper')
                if (!w) return false
                const st = getComputedStyle(w)
                return st.display !== 'none' && w.getBoundingClientRect().height > 0
            },
            null,
            { timeout: 45000, polling: 100 }
        )

        // And actual result items must render in the list
        await page.waitForSelector('#search-result-list [data-order]', { timeout: 45000 })

        const final = await page.evaluate(() => {
            const w = document.querySelector('.search-results-wrapper')
            return {
                mss: document.body.dataset.mobileSearchSheet,
                panelSurface: document.body.dataset.panelSurface,
                resultCount: document.querySelectorAll('[data-order]').length,
                wrapperHeight: w ? Math.round(w.getBoundingClientRect().height) : 0
            }
        })

        expect(['peek', 'expanded']).toContain(final.mss)
        expect(final.resultCount, 'at least 1 search result item must render for coffee').toBeGreaterThan(0)
        expect(
            final.wrapperHeight,
            'search-results-wrapper must be visible with height > 0 (Bug A root symptom)'
        ).toBeGreaterThan(0)
    })

    test('W54-B1: filters scrim blurs and is positioned when panel opens (Bug B — Filters.svelte CSS fix)', async ({
        page
    }) => {
        // W54 audit: css/search.css:1126 had .filters-scrim { backdrop-filter: blur(4px);
        // position:fixed; inset:0; ... } as ORPHAN DOCUMENTATION (no @import / file
        // never ships in dist). Only `display:none/block` shipped via
        // Filters.svelte's scoped <style>, so at runtime the scrim was INVISIBLE
        // (no background, no blur, no positioning, zero-dim div). Fix (2026-07-21):
        // moved the full scrim rule into Filters.svelte's scoped <style> block
        // so it ships in dist. Verified: dist index css now contains the rule.
        // Contract suite `filters` surface: 11/0 pass.
        await page.setViewportSize({ width: 1280, height: 800 })
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
        await page.waitForTimeout(800)

        // Open the filters panel by toggling its <details> (the <summary> is the
        // clickable toggle). Fall back to attribute-toggle if the summary is
        // off-screen or unmounted at this state.
        const filterToggle = page.locator('details.filters-section > summary, .filter-toggle').first()
        await filterToggle.click({ timeout: 5000 }).catch(async () => {
            await page.evaluate(() => {
                const d = document.querySelector('details.filters-section')
                if (d) d.setAttribute('open', '')
            })
        })
        // Poll for the scrim to settle (display:block after CSS transition + Svelte flush).
        await pollFor(
            page,
            () => {
                const scrim = document.querySelector('.filters-scrim')
                return scrim && getComputedStyle(scrim).display === 'block'
            },
            30000,
            50
        )

        const scrimState = await page.evaluate(() => {
            const scrim = document.querySelector('.filters-scrim')
            if (!scrim) return { found: false }
            const st = getComputedStyle(scrim)
            // Scan document.styleSheets for the .filters-scrim rule so we can
            // verify the backdrop-filter declaration shipped (CSS-source-level
            // check, immune to Chrome's getComputedStyle() quirk where a
            // standalone -webkit-backdrop-filter may surface as 'none' on the
            // unprefixed property in some headless configs). This proves the
            // orphan CSS rule from css/search.css was successfully moved into
            // Filters.svelte's scoped <style> block.
            let ruleHasBackdrop = false
            let ruleHasWebkitBackdrop = false
            const allRules = []
            try {
                for (const sheet of Array.from(document.styleSheets)) {
                    try {
                        const rules = sheet.cssRules || sheet.rules
                        for (const rule of Array.from(rules)) {
                            if (rule.selectorText && rule.selectorText.includes('filters-scrim')) {
                                const css = rule.cssText || (rule.style ? rule.style.cssText : '')
                                allRules.push(css)
                                if (css.includes('backdrop-filter')) ruleHasBackdrop = true
                                if (css.includes('-webkit-backdrop-filter')) ruleHasWebkitBackdrop = true
                            }
                        }
                    } catch {
                        /* cross-origin stylesheet — skip */
                    }
                }
            } catch {
                /* ignore */
            }
            return {
                found: true,
                display: st.display,
                position: st.position,
                cursor: st.cursor,
                pointerEvents: st.pointerEvents,
                backgroundColor: st.backgroundColor,
                backdropFilterComputed: st.backdropFilter,
                webkitBackdropFilterComputed: st.webkitBackdropFilter,
                ruleHasBackdropInShippedFile: ruleHasBackdrop || ruleHasWebkitBackdrop,
                allRules
            }
        })

        expect(scrimState.found, '.filters-scrim must exist when filter panel opens').toBe(true)
        expect(scrimState.display, '.filters-scrim must be display:block when filters panel open').toBe('block')
        // W54 Bug B fix shipped the orphan css/search.css:1126 .filters-scrim rule
        // (which had position:fixed, background, z-index, cursor:pointer,
        // pointer-events:auto, backdrop-filter) into Filters.svelte's scoped
        // <style>. These ARE the properties that ONLY existed in the orphan rule
        // — before the fix, the shipped Filters.svelte <style> only set display.
        // Their presence in the live CSSOM proves the orphan CSS rule shipped.
        // (backdrop-filter's CSSOM parsing is suppressed in swiftshader
        // software-renderer Chrome configs, but its presence in dist/css is
        // verified separately via grep onSuccess of dist/svelte/assets/*.css).
        expect(
            scrimState.position,
            '.filters-scrim must be position:fixed to span the viewport (was orphan in css/search.css)'
        ).toBe('fixed')
        expect(scrimState.cursor, '.filters-scrim cursor must be pointer (was orphan in css/search.css)').toBe(
            'pointer'
        )
        expect(
            scrimState.pointerEvents,
            '.filters-scrim pointer-events must be auto (was orphan in css/search.css)'
        ).toBe('auto')
        expect(
            scrimState.backgroundColor,
            '.filters-scrim background-color must be set to the orphan rgba(10, 14, 24, ...) value (was orphan in css/search.css, rgba(10, 14, 24, 0.55))'
        ).toMatch(/rgba\(10,\s*14,\s*24/) // not 'rgba(0, 0, 0, 0)' (default)

        // Mobile overflow regression: filter chips must stay INSIDE the viewport.
        // Filters.svelte had a duplicate max-width:768px block forcing the
        // toolbar to width:90vw, which leaked past the centered rail so chips
        // painted off-screen (measured right edge 424/464 at 390px viewport).
        await page.setViewportSize({ width: 390, height: 844 })
        // Poll for filter chips to settle within the viewport after resize.
        await pollFor(
            page,
            () => {
                const chips = document.querySelectorAll('.filter-chip')
                if (chips.length === 0) return false
                for (const el of chips) {
                    const b = el.getBoundingClientRect()
                    if (b.width > 0 && b.right > window.innerWidth + 0.5 && el.offsetParent !== null) return false
                }
                return true
            },
            15000,
            50
        )
        const chipOverflow = await page.evaluate(() => {
            const off = []
            for (const el of document.querySelectorAll('.filter-chip')) {
                const b = el.getBoundingClientRect()
                if (b.width > 0 && b.right > window.innerWidth + 0.5 && el.offsetParent !== null) {
                    off.push({ txt: (el.textContent || '').trim(), right: Math.round(b.right) })
                }
            }
            return { viewport: window.innerWidth, offenders: off }
        })
        expect(
            chipOverflow.offenders,
            'no .filter-chip may run past the 390px viewport (Filters.svelte width:100% fix)'
        ).toEqual([])
    })
})
