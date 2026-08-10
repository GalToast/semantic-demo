import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isSearchInFlight, resetSearchAbort, startSearch } from '@lib/search/search-abort'

describe('search lease piggyback lifecycle', () => {
    beforeEach(() => {
        resetSearchAbort()
    })

    it('keeps a newer query owned when an older lease settles late', () => {
        const older = startSearch('coffee')
        const newer = startSearch('tea')

        older.release()

        expect(newer.signal.aborted).toBe(false)
        expect(isSearchInFlight('tea')).toBe(true)

        newer.release()
        expect(isSearchInFlight()).toBe(false)
    })

    it('lets URL-style piggyback leases observe without releasing the owner', () => {
        const owner = startSearch('coffee')
        const piggyback = startSearch('coffee')

        expect(piggyback.isNew).toBe(false)
        piggyback.release()
        expect(isSearchInFlight('coffee')).toBe(true)

        owner.release()
        expect(isSearchInFlight()).toBe(false)
    })

    it('creates a fresh same-query lease after the previous owner releases', () => {
        const first = startSearch('coffee')
        first.release()

        const second = startSearch('coffee')

        expect(second.isNew).toBe(true)
        expect(second.signal).not.toBe(first.signal)
        expect(second.signal.aborted).toBe(false)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// Runtime piggyback behavior through the REAL URL-restoration pipeline.
//
// The old source-inspection `it` (readFileSync + regex over url-state.ts) is
// replaced by behavioral tests that drive the real wiring:
//
//   url-state.ts:_restoreSearchFromParams  →  startSearch(query)
//       isNew   → runSearch (fresh search)
//       !isNew  → waitForSearchSettle (piggyback; NO second runSearch)
//       finally → releaseSearch
//
// Only app-behavior leaves are mocked (appState store, event bus, performSearch,
// DOM-ish journey/focus/filter leaves); search-abort, search.svelte
// (runSearch/searchStore/waitForSearchSettle), SearchDispatch, and
// applyUrlState itself are the real modules. The observable piggyback
// semantics: a same-query URL restore while a search is in flight must NOT
// issue a second performSearch call.
// ─────────────────────────────────────────────────────────────────────────────

// Mutable state shared by the hoisted mock factories (a3-1 + url-anchor
// harness pattern). `searchState` is a STABLE plain object so real
// search.svelte writers (setSearchStatus/setSearchResults/clearSearch) and
// searchStore() readers see the same kernel fields.
const mockState = vi.hoisted(() => ({
    urlSearch: '?q=coffee&anchor=lead-404',
    navStore: {
        urlStateRestoreToken: 0,
        applyingUrlState: false,
        restoringBrowserHistory: false,
        focusedIndex: null as number | null,
        currentView: 'galaxy',
        mode: 'overview',
        surface: 'idle',
        myceliumMode: 'default',
        trailDepth: 0
    } as Record<string, unknown>,
    searchState: {
        searchError: null as unknown,
        isSearching: false,
        currentEmptyQuery: null as string | null,
        semanticTrailCue: 'idle',
        isCompactViewport: false,
        semanticGuideRequestSequence: 0,
        currentSemanticGuide: null as string | null,
        summaryCardTypeToken: 0,
        searchGlowIndices: new Set<number>(),
        searchStatus: 'idle',
        currentSearchSummary: null as {
            query: string
            resultIndices: number[]
        } | null,
        searchRequestSequence: 0,
        searchAnchorIndex: null as number | null,
        searchPreviewIndex: null as number | null,
        searchGlowTopIndex: null as number | null,
        searchGlowActive: false,
        searchFocusTransitionToken: 0
    },
    searchResults: [] as Array<Record<string, unknown>>,
    performSearchCalls: [] as Array<{ query: string }>,
    publishCalls: [] as Array<{ type: string; payload: unknown }>,
    // Deferred performSearch: tests hold the search in flight, then resolve.
    deferred: null as null | {
        promise: Promise<Array<Record<string, unknown>>>
        resolve: (value: Array<Record<string, unknown>>) => void
    }
}))

vi.mock('@lib/state/app.svelte', () => ({
    appState: {
        // search.svelte searchStore()/withSearchNotify writers and readers share
        // ONE stable object, so status/query/request-sequence round-trip.
        get searchState() {
            return mockState.searchState
        },
        get searchResults() {
            return mockState.searchResults
        },
        set searchResults(v) {
            mockState.searchResults = v as Array<Record<string, unknown>>
        },
        // Same object the mocked navStore.subscribe returns, so mocked
        // writeNavStateMirror and the real navigation-state mirror agree.
        get navState() {
            return mockState.navStore
        },
        get focusedNode() {
            return null
        },
        set focusedNode(_v: unknown) {},
        get trailIndices() {
            return null
        },
        get semanticDiveMode() {
            return false
        },
        set semanticDiveMode(_v: unknown) {},
        get myceliumMode() {
            return 'default'
        },
        set myceliumMode(_v: unknown) {},
        get filterVersion() {
            return 0
        },
        get points() {
            return []
        },
        get trailDepth() {
            return 0
        },
        set trailDepth(_v: unknown) {},
        get currentView() {
            return 'galaxy'
        },
        set currentView(_v: unknown) {},
        get viewportState() {
            return {
                viewportWidth: 1920,
                viewportHeight: 1080,
                viewportDpr: 1,
                viewportReducedMotion: false,
                viewportIsCompact: false
            }
        },
        withMutation: <T>(fn: () => T): T => fn()
    }
}))

vi.mock('@lib/stores/focus.svelte', () => ({
    focusStore: { update: (_fn: (s: Record<string, unknown>) => Record<string, unknown>) => {} },
    setSemanticDiveMode: (_v: unknown) => {}
}))

vi.mock('@lib/stores/journey.svelte', () => ({
    journeyStore: { update: (_fn: (s: Record<string, unknown>) => Record<string, unknown>) => {} },
    setJourneyPhase: (_v: unknown) => {},
    JOURNEY_COMPASS_PHASE_ORDER: ['overview'],
    JOURNEY_CONFIG: {},
    setTrailDepth: (_v: unknown) => {}
}))

vi.mock('@lib/stores/navigation.svelte.ts', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@lib/stores/navigation.svelte.ts')>()
    return {
        ...actual,
        navStore: {
            subscribe: (fn: (v: unknown) => void) => {
                fn(mockState.navStore)
                return () => {}
            }
        },
        writeNavStateMirror: (patch: Record<string, unknown>) => {
            Object.assign(mockState.navStore, patch)
        },
        bumpUrlStateRestoreToken: () => {
            const next = (mockState.navStore.urlStateRestoreToken as number) + 1
            mockState.navStore.urlStateRestoreToken = next
            return next
        }
    }
})

vi.mock('@lib/stores/search.svelte', async (importOriginal) => {
    // INTENTIONAL: search.svelte stays REAL — runSearch, searchStore,
    // setSearchStatus/setSearchResults/clearSearch, and the search-abort
    // lease integration are exactly what this test asserts on.
    return importOriginal<typeof import('@lib/stores/search.svelte')>()
})

vi.mock('@lib/search-engine', () => ({
    performSearch: (query: string) => {
        mockState.performSearchCalls.push({ query })
        if (!mockState.deferred) return Promise.resolve([])
        return mockState.deferred.promise
    }
}))

vi.mock('@lib/journey/selected-card', () => ({ updateSelectedBusiness: (_v: unknown) => {} }))
vi.mock('@lib/orchestration/search-filter-core', () => ({ applyFilters: (_v: unknown) => {} }))
vi.mock('@lib/orchestration/cluster-filter-controller', () => ({
    syncFilterControls: () => {},
    restoreActiveClusterFilterFromUrl: (_v: unknown) => {}
}))
vi.mock('@lib/stores/filter.svelte', () => ({
    restoreActiveFiltersFromUrl: (_v: unknown) => {},
    getFilterState: () => ({ status: 'all', city: '', website: false, email: false, geocoded: false })
}))
vi.mock('@lib/orchestration/toast', () => ({ showExperienceToast: (_t: string, _m: string) => {} }))
vi.mock('@lib/search/search-panel-adapter', () => ({ setMobileSearchSheetMode: (_m: string) => {} }))

// URL restore never reaches the focus-pocket/camera path in these tests
// (non-numeric anchor not in results → rebuildIndex -1), but mock the leaf
// so the graph stays jsdom-clean regardless.
vi.mock('@lib/engine/camera-choreography/focus', () => ({ animateCameraToNode: () => {} }))
vi.mock('@lib/journey/semantic-overlay', () => ({
    refreshFocusSemanticOverlay: () => {},
    updateFocusSemanticOverlayPositions: () => {}
}))
vi.mock('@lib/journey/point-color', () => ({ applyPointFilterColors: () => {} }))
vi.mock('@lib/focus/pocket', () => ({
    applyLocalNeighborhoodFocus: (_index: number) => true
}))

vi.mock('@lib/orchestration/event-bus', () => ({
    publish: (type: string, payload: unknown) => {
        mockState.publishCalls.push({ type, payload })
    },
    EVENTS: {
        SEARCH_FOCUS_REQUESTED: 'search:search-focus-requested',
        SEARCH_SUCCESS: 'SEARCH_SUCCESS',
        SEARCH_EMPTY: 'SEARCH_EMPTY',
        SEARCH_CLEARED: 'SEARCH_CLEARED',
        STATE_RESET: 'STATE_RESET',
        URL_SYNC_REQUESTED: 'URL_SYNC_REQUESTED',
        SEARCH_CANCELLED: 'SEARCH_CANCELLED'
    },
    subscribe: (_type: string, _cb: (...args: unknown[]) => void) => () => {},
    subscribeKeyed: (_key: string, _event: string, _cb: (...args: unknown[]) => void) => () => {}
}))

// URL params are injected through the url-params leaf so applyUrlState reads
// a controllable query without fighting jsdom's history implementation.
vi.mock('@lib/orchestration/url-params', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@lib/orchestration/url-params')>()
    return {
        ...actual,
        getSearchParams: () => new URLSearchParams(mockState.urlSearch),
        getLocationHref: () => `http://localhost/${mockState.urlSearch}`,
        getLocationPathname: () => '/',
        isDomForcedFocusSearchSurface: () => false
    }
})

// search.svelte calls getBusinessRecords() when building store snapshots;
// data-store's real module stays out of the graph.
vi.mock('@lib/data-store', () => ({
    getBusinessRecords: () => [],
    semanticNeighborMap: { subscribe: () => () => {} }
}))

function createDeferred() {
    let resolve!: (value: Array<Record<string, unknown>>) => void
    let reject!: (reason: unknown) => void
    const promise = new Promise<Array<Record<string, unknown>>>((res, rej) => {
        resolve = res
        reject = rej
    })
    return { promise, resolve, reject }
}

describe('url-state restoration piggyback (runtime)', () => {
    beforeEach(() => {
        // Fresh module registry per case so the search-abort singleton and
        // url-state module-load registrations never leak between cases.
        vi.resetModules()
        mockState.urlSearch = '?q=coffee&anchor=lead-404'
        Object.assign(mockState.navStore, {
            urlStateRestoreToken: 0,
            applyingUrlState: false,
            restoringBrowserHistory: false,
            focusedIndex: null,
            currentView: 'galaxy',
            mode: 'overview',
            surface: 'idle',
            myceliumMode: 'default',
            trailDepth: 0
        })
        mockState.searchResults = []
        mockState.performSearchCalls = []
        mockState.publishCalls = []
        mockState.deferred = null
        Object.assign(mockState.searchState, {
            searchError: null,
            isSearching: false,
            currentEmptyQuery: null,
            semanticTrailCue: 'idle',
            isCompactViewport: false,
            semanticGuideRequestSequence: 0,
            currentSemanticGuide: null,
            summaryCardTypeToken: 0,
            searchGlowIndices: new Set<number>(),
            searchStatus: 'idle',
            currentSearchSummary: null,
            searchRequestSequence: 0,
            searchAnchorIndex: null,
            searchPreviewIndex: null,
            searchGlowTopIndex: null,
            searchGlowActive: false,
            searchFocusTransitionToken: 0
        })
        // Drop the cross-chunk search-mirror singleton so the fresh module
        // instance rebuilds it (createStateMirror window-keyed writable).
        delete (window as unknown as Record<string, unknown>)['__SEMANTIC_EXPLORER_SEARCH_MIRROR__']
        document.getElementById('search-input')?.remove()
    })

    it('URL restoration piggybacks on an in-flight typed-input search instead of issuing a second runSearch', async () => {
        // W71 scenario: the typed-input path owns a live lease for 'coffee',
        // then a deep-link URL restore (?q=coffee) arrives. The restore must
        // take the waitForSearchSettle piggyback branch — startSearch returns
        // isNew=false and runSearch is NOT called a second time.
        const input = document.createElement('input')
        input.id = 'search-input'
        document.body.appendChild(input)

        const deferred = createDeferred()
        mockState.deferred = deferred

        const { resetSearchAbort: resetLeases } = await import('@lib/search/search-abort')
        resetLeases()
        const { SearchDispatch } = await import('@lib/search/search-dispatch')
        const { applyUrlState } = await import('@lib/orchestration/url-state')
        const { searchStore } = await import('@lib/stores/search.svelte')
        const { isSearchInFlight: inFlight } = await import('@lib/search/search-abort')

        // Typed-input path owns the lease and starts the real search.
        new SearchDispatch().dispatchSearch('coffee')
        expect(mockState.performSearchCalls.length).toBe(1)
        expect(inFlight('coffee')).toBe(true)

        // Deep-link URL restore with the SAME query while the search is in
        // flight. It must piggyback (startSearch isNew=false), never re-run.
        // resetStateBeforeUrlRestore -> clearSearch() leaves status 'idle', so
        // waitForSearchSettle unblocks immediately and the restore completes
        // while the typed-input search is still awaiting performSearch.
        const restore = applyUrlState({})
        await new Promise((r) => setTimeout(r, 20))
        await restore

        // Observable piggyback: NO second runSearch, the owner lease is still
        // alive, and the restore pipeline ran to completion (UI-7 input write).
        expect(mockState.performSearchCalls.length).toBe(1)
        expect(inFlight('coffee')).toBe(true)
        expect(input.value).toBe('coffee')

        // Settle the single in-flight search: results land from the ORIGINAL
        // runSearch only, then the owner releases the lease.
        deferred.resolve([{ id: 'r-1', name: 'Coffee Shop', index: 0, score: 1, category: 'Food', snippet: 'x' }])
        await vi.waitFor(() => {
            expect(mockState.performSearchCalls.length).toBe(1)
            expect(searchStore().status).toBe('results')
        })
        expect(inFlight('coffee')).toBe(false)
    }, 60000)

    it('a second URL restore with the same query piggybacks instead of re-running search', async () => {
        // Two URL restores in a row with the same ?q= while the first restore's
        // runSearch is still in flight: the second takes the isNew=false
        // piggyback path and must not issue a duplicate performSearch.
        const deferred = createDeferred()
        mockState.deferred = deferred

        const { resetSearchAbort: resetLeases } = await import('@lib/search/search-abort')
        resetLeases()
        const { applyUrlState } = await import('@lib/orchestration/url-state')
        const { searchStore } = await import('@lib/stores/search.svelte')

        const first = applyUrlState({})
        // The second restore runs synchronously up to its first await; the
        // first restore's search branch is reached in a microtask, so flush
        // the queue before observing the piggyback.
        const second = applyUrlState({})
        await new Promise((r) => setTimeout(r, 20))

        expect(mockState.performSearchCalls.length).toBe(1)

        deferred.resolve([{ id: 'r-1', name: 'Coffee Shop', index: 0, score: 1, category: 'Food', snippet: 'x' }])
        await Promise.all([first, second])

        await vi.waitFor(() => {
            expect(mockState.performSearchCalls.length).toBe(1)
            expect(searchStore().status).toBe('results')
        })
        expect(mockState.publishCalls.filter((c) => c.type === 'SEARCH_SUCCESS').length).toBeGreaterThanOrEqual(1)
    }, 60000)
})
