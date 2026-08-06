/**
 * @vitest-environment jsdom
 *
 * Direct coverage for the 624-LOC navigation store at
 * src/lib/stores/navigation.svelte.ts.
 *
 * navStore is the spine of every UI interaction — 30+ exports, 20+ mutation
 * functions, 40 commits of churn over 90 days, and (before this file) ZERO
 * direct unit tests. Per the post-cleanup shittiness audit, this was the
 * most-blast-radius-untested store in the codebase.
 *
 * Coverage axes:
 *   (A) Initial state — navStore starts at default NavState.
 *   (B) Read selectors — every derived getter returns the expected value
 *       for a given state.
 *   (C) Mutation functions — every writer locks in the new state.
 *   (D) NAV_TRANSITION_ACTIONS dispatch — dispatchNavTransition produces
 *       expected state transitions.
 *   (E) updateNavState(patch) merges partial into existing.
 *   (F) resetNavState returns to documented initial state.
 *   (G) bumpUrlStateRestoreToken() increments by 1.
 *   (H) Auto-rotate toggle/suspend/resume behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NavState } from '@lib/types/state'

// ── Hoisted mock handles ────────────────────────────────────────────────────
const mockAppState = vi.hoisted(() => ({
    navState: {
        mode: 'overview',
        surface: 'idle',
        previousSurface: 'idle',
        focusedIndex: null as number | null,
        trailSeedIndex: null,
        trailNeighborIndices: [],
        trailCursor: -1,
        trailDepth: 0,
        walkHistoryIndices: [],
        lastTraversalReason: null,
        threadCandidates: [],
        threadReasonByIndex: new Map(),
        threadSource: '',
        focusPocketIndices: [],
        focusPocketMeta: null,
        focusPocketRoleByIndex: new Map(),
        focusFramingMeta: null,
        currentPersonality: null,
        neighborhoodIndices: [],
        explorationHistoryIndices: [],
        currentView: 'galaxy',
        myceliumMode: 'dormant',
        autoRotate: false,
        autoRotateSuspended: false,
        trailDepthFromExploration: 0,
        sceneRevealActive: false,
        sceneRevealStartedAt: 0,
        loadingPhaseKey: 'records',
        applyingUrlState: false,
        restoringBrowserHistory: false,
        urlStateRestoreToken: 0,
        activeStoryPrompt: null
    } as NavState,
    trailDepth: 0,
    currentView: 'galaxy',
    // The real appState exposes these top-level slices that focus reset
    // writes to directly (see focus.svelte.ts:269).
    inspectedStrandDiagnostics: {
        active: false,
        source: '',
        index: null,
        focusedIndex: null,
        segmentCount: 0,
        braidCount: 0,
        endpointCount: 0
    },
    // focus reset also writes here on the legacy mirror path
    canvasPointerMode: null,
    lastPointerHit: null,
    threadInspectorCleared: false,
    focusPocketLastShownAt: 0,
    threadInspectorResetAt: 0,
    // W11-T4 partition sub-records — Proxy below passes them through.
    searchState: {
        currentSearchSummary: null,
        searchStatus: 'idle',
        searchError: null,
        searchRequestSequence: 0,
        searchAnchorIndex: null,
        searchPreviewIndex: null,
        searchGlowIndices: new Set(),
        searchGlowTopIndex: null,
        searchGlowActive: false,
        searchFocusTransitionToken: 0,
        isSearching: false,
        currentEmptyQuery: null,
        semanticTrailCue: 'idle',
        isCompactViewport: false,
        semanticGuideRequestSequence: 0,
        currentSemanticGuide: null,
        summaryCardTypeToken: 0,
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
        pocketRoleFilter: 'all',
        focusTransitionMode: 'idle',
        focusTransitionStartedAt: 0,
        nodesAreSettling: false,
        inspectedStrandDiagnostics: {
            active: false,
            source: '',
            index: null,
            focusedIndex: null,
            segmentCount: 0,
            braidCount: 0,
            endpointCount: 0
        }
    }
}))

const mockChainFns = vi.hoisted(() => ({
    clearSearch: vi.fn(),
    resetFocus: vi.fn(),
    resetJourney: vi.fn()
}))

// Convenience local refs (defined after vi.mock factories via hoisting)
const mockClearSearch = mockChainFns.clearSearch
const mockResetFocus = mockChainFns.resetFocus
const mockResetJourney = mockChainFns.resetJourney

// ── Module mocks ───────────────────────────────────────────────────────────
vi.mock('@lib/state/app.svelte.ts', () => ({
    appState: new Proxy(mockAppState, {
        get(target, prop) {
            return target[prop as keyof typeof target]
        },
        set(target, prop, value) {
            ;(target as Record<string, unknown>)[prop as string] = value
            return true
        }
    })
}))

vi.mock('@lib/stores/search.svelte.ts', () => ({
    clearSearch: mockChainFns.clearSearch
}))

vi.mock('@lib/stores/focus.svelte.ts', () => ({
    resetFocus: mockChainFns.resetFocus
}))

vi.mock('@lib/stores/journey.svelte.ts', () => ({
    resetJourney: mockChainFns.resetJourney
}))

// ── Import SUT after mocks ───────────────────────────────────────────────────
import {
    navStore,
    NAVIGATION_CONFIG,
    isOverview,
    isExploration,
    hasFocus,
    hasTrail,
    currentMode,
    currentSurface,
    focusedIndex,
    currentView,
    myceliumMode,
    isMapMode,
    loadingPhase,
    resetNavState,
    updateNavState,
    switchView,
    setNavMode,
    setSurface,
    setFocusedIndex,
    setNeighborhoodIndices,
    setExplorationHistoryIndices,
    setAutoRotate,
    suspendAutoRotate,
    resumeAutoRotate,
    setLoadingPhase,
    startSceneReveal,
    completeSceneReveal,
    setSceneRevealActive,
    setMyceliumMode,
    setApplyingUrlState,
    setRestoringBrowserHistory,
    bumpUrlStateRestoreToken,
    setFocusPocketIndices,
    clearFocusPocketIndices,
    setFocusPocketMeta,
    clearFocusPocketMeta,
    writeNavStateMirror,
    getLastCommittedView,
    describeNavDrift,
    dispatchNavTransition
} from '@lib/stores/navigation.svelte.ts'
import { NAV_TRANSITION_ACTIONS } from '@lib/navigation-actions'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Reset module + writable to documented initial state between tests. */
async function freshNavStore() {
    vi.resetModules()
    const mod = await import('@lib/stores/navigation.svelte.ts')
    // Reset mock appState to defaults
    mockAppState.navState = {
        mode: 'overview',
        surface: 'idle',
        previousSurface: 'idle',
        focusedIndex: null,
        trailSeedIndex: null,
        trailNeighborIndices: [],
        trailCursor: -1,
        trailDepth: 0,
        walkHistoryIndices: [],
        lastTraversalReason: null,
        threadCandidates: [],
        threadReasonByIndex: new Map(),
        threadSource: '',
        focusPocketIndices: [],
        focusPocketMeta: null,
        focusPocketRoleByIndex: new Map(),
        focusFramingMeta: null,
        currentPersonality: null,
        neighborhoodIndices: [],
        explorationHistoryIndices: [],
        currentView: 'galaxy',
        myceliumMode: 'dormant',
        autoRotate: false,
        autoRotateSuspended: false,
        trailDepthFromExploration: 0,
        sceneRevealActive: false,
        sceneRevealStartedAt: 0,
        loadingPhaseKey: 'records',
        applyingUrlState: false,
        restoringBrowserHistory: false,
        urlStateRestoreToken: 0,
        activeStoryPrompt: null
    }
    mockAppState.trailDepth = 0
    mockAppState.currentView = 'galaxy'
    return mod
}

