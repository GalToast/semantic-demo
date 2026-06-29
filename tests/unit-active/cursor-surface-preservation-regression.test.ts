import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * @vitest-environment jsdom
 *
 * Regression for tmp/w15-body-attr-gap-2026-06-17.md.
 *
 * The `focusOnNode` orchestrator in `src/lib/engine/camera-choreography/cursor.ts`
 * is invoked by `SearchResults.svelte::handleResultClick` AFTER the
 * SEARCH_FOCUS_REQUESTED subscriber has correctly set
 * `navStore.mode='focus'` and `navStore.surface='focus-search'`. Without the
 * fix, `focusOnNode` calls `dispatchNavTransition(FOCUS_NODE, { index, … })`
 * WITHOUT a `surface` field, and `dispatchNavTransition`'s FOCUS_NODE branch
 * defaults `surface` to `'focus'`. That clobbers the search context and leaves
 * the body data-attrs (panelSurface, navSurface, mode) reading as
 * "idle" / "overview" instead of "focus-search" / "focus".
 *
 * The fix forwards `surface: options.fromSearchResult ? 'focus-search' : 'focus'`
 * to `dispatchNavTransition`. These tests lock that contract so future
 * refactors can't silently reintroduce the clobber.
 */

// ── Hoisted mock appState ───────────────────────────────────────────────────

const _appState = vi.hoisted(() => ({
    // focusOnNode reads `appState.points` to validate the index. Three
    // placeholder points are enough for index 0/1/2.
    points: [{ id: 0 }, { id: 1 }, { id: 2 }],
    // focusOnNode reads `appState.navState?.mode` to decide whether to set
    // myceliumMode='trail'. Default mode='overview' so the branch is skipped.
    // Other focus.svelte.ts machinery reads focusPocketIndices, focusPocketMeta,
    // and focusPocketRoleByIndex — provide them as empty containers so the
    // module-init code in src/lib/stores/focus.svelte.ts can iterate without
    // throwing.
    navState: {
        mode: 'overview',
        focusPocketIndices: [] as any[],
        focusPocketMeta: null as any,
        focusPocketRoleByIndex: new Map<number, string>()
    },
    selectedPoint: null as any,
    hoverHighlightIndex: -1,
    pinnedThreadIndex: null as number | null,
    trailDepth: 0,
    myceliumMode: 'dormant',
    // src/lib/stores/focus.svelte.ts reads multiple sub-structures off appState
    // during module-init; provide safe empty defaults so iteration doesn't throw.
    inspectedStrandDiagnostics: {
        active: false,
        source: 'none',
        segmentCount: 0,
        braidCount: 0,
        endpointCount: 0
    },
    inspectedThreadIndex: null as number | null,
    threadInspectorPointerInside: false,
    focusOrbitSlackState: { phase: 'idle', reason: null },
    // focusOnNode wraps its first state mutation in `appState.withMutation()`.
    withMutation: (fn: () => unknown) => fn(),
    // W11-T4 partition sub-records — production reads these at module-init.
    // Without these, search.svelte.ts / viewport.svelte.ts mirrors fail to
    // initialize and break transitive imports (compass-controller et al.).
    searchState: {
        currentSearchSummary: null,
        searchStatus: 'idle' as const,
        searchError: null,
        searchRequestSequence: 0,
        searchAnchorIndex: null,
        searchPreviewIndex: null,
        searchGlowIndices: new Set<number>(),
        searchGlowTopIndex: null,
        searchGlowActive: false,
        searchFocusTransitionToken: 0,
        isSearching: false,
        currentEmptyQuery: null,
        semanticTrailCue: 'idle' as const,
        isCompactViewport: false,
        semanticGuideRequestSequence: 0,
        currentSemanticGuide: null,
        summaryCardTypeToken: 0,
        semanticSearchCacheDiagnostics: {
            hits: 0, misses: 0, stores: 0, evictions: 0,
            lastKey: null, lastSource: null, lastAgeMs: null
        },
        semanticSearchResultCache: new Map(),
        searchVisibleCount: 5
    },
    viewportState: {
        viewportWidth: 1280,
        viewportHeight: 800,
        isCompactViewport: false,
        isMobileViewport: false,
        isTabletViewport: false,
        devicePixelRatio: 1
    },
    focusState: {
        selectedPoint: null,
        inspectedThreadIndex: null,
        pinnedThreadIndex: null,
        threadInspectorPointerInside: false,
        pocketMotionByIndex: new Map(),
        pocketTransitionStartedAt: 0,
        infoPanelOpen: true,
        pocketListVisible: false,
        pocketRoleFilter: 'all' as const,
        focusTransitionMode: 'idle' as const,
        focusTransitionStartedAt: 0,
        nodesAreSettling: false,
        inspectedStrandDiagnostics: {
            active: false, source: '', index: null, focusedIndex: null,
            segmentCount: 0, braidCount: 0, endpointCount: 0
        }
    }
}))

