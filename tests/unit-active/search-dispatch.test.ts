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

const mocks = vi.hoisted(() => ({
    runSearch: vi.fn(),
    setSearchStatus: vi.fn(),
    setSearchQuery: vi.fn(),
    dispatchNavTransition: vi.fn(),
    publish: vi.fn(),
    showExperienceToast: vi.fn(),
    requestEntryFocus: vi.fn(),
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
}))

vi.mock('@lib/stores/search.svelte', () => ({
    runSearch: mocks.runSearch,
    setSearchStatus: mocks.setSearchStatus,
    setSearchQuery: mocks.setSearchQuery
}))

vi.mock('@lib/stores/navigation.svelte.ts', () => ({
    dispatchNavTransition: mocks.dispatchNavTransition,
    NAV_TRANSITION_ACTIONS: {
        SET_SURFACE: 'SET_SURFACE',
        RETURN_OVERVIEW: 'RETURN_OVERVIEW'
    }
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
        vi.clearAllMocks()
        mocks.pendingSearch.value = null
        dispatch = new SearchDispatch({
            onQuerySet,
            getInputElement: () => inputEl
        })
    })

    it('returns overview on empty query', () => {
        dispatch.dispatchSearch('')
        expect(mocks.dispatchNavTransition).toHaveBeenCalledWith('RETURN_OVERVIEW')
        expect(mocks.setSearchStatus).not.toHaveBeenCalled()
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

    it('aborts previous search when dispatching a new one', async () => {
        mocks.runSearch.mockResolvedValue(undefined)
        dispatch.dispatchSearch('coffee')
        const firstCall = mocks.runSearch.mock.calls[0]![1] as AbortSignal
        expect(firstCall.aborted).toBe(false)

        dispatch.dispatchSearch('tea')
        expect(firstCall.aborted).toBe(true)
        expect(mocks.runSearch).toHaveBeenCalledTimes(2)
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

    it('fulfills a staged splash query when the engine is ready', () => {
        mocks.pendingSearch.set('coffee')
        mocks.runSearch.mockResolvedValue(undefined)
        dispatch.fulfillPending('coffee', true)
        expect(onQuerySet).toHaveBeenCalledWith('coffee')
        expect(mocks.setSearchQuery).toHaveBeenCalledWith('coffee')
        expect(mocks.runSearch).toHaveBeenCalledWith('coffee', expect.any(AbortSignal))
        expect(mocks.requestEntryFocus).toHaveBeenCalled()
    })

    it('ignores a pending splash query that is too short', () => {
        mocks.pendingSearch.set('x')
        dispatch.fulfillPending('x', true)
        expect(onQuerySet).not.toHaveBeenCalled()
        expect(mocks.runSearch).not.toHaveBeenCalled()
    })

    it('does nothing when the engine is not ready', () => {
        mocks.pendingSearch.set('coffee')
        dispatch.fulfillPending('coffee', false)
        expect(mocks.runSearch).not.toHaveBeenCalled()
    })

    it('does nothing when no query is pending', () => {
        dispatch.fulfillPending(null, true)
        expect(mocks.runSearch).not.toHaveBeenCalled()
    })

    it('disposes without throwing even when a search is in flight', () => {
        mocks.runSearch.mockResolvedValue(undefined)
        dispatch.dispatchSearch('coffee')
        expect(() => dispatch.dispose()).not.toThrow()
    })
})