// ── Tests ────────────────────────────────────────────────────────────────────

/// Base default nav state object — used in beforeEach to reset both
// the mock appState and the singleton _navWritable.
const DEFAULT_NAV_STATE: NavState = {
    mode: 'overview',
    surface: 'idle',
    previousSurface: 'idle',
    focusedIndex: null,
    trailSeedIndex: null,
    trailNeighborIndices: [],
    trailCursor: -1,
    trailDepth: 0,
    walkHistoryIndices: [],
    lastTraversalReason: null,
    threadCandidates: [],
    threadReasonByIndex: new Map(),
    threadSource: '',
    focusPocketIndices: [],
    focusPocketMeta: null,
    focusPocketRoleByIndex: new Map(),
    focusFramingMeta: null,
    currentPersonality: null,
    neighborhoodIndices: [],
    explorationHistoryIndices: [],
    currentView: 'galaxy',
    myceliumMode: 'dormant',
    autoRotate: false,
    autoRotateSuspended: false,
    trailDepthFromExploration: 0,
    sceneRevealActive: false,
    sceneRevealStartedAt: 0,
    loadingPhaseKey: 'records',
    applyingUrlState: false,
    restoringBrowserHistory: false,
    urlStateRestoreToken: 0,
    activeStoryPrompt: null
}

/**
 * Reset both the mock appState.navState and the singleton _navWritable
 * so each test starts from a known default. This is required because
 * _navWritable is a window-keyed cross-chunk singleton that persists
 * across test cases within the same module.
 */
function resetAllNavState() {
    mockAppState.navState = { ...DEFAULT_NAV_STATE }
    mockAppState.trailDepth = 0
    mockAppState.currentView = 'galaxy'
    // The diagnostics slice mirrors state across resetFocus — keep its
    // shape consistent so resetFocus's downstream writes don't throw.
    mockAppState.inspectedStrandDiagnostics = {
        active: false,
        source: '',
        index: null,
        focusedIndex: null,
        segmentCount: 0,
        braidCount: 0,
        endpointCount: 0
    }
    // Clear mock chain-fn call counters so each test starts at zero
    // (without this, prior tests' calls leak into the next test).
    mockChainFns.clearSearch.mockClear()
    mockChainFns.resetFocus.mockClear()
    mockChainFns.resetJourney.mockClear()
    resetNavState()
}

describe('navStore — initial state', () => {
    beforeEach(() => {
        resetAllNavState()
    })

    it('starts with mode=overview', () => {
        expect(navStore().mode).toBe('overview')
    })

    it('starts with surface=idle', () => {
        expect(navStore().surface).toBe('idle')
    })

    it('starts with focusedIndex=null', () => {
        expect(navStore().focusedIndex).toBeNull()
    })

    it('starts with trailDepth=0', () => {
        expect(navStore().trailDepth).toBe(0)
    })

    it('starts with currentView=galaxy', () => {
        expect(navStore().currentView).toBe('galaxy')
    })

    it('starts with myceliumMode=dormant', () => {
        expect(navStore().myceliumMode).toBe('dormant')
    })

    it('starts with autoRotate=false', () => {
        expect(navStore().autoRotate).toBe(false)
    })

    it('starts with autoRotateSuspended=false', () => {
        expect(navStore().autoRotateSuspended).toBe(false)
    })

    it('starts with sceneRevealActive=false', () => {
        expect(navStore().sceneRevealActive).toBe(false)
    })

    it('starts with loadingPhaseKey=records', () => {
        expect(navStore().loadingPhaseKey).toBe('records')
    })

    it('starts with applyingUrlState=false', () => {
        expect(navStore().applyingUrlState).toBe(false)
    })

    it('starts with restoringBrowserHistory=false', () => {
        expect(navStore().restoringBrowserHistory).toBe(false)
    })

    it('starts with urlStateRestoreToken=0', () => {
        expect(navStore().urlStateRestoreToken).toBe(0)
    })

    it('starts with activeStoryPrompt=null', () => {
        expect(navStore().activeStoryPrompt).toBeNull()
    })

    it('starts with empty trailNeighborIndices', () => {
        expect(navStore().trailNeighborIndices).toEqual([])
    })

    it('starts with empty walkHistoryIndices', () => {
        expect(navStore().walkHistoryIndices).toEqual([])
    })

    it('starts with empty neighborhoodIndices', () => {
        expect(navStore().neighborhoodIndices).toEqual([])
    })

    it('starts with empty explorationHistoryIndices', () => {
        expect(navStore().explorationHistoryIndices).toEqual([])
    })

    it('starts with empty focusPocketIndices', () => {
        expect(navStore().focusPocketIndices).toEqual([])
    })

    it('starts with focusPocketMeta=null', () => {
        expect(navStore().focusPocketMeta).toBeNull()
    })

    it('starts with focusFramingMeta=null', () => {
        expect(navStore().focusFramingMeta).toBeNull()
    })

    it('starts with currentPersonality=null', () => {
        expect(navStore().currentPersonality).toBeNull()
    })

    it('starts with trailCursor=-1', () => {
        expect(navStore().trailCursor).toBe(-1)
    })

    it('starts with previousSurface=idle', () => {
        expect(navStore().previousSurface).toBe('idle')
    })
})

