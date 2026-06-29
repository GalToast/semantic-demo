/**
 * state-harness.js — shared test helper for exploration state snapshots / resets.
 *
 * Design goals:
 *   - Make tests state-owner-aware: snapshot core fields, reset through official
 *     APIs when possible, and only allow direct mutation through named helper
 *     functions with comments explaining fixture setup.
 *   - Avoid direct `(window.__APP_STATE__ ?? window.__TEST_STATE__).X = Y` / `window.__APP_STATE__.X = Y` calls
 *     in test bodies — route them through mutate() so every mutation is named.
 *   - Snapshots are plain frozen objects; they never flow back into real state.
 *
 * State bucket strategy:
 *   - Writes: use __APP_STATE__ as primary, __TEST_STATE__ as fallback.
 *   - Reads in snapshot(): resolve inside the browser context, preferring __APP_STATE__.
 *   - mutate()/reset() use the same bucket resolution inline.
 *   - The fallback to __TEST_STATE__ is intentional — product bridge NOT removed.
 *
 * Usage:
 *   import { snapshot, mutate, reset, SNAPSHOT_FIELDS } from './helpers/state-harness.js';
 *
 *   // Snapshot current state
 *   const s = await snapshot(page, SNAPSHOT_FIELDS.focusAndTrail);
 *
 *   // Mutate with a named operation + comment
 *   await mutate(page, 'injectEmptyGraph', { points: [], nodePositions: [] });
 *
 *   // Reset through official APIs
 *   await reset(page, 'exploration');
 *
 * Snapshot fields are grouped so tests can request exactly what they need:
 *   SNAPSHOT_FIELDS.core        — points, nodePositions, pointIndexByLeadId
 *   SNAPSHOT_FIELDS.focusTrail  — focusedNode, selectedPoint, trailDepth,
 *                                navState.focusedIndex, navState.mode,
 *                                navState.walkHistoryIndices
 *   SNAPSHOT_FIELDS.search      — currentSearchSummary, semanticSearchResultCache,
 *                                semanticLaneState
 *   SNAPSHOT_FIELDS.all         — everything above
 */

export const SNAPSHOT_FIELDS = {
    /** Core graph data — required for edge-case corruption tests. */
    core: ['points', 'nodePositions', 'pointIndexByLeadId'],

    /**
     * Focus and trail navigation state.
     * navState fields are snapshot via dedicated sub-object read to avoid
     * picking up stale cross-test contamination from the same top-level
     * window reference.
     */
    focusTrail: [
        'focusedNode',
        'selectedPoint',
        'trailDepth',
        'navState.focusedIndex',
        'navState.mode',
        'navState.walkHistoryIndices',
        'navState.trailNeighborIndices'
    ],

    /** Semantic search and lane state. */
    search: ['currentSearchSummary', 'semanticSearchResultCache', 'semanticLaneState', 'semanticSearchCacheDiagnostics']
}

/**
 * Read the named fields from the resolved state bucket inside the page.
 * Returns a plain frozen object snapshot — never a live reference.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string[]} fields - list of field paths (dot-notation for nested objects)
 * @returns {Promise<Record<string, unknown>>}
 */
export async function snapshot(page, fields) {
    return page.evaluate((fieldPaths) => {
        const s = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
        const snap = {}
        for (const path of fieldPaths) {
            const parts = path.split('.')
            let value = s
            for (const part of parts) {
                if (value == null) break
                value = value[part]
            }
            // Deep-clone arrays and objects so the snapshot is immutable from the live object
            snap[path] = JSON.parse(JSON.stringify(value))
        }
        Object.freeze(snap)
        return snap
    }, fields)
}

/**
 * Read a single state value from the resolved window state object.
 * Uses __APP_STATE__ as primary and __TEST_STATE__ as fallback.
 * Useful for tests that need one field without hardcoding window globals.
 */
export async function stateField(page, path) {
    const snap = await snapshot(page, [path])
    return snap[path]
}

