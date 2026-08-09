/**
 * search-slow-api-timing.test.ts — Fast-fail UX: slow/absent API must NOT
 * leave the user staring at a spinner for ~25s.
 *
 * Verifies:
 *   1. Toast fires at ~3s when API is still slow (first feedback).
 *   2. Local-index fallback resolves by ~7s (cap < 8s).
 *   3. When API is fast (<3s), no toast and API results are used.
 *   4. When API eventually completes after fallback, stale results are
 *      ignored (no double-write).
 *
 * Mocks the search engine and local-index layer; does not depend on live
 * PHP or a running dev server. Uses fake timers (vi.useFakeTimers) for
 * deterministic timing assertions.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { search } from '@lib/search/orchestration'
import { clearSearch, resetSearchForTests, searchStore } from '@lib/stores/search.svelte'
import { resetSearchAbort } from '@lib/search/search-abort'

// ── Hoisted mocks ──────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
    // Controlled promise for performSearch so tests can resolve/reject on
    // their own timeline.
    let _apiResolve: ((v: unknown[]) => void) | null = null
    let _apiReject: ((e: Error) => void) | null = null

    const _resetApiPromise = () => {
        _apiResolve = null
        _apiReject = null
    }

    const _createApiPromise = () => {
        return new Promise<unknown[]>((resolve, reject) => {
            _apiResolve = resolve
            _apiReject = reject
        })
    }

    return {
        performSearch: vi.fn(),
        performLocalIndexSearch: vi.fn(),
        localHitsToResults: vi.fn(),
        showExperienceToast: vi.fn(),
        publish: vi.fn(),
        // Controls to drive the mocked performSearch from within tests
        _apiResolve: () => _apiResolve,
        _apiReject: () => _apiReject,
        _resetApiPromise,
        _createApiPromise,
    }
})

vi.mock('@lib/search-engine', () => ({
    performSearch: mocks.performSearch,
    initSearchEngine: vi.fn(),
    getSearchEngineEmptyStateSuggestions: vi.fn(() => ['Restaurant', 'Retail']),
    getSearchEngineDiagnostics: vi.fn(() => ({ canUseStaticDevFallback: false })),
}))

vi.mock('@lib/search/local-search-index', () => ({
    performLocalIndexSearch: mocks.performLocalIndexSearch,
    localHitsToResults: mocks.localHitsToResults,
    getSearchEngineEmptyStateSuggestions: vi.fn(() => ['Restaurant', 'Retail']),
    shouldPreferLiveSearch: vi.fn(() => false),
}))

vi.mock('@lib/orchestration/toast', () => ({
    showExperienceToast: mocks.showExperienceToast,
    dismissToast: vi.fn(),
    showWarningToast: vi.fn(),
    showErrorToast: vi.fn(),
    showToastSpec: vi.fn(),
    clearToastQueue: vi.fn(),
}))

vi.mock('@lib/orchestration/event-bus', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@lib/orchestration/event-bus')>()
    return {
        ...actual,
        publish: mocks.publish ?? actual.publish,
    }
})

vi.mock('@lib/search/results-ui', () => ({
    setSearchPanelState: vi.fn(),
    renderSearchResultItems: vi.fn(),
    applySemanticSearchDegradedState: vi.fn(),
    stopSearchVectorScramble: vi.fn(),
    startSearchVectorScramble: vi.fn(),
    updateSearchPreviewOverlay: vi.fn(),
    activateSearchGlow: vi.fn(),
    resetSemanticGuideUi: vi.fn(),
    clearShortSemanticSearchState: vi.fn(),
    clearSearchPreviewHoverTimer: vi.fn(),
    setSearchStateNamespace: vi.fn(),
    dedupeNearDuplicateResults: vi.fn((results: unknown[]) => results),
    finishSemanticSearchSuccessState: vi.fn(),
    applyEmptySemanticSearchState: vi.fn(),
    updateSearchStatusMessage: vi.fn(),
}))

vi.mock('@lib/search/search-panel-adapter', () => ({
    setupMobileSearchSheetToggle: vi.fn(),
    setSearchContainerState: vi.fn(),
    setSearchGlowState: vi.fn(),
}))

vi.mock('@lib/search/search-abort', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@lib/search/search-abort')>()
    return {
        ...actual,
        cancelSearch: vi.fn(),
    }
})

vi.mock('@lib/search/result-renderer', () => ({
    setActiveSearchResultRow: vi.fn(),
}))

vi.mock('@lib/utils/dom-formatters', () => ({
    formatBusinessName: vi.fn((name: string) => name || 'Unknown'),
}))

vi.mock('@lib/utils/debug', () => ({
    debugWarn: vi.fn(),
    debugLog: vi.fn(),
}))

vi.mock('@lib/utils/ui-presentation', () => ({
    isCompactSearchViewport: vi.fn(() => false),
    shouldLogStaticDevFallback: vi.fn(() => false),
}))

vi.mock('@lib/journey/search-trail-cue-renderer', () => ({
    updateSearchTrailCue: vi.fn(),
}))

vi.mock('@lib/data-store', () => ({
    getBusinessRecords: vi.fn(() => []),
    getPointIndexByLeadId: vi.fn(() => ({})),
}))

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Helper: create minimal search result objects matching the SearchResult
 * shape the orchestration layer expects.
 */