describe('navStore — read selectors', () => {
    beforeEach(() => {
        resetAllNavState()
    })

    it('isOverview() is true when mode=overview', () => {
        navStore.set({ ...navStore(), mode: 'overview' })
        expect(isOverview()).toBe(true)
    })

    it('isOverview() is false when mode=focus', () => {
        navStore.set({ ...navStore(), mode: 'focus' })
        expect(isOverview()).toBe(false)
    })

    it('isOverview() is false when mode=trail', () => {
        navStore.set({ ...navStore(), mode: 'trail' })
        expect(isOverview()).toBe(false)
    })

    it('isExploration() is true when mode=trail', () => {
        navStore.set({ ...navStore(), mode: 'trail' })
        expect(isExploration()).toBe(true)
    })

    it('isExploration() is true when mode=focus', () => {
        navStore.set({ ...navStore(), mode: 'focus' })
        expect(isExploration()).toBe(true)
    })

    it('isExploration() is true when mode=inside', () => {
        navStore.set({ ...navStore(), mode: 'inside' })
        expect(isExploration()).toBe(true)
    })

    it('isExploration() is false when mode=overview', () => {
        navStore.set({ ...navStore(), mode: 'overview' })
        expect(isExploration()).toBe(false)
    })

    it('isExploration() is false when mode=search', () => {
        navStore.set({ ...navStore(), mode: 'search' })
        expect(isExploration()).toBe(false)
    })

    it('hasFocus() is true when focusedIndex is set', () => {
        navStore.set({ ...navStore(), focusedIndex: 42 })
        expect(hasFocus()).toBe(true)
    })

    it('hasFocus() is false when focusedIndex is null', () => {
        navStore.set({ ...navStore(), focusedIndex: null })
        expect(hasFocus()).toBe(false)
    })

    it('hasFocus() is true when mode=focus', () => {
        navStore.set({ ...navStore(), mode: 'focus' })
        expect(hasFocus()).toBe(true)
    })

    it('hasFocus() is true when mode=inside', () => {
        navStore.set({ ...navStore(), mode: 'inside' })
        expect(hasFocus()).toBe(true)
    })

    it('hasTrail() is true when trailDepth>0', () => {
        navStore.set({ ...navStore(), trailDepth: 3 })
        expect(hasTrail()).toBe(true)
    })

    it('hasTrail() is false when trailDepth=0', () => {
        navStore.set({ ...navStore(), trailDepth: 0 })
        expect(hasTrail()).toBe(false)
    })

    it('currentView() returns galaxy by default', () => {
        expect(currentView()).toBe('galaxy')
    })

    it('currentView() returns map after switchView', () => {
        navStore.set({ ...navStore(), currentView: 'map' })
        expect(currentView()).toBe('map')
    })

    it('currentMode() returns overview by default', () => {
        expect(currentMode()).toBe('overview')
    })

    it('currentMode() returns trail after mutation', () => {
        navStore.set({ ...navStore(), mode: 'trail' })
        expect(currentMode()).toBe('trail')
    })

    it('currentSurface() returns idle by default', () => {
        expect(currentSurface()).toBe('idle')
    })

    it('currentSurface() returns focus after mutation', () => {
        navStore.set({ ...navStore(), surface: 'focus' })
        expect(currentSurface()).toBe('focus')
    })

    it('focusedIndex() returns null by default', () => {
        expect(focusedIndex()).toBeNull()
    })

    it('focusedIndex() returns 42 after mutation', () => {
        navStore.set({ ...navStore(), focusedIndex: 42 })
        expect(focusedIndex()).toBe(42)
    })

    it('myceliumMode() returns dormant by default', () => {
        expect(myceliumMode()).toBe('dormant')
    })

    it('myceliumMode() returns active after mutation', () => {
        navStore.set({ ...navStore(), myceliumMode: 'active' })
        expect(myceliumMode()).toBe('active')
    })

    it('isMapMode() is true when currentView=map', () => {
        navStore.set({ ...navStore(), currentView: 'map' })
        expect(isMapMode()).toBe(true)
    })

    it('isMapMode() is false when currentView=galaxy', () => {
        navStore.set({ ...navStore(), currentView: 'galaxy' })
        expect(isMapMode()).toBe(false)
    })

    it('loadingPhase() returns records by default', () => {
        expect(loadingPhase()).toBe('records')
    })

    it('loadingPhase() returns scene after mutation', () => {
        navStore.set({ ...navStore(), loadingPhaseKey: 'scene' })
        expect(loadingPhase()).toBe('scene')
    })
})

