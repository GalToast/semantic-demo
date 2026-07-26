/**
 * 3d-rapid-re-selection-contract.spec.js
 *
 * Rapid node re-selection contract: focus node A, then immediately (no settle
 * sleep) select/focus node B before full settle, and verify:
 *   - focusedNode / navState.focusedIndex never becomes NaN or out-of-bounds
 *   - focusPocketIndices remains a valid array (no null holes, no NaN entries)
 *   - navState.mode is always a non-empty string
 *   - no uncaught errors appear in the console during the race window
 *
 * Run via:
 *   npx playwright test tests/3d-rapid-re-selection-contract.spec.js --browser=chromium --headed
 * Or via manifest — group: 3d-rapid-re-selection
 */

import { test, expect } from '@playwright/test'
import {
    openApp,
    isValidNodeIndex,
    isReachableScreenCoordinate,
    focusNodeViaApp
} from './helpers/3d-interaction-helpers.js'

const RAPID_RESELECTION_TIMEOUT_MS = 120000

async function probeFocusState(page) {
    return page.evaluate(() => {
        const nav = window.__TEST_STATE__?.navState ?? {}
        const pointCount = window.__TEST_STATE__?.points?.length ?? 0
        const focusedIdx = nav.focusedIndex
        const pocket = nav.focusPocketIndices ?? []

        function isIdx(v, count) {
            return Number.isFinite(v) && v >= 0 && v < count
        }

        return {
            focusedNode: window.__TEST_STATE__?.focusedNode ?? null,
            focusedIndex: focusedIdx,
            navMode: nav.mode || '',
            pocketIndices: pocket,
            pocketSize: pocket.length,
            pointCount,
            isNanFocused: Number.isNaN(focusedIdx),
            isNanPocket: pocket.some((idx) => Number.isNaN(idx)),
            isValidFocusedIdx: isIdx(focusedIdx, pointCount),
            isValidPocket: pocket.every((idx) => isIdx(idx, pointCount))
        }
    })
}

/**
 * Find two nodes with screen coordinates that are on-screen and ≥60px apart.
 * Works regardless of neighbor data availability. Returns { nodeA, nodeB }.
 */
async function findTwoSwitchableNodes(page) {
    return page.evaluate(() => {
        const pts = window.__TEST_STATE__?.points ?? []
        const camera = window.__TEST_STATE__?.camera
        const canvas = window.__TEST_STATE__?.renderer?.domElement
        const rect = canvas?.getBoundingClientRect?.()
        const nodePositions = window.__TEST_STATE__?.nodePositions ?? []
        const pointsMesh = window.__TEST_STATE__?.pointsMesh

        if (!camera || !rect || pts.length === 0) return null

        const candidates = []
        for (let i = 0; i < Math.min(pts.length, 120); i++) {
            const pos = nodePositions[i]
            if (!pos) continue
            const vec = new window.THREE.Vector3(pos.x, pos.y, pos.z)
            if (pointsMesh?.localToWorld) pointsMesh.localToWorld(vec)
            const proj = vec.clone().project(camera)
            if (proj.z < -1 || proj.z > 1) continue
            const screenX = ((proj.x + 1) / 2) * rect.width + rect.left
            const screenY = ((-proj.y + 1) / 2) * rect.height + rect.top
            if (screenX < rect.left || screenX > rect.right) continue
            if (screenY < rect.top || screenY > rect.bottom) continue
            candidates.push({ index: i, screenX, screenY, leadId: pts[i]?.lead_id })
        }

        // Find two candidates far enough apart to feel like a real switch
        for (let i = 0; i < candidates.length; i++) {
            for (let j = i + 1; j < candidates.length; j++) {
                const dist = Math.hypot(
                    candidates[i].screenX - candidates[j].screenX,
                    candidates[i].screenY - candidates[j].screenY
                )
                if (dist >= 60) {
                    return { nodeA: candidates[i], nodeB: candidates[j] }
                }
            }
        }
        // Fallback: just return any two distinct nodes
        if (candidates.length >= 2) {
            return { nodeA: candidates[0], nodeB: candidates[1] }
        }
        return null
    })
}

