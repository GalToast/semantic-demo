/**
 * @vitest-environment jsdom
 *
 * Unit coverage for the search-dispatch controller extracted from
 * SearchInput.svelte. The controller owns the search-orchestration logic
 * (pending-intent fulfillment, debounce, abort, cancel, clear) and depends
 * on the search/nav stores and event bus, but owns no component state.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SearchDispatch } from '@lib/search/search-dispatch'
import { resetSearchAbort } from '@lib/search/search-abort'

const mocks = vi.hoisted(() => {
    let navCurrentView = 'galaxy'
    const navStore = () => ({ currentView: navCurrentView })
    // Minimal readable-store surface so svelte/store.get(navStore) works
    // (the real navStore is a callable + Readable hybrid).
    ;(navStore as { subscribe?: (run: (v: { currentView: string }) => void) => () => void }).subscribe = (
        run: (v: { currentView: string }) => void
    ) => {
        run({ currentView: navCurrentView })
        return () => {}
    }
    return {
        runSearch: vi.fn(),
        cancelSearch: vi.fn(),
        setSearchStatus: vi.fn(),
        setSearchQuery: vi.fn(),
        dispatchNavTransition: vi.fn(),
        publish: vi.fn(),
        showExperienceToast: vi.fn(),
        requestEntryFocus: vi.fn(),
        navStore,
        setNavCurrentView: (v: string) => {
            navCurrentView = v
        },
        pendingSearch: {
            value: null as string | null,
            set: vi.fn((q: string) => {
                mocks.pendingSearch.value = q
            }),
            consume: vi.fn(() => {
                const v = mocks.pendingSearch.value
                mocks.pendingSearch.value = null
                return v
            })
        }
    }
})

vi.mock('@lib/stores/search.svelte', () => ({
    runSearch: mocks.runSearch,
    setSearchStatus: mocks.setSearchStatus,
    setSearchQuery: mocks.setSearchQuery
}))

vi.mock('@lib/search/search-abort', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@lib/search/search-abort')>()
    return {
        ...actual,
        cancelSearch: mocks.cancelSearch
    }
})

vi.mock('@lib/stores/navigation.svelte.ts', () => ({
    dispatchNavTransition: mocks.dispatchNavTransition,
    NAV_TRANSITION_ACTIONS: {
        SET_SURFACE: 'SET_SURFACE',
        RETURN_OVERVIEW: 'RETURN_OVERVIEW'
    },
    // navStore: callable store-shaped read (navStore() or get(navStore))
    // with a minimal subscribe for svelte/store.get(). Default view is
    // galaxy; the map-preserve test flips it via mocks.setNavCurrentView.
    navStore: mocks.navStore
}))

vi.mock('@lib/orchestration/event-bus', () => ({
    publish: mocks.publish,
    EVENTS: { SEARCH_CANCELLED: 'SEARCH_CANCELLED' }
}))

vi.mock('@lib/orchestration/toast', () => ({
    showExperienceToast: mocks.showExperienceToast
}))

vi.mock('@lib/focus/focus-coordinator', () => ({
    requestEntryFocus: mocks.requestEntryFocus
}))

vi.mock('@lib/stores/pending-search.svelte', () => ({
    pendingSearch: mocks.pendingSearch
}))

describe('SearchDispatch', () => {
    let dispatch: SearchDispatch
    const inputEl = document.createElement('input')
    const onQuerySet = vi.fn()

    beforeEach(() => {
        // search-abort holds a module-level AbortController singleton
        // (currentController / currentQuery). clearAllMocks() does not reset it,
        // so without this the previous test's in-flight controller leaks in
        // and startSearch() returns isNew:false — which dispatchSearch now
        // honors (the BUG-002 consolidate-on-isNew fix). Reset per test.
        resetSearchAbort()
        vi.clearAllMocks()
        mocks.pendingSearch.value = null
        mocks.setNavCurrentView('galaxy')
        dispatch = new SearchDispatch({
            onQuerySet,
            getInputElement: () => inputEl
        })
    })

    it('returns overview on empty query', () => {
        // F1 (orch sweep 2026-08-07): empty dispatch must ALSO cancel any
        // in-flight search + settle idle — the old behavior skipped cancel, so
        // a settling search resurrected stale results after the user cleared.
        dispatch.dispatchSearch('')
        expect(mocks.dispatchNavTransition).toHaveBeenCalledWith('RETURN_OVERVIEW')
        expect(mocks.cancelSearch).toHaveBeenCalled()
        expect(mocks.setSearchStatus).toHaveBeenCalledWith('idle')
        expect(mocks.runSearch).not.toHaveBeenCalled()
    })

    it('sets idle on short query without running search', () => {
        dispatch.dispatchSearch('x')
        expect(mocks.setSearchStatus).toHaveBeenCalledWith('idle')
        expect(mocks.runSearch).not.toHaveBeenCalled()
    })

    it('sets idle and returns to search surface when short query follows a real search', () => {
        mocks.runSearch.mockResolvedValue(undefined)
        dispatch.dispatchSearch('coffee')
        vi.clearAllMocks()
        dispatch.dispatchSearch('x')
        expect(mocks.setSearchStatus).toHaveBeenCalledWith('idle')
        expect(mocks.dispatchNavTransition).toHaveBeenCalledWith('SET_SURFACE', { surface: 'idle' })
    })

    it('dispatches a valid query with searching status and surface switch', () => {
        mocks.runSearch.mockResolvedValue(undefined)
        dispatch.dispatchSearch('coffee')
        expect(mocks.setSearchStatus).toHaveBeenCalledWith('searching')
        expect(mocks.dispatchNavTransition).toHaveBeenCalledWith('SET_SURFACE', { surface: 'search' })
        expect(mocks.runSearch).toHaveBeenCalledWith('coffee', expect.any(AbortSignal))
    })

    it('preserves the map view: skips the search-surface lift while currentView is map', () => {
        // W-map-preserve: a search dispatched from the map view must NOT lift
        // the search surface as a galaxy-bound transition (a late debounced
        // re-dispatch would otherwise clobber a user-initiated map switch).
        mocks.runSearch.mockResolvedValue(undefined)
        mocks.setNavCurrentView('map')
        dispatch.dispatchSearch('coffee')
        expect(mocks.setSearchStatus).toHaveBeenCalledWith('searching')
        expect(mocks.dispatchNavTransition).not.toHaveBeenCalledWith('SET_SURFACE', { surface: 'search' })
        expect(mocks.runSearch).toHaveBeenCalledWith('coffee', expect.any(AbortSignal))
    })

    it('aborts previous search when dispatching a new one', async () => {
        mocks.runSearch.mockResolvedValue(undefined)
        dispatch.dispatchSearch('coffee')
        const firstCall = mocks.runSearch.mock.calls[0]![1] as AbortSignal
        expect(firstCall.aborted).toBe(false)

        dispatch.dispatchSearch('tea')
        expect(firstCall.aborted).toBe(true)
        expect(mocks.runSearch).toHaveBeenCalledTimes(2)
    })

    it('does not re-fire runSearch when the same query is already in flight (BUG-002 isNew gate)', () => {
        // The consolidate-on-isNew fix: a duplicate same-query dispatch bails
        // before re-firing setSearchStatus / nav transition / runSearch,
        // matching orchestration.search and _restoreSearchFromParams.
        mocks.runSearch.mockResolvedValue(undefined)
        dispatch.dispatchSearch('coffee')
        expect(mocks.runSearch).toHaveBeenCalledTimes(1)
        expect(mocks.setSearchStatus).toHaveBeenCalledWith('searching')
        expect(mocks.dispatchNavTransition).toHaveBeenCalledWith('SET_SURFACE', { surface: 'search' })

        // Second dispatch with the SAME query — startSearch returns isNew:false,
        // so dispatchSearch bails and does not re-fire the side effects.
        vi.clearAllMocks()
        dispatch.dispatchSearch('coffee')
        expect(mocks.runSearch).not.toHaveBeenCalled()
        expect(mocks.setSearchStatus).not.toHaveBeenCalled()
        expect(mocks.dispatchNavTransition).not.toHaveBeenCalled()
    })

    it('cancels in-flight search and emits SEARCH_CANCELLED', () => {
        mocks.runSearch.mockResolvedValue(undefined)
        dispatch.dispatchSearch('coffee')
        dispatch.cancel('coffee')
        expect(mocks.setSearchStatus).toHaveBeenCalledWith('idle')
        expect(mocks.publish).toHaveBeenCalledWith('SEARCH_CANCELLED', expect.objectContaining({ query: 'coffee' }))
    })

    it('shows a toast when cancelling a non-empty query', () => {
        dispatch.cancel('coffee')
        expect(mocks.showExperienceToast).toHaveBeenCalledWith(
            'Search cancelled',
            'Cancelled mid-search. Try a different term or refine the query.'
        )
    })

    it('does not show a toast when cancelling an empty query', () => {
        dispatch.cancel('')
        expect(mocks.showExperienceToast).not.toHaveBeenCalled()
    })

    it('clearQuery cancels debounce and resets status', () => {
        dispatch.clearQuery()
        expect(mocks.setSearchStatus).toHaveBeenCalledWith('idle')
    })

    it('clear returns to overview', () => {
        dispatch.clear()
        expect(mocks.dispatchNavTransition).toHaveBeenCalledWith('RETURN_OVERVIEW')
    })

    it('debounces dispatch by the requested delay', () => {
        vi.useFakeTimers()
        mocks.runSearch.mockResolvedValue(undefined)
        dispatch.debounceDispatch('coffee', 300)
        expect(mocks.runSearch).not.toHaveBeenCalled()
        vi.advanceTimersByTime(299)
        expect(mocks.runSearch).not.toHaveBeenCalled()
        vi.advanceTimersByTime(1)
        expect(mocks.runSearch).toHaveBeenCalledWith('coffee', expect.any(AbortSignal))
        vi.useRealTimers()
    })

    it('cancelDebounce prevents a scheduled search from firing', () => {
        vi.useFakeTimers()
        mocks.runSearch.mockResolvedValue(undefined)
        dispatch.debounceDispatch('coffee', 300)
        dispatch.cancelDebounce()
        vi.advanceTimersByTime(300)
        expect(mocks.runSearch).not.toHaveBeenCalled()
        vi.useRealTimers()
    })

    it('fulfills a staged splash query when the engine and data are ready', () => {
        mocks.pendingSearch.set('coffee')
        mocks.runSearch.mockResolvedValue(undefined)
        dispatch.fulfillPending('coffee', true, true)
        expect(onQuerySet).toHaveBeenCalledWith('coffee')
        expect(mocks.setSearchQuery).toHaveBeenCalledWith('coffee')
        expect(mocks.runSearch).toHaveBeenCalledWith('coffee', expect.any(AbortSignal))
        expect(mocks.requestEntryFocus).toHaveBeenCalled()
    })

    it('defers a staged query when the data index has not loaded yet (Path-C data gate)', () => {
        mocks.pendingSearch.set('coffee')
        mocks.runSearch.mockResolvedValue(undefined)

        // Data not ready: fulfillPending must bail BEFORE consuming the staged
        // intent so the reactive effect can re-fire it once isDataReady flips.
        dispatch.fulfillPending('coffee', true, false)
        expect(mocks.pendingSearch.consume).not.toHaveBeenCalled()
        expect(onQuerySet).not.toHaveBeenCalled()
        expect(mocks.runSearch).not.toHaveBeenCalled()

        // Data loads → same staged query fulfills (mirrors the effect retry).
        dispatch.fulfillPending('coffee', true, true)
        expect(onQuerySet).toHaveBeenCalledWith('coffee')
        expect(mocks.runSearch).toHaveBeenCalledWith('coffee', expect.any(AbortSignal))
    })

    it('ignores a pending splash query that is too short', () => {
        mocks.pendingSearch.set('x')
        dispatch.fulfillPending('x', true, true)
        expect(onQuerySet).not.toHaveBeenCalled()
        expect(mocks.runSearch).not.toHaveBeenCalled()
    })

    it('does nothing when the engine is not ready', () => {
        mocks.pendingSearch.set('coffee')
        dispatch.fulfillPending('coffee', false, true)
        expect(mocks.runSearch).not.toHaveBeenCalled()
    })

    it('does nothing when the data is not ready and stays deferrable', () => {
        mocks.pendingSearch.set('coffee')
        dispatch.fulfillPending('coffee', true, false)
        expect(mocks.pendingSearch.consume).not.toHaveBeenCalled()
        expect(mocks.runSearch).not.toHaveBeenCalled()
    })

    it('does nothing when no query is pending', () => {
        dispatch.fulfillPending(null, true, true)
        expect(mocks.runSearch).not.toHaveBeenCalled()
    })

    it('disposes without throwing even when a search is in flight', () => {
        mocks.runSearch.mockResolvedValue(undefined)
        dispatch.dispatchSearch('coffee')
        expect(() => dispatch.dispose()).not.toThrow()
    })
})
