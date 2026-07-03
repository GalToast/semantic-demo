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

    test('5j. W48 search-surface polish: no double-bordered input at idle, no cue overlap in focus (regression)', async ({ page }) => {
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
        const idleStyles = await page.evaluate(() => {
            const sc = document.querySelector('.search-container')
            const sw = document.querySelector('.search-results-wrapper')
            const cs = sc ? getComputedStyle(sc) : null
            const ws = sw ? getComputedStyle(sw) : null
            return {
                containerBorder: cs?.borderTopWidth,
                resultsBorder: ws?.borderTopWidth,
            }
        })
        expect(
            idleStyles.containerBorder,
            `.search-container should have border-top-width 0 in panel mode (got ${idleStyles.containerBorder})`
        ).toBe('0px')
        expect(
            idleStyles.resultsBorder,
            `.search-results-wrapper should have border-top-width 0 in panel mode (got ${idleStyles.resultsBorder})`
        ).toBe('0px')

        // ── (b) Focus: search-trail-cue is hidden (regression for W48 cue/trail overlap)
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&q=coffee&record=519`, { waitUntil: 'domcontentloaded' })
        await page.waitForFunction(
            () => document.body.dataset?.panelSurface?.startsWith('focus'),
            null,
            { timeout: 10000 }
        )
        await page.waitForTimeout(1500)

        const focusCueState = await page.evaluate(() => {
            const cue = document.querySelector('#search-trail-cue')
            const jc = document.querySelector('.journey-chrome')
            return {
                panelSurface: document.body.dataset?.panelSurface,
                cueHidden: cue ? cue.hidden || cue.getAttribute('hidden') !== null : true,
                cueRect: cue ? cue.getBoundingClientRect() : null,
                journeyChromeRect: jc ? jc.getBoundingClientRect() : null,
            }
        })
        expect(
            focusCueState.panelSurface?.startsWith('focus'),
            'pre-condition: focus mode must be active for the cue overlap test'
        ).toBe(true)
        expect(
            focusCueState.cueHidden,
            'search-trail-cue must be hidden in focus mode (W48 fix)'
        ).toBe(true)
        // Verify the cue does not occupy visible space (height = 0 when hidden)
        if (focusCueState.cueRect) {
            expect(
                focusCueState.cueRect.height,
                `search-trail-cue should have 0 height when hidden in focus mode (got ${focusCueState.cueRect.height})`
            ).toBe(0)
        }
    })
})
