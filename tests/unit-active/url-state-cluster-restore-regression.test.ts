/**
 * url-state-cluster-restore-regression.test.ts
 *
 * Verifies:
 *  a) The URL-restore path (?cluster=...) still sets the cluster filter.
 *  b) The orphaned CustomEvent 'semantic:cluster-filter-restore-requested'
 *     is never dispatched (regression guard after removal in url-state.ts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Track the active cluster filter value set by the mock filter store.
let trackedClusterFilter: string | null = null

// Track the full filter state (status/city/website/email/geocoded) so the
// round-trip test can assert encode (updateUrlState) → restore
// (restoreActiveFiltersFromUrl via applyUrlState) reproduces the filter set.
type TrackedFilters = { status: string; city: string; website: boolean; email: boolean; geocoded: boolean }
let trackedFilters: TrackedFilters = { status: 'all', city: '', website: false, email: false, geocoded: false }

vi.mock('@lib/stores/filter.svelte', () => ({
    filterState: {
        subscribe: (fn: (v: TrackedFilters) => void) => {
            fn(trackedFilters)
            return () => {}
        }
    },
    getFilterState: () => trackedFilters,
    restoreActiveClusterFilterFromUrl: (params: URLSearchParams) => {
        const value = params.get('cluster')
        trackedClusterFilter = value !== null ? String(value) : null
    },
    restoreActiveFiltersFromUrl: (params: URLSearchParams) => {
        const status = params.get('status')
        const city = params.get('city')
        const website = params.get('website')
        const email = params.get('email')
        const geocoded = params.get('geocoded')
        trackedFilters = {
            status: status ?? 'all',
            city: city !== null && city !== 'all' ? city : '',
            website: website === '1' || website === 'true',
            email: email === '1' || email === 'true',
            geocoded: geocoded === '1' || geocoded === 'true'
        }
    },
    activeClusterFilter: {
        subscribe: (fn: (v: string | null) => void) => {
            fn(trackedClusterFilter)
            return () => {}
        },
        set: (v: string | null) => {
            trackedClusterFilter = v
        }
    }
}))

vi.mock('@lib/stores/navigation.svelte.ts', async () => {
    const navState = { urlStateRestoreToken: 0, applyingUrlState: false, restoringBrowserHistory: false }
    return {
        navStore: {
            subscribe: (fn: (v: typeof navState) => void) => {
                fn(navState)
                return () => {}
            },
            update: (updater: (s: typeof navState) => typeof navState) => {
                const next = updater(navState)
                Object.assign(navState, next)
            },
            set: (v: typeof navState) => Object.assign(navState, v)
        },
        writeNavStateMirror: (patch: Record<string, unknown>) => {
            Object.assign(navState, patch)
        },
        bumpUrlStateRestoreToken: () => {
            navState.urlStateRestoreToken++
            return navState.urlStateRestoreToken
        },
        updateNavState: () => {},
        switchView: () => {},
        currentView: () => 'galaxy',
        setMyceliumMode: () => {}
    }
})

vi.mock('@lib/stores/journey.svelte', () => ({
    journeyStore: {
        subscribe: () => () => {},
        update: () => {},
        set: () => {}
    },
    setJourneyPhase: () => {}
}))

vi.mock('@lib/stores/search.svelte', () => ({
    searchStore: () => ({ status: 'idle', results: [], query: '' }),
    clearSearch: () => {},
    runSearch: () => Promise.resolve(),
    setSearchError: () => {}
}))

vi.mock('@lib/stores/focus.svelte', () => ({
    focusStore: {
        subscribe: () => () => {},
        update: () => {},
        set: () => {}
    },
    setSemanticDiveMode: () => {},
    resetFocus: () => {},
    setSelectedBusiness: () => {}
}))

vi.mock('@lib/state/app.svelte', () => ({
    appState: {
        get navState() { return { focusedIndex: null, currentView: 'galaxy' } },
        set navState(_) {},
        get points() { return [] },
        get currentView() { return 'galaxy' },
        set currentView(_) {},
        get trailDepth() { return 0 },
        set trailDepth(_) {},
        get semanticDiveMode() { return false },
        set semanticDiveMode(_) {},
        get myceliumMode() { return 'default' },
        set myceliumMode(_) {},
        get focusedNode() { return null },
        set focusedNode(_) {},
        get trailIndices() { return null },
        set trailIndices(_) {},
        get filterVersion() { return 0 },
        get selectedPoint() { return null },
        get infoPanelOpen() { return true },
        get pocketListVisible() { return false },
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
            summaryCardTypeToken: 0
        },
        viewportState: { viewportWidth: 1280, viewportHeight: 800, isCompactViewport: false, isMobileViewport: false, isTabletViewport: false, devicePixelRatio: 1 },
        focusState: {
            selectedPoint: null, inspectedThreadIndex: null, pinnedThreadIndex: null,
            threadInspectorPointerInside: false, pocketMotionByIndex: new Map(),
            pocketTransitionStartedAt: 0, infoPanelOpen: true, pocketListVisible: false,
            pocketRoleFilter: 'all', focusTransitionMode: 'idle', focusTransitionStartedAt: 0,
            nodesAreSettling: false, inspectedStrandDiagnostics: { active: false, source: '', index: null, focusedIndex: null, segmentCount: 0, braidCount: 0, endpointCount: 0 }
        },
        withMutation: (fn: () => unknown) => fn()
    }
}))

vi.mock('@lib/orchestration/event-bus', () => ({
    publish: () => {},
    subscribe: () => () => {},
    subscribeKeyed: () => () => {},
    EVENTS: {
        SEARCH_FOCUS_REQUESTED: 'search:focus-requested',
        SEARCH_CLEARED: 'search:cleared',
        SEARCH_SUCCESS: 'search:success',
        SEARCH_EMPTY: 'search:empty',
        URL_SYNC_REQUESTED: 'url:sync-requested',
        STATE_RESET: 'state:reset'
    }
}))

vi.mock('@lib/orchestration/toast', () => ({
    showExperienceToast: () => {}
}))

vi.mock('@lib/journey/selected-card', () => ({
    updateSelectedBusiness: () => {}
}))

// Cut the lifecycle import chain at its entry point (imported by url-state.ts)
vi.mock('@lib/journey/thread-settler', () => ({
    setFocusedNode: () => {}
}))

vi.mock('@lib/orchestration/search-filter-core', () => ({
    applyFilters: () => {}
}))

vi.mock('@lib/orchestration/cluster-filter-controller', () => ({
    syncFilterControls: () => {}
}))

vi.mock('@lib/utils/debug', () => ({
    debugWarn: () => {}
}))

vi.mock('@lib/utils/disposable-registry', () => {
    const DisposableRegistry = class {
        label: string | undefined
        constructor(opts?: { label?: string }) { this.label = opts?.label }
        schedule = () => {}
        disposeAll = () => {}
    }
    return {
        DisposableRegistry,
        createDisposableRegistry: (opts?: { label?: string }) => new DisposableRegistry(opts)
    }
})

vi.mock('@lib/engine/camera-choreography/focus', () => ({
    animateCameraToNode: () => {}
}))

vi.mock('@lib/journey/semantic-overlay', () => ({
    refreshFocusSemanticOverlay: () => {},
    updateFocusSemanticOverlayPositions: () => {}
}))

vi.mock('@lib/journey/point-color', () => ({
    applyPointFilterColors: () => {}
}))

vi.mock('@lib/search/search-panel-adapter', () => ({
    setMobileSearchSheetMode: () => {}
}))

vi.mock('@lib/search/search-abort', () => ({
    startSearch: () => ({ isNew: true })
}))

vi.mock('@lib/utils/ui-presentation', () => ({
    isCompactSearchViewport: () => false,
    isDomForcedFocusSearchSurface: () => false
}))

vi.mock('@lib/orchestration/url-params', () => ({
    getSearchParams: () => new URLSearchParams(window.location.search),
    getLocationHref: () => window.location.href,
    getLocationPathname: () => '/',
    isDomForcedFocusSearchSurface: () => false
}))

import { applyUrlState, updateUrlState } from '@lib/orchestration/url-state'

describe('url-state cluster filter restore regression', () => {
    beforeEach(() => {
        trackedClusterFilter = null
        trackedFilters = { status: 'all', city: '', website: false, email: false, geocoded: false }
        window.history.replaceState({}, '', '/')
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.clearAllMocks()
    })

    it('BEHAVIOR PRESERVED: ?cluster=... URL restore sets the cluster filter', async () => {
        window.history.replaceState({}, '', '/?cluster=7')
        await applyUrlState({})
        expect(trackedClusterFilter).toBe('7')
    })

    it('BEHAVIOR PRESERVED: ?cluster=... restores numeric cluster value through filter store', async () => {
        window.history.replaceState({}, '', '/?cluster=42')
        await applyUrlState({})
        expect(trackedClusterFilter).toBe('42')
    })

    it('NO ORPHAN EVENT: window CustomEvent listener for semantic:cluster-filter-restore-requested never fires', async () => {
        const spy = vi.fn()
        window.addEventListener('semantic:cluster-filter-restore-requested', spy)
        window.history.replaceState({}, '', '/?cluster=3')
        await applyUrlState({})
        expect(spy).not.toHaveBeenCalled()
        window.removeEventListener('semantic:cluster-filter-restore-requested', spy)
    })

    it('FILTER ROUND-TRIP: updateUrlState encodes filters → applyUrlState restores the same filter view', async () => {
        // Simulate a user-applied filter set (as Filters.svelte toggleFilter produces)
        trackedFilters = { status: 'active', city: 'Conroe', website: true, email: false, geocoded: true }

        // Encode: updateUrlState pushes the filter params into the URL
        updateUrlState({}, { reason: 'test-filter-roundtrip', force: true })
        const encoded = new URL(window.location.href)
        expect(encoded.searchParams.get('status')).toBe('active')
        expect(encoded.searchParams.get('city')).toBe('Conroe')
        expect(encoded.searchParams.get('website')).toBe('1')
        expect(encoded.searchParams.has('email')).toBe(false)
        expect(encoded.searchParams.get('geocoded')).toBe('1')

        // Simulate a fresh visitor opening the shared link: in-app state is
        // default; only the URL carries the filter intent.
        trackedFilters = { status: 'all', city: '', website: false, email: false, geocoded: false }
        await applyUrlState({})

        // Filters restored from the URL — the shared link reproduces the filter view.
        expect(trackedFilters).toEqual({ status: 'active', city: 'Conroe', website: true, email: false, geocoded: true })
    })

    it('FILTER ROUND-TRIP: all-default filters are dropped from the URL (clean shared link)', async () => {
        // No filters active — updateUrlState must not emit filter params.
        trackedFilters = { status: 'all', city: '', website: false, email: false, geocoded: false }
        updateUrlState({}, { reason: 'test-filter-default', force: true })
        const encoded = new URL(window.location.href)
        expect(encoded.searchParams.has('status')).toBe(false)
        expect(encoded.searchParams.has('city')).toBe(false)
        expect(encoded.searchParams.has('website')).toBe(false)
        expect(encoded.searchParams.has('email')).toBe(false)
        expect(encoded.searchParams.has('geocoded')).toBe(false)
    })
})
