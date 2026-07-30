/**
 * @lib/search/search-abort.ts — Canonical abort ownership for the search lifecycle.
 *
 * Centralizes the AbortController used by all search paths (SearchDispatch,
 * orchestration.search, URL restoration). This prevents multiple independent
 * controllers from racing or racing each other.
 */

let currentController: AbortController | null = null
let currentQuery = ''

/**
 * Start (or continue) a search for the given query and return the signal to
 * pass to `performSearch`. If the same query is already in flight and not
 * aborted, the same signal is returned so callers can deduplicate. Otherwise
 * any previous search is aborted and a fresh controller is created.
 *
 * Race note (BUG-002, Phase-A find): This function is synchronous and
 * JavaScript is single-threaded, so two synchronous calls cannot interleave
 * mid-body. The race arises when callers perform an `isSearchInFlight(trimmed)`
 * lookup BEFORE calling `startSearch` — that lookup-then-mutate window is
 * non-atomic. The canonical fix is to consolidate lookup + mutation here so
 * callers do a single `startSearch` call instead of check-then-start. That
 * consolidation is now complete: all THREE call sites gate on the returned
 * `isNew` flag — `orchestration.search` (`src/lib/search/orchestration.ts`),
 * `_restoreSearchFromParams` (`src/lib/orchestration/url-state.ts`), AND
 * `SearchDispatch.dispatchSearch` (`src/lib/search/search-dispatch.ts`) —
 * so duplicate same-query events bail before re-firing setSearchStatus,
 * nav transition, or runSearch. This body keeps the abort→create sequence
 * in one synchronous block so no intermediate state is observable between
 * mutations.
 */
export function startSearch(query: string): { signal: AbortSignal; isNew: boolean } {
    const trimmed = query.trim()
    if (currentController && currentQuery === trimmed && !currentController.signal.aborted) {
        return { signal: currentController.signal, isNew: false }
    }
    // Single synchronous block: abort previous, create fresh, set query — no
    // window between mutations where another observer can see torn state.
    currentController?.abort()
    currentController = new AbortController()
    currentQuery = trimmed
    return { signal: currentController.signal, isNew: true }
}

/**
 * Cancel the current search, if any. Guards against null (WARNING-007, Phase-A
 * find) and nulls the ref after abort so a subsequent cancel is a no-op rather
 * than a double-abort on the same (already-aborted) controller.
 */
export function cancelSearch(): void {
    if (!currentController) return
    currentController.abort()
    currentController = null
    currentQuery = ''
}

/** Returns true if a search is currently in flight. */
export function isSearchInFlight(query?: string): boolean {
    if (!currentController || currentController.signal.aborted) return false
    return query === undefined || currentQuery === query
}

/** Reset ownership (e.g., between tests). */
export function resetSearchAbort(): void {
    currentController?.abort()
    currentController = null
    currentQuery = ''
}
