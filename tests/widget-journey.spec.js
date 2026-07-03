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
})