describe('navStore — mutation functions', () => {
    beforeEach(() => {
        resetAllNavState()
    })

    it('switchView("map") sets currentView=map', () => {
        switchView('map')
        expect(navStore().currentView).toBe('map')
    })

    it('switchView("galaxy") sets currentView=galaxy', () => {
        switchView('map')
        switchView('galaxy')
        expect(navStore().currentView).toBe('galaxy')
    })

    it('setNavMode("focus") sets mode=focus', () => {
        setNavMode('focus')
        expect(navStore().mode).toBe('focus')
    })

    it('setNavMode("trail") sets mode=trail', () => {
        setNavMode('trail')
        expect(navStore().mode).toBe('trail')
    })

    it('setNavMode("inside") sets mode=inside', () => {
        setNavMode('inside')
        expect(navStore().mode).toBe('inside')
    })

    it('setNavMode("search") sets mode=search', () => {
        setNavMode('search')
        expect(navStore().mode).toBe('search')
    })

    it('setSurface("focus-search") sets surface=focus-search', () => {
        setSurface('focus-search')
        expect(navStore().surface).toBe('focus-search')
    })

    it('setSurface("focus") sets surface=focus and mode=focus', () => {
        setSurface('focus')
        expect(navStore().surface).toBe('focus')
        expect(navStore().mode).toBe('focus')
    })

    it('setSurface("search") sets surface=search and mode=search', () => {
        setSurface('search')
        expect(navStore().surface).toBe('search')
        expect(navStore().mode).toBe('search')
    })

    it('setSurface("inside") sets surface=inside and mode=inside', () => {
        setSurface('inside')
        expect(navStore().surface).toBe('inside')
        expect(navStore().mode).toBe('inside')
    })

    it('setSurface("idle") sets surface=idle and mode=overview', () => {
        setNavMode('focus')
        setSurface('idle')
        expect(navStore().surface).toBe('idle')
        expect(navStore().mode).toBe('overview')
    })

    it('setSurface tracks previousSurface', () => {
        setSurface('focus')
        setSurface('idle')
        expect(navStore().previousSurface).toBe('focus')
    })

    // ── setSurface map-family view coupling (surface-invariant regression) ──
    // Guards the invariant: setSurface derives currentView from the surface's
    // map-family membership. Map-prefixed surfaces must NOT be silently forced
    // back to galaxy (the exact-match `=== 'map'` bug). Existing non-map
    // surface → galaxy coupling is locked, not changed.
    it('setSurface("map") keeps map view after switchView(map) (bridge-paired, map start)', () => {
        switchView('map')
        setSurface('map')
        expect(navStore().currentView).toBe('map')
    })

    it('setSurface("map") derives map view from a galaxy start', () => {
        setSurface('map')
        expect(navStore().currentView).toBe('map')
    })

    it('setSurface("map-trail") no longer forces galaxy from a map start (regression)', () => {
        switchView('map')
        setSurface('map-trail')
        expect(navStore().currentView).toBe('map')
    })

    it('setSurface("map-trail") derives map view from a galaxy start', () => {
        setSurface('map-trail')
        expect(navStore().currentView).toBe('map')
    })

    it('setSurface("map-focus") no longer forces galaxy from a map start (regression)', () => {
        switchView('map')
        setSurface('map-focus')
        expect(navStore().currentView).toBe('map')
    })

    it('setSurface("map-focus") derives map view from a galaxy start', () => {
        setSurface('map-focus')
        expect(navStore().currentView).toBe('map')
    })

    it('setSurface("map-focus-search") no longer forces galaxy from a map start (regression)', () => {
        switchView('map')
        setSurface('map-focus-search')
        expect(navStore().currentView).toBe('map')
    })

    it('setSurface("map-focus-search") derives map view from a galaxy start', () => {
        setSurface('map-focus-search')
        expect(navStore().currentView).toBe('map')
    })

    it('setSurface("focus") still couples to galaxy view from a map start (existing behavior preserved)', () => {
        switchView('map')
        setSurface('focus')
        expect(navStore().currentView).toBe('galaxy')
    })

    it('setSurface("search") still couples to galaxy from a galaxy start (existing behavior preserved)', () => {
        setSurface('search')
        expect(navStore().currentView).toBe('galaxy')
        expect(navStore().mode).toBe('search')
    })

    it('setSurface("idle") still couples to galaxy view (existing behavior preserved)', () => {
        setSurface('idle')
        expect(navStore().currentView).toBe('galaxy')
        expect(navStore().mode).toBe('overview')
    })

    it('setFocusedIndex(42) sets focusedIndex=42', () => {
        setFocusedIndex(42)
        expect(navStore().focusedIndex).toBe(42)
    })

    it('setFocusedIndex(null) resets focusedIndex', () => {
        setFocusedIndex(42)
        setFocusedIndex(null)
        expect(navStore().focusedIndex).toBeNull()
    })

    it('setNeighborhoodIndices([1,2,3]) stores the array', () => {
        setNeighborhoodIndices([1, 2, 3])
        expect(navStore().neighborhoodIndices).toEqual([1, 2, 3])
    })

    it('setNeighborhoodIndices copies the array (not by reference)', () => {
        const arr = [1, 2, 3]
        setNeighborhoodIndices(arr)
        arr.push(4)
        expect(navStore().neighborhoodIndices).toEqual([1, 2, 3])
    })

    it('setExplorationHistoryIndices([10,20]) stores the array', () => {
        setExplorationHistoryIndices([10, 20])
        expect(navStore().explorationHistoryIndices).toEqual([10, 20])
    })

    it('setAutoRotate(false) disables auto-rotate', () => {
        setAutoRotate(false)
        expect(navStore().autoRotate).toBe(false)
    })

    it('setAutoRotate(true) enables auto-rotate', () => {
        setAutoRotate(false)
        setAutoRotate(true)
        expect(navStore().autoRotate).toBe(true)
    })

    it('suspendAutoRotate() sets autoRotateSuspended=true', () => {
        suspendAutoRotate()
        expect(navStore().autoRotateSuspended).toBe(true)
    })

    it('resumeAutoRotate() sets autoRotateSuspended=false', () => {
        suspendAutoRotate()
        resumeAutoRotate()
        expect(navStore().autoRotateSuspended).toBe(false)
    })

    it('setLoadingPhase("scene") sets loadingPhaseKey=scene', () => {
        setLoadingPhase('scene')
        expect(navStore().loadingPhaseKey).toBe('scene')
    })

    it('setLoadingPhase("restore") sets loadingPhaseKey=restore', () => {
        setLoadingPhase('restore')
        expect(navStore().loadingPhaseKey).toBe('restore')
    })

    it('startSceneReveal() sets sceneRevealActive=true', () => {
        startSceneReveal()
        expect(navStore().sceneRevealActive).toBe(true)
    })

    it('startSceneReveal() sets sceneRevealStartedAt>0', () => {
        const before = Date.now()
        startSceneReveal()
        const after = Date.now()
        expect(navStore().sceneRevealStartedAt).toBeGreaterThanOrEqual(before)
        expect(navStore().sceneRevealStartedAt).toBeLessThanOrEqual(after)
    })

    it('completeSceneReveal() sets sceneRevealActive=false', () => {
        startSceneReveal()
        completeSceneReveal()
        expect(navStore().sceneRevealActive).toBe(false)
    })

    it('setSceneRevealActive(true) activates scene reveal', () => {
        setSceneRevealActive(true)
        expect(navStore().sceneRevealActive).toBe(true)
    })

    it('setSceneRevealActive(false) deactivates scene reveal', () => {
        startSceneReveal()
        setSceneRevealActive(false)
        expect(navStore().sceneRevealActive).toBe(false)
    })

    it('setMyceliumMode("active") updates myceliumMode', () => {
        setMyceliumMode('active')
        expect(navStore().myceliumMode).toBe('active')
    })

    it('setMyceliumMode("overdrive") updates myceliumMode', () => {
        setMyceliumMode('overdrive')
        expect(navStore().myceliumMode).toBe('overdrive')
    })

    it('setApplyingUrlState(true) sets applyingUrlState=true', () => {
        setApplyingUrlState(true)
        expect(navStore().applyingUrlState).toBe(true)
    })

    it('setApplyingUrlState(false) sets applyingUrlState=false', () => {
        setApplyingUrlState(true)
        setApplyingUrlState(false)
        expect(navStore().applyingUrlState).toBe(false)
    })

    it('setRestoringBrowserHistory(true) sets restoringBrowserHistory=true', () => {
        setRestoringBrowserHistory(true)
        expect(navStore().restoringBrowserHistory).toBe(true)
    })

    it('setRestoringBrowserHistory(false) sets restoringBrowserHistory=false', () => {
        setRestoringBrowserHistory(true)
        setRestoringBrowserHistory(false)
        expect(navStore().restoringBrowserHistory).toBe(false)
    })

    it('writeNavStateMirror({mode:"trail"}) sets mode=trail', () => {
        writeNavStateMirror({ mode: 'trail' })
        expect(navStore().mode).toBe('trail')
    })

    it('writeNavStateMirror({currentView:"map"}) sets currentView=map', () => {
        writeNavStateMirror({ currentView: 'map' })
        expect(navStore().currentView).toBe('map')
    })

    it('tracks the last committed view for the settle re-assert (W-view-preserve)', () => {
        // The SEARCH_FOCUS_TRANSITION_SETTLED subscriber re-asserts this value
        // after the focus-settle reconciliation (which can clobber currentView
        // through a raw write that bypasses writeNavStateMirror).
        writeNavStateMirror({ currentView: 'map' })
        expect(getLastCommittedView()).toBe('map')
        writeNavStateMirror({ currentView: 'galaxy' })
        expect(getLastCommittedView()).toBe('galaxy')
        // Non-view patches must not disturb the tracker.
        writeNavStateMirror({ mode: 'focus' })
        expect(getLastCommittedView()).toBe('galaxy')
    })

    it('drift tracer: flags valid-state writes that bypass the mirror, then clears on canonical refresh', () => {
        // Baseline via the canonical funnel.
        writeNavStateMirror({ currentView: 'galaxy', mode: 'overview', surface: 'idle' })
        expect(describeNavDrift(mockAppState.navState)).toBeNull()

        // An off-mirror raw write (the exact class that silently flipped the
        // view in the 2026-08-04 clobber) must be detected.
        mockAppState.navState.currentView = 'map'
        const report = describeNavDrift(mockAppState.navState)
        expect(report).toMatch(/currentView/)

        // A canonical write refreshes the baseline and clears the drift.
        writeNavStateMirror({ currentView: 'map' })
        expect(describeNavDrift(mockAppState.navState)).toBeNull()
    })

    it('writeNavStateMirror({trailDepth:5}) sets trailDepth=5', () => {
        writeNavStateMirror({ trailDepth: 5 })
        expect(navStore().trailDepth).toBe(5)
    })

    it('writeNavStateMirror({focusedIndex:99}) sets focusedIndex=99', () => {
        writeNavStateMirror({ focusedIndex: 99 })
        expect(navStore().focusedIndex).toBe(99)
    })

    it('writeNavStateMirror does not overwrite unmentioned fields', () => {
        writeNavStateMirror({ mode: 'trail', focusedIndex: 7 })
        expect(navStore().surface).toBe('idle') // unchanged
        expect(navStore().currentView).toBe('galaxy') // unchanged
    })

    it('setFocusPocketIndices, clearFocusPocketIndices are no-ops (stubbed)', () => {
        // These are stubbed in the current implementation — just verify they don't throw
        expect(() => setFocusPocketIndices([1, 2, 3])).not.toThrow()
        expect(() => clearFocusPocketIndices()).not.toThrow()
    })

    it('setFocusPocketMeta, clearFocusPocketMeta are no-ops (stubbed)', () => {
        expect(() => setFocusPocketMeta({ motif: 'test' })).not.toThrow()
        expect(() => clearFocusPocketMeta()).not.toThrow()
    })
})

