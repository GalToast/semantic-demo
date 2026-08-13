/**
 * search-orchestration-staticdev.test.ts — `?staticDev=0` contract for the
 * DOM-path search orchestration (orchestration.search).
 *
 * W-search-staticdev-orchestration: the store-path search (runSearch in
 * src/lib/stores/search-core.ts) already has a `shouldSurfaceApiFailures()`
 * branch that bypasses the local-index fallback so contract tests can verify
 * the .search-error-state element appears when the API fails. The DOM path
 * (orchestration.search) was missing the same branch — it ALWAYS ran the
 * 3s/7s fast-fail wrapper and the local-index fallback, even when the URL
 * had `?staticDev=0`. The two paths diverged.
 *
 * These tests cover the orchestration path's `?staticDev=0` contract:
 *   1. Local index is NOT consulted.
 *   2. The 3s feedback / 7s local-fallback timer never fires.
 *   3. The API error is surfaced (applySemanticSearchDegradedState +
 *      SEARCH_DEGRADED publish) instead of being replaced.
 *   4. On a fast API success in `?staticDev=0` mode, results commit cleanly
 *      without the fast-fail timer firing.
 *
 * No PHP/server required — every collaborator (performSearch, the local
 * index, shouldSurfaceApiFailures, the toast module, results-ui, etc.) is
 * mocked. Fast-fail timing uses fake timers so the 3s/7s window is
 * exercised without real waits.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

    return {
        performSearch: vi.fn(),
        performLocalIndexSearch: vi.fn(),
        localHitsToResults: vi.fn(),
        shouldSurfaceApiFailures: vi.fn(() => false),
        showExperienceToast: vi.fn(),
        applySemanticSearchDegradedState: vi.fn(),
        renderSearchResultItems: vi.fn(),
        publish: vi.fn(),
        _apiResolve: () => _apiResolve,
        _apiReject: () => _apiReject,
        _resetApiPromise,
    }
})

vi.mock('@lib/search-engine', () => ({
    performSearch: mocks.performSearch,
    initSearchEngine: vi.fn(),
    getSearchEngineEmptyStateSuggestions: vi.fn(() => ['Restaurant', 'Retail']),
    getSearchEngineDiagnostics: vi.fn(() => ({ canUseStaticDevFallback: false }))
}))

vi.mock('@lib/search/local-search-index', () => ({
    performLocalIndexSearch: mocks.performLocalIndexSearch,
    localHitsToResults: mocks.localHitsToResults,
    getSearchEngineEmptyStateSuggestions: vi.fn(() => ['Restaurant', 'Retail']),
    shouldPreferLiveSearch: vi.fn(() => false)
}))

vi.mock('@lib/search/mock-search-fallback', () => ({
    shouldSurfaceApiFailures: mocks.shouldSurfaceApiFailures
}))

vi.mock('@lib/orchestration/toast', () => ({
    showExperienceToast: mocks.showExperienceToast,
    dismissToast: vi.fn(),
    showWarningToast: vi.fn(),
    showErrorToast: vi.fn(),
    showToastSpec: vi.fn(),
    clearToastQueue: vi.fn()
}))

vi.mock('@lib/orchestration/event-bus', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@lib/orchestration/event-bus')>()
    return {
        ...actual,
        publish: mocks.publish
    }
})

vi.mock('@lib/search/results-ui', () => ({
    setSearchPanelState: vi.fn(),
    renderSearchResultItems: mocks.renderSearchResultItems,
    applySemanticSearchDegradedState: mocks.applySemanticSearchDegradedState,
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
    updateSearchStatusMessage: vi.fn()
}))

vi.mock('@lib/search/search-panel-adapter', () => ({
    setupMobileSearchSheetToggle: vi.fn(),
    setSearchContainerState: vi.fn(),
    setSearchGlowState: vi.fn()
}))

vi.mock('@lib/search/search-abort', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@lib/search/search-abort')>()
    return {
        ...actual,
        cancelSearch: vi.fn()
    }
})

vi.mock('@lib/search/result-renderer', () => ({
    setActiveSearchResultRow: vi.fn()
}))

vi.mock('@lib/utils/dom-formatters', () => ({
    formatBusinessName: vi.fn((name: string) => name || 'Unknown')
}))

vi.mock('@lib/utils/debug', () => ({
    debugWarn: vi.fn(),
    debugLog: vi.fn()
}))

vi.mock('@lib/utils/ui-presentation', () => ({
    isCompactSearchViewport: vi.fn(() => false),
    shouldLogStaticDevFallback: vi.fn(() => false)
}))

vi.mock('@lib/journey/search-trail-cue-renderer', () => ({
    updateSearchTrailCue: vi.fn()
}))

vi.mock('@lib/data-store', () => ({
    getBusinessRecords: vi.fn(() => []),
    getPointIndexByLeadId: vi.fn(() => ({}))
}))

import { search } from '@lib/search/orchestration'
import { clearSearch, resetSearchForTests, searchStore } from '@lib/stores/search.svelte'
import { resetSearchAbort } from '@lib/search/search-abort'
import { EVENTS } from '@lib/orchestration/event-bus'

// Mirror the 7000ms fast-fail window so the regression test can advance past
// it and assert the local-fallback timer never fired.
const FAST_FAIL_MS = 7000
const FEEDBACK_DELAY_MS = 3000

function makeSearchResult(index: number, name: string, score = 1): Record<string, unknown> {
    return {
        id: String(index),
        name,
        index,
        score,
        category: '',
        snippet: '',
        point: { name, what: '', cluster: 0, city: '', website: '', email: '', phone: '' }
    }
}

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

describe('orchestration.search ?staticDev=0 contract', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-08-12T12:00:00Z'))
        mocks._resetApiPromise()
        setupSearchDOM()

        vi.clearAllMocks()
        mocks.shouldSurfaceApiFailures.mockReturnValue(false)
        // Local index is the canary for the bug: in ?staticDev=0 the fast-fail
        // wrapper must be skipped, so this is never consulted.
        mocks.performLocalIndexSearch.mockReturnValue([
            { recordIndex: 0, score: 1, field: 'name' as const }
        ])
        mocks.localHitsToResults.mockImplementation((hits: Array<{ recordIndex: number }>) =>
            (hits ?? []).map((h, i) => makeSearchResult(h.recordIndex, `local-${i}`))
        )

        clearSearch()
        resetSearchForTests?.()
        resetSearchAbort()
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
        teardownSearchDOM()
    })

    it('does NOT consult the local index when API fails under ?staticDev=0', async () => {
        // Pre-fix: orchestration.search ALWAYS ran the 3s/7s fast-fail wrapper,
        // so performLocalIndexSearch was called at 7s even with ?staticDev=0.
        mocks.shouldSurfaceApiFailures.mockReturnValue(true)
        // Keep the API pending past the local fallback window. An immediate
        // rejection would exercise the catch path before the old timer fires
        // and would make this regression test pass without the fix.
        mocks.performSearch.mockImplementation(
            () => new Promise<never>((_, reject) => setTimeout(() => reject(new Error('API 503')), 8000))
        )

        const searchPromise = search('coffee')

        // Advance well past the 7s local-fallback window. The bug: the timer
        // was set up and the local index was consulted; the fix: neither
        // happens under ?staticDev=0.
        await vi.advanceTimersByTimeAsync(FAST_FAIL_MS + 1000)
        await searchPromise

        expect(mocks.performLocalIndexSearch).not.toHaveBeenCalled()
    })

    it('does NOT fire the 3s feedback toast under ?staticDev=0 (no fast-fail wrapper)', async () => {
        // The 'Searching local data' toast is the only signal that the fast-fail
        // wrapper was wired. If the wrapper ran, the toast would fire at 3s;
        // if it did not, no toast.
        mocks.shouldSurfaceApiFailures.mockReturnValue(true)
        mocks.performSearch.mockImplementation(
            () => new Promise<never>((_, reject) => setTimeout(() => reject(new Error('API 503')), 8000))
        )

        const searchPromise = search('coffee')
        await vi.advanceTimersByTimeAsync(FEEDBACK_DELAY_MS + 1000)

        expect(mocks.showExperienceToast).not.toHaveBeenCalledWith(
            'Searching local data',
            expect.anything()
        )

        // Cleanup
        await vi.advanceTimersByTimeAsync(FAST_FAIL_MS)
        await searchPromise
    })

    it('surfaces the API error via applySemanticSearchDegradedState (preserves degraded-state render)', async () => {
        // The contract: under ?staticDev=0 the API failure is surfaced through
        // the existing degraded-state render path, not silently replaced.
        mocks.shouldSurfaceApiFailures.mockReturnValue(true)
        mocks.performSearch.mockImplementation(
            () => new Promise<never>((_, reject) => setTimeout(() => reject(new Error('API 503')), 8000))
        )

        const searchPromise = search('coffee')
        await vi.advanceTimersByTimeAsync(8000)
        await searchPromise

        expect(mocks.applySemanticSearchDegradedState).toHaveBeenCalledTimes(1)
        // The DOM error element comes from results-ui.ts; the error instance
        // here is what triggers it.
        const call = mocks.applySemanticSearchDegradedState.mock.calls[0] as unknown[]
        expect(call[2]).toBe('coffee') // trimmedQuery
        expect((call[3] as Error).message).toBe('API 503')
    })

    it('publishes SEARCH_DEGRADED on API failure under ?staticDev=0 (no silent fallback)', async () => {
        mocks.shouldSurfaceApiFailures.mockReturnValue(true)
        mocks.performSearch.mockImplementation(
            () => new Promise<never>((_, reject) => setTimeout(() => reject(new Error('API 503')), 8000))
        )

        const searchPromise = search('coffee')
        await vi.advanceTimersByTimeAsync(8000)
        await searchPromise

        const degraded = mocks.publish.mock.calls.filter(
            (c: [string, unknown]) => c[0] === EVENTS.SEARCH_DEGRADED
        )
        expect(degraded).toHaveLength(1)
        // No SEARCH_SUCCESS / SEARCH_EMPTY — those are emitted only on a real
        // committed result set, which the local fallback would have produced
        // pre-fix.
        const successes = mocks.publish.mock.calls.filter(
            (c: [string, unknown]) => c[0] === EVENTS.SEARCH_SUCCESS
        )
        const empties = mocks.publish.mock.calls.filter(
            (c: [string, unknown]) => c[0] === EVENTS.SEARCH_EMPTY
        )
        expect(successes).toHaveLength(0)
        expect(empties).toHaveLength(0)
    })

    it('commits API results cleanly when API succeeds fast under ?staticDev=0 (no toast/timer)', async () => {
        // Fast success under ?staticDev=0 must still land in the store without
        // the 3s/7s fast-fail wrapper firing.
        mocks.shouldSurfaceApiFailures.mockReturnValue(true)
        mocks.performSearch.mockResolvedValue([makeSearchResult(5, 'Quick API Cafe', 1)])

        const searchPromise = search('coffee')
        await vi.advanceTimersByTimeAsync(50)
        await searchPromise

        expect(mocks.performLocalIndexSearch).not.toHaveBeenCalled()
        expect(mocks.applySemanticSearchDegradedState).not.toHaveBeenCalled()
        // No fast-fail toast even after advancing well past the window.
        await vi.advanceTimersByTimeAsync(FAST_FAIL_MS + 1000)
        expect(mocks.showExperienceToast).not.toHaveBeenCalledWith(
            'Searching local data',
            expect.anything()
        )
    })

    it('normal mode (?staticDev not set) retains 3s/7s fast-fail behavior (regression guard)', async () => {
        // Lockstep guarantee: the normal-mode path MUST still consult the
        // local index at 7s when the API is slow. Removing the existing
        // fast-fail wrapper for everyone is NOT the fix.
        mocks.shouldSurfaceApiFailures.mockReturnValue(false)
        mocks.performSearch.mockReturnValue(new Promise(() => {})) // never settles
        mocks.performLocalIndexSearch.mockReturnValue([
            { recordIndex: 42, score: 0.9, field: 'name' as const }
        ])

        const searchPromise = search('coffee')
        await vi.advanceTimersByTimeAsync(FAST_FAIL_MS)
        await searchPromise

        expect(mocks.performLocalIndexSearch).toHaveBeenCalledWith('coffee', 0, 18)
        expect(mocks.showExperienceToast).toHaveBeenCalledWith(
            'Searching local data',
            expect.stringContaining('coffee')
        )
    })
})