function makeSearchResult(index: number, name: string, score = 1): Record<string, unknown> {
    return {
        id: String(index),
        name,
        index,
        score,
        category: '',
        snippet: '',
        point: { name, what: '', cluster: 0, city: '', website: '', email: '', phone: '' },
    }
}

/**
 * Precondition the DOM so orchestration.search() doesn't bail due to
 * missing elements.
 */
function setupSearchDOM(): { resultsEl: HTMLElement; statusEl: HTMLElement; inputEl: HTMLInputElement } {
    const resultsEl = document.createElement('div')
    resultsEl.id = 'search-results'
    const statusEl = document.createElement('div')
    statusEl.id = 'search-status'
    const inputEl = document.createElement('input')
    inputEl.id = 'search-input'
    document.body.appendChild(resultsEl)
    document.body.appendChild(statusEl)
    document.body.appendChild(inputEl)
    return { resultsEl, statusEl, inputEl }
}

function teardownSearchDOM(): void {
    document.getElementById('search-results')?.remove()
    document.getElementById('search-status')?.remove()
    document.getElementById('search-input')?.remove()
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('search slow-API fast-fail timing', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        // Pin system time so Date.now() is deterministic.
        vi.setSystemTime(new Date('2026-08-10T12:00:00Z'))
        mocks._resetApiPromise()
        setupSearchDOM()

        // Reset all mocks so call history from previous tests does not leak.
        vi.clearAllMocks()

        // Default: local index returns 3 hits.
        mocks.performLocalIndexSearch.mockReturnValue([
            { index: 42, score: 0.9, name: 'Local Cafe' },
            { index: 100, score: 0.7, name: 'Local Bistro' },
            { index: 7, score: 0.5, name: 'Local Diner' },
        ])
        mocks.localHitsToResults.mockImplementation((hits: Array<{ index: number; score: number; name: string }>) =>
            hits.map((h) => makeSearchResult(h.index, h.name, h.score))
        )

        // Reset search state + abort singleton between tests.
        clearSearch()
        resetSearchForTests?.()
        resetSearchAbort()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
        teardownSearchDOM()
    })

    it('uses API results when API responds before the feedback window (<3s)', async () => {
        // Arrange: API resolves quickly with a result.
        const apiPromise = new Promise<unknown[]>((resolve) => {
            setTimeout(() => resolve([makeSearchResult(5, 'Quick API Cafe', 1)]), 500)
        })
        mocks.performSearch.mockReturnValue(apiPromise)

        // Act: start search, advance just past API resolution.
        const searchPromise = search('coffee')
        await vi.advanceTimersByTimeAsync(600)

        await searchPromise

        // Assert: toast was NOT shown (fast enough).
        expect(mocks.showExperienceToast).not.toHaveBeenCalled()

        // The store should have the API results (deduped).
        const state = searchStore()
        expect(state.summary).not.toBeNull()
        expect(state.summary!.query).toBe('coffee')
        expect(state.summary!.resultIndices).toContain(5)
    })

    it('shows feedback toast at ~3s when API is still pending', async () => {
        // Arrange: API never resolves (perpetually pending).
        mocks.performSearch.mockReturnValue(new Promise(() => {})) // never settles

        // Act: start search, advance past feedback threshold but before
        // fast-fail cutoff.
        const searchPromise = search('coffee')
        await vi.advanceTimersByTimeAsync(3500)

        // Assert: feedback toast fired.
        expect(mocks.showExperienceToast).toHaveBeenCalledWith(
            'Searching local data',
            expect.stringContaining('coffee')
        )

        // Cleanup: let fast-fail resolve so the promise doesn't hang.
        await vi.advanceTimersByTimeAsync(4000)
        await searchPromise
    })

    it('falls back to local index and returns results by 7s (cap < 8s)', async () => {
        // Arrange: API never resolves; local index has hits.
        mocks.performSearch.mockReturnValue(new Promise(() => {})) // never settles

        // Act: start search, advance past the fast-fail threshold.
        const searchPromise = search('coffee')
        await vi.advanceTimersByTimeAsync(7500)

        await searchPromise

        // Assert: local index was searched.
        expect(mocks.performLocalIndexSearch).toHaveBeenCalledWith('coffee', 0, 18)

        // Assert: toast fired.
        expect(mocks.showExperienceToast).toHaveBeenCalled()

        // Assert: store has local results.
        const state = searchStore()
        expect(state.summary).not.toBeNull()
        expect(state.summary!.resultIndices).toContain(42)
    })

    it('does NOT double-write store when stale API resolves after fast-fail', async () => {
        // Arrange: API resolves late (after fast-fail already used local
        // index). We simulate this with a controlled promise.
        let resolveApi: (v: unknown[]) => void = () => {}
        const apiPromise = new Promise<unknown[]>((resolve) => {
            resolveApi = resolve
        })
        mocks.performSearch.mockReturnValue(apiPromise)

        // Act: start search and advance past fast-fail.
        const searchPromise = search('coffee')
        await vi.advanceTimersByTimeAsync(7500)
        // Fast-fail should have resolved with local results by now.
        await searchPromise

        // Verify local results are in the store.
        const stateBefore = searchStore()
        expect(stateBefore.summary!.resultIndices).toContain(42)

        // Now the stale API resolves with different results.
        resolveApi([makeSearchResult(999, 'Late API Cafe', 1)])
        // Flush microtasks so the .catch(() => {}) swallows the late promise.
        await vi.advanceTimersByTimeAsync(0)

        // Assert: store still has local results (not overwritten by late API).
        const stateAfter = searchStore()
        expect(stateAfter.summary!.resultIndices).toContain(42)
        // The late API result (index 999) should NOT appear.
        expect(stateAfter.summary!.resultIndices).not.toContain(999)
    })

    it('shows toast only once when feedback timer fires before fallback', async () => {
        // Arrange: API never resolves.
        mocks.performSearch.mockReturnValue(new Promise(() => {}))

        // Act: advance past both feedback (3s) and fallback (7s).
        const toastSpy = vi.fn()
        mocks.showExperienceToast.mockImplementation(toastSpy)

        const searchPromise = search('coffee')
        await vi.advanceTimersByTimeAsync(7500)
        await searchPromise

        // Assert: the fast-fail path called toast at least once with the
        // expected message. (Other parts of the search lifecycle may also
        // call toast — we only care that the fast-fail feedback fired.)
        const fastFailCalls = toastSpy.mock.calls.filter(
            (call: [string, string]) =>
                call[0] === 'Searching local data' && call[1].includes('coffee')
        )
        expect(fastFailCalls.length).toBe(1)
    })

    it('cleans up fast-fail timers when API wins the race (no toast leak)', async () => {
        // Arrange: API resolves quickly.
        mocks.performSearch.mockResolvedValue([makeSearchResult(1, 'Fast API', 1)])

        const toastSpy = vi.fn()
        mocks.showExperienceToast.mockImplementation(toastSpy)

        // Act: start search, advance just enough for API to resolve.
        const searchPromise = search('coffee')
        await vi.advanceTimersByTimeAsync(100)
        await searchPromise

        // If timers leaked, they would fire later. Advance well past them.
        await vi.advanceTimersByTimeAsync(10000)

        // Assert: the fast-fail 'Searching local data' toast was NOT called
        // (proves both feedback + fallback timers were cleared).
        const fastFailCalls = toastSpy.mock.calls.filter(
            (call: [string, string]) => call[0] === 'Searching local data'
        )
        expect(fastFailCalls.length).toBe(0)
    })

    it('handles empty local index gracefully (returns empty, not crash)', async () => {
        // Arrange: API never resolves; local index returns null.
        mocks.performSearch.mockReturnValue(new Promise(() => {}))
        mocks.performLocalIndexSearch.mockReturnValue(null)

        // Act: advance past fast-fail.
        const searchPromise = search('coffee')
        await vi.advanceTimersByTimeAsync(7500)

        // Must not throw.
        await expect(searchPromise).resolves.toBeUndefined()

        // Assert: store shows empty state.
        const state = searchStore()
        // With empty results the orchestration sets status to 'empty'.
        expect(state.status).toBe('empty')
    })
})