describe('navStore — NAV_TRANSITION_ACTIONS dispatch', () => {
    beforeEach(() => {
        resetAllNavState()
    })

    it('FOCUS_NODE sets mode=focus and focusedIndex', () => {
        const result = dispatchNavTransition(NAV_TRANSITION_ACTIONS.FOCUS_NODE, {
            index: 42
        })
        expect(result.ok).toBe(true)
        expect(result.previousMode).toBe('overview')
        expect(result.nextMode).toBe('focus')
        expect(navStore().mode).toBe('focus')
        expect(navStore().focusedIndex).toBe(42)
    })

    it('FOCUS_NODE with explicit mode/surface payload', () => {
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.FOCUS_NODE, {
            index: 10,
            mode: 'focus',
            surface: 'focus'
        })
        expect(navStore().mode).toBe('focus')
        expect(navStore().surface).toBe('focus')
        expect(navStore().focusedIndex).toBe(10)
    })

    it('FOCUS_NODE with fromTraversal=true clears activeStoryPrompt', () => {
        writeNavStateMirror({ activeStoryPrompt: 'some-prompt' })
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.FOCUS_NODE, {
            index: 5,
            fromTraversal: true
        })
        expect(navStore().activeStoryPrompt).toBeNull()
    })

    it('RETURN_OVERVIEW resets to overview mode with surface=idle', () => {
        // Set some non-default state first
        writeNavStateMirror({ mode: 'focus', surface: 'focus', focusedIndex: 7 })
        const result = dispatchNavTransition(NAV_TRANSITION_ACTIONS.RETURN_OVERVIEW)
        expect(result.ok).toBe(true)
        expect(navStore().mode).toBe('overview')
        expect(navStore().surface).toBe('idle')
        expect(navStore().focusedIndex).toBeNull()
    })

    it('RETURN_OVERVIEW chains clearSearch, resetFocus, resetJourney', () => {
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.RETURN_OVERVIEW)
        expect(mockClearSearch).toHaveBeenCalledTimes(1)
        expect(mockResetFocus).toHaveBeenCalledTimes(1)
        expect(mockResetJourney).toHaveBeenCalledTimes(1)
    })

    it('SET_VIEW sets currentView', () => {
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_VIEW, { view: 'map' })
        expect(navStore().currentView).toBe('map')
    })

    it('SET_VIEW with galaxy', () => {
        switchView('map')
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_VIEW, { view: 'galaxy' })
        expect(navStore().currentView).toBe('galaxy')
    })

    it('SET_SURFACE updates surface and mode', () => {
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'focus' })
        expect(navStore().surface).toBe('focus')
        expect(navStore().mode).toBe('focus')
    })

    it('SET_SURFACE preserves the current map view for map-trail', () => {
        switchView('map')
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'map-trail' })
        expect(navStore().currentView).toBe('map')
        expect(navStore().surface).toBe('map-trail')
    })

    it('SET_SURFACE preserves the current map view for map-focus', () => {
        switchView('map')
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'map-focus' })
        expect(navStore().currentView).toBe('map')
        expect(navStore().surface).toBe('map-focus')
    })

    it('SET_SURFACE preserves the current map view for map-focus-search', () => {
        switchView('map')
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'map-focus-search' })
        expect(navStore().currentView).toBe('map')
        expect(navStore().surface).toBe('map-focus-search')
    })

    it('SET_SURFACE with idle resets mode to overview', () => {
        setNavMode('focus')
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'idle' })
        expect(navStore().surface).toBe('idle')
        expect(navStore().mode).toBe('overview')
    })

    it('TRAVERSE_NEIGHBOR sets mode=trail and surface=trail', () => {
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.TRAVERSE_NEIGHBOR, { index: 15 })
        expect(navStore().mode).toBe('trail')
        expect(navStore().surface).toBe('trail')
        expect(navStore().focusedIndex).toBe(15)
    })

    it('WALK_TO sets mode=trail, surface=focus, and accumulates walkHistory', () => {
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.WALK_TO, { index: 20 })
        expect(navStore().mode).toBe('trail')
        expect(navStore().surface).toBe('focus')
        expect(navStore().focusedIndex).toBe(20)
        expect(navStore().walkHistoryIndices).toEqual([20])
    })

    it('WALK_TO accumulates walkHistory across multiple calls', () => {
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.WALK_TO, { index: 20 })
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.WALK_TO, { index: 21 })
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.WALK_TO, { index: 22 })
        expect(navStore().walkHistoryIndices).toEqual([20, 21, 22])
    })

    it('WALK_TO does not duplicate consecutive same-index walks', () => {
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.WALK_TO, { index: 20 })
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.WALK_TO, { index: 20 })
        expect(navStore().walkHistoryIndices).toEqual([20])
    })

    it('WALK_THREAD sets mode=trail and surface=focus', () => {
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.WALK_THREAD, { index: 30 })
        expect(navStore().mode).toBe('trail')
        expect(navStore().surface).toBe('focus')
        expect(navStore().focusedIndex).toBe(30)
    })

    it('BACKTRACK with step=-1 pops last history entry', () => {
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.WALK_TO, { index: 20 })
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.WALK_TO, { index: 21 })
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.BACKTRACK, { step: -1 })
        expect(navStore().walkHistoryIndices).toEqual([20])
    })

    it('SET_DEPTH updates trailDepth', () => {
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_DEPTH, { depth: 5 })
        expect(navStore().trailDepth).toBe(5)
    })

    it('SET_DEPTH with depth=0 resets trailDepth', () => {
        writeNavStateMirror({ trailDepth: 5 })
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_DEPTH, { depth: 0 })
        expect(navStore().trailDepth).toBe(0)
    })

    it('ENTER_INSIDE sets mode=inside, surface=inside, semanticDiveMode=true', () => {
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.ENTER_INSIDE)
        expect(navStore().mode).toBe('inside')
        expect(navStore().surface).toBe('inside')
    })

    it('EXIT_INSIDE with focusedIndex=null resets to overview/idle', () => {
        writeNavStateMirror({ mode: 'inside', surface: 'inside', focusedIndex: null })
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.EXIT_INSIDE)
        expect(navStore().mode).toBe('overview')
        expect(navStore().surface).toBe('idle')
    })

    it('EXIT_INSIDE with focusedIndex set goes to focus/focus', () => {
        writeNavStateMirror({ mode: 'inside', surface: 'inside', focusedIndex: 7 })
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.EXIT_INSIDE)
        expect(navStore().mode).toBe('focus')
        expect(navStore().surface).toBe('focus')
    })

    it('RESET_FOCUS clears focusedIndex and trail fields', () => {
        writeNavStateMirror({
            focusedIndex: 42,
            trailSeedIndex: 10,
            trailNeighborIndices: [1, 2, 3],
            trailCursor: 2,
            walkHistoryIndices: [10, 20, 30],
            lastTraversalReason: 'click'
        })
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.RESET_FOCUS)
        expect(navStore().focusedIndex).toBeNull()
        expect(navStore().trailSeedIndex).toBeNull()
        expect(navStore().trailNeighborIndices).toEqual([])
        expect(navStore().trailCursor).toBe(-1)
        expect(navStore().walkHistoryIndices).toEqual([])
        expect(navStore().lastTraversalReason).toBeNull()
    })

    it('RESET_EXPERIENCE calls resetNavState', () => {
        writeNavStateMirror({ mode: 'focus', focusedIndex: 42 })
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.RESET_EXPERIENCE)
        expect(navStore().mode).toBe('overview')
        expect(navStore().focusedIndex).toBeNull()
    })

    it('RESET calls resetNavState', () => {
        writeNavStateMirror({ mode: 'trail', trailDepth: 5 })
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.RESET)
        expect(navStore().mode).toBe('overview')
        expect(navStore().trailDepth).toBe(0)
    })

    it('RESTORE_EXPLORATION_HISTORY sets explorationHistoryIndices', () => {
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.RESTORE_EXPLORATION_HISTORY, {
            restoreHistoryIndices: [100, 200, 300]
        })
        expect(navStore().explorationHistoryIndices).toEqual([100, 200, 300])
    })

    it('RESTORE_EXPLORATION_HISTORY filters non-finite values', () => {
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.RESTORE_EXPLORATION_HISTORY, {
            restoreHistoryIndices: [100, NaN, 200, Infinity, 300]
        })
        expect(navStore().explorationHistoryIndices).toEqual([100, 200, 300])
    })

    it('dispatchNavTransition returns ok=true and mode transition', () => {
        const result = dispatchNavTransition(NAV_TRANSITION_ACTIONS.FOCUS_NODE, {
            index: 1
        })
        expect(result).toEqual({
            ok: true,
            previousMode: 'overview',
            nextMode: 'focus'
        })
    })
})