// ── Capture every dispatchNavTransition call ────────────────────────────────

const _dispatchedPayloads = vi.hoisted(() => [] as Array<{ action: string; payload: any }>)

// ── Mutable current-surface (W15+ surface-preservation case) ───────────────
//
// cursor.ts::focusOnNode now reads currentSurface() from
// @lib/stores/navigation.svelte to preserve 'focus-search' across
// canvas/traversal/breadcrumb/thread-inspector call sites. The hoisted
// ref lets per-test cases set the value the mock returns.

const _currentSurface = vi.hoisted(() => ({ value: 'idle' as string }))

// ── Stub modules that focusOnNode touches at import time or runtime ─────────

vi.mock('@lib/state/app.svelte.ts', () => ({
    appState: _appState
}))

vi.mock('@lib/utils/environment', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@lib/utils/environment')>()
    return {
        ...actual,
        isMobile: () => false
    }
})

vi.mock('@lib/engine/map-state', () => ({
    refreshMapRouteEmbodiment: () => {}
}))

vi.mock('@lib/engine/journey-compass-controller-bridge', () => ({
    updateJourneyCompass: () => {}
}))

// cursor.ts::focusOnNode calls currentSurface() to preserve the existing
// 'focus-search' surface when the new focus call doesn't originate from
// search (canvas click, thread traversal, breadcrumb, thread inspector).
// The hoisted _currentSurface ref lets each test set the value returned.
// We use importOriginal to keep all other navigation.svelte exports
// (setMyceliumMode, updateNavState, etc.) for transitive consumers like
// stores/lifecycle.ts.
vi.mock('@lib/stores/navigation.svelte', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@lib/stores/navigation.svelte')>()
    return {
        ...actual,
        currentSurface: () => _currentSurface.value
    }
})

vi.mock('@lib/orchestration/lifecycle', () => ({
    dispatchNavTransition: (action: string, payload: any) => {
        _dispatchedPayloads.push({ action, payload })
        return { ok: true, previousMode: 'overview', nextMode: payload?.mode ?? 'focus' }
    },
    refreshCompositionState: () => {},
    NAV_TRANSITION_ACTIONS: { FOCUS_NODE: 'FOCUS_NODE' },
    setTrailDepth: () => {},
    setMyceliumMode: () => {},
    updateExplorationUi: () => {},
    syncSearchStatusForFocus: () => {},
    focusOnPoint: () => {}
}))

vi.mock('@lib/journey/semantic-dive', () => ({
    syncSemanticDiveUi: () => {}
}))

vi.mock('@lib/orchestration/event-bus', () => ({
    publish: () => {},
    subscribe: () => () => {},
    EVENTS: {
        CAMERA_MOVED: 'CAMERA_MOVED',
        CAMERA_NODE_FOCUSED: 'CAMERA_NODE_FOCUSED',
        URL_SYNC_REQUESTED: 'URL_SYNC_REQUESTED'
    }
}))

vi.mock('../camera-controls-core', () => ({
    clearRouteExploration: () => {}
}))

vi.mock('@lib/utils/focus-panel-mode', () => ({
    setFocusPanelMode: () => {},
    FOCUS_PANEL_MODE: { FIELD_NODE: 'field-node' }
}))

vi.mock('./focus', () => ({
    animateCameraToNode: () => {}
}))

// Mirror the `@lib/state/state-types` and `@lib/types/state` type imports —
// `vi.mock` is a no-op for type-only imports, but the `@lib/types/state`
// resolve still has to land so the .ts file's import line compiles.
vi.mock('@lib/state/state-types', () => ({}))

// ── Imports (must appear AFTER vi.mock) ──────────────────────────────────────

import { focusOnNode } from '@lib/engine/camera-choreography/cursor.ts'

// ── Helpers ─────────────────────────────────────────────────────────────────

function focusNodeCall() {
    return _dispatchedPayloads.find((p) => p.action === 'FOCUS_NODE')
}

function resetCallLog() {
    _dispatchedPayloads.length = 0
}

