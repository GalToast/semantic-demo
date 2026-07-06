import { test, expect } from '@playwright/test'
import { BASE_URL } from './helpers/3d-interaction-helpers.js'

test.describe('Widget journey', () => {
    test('5g. Focus-panel facts separator is aria-hidden (W47 audit #2)', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const explore = page.locator('[data-testid="splash-cta"], button[aria-label="Enter 3D scene"]').first()
        await explore.waitFor({ state: 'visible', timeout: 40000 })
        await explore.click()

        await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 15000 })
        await page.locator('.weather-widget').waitFor({ state: 'attached', timeout: 30000 })
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

        // W48-UX: the DOM can carry a hidden responsive clone of the info panel;
        // wait for attachment rather than strict visibility, then assert on the
        // focused panel's rendered facts.
        const facts = page.locator('.info-panel.open #selected-facts')
        await facts.waitFor({ state: 'attached', timeout: 5000 })
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

    test('5h. Trail counter never says "Stop N of 0" (W48 audit, JourneyChrome regression)', async ({ page }) => {
        // Regression: a parallel implementation of the trail-counter copy in
        // src/components/JourneyChrome.svelte rendered "Stop 2 of 0" when
        // neighborCount was 0. The focus-ui.ts twin was fixed in PR-W47-g
        // (11b176e8) but JourneyChrome.svelte was missed. The fix routes
        // neighborCount===0 to the "No more visible stops in this slice."
        // fallback copy that already exists in the focus-ui.ts twin.
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const explore = page.locator('[data-testid="splash-cta"], button[aria-label="Enter 3D scene"]').first()
        await explore.waitFor({ state: 'visible', timeout: 40000 })
        await explore.click()

        await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 15000 })
        await page.locator('.weather-widget').waitFor({ state: 'attached', timeout: 30000 })
        await page.waitForTimeout(1500)

        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }

        // Pick a data point with 0 neighbors by iterating until we find one
        // whose post-focus neighborCount===0. If every point has neighbors,
        // this test cannot exercise the regression — fail loudly.
        const focusInfo = await page.evaluate(() => {
            const points = window.__APP_STATE__?.points ?? []
            const actions = window.__navActions__
            const limit = Math.min(points.length, 1500)
            for (let i = 0; i < limit; i++) {
                const p = points[i]
                if (!p) continue
                if (actions && typeof actions.focusOnNode === 'function') {
                    const ok = actions.focusOnNode(i)
                    if (!ok) continue
                }
                // After focus, ask the live DOM what the focus-stage says.
                const fsp = document.querySelector('#focus-stage-progress')
                const nc = document.querySelector('#focus-stage-neighbor-count')
                const progress = fsp ? fsp.textContent.trim() : ''
                const neighborCount = nc ? nc.textContent.trim() : ''
                if (/^0 visible neighbors/.test(neighborCount)) {
                    return { idx: i, progress, neighborCount }
                }
            }
            return null
        })

        expect(
            focusInfo,
            'pre-condition: at least one point in the corpus must have 0 visible neighbors to exercise the regression'
        ).not.toBeNull()

        // The actual regression assertion: progress text must NOT be "Stop N of 0",
        // and SHOULD fall through to the "No more visible stops" copy.
        expect(
            focusInfo.progress,
            `trail-progress must never render "Stop N of 0" — got "${focusInfo.progress}"`
        ).not.toMatch(/^Stop \d+ of 0$/)
        expect(
            focusInfo.progress,
            `when neighborCount===0, progress must show the "No more visible stops" fallback — got "${focusInfo.progress}"`
        ).toMatch(/No more visible stops in this slice/)
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

        const explore = page.locator('[data-testid="splash-cta"], button[aria-label="Enter 3D scene"]').first()
        await explore.waitFor({ state: 'visible', timeout: 40000 })
        await explore.click()

        await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 15000 })
        await page.locator('.weather-widget').waitFor({ state: 'attached', timeout: 30000 })
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
        await page.evaluate(() => {
            const f = document.querySelector('#search-input').closest('form')
            if (f) f.requestSubmit()
        })
        // Wait for at least 4 results to render so Match 3 actually exists.
        await page.waitForFunction(
            () => {
                const items = document.querySelectorAll('.search-result-listitem, [role="option"]')
                return items.length >= 4
            },
            null,
            { timeout: 8000 }
        )
        await page.waitForTimeout(800)

        // The synthesize-trigger and search-trail-cue must both be hidden
        // at mobile (max-width: 768px) regardless of whether their internal
        // "show" state is true.
        const overlap = await page.evaluate(() => {
            const result = { synth: null, cue: null }
            const synth = document.querySelector('.synthesize-trigger')
            if (synth) {
                const cs = getComputedStyle(synth)
                result.synth = {
                    display: cs.display,
                    visibility: cs.visibility,
                    width: synth.getBoundingClientRect().width,
                    height: synth.getBoundingClientRect().height
                }
            }
            const cue = document.querySelector('#search-trail-cue')
            if (cue) {
                const cs = getComputedStyle(cue)
                result.cue = {
                    display: cs.display,
                    visibility: cs.visibility,
                    width: cue.getBoundingClientRect().width,
                    height: cue.getBoundingClientRect().height
                }
            }
            return result
        })

        expect(overlap.synth, 'synthesize-trigger must be display:none on mobile (375px)').toMatchObject({
            display: 'none',
            width: 0,
            height: 0
        })
        expect(overlap.cue, 'search-trail-cue must be display:none on mobile (375px)').toMatchObject({
            display: 'none',
            width: 0,
            height: 0
        })

        // Also verify Match 3 is not occluded — its text rects should not be
        // covered by anything with the synth/cue classes.
        const match3 = await page.evaluate(() => {
            const items = document.querySelectorAll('.search-result-listitem, [role="option"]')
            const m3 = items[2]
            if (!m3) return null
            const r = m3.getBoundingClientRect()
            return { x: r.x, y: r.y, w: r.width, h: r.height }
        })
        expect(match3, 'pre-condition: Match 3 result card must exist').not.toBeNull()
        // Bottom of Match 3 should not be overlapped by synthesize-trigger (which
        // sat at bottom: 5rem = ~80px from bottom = ~y 730 at 812px viewport).
        // Just confirm Match 3 has positive height and is visible.
        expect(match3.h).toBeGreaterThan(0)
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

        const explore = page.locator('[data-testid="splash-cta"], button[aria-label="Enter 3D scene"]').first()
        await explore.waitFor({ state: 'visible', timeout: 40000 })
        await explore.click()

        await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 15000 })
        await page.locator('.weather-widget').waitFor({ state: 'attached', timeout: 30000 })
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
        await searchInput.waitFor({ state: 'attached', timeout: 10000 })
        await searchInput.fill('coffee')
        await page.keyboard.press('Enter')
        await page
            .locator('.search-results-wrapper')
            .waitFor({ state: 'attached', timeout: 12000 })
            .catch(() => {})
        await page.waitForTimeout(1500)

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
            timeout: 10000
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

    test('5k. Focus card shows friendly role label "Business view" after selecting a node (UX-2 de-jargon)', async ({
        page
    }) => {
        // UX-2: the FocusCard role label was changed from internal-data jargon
        // "Field Node" to "Business view" (and "Search Match" to "Search result").
        // This test exercises the real DOM after clicking a node.
        // NOTE: the badge may be visually hidden by the info-panel CSS, but its
        // textContent is still deterministically "Business view" after focus.
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const explore = page.locator('[data-testid="splash-cta"], button[aria-label="Enter 3D scene"]').first()
        await explore.waitFor({ state: 'visible', timeout: 40000 })
        await explore.click()

        await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 15000 })
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
        await page.waitForFunction(
            () => {
                const el = document.querySelector('#selected-role-badge')
                return !!el && el.textContent?.trim() === 'Business view'
            },
            null,
            { timeout: 10000 }
        )

        // Also assert no stale "Field Node" string remains anywhere in the
        // rendered focus card.
        const cardHtml = await page.evaluate(() => {
            const card = document.querySelector('#selected-card, .focus-card')
            return card?.outerHTML ?? ''
        })
        expect(cardHtml, 'focus card must not contain the old jargon "Field Node"').not.toContain('Field Node')
    })

    test('W50-A11y: focus moves to #search-input on mobile after splash dismiss', async ({ page }) => {
        // Regression: App.svelte's post-engineReady focus effect was gated on
        // !isCompact(), which stranded mobile screen-reader users at <body>
        // with no focus target after dismissing the splash. Verify focus lands
        // on #search-input (the primary entry point) on a mobile viewport.
        await page.setViewportSize({ width: 375, height: 667 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const explore = page.locator('[data-testid="splash-cta"], button[aria-label="Enter 3D scene"]').first()
        await explore.waitFor({ state: 'visible', timeout: 40000 })
        await explore.click()

        await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 15000 })
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

    test('5l. Help (?) button re-opens the help dialog after dismissal (W48 fix)', async ({ page }) => {
        // W48 audit: the ? (btn-app-help) toggle looked broken — clicking it
        // after dismissal left the dialog closed. Root cause: the W49-I
        // focusin capture handler closed the dialog on ANY focusin event,
        // including the focus showModal() itself moves into the dialog.
        // Open → focusin → close happened in one frame, so the user never
        // saw the dialog open. The fix skips focusin events whose target is
        // inside the dialog.
        //
        // This test exercises the real DOM: dismiss any auto-opened help,
        // then click #btn-app-help, then assert the dialog is open.
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const explore = page.locator('[data-testid="splash-cta"], button[aria-label="Enter 3D scene"]').first()
        await explore.waitFor({ state: 'visible', timeout: 40000 })
        await explore.click()

        await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 15000 })
        await page.waitForTimeout(1500)

        // Dismiss first-visit help dialog if auto-opened.
        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(300)
        }

        // Pre-condition: dialog is closed.
        const closedBefore = await page.evaluate(() => {
            const d = document.querySelector('dialog.help-dialog')
            return d ? !d.open : true
        })
        expect(closedBefore, 'pre-condition: help dialog must be closed before the ? click').toBe(true)

        // Click the ? button to re-open.
        const helpBtn = page.locator('#btn-app-help').first()
        await helpBtn.waitFor({ state: 'attached', timeout: 5000 })
        await helpBtn.click()
        await page.waitForTimeout(500)

        // The fix: dialog must be OPEN after the click.
        const openAfter = await page.evaluate(() => {
            const d = document.querySelector('dialog.help-dialog')
            return d ? d.open : false
        })
        expect(openAfter, '? button must re-open the help dialog after dismissal (W48 fix)').toBe(true)
    })

    test('5m. W51-C4: camera controls toolbar supports roving tabindex + arrow-key navigation', async ({ page }) => {
        // W51 audit: the camera-controls toolbar had role="toolbar" and
        // tabindex="0" but NO arrow-key handler, so keyboard users had to Tab
        // through all 5 buttons individually instead of using Arrow keys to
        // move within the toolbar (WAI-ARIA toolbar pattern). The fix adds
        // roving tabindex + Arrow/Home/End navigation.
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const explore = page.locator('[data-testid="splash-cta"], button[aria-label="Enter 3D scene"]').first()
        await explore.waitFor({ state: 'visible', timeout: 40000 })
        await explore.click()
        await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 15000 })
        await page.waitForTimeout(1500)

        // Dismiss first-visit help dialog if auto-opened (steals focus).
        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(300)
        }

        const toolbar = page.locator('#camera-controls')
        await expect(toolbar).toHaveAttribute('role', 'toolbar')
        // Roving tabindex: container has tabindex=-1 (not a tab stop); one
        // button holds the roving tabindex=0 tab stop.
        await expect(toolbar).toHaveAttribute('tabindex', '-1')

        const buttons = toolbar.locator('button.control-btn')
        await expect(buttons).toHaveCount(5)

        // Exactly one button should be the tab stop (tabindex=0).
        const tabStops = await page.evaluate(() =>
            Array.from(document.querySelectorAll('#camera-controls button.control-btn')).filter(
                (b) => b.getAttribute('tabindex') === '0'
            )
        )
        expect(tabStops.length, 'exactly one button holds the roving tab stop').toBe(1)

        // Focus the toolbar's first button and drive arrow-key navigation.
        const labels = await page.evaluate(() =>
            Array.from(document.querySelectorAll('#camera-controls button.control-btn')).map((b) =>
                b.getAttribute('aria-label')
            )
        )
        await page.focus('#camera-controls button.control-btn:first-child')
        await expect(page.locator('*:focus')).toHaveAttribute('aria-label', labels[0])

        // ArrowRight should move focus to the next button.
        await page.keyboard.press('ArrowRight')
        await expect(page.locator('*:focus')).toHaveAttribute('aria-label', labels[1])

        // End should jump to the last button (Share link).
        await page.keyboard.press('End')
        await expect(page.locator('*:focus')).toHaveAttribute('aria-label', labels[4])

        // Home should jump back to the first button (Zoom in).
        await page.keyboard.press('Home')
        await expect(page.locator('*:focus')).toHaveAttribute('aria-label', labels[0])

        // ArrowLeft should wrap to the last button.
        await page.keyboard.press('ArrowLeft')
        await expect(page.locator('*:focus')).toHaveAttribute('aria-label', labels[4])
    })

    test('W51-B1: FocusPocket A11y list shows correct per-node roles and color dots', async ({ page }) => {
        // Regression: applyLocalNeighborhoodFocus geometric-fallback branch
        // used per-index setters that bypassed the focusStore mirror, so all
        // pocket nodes appeared as role="support" in the A11y list.
        // This test verifies the list items have the correct role labels.
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const explore = page.locator('[data-testid="splash-cta"], button[aria-label="Enter 3D scene"]').first()
        await explore.waitFor({ state: 'visible', timeout: 40000 })
        await explore.click()

        await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, {
            timeout: 15000
        })
        await page.waitForTimeout(700)

        // Trigger focus via the nav-actions bridge.
        const ok = await page.evaluate(() => {
            const actions = window.__navActions__
            return actions && typeof actions.focusOnNode === 'function' ? actions.focusOnNode(0) : false
        })
        expect(ok, 'focusOnNode(0) must succeed').toBe(true)

        // Wait for the focus-pocket A11y list to populate.
        await page.waitForSelector('#focus-pocket-a11y li[role="button"]', { timeout: 5000 })

        const items = await page.$$eval('#focus-pocket-a11y li[role="button"]', (lis) =>
            lis.map((li) => ({
                label: li.querySelector('.label')?.textContent || '',
                role: li.querySelector('.role-dot')?.getAttribute('data-role') || '',
                ariaLabel: li.getAttribute('aria-label') || ''
            }))
        )

        expect(items.length, 'focus pocket A11y list must contain at least one item').toBeGreaterThan(0)

        // Every item must have a clearly declared role (WCAG 4.1.2).
        items.forEach((item) => {
            expect(item.ariaLabel).toBeTruthy()
            expect(['direct', 'support', 'civic'], `unknown role '${item.role}'`).toContain(item.role)
        })

        // Defensive regression: if ALL items were "support", the old bug is back.
        const nonSupportCount = items.filter((i) => i.role !== 'support').length
        expect(
            nonSupportCount,
            `focus-pocket A11y should contain a mix of roles, got all "support"; ${items.map((i) => `${i.label} (${i.role})`).join(', ')}`
        ).toBeGreaterThanOrEqual(1)
    })

    test('W51-city-dropdown: All Cities shows real count, no garbage values, dedup case variants', async ({ page }) => {
        // W51 audit #6 + #9. After data hydration, the city filter dropdown
        // must (1) show "All Cities (8406)", not "(0)" or "(loading…)",
        // (2) drop garbage entries (street addresses, ZIPs, unmatched parens),
        // (3) dedupe case variants (Cut And Shoot + Cut and Shoot → 1 entry).
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const explore = page.locator('[data-testid="splash-cta"], button[aria-label="Enter 3D scene"]').first()
        await explore.waitFor({ state: 'visible', timeout: 40000 })
        await explore.click()

        await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 15000 })
        await page.waitForTimeout(1500)

        const citySelect = page.locator('#city-filter')
        await citySelect.waitFor({ state: 'attached', timeout: 5000 })

        // First option must say "All Cities (8406)" — the full record count
        await expect(citySelect).toBeEnabled()
        const firstOptionText = await citySelect.locator('option').first().textContent()
        expect(firstOptionText.trim()).toMatch(/^All Cities \(8406\)$/)

        // No garbage entries (street addresses, ZIPs, malformed parens)
        const allOptionTexts = await citySelect.locator('option').allTextContents()
        // Strip the " (count)" suffix from each option, then check the remaining
        // city label for garbage patterns. The dropdown entries follow "<city> (<count>)",
        // so we split on the last ' (' to isolate the city label.
        const cityLabels = allOptionTexts
            .map((t) => t.replace(/^All Cities.*$/, '').trim())
            .filter((t) => t.length > 0)
            .map((t) => {
                const lastParen = t.lastIndexOf(' (')
                return lastParen >= 0 ? t.slice(0, lastParen) : t
            })
        // Garbage: starts with digit (ZIP/address), contains digit-letter mix
        // (street address like "13070 S. HWY 242"), or has unmatched parens
        const garbagePattern = /^\d|\d+\s+[A-Z]|\b[A-Z]+\s+\d+\b|[A-Za-z]\d{2,}/
        const unmatchedParen = (s) => (s.match(/\(/g) || []).length !== (s.match(/\)/g) || []).length
        const garbageEntries = cityLabels.filter((c) => garbagePattern.test(c) || unmatchedParen(c))
        expect(garbageEntries, `Found garbage city values: ${garbageEntries.join(', ')}`).toHaveLength(0)

        // Dedup case variants: 'Cut And Shoot' (any case) should appear exactly once.
        // Dropdown format is "<city> (<count>)" — match the city name portion only.
        const cutAndShootEntries = allOptionTexts.filter((t) => /^cut and shoot \(\d/i.test(t))
        expect(
            cutAndShootEntries.length,
            `Cut And Shoot case-dedup (got ${cutAndShootEntries.length}: ${cutAndShootEntries.join(', ')})`
        ).toBeGreaterThanOrEqual(1)
        expect(cutAndShootEntries.length, `Cut And Shoot must be deduped to ≤1 entry`).toBeLessThanOrEqual(1)

        // Coldspring / Cold Spring dedup — accept either spacing/case variant
        const coldSpringEntries = allOptionTexts.filter((t) => /^cold ?spring \(\d/i.test(t))
        expect(
            coldSpringEntries.length,
            `Cold Spring dedup (got ${coldSpringEntries.length}: ${coldSpringEntries.join(', ')})`
        ).toBeLessThanOrEqual(1)
        expect(coldSpringEntries.length, `Cold Spring must appear at least once`).toBeGreaterThanOrEqual(1)
    })

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

    test('W51-mode-chip-locked-aria-label: locked mode radios have descriptive aria-label', async ({ page }) => {
        // W51 audit #10. Locked mode chips (Trail/Focus/Inside) must have
        // an aria-label that explains WHY they're locked, not just "Trail".
        // The SVG lock indicator is aria-hidden=true so screen readers
        // should hear a descriptive label, not "lock" or U+1F512.
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        const explore = page.locator('[data-testid="splash-cta"], button[aria-label="Enter 3D scene"]').first()
        await explore.waitFor({ state: 'visible', timeout: 40000 })
        await explore.click()
        await page.waitForTimeout(1000)

        // Get the trail/focus/inside chips' aria-labels (locked state)
        for (const mode of ['trail', 'focus', 'inside']) {
            const chip = page.locator(`#mode-chips [data-mode="${mode}"]`)
            await chip.waitFor({ state: 'attached', timeout: 5000 })
            const ariaLabel = await chip.getAttribute('aria-label')
            expect(ariaLabel, `${mode} chip aria-label`).not.toBeNull()
            expect(ariaLabel.toLowerCase(), `${mode} chip aria-label must mention "lock"`).toContain('lock')
            expect(ariaLabel.toLowerCase(), `${mode} chip aria-label must mention "select"`).toContain('select')
        }
    })

    test('W51-demo-auto-cancel: user interaction during auto-demo dismisses the choreography', async ({ page }) => {
        // W51 audit #4 (M3). The 10-phase auto-demo runs for ~41 seconds
        // and ends with a "Now explore your way" caption that would normally
        // linger for 3 more seconds. If the user clicks a 3D dot during
        // the demo, markInteraction() should call cancelDemo() so the
        // caption clears immediately.
        //
        // ?demo=force bypasses the demo-session/eligibility guards so the
        // choreography starts immediately after the splash dismisses.
        await page.setViewportSize({ width: 1440, height: 900 })
        // Clear any sessionStorage left over from previous tests (the demo
        // session flag persists across tests in the same browser context).
        await page.context().clearCookies()
        await page.goto(`${BASE_URL}/dist/svelte/index.html?demo=force`, { waitUntil: 'domcontentloaded' })
        await page.evaluate(() => {
            sessionStorage.clear()
            localStorage.clear()
        })
        await page.reload({ waitUntil: 'domcontentloaded' })

        // Get past the splash
        const explore = page.locator('[data-testid="splash-cta"], button[aria-label="Enter 3D scene"]').first()
        await explore.waitFor({ state: 'visible', timeout: 40000 })
        await explore.click()

        // Wait for the demo choreography box to appear
        const demo = page.locator('#demo-choreography')
        await demo.waitFor({ state: 'visible', timeout: 15000 })

        // Wait for the first demo phase to render — confirms the interaction
        // listeners were attached (they're added in onMount before attemptStart
        // schedules the first transition).
        await page.waitForFunction(
            () => {
                const el = document.querySelector('#demo-choreography')
                return el && el.querySelector('p')?.textContent && el.querySelector('p').textContent.length > 0
            },
            null,
            { timeout: 5000 }
        )

        // Verify the interaction listeners are actually registered on document.
        // DemoChoreography's markInteraction() listens for mousemove/pointerdown/
        // click/keydown/touchstart with capture: true. If they're not there,
        // there's a regression where the listeners were removed.
        const listenersAttached = await page.evaluate(() => {
            // No way to enumerate listeners directly, so check the choreography
            // element is reachable and the demo is active
            return document.querySelector('#demo-choreography') !== null
        })
        expect(listenersAttached, 'demo choreography should be visible before interaction').toBe(true)

        // Simulate user interaction. We dispatch BOTH a real mouse click (via
        // Playwright) AND a synthetic pointerdown on document — the demo's
        // listeners may not be attached yet when the mouse click arrives if
        // there's a race between the demo starting and the listener being
        // registered. The synthetic event guarantees we trigger the listener.
        await page.waitForTimeout(200) // settle
        await page.mouse.move(400, 400)
        await page.mouse.click(400, 400)
        await page.evaluate(() => {
            document.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 400, clientY: 400 }))
            document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 400, clientY: 400 }))
        })

        // The choreography box should disappear within a couple of frames
        await demo.waitFor({ state: 'detached', timeout: 5000 })
    })

    test('W51-category-legend-default-open: legend panel visible on desktop first paint', async ({ page }) => {
        // W51 audit #5. On desktop viewport, the category legend must be
        // visible by default (transform translateX(0)) instead of being
        // hidden off-screen behind the header toggle. The audit found
        // users never opened it because it was off-screen at x=-230.
        //
        // Use ?webgl=1 to bypass the Playwright webdriver → placeholder2d
        // auto-detection (the placeholder path intentionally hides the
        // legend). We're testing the real-user desktop path here.
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&webgl=1`, { waitUntil: 'domcontentloaded' })

        // Wait for hydration + first paint
        await page.waitForTimeout(1500)

        // Find the legend panel and check it's not translated off-screen
        const legend = page.locator('#legend-panel')
        await legend.waitFor({ state: 'attached', timeout: 5000 })

        const result = await legend.evaluate((el) => {
            const r = el.getBoundingClientRect()
            const cs = getComputedStyle(el)
            return {
                open: el.classList.contains('open'),
                ariaHidden: el.getAttribute('aria-hidden'),
                x: Math.round(r.x),
                width: Math.round(r.width),
                transform: cs.transform,
                inViewport: r.x + r.width > 0 && r.x < window.innerWidth
            }
        })

        expect(result.open, 'legend should have .open class on desktop default').toBe(true)
        expect(result.ariaHidden, 'legend should not be aria-hidden when open').not.toBe('true')
        expect(result.inViewport, `legend x=${result.x} width=${result.width} should be in viewport`).toBe(true)
    })
})
