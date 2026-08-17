/**
 * @lib/orchestration/url-restore-search.ts — query/filter restore
 *
 * Restores the in-flight `q` query and active filters from URL params:
 * run the search, piggyback on an in-flight typed-input search, resolve
 * non-numeric anchors against the result list, and rebuild the focus
 * constellation once results settle.
 *
 * All functions are module-private; the orchestrator imports them directly.
 *
 * Extracted from url-restore.ts (shittiest-parts W3, 2026-08-17).
 */

import { debugWarn } from '@lib/utils/debug'
import { clearSearch, runSearch, searchStore, setSearchError } from '@lib/stores/search.svelte'
import { restoreActiveFiltersFromUrl, restoreActiveClusterFilterFromUrl } from '@lib/stores/filter.svelte'
import { syncFilterControls } from '@lib/orchestration/cluster-filter-controller'
import { applyFilters } from '@lib/orchestration/search-filter-core'
import { isDomForcedFocusSearchSurface, parseClusterFilterParam } from '@lib/orchestration/url-params'
import { setMobileSearchSheetMode } from '@lib/search/search-panel-adapter'
import { isCompactSearchViewport } from '@lib/utils/ui-presentation'
import { startSearch, markRestoredQuery } from '@lib/search/search-abort'
import { waitForSearchSettle, clearExplorationFocusSelection } from './url-writer'
import { publish, EVENTS } from '@lib/orchestration/event-bus'
import { isRestoreStale } from './url-restore-state'

// ── Filter + cluster restore ──────────────────────────────────────────────────

function _restoreFiltersFromParams(params: URLSearchParams): void {
    const hasFilterParams = ['status', 'city', 'website', 'email', 'geocoded'].some((key) => params.has(key))
    restoreActiveFiltersFromUrl(params)
    if (!hasFilterParams) return

    try {
        syncFilterControls()
        applyFilters()
    } catch (err) {
        debugWarn('[url-state] Filter UI sync after URL restore failed:', err)
        applyFilters()
    }
}

function _restoreClusterFilter(clusterStr: string): void {
    const cluster = parseClusterFilterParam(clusterStr)
    if (cluster === null) return

    const params = new URLSearchParams()
    params.set('cluster', String(cluster))
    restoreActiveClusterFilterFromUrl(params)
}

// ── Search-query restore ──────────────────────────────────────────────────────

/**
 * Restore the in-flight `q` query, and resolve non-numeric anchors against
 * the result list once the search round-trip completes.
 *
 * Numeric anchor handling moved out to `_restoreAnchorFromParams` so anchor
 * restore fires unconditionally and search restore stays focused on query
 * fulfillment only.
 */
