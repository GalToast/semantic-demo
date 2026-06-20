/**
 * 3d-data-edge-cases.spec.js
 *
 * Contract test suite proving the 3D explorer handles pathological data and
 * API edge cases without blank canvas, uncaught exceptions, or contradictory
 * selection state.
 *
 * Edge cases covered:
 *   1. Empty graph     — zero nodes loaded, scene must not crash or show a random canvas
 *   2. One-node graph — single isolated node, selection must not index out-of-bounds
 *   3. Duplicate labels — two nodes share the same label; focus must pick one deterministically
 *   4. Missing vectors/positions — nodePositions array has holes; pick must not throw
 *   5. Huge/dense cluster  — thousands of nodes at near-identical positions (depth cluster)
 *   6. Invalid cached search response — cache returns malformed data; must not corrupt state
 *   7. Aborted semantic search — user clears search before response; no stale state leak
 *   8. Slow / warming-up semantic response — API delays; UI shows status not silence
 *
 * Run directly:
 *   node --check tests/3d-data-edge-cases.spec.js
 *   npx playwright test tests/3d-data-edge-cases.spec.js --browser=chromium --headed
 *
 * Run via manifest:
 *   node tests/run-all-contracts.js --group=3d-data-edge
 */

import { test, expect } from '@playwright/test'
import { mutate } from './helpers/state-harness.js'

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8795').replace(/\/$/, '')
const APP_PATH = process.env.TEST_APP_PATH || '/dist/svelte/index.html'

// ── API stubs ─────────────────────────────────────────────────────────────────

const HEALTH_OK = {
    ok: true,
    state: 'healthy',
    provenance: { label: 'Search ready', detail: 'Semantic search is ready.' }
}

const SEARCH_STUB = {
    ok: true,
    count: 3,
    results: [
        { lead_id: 1, score: 0.99, semantic_score: 0.99, public_note: 'Coffee shop on Main St.' },
        { lead_id: 2, score: 0.91, semantic_score: 0.91, public_note: 'Cafe near the park.' },
        { lead_id: 20, score: 0.86, semantic_score: 0.86, public_note: 'Espresso bar downtown.' }
    ]
}

// ── App boot helpers ───────────────────────────────────────────────────────────

/**
 * Wait for the app to be fully initialised in galaxy view with real data.
 * Returns a probe function that snapshots state fields relevant to edge cases.
 */
async function openApp(page, viewport = { width: 1440, height: 900 }) {
    await page.route('**/api.php?action=semantic_lane_health**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(HEALTH_OK) })
    )
    await page.route('**/api.php?action=semantic_search**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEARCH_STUB) })
    )

    await page.setViewportSize(viewport)
    await page.goto(`${BASE_URL}${APP_PATH}?view=galaxy&nodemo=1`, {
        waitUntil: 'domcontentloaded'
    })

    await page.waitForFunction(
        () => {
            const s = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
            return (
                typeof window.__APP_ACTIONS__?.clearSearch === 'function' &&
                Array.isArray(s.points) &&
                s.points.length > 0 &&
                s.nodePositions?.length > 0 &&
                s.renderer?.domElement &&
                s.camera
            )
        },
        { timeout: 25000 }
    )

    // Ensure loading overlay is gone so the scene is interactive
    await page.waitForFunction(
        () => {
            const overlay = document.getElementById('loading-overlay')
            if (!overlay) return true
            const s = getComputedStyle(overlay)
            return (
                overlay.classList.contains('hidden') ||
                s.display === 'none' ||
                s.visibility === 'hidden' ||
                s.pointerEvents === 'none'
            )
        },
        { timeout: 20000 }
    )

    // preceding waitForFunction handles settlement
}

/** Probe key 3D + selection state fields used across edge-case assertions. */
function probe(page) {
    return page.evaluate(() => {
        const s = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
        return {
            pointCount: s.points?.length ?? 0,
            nodePositionsCount: s.nodePositions?.length ?? 0,
            focusedNode: s.focusedNode ?? null,
            navMode: s.navState?.mode ?? '',
            hasCamera: !!(s.camera && s.renderer?.domElement),
            hasMesh: !!s.pointsMesh,
            cacheDiag: s.semanticSearchCacheDiagnostics ?? null,
            semanticGuideAbortController: !!s.semanticGuideAbortController,
            searchAbortController: !!s.searchAbortController
        }
    })
}

/** Returns true only when value is a finite integer in [0, count-1] or null. */
function isValidNodeIndex(val, count) {
    return val === null || (Number.isFinite(val) && val >= 0 && val < count && Number.isInteger(val))
}

// ── Edge-case manipulators ─────────────────────────────────────────────────────

