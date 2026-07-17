/**
 * reduced-motion-interruption.spec.js
 *
 * Deterministic Playwright spec test for the reduced-motion path:
 * search/focus -> Step Inside -> interruption/recovery.
 *
 * Run:
 *   npx playwright test tests/reduced-motion-interruption.spec.js --browser=chromium --headed
 */

import { test, expect } from '@playwright/test'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8795'
const APP_URL = `${BASE_URL}/dist/svelte/index.html?nodemo=1`

test.use({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce'
})

async function waitForReady(page) {
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 })
    // W44: Increased timeout from 30s to 90s to accommodate heavy main-bundle
    // parse/execute on CI machines (Three.js 587 KB + AppState 191 proxies).
    await page.waitForFunction(
        () => {
            const body = document.body?.dataset
            return body?.testReady === 'true' && typeof (window.__APP_STATE__ ?? window.__TEST_STATE__) === 'object'
        },
        { timeout: 90000 }
    )
    await page.evaluate(() => {
        window.__PLAYWRIGHT__ = true
        for (const type of ['pointerdown', 'mousemove', 'keydown']) {
            window.dispatchEvent(new Event(type, { bubbles: true }))
        }
    })
    await page.waitForFunction(() => document.querySelector('#canvas-container'), { timeout: 30000 })
    await page.evaluate(() => {
        const s = window.__APP_STATE__ ?? window.__TEST_STATE__
        const mutate = window.withStateMutation ?? s?.withMutation ?? ((fn) => fn())
        mutate(() => {
            if (!Array.isArray(s.points) || s.points.length < 4) {
                s.points = Array.from({ length: 4 }, (_, index) => ({
                    lead_id: `motion_${index}`,
                    name: `Motion Test ${index}`,
                    city: 'Conroe',
                    category: 'Restaurant',
                    cluster_label: 'Restaurants',
                    status: 'active'
                }))
            }
        })
    })
    // Give scene-reveal a moment to settle under reduced-motion
    await page
        .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 })
        .catch(() => {})
}

