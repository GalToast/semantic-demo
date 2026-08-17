import { test, expect } from '@playwright/test'
import { setupMockSearch } from './helpers/mock-semantic-search.js'

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8795').replace(/\/$/, '')
const APP_PATH = '/dist/svelte/index.html'

async function openApp(page) {
    await setupMockSearch(page)
    await page.goto(`${BASE_URL}${APP_PATH}?nodemo=1&webgl=1&view=galaxy`)
    await page.waitForFunction(
        () =>
            document.body.dataset.graphicsMode === 'webgl' &&
            Array.isArray(window.__TEST_STATE__?.points) &&
            (window.__APP_STATE__ ?? window.__TEST_STATE__).points.length > 0,
        { timeout: 20000 }
    )
    await page
        .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), {
            timeout: 8000
        })
        .catch(() => {})
}

async function dismissHelpDialogIfOpen(page) {
    const helpDialog = page.locator('dialog.help-dialog[open]')
    if ((await helpDialog.count()) === 0) return
    await page.keyboard.press('Escape')
    await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
}

/**
 * stateProbe() — captures the three-way sync surface:
 *   URL search params  (parsed from location.href)
 *   body.dataset       (DOM reflection of UI state)
 *   window.__TEST_STATE__       (canonical JS state)
 */
async function stateProbe(page) {
    return page.evaluate(() => {
        const url = new URL(location.href)
        const appState = window.__APP_STATE__ ?? window.__TEST_STATE__
        const summary = appState?.searchState?.currentSearchSummary
        return {
            url: location.href,
            params: {
                view: url.searchParams.get('view'),
                q: url.searchParams.get('q'),
                record: url.searchParams.get('record'),
                anchor: url.searchParams.get('anchor'),
                depth: url.searchParams.get('depth'),
                mode: url.searchParams.get('mode'),
                surface: url.searchParams.get('surface')
            },
            body: {
                activeView: document.body.dataset.activeView || '',
                graphContext: document.body.dataset.graphContext || '',
                panelSurface: document.body.dataset.panelSurface || '',
                semanticDive: document.body.dataset.semanticDive || '',
                trailDepth: document.body.dataset.trailDepth || ''
            },
            state: {
                currentView: appState?.currentView || '',
                trailDepth: appState?.trailDepth ?? null,
                semanticDiveMode: appState?.semanticDiveMode ?? null,
                focusedIndex: appState?.navState?.focusedIndex ?? null,
                selectedPoint: appState?.focusState?.selectedPoint
                    ? String(appState.focusState.selectedPoint.lead_id)
                    : null,
                currentSearchSummary: summary
                    ? { query: summary.query, anchorIndex: summary.anchorIndex }
                    : null
            }
        }
    })
}

