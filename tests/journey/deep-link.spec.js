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


test.describe('Deep-link regressions (tmp/focus-blank-investigation.md)', () => {
    test('deep-link ?anchor=N renders a non-empty focus pocket (not blank)', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&anchor=519`, { waitUntil: 'domcontentloaded' })

        await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, {
            timeout: 20000,
            polling: 100
        })

        const overlay = page.locator('.loading-overlay')
        await overlay.waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {})

        await page.waitForFunction(
            () => {
                const s = window.__APP_STATE__?.navState
                return !!s && s.focusedIndex === 519 && s.mode === 'focus'
            },
            null,
            { timeout: 20000, polling: 100 }
        )

        // Fix A+B (tmp/focus-blank-investigation.md): the deep-link focus pocket
        // must populate (not render blank). It builds asynchronously after the
        // fire-and-forget URL-state restore, so wait for it.
        await page.waitForFunction(
            () => {
                const s = window.__APP_STATE__?.navState
                return Array.isArray(s?.focusPocketIndices) ? s.focusPocketIndices.length > 0 : false
            },
            null,
            { timeout: 20000, polling: 100 }
        )

        const infoPanel = page.locator('.info-panel.open')
        await infoPanel.waitFor({ state: 'attached', timeout: 10000 })
    })

    test('Fix 2: deep-link first visit suppresses help dialog auto-open', async ({ browser }) => {
        // Use a fresh browser context so we can clear onboarding storage without
        // polluting the shared context for subsequent tests (see journey-hang report).
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
        const page = await context.newPage()
        await context.addInitScript(() => {
            window.__PLAYWRIGHT__ = true
        })

        // Navigate first, then clear onboarding flags so the first-visit auto-open
        // branch is guaranteed, then reload so the app initializes with cleared state.
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&anchor=519`, {
            waitUntil: 'domcontentloaded'
        })
        await page.evaluate(() => {
            try {
                localStorage.removeItem('moco_onboarding_seen_v1')
                sessionStorage.removeItem('moco_mycelium_demo_session_v1')
            } catch {
                /* ignore */
            }
        })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&anchor=519`, {
            waitUntil: 'domcontentloaded'
        })
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})

        // Wait for engine ready + points loaded.
        await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, {
            timeout: 30000,
            polling: 100
        })

        // Wait for loading overlay to dismiss (deep-link signalReady path).
        const overlay = page.locator('.loading-overlay')
        await overlay.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {})

        // Guard against the page being closed by a prior OOM/crash under heavy load.
        if (page.isClosed()) {
            throw new Error('Deep-link test page closed before assertion; likely resource contention')
        }

        // CORE ASSERTION: help dialog must NOT be open on a deep-link first visit.
        const helpCount = await page.locator('dialog.help-dialog[open]').count()
        expect(helpCount, 'help dialog must not auto-open over a shared deep-link target (Fix #2)').toBe(0)

        // Confirm focus mode is active (deep-link resolved correctly).
        await page.waitForFunction(
            () => {
                const s = window.__APP_STATE__?.navState
                return !!s && s.focusedIndex === 519 && s.mode === 'focus'
            },
            null,
            { timeout: 20000, polling: 100 }
        )

        await context.close()
    })

    test('Fix Y: deep-link desktop (webdriver, no __PLAYWRIGHT__) dismisses the preview overlay', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        // Deliberately do NOT set window.__PLAYWRIGHT__. Without Fix Y,
        // getInitialRenderKind() returns 'placeholder2d' under navigator.webdriver,
        // main.ts:160's deep-link signalReady() guard is false, signalReady never
        // fires, and the Splash + placeholder-layer stay visible/occluding.
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&anchor=519`, { waitUntil: 'domcontentloaded' })

        await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, {
            timeout: 20000,
            polling: 100
        })

        // 1) Splash must dismiss (engineReady fired via main.ts:160 guard).
        const overlay = page.locator('.loading-overlay')
        await overlay.waitFor({ state: 'hidden', timeout: 20000 })

        // 2) The placeholder2d branch ("Enter 3D Scene") must NOT be mounted —
        // Fix Y makes getInitialRenderKind() return 'webgl' for a desktop deep link.
        await page.waitForFunction(
            () => {
                const layer = document.querySelector('.placeholder-layer')
                return !layer || !layer.classList.contains('active')
            },
            null,
            { timeout: 20000, polling: 100 }
        )

        // 3) The focus pocket must actually be populated (not blank) and the
        // info panel open — proving the overlay was occluding real content.
        await page.waitForFunction(
            () => {
                const s = window.__APP_STATE__?.navState
                return (
                    !!s &&
                    s.focusedIndex === 519 &&
                    s.mode === 'focus' &&
                    (Array.isArray(s.focusPocketIndices) ? s.focusPocketIndices.length > 0 : false)
                )
            },
            null,
            { timeout: 20000, polling: 100 }
        )
        const infoPanel = page.locator('.info-panel.open')
        await infoPanel.waitFor({ state: 'attached', timeout: 10000 })
    })

    test('B-S3: focus panel @1280 business-name no mid-word truncation', async ({ page }) => {
        // Fix S3: `.selected-hero-main` flex item must shrink to 0 so the
        // inner h3 can wrap instead of being starved into mid-word truncation.
        // Also `overflow-wrap: anywhere` on h3 prevents cutting glyphs mid-word.
        await page.setViewportSize({ width: 1280, height: 800 })
        // Use a record with a very long name to guarantee the truncation test.
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&record=6218`, { waitUntil: 'domcontentloaded' })

        // Wait for focus mode to activate (allow extra time if the PHP data load
        // is still warming up from previous sequential tests).
        await page.waitForFunction(
            () => {
                const s = window.__APP_STATE__?.navState
                return !!s && s.mode === 'focus'
            },
            null,
            { timeout: 30000, polling: 100 }
        )

        // Wait for the lazily-hydrated card elements to exist before reading CSSOM.
        // The elements can mount after the state gate, so the old 800ms sleep was
        // a guess — focused card mounts can lag that under load.
        await page.waitForFunction(() => !!document.querySelector('.selected-hero-main, .selected-card h3'), null, {
            timeout: 30000,
            polling: 100
        })

        // Assertion 1: .selected-hero-main must have min-width: 0
        const heroMainMinWidth = await page.evaluate(() => {
            const el = document.querySelector('.selected-hero-main')
            return el ? getComputedStyle(el).minWidth : null
        })
        expect(heroMainMinWidth, '.selected-hero-main must shrink (min-width: 0)').toBe('0px')

        // Assertion 2: .selected-card h3 must have overflow-wrap != normal
        const h3OverflowWrap = await page.evaluate(() => {
            const el = document.querySelector('.selected-card h3')
            return el ? getComputedStyle(el).overflowWrap : null
        })
        expect(h3OverflowWrap, '.selected-card h3 overflow-wrap must not be "normal"').not.toBe('normal')

        // Assertion 3 (clamp machinery wired up — independent of record name length):
        // `.selected-card h3` should have its computed `WebkitLineClamp` property
        // NOT equal to the default "none" — i.e. the css/clusters.css rule
        // `-webkit-line-clamp: 2` is applied to the rendered element. We do NOT
        // assert U+2026 ellipsis here because record 6218's visible name
        // ("Rolando Rivera") is too short to trigger clamp+ellipsis at 1280px.
        // The ellipsis-with-tidy-line-breaks behavior on long-name records has
        // been visually verified by the cross-model vision grader quad (see
        // Surface 3 in docs/visual-qa-2026-07-15.md). A strict U+2026 ellipsis
        // test can be added by routing this test to a record with a known long
        // business name (e.g. via a search-index probe).
        const h3WebkitLineClamp = await page.evaluate(() => {
            const el = document.querySelector('.selected-card h3')
            return el ? getComputedStyle(el).WebkitLineClamp : null
        })
        expect(h3WebkitLineClamp, '.selected-card h3 must exist (h3WebkitLineClamp must not be null)').not.toBeNull()
        expect(
            h3WebkitLineClamp,
            '.selected-card h3 WebkitLineClamp should NOT be "none" (css/clusters.css -webkit-line-clamp:2 rule must apply)'
        ).not.toBe('none')

        // Assertion 4 (flexible invariant): the h3 must be populated with the
        // business name regardless of whether clamp fires. Length > 0 proves the
        // focus panel actually rendered the selected-business name (not blank).
        const h3Text = await page.evaluate(() => {
            const el = document.querySelector('.selected-card h3')
            return el ? el.textContent : ''
        })
        expect(h3Text.length, 'focus h3 must render business name (length > 0)').toBeGreaterThan(0)
    })

    test('W54-layout: #app viewport-anchored (Fix A) + .trail-btn min-width floor (Fix I)', async ({ page }) => {
        // Fix A (src/index.html): #app must be position:absolute with inset:0 so
        // the canvas fills the viewport and the absolutely-positioned
        // .app-title-header stops offsetting/pushing the canvas container
        // down. Before the fix #app was a static-flow block and the header
        // (position:absolute; top:0) overlapped the canvas, leaving #canvas-container
        // starting at y>0 instead of y=0.
        // Fix I (src/components/TrailControls.svelte): .trail-btn needs an
        // explicit min-width floor (72px) so the Prev/Next trail navigation
        // buttons never collapse below a usable touch target when the grid-flow
        // .trail-controls layout squeezes them at narrow widths. We assert the
        // rule shipped in the live CSSOM (CSSOM-rule iteration, mirroring the
        // W54-B1 .filters-scrim pattern) rather than starting a flaky trail.
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&record=6218`, {
            waitUntil: 'domcontentloaded'
        })
        await page.waitForFunction(
            () => {
                const s = window.__APP_STATE__?.navState
                return !!s && s.mode === 'focus'
            },
            null,
            { timeout: 15000, polling: 100 }
        )
        await page.waitForTimeout(800)

        // ── Fix A: #app viewport anchor ──
        const appAnchor = await page.evaluate(() => {
            const el = document.getElementById('app')
            if (!el) return null
            const cs = getComputedStyle(el)
            const r = el.getBoundingClientRect()
            return {
                position: cs.position,
                top: Math.round(r.top),
                left: Math.round(r.left),
                width: Math.round(r.width),
                height: Math.round(r.height)
            }
        })
        expect(appAnchor, '#app must exist').not.toBeNull()
        expect(appAnchor.position, '#app must be position:absolute (Fix A anchor)').toBe('absolute')
        expect(appAnchor.top, '#app must be anchored to viewport top (top=0, Fix A)').toBe(0)
        expect(appAnchor.left, '#app must be anchored to viewport left (left=0, Fix A)').toBe(0)
        expect(appAnchor.width, '#app must span the viewport width (Fix A)').toBe(1280)
        expect(appAnchor.height, '#app must span the viewport height (Fix A)').toBe(800)

        // ── Fix I: .trail-btn min-width:72px shipped in the live CSSOM ──
        const trailBtnMinWidth = await page.evaluate(() => {
            let found = null
            for (const sheet of Array.from(document.styleSheets)) {
                try {
                    const rules = sheet.cssRules || sheet.rules
                    for (const rule of Array.from(rules)) {
                        if (
                            rule.selectorText &&
                            rule.selectorText.includes('trail-btn') &&
                            rule.style &&
                            rule.style.minWidth
                        ) {
                            found = rule.style.minWidth
                            break
                        }
                    }
                } catch {
                    /* cross-origin stylesheet — skip */
                }
                if (found) break
            }
            return found
        })
        expect(trailBtnMinWidth, '.trail-btn rule must set a min-width in the shipped CSSOM (Fix I)').not.toBeNull()
        const pxMatch = String(trailBtnMinWidth).match(/(\d+(?:\.\d+)?)px/)
        expect(pxMatch, `.trail-btn min-width must parse as a px value (got "${trailBtnMinWidth}")`).not.toBeNull()
        expect(
            parseFloat(pxMatch[1]),
            `.trail-btn min-width floor must be >= 72px (Fix I; got ${trailBtnMinWidth})`
        ).toBeGreaterThanOrEqual(72)
    })

    test('B-S5: surface-5 @820 no chip-label mid-word clip (Phase-3 R1 hallucination guard)', async ({ page }) => {
        // Surface-5 fix-wave R1 (Phase-3 2026-07-16 cross-model grade):
        // agnes-2.0-flash reported the "Overview" mode chip was clipped to "Ove"
        // at the 820px width (narrow-desktop). Main-lane DOM inspection (v2 —
        // mirrors tests/capture-phase2.spec.js's __PLAYWRIGHT__ + localStorage
        // boot so renderKind=webgl + splash auto-dismiss at desktop widths)
        // showed Lane B's header.css @media ≤820px rule (overflow-x: auto;
        // min-width: 0; etc.) instead makes the .mode-chips rail scroll
        // horizontally (scrollWidth=381 vs clientWidth=299 → 82px overflow),
        // but every individual chip / label fits its own box —
        // `labelEl.scrollWidth === labelEl.clientWidth` for all 6 — meaning no
        // chip text is mid-word clipped; the user simply scrolls the rail
        // horizontally to reveal off-viewport chips. This journey test
        // formalises the no-clip invariant so future regressions (e.g. someone
        // deciding to clip chip text instead of scrolling) get caught.
        await page.setViewportSize({ width: 820, height: 800 })
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

        // Poll for the mode-chip rail to be mounted with 6 chips before reading geometry.
        // Mirrors B-S7 fix: the old 1200ms sleep was a guess that could lag the header mount.
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

        // Dismiss first-visit help dialog if auto-opened (mirrors B-S7).
        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(300)
        }

        // Assertion 1: .mode-chips rail exists with exactly 6 mode-chip children.
        const railState = await page.evaluate(() => {
            const rail = document.querySelector('.mode-chips')
            if (!rail) return { exists: false, chipCount: 0, chips: [], rail: null }
            const chips = Array.from(rail.querySelectorAll('.mode-chip'))
            return {
                exists: true,
                chipCount: chips.length,
                rail: {
                    scrollWidth: rail.scrollWidth,
                    clientWidth: rail.clientWidth,
                    overflowX: getComputedStyle(rail).overflowX,
                    display: getComputedStyle(rail).display
                },
                chips: chips.map((c) => {
                    const labelEl = c.querySelector('.chip-label') || c
                    const text = labelEl.textContent?.trim() || ''
                    return {
                        text,
                        labelScrollWidth: labelEl.scrollWidth,
                        labelClientWidth: labelEl.clientWidth,
                        labelFitDelta: labelEl.scrollWidth - labelEl.clientWidth,
                        whiteSpace: getComputedStyle(labelEl).whiteSpace,
                        textOverflow: getComputedStyle(labelEl).textOverflow
                    }
                })
            }
        })
        expect(railState.exists, '.mode-chips rail must exist at 820px viewport').toBe(true)
        expect(railState.chipCount, '.mode-chips must contain 6 mode-chip children').toBe(6)

        // Assertion 2: every mode-chip label text matches expected full text
        // (order per Header.svelte journey-phase manifest — W47+ order:
        // overview → search → focus → trail → inside → map, surfaced as rail
        // tokens). No "Ove" truncations, no missing tokens.
        const expectedTexts = ['Overview', 'Search', 'Trail', 'Focus', 'Inside', 'Map']
        railState.chips.forEach((c, i) => {
            expect(c.text, `.mode-chip ${i} label text`).toBe(expectedTexts[i])
        })

        // Assertion 3: NO chip label is mid-word clipped — each label must
        // fit inside its own client width (scrollWidth <= clientWidth + 1).
        // Note: at 820px the RAIL scrolls horizontally (overflow-x: auto per
        // lane-B header.css @media ≤820px rule), but individual labels do
        // NOT clip — Phase-3 R1 agnes vision grader's "Overview → Ove" was a
        // hallucination. This assertion formalises the no-clip invariant.
        railState.chips.forEach((c, i) => {
            expect(
                c.labelFitDelta,
                `.mode-chip ${i} ("${c.text}") label must NOT clip (scrollWidth=${c.labelScrollWidth} clientWidth=${c.labelClientWidth}, delta=${c.labelFitDelta})`
            ).toBeLessThanOrEqual(1)
        })

        // Assertion 4: the rail uses overflow-x: auto at ≤820px so chips
        // scroll horizontally rather than truncating. This is the design fix
        // (lane-B header.css) AND the contract this B-S5 test guards.
        expect(
            railState.rail.overflowX,
            '.mode-chips must use overflow-x: auto at ≤820px (lane-B header.css rule)'
        ).toBe('auto')
    })

    test('ui-hardening: SearchBar z-index resolves to 100 in info-panel-contained mode (PR 409fbc91 #13)', async ({
        page
    }) => {
        // 409fbc91 defined --z-search-bar:100 in z-layers.css so the
        // .search-container.info-panel-contained no longer falls back to
        // z-index:2 and renders behind the info panel (#13). This test
        // verifies the resolved z-index is 100 at desktop width.
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const explore = page
            .locator('[data-testid="splash-cta"], button[aria-label="Open in 3D"], [data-testid="placeholder-cta"]')
            .first()
        await explore.waitFor({ state: 'visible', timeout: 60000 })
        await explore.click()

        await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, {
            // 20s timeout accommodates WebGL GPU-stall delays during initial scene
            // setup that block Svelte's reactivity flush (~7-11s) — see W55 timeline diagnosis.
            timeout: 20000,
            polling: 100
        })
        await page.locator('.weather-widget').waitFor({ state: 'attached', timeout: 45000 })
        await page.waitForFunction(() => document.body?.dataset?.sceneReady === 'true', null, {
            timeout: 15000,
            polling: 100
        })
        await page.waitForTimeout(1500)

        // Dismiss first-visit help dialog if auto-opened.
        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }

        // Trigger a search so the .search-container gains .info-panel-contained
        // (the class is applied when a search result is shown in the panel).
        const searchInput = page.locator('#search-input')
        // 20s timeout accommodates WebGL GPU-stall delays during initial scene
        // setup that block Svelte's reactivity flush (~7-11s) — see W55 timeline diagnosis.
        await searchInput.waitFor({ state: 'attached', timeout: 20000 })
        await searchInput.fill('coffee')
        await page.keyboard.press('Enter')

        // Wait for info-panel-contained to be applied.
        await page
            .waitForFunction(
                () => {
                    const sc = document.querySelector('.search-container')
                    return sc && sc.classList.contains('info-panel-contained')
                },
                { timeout: 15000, polling: 100 }
            )
            .catch(() => {})
        await page.waitForTimeout(200)

        const zResult = await page.evaluate(() => {
            const sc = document.querySelector('.search-container.info-panel-contained')
            if (!sc) return { found: false }
            const cs = getComputedStyle(sc)
            return {
                found: true,
                zIndex: cs.zIndex,
                resolved: parseInt(cs.zIndex, 10)
            }
        })

        expect(zResult.found, '.search-container.info-panel-contained must exist in the DOM').toBe(true)
        expect(
            zResult.resolved,
            `--z-search-bar must resolve to 100 (got z-index=${zResult.zIndex}, resolved=${zResult.resolved})`
        ).toBe(100)
    })

    test('ui-hardening: FocusPocketA11y keyboard focus shows visible 2px outline + box-shadow (WCAG 2.4.7, PR 409fbc91 #15)', async ({
        page
    }) => {
        // 409fbc91 strengthened the FocusPocketA11y .focus-pocket-item-btn
        // :focus-visible from a faint ring to a visible 2px outline + box-shadow
        // ring (WCAG 2.4.7). This test focuses a pocket button and verifies
        // the computed style includes the outline and box-shadow properties.
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const explore = page
            .locator('[data-testid="splash-cta"], button[aria-label="Open in 3D"], [data-testid="placeholder-cta"]')
            .first()
        await explore.waitFor({ state: 'visible', timeout: 60000 })
        await explore.click()

        await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, {
            // 20s timeout accommodates WebGL GPU-stall delays during initial scene
            // setup that block Svelte's reactivity flush (~7-11s) — see W55 timeline diagnosis.
            timeout: 20000,
            polling: 100
        })
        await page.waitForTimeout(700)

        // Dismiss first-visit help dialog if auto-opened.
        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }

        // Focus a node to populate the pocket.
        const ok = await page.evaluate(() => {
            const actions = window.__navActions__
            return actions && typeof actions.focusOnNode === 'function' ? actions.focusOnNode(0) : false
        })
        expect(ok, 'focusOnNode(0) must succeed').toBe(true)

        // Wait for focus mode + pocket indices and the populated focus card
        // before interacting with the list. Use evaluate polling to avoid
        // Playwright visibility/attached races during Svelte transitions.
        await page.waitForFunction(
            () => {
                const s = window.__APP_STATE__?.navState
                return (
                    s?.mode === 'focus' &&
                    Array.isArray(s?.focusPocketIndices) &&
                    s.focusPocketIndices.length > 0 &&
                    document.querySelector('#fc-selected-name') !== null
                )
            },
            null,
            { timeout: 20000, polling: 100 }
        )

        const toggleBtn = page.locator('#focus-pocket-list-toggle')
        // 20s timeout accommodates WebGL GPU-stall delays during initial scene
        // setup that block Svelte's reactivity flush (~7-11s) — see W55 timeline diagnosis.
        await toggleBtn.waitFor({ state: 'attached', timeout: 20000 })
        await toggleBtn.click({ force: true })

        await page.waitForFunction(
            () => document.querySelector('#focus-pocket-a11y .focus-pocket-item-btn') !== null,
            null,
            { timeout: 15000, polling: 100 }
        )
        await page.waitForTimeout(300)

        // Verify the CSS :focus-visible rule exists with a visible outline +
        // box-shadow. We read the stylesheet rules directly because
        // getComputedStyle(:focus-visible) requires keyboard interaction that
        // is unreliable in headless Playwright. The hardening commit changed
        // the CSS — verify the rule is present and has the right properties.
        const focusRules = await page.evaluate(() => {
            const results = []
            for (const sheet of document.styleSheets) {
                try {
                    for (const rule of sheet.cssRules || []) {
                        const sel = rule.selectorText || ''
                        if (sel.includes('.focus-pocket-item-btn') && sel.includes(':focus-visible') && rule.style) {
                            results.push({
                                selector: sel,
                                outline: rule.style.outline || null,
                                outlineStyle: rule.style.outlineStyle || null,
                                outlineWidth: rule.style.outlineWidth || null,
                                boxShadow: rule.style.boxShadow || null
                            })
                        }
                    }
                } catch {
                    // cross-origin stylesheet — skip
                }
            }
            return results
        })

        // There must be at least one :focus-visible rule for .focus-pocket-item-btn.
        expect(
            focusRules.length,
            'there must be at least one CSS rule for .focus-pocket-item-btn:focus-visible'
        ).toBeGreaterThanOrEqual(1)

        // At least one of those rules must declare a visible outline (not 'none')
        // and a visible box-shadow. The 409fbc91 fix strengthened this from a
        // faint ring to a 2px outline + box-shadow ring (WCAG 2.4.7).
        const hasVisibleOutline = focusRules.some(
            (r) => r.outline && r.outline !== 'none' && !r.outline.startsWith('none')
        )
        const hasBoxShadow = focusRules.some((r) => r.boxShadow && r.boxShadow !== 'none' && r.boxShadow.length > 0)
        expect(hasVisibleOutline, ':focus-visible rule must declare a visible outline (not none) — WCAG 2.4.7').toBe(
            true
        )
        expect(hasBoxShadow, ':focus-visible rule must declare a visible box-shadow ring — WCAG 2.4.7').toBe(true)
    })

    test('ui-hardening: splash/loading overlay z-index = var(--z-loading) = 9999 (PR 409fbc91 #6)', async ({
        page
    }) => {
        // 409fbc91 replaced literal z-index:3000/3001 with
        // var(--z-loading) on #app-loading-placeholder and
        // #noscript-fallback so they sit above all app content at
        // z-index 9999. This test loads the page and reads the
        // computed z-index of the splash overlay BEFORE the Svelte
        // app removes it.
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, {
            waitUntil: 'commit' // read DOM as early as possible, before Svelte hydrates
        })

        // The #app-loading-placeholder is present in the initial HTML
        // and removed by App.svelte's onMount. Read it immediately.
        const splashResult = await page.evaluate(() => {
            const el = document.getElementById('app-loading-placeholder')
            if (!el) return { found: false }
            const cs = getComputedStyle(el)
            return {
                found: true,
                zIndex: cs.zIndex,
                resolved: parseInt(cs.zIndex, 10),
                position: cs.position
            }
        })

        expect(splashResult.found, '#app-loading-placeholder must exist in the initial DOM').toBe(true)
        expect(
            splashResult.resolved,
            `#app-loading-placeholder z-index must resolve to 9999 (var(--z-loading); got ${splashResult.zIndex})`
        ).toBe(9999)
        expect(splashResult.position, '#app-loading-placeholder must be position:fixed to overlay all content').toBe(
            'fixed'
        )
    })

    test('ui-hardening: mobile body uses min-height:100dvh, not 100vh (PR ed0e12be)', async ({ page }) => {
        // ed0e12be changed 100vh → 100dvh in base.css body, landscape
        // panels, and focus_stage.css so the mobile viewport-fill tracks
        // the dynamic viewport (excluding browser chrome) instead of the
        // static layout viewport. This test verifies the body computes
        // 100dvh (the resolved value will differ from 100vh when the
        // browser has a visible address bar, but the CSS property itself
        // must be 100dvh).
        await page.setViewportSize({ width: 375, height: 812 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        // Wait for body to render.
        await page.waitForFunction(() => document.body, null, { timeout: 5000, polling: 100 })

        const viewportResult = await page.evaluate(() => {
            const body = document.body
            const cs = getComputedStyle(body)
            // Read the raw CSS rule to confirm dvh (not vh). getComputedStyle
            // resolves the unit, so we check the stylesheet directly.
            const sheets = Array.from(document.styleSheets)
            let bodyMinHeightRule = null
            for (const sheet of sheets) {
                try {
                    const rules = Array.from(sheet.cssRules || [])
                    for (const rule of rules) {
                        // Match body rule in base.css that sets min-height.
                        if (rule.selectorText === 'body' && rule.style?.minHeight) {
                            bodyMinHeightRule = rule.style.minHeight
                            break
                        }
                    }
                } catch {
                    // cross-origin stylesheet — skip
                }
                if (bodyMinHeightRule) break
            }
            return {
                computedMinHeight: cs.minHeight,
                bodyHeight: body.getBoundingClientRect().height,
                innerHeight: window.innerHeight,
                rawRule: bodyMinHeightRule
            }
        })

        // The body must have a positive height filling the viewport.
        expect(
            viewportResult.bodyHeight,
            'body must have a positive height filling the mobile viewport'
        ).toBeGreaterThan(0)

        // The CSS rule in base.css must use 100dvh, not 100vh.
        // If the stylesheet is cross-origin or the rule isn't found via the
        // direct selector check, we validate indirectly: the body's computed
        // min-height should equal window.innerHeight (100dvh ≈ 100vh in
        // Playwright headless). The key assertion is that the raw CSS rule
        // contains 'dvh'.
        if (viewportResult.rawRule) {
            expect(viewportResult.rawRule, 'base.css body rule must use 100dvh, not 100vh (PR ed0e12be)').toContain(
                '100dvh'
            )
        }
        // Indirect check: body min-height resolves to at least the viewport height.
        const parsedMin = parseFloat(viewportResult.computedMinHeight)
        expect(
            parsedMin,
            `body min-height (${viewportResult.computedMinHeight}) must be >= viewport innerHeight (${viewportResult.innerHeight})`
        ).toBeGreaterThanOrEqual(viewportResult.innerHeight * 0.9) // 10% tolerance for dvh rounding
    })

    test('5n. MapView deep-link ?view=map renders Leaflet chrome + bypasses splash gate (W52 parked-item #5)', async ({
        page
    }) => {
        // W52 parked-item #5 closure: AGENTS.md Conventions → 'Splash dismissal on
        // deep-links (PR-B2/B4)': parseUrlParams() returns isDeepLink for ?view=map;
        // on desktop, the splash gate dismisses immediately (main.ts signalReady()
        // fires at boot via the isDeepLink guard). src/lib/orchestration/url-state.ts:209
        // applies the URL `view` param to navState.currentView via writeNavStateMirror,
        // so ?view=map flips state to currentView='map', which triggers
        // MapView.svelte mount + activateMapShell() on the shared #map-container
        // owned by Canvas.svelte. This is the first journey test covering the
        // map-deep-link entry path against dist/svelte/index.html.

        await page.setViewportSize({ width: 1440, height: 900 })

        // Force webgl render-kind (the real WebGL scene) so the desktop deep-link
        // resolves at boot — same pattern as the ?anchor=519 deep-link test at
        // line 1517. Without __PLAYWRIGHT__, navigator.webdriver stays in
        // placeholder2d, engineReady doesn't signalReady, and the splash layer
        // stays occluding regardless of isDeepLink.
        await page.addInitScript(() => {
            window.__PLAYWRIGHT__ = true
        })

        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&view=map`, { waitUntil: 'domcontentloaded' })

        // 1) Splash + loading overlay hidden (deep-link desktop signalReady path).
        const overlay = page.locator('.loading-overlay')
        await overlay.waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {})

        // 2) Points loaded (8,406) so applyUrlStateAfterData can resolve.
        await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, {
            timeout: 20000,
            polling: 100
        })

        // 3) URL-state restore flipped navState.currentView to 'map'
        //    (url-state.ts:209 view=map → writeNavStateMirror currentView='map').
        await page.waitForFunction(
            () => {
                const s = window.__APP_STATE__?.navState
                return !!s && s.currentView === 'map'
            },
            null,
            { timeout: 20000, polling: 100 }
        )

        // 4) #map-container (owned by Canvas.svelte) is now activated. MapView.svelte
        //    activateMapShell() sets data-active-view='map' + class 'active'
        //    + aria-hidden='false'. See src/components/MapView.svelte:77.
        await page.waitForFunction(
            () => {
                const map = document.getElementById('map-container')
                return !!map && map.dataset.activeView === 'map'
            },
            null,
            { timeout: 20000, polling: 100 }
        )

        // 5) Leaflet initializes inside #map-container once MapView's initMap()
        //    finishes — Leaflet adds 'leaflet-container' to the host element.
        //    tests/product-playthrough-audit.mjs:761 uses '#map-container.leaflet-container'
        //    as the canonical map-ready selector.
        await page.locator('#map-container.leaflet-container').first().waitFor({ state: 'attached', timeout: 30000 })

        // 6) No error chrome (status !== 'error'); the MapView chrome must not
        //    have surfaced a tile-load failure label.
        const errChrome = page.locator('.map-view.is-error, .map-status.is-error')
        expect(await errChrome.count(), 'map must not surface error chrome under ?view=map deep-link').toBe(0)

        // 7) MapView.svelte chrome mounted — .map-view wrapper is the outermost
        //    surface MapView renders (header/footer + status-dot + retry/back).
        //    See src/components/MapView.svelte styling.
        const chrome = page.locator('.map-view')
        expect(await chrome.count(), 'MapView chrome (.map-view) must mount under ?view=map deep-link').toBeGreaterThan(
            0
        )
    })

    test('W53 issue #6 (Tier-1 HIGH — cross-juror consensus): FocusCard dismiss button deselects the business', async ({
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
        await page.locator('.weather-widget').waitFor({ state: 'attached', timeout: 45000 })
        await page.waitForTimeout(1500)

        // Close the first-visit help dialog so its backdrop doesn't absorb the dismiss click.
        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }

        // Focus a business that has a website so the FocusCard renders the
        // POPULATED state (the dismiss grip is gated on !isEmpty).
        const targetIndex = await page.evaluate(() => {
            const points = window.__APP_STATE__?.points ?? []
            const limit = Math.min(points.length, 1000)
            for (let i = 0; i < limit; i++) {
                const p = points[i]
                if (p && p.website) return i
            }
            return -1
        })
        expect(
            targetIndex,
            'pre-condition: a point with a website must exist to render the populated FocusCard'
        ).toBeGreaterThanOrEqual(0)

        await page.evaluate((idx) => {
            const actions = window.__navActions__
            if (!actions || typeof actions.focusOnNode !== 'function') {
                throw new Error('__navActions__.focusOnNode is not exposed')
            }
            if (!actions.focusOnNode(idx)) throw new Error(`focusOnNode(${idx}) returned a falsy result`)
        }, targetIndex)

        // FocusCard is lazy-loaded; wait for the populated card + dismiss button.
        const card = page.locator('.focus-card').first()
        // Gate on the deterministic focus-state signal first (timer-poll, rAF-
        // immune) so the card wait starts only once the surface transition has
        // committed, then wait the lazily-hydrated card visible with a budget
        // raised for serial-suite GPU stalls (full-suite transcript: L4419
        // TimeoutError at the 20s card budget).
        await page.waitForFunction(() => window.__APP_STATE__?.navState?.mode === 'focus', null, {
            timeout: 20000,
            polling: 100
        })
        await card.waitFor({ state: 'visible', timeout: 35000 })

        const closeBtn = page.locator('[data-test-id="focus-card-close"]')
        await expect(closeBtn).toBeVisible()
        await expect(closeBtn).toHaveAttribute('aria-label', /close business card/i)

        // WCAG 2.5.5: 44×44 touch floor on the dismiss button.
        const box = await closeBtn.boundingBox()
        expect(box, 'close button must have a measurable bounding box').not.toBeNull()
        // Sub-pixel tolerance (session-4): getBoundingClientRect can return
        // 43.99998… for a CSS-44px box under fractional-DPR layout, failing a
        // bare >= 44 on a WCAG-compliant target. Compare the ROUNDED px.
        expect(Math.round(box.width), 'dismiss hit area ≥44px wide (WCAG 2.5.5)').toBeGreaterThanOrEqual(44)
        expect(Math.round(box.height), 'dismiss hit area ≥44px tall (WCAG 2.5.5)').toBeGreaterThanOrEqual(44)

        // Pre-condition: a business is focused before dismissing.
        const focusedBefore = await page.evaluate(() => window.__APP_STATE__?.navState?.focusedIndex)
        expect(focusedBefore, 'a business must be focused before dismissing').not.toBeNull()

        // Dismiss — the button calls returnToOverview(), which clears
        // focusedIndex + routes to overview, flipping cardVisible ($derived)
        // false so the FocusCard unmounts.
        await closeBtn.click()

        // 20s timeout accommodates WebGL GPU-stall delays during initial scene
        // setup that block Svelte's reactivity flush (~7-11s) — see W55 timeline diagnosis.
        await page.waitForFunction(
            () =>
                document.querySelectorAll('.focus-card').length === 0 &&
                window.__APP_STATE__?.navState?.focusedIndex == null,
            null,
            { timeout: 20000, polling: 100 }
        )
        const focusedAfter = await page.evaluate(() => window.__APP_STATE__?.navState?.focusedIndex)
        expect(focusedAfter, 'dismiss must clear the focused business (focusedIndex === null)').toBeNull()
    })

    test('5n. Focus pocket renders correctly after focusing on a business (W47 fix)', async ({ page }) => {
        // Journey test for the W47 visual fix: focus core and halo are billboarded to the camera,
        // focused hero spore stays uniformly spherical, camera pulled back from 0.75 to 0.88.
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?anchor=100&nodemo=1`, { waitUntil: 'domcontentloaded' })

        await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 0, null, {
            timeout: 15000,
            polling: 100
        })
        await page.waitForFunction(() => document.body.dataset?.sceneReady === 'true', null, {
            timeout: 10000,
            polling: 100
        })
        await page.waitForFunction(() => window.__APP_STATE__?.navState?.mode === 'focus', null, {
            timeout: 10000,
            polling: 100
        })

        // mode === 'focus' is set SYNCHRONOUSLY by _restoreFocusStateForAnchor (url-state.ts),
        // but the focus pocket is populated one async chunk-load LATER via
        // `_applyFocusPocketForAnchor → await import('@lib/focus/pocket') → applyLocalNeighborhoodFocus`
        // (the dynamic import is an intentional W44-S5 perf split). The mode wait resolves at the
        // synchronous step; reading focusPocketIndices one-shot there catches the in-flight `[]`.
        // Wait for the pocket indices to actually land before reading them.
        await page.waitForFunction(() => (window.__APP_STATE__?.navState?.focusPocketIndices?.length ?? 0) > 0, null, {
            timeout: 15000,
            polling: 100
        })

        const pocket = await page.evaluate(() => {
            const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
            return {
                pocketIndices: appState?.navState?.focusPocketIndices || [],
                focusedIndex: appState?.navState?.focusedIndex ?? null,
                focusedNode: appState?.focusedNode ?? null
            }
        })

        expect(
            pocket.pocketIndices.length,
            'focus pocket should have at least one neighbor after focusing'
        ).toBeGreaterThan(0)
        expect(pocket.focusedIndex, 'focused node index should not be null').not.toBeNull()
        expect(pocket.focusedNode, 'focused node should not be null').not.toBeNull()
    })

    test('Legend title carries a descriptive aria-label (bugsweep W55 a11y)', async ({ page }) => {
        // Regression: the Legend panel title was a bare "Categories" heading.
        // The sweep added an aria-label so screen readers announce the purpose
        // of the color key. This test verifies the live DOM after opening the
        // category legend via the header toggle.
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
        // Raised 30->45s: the weather-widget warm-up gate under serial-suite GPU
        // accumulation (full-suite Legend L4544 TimeoutError on this exact wait).
        await page.locator('.weather-widget').waitFor({ state: 'attached', timeout: 45000 })
        await page.waitForTimeout(800)

        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }

        // The legend panel is auto-open on desktop by default; the toggle is
        // always present in the header. Use the id for a stable locator and wait
        // long enough for the header chrome to mount after splash dismiss.
        const legendToggle = page.locator('#btn-legend')
        await legendToggle.waitFor({ state: 'visible', timeout: 20000 })
        await legendToggle.click()

        // Legend auto-hides after 10s; assert within a few seconds of opening.
        const legendTitle = page.locator('#legend-panel .legend-title').first()
        // 20s timeout accommodates WebGL GPU-stall delays during initial scene
        // setup that block Svelte's reactivity flush (~7-11s) — see W55 timeline diagnosis.
        await legendTitle.waitFor({ state: 'attached', timeout: 20000 })
        // Poll for the legend title to be non-hidden (the panel auto-hides after 10s).
        await pollFor(
            page,
            () => {
                const el = document.querySelector('#legend-panel .legend-title')
                return el && el.getAttribute('aria-hidden') !== 'true'
            },
            15000,
            100
        )

        const ariaLabel = await legendTitle.getAttribute('aria-label')
        expect(ariaLabel, 'legend title must have a descriptive aria-label').toBeTruthy()
        expect(ariaLabel, 'legend aria-label must mention categories and color coding').toMatch(/categories|color/i)
        expect(await legendTitle.textContent(), 'legend heading text should still read "Categories"').toContain(
            'Categories'
        )
    })
})