describe('navStore — updateNavState', () => {
    beforeEach(() => {
        resetAllNavState()
        // Inline mock-state reset is below; keeps the rest of the
        // original-list initialisation intact for this suite.
        mockAppState.navState = {
            mode: 'overview',
            surface: 'idle',
            previousSurface: 'idle',
            focusedIndex: null,
            trailSeedIndex: null,
            trailNeighborIndices: [],
            trailCursor: -1,
            trailDepth: 0,
            walkHistoryIndices: [],
            lastTraversalReason: null,
            threadCandidates: [],
            threadReasonByIndex: new Map(),
            threadSource: '',
            focusPocketIndices: [],
            focusPocketMeta: null,
            focusPocketRoleByIndex: new Map(),
            focusFramingMeta: null,
            currentPersonality: null,
            neighborhoodIndices: [],
            explorationHistoryIndices: [],
            currentView: 'galaxy',
            myceliumMode: 'dormant',
            autoRotate: false,
            autoRotateSuspended: false,
            trailDepthFromExploration: 0,
            sceneRevealActive: false,
            sceneRevealStartedAt: 0,
            loadingPhaseKey: 'records',
            applyingUrlState: false,
            restoringBrowserHistory: false,
            urlStateRestoreToken: 0,
            activeStoryPrompt: null
        }
    })

    it('updateNavState merges partial patch into existing state', () => {
        updateNavState({ mode: 'trail', trailDepth: 3 })
        expect(navStore().mode).toBe('trail')
        expect(navStore().trailDepth).toBe(3)
        // Unchanged fields preserved
        expect(navStore().surface).toBe('idle')
        expect(navStore().currentView).toBe('galaxy')
    })

    it('updateNavState with focusedIndex', () => {
        updateNavState({ focusedIndex: 99 })
        expect(navStore().focusedIndex).toBe(99)
        expect(navStore().mode).toBe('overview') // unchanged
    })

    it('updateNavState with empty patch is a no-op', () => {
        updateNavState({})
        expect(navStore().mode).toBe('overview')
        expect(navStore().focusedIndex).toBeNull()
    })

    it('updateNavState can set multiple fields at once', () => {
        updateNavState({
            mode: 'focus',
            surface: 'focus',
            focusedIndex: 55,
            currentView: 'map'
        })
        expect(navStore().mode).toBe('focus')
        expect(navStore().surface).toBe('focus')
        expect(navStore().focusedIndex).toBe(55)
        expect(navStore().currentView).toBe('map')
    })
})