/**
 * Apply documented state mutations through a named operation.
 * Every call records the operation name and a fixture-setup comment,
 * making the mutation intent self-documenting in test output.
 *
 * State bucket: uses __APP_STATE__ as primary, __TEST_STATE__ as fallback.
 * This helper is the ONLY place direct state writes are allowed — all test-body
 * mutations must route through here so they are named and searchable.
 *
 * Supported operations (each has an inline comment explaining why direct
 * mutation is acceptable here — generally: test fixture setup before the
 * official API is exercised, or the official API does not cover this field):
 *
 *   'injectEmptyGraph'
 *     Sets points and nodePositions to empty arrays.
 *     WHY: Edge-case fixture — simulates zero-node load path.
 *
 *   'injectOneNode'
 *     Truncates points and nodePositions to a single element; clears focusedNode.
 *     WHY: Edge-case fixture — simulates single-node load path.
 *
 *   'injectHugeCluster'
 *     Pushes 3000 synthetic near-identical nodes to stress depth-sort / near-clip.
 *     WHY: Edge-case fixture — no official API for synthetic data injection.
 *
 *   'injectNullPositions'
 *     Nulls out every 3rd nodePositions entry starting at index 1.
 *     WHY: Edge-case fixture — simulates missing vector data.
 *
 *   'injectMalformedSearchCache'
 *     Seeds semanticSearchResultCache with a deliberately corrupt entry.
 *     WHY: Edge-case fixture — no official API for cache corruption.
 *
 *   'setFocusedNode'
 *     Directly writes focusedNode (and optionally navState.focusedIndex).
 *     WHY: Test fixture setup — used before official API (focusOnNode) is the
 *          subject under test, or to inject a known state that official APIs
 *          would derive differently. Prefer the official API wherever feasible.
 *
 *   'clearFocusedNode'
 *     Sets focusedNode = null, navState.focusedIndex = null.
 *     WHY: Test fixture teardown / reset.
 *
 *   'setTrailDepth'
 *     Directly writes trailDepth and navState.mode.
 *     WHY: Test fixture setup — simulates depth escalation before the official
 *          setTrailDepth() gate is the subject under test.
 *
 *   'resetExploration'
 *     Calls resetExplorationFocus() then waits 500 ms.
 *     WHY: Official reset API — use this instead of direct mutation wherever
 *          the official path exists and is sufficient.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} operation - named mutation operation
 * @param {Record<string, unknown>} [extra] - additional fields to set (merged after operation defaults)
 */
export async function mutate(page, operation, extra = {}) {
    await page.evaluate(
        ({ op, patch }) => {
            // Resolve bucket: __APP_STATE__ first, then __TEST_STATE__, then empty object
            /** @type {Record<string,unknown>} */
            let s = window.__APP_STATE__
            if (s == null) s = window.__TEST_STATE__ ?? {}
            if (s == null) s = {}

            switch (op) {
                case 'injectEmptyGraph':
                    // Edge-case fixture: empty graph. Official API does not truncate data.
                    s.points = []
                    s.nodePositions = []
                    break

                case 'injectOneNode':
                    // Edge-case fixture: single isolated node.
                    s.points = s.points?.slice(0, 1) ?? []
                    s.nodePositions = s.nodePositions?.slice(0, 1) ?? []
                    s.focusedNode = null
                    break

                case 'injectHugeCluster': {
                    // Edge-case fixture: 3000 synthetic near-identical nodes.
                    // No official API for synthetic data injection.
                    const base = s.nodePositions?.[0] ?? { x: 0, y: 0, z: 0 }
                    const synthetic = []
                    for (let i = 0; i < 3000; i++) {
                        synthetic.push({
                            x: base.x + (Math.random() - 0.5) * 0.001,
                            y: base.y + (Math.random() - 0.5) * 0.001,
                            z: base.z + (Math.random() - 0.5) * 0.001
                        })
                    }
                    const pointTemplate = s.points?.[0] ?? {}
                    for (let i = 0; i < 3000; i++) {
                        s.points.push({ ...pointTemplate, lead_id: 9000 + i })
                    }
                    s.nodePositions.push(...synthetic)
                    break
                }

                case 'injectNullPositions': {
                    // Edge-case fixture: missing vector data.
                    if (!s.nodePositions?.length) break
                    for (let i = 1; i < s.nodePositions.length; i += 3) {
                        s.nodePositions[i] = null
                    }
                    break
                }

                case 'injectMalformedSearchCache': {
                    // Edge-case fixture: corrupt cache entry.
                    // No official API for cache corruption; this simulates a malformed response.
                    if (!s.semanticSearchResultCache) s.semanticSearchResultCache = new Map()
                    if (!s.semanticSearchCacheDiagnostics) {
                        s.semanticSearchCacheDiagnostics = { hits: 0, misses: 0 }
                    }
                    s.semanticSearchResultCache.set('coffee', {
                        ok: true,
                        count: 2,
                        results: [
                            { lead_id: null, score: NaN, semantic_score: NaN, public_note: undefined },
                            { score: 'not-a-number' }
                        ],
                        cachedAt: Date.now() - 1000
                    })
                    break
                }

                case 'setFocusedNode': {
                    // Test fixture: set focusedNode, selectedPoint, navState.focusedIndex,
                    // and optionally navState.mode together.
                    // Prefer focusOnNode() in real test flow; this is for
                    // test harnesses that need a known starting point before the
                    // official API is exercised.
                    const idx = patch.focusedNode
                    s.focusedNode = idx
                    if (s.navState) s.navState.focusedIndex = idx
                    // Optionally resolve selectedPoint from the current points array
                    if (patch.selectedPointIdx != null && Array.isArray(s.points)) {
                        s.selectedPoint = s.points[patch.selectedPointIdx] ?? null
                    }
                    // Optionally override navState.mode (e.g. 'focus' for search-focus surface)
                    if (patch.navStateMode && s.navState) {
                        s.navState.mode = patch.navStateMode
                    }
                    break
                }

                case 'clearFocusedNode':
                    // Test fixture teardown.
                    s.focusedNode = null
                    if (s.navState) {
                        s.navState.focusedIndex = null
                        s.navState.mode = 'overview'
                    }
                    break

                case 'clearPickEvidence':
                    // Compound teardown: clears canvas pick trace vars + focus state.
                    // WHY: Test instrumentation (trace vars) + application state must be reset
                    //      together to produce a clean slate before assertions.
                    s.lastCanvasNodePick = null
                    s.lastCanvasNodeFocusPick = null
                    s.focusedNode = null
                    if (s.navState) {
                        s.navState.focusedIndex = null
                        s.navState.mode = 'overview'
                    }
                    break

                case 'setTrailDepth': {
                    // Test fixture: set trailDepth and navState.mode together.
                    // Prefer setTrailDepth() in real test flow; this is for
                    // test harnesses that need to simulate depth state before the
                    // official API gate is exercised.
                    const depth = patch.trailDepth ?? s.trailDepth
                    s.trailDepth = depth
                    if (s.navState) {
                        s.navState.mode =
                            patch.navStateMode ?? (depth >= 2 ? 'inside' : depth === 1 ? 'focus' : 'overview')
                    }
                    break
                }

                case 'setLastSuccessfulFetch':
                    // Weather fixture: simulate staleness clock without relying on network timing.
                    s.lastSuccessfulFetch = patch.lastSuccessfulFetch ?? Date.now()
                    break

                case 'resetExploration':
                    // Official reset API — preferred over direct mutation.
                    if (typeof window.resetExplorationFocus === 'function') {
                        window.resetExplorationFocus()
                    }
                    break

                case 'clearLastCanvasPicks':
                    // Test instrumentation: reset canvas-pick trace flags set by app code.
                    // WHY: These are test-only tracking vars, not application state.
                    s.lastCanvasNodePick = null
                    s.lastCanvasNodeFocusPick = null
                    break

                default:
                    throw new Error(`Unknown state-harness mutation operation: ${op}`)
            }
        },
        { op: operation, patch: extra }
    )
}

