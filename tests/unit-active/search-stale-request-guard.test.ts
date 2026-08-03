/**
 * @vitest-environment jsdom
 *
 * search-stale-request-guard.test.ts — regression tests for the runSearch
 * request-id guard added to @lib/stores/search.svelte.
 *
 * Defect: runSearch() incremented the request sequence but discarded the
 * returned id. After `await performSearch()` it unconditionally wrote
 * results and published SEARCH_SUCCESS/SEARCH_EMPTY; its catch
 * unconditionally wrote searchError for non-abort failures. A slower
 * superseded request could therefore overwrite a newer query's results or
 * leave a stale error visible.
 *
 * Fix: capture the id from incrementRequestSequence() and gate every
 * post-await write on isRequestCurrent(requestId).
 *
 * These tests drive the REAL runSearch with a controllable performSearch
 * mock (deferred promises) so resolution order is fully deterministic —
 * no timers. Harness mirrors a3-1-url-search-hydration.test.ts (mocked
 * appState + event-bus, real store module).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Mock state ────────────────────────────────────────────────────────────────

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
    searchError: null as { query: string; type: string; message: string } | null,
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
    summaryCardTypeToken: 0,
    isSearching: false,
    searchResults: [] as unknown[],
    publishCalls: [] as Array<{ type: string; payload: unknown }>,
    // Deferred performSearch queue — one entry per call, in call order.
    pendingSearch: [] as Array<{
        query: string
        resolve: (v: { index: number; name: string }[]) => void
        reject: (e: unknown) => void
    }>
}))

// Stable proxy so production writes via appState.searchState.X stick.
const mockSearchState = vi.hoisted(() => {
    const tracked = [
        'currentSearchSummary',
        'searchStatus',
        'searchError',
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
        'summaryCardTypeToken',
        'isSearching'
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

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@lib/state/app.svelte.ts', () => ({
    appState: {
        get searchState() {
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
        get searchResults() {
            return mockState.searchResults
        },
        set searchResults(v) {
            mockState.searchResults = v
        },
        get searchStatus() {
            return mockState.searchStatus
        },
        set searchStatus(v) {
            mockState.searchStatus = v
        },
        get searchError() {
            return mockState.searchError
        },
        set searchError(v) {
            mockState.searchError = v
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

vi.mock('@lib/search-engine', () => ({
    performSearch: (query: string) => {
        return new Promise<{ index: number; name: string }[]>((resolve, reject) => {
            mockState.pendingSearch.push({ query, resolve, reject })
        })
    }
}))

vi.mock('@lib/orchestration/event-bus', () => ({
    publish: (type: string, payload: unknown) => {
        mockState.publishCalls.push({ type, payload })
    },
    subscribe: () => () => undefined,
    EVENTS: {
        SEARCH_SUCCESS: 'search:success',
        SEARCH_EMPTY: 'search:empty',
        SEARCH_CLEARED: 'search:cleared',
        SEARCH_FOCUS_REQUESTED: 'search:focus-requested'
    }
}))

// Import the store AFTER mocks are set up so it sees the stubbed modules.
import { runSearch } from '@lib/stores/search.svelte'

// ── Helpers ───────────────────────────────────────────────────────────────────

function resetMockState(): void {
    mockState.currentSearchSummary = null
    mockState.navState.focusedIndex = null
    mockState.searchStatus = 'idle'
    mockState.searchError = null
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
    mockState.isSearching = false
    mockState.searchResults = []
    mockState.publishCalls = []
    mockState.pendingSearch = []
}

const result = (index: number, name: string) => ({ index, name })

/** Resolve the i-th pending performSearch with a single result. */
function resolveSearch(i: number, index: number, name: string): void {
    mockState.pendingSearch[i].resolve([result(index, name)])
}

function rejectSearch(i: number, err: unknown): void {
    mockState.pendingSearch[i].reject(err)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('runSearch stale-request guard', () => {
    beforeEach(() => {
        resetMockState()
    })

    it('a superseded request cannot overwrite a newer request\'s results or publish success', async () => {
        const p1 = runSearch('coffee', new AbortController().signal)
        const p2 = runSearch('roofing', new AbortController().signal)
        expect(mockState.pendingSearch).toHaveLength(2)

        // Newer request (roofing) settles first.
        resolveSearch(1, 2, 'Roofing Co')
        await p2
        expect(mockState.currentSearchSummary?.query).toBe('roofing')
        expect(mockState.currentSearchSummary?.resultIndices).toEqual([2])
        expect(mockState.searchStatus).toBe('results')
        expect(mockState.searchError).toBeNull()

        // Older request (coffee) settles late — must be ignored entirely.
        resolveSearch(0, 1, 'Coffee House')
        await p1
        expect(mockState.currentSearchSummary?.query).toBe('roofing')
        expect(mockState.currentSearchSummary?.resultIndices).toEqual([2])
        expect(mockState.searchStatus).toBe('results')
        expect(mockState.searchError).toBeNull()

        // Only the newer request published SEARCH_SUCCESS (single, correct payload).
        const successes = mockState.publishCalls.filter((c) => c.type === 'search:success')
        expect(successes).toHaveLength(1)
        expect(successes[0].payload).toEqual({ query: 'roofing', count: 1 })
        expect(mockState.publishCalls.filter((c) => c.type === 'search:empty')).toHaveLength(0)
    })

    it('a superseded request\'s failure cannot create the visible error state', async () => {
        const p1 = runSearch('coffee', new AbortController().signal)
        const p2 = runSearch('roofing', new AbortController().signal)
        expect(mockState.pendingSearch).toHaveLength(2)

        // Newer request succeeds first.
        resolveSearch(1, 2, 'Roofing Co')
        await p2
        expect(mockState.searchStatus).toBe('results')
        expect(mockState.searchError).toBeNull()

        // Older request fails with a non-abort error AFTER the newer landed —
        // must be swallowed, not surfaced as the visible error.
        rejectSearch(0, new Error('network down'))
        await p1
        expect(mockState.searchStatus).toBe('results')
        expect(mockState.searchError).toBeNull()
    })

    it('the latest request still commits results with the correct success payload', async () => {
        const p = runSearch('bakery', new AbortController().signal)
        expect(mockState.pendingSearch).toHaveLength(1)
        expect(mockState.pendingSearch[0].query).toBe('bakery')

        resolveSearch(0, 7, 'Bakery')
        await p
        expect(mockState.currentSearchSummary?.query).toBe('bakery')
        expect(mockState.currentSearchSummary?.resultIndices).toEqual([7])
        expect(mockState.searchStatus).toBe('results')
        expect(mockState.searchError).toBeNull()
        expect(mockState.publishCalls).toEqual([
            { type: 'search:success', payload: { query: 'bakery', count: 1 } }
        ])
    })

    it('the latest request still surfaces a non-abort failure as the visible error', async () => {
        const p = runSearch('bakery', new AbortController().signal)
        expect(mockState.pendingSearch).toHaveLength(1)

        rejectSearch(0, new Error('boom'))
        await p
        expect(mockState.searchStatus).toBe('error')
        expect(mockState.searchError).toEqual({
            query: 'bakery',
            type: 'full',
            message: 'boom'
        })
        expect(mockState.publishCalls).toHaveLength(0)
    })
})