test.describe('Live URL State Reconstruction', () => {
    /**
     * Q1/Q2/Q3: Load with a full-parameter URL and verify all three layers agree.
     *
     * Params: view=galaxy & q=coffee & record=1 & anchor=1 & depth=2 & surface=inside
     *
     * Expected after init:
     *   - state.trailDepth  = 2  (depth=2 was written by updateUrlState on Step Inside)
     *   - state.semanticDiveMode = true  (derived from trailDepth === 2)
     *   - body.dataset.semanticDive = 'active'
     *   - body.dataset.trailDepth = '2'
     *   - URL depth param   = '2'  (should still be in URL after reconstruction)
     *
     * `surface=inside` is the canonical serialized Step Inside marker. `mode`
     * is reserved for the mycelium mode field and is not the navigation mode.
     */
    test('full-parameter URL reconstructs depth=2 dive mode correctly', async ({ page }) => {
        test.setTimeout(60000)
        await page.setViewportSize({ width: 1440, height: 1000 })
        await openApp(page)

        // Simulate a pre-built shared link from a prior Step Inside session.
        // `surface=inside` is what updateUrlState serializes for the navigation
        // surface; `depth=2` remains an explicit legacy/deep-link depth signal.
        const urlWithParams = `${BASE_URL}${APP_PATH}?nodemo=1&webgl=1&view=galaxy&q=coffee&record=1&anchor=1&depth=2&surface=inside`

        // Reload the page with those params — this is the shared-link restoration path
        await setupMockSearch(page)
        await page.goto(urlWithParams)
        await page.waitForFunction(() => document.body.dataset.graphicsMode === 'webgl', { timeout: 20000 })
        await page.waitForFunction(
            () => window.__TEST_STATE__?.trailDepth === 2 && window.__TEST_STATE__?.semanticDiveMode === true,
            { timeout: 15000 }
        )

        const probe = await stateProbe(page)

        // Canonical state checks
        expect(probe.state.trailDepth).toBe(2)
        expect(probe.state.semanticDiveMode).toBe(true)

        // body.dataset checks
        expect(probe.body.trailDepth).toBe('2')
        expect(probe.body.semanticDive).toBe('active')

        // URL should still contain the canonical dive/depth params after restoration
        expect(probe.params.depth).toBe('2')
        expect(probe.params.surface).toBe('inside')

        // The canonical inside route owns the graph context once the dive is
        // restored, even though it arrived through the focus/search pipeline.
        expect(probe.body.graphContext).toBe('inside')

        // panelSurface should be 'semantic-dive' (dive mode active)
        expect(probe.body.panelSurface).toBe('semantic-dive')

        // Search summary should be restored
        expect(probe.state.currentSearchSummary?.query).toBe('coffee')
    })

    /**
     * Restoration waits through the async search/focus path instead of sampling
     * while the page is still loading. The URL should land on the focused record
     * and activate depth=2 through the lifecycle API.
     */
    test('record focus restoration completes after async search/data load', async ({ page }) => {
        test.setTimeout(60000)
        await page.setViewportSize({ width: 1440, height: 1000 })
        await openApp(page)

        const urlWithParams = `${BASE_URL}${APP_PATH}?nodemo=1&webgl=1&view=galaxy&q=coffee&record=1&anchor=1&depth=2&surface=inside`
        await setupMockSearch(page)
        await page.goto(urlWithParams)

        await page.waitForFunction(
            () =>
                window.__APP_STATE__?.navState?.focusedIndex === 1 &&
                window.__TEST_STATE__?.trailDepth === 2 &&
                window.__TEST_STATE__?.semanticDiveMode === true,
            { timeout: 20000 }
        )

        const probe = await stateProbe(page)

        expect(probe.state.focusedIndex).toBe(1)
        expect(probe.body.semanticDive).toBe('active')
    })

    /**
     * Test orphaned depth: navigate directly to a URL with surface=inside but
     * NO record/anchor. The invalid inside route must fall back to overview and
     * remove the unusable depth marker instead of leaving a dead-end surface.
     */
    test('depth=2 without record anchor is silently ignored', async ({ page }) => {
        test.setTimeout(60000)
        await page.setViewportSize({ width: 1440, height: 1000 })
        await openApp(page)

        // depth=2 without a record/anchor param — no focus anchor exists
        const orphanedUrl = `${BASE_URL}${APP_PATH}?nodemo=1&webgl=1&view=galaxy&depth=2&surface=inside`
        await setupMockSearch(page)
        await page.goto(orphanedUrl)
        await page.waitForFunction(() => document.body.dataset.graphicsMode === 'webgl', { timeout: 20000 })
        await page
            .waitForFunction(
                () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))),
                { timeout: 8000 }
            )
            .catch(() => {})
        await page.waitForFunction(
            () => {
                const url = new URL(location.href)
                return !url.searchParams.has('depth') && !url.searchParams.has('surface')
            },
            { timeout: 8000 }
        )

        const probe = await stateProbe(page)

        // Without a record/anchor, the dive focus chain never fires, so the
        // restore path collapses to a clean overview state.
        expect(probe.state.trailDepth).toBe(0)
        expect(probe.state.semanticDiveMode).toBe(false)
        expect(probe.body.semanticDive).toBe('inactive')
        expect(probe.body.panelSurface).toBe('idle')
        // URL state is canonicalized without the invalid inside/depth route.
        expect(probe.params.depth).toBeNull()
        expect(probe.params.surface).toBeNull()
    })

    /**
     * Q4: Smallest reliable test — back/forward with a search+focus URL.
     * Navigate to a search URL, then use browser back/forward and verify state is restored.
     */
    test('back/forward restores search+focus state after interactive navigation', async ({ page }) => {
        test.setTimeout(90000)
        await page.setViewportSize({ width: 1440, height: 1000 })

        // Step 1: Open app in galaxy view
        await openApp(page)
        await dismissHelpDialogIfOpen(page)

        // Step 2: Do a search — this writes q and anchor to URL
        const input = page.locator('#search-input')
        await input.focus()
        await input.fill('coffee')
        await page.evaluate(() => {
            const el = document.getElementById('search-input')
            el.value = 'coffee'
            el.dispatchEvent(new Event('input', { bubbles: true }))
        })
        try {
            await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 8000 })
        } catch {
            await page.evaluate(() => {
                const fn = window.__navActions__?.search
                if (typeof fn === 'function') fn('coffee')
            })
            await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 15000 })
        }
        await dismissHelpDialogIfOpen(page)
        await page.locator('.search-result-item').first().click()
        await page.waitForFunction(() => Number.isFinite(window.__TEST_STATE__?.focusedNode), { timeout: 15000 })
        await page
            .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 5000 })
            .catch(() => {})

        // Capture the URL after search+focus
        const urlAfterFocus = page.url()
        const paramsAfterFocus = new URL(urlAfterFocus).searchParams
        expect(paramsAfterFocus.get('q')).toBe('coffee')
        expect(paramsAfterFocus.get('anchor')).toBeTruthy()

        // Step 3: Navigate away (simple back to about:blank equivalent)
        await page.goto(`${BASE_URL}${APP_PATH}?nodemo=1&webgl=1&view=galaxy`)
        await page
            .waitForFunction(
                () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))),
                { timeout: 8000 }
            )
            .catch(() => {})

        // Step 4: Navigate back via browser back
        await page.goBack()
        await page.waitForFunction(() => document.body.dataset.graphicsMode === 'webgl', { timeout: 20000 })
        await page
            .waitForFunction(
                () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))),
                { timeout: 8000 }
            )
            .catch(() => {}) // allow full restoration
        await page.waitForFunction(
            () => {
                const appState = window.__APP_STATE__ ?? window.__TEST_STATE__
                return (
                    appState?.searchState?.currentSearchSummary?.query === 'coffee' &&
                    appState?.navState?.focusedIndex != null
                )
            },
            { timeout: 20000 }
        )

        const probe = await stateProbe(page)

        // After back-nav, search summary should be restored
        expect(probe.state.currentSearchSummary?.query).toBe('coffee')
        // And URL params should still be present
        expect(probe.params.q).toBe('coffee')
        expect(probe.params.anchor).toBeTruthy()

        // currentView should be galaxy (not map)
        expect(probe.state.currentView).toBe('galaxy')
        expect(probe.body.activeView).toBe('galaxy')
    })
})