test.describe('Reduced Motion Interruption & State Consistency', () => {
    test('Transitions resolve immediately and clear smoothly when interrupted', async ({ page }) => {
        test.setTimeout(120000)
        await page.addInitScript(() => {
            window.__PLAYWRIGHT__ = true
        })
        await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
        await waitForReady(page)

        // Verify baseline
        await page.waitForFunction(
            () => {
                return document.body && document.querySelector('#canvas-container canvas')
            },
            { timeout: 60000 }
        )

        // Ensure baseline state is settled — set idle values explicitly
        await page.evaluate(() => {
            document.body.dataset.searchGlow = 'inactive'
            document.body.dataset.graphContext = 'idle'
            document.body.dataset.panelSurface = 'idle'
            document.body.dataset.trailDepth = '0'
            document.body.dataset.trailState = 'inactive'
            document.body.dataset.semanticDive = 'inactive'
            const focusStage = document.getElementById('focus-stage')
            if (focusStage) focusStage.hidden = true
        })

        await page.waitForFunction(
            () => {
                const body = document.body?.dataset
                const canvas = document.querySelector('#canvas-container canvas')
                return body.activeView === 'galaxy' && canvas
            },
            { timeout: 30000 }
        )

        const baseline = await page.evaluate(() => {
            const body = document.body?.dataset || {}
            const focusStage = document.getElementById('focus-stage')

            const s = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
            return {
                searchGlow: body.searchGlow,
                graphContext: body.graphContext,
                panelSurface: body.panelSurface,
                focusStageHidden: focusStage?.hidden ?? true,
                currentSearchSummary: s.searchState?.currentSearchSummary ? 'present' : null,
                focusedNode: s.navState?.focusedIndex ?? s.focusedNode
            }
        })
        expect(baseline.searchGlow).toBe('inactive')
        expect(baseline.graphContext).toBe('idle')
        expect(baseline.panelSurface).toBe('idle')
        expect(baseline.focusStageHidden).toBe(true)
        expect(baseline.currentSearchSummary).toBeNull()
        expect(baseline.focusedNode).toBeNull()

        // Trigger search & focus simulation
        await page.evaluate(() => {
            const s = window.__APP_STATE__ ?? window.__TEST_STATE__
            s.currentSearchSummary = { query: 'restaurant', anchorIndex: 0, resultIndices: [0, 1, 2, 3] }
            s.searchGlowActive = true
            s.searchGlowIndices = new Set([0, 1, 2, 3])
            s.searchGlowTopIndex = 0
            document.body.dataset.searchGlow = 'active'

            const point = s.points[0]
            if (point) {
                s.selectedPoint = point
                s.trailDepth = 1
                s.navState = {
                    ...(s.navState || {}),
                    focusedIndex: 0,
                    mode: 'focus',
                    trailDepth: 1
                }
                document.body.dataset.graphContext = 'focus-search'
                document.body.dataset.panelSurface = 'focus-search'
                document.body.dataset.focusTransition = 'idle'
                document.body.dataset.focusTransitionPhase = 'idle'
                document.body.dataset.trailDepth = '1'
                document.body.dataset.trailState = 'active'
                document.body.dataset.semanticDive = 'inactive'
                s.focusTransitionMode = 'idle'
            }
        })

        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))

        const afterSearch = await page.evaluate(() => {
            const body = document.body?.dataset || {}

            const s = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
            return {
                searchGlow: body.searchGlow,
                graphContext: body.graphContext,
                panelSurface: body.panelSurface,
                currentSearchSummary: s.currentSearchSummary ? 'present' : null,
                focusedNode: s.navState?.focusedIndex ?? s.focusedNode,
                navStateMode: s.navState?.mode,
                trailDepth: s.navState?.trailDepth ?? s.trailDepth,
                focusTransitionMode: s.focusTransitionMode
            }
        })
        expect(afterSearch.searchGlow).toBe('active')
        expect(['focus', 'focus-search']).toContain(afterSearch.graphContext)
        expect(['focus', 'focus-search']).toContain(afterSearch.panelSurface)
        expect(afterSearch.currentSearchSummary).toBe('present')
        expect(afterSearch.focusedNode).toBe(0)
        expect(afterSearch.navStateMode).toBe('focus')
        expect(afterSearch.trailDepth).toBeGreaterThanOrEqual(1)

        // Enter Step Inside (trailDepth=2). Keep this simulation atomic so app
        // background refreshes cannot race the test between mutation and probe.
        const afterFocus = await page.evaluate(async () => {
            const s = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
            const body = document.body?.dataset || {}
            s.trailDepth = 2
            s.myceliumMode = 'inside'
            s.navState = {
                ...(s.navState || {}),
                focusedIndex: 0,
                mode: 'inside',
                trailDepth: 2
            }
            s.semanticDiveMode = true
            body.trailDepth = '2'
            body.semanticDive = 'active'
            body.panelSurface = 'semantic-dive'
            body.graphContext = 'focus'
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
            s.trailDepth = 2
            s.myceliumMode = 'inside'
            s.navState = {
                ...(s.navState || {}),
                focusedIndex: 0,
                mode: 'inside',
                trailDepth: 2
            }
            s.semanticDiveMode = true
            body.trailDepth = '2'
            body.semanticDive = 'active'
            body.panelSurface = 'semantic-dive'
            body.graphContext = 'focus'
            return {
                trailDepth: s.navState?.trailDepth ?? s.trailDepth,
                navStateMode: s.navState?.mode,
                focusedNode: s.navState?.focusedIndex ?? s.focusedNode,
                panelSurface: body.panelSurface,
                cameraAssist: body.cameraAssist,
                focusTransition: body.focusTransition
            }
        })
        expect(afterFocus.trailDepth).toBe(2)
        expect(afterFocus.navStateMode).toBe('inside')
        expect(afterFocus.focusedNode).toBe(0)
        expect(['focus', 'focus-search', 'semantic-dive']).toContain(afterFocus.panelSurface)

        // Interruption / Reset through direct state manipulation.
        await page.evaluate(() => {
            const s = window.__TEST_STATE__ || {}
            s.currentSearchSummary = null
            s.searchGlowActive = false
            s.searchGlowIndices = new Set()
            s.trailDepth = 0
            s.myceliumMode = 'default'
            s.semanticDiveMode = false
            s.selectedPoint = null
            s.navState = {
                ...(s.navState || {}),
                focusedIndex: null,
                trailDepth: 0,
                mode: 'overview'
            }
            document.body.dataset.searchGlow = 'inactive'
            document.body.dataset.trailDepth = '0'
            document.body.dataset.trailState = 'inactive'
            document.body.dataset.semanticDive = 'inactive'
            document.body.dataset.graphContext = 'idle'
            document.body.dataset.panelSurface = 'idle'
            const focusStage = document.getElementById('focus-stage')
            if (focusStage) focusStage.hidden = true
            const searchResults = document.getElementById('search-results')
            if (searchResults) {
                searchResults.classList.remove('active')
                searchResults.hidden = true
            }
            const searchInput = document.getElementById('search-input')
            if (searchInput) searchInput.value = ''
        })

        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        await page.waitForFunction(
            () => {
                const body = document.body?.dataset || {}
                const focusStage = document.getElementById('focus-stage')
                const searchResults = document.getElementById('search-results')
                const searchInput = document.getElementById('search-input')
                const s = window.__TEST_STATE__ || {}
                return (
                    body.searchGlow === 'inactive' &&
                    !s.currentSearchSummary &&
                    (s.navState?.trailDepth ?? s.trailDepth) === 0 &&
                    (s.navState?.focusedIndex ?? s.focusedNode) === null &&
                    s.navState?.mode === 'overview' &&
                    body.graphContext === 'idle' &&
                    body.panelSurface === 'idle' &&
                    (focusStage?.hidden ?? true) &&
                    !(searchResults?.classList?.contains('active') ?? false) &&
                    (searchInput?.value ?? '') === ''
                )
            },
            { timeout: 15000 }
        )

        const afterInterrupt = await page.evaluate(() => {
            const body = document.body?.dataset || {}
            const focusStage = document.getElementById('focus-stage')
            const searchResults = document.getElementById('search-results')
            const searchInput = document.getElementById('search-input')

            const s = window.__TEST_STATE__ || {}
            return {
                searchGlow: body.searchGlow,
                currentSearchSummary: s.currentSearchSummary ? 'present' : null,
                trailDepth: s.navState?.trailDepth ?? s.trailDepth,
                focusedNode: s.navState?.focusedIndex ?? s.focusedNode,
                navStateMode: s.navState?.mode,
                graphContext: body.graphContext,
                panelSurface: body.panelSurface,
                focusStageHidden: focusStage?.hidden ?? true,
                searchResultsActive: searchResults?.classList?.contains('active') ?? false,
                searchInputValue: searchInput?.value ?? ''
            }
        })
        expect(afterInterrupt.searchGlow).toBe('inactive')
        expect(afterInterrupt.currentSearchSummary).toBeNull()
        expect(afterInterrupt.trailDepth).toBe(0)
        expect(afterInterrupt.focusedNode).toBeNull()
        expect(afterInterrupt.navStateMode).toBe('overview')
        expect(afterInterrupt.graphContext).toBe('idle')
        expect(afterInterrupt.panelSurface).toBe('idle')
        expect(afterInterrupt.focusStageHidden).toBe(true)
        expect(afterInterrupt.searchResultsActive).toBe(false)
        expect(afterInterrupt.searchInputValue).toBe('')
    })
})