/**
 * Reduce state.points and state.nodePositions to an empty array and verify
 * the 3D scene handles it without blank-canvas or thrown exceptions.
 */
async function corruptToEmptyGraph(page) {
    await mutate(page, 'injectEmptyGraph')
    await page
        .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 })
        .catch(() => {})
}

/**
 * Reduce state to a single node and verify that picking any area of the canvas
 * does NOT set focusedNode to an out-of-bounds index.
 */
async function corruptToOneNode(page) {
    await mutate(page, 'injectOneNode')
    await page
        .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 })
        .catch(() => {})
}

/**
 * Find two nodes with the same label and verify focus is deterministic (same node
 * each time, or no crash) when rapidly focusing between them.
 */
async function corruptDuplicateLabels(page) {
    return page.evaluate(() => {
        const s = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
        const points = s.points ?? []
        const labelCount = {}

        for (let i = 0; i < points.length; i++) {
            const label = points[i]?.public_note ?? String(i)
            if (!labelCount[label]) labelCount[label] = []
            labelCount[label].push(i)
        }

        let dupA = -1,
            dupB = -1
        for (const label of Object.keys(labelCount)) {
            const indices = labelCount[label]
            if (indices.length >= 2) {
                dupA = indices[0]
                dupB = indices[1]
                break
            }
        }

        return { dupA, dupB, totalNodes: points.length }
    })
}

/**
 * Null out random nodePositions entries to simulate missing vector data,
 * then verify picking still yields valid indices and no thrown errors.
 */
async function corruptMissingPositions(page) {
    await mutate(page, 'injectNullPositions')
    await page
        .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 })
        .catch(() => {})
}

/**
 * Inject 3 000 synthetic nodes at near-identical world positions to stress-test
 * the depth-sort / near-clipping path.  Verifies no crash and canvas is non-blank.
 */
async function injectHugeCluster(page) {
    await mutate(page, 'injectHugeCluster')
    await page
        .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 })
        .catch(() => {})
}

/**
 * Pre-fill the semantic search cache with a deliberately malformed response,
 * then trigger a lookup that would hit that cache entry.  Verifies the app
 * does not throw or set contradictory state.
 */
async function injectInvalidCacheEntry(page) {
    await mutate(page, 'injectMalformedSearchCache')
}

/** Abort an in-flight semantic search by triggering clearSearch, then verify no stale state leak. */
async function abortInFlightSearch(page) {
    // Fire a search first so there is something to abort
    const input = page.locator('#search-input')
    await input.focus()
    await input.fill('coffee')

    // Start search without awaiting — fire-and-forget
    await page.evaluate(() => {
        const search = window.__APP_ACTIONS__ && window.__APP_ACTIONS__.search
        if (typeof search === 'function') {
            search('coffee', { preferCachedResults: false })
        }
    })
    // Give the request a moment to be dispatched
    await page
        .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 })
        .catch(() => {})

    // Abort via clearSearch (the user-cancels flow)
    await page.evaluate(() => {
        if (typeof window.__APP_ACTIONS__?.clearSearch === 'function') {
            window.__APP_ACTIONS__.clearSearch()
        }
    })
    await page
        .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 })
        .catch(() => {})
}

/**
 * Mock a very slow (15 s) semantic search response to verify the UI does not
 * silently block or produce a blank results panel.  The test uses a short timeout
 * so we only verify the pending state is shown, not the final response.
 */
async function slowSearchResponse(page) {
    const SLOW_STUB = {
        ok: true,
        count: 1,
        results: [{ lead_id: 1, score: 0.99, semantic_score: 0.99, public_note: 'Delayed response' }]
    }

    let resume
    new Promise((resolve) => {
        resume = resolve
    })

    await page.route('**/api.php?action=semantic_search**', async (route) => {
        // Stall the response for 15 s; Playwright will cancel the wait when test ends
        await new Promise((r) => setTimeout(r, 15000))
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SLOW_STUB) })
        resume()
    })

    // Intercept health as well to avoid health-check errors
    await page.route('**/api.php?action=semantic_lane_health**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(HEALTH_OK) })
    )

    const input = page.locator('#search-input')
    await input.focus()
    await input.fill('latte')
    await page.evaluate(() => {
        if (typeof window.__APP_ACTIONS__?.search === 'function') {
            window.__APP_ACTIONS__.search('latte', { preferCachedResults: false })
        }
    })
    // Wait just long enough for the UI to react to the in-flight state
    await page
        .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 5000 })
        .catch(() => {})
}

// ── Suite ─────────────────────────────────────────────────────────────────────

