/**
 * A3-1: URL search hydration regression test
 *
 * Two layers of guards:
 *   1. Export contract — runSearch, setSearchResults, setSearchStatus, and
 *      performSearch must be exported (the original A3-1 surface check).
 *   2. Render-path reactivity — setSearchResults must notify the Svelte
 *      store facade so $searchState.results updates in SearchResults.svelte.
 *      This is the real A3-1 root cause: the toStore(getter, setter) bridge
 *      does not auto-notify subscribers on external appState mutations, so
 *      ?q=restaurant updated the store query but the result list never
 *      repainted. The fix routes every action through withSearchNotify(),
 *      which calls _searchWritable.set() after each appState mutation.
 *
 * Pattern contract (mirrors the navigation T4 test):
 *   - vi.hoisted() exposes a plain object the test can mutate
 *   - vi.mock() provides a stub for @lib/state/app.svelte.ts
 *   - Tests verify subscriber notifications under appState mutations
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Mock factory for appState (plain JS, no runes) ────────────────────────────

const mockState = vi.hoisted(() => ({
    currentSearchSummary: null as {
        query: string
        totalMatches: number
        totalSemanticMatches: number
        visibleMatches: number
        resultCount: number
        topScore: number
        anchorIndex: number | null
        topIndex: number | null
        resultIndices: number[]
        summaryType: string
    } | null,
    navState: {
        focusedIndex: null as number | null
    },
    searchStatus: 'idle' as 'idle' | 'searching' | 'results' | 'error',
    searchRequestSequence: 0,
    searchAnchorIndex: null as number | null,
    searchPreviewIndex: null as number | null,
    searchGlowIndices: new Set<number>(),
    searchGlowTopIndex: null as number | null,
    searchGlowActive: false,
    currentEmptyQuery: null as string | null,
    searchFocusTransitionToken: 0,
    semanticTrailCue: 'idle' as 'idle' | 'searching' | 'focusing',
    isCompactViewport: false,
    semanticGuideRequestSequence: 0,
    currentSemanticGuide: null as string | null,
    summaryCardTypeToken: 0
}))

// Stable reference for `appState.searchState`. Returns the SAME object
// every time so production writes like
// `appState.searchState.currentSearchSummary.resultIndices = [...]`
// stick. Tracked fields are proxy get/set pointing at mockState so test
// mutations via the legacy flat setters below propagate. DEFAULT_SEARCH_STATE
// is referenced via inline defaults because vi.hoisted factories run before
// top-level imports are initialized (ReferenceError otherwise).
const mockSearchState = vi.hoisted(() => {
    const tracked = [
        'currentSearchSummary',
        'searchStatus',
        'searchRequestSequence',
        'searchAnchorIndex',
        'searchPreviewIndex',
        'searchGlowIndices',
        'searchGlowTopIndex',
        'searchGlowActive',
        'currentEmptyQuery',
        'searchFocusTransitionToken',
        'semanticTrailCue',
        'isCompactViewport',
        'semanticGuideRequestSequence',
        'currentSemanticGuide',
        'summaryCardTypeToken'
    ] as const
    const obj: Record<string, unknown> = {
        searchError: null,
        searchFocusTransitionToken: 0,
        isSearching: false,
        currentEmptyQuery: null,
        semanticTrailCue: 'idle',
        isCompactViewport: false,
        semanticGuideRequestSequence: 0,
        currentSemanticGuide: null,
        summaryCardTypeToken: 0,
searchVisibleCount: 5,
        searchGlowIndices: new Set(),
        searchStatus: 'idle',
        currentSearchSummary: null,
        searchRequestSequence: 0,
        searchAnchorIndex: null,
        searchPreviewIndex: null,
        searchGlowTopIndex: null,
        searchGlowActive: false
    }
    for (const field of tracked) {
        Object.defineProperty(obj, field, {
            get() {
                return (mockState as unknown as Record<string, unknown>)[field]
            },
            set(v: unknown) {
                ;(mockState as unknown as Record<string, unknown>)[field] = v
            },
            enumerable: true,
            configurable: true
        })
    }
    return obj
})

// Phase 6c added focusState / viewportState partitions; both are read at
// module-init by focal modules this test transitively imports.
const mockViewportState = vi.hoisted(() => ({
    viewportWidth: 1280,
    viewportHeight: 800,
    isCompactViewport: false,
    isMobileViewport: false,
    isTabletViewport: false,
    devicePixelRatio: 1
}))

const mockFocusState = vi.hoisted(() => ({
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
        active: false,
        source: '',
        index: null,
        focusedIndex: null,
        segmentCount: 0,
        braidCount: 0,
        endpointCount: 0
    }
}))

vi.mock('@lib/state/app.svelte.ts', () => ({
    appState: {
        get searchState() {
            // Stable reference: production code can mutate via appState.searchState.X = Y
            // and the change sticks (proxy on mockSearchState tracks to mockState).
            return mockSearchState
        },
        get viewportState() {
            return mockViewportState
        },
        get focusState() {
            return mockFocusState
        },
        get currentSearchSummary() {
            return mockState.currentSearchSummary
        },
        set currentSearchSummary(v) {
            mockState.currentSearchSummary = v
        },
        get navState() {
            return mockState.navState
        },
        get searchStatus() {
            return mockState.searchStatus
        },
        set searchStatus(v) {
            mockState.searchStatus = v
        },
        get searchRequestSequence() {
            return mockState.searchRequestSequence
        },
        set searchRequestSequence(v) {
            mockState.searchRequestSequence = v
        },
        get searchAnchorIndex() {
            return mockState.searchAnchorIndex
        },
        set searchAnchorIndex(v) {
            mockState.searchAnchorIndex = v
        },
        get searchPreviewIndex() {
            return mockState.searchPreviewIndex
        },
        set searchPreviewIndex(v) {
            mockState.searchPreviewIndex = v
        },
        get searchGlowIndices() {
            return mockState.searchGlowIndices
        },
        set searchGlowIndices(v) {
            mockState.searchGlowIndices = v
        },
        get searchGlowTopIndex() {
            return mockState.searchGlowTopIndex
        },
        set searchGlowTopIndex(v) {
            mockState.searchGlowTopIndex = v
        },
        get searchGlowActive() {
            return mockState.searchGlowActive
        },
        set searchGlowActive(v) {
            mockState.searchGlowActive = v
        },
        get currentEmptyQuery() {
            return mockState.currentEmptyQuery
        },
        set currentEmptyQuery(v) {
            mockState.currentEmptyQuery = v
        },
        get searchFocusTransitionToken() {
            return mockState.searchFocusTransitionToken
        },
        set searchFocusTransitionToken(v) {
            mockState.searchFocusTransitionToken = v
        },
        get semanticTrailCue() {
            return mockState.semanticTrailCue
        },
        set semanticTrailCue(v) {
            mockState.semanticTrailCue = v
        },
        get isCompactViewport() {
            return mockState.isCompactViewport
        },
        set isCompactViewport(v) {
            mockState.isCompactViewport = v
        },
        get semanticGuideRequestSequence() {
            return mockState.semanticGuideRequestSequence
        },
        set semanticGuideRequestSequence(v) {
            mockState.semanticGuideRequestSequence = v
        },
        get currentSemanticGuide() {
            return mockState.currentSemanticGuide
        },
        set currentSemanticGuide(v) {
            mockState.currentSemanticGuide = v
        },
        get summaryCardTypeToken() {
            return mockState.summaryCardTypeToken
        },
        set summaryCardTypeToken(v) {
            mockState.summaryCardTypeToken = v
        },
        withMutation: <T>(fn: () => T): T => fn()
    }
}))

vi.mock('@lib/orchestration/event-bus', () => ({
    publish: () => undefined,
    subscribe: () => () => undefined,
    EVENTS: {
        SEARCH_SUCCESS: 'search:success',
        SEARCH_EMPTY: 'search:empty',
        SEARCH_CLEARED: 'search:cleared',
        SEARCH_FOCUS_REQUESTED: 'search:focus-requested',
        URL_SYNC_REQUESTED: 'url:sync-requested'
    }
}))

// Import the store AFTER the mock is set up so it sees the stubbed appState.
import { runSearch, setSearchResults, setSearchStatus, clearSearch, searchStore } from '@lib/stores/search.svelte'
import { performSearch } from '@lib/search-engine'

interface SearchStoreSnapshot {
    results: number[]
    status: string
    hasQuery: boolean
    resultsRendered: boolean
    query: string
}

function snapshotStore(): SearchStoreSnapshot {
    const s = searchStore() as unknown as any
    const results = Array.isArray(s.results)
        ? s.results.map((r: any) => (r && typeof r === 'object' && 'index' in r ? r.index : r))
        : []
    return {
        results,
        status: s.status,
        hasQuery: !!s.hasQuery,
        resultsRendered: !!s.resultsRendered,
        query: s.query ?? ''
    }
}

describe('A3-1: URL search hydration regression', () => {
    beforeEach(() => {
        mockState.currentSearchSummary = null
        mockState.navState.focusedIndex = null
        mockState.searchStatus = 'idle'
        mockState.searchRequestSequence = 0
        mockState.searchAnchorIndex = null
        mockState.searchPreviewIndex = null
        mockState.searchGlowIndices = new Set()
        mockState.searchGlowTopIndex = null
        mockState.searchGlowActive = false
        mockState.currentEmptyQuery = null
        mockState.searchFocusTransitionToken = 0
        mockState.semanticTrailCue = 'idle'
        mockState.isCompactViewport = false
        mockState.semanticGuideRequestSequence = 0
        mockState.currentSemanticGuide = null
        mockState.summaryCardTypeToken = 0
    })

    // ── Export contract ────────────────────────────────────────────────────────
    it('runSearch is exported from search store', () => {
        expect(runSearch).toBeDefined()
        expect(typeof runSearch).toBe('function')
    })

    it('setSearchResults is exported from search store', () => {
        expect(setSearchResults).toBeDefined()
        expect(typeof setSearchResults).toBe('function')
    })

    it('setSearchStatus is exported from search store', () => {
        expect(setSearchStatus).toBeDefined()
        expect(typeof setSearchStatus).toBe('function')
    })

    it('performSearch is exported from search engine', () => {
        expect(performSearch).toBeDefined()
        expect(typeof performSearch).toBe('function')
    })

    // ── Render-path reactivity (the actual A3-1 bug) ──────────────────────────
    it('searchStore() reflects the new results after setSearchResults', () => {
        setSearchResults([
            { id: 'r-1', name: 'A', index: 11, score: 0.9, category: 'Food', snippet: 'A' },
            { id: 'r-2', name: 'B', index: 22, score: 0.7, category: 'Retail', snippet: 'B' }
        ])
        const s = snapshotStore()
        expect(s.results).toEqual([11, 22])
        expect(s.status).toBe('results')
        expect(s.resultsRendered).toBe(true)
    })

    it('subscribers are notified when setSearchResults fires (A3-1 regression guard)', () => {
        const notifications: SearchStoreSnapshot[] = []
        const unsub = searchStore.subscribe((s: unknown) => {
            notifications.push(snapshotStore())
            void s
        })

        // The first notification is the initial subscription value.
        const initialCount = notifications.length
        expect(initialCount).toBeGreaterThanOrEqual(1)

        // Now fire the action. With the withSearchNotify fix, the store must
        // notify subscribers with the updated results.
        setSearchResults([{ id: 'r-3', name: 'C', index: 33, score: 0.5, category: 'Pro', snippet: 'C' }])

        expect(notifications.length).toBeGreaterThan(initialCount)
        const latest = notifications[notifications.length - 1]
        expect(latest.results).toEqual([33])
        expect(latest.status).toBe('results')

        unsub()
    })

    it('subscribers are notified when setSearchStatus fires', () => {
        const notifications: SearchStoreSnapshot[] = []
        const unsub = searchStore.subscribe((s: unknown) => {
            notifications.push(snapshotStore())
            void s
        })

        const initialCount = notifications.length
        setSearchStatus('searching')
        expect(notifications.length).toBeGreaterThan(initialCount)
        expect(notifications[notifications.length - 1].status).toBe('searching')

        unsub()
    })

    it('subscribers are notified when clearSearch fires', () => {
        // Seed a summary so clearSearch has something to clear
        setSearchResults([{ id: 'r-1', name: 'A', index: 11, score: 0.9, category: 'Food', snippet: 'A' }])

        const notifications: SearchStoreSnapshot[] = []
        const unsub = searchStore.subscribe((s: unknown) => {
            notifications.push(snapshotStore())
            void s
        })

        const initialCount = notifications.length
        clearSearch()

        expect(notifications.length).toBeGreaterThan(initialCount)
        const latest = notifications[notifications.length - 1]
        expect(latest.results).toEqual([])
        expect(latest.status).toBe('idle')

        unsub()
    })
})