describe('navStore — resetNavState', () => {
    beforeEach(() => {
        resetAllNavState()
        mockAppState.navState = {
            mode: 'overview',
            surface: 'idle',
            previousSurface: 'idle',
            focusedIndex: null,
            trailSeedIndex: null,
            trailNeighborIndices: [],
            trailCursor: -1,
            trailDepth: 0,
            walkHistoryIndices: [],
            lastTraversalReason: null,
            threadCandidates: [],
            threadReasonByIndex: new Map(),
            threadSource: '',
            focusPocketIndices: [],
            focusPocketMeta: null,
            focusPocketRoleByIndex: new Map(),
            focusFramingMeta: null,
            currentPersonality: null,
            neighborhoodIndices: [],
            explorationHistoryIndices: [],
            currentView: 'galaxy',
            myceliumMode: 'dormant',
            autoRotate: false,
            autoRotateSuspended: false,
            trailDepthFromExploration: 0,
            sceneRevealActive: false,
            sceneRevealStartedAt: 0,
            loadingPhaseKey: 'records',
            applyingUrlState: false,
            restoringBrowserHistory: false,
            urlStateRestoreToken: 0,
            activeStoryPrompt: null
        }
    })

    it('resetNavState returns to initial state after mutations', () => {
        writeNavStateMirror({
            mode: 'focus',
            surface: 'focus',
            focusedIndex: 42,
            trailDepth: 5,
            currentView: 'map',
            myceliumMode: 'active',
            autoRotate: false,
            urlStateRestoreToken: 10
        })
        resetNavState()
        expect(navStore().mode).toBe('overview')
        expect(navStore().surface).toBe('idle')
        expect(navStore().focusedIndex).toBeNull()
        expect(navStore().trailDepth).toBe(0)
        expect(navStore().currentView).toBe('galaxy')
        expect(navStore().myceliumMode).toBe('dormant')
        expect(navStore().autoRotate).toBe(false)
        expect(navStore().urlStateRestoreToken).toBe(0)
    })

    it('resetNavState after dispatchNavTransition', () => {
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.FOCUS_NODE, { index: 1 })
        resetNavState()
        expect(navStore().mode).toBe('overview')
        expect(navStore().focusedIndex).toBeNull()
    })

    it('resetNavState clears walkHistoryIndices', () => {
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.WALK_TO, { index: 20 })
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.WALK_TO, { index: 21 })
        resetNavState()
        expect(navStore().walkHistoryIndices).toEqual([])
    })

    it('resetNavState clears explorationHistoryIndices', () => {
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.RESTORE_EXPLORATION_HISTORY, {
            restoreHistoryIndices: [100, 200]
        })
        resetNavState()
        expect(navStore().explorationHistoryIndices).toEqual([])
    })
})