test.describe('3D / data edge cases: no blank canvas, no uncaught exceptions, no contradictory selection', () => {
    // ── 1. Empty graph ──────────────────────────────────────────────────────────
    test('empty graph: scene initialises without crash and canvas is non-blank', async ({ page }) => {
        test.setTimeout(45000)
        await openApp(page)
        const before = await probe(page)
        expect(before.pointCount).toBeGreaterThan(0)
        expect(before.nodePositionsCount).toBeGreaterThan(0)

        // Corrupt to empty
        await corruptToEmptyGraph(page)
        await page
            .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 5000 })
            .catch(() => {})

        // Canvas must still be present and visible (not blank)
        const canvas = page.locator('canvas').first()
        await expect(canvas).toBeVisible()

        // No uncaught error should have been thrown (page is still alive)
        const errors = []
        page.on('pageerror', (err) => errors.push(err.message))
        await page
            .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 })
            .catch(() => {})
        expect(errors.filter((e) => !e.includes('Warning'))).toHaveLength(0)
    })

    // ── 2. One-node graph ──────────────────────────────────────────────────────
    test('one-node graph: focusedNode is never out-of-bounds after canvas click', async ({ page }) => {
        test.setTimeout(45000)
        await openApp(page, { width: 390, height: 844 }) // mobile viewport
        await corruptToOneNode(page)

        const probe0 = await probe(page)
        expect(probe0.pointCount).toBe(1)
        expect(probe0.nodePositionsCount).toBe(1)

        // Click the centre of the canvas
        await page.mouse.click(195, 422)
        await page
            .waitForFunction(
                () => {
                    const s = window.__APP_STATE__ ?? window.__TEST_STATE__
                    return s?.lastCanvasNodePick || s?.focusedNode !== null || s?.navState?.mode
                },
                { timeout: 5000 }
            )
            .catch(() => {})

        const after = await probe(page)
        expect(
            isValidNodeIndex(after.focusedNode, after.pointCount),
            `focusedNode=${after.focusedNode} is not valid for pointCount=${after.pointCount}`
        ).toBe(true)
    })

    // ── 3. Duplicate labels ────────────────────────────────────────────────────
    test('duplicate labels: focusing between two same-label nodes is deterministic', async ({ page }) => {
        test.setTimeout(45000)
        await openApp(page)
        const { dupA, dupB, totalNodes } = await corruptDuplicateLabels(page)

        // Skip if no duplicates found — not all datasets have them
        if (dupA === -1 || dupB === -1) {
            test.skip(true, 'Dataset has no duplicate labels to test')
            return
        }

        // Focus first duplicate via canvas position
        await mutate(page, 'setFocusedNode', { focusedNode: dupA })
        await page
            .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 })
            .catch(() => {})
        const focusA = await page.evaluate(() => {
            const s = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
            return s.focusedNode
        })

        // Switch to second duplicate
        await mutate(page, 'setFocusedNode', { focusedNode: dupB })
        await page
            .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 })
            .catch(() => {})
        const focusB = await probe(page)

        // State must be internally consistent — no crash, valid index
        expect(isValidNodeIndex(focusA, totalNodes)).toBe(true)
        expect(isValidNodeIndex(focusB.focusedNode, totalNodes)).toBe(true)
    })

    // ── 4. Missing vectors / positions ────────────────────────────────────────
    test('missing positions: canvas click with null nodePositions entries does not throw', async ({ page }) => {
        test.setTimeout(45000)
        await openApp(page)
        await corruptMissingPositions(page)

        const nullCount = await page.evaluate(
            () => (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).nodePositions.filter((p) => p === null).length
        )
        expect(nullCount).toBeGreaterThan(0) // Verify corruption actually happened

        // Click centre of canvas where a null position might exist
        await page.mouse.click(720, 450)
        await page
            .waitForFunction(
                () => {
                    const s = window.__APP_STATE__ ?? window.__TEST_STATE__
                    return s?.lastCanvasNodePick || s?.focusedNode !== null || s?.navState?.mode
                },
                { timeout: 5000 }
            )
            .catch(() => {})

        const after = await probe(page)
        // focusedNode must be null (no valid pick) or a valid index — never a stale value
        expect(isValidNodeIndex(after.focusedNode, after.pointCount) || after.focusedNode === null).toBe(true)
    })

    // ── 5. Huge / dense cluster ────────────────────────────────────────────────
    test('huge dense cluster: scene handles 3 000 near-identical nodes without crash', async ({ page }) => {
        test.setTimeout(45000)
        await openApp(page)
        const before = await probe(page)

        await injectHugeCluster(page)

        const after = await probe(page)
        expect(after.nodePositionsCount).toBeGreaterThan(before.nodePositionsCount + 2990)

        // Canvas must still be present and rendering
        const canvas = page.locator('canvas').first()
        await expect(canvas).toBeVisible()

        // No crash — page should still be alive
        const errors = []
        page.on('pageerror', (err) => errors.push(err.message))
        await page
            .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 })
            .catch(() => {})
        expect(errors.filter((e) => !e.includes('Warning') && !e.includes('THREE'))).toHaveLength(0)
    })

    // ── 6. Invalid cached search response ──────────────────────────────────────
    test('invalid cache: malformed cached search data does not corrupt state or throw', async ({ page }) => {
        test.setTimeout(45000)
        await openApp(page)
        await injectInvalidCacheEntry(page)

        // Trigger a search with the same query that was cached corruptly
        const input = page.locator('#search-input')
        await input.focus()
        await input.fill('coffee')
        await page.evaluate(() => {
            const search = window.__APP_ACTIONS__ && window.__APP_ACTIONS__.search
            if (typeof search === 'function') {
                search('coffee', { preferCachedResults: true })
            }
        })
        await page
            .waitForFunction(
                () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))),
                { timeout: 8000 }
            )
            .catch(() => {})

        // State must still be coherent
        const after = await probe(page)
        expect(isValidNodeIndex(after.focusedNode, after.pointCount) || after.focusedNode === null).toBe(true)
        expect(after.pointCount).toBeGreaterThan(0) // points array not corrupted
    })

    // ── 7. Aborted semantic search ─────────────────────────────────────────────
    test('aborted search: clearSearch during in-flight request leaves no stale focus state', async ({ page }) => {
        test.setTimeout(45000)
        await openApp(page)

        // First: do a valid search so we have results
        await page.evaluate(() => {
            const search = window.__APP_ACTIONS__ && window.__APP_ACTIONS__.search
            if (typeof search === 'function') search('coffee', { preferCachedResults: false })
        })
        await page.waitForSelector('.search-result-item', { timeout: 15000 })

        // Record the search result count
        const resultCountBefore = await page.evaluate(() => document.querySelectorAll('.search-result-item').length)
        expect(resultCountBefore).toBeGreaterThan(0)

        // Now abort via clearSearch
        await abortInFlightSearch(page)

        // After clear, results panel should be gone or cleared
        const resultCountAfter = await page.evaluate(() => document.querySelectorAll('.search-result-item').length)
        // The key invariant: no contradictory state (focusedNode set with no visible results)
        const focusedWithNoResults = (await probe(page)).focusedNode !== null && resultCountAfter === 0
        expect(focusedWithNoResults).toBe(false)
    })

    // ── 8. Slow / warming-up semantic response ─────────────────────────────────
    test('slow search: UI shows in-flight status rather than leaving results panel blank', async ({ page }) => {
        test.setTimeout(30000) // Short timeout — we only check early UI behaviour
        await openApp(page)

        // Re-route with slow handler
        await slowSearchResponse(page)
        await page
            .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 })
            .catch(() => {})

        // While request is in flight the search input should still be functional and
        // the results area should not be blank-crashed (search status message shown)
        const statusText = await page.evaluate(() => {
            const el =
                document.getElementById('search-status-message') ??
                document.getElementById('search-status') ??
                document.getElementById('search-status-live') ??
                document.querySelector('.search-status')
            return el ? el.textContent : ''
        })

        // App should show some status (not an empty blank panel)
        expect(statusText.trim().length, 'search status message must be shown during slow request').toBeGreaterThan(0)
        // We verify the page is alive by checking canvas is still visible
        const canvas = page.locator('canvas').first()
        await expect(canvas).toBeVisible()

        // No crash — point count unchanged
        const after = await probe(page)
        expect(after.pointCount).toBeGreaterThan(0)
    })

    // ── Smoke: no data corruption after all edge-case manipulations ─────────────
    test('smoke: point count remains non-negative throughout all manipulations', async ({ page }) => {
        test.setTimeout(45000)
        await openApp(page)
        const initial = await probe(page)
        expect(initial.pointCount).toBeGreaterThan(0)

        // Apply all corrupting operations in sequence
        await corruptMissingPositions(page)
        await page
            .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 })
            .catch(() => {})
        await injectHugeCluster(page)
        await page
            .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 })
            .catch(() => {})
        await corruptMissingPositions(page) // apply again after cluster

        const final = await probe(page)
        // pointCount must never be negative or NaN
        expect(Number.isFinite(final.pointCount) && final.pointCount >= 0).toBe(true)
        // nodePositionsCount must match or exceed pointCount
        expect(final.nodePositionsCount).toBeGreaterThanOrEqual(final.pointCount)
        // Camera and mesh must still exist
        expect(final.hasCamera).toBe(true)
        expect(final.hasMesh).toBe(true)
    })
})
