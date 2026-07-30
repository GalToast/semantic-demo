import { runSearch, setSearchStatus, setSearchQuery } from '@lib/stores/search.svelte'
import { requestEntryFocus } from '@lib/focus/focus-coordinator'
import { pendingSearch } from '@lib/stores/pending-search.svelte'
import { dispatchNavTransition, NAV_TRANSITION_ACTIONS } from '@lib/stores/navigation.svelte.ts'
import { publish, EVENTS } from '@lib/orchestration/event-bus'
import { showExperienceToast } from '@lib/orchestration/toast'
import { debugWarn } from '@lib/utils/debug'
import { SearchDebounce } from '@lib/search/search-debounce'
import { setMobileSearchSheetMode } from '@lib/search/search-panel-adapter'
import { isCompactSearchViewport } from '@lib/utils/ui-presentation'

import { startSearch, cancelSearch } from '@lib/search/search-abort'

export interface SearchDispatchOptions {
    /** Called when the controller sets a new active query (e.g. splash fulfillment). */
    onQuerySet?: (query: string) => void
    /** Returns the input element when focus needs to be restored. */
    getInputElement?: (() => HTMLElement | undefined) | null
}

/**
 * Owns SearchInput's search orchestration: pending splash-query fulfillment,
 * debounced dispatch, abort/cancel/clear, and surface transition coordination.
 *
 * Extracted from SearchInput.svelte as part of the Wave-2 search-layer cleanup
 * so the component can focus on DOM wiring while this controller owns the
 * imperative search-state transitions. PR-O5 semantics are preserved: every
 * real search routes through runSearch() (the URL-hydration gateway) instead
 * of calling performSearch() directly.
 */
export class SearchDispatch {
    private searchDebounce = new SearchDebounce()
    private searchStartTime = 0
    private surfaceSwitchedToSearch = false
    private onQuerySet: (query: string) => void
    private getInputElement: (() => HTMLElement | undefined) | null

    constructor(options: SearchDispatchOptions = {}) {
        this.onQuerySet = options.onQuerySet ?? (() => {})
        this.getInputElement = options.getInputElement ?? null
    }

    cancelDebounce(): void {
        this.searchDebounce.cancel()
    }

    debounceDispatch(query: string, debounceMs: number): void {
        this.searchDebounce.schedule(() => this.dispatchSearch(query), debounceMs)
    }

    /**
     * Fulfills a staged splash/search query once the engine signals ready.
     * The caller passes the current pending value so the reactive effect that
     * drives this stays the source of truth; the controller consumes the store
     * intent so the same query isn't dispatched twice.
     */
    fulfillPending(stagedQuery: string | null, engineReady: boolean): void {
        if (!engineReady || !stagedQuery) return
        const query = pendingSearch.consume()
        if (!query || query.length < 2) return
        this.onQuerySet(query)
        setSearchQuery(query)
        this.dispatchSearch(query)
        if (this.getInputElement) {
            requestEntryFocus(this.getInputElement, { signal: 'scene-ready' })
        }
    }

    dispatchSearch(query: string): void {
        const trimmed = query.trim()

        if (trimmed.length === 0) {
            dispatchNavTransition(NAV_TRANSITION_ACTIONS.RETURN_OVERVIEW)
            this.surfaceSwitchedToSearch = false
            return
        }

        if (trimmed.length < 2) {
            setSearchStatus('idle')
            if (this.surfaceSwitchedToSearch) {
                dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'idle' })
                this.surfaceSwitchedToSearch = false
            }
            return
        }

        // startSearch handles abort + dedup atomically: if the same query is
        // already in flight the existing signal is returned (no re-abort);
        // otherwise the previous search is aborted and a fresh controller is
        // created. dispatchSearch now gates on the returned `isNew` flag,
        // matching orchestration.search and _restoreSearchFromParams, so a
        // duplicate same-query event does not re-fire setSearchStatus / nav
        // transition / runSearch. The duration timer is captured AFTER the
        // bail so a duplicate event does not reset it.
        const { signal, isNew } = startSearch(trimmed)
        if (!isNew) return
        this.searchStartTime = performance.now()
        setSearchStatus('searching')
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'search' })
        this.surfaceSwitchedToSearch = true

        if (isCompactSearchViewport() && !document.body.dataset.mobileSearchSheet) {
            setMobileSearchSheetMode('peek')
        }

        runSearch(trimmed, signal).catch((err: unknown) => {
            // runSearch already handles AbortError + setSearchError internally;
            // only catch non-AbortError so a hung promise doesn't hang the
            // dispatch chain. The intent here is to keep the Svelte store's
            // status updated by runSearch's own error path.
            if (err instanceof DOMException && err.name === 'AbortError') return
            // Fallback: some environments may reject with a plain Error whose
            // name is 'AbortError', or the signal may be aborted without a
            // proper DOMException. Suppress the warning in those cases too.
            if (signal.aborted) return
            debugWarn('SearchInput.dispatchSearch runSearch failed:', err)
        })
    }

    cancel(cancelledQuery: string): void {
        cancelSearch()
        this.searchDebounce.cancel()
        const durationMs = this.searchStartTime > 0 ? Math.round(performance.now() - this.searchStartTime) : 0
        setSearchStatus('idle')
        publish(EVENTS.SEARCH_CANCELLED, { query: cancelledQuery, durationMs })
        this.searchStartTime = 0
        // W52-UX-cancel: surface a transient toast so the user has visible feedback
        // that their cancel took effect. Only show if a query was actually in flight
        // — avoids noisy toasts on a stray Escape / click.
        if (cancelledQuery.length > 0) {
            showExperienceToast('Search cancelled', 'Cancelled mid-search. Try a different term or refine the query.')
        }
    }

    clear(): void {
        this.searchDebounce.cancel()
        cancelSearch()
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.RETURN_OVERVIEW)
        this.surfaceSwitchedToSearch = false
    }

    clearQuery(): void {
        this.searchDebounce.cancel()
        cancelSearch()
        setSearchStatus('idle')
    }

    dispose(): void {
        this.searchDebounce.cancel()
        // NOTE: do NOT cancel the in-flight search here. Search is a global
        // async operation (owned by the shared search-abort controller) and the
        // SearchInput/SearchBar instances can remount during the idle→search
        // surface transition. Cancelling on unmount would abort a user-initiated
        // search right after it was dispatched, leaving the results panel empty.
        // Explicit cancellation is handled by cancel()/clear() instead.
    }
}