async function _restoreSearchFromParams(
    query: string,
    anchorId: string | null,
    restoreToken: number,
    signal: AbortSignal
): Promise<void> {
    // Compose the caller's restore signal with a 30s deadline so a hung
    // runSearch cannot block URL restore forever. The restore signal aborts
    // when a newer applyUrlState supersedes this restore.
    const searchSignal = AbortSignal.any([signal, AbortSignal.timeout(30000)])
    // True only when the 30s deadline fired. A caller supersession aborts
    // `signal` (not the deadline) and must stay silent below.
    let restoreTimedOut = false
    let rejectDeadline: ((reason: unknown) => void) | undefined
    const onSearchAbort = (): void => {
        restoreTimedOut = !signal.aborted
        rejectDeadline?.(
            searchSignal.reason instanceof Error
                ? searchSignal.reason
                : new DOMException('URL search restore timed out', 'TimeoutError')
        )
    }
    searchSignal.addEventListener('abort', onSearchAbort)
    const restoreDeadline = new Promise<never>((_, reject) => {
        rejectDeadline = reject
    })
    let releaseSearch: () => void = () => {}

    try {
        const domForcedFocusSearchSurface = isDomForcedFocusSearchSurface()

        // W54: raise mobile search sheet for the deep-link / URL-restore path
        // (/?q=coffee). dispatchSearch handles the typed-input path
        // (search-dispatch.ts); this handles the URL-param path that goes
        // through applyUrlState -> _restoreSearchFromParams -> runSearch
        // without ever calling dispatchSearch. Without this, mobile users
        // who land on ?q=coffee see a blank hero (panelSurface='focus-search'
        // but data-mobile-search-sheet='' -> .search-results-wrapper display:none).
        if (isCompactSearchViewport() && !document.body.dataset.mobileSearchSheet) {
            setMobileSearchSheetMode('peek')
        }

        // If the same query is already in flight from the typed-input path,
        // piggyback on it instead of issuing a duplicate API request. Do NOT
        // return early here: the anchor resolution below (SEARCH_FOCUS_REQUESTED
        // re-fire, constellation rebuild, camera frame) must still run once the
        // in-flight search settles, or shared links like ?q=coffee&anchor=519
        // silently fail to focus when the typed-input path is mid-flight.
        const { isNew, release } = startSearch(query)
        // W71b mark: this restore is the one serving ?q= for this page load;
        // a parallel mount-time hydration search for the same query should
        // dedup against it (see orchestration.search's isRecentlyRestoredQuery
        // guard). Mark BEFORE the await so the hydration path (fires later in
        // the boot sequence) sees it even if this search settles fast.
        markRestoredQuery(query)
        releaseSearch = release
        if (isNew) {
            // Race runSearch against the restore deadline. runSearch swallows
            // AbortError internally (silent return, leaving status 'searching'), so
            // the await alone cannot distinguish a deadline hit from a normal
            // settle. The deadline reject below is the source of truth for a
            // timeout; the post-await searchSignal.aborted check covers the shape
            // where runSearch settles instead of the deadline losing the race.
            await Promise.race([runSearch(query, searchSignal), restoreDeadline])

            if (searchSignal.aborted && !signal.aborted) {
                // runSearch swallowed the deadline abort and resolved normally.
                restoreTimedOut = true
            }
        } else {
            // In-flight search from the typed-input path: wait for it to settle
            // (results/error/idle) so the anchor resolution below sees populated
            // results, then continue. If the restore deadline expires first, bail
            // like the fresh-search path does.
            try {
                await Promise.race([restoreDeadline, waitForSearchSettle(searchStore)])
            } catch {
                // A caller supersession (newer applyUrlState / popstate / re-init)
                // aborts `signal`, not the deadline — onSearchAbort already set
                // restoreTimedOut=false; this catch must NOT clobber it back to
                // true or a legitimately-running piggybacked search gets a spurious
                // error card (contract: supersession stays silent).
                if (signal.aborted) return
                restoreTimedOut = true
            }
        }

        if (restoreTimedOut) {
            // The 30s restore deadline expired without results. Never leave the
            // global search state stuck at 'searching' forever: settle through
            // the established search-error path (the same one a failed API
            // search uses), then bail BEFORE the post-restore writes below
            // (DOM input value, SEARCH_FOCUS_REQUESTED, pocket rebuild) so the
            // restore never continues as if results were restored.
            //
            // Guard: if runSearch already settled to results/error/idle before
            // the deadline fired (a near-miss where results landed at 29.9s),
            // do NOT clobber that state with a timeout error.
            if (searchStore().status === 'searching') {
                setSearchError(
                    query,
                    searchSignal.reason ?? new DOMException('Search restore timed out', 'TimeoutError'),
                    'full'
                )
            }
            return
        }

        // Token-abort: bail before post-runSearch writes (DOM mutation,
        // SEARCH_FOCUS_REQUESTED publish, preserveDomForcedFocusSearchSurface)
        // if a newer applyUrlState bumped the token while runSearch was in flight.
        if (isRestoreStale(restoreToken)) return

        // UI-7: Directly populate the search input from the URL ?q= param.
        // runSearch sets the store query, but the SearchInput component may not
        // have mounted yet or its reactive sync may not have propagated to the
        // DOM <input> value. Setting input.value here guarantees the input
        // reflects the URL on first paint.
        //
        // PR-O5-followup: do NOT dispatch a synthetic 'input' event. The event
        // was originally used to trigger SearchInput's onInput handler, but
        // that path bypassed the onMount guard in SearchInput and produced a
        // second `runSearch` call (state-update side effects double-fired).
        // SearchInput's reactive sync (\$effect reading $searchState.query)
        // and the onMount guard together handle the input value correctly
        // without the synthetic event. See tmp/performsearch-dup-audit-2026-07-01.md.
        const input = document.getElementById('search-input') as HTMLInputElement | null
        if (input && input.value !== query) {
            input.value = query
        }

        if (domForcedFocusSearchSurface) clearExplorationFocusSelection()

        // Focus the anchor once search results are available. Numeric anchors
        // are ALSO re-fired here: their earlier publish in `_restoreAnchorFromParams`
        // fires before currentSearchSummary populates,
        // leaving threadCandidates empty and the focus pocket / thread inspector
        // without neighbor data. This re-fire runs after runSearch completes, so
        // resultIndices is populated. The subscriber guards addTrailStop against
        // duplicate trail stops. See docs/bug-thread-inspector-baseline-and-activation-2026-06-18.md
        const numericAnchor = Number.isFinite(Number(anchorId))
        const results = searchStore().results
        const byId = results && results.length > 0 ? results.find((r: { id: string }) => r.id === anchorId) : null
        if (byId) {
            publish(EVENTS.SEARCH_FOCUS_REQUESTED, { index: byId.index })
        } else if (numericAnchor) {
            // Raw numeric anchor (?anchor=519) that isn't in results by .id
            // (results .id is a lead_id string). Re-fire by numeric index directly.
            publish(EVENTS.SEARCH_FOCUS_REQUESTED, { index: Number(anchorId) })
        }

        // Rebuild the constellation now that threadCandidates is populated
        // by the SEARCH_FOCUS_REQUESTED subscriber (which runs synchronously
        // after the publish above). The earlier call in _restoreAnchorFromParams
        // ran before search results were available, leaving the constellation
        // empty. See PR-B4 deep-link restoration path.
        const rebuildIndex = byId ? byId.index : numericAnchor ? Number(anchorId) : -1
        if (rebuildIndex >= 0) {
            try {
                const _focusPocketMod = (await import('@lib/focus/pocket')) as {
                    applyLocalNeighborhoodFocus: (index: number) => void
                }
                if (isRestoreStale(restoreToken)) return
                _focusPocketMod.applyLocalNeighborhoodFocus(rebuildIndex)
            } catch (e) {
                debugWarn('[url-state] applyLocalNeighborhoodFocus re-build failed after search restore', e)
            }
        }
    } catch (err) {
        // A newer applyUrlState superseded this restore: the caller signal
        // aborted (and the token was bumped). Stay silent — the newer restore
        // drives state. This preserves the intentional cancellation semantics:
        // a supersession abort must NOT surface as a search error.
        if (signal.aborted) return
        // The 30s restore deadline expired. Same settle-as-error handling as
        // the post-await path above (this branch covers runSearch rejecting
        // with the deadline reason instead of resolving).
        if (restoreTimedOut) {
            if (searchStore().status === 'searching') {
                setSearchError(query, searchSignal.reason ?? new Error('Search restore timed out'), 'full')
            }
            return
        }
        debugWarn('[url-state] Search restore from URL failed:', err)
    } finally {
        // Release only the URL-restore owner. A piggybacking restore receives
        // a no-op release, while an older restore cannot clear a newer query.
        releaseSearch()
        searchSignal.removeEventListener('abort', onSearchAbort)
    }
}

/**
 * Re-export the public surface so callers that historically imported these
 * helpers directly from url-restore.ts keep working. The orchestrator
 * (`applyUrlState`) imports them; external callers should not depend on
 * this private surface.
 */
export { _restoreSearchFromParams, _restoreFiltersFromParams, _restoreClusterFilter }