function setCurrentSurface(value: string): void {
    _currentSurface.value = value
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('focusOnNode surface preservation (W15 body-attr-gap regression)', () => {
    beforeEach(() => {
        resetCallLog()
    })

    it('passes surface: "focus-search" to dispatchNavTransition when fromSearchResult is true', () => {
        // Synthetic appState.withMutation stub returns undefined; the code
        // reads from appState.selectedPoint which is null then sets it.
        const ok = focusOnNode(0, { fromSearchResult: true })
        expect(ok).toBe(true)

        const call = focusNodeCall()
        expect(call, 'focusOnNode must dispatch NAV_TRANSITION_ACTIONS.FOCUS_NODE').toBeDefined()
        expect(call!.payload.surface).toBe('focus-search')
    })

    it('passes surface: "focus" when fromSearchResult is omitted (default canvas/trail behavior)', () => {
        const ok = focusOnNode(0)
        expect(ok).toBe(true)

        const call = focusNodeCall()
        expect(call).toBeDefined()
        expect(call!.payload.surface).toBe('focus')
    })

    it('passes surface: "focus" when fromCanvasNode is true (search context not preserved for canvas picks)', () => {
        const ok = focusOnNode(0, { fromCanvasNode: true })
        expect(ok).toBe(true)

        const call = focusNodeCall()
        expect(call).toBeDefined()
        expect(call!.payload.surface).toBe('focus')
    })

    it('passes surface: "focus" when fromTraversal is true (arrow-key traversal stays plain focus)', () => {
        const ok = focusOnNode(0, { fromTraversal: true })
        expect(ok).toBe(true)

        const call = focusNodeCall()
        expect(call).toBeDefined()
        expect(call!.payload.surface).toBe('focus')
    })

    it('forwards the index field to dispatchNavTransition so the focused node is recorded', () => {
        focusOnNode(2, { fromSearchResult: true })

        const call = focusNodeCall()
        expect(call).toBeDefined()
        expect(call!.payload.index).toBe(2)
    })

    it('returns false and does not dispatch when the index is out of bounds', () => {
        const ok = focusOnNode(999, { fromSearchResult: true })
        expect(ok).toBe(false)
        expect(focusNodeCall()).toBeUndefined()
    })

    it('returns false and does not dispatch when the index is negative', () => {
        const ok = focusOnNode(-1, { fromSearchResult: true })
        expect(ok).toBe(false)
        expect(focusNodeCall()).toBeUndefined()
    })

    // ── W15+ surface-preservation (canvas/traversal/breadcrumb/thread-inspector) ──
    //
    // When the user is already in 'focus-search' surface (e.g., just clicked a
    // search result) and then triggers a non-search focus (canvas click,
    // arrow-key traversal, breadcrumb click, thread inspector explore), the
    // focus surface should be preserved as 'focus-search' rather than clobbered
    // to 'focus'. Closes the surface clobber class in
    // tmp/canvas-node-audit-2026-06-17.md (4 HIGH-risk call sites).

    it('preserves focus-search surface when fromCanvasNode is true and current surface is focus-search', () => {
        setCurrentSurface('focus-search')
        const ok = focusOnNode(1, { fromCanvasNode: true })
        expect(ok).toBe(true)

        const call = focusNodeCall()
        expect(call).toBeDefined()
        expect(call!.payload.surface).toBe('focus-search')
    })

    it('preserves focus-search surface when fromTraversal is true and current surface is focus-search', () => {
        setCurrentSurface('focus-search')
        const ok = focusOnNode(1, { fromTraversal: true })
        expect(ok).toBe(true)

        const call = focusNodeCall()
        expect(call).toBeDefined()
        expect(call!.payload.surface).toBe('focus-search')
    })

    it('preserves focus-search surface when no source flag is provided and current surface is focus-search', () => {
        setCurrentSurface('focus-search')
        // Mirrors src/lib/journey/focus-ui.ts:368 (breadcrumb click) and
        // src/lib/journey/thread-inspector.ts:491 (thread explore) which call
        // focusOnNode with restoreHistory/fromTraversal but no fromSearchResult.
        const ok = focusOnNode(1, { fromTraversal: true, restoreHistory: true })
        expect(ok).toBe(true)

        const call = focusNodeCall()
        expect(call).toBeDefined()
        expect(call!.payload.surface).toBe('focus-search')
    })

    it('uses focus surface (not focus-search) when current surface is focus and fromCanvasNode is true', () => {
        setCurrentSurface('focus')
        const ok = focusOnNode(1, { fromCanvasNode: true })
        expect(ok).toBe(true)

        const call = focusNodeCall()
        expect(call).toBeDefined()
        expect(call!.payload.surface).toBe('focus')
    })

    it('uses focus surface (not focus-search) when current surface is idle and fromCanvasNode is true', () => {
        setCurrentSurface('idle')
        const ok = focusOnNode(1, { fromCanvasNode: true })
        expect(ok).toBe(true)

        const call = focusNodeCall()
        expect(call).toBeDefined()
        expect(call!.payload.surface).toBe('focus')
    })

    it('fromSearchResult: true still wins over current surface (explicit override)', () => {
        // Even if current surface is 'focus' or 'idle', an explicit
        // fromSearchResult: true should set focus-search. The new logic
        // preserves the existing W15 contract: fromSearchResult is the
        // explicit signal that overrides the current-surface check.
        setCurrentSurface('focus')
        const ok = focusOnNode(1, { fromSearchResult: true })
        expect(ok).toBe(true)

        const call = focusNodeCall()
        expect(call).toBeDefined()
        expect(call!.payload.surface).toBe('focus-search')
    })
})
