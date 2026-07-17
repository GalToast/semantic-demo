import {
    runSearch,
    setSearchStatus,
    setSearchQuery
} from '@lib/stores/search.svelte'
import { requestEntryFocus } from '@lib/focus/focus-coordinator'
import { pendingSearch } from '@lib/stores/pending-search.svelte'
import {
    dispatchNavTransition,
    NAV_TRANSITION_ACTIONS
} from '@lib/stores/navigation.svelte.ts'
import { publish, EVENTS } from '@lib/orchestration/event-bus'
import { showExperienceToast } from '@lib/orchestration/toast'
import { debugWarn } from '@lib/utils/debug'
import { SearchDebounce } from '@lib/search/search-debounce'

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
    private searchAbortController: AbortController | null = null
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
        if (this.searchAbortController) {
            this.searchAbortController.abort()
            this.searchAbortController = null
        }

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

        this.searchAbortController = new AbortController()
        this.searchStartTime = performance.now()
        const signal = this.searchAbortController.signal
        setSearchStatus('searching')
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.SET_SURFACE, { surface: 'search' })
        this.surfaceSwitchedToSearch = true

        runSearch(trimmed, signal)
            .catch((err: unknown) => {
                // runSearch already handles AbortError + setSearchError internally;
                // only catch non-AbortError so a hung promise doesn't hang the
                // dispatch chain. The intent here is to keep the Svelte store's
                // status updated by runSearch's own error path.
                if (err instanceof DOMException && err.name === 'AbortError') return
                debugWarn('SearchInput.dispatchSearch runSearch failed:', err)
            })
    }

    cancel(cancelledQuery: string): void {
        if (this.searchAbortController) {
            this.searchAbortController.abort()
            this.searchAbortController = null
        }
        this.searchDebounce.cancel()
        const durationMs = this.searchStartTime > 0 ? Math.round(performance.now() - this.searchStartTime) : 0
        setSearchStatus('idle')
        publish(EVENTS.SEARCH_CANCELLED, { query: cancelledQuery, durationMs })
        this.searchStartTime = 0
        // W52-UX-cancel: surface a transient toast so the user has visible feedback
        // that their cancel took effect. Only show if a query was actually in flight
        // — avoids noisy toasts on a stray Escape / click.
        if (cancelledQuery.length > 0) {
            showExperienceToast(
                'Search cancelled',
                'Cancelled mid-search. Try a different term or refine the query.'
            )
        }
    }

    clear(): void {
        this.searchDebounce.cancel()
        if (this.searchAbortController) {
            this.searchAbortController.abort()
            this.searchAbortController = null
        }
        dispatchNavTransition(NAV_TRANSITION_ACTIONS.RETURN_OVERVIEW)
        this.surfaceSwitchedToSearch = false
    }

    clearQuery(): void {
        this.searchDebounce.cancel()
        if (this.searchAbortController) {
            this.searchAbortController.abort()
            this.searchAbortController = null
        }
        setSearchStatus('idle')
    }

    dispose(): void {
        this.searchDebounce.cancel()
        this.searchAbortController?.abort()
        this.searchAbortController = null
    }
}