describe('navStore — bumpUrlStateRestoreToken', () => {
    beforeEach(() => {
        // _navWritable is a window-keyed singleton — vi.resetModules() doesn't
        // reset it. resetAllNavState() calls the production resetNavState()
        // which writes INITIAL_NAV_STATE through both appState.proxy AND
        // _navWritable.update, so the counter + every other field reset
        // together. This is the difference between 9 failing tests and 9
        // passing tests.
        resetAllNavState()
    })

    it('bumpUrlStateRestoreToken increments by 1 from 0', () => {
        const result = bumpUrlStateRestoreToken()
        expect(result).toBe(1)
        expect(navStore().urlStateRestoreToken).toBe(1)
    })

    it('bumpUrlStateRestoreToken increments by 1 from arbitrary value', () => {
        writeNavStateMirror({ urlStateRestoreToken: 42 })
        const result = bumpUrlStateRestoreToken()
        expect(result).toBe(43)
        expect(navStore().urlStateRestoreToken).toBe(43)
    })

    it('bumpUrlStateRestoreToken is idempotent with repeated calls', () => {
        expect(bumpUrlStateRestoreToken()).toBe(1)
        expect(bumpUrlStateRestoreToken()).toBe(2)
        expect(bumpUrlStateRestoreToken()).toBe(3)
        expect(navStore().urlStateRestoreToken).toBe(3)
    })
})

describe('navStore — auto-rotate lifecycle', () => {
    beforeEach(() => {
        // See comment in bumpUrlStateRestoreToken: _navWritable is a
        // window-keyed singleton so reset must go through the production
        // helper that writes through both appState.proxy and _navWritable.
        resetAllNavState()
    })

    it('default state: disabled, not suspended', () => {
        expect(navStore().autoRotate).toBe(false)
        expect(navStore().autoRotateSuspended).toBe(false)
    })

    it('setAutoRotate(false) disables, resumeAutoRotate() does not re-enable', () => {
        setAutoRotate(false)
        expect(navStore().autoRotate).toBe(false)
        resumeAutoRotate()
        expect(navStore().autoRotate).toBe(false) // still disabled
    })

    it('suspendAutoRotate() preserves autoRotate=false but sets suspended=true', () => {
        suspendAutoRotate()
        expect(navStore().autoRotate).toBe(false)
        expect(navStore().autoRotateSuspended).toBe(true)
    })

    it('resumeAutoRotate() clears suspended flag', () => {
        suspendAutoRotate()
        resumeAutoRotate()
        expect(navStore().autoRotate).toBe(false)
        expect(navStore().autoRotateSuspended).toBe(false)
    })

    it('full cycle: enable → suspend → resume', () => {
        suspendAutoRotate()
        expect(navStore().autoRotateSuspended).toBe(true)
        resumeAutoRotate()
        expect(navStore().autoRotateSuspended).toBe(false)
    })

    it('suspendAutoRotate is idempotent', () => {
        suspendAutoRotate()
        suspendAutoRotate()
        expect(navStore().autoRotateSuspended).toBe(true)
    })
})

describe('NAVIGATION_CONFIG', () => {
    it('has SCENE_REVEAL_DURATION_MS=1650', () => {
        expect(NAVIGATION_CONFIG.SCENE_REVEAL_DURATION_MS).toBe(1650)
    })

    it('has LOADING_MIN_VISIBLE_MS=1320', () => {
        expect(NAVIGATION_CONFIG.LOADING_MIN_VISIBLE_MS).toBe(1320)
    })

    it('has AUTO_ROTATE_BASE_SPEED=0.34', () => {
        expect(NAVIGATION_CONFIG.AUTO_ROTATE_BASE_SPEED).toBe(0.34)
    })

    it('has AUTO_ROTATE_IDLE_MS=3600', () => {
        expect(NAVIGATION_CONFIG.AUTO_ROTATE_IDLE_MS).toBe(3600)
    })

    it('has AUTO_ROTATE_MANUAL_IDLE_MS=5200', () => {
        expect(NAVIGATION_CONFIG.AUTO_ROTATE_MANUAL_IDLE_MS).toBe(5200)
    })

    it('has AUTO_ROTATE_SOFT_RESUME_MS=1800', () => {
        expect(NAVIGATION_CONFIG.AUTO_ROTATE_SOFT_RESUME_MS).toBe(1800)
    })

    it('has empty MODE_DESCRIPTIONS and STORY_DESCRIPTIONS', () => {
        expect(NAVIGATION_CONFIG.MODE_DESCRIPTIONS).toEqual({})
        expect(NAVIGATION_CONFIG.STORY_DESCRIPTIONS).toEqual({})
    })
})

describe('navStore — module reset isolation', () => {
    beforeEach(() => {
        // Same singleton-writable caveat: clear so module-reset has a
        // fresh writable to install.
        if (typeof window !== 'undefined') {
            delete (window as unknown as { __SEMANTIC_EXPLORER_NAV_WRITABLE__?: unknown })
                .__SEMANTIC_EXPLORER_NAV_WRITABLE__
        }
        mockAppState.navState = { ...DEFAULT_NAV_STATE }
        mockAppState.trailDepth = 0
        mockAppState.currentView = 'galaxy'
    })

    it('vi.resetModules gives a fresh module with default state', async () => {
        // Mutate the current module
        writeNavStateMirror({ mode: 'focus', focusedIndex: 99 })
        expect(navStore().mode).toBe('focus')

        // Reset mock state BEFORE reimporting — the fresh module's
        // $effect.root() bridge rebinds _navWritable to appState.navState
        // at init, so the new module's navStore mirrors whichever mock
        // value is here NOW.
        mockAppState.navState = { ...DEFAULT_NAV_STATE }

        // Get a fresh module
        const fresh = await freshNavStore()
        // The fresh module's navStore mirrors the now-reset mock state
        expect(fresh.navStore().mode).toBe('overview')
        expect(fresh.navStore().focusedIndex).toBeNull()
    })

    it('fresh module has independent selectors', async () => {
        const fresh = await freshNavStore()
        expect(fresh.isOverview()).toBe(true)
        expect(fresh.hasFocus()).toBe(false)
        expect(fresh.hasTrail()).toBe(false)
        expect(fresh.currentView()).toBe('galaxy')
        expect(fresh.isMapMode()).toBe(false)
    })
})