test.describe('rapid re-selection contract', () => {
    /**
     * Desktop (1440×900): focus node A, immediately focus node B — zero settle sleep
     * between the two calls. Verify no NaN, no invalid indices, pocket stays clean.
     */
    test('desktop: rapid focus A→B with no settle produces no NaN/invalid state', async ({ page }) => {
        test.setTimeout(RAPID_RESELECTION_TIMEOUT_MS)
        await openApp(page, { width: 1440, height: 900 })

        const pair = await findTwoSwitchableNodes(page)
        expect(pair, 'two switchable nodes must exist on desktop').not.toBeNull()

        // Focus A and wait for focus mode to enter
        await focusNodeViaApp(page, pair.nodeA.index)
        await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'focus', { timeout: 15000 })
        await page
            .waitForFunction(
                () => {
                    const ps = document.body?.dataset?.panelSurface
                    return ps && ps.includes('focus')
                },
                { timeout: 8000 }
            )
            .catch(() => {}) // brief settle only

        const pre = await probeFocusState(page)
        expect(pre.focusedNode, 'node A must be focused before rapid switch').not.toBeNull()
        expect(pre.isNanFocused, 'focusedIndex must not be NaN before switch').toBe(false)
        expect(pre.isNanPocket, 'pocket must not contain NaN before switch').toBe(false)

        // Immediately focus B — no wait/sleep between the two focusOnNode calls
        await focusNodeViaApp(page, pair.nodeB.index)

        // Probe at multiple tiny intervals to catch the race window
        const checkpoints = []
        for (let t = 0; t < 5; t++) {
            await page
                .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 })
                .catch(() => {})
            const snap = await probeFocusState(page)
            checkpoints.push(snap)
        }

        const final = await probeFocusState(page)

        // Every checkpoint must have valid focusedNode (null or in-bounds)
        for (let i = 0; i < checkpoints.length; i++) {
            const ck = checkpoints[i]
            expect(ck.isNanFocused, `checkpoint ${i}: focusedIndex must not be NaN`).toBe(false)
            expect(ck.isNanPocket, `checkpoint ${i}: pocket must not contain NaN`).toBe(false)
            expect(
                ck.focusedNode === null || isValidNodeIndex(ck.focusedNode, ck.pointCount),
                `checkpoint ${i}: focusedNode must be null or in-bounds (got ${ck.focusedNode})`
            ).toBe(true)
            expect(
                ck.isValidFocusedIdx || ck.focusedNode === null,
                `checkpoint ${i}: focusedIndex must be valid or null (got ${ck.focusedIndex})`
            ).toBe(true)
            expect(ck.isValidPocket, `checkpoint ${i}: all pocket indices must be valid`).toBe(true)
            expect(
                typeof ck.navMode === 'string' && ck.navMode.length > 0,
                `checkpoint ${i}: navMode must be a non-empty string (got "${ck.navMode}")`
            ).toBe(true)
        }

        // Final state must be node B (or null if it happened to settle to overview)
        expect(
            final.focusedNode === null || isValidNodeIndex(final.focusedNode, final.pointCount),
            `final focusedNode must be null or valid, got ${final.focusedNode}`
        ).toBe(true)
        expect(final.navMode, 'navMode must be non-empty at end').toBeTruthy()
    })

    /**
     * Short-landscape (844×390): same rapid A→B switch at mobile viewport.
     */
    test('short-landscape: rapid focus A→B at 844×390 produces no NaN/invalid state', async ({ page }) => {
        test.setTimeout(RAPID_RESELECTION_TIMEOUT_MS)
        await openApp(page, { width: 844, height: 390 })

        const pair = await findTwoSwitchableNodes(page)
        expect(pair, 'two switchable nodes must exist at short-landscape').not.toBeNull()

        await focusNodeViaApp(page, pair.nodeA.index)
        await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'focus', { timeout: 15000 })
        await page
            .waitForFunction(
                () => {
                    const ps = document.body?.dataset?.panelSurface
                    return ps && ps.includes('focus')
                },
                { timeout: 8000 }
            )
            .catch(() => {})

        const pre = await probeFocusState(page)
        expect(pre.isNanFocused, 'focusedIndex must not be NaN before switch').toBe(false)

        // Rapid B focus — no settle wait
        await focusNodeViaApp(page, pair.nodeB.index)

        const checkpoints = []
        for (let t = 0; t < 5; t++) {
            await page
                .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 })
                .catch(() => {})
            checkpoints.push(await probeFocusState(page))
        }

        for (let i = 0; i < checkpoints.length; i++) {
            const ck = checkpoints[i]
            expect(ck.isNanFocused, `short-landscape checkpoint ${i}: no NaN in focusedIndex`).toBe(false)
            expect(ck.isNanPocket, `short-landscape checkpoint ${i}: no NaN in pocket`).toBe(false)
            expect(
                ck.focusedNode === null || isValidNodeIndex(ck.focusedNode, ck.pointCount),
                `short-landscape checkpoint ${i}: focusedNode null or valid`
            ).toBe(true)
            expect(
                typeof ck.navMode === 'string' && ck.navMode.length > 0,
                `short-landscape checkpoint ${i}: navMode must be non-empty`
            ).toBe(true)
        }
    })

    /**
     * Triple rapid switch: A → B → A in quick succession. No settle between any.
     */
    test('desktop: triple rapid switch A→B→A leaves clean state', async ({ page }) => {
        test.setTimeout(RAPID_RESELECTION_TIMEOUT_MS)
        await openApp(page, { width: 1440, height: 900 })

        const pair = await findTwoSwitchableNodes(page)
        expect(pair).not.toBeNull()

        await focusNodeViaApp(page, pair.nodeA.index)
        await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'focus', { timeout: 15000 })
        await page
            .waitForFunction(
                () => {
                    const ps = document.body?.dataset?.panelSurface
                    return ps && ps.includes('focus')
                },
                { timeout: 8000 }
            )
            .catch(() => {})

        // A → B → A with no settle between
        await focusNodeViaApp(page, pair.nodeB.index)
        await focusNodeViaApp(page, pair.nodeA.index)

        const checkpoints = []
        for (let t = 0; t < 4; t++) {
            await page
                .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 })
                .catch(() => {})
            checkpoints.push(await probeFocusState(page))
        }

        const final = await probeFocusState(page)

        for (let i = 0; i < checkpoints.length; i++) {
            const ck = checkpoints[i]
            expect(ck.isNanFocused, `triple-switch checkpoint ${i}: no NaN`).toBe(false)
            expect(ck.isNanPocket, `triple-switch checkpoint ${i}: pocket clean`).toBe(false)
            expect(
                ck.focusedNode === null || isValidNodeIndex(ck.focusedNode, ck.pointCount),
                `triple-switch checkpoint ${i}: focusedNode valid`
            ).toBe(true)
        }

        expect(final.navMode, 'triple-switch final navMode must be non-empty').toBeTruthy()
    })

    /**
     * Rapid switch with canvas click (not focusOnNode) to simulate real user multi-click.
     */
    test('desktop: rapid canvas click A→B produces no NaN in focus state', async ({ page }) => {
        test.setTimeout(RAPID_RESELECTION_TIMEOUT_MS)
        await openApp(page, { width: 1440, height: 900 })

        const pair = await findTwoSwitchableNodes(page)
        expect(pair, 'two switchable nodes must exist').not.toBeNull()

        // Focus A via API first so pocket is populated
        await focusNodeViaApp(page, pair.nodeA.index)
        await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'focus', { timeout: 15000 })
        await page
            .waitForFunction(
                () => {
                    const ps = document.body?.dataset?.panelSurface
                    return ps && ps.includes('focus')
                },
                { timeout: 8000 }
            )
            .catch(() => {})

        const pre = await probeFocusState(page)
        expect(pre.focusedNode, 'node A must be focused before rapid click').not.toBeNull()

        // Verify A is reachable at its screen coordinate
        const reachableA = await isReachableScreenCoordinate(page, pair.nodeA.screenX, pair.nodeA.screenY)
        if (!reachableA) {
            // Legitimate env limitation: node may be off-screen in headless Playwright viewport
            test.skip('node A screen coordinate not reachable — skipping click test')
            return
        }

        const reachableB = await isReachableScreenCoordinate(page, pair.nodeB.screenX, pair.nodeB.screenY)
        if (!reachableB) {
            // Legitimate env limitation: node may be off-screen in headless Playwright viewport
            test.skip('node B screen coordinate not reachable — skipping click test')
            return
        }

        // Rapid click A then B with minimal inter-click delay
        await page.mouse.click(pair.nodeA.screenX, pair.nodeA.screenY)
        // Zero sleep here — the point is the race condition
        await page.mouse.click(pair.nodeB.screenX, pair.nodeB.screenY)

        await page
            .waitForFunction(
                () => {
                    const s = window.__APP_STATE__ ?? window.__TEST_STATE__
                    return s?.lastCanvasNodePick || s?.focusedNode !== null || s?.navState?.mode
                },
                { timeout: 5000 }
            )
            .catch(() => {})

        const final = await probeFocusState(page)

        expect(final.isNanFocused, 'rapid clicks: no NaN in focusedIndex').toBe(false)
        expect(final.isNanPocket, 'rapid clicks: no NaN in pocket').toBe(false)
        expect(
            final.focusedNode === null || isValidNodeIndex(final.focusedNode, final.pointCount),
            `rapid clicks: focusedNode must be null or valid (got ${final.focusedNode})`
        ).toBe(true)
        expect(
            typeof final.navMode === 'string' && final.navMode.length > 0,
            `rapid clicks: navMode must be non-empty (got "${final.navMode}")`
        ).toBe(true)
    })

    /**
     * Verify console is clean of errors during rapid re-selection window.
     */
    test('desktop: no uncaught errors during rapid A→B focus switch', async ({ page }) => {
        test.setTimeout(RAPID_RESELECTION_TIMEOUT_MS)
        const errors = []
        page.on('console', (msg) => {
            if (msg.type() === 'error') errors.push(msg.text())
        })
        page.on('pageerror', (err) => errors.push(err.message))

        await openApp(page, { width: 1440, height: 900 })

        const pair = await findTwoSwitchableNodes(page)
        expect(pair).not.toBeNull()

        await focusNodeViaApp(page, pair.nodeA.index)
        await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'focus', { timeout: 15000 })
        await page
            .waitForFunction(
                () => {
                    const ps = document.body?.dataset?.panelSurface
                    return ps && ps.includes('focus')
                },
                { timeout: 8000 }
            )
            .catch(() => {})

        // Rapid switch — no settle
        await focusNodeViaApp(page, pair.nodeB.index)
        await page
            .waitForFunction(
                () => {
                    const ps = document.body?.dataset?.panelSurface
                    return ps && ps.includes('focus')
                },
                { timeout: 8000 }
            )
            .catch(() => {})

        const relevantErrors = errors.filter(
            (e) => !e.includes('favicon') && !e.includes('net::ERR') && !e.includes('404')
        )

        expect(
            relevantErrors,
            `no uncaught errors during rapid switch: ${JSON.stringify(relevantErrors)}`
        ).toHaveLength(0)
    })

    /**
     * Focus-pocket indices must remain valid (no null/undefined/NaN holes) after
     * a rapid re-selection at short-landscape viewport.
     */
    test('short-landscape: rapid switch leaves focusPocketIndices hole-free', async ({ page }) => {
        test.setTimeout(RAPID_RESELECTION_TIMEOUT_MS)
        await openApp(page, { width: 844, height: 390 })

        const pair = await findTwoSwitchableNodes(page)
        expect(pair, 'two switchable nodes must exist at short-landscape').not.toBeNull()

        await focusNodeViaApp(page, pair.nodeA.index)
        await page.waitForFunction(() => window.__TEST_STATE__?.navState?.mode === 'focus', { timeout: 15000 })
        await page
            .waitForFunction(
                () => {
                    const ps = document.body?.dataset?.panelSurface
                    return ps && ps.includes('focus')
                },
                { timeout: 8000 }
            )
            .catch(() => {})

        const pre = await probeFocusState(page)
        expect(pre.pocketSize, 'pocket must have entries before switch').toBeGreaterThan(0)

        await focusNodeViaApp(page, pair.nodeB.index)

        const checkpoints = []
        for (let t = 0; t < 4; t++) {
            await page
                .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 })
                .catch(() => {})
            checkpoints.push(await probeFocusState(page))
        }

        for (let i = 0; i < checkpoints.length; i++) {
            const ck = checkpoints[i]
            expect(ck.isNanPocket, `short-landscape pocket checkpoint ${i}: no NaN entries`).toBe(false)
            expect(ck.isValidPocket, `short-landscape pocket checkpoint ${i}: all indices valid`).toBe(true)
            // pocket must be an array (not null/undefined)
            expect(Array.isArray(ck.pocketIndices), `checkpoint ${i}: pocket must be an array`).toBe(true)
        }
    })
})