/**
 * Reset state through official APIs when possible.
 * Falls back to direct mutation only when no official API exists for the field.
 *
 * State bucket: uses __APP_STATE__ as primary, __TEST_STATE__ as fallback.
 *
 * @param {import('@playwright/test').Page} page
 * @param {'exploration' | 'search' | 'deep'} scope
 */
export async function reset(page, scope = 'exploration') {
    await page.evaluate(
        ({ s }) => {
            /** @type {Record<string,unknown>} */
            let state = window.__APP_STATE__
            if (state == null) state = window.__TEST_STATE__ ?? {}
            if (state == null) state = {}

            if (s === 'exploration') {
                // Official API — resets focusedNode, trailDepth, navState.mode to overview.
                if (typeof window.resetExplorationFocus === 'function') {
                    window.resetExplorationFocus()
                } else {
                    // Fallback: direct teardown when the official API is not available.
                    state.focusedNode = null
                    state.selectedPoint = null
                    state.trailDepth = 0
                    if (state.navState) {
                        state.navState.focusedIndex = null
                        state.navState.mode = 'overview'
                        state.navState.walkHistoryIndices = []
                        state.navState.trailNeighborIndices = []
                    }
                }
            } else if (s === 'search') {
                // Official API — clears search summary and input state.
                if (typeof window.clearSearch === 'function') {
                    window.clearSearch()
                } else {
                    state.currentSearchSummary = null
                }
            } else if (s === 'deep') {
                // Full reset: exploration + search + view.
                if (typeof window.resetExperienceState === 'function') {
                    window.resetExperienceState()
                } else if (typeof window.resetExplorationFocus === 'function') {
                    window.resetExplorationFocus()
                }
                state.currentView = 'galaxy'
                state.currentSearchSummary = null
                state.focusedNode = null
                state.selectedPoint = null
                state.trailDepth = 0
                if (state.navState) {
                    state.navState.focusedIndex = null
                    state.navState.mode = 'overview'
                    state.navState.walkHistoryIndices = []
                    state.navState.trailNeighborIndices = []
                    state.navState.trailCursor = -1
                }
            }
        },
        { s: scope }
    )
}
