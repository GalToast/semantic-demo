/**
 * @lib/search/orchestration.ts — High-level search orchestration
 *
 * Coordinates the search lifecycle across the store, event bus, and UI:
 *
 *   1. `search(query, options)` — runs `performSearch` (the actual index lookup),
 *      validates against in-flight requests via the sequence counter, and writes
 *      the result summary back to `searchStore`. Handles degraded/empty states
 *      and pushes events to the journey UI (semantic-guide state, trail cue,
 *      glow activation).
 *   2. `bindSearchResultInteractions()` — wires up DOM event handlers for the
 *      result list (hover, click, focus transitions).
 *   3. `beginSearchFocusTransition()` — kicks off the animated transition from
 *      the search panel into the 3D focus pocket.
 *
 * Re-exports panel-state helpers from `./search-panel-adapter` and
 * `./results-ui` so consumers can import everything from one place.
 *
 * Note: `searchStore` is NOT re-exported here — consumers should import it
 * directly from `@lib/stores/search.svelte`.
 *
 * The search lifecycle is intentionally orchestrated here (rather than in the
 * store directly) so the UI concerns (DOM bindings, glow activation, degraded
 * states) are testable without a full Svelte runtime.
 */
import type { SearchResult } from '@lib/types/state'
import {
    searchStore,
    setSearchStatus,
    setSearchSummary,
    setAnchorIndex,
    setPreviewIndex,
    incrementRequestSequence,
    isRequestCurrent,
    incrementFocusTransitionToken,
    clearSearch,
    setActiveResult,
    withSearchNotify
} from '@lib/stores/search.svelte'
import { performSearch } from '@lib/search-engine'
import { publish, EVENTS } from '@lib/orchestration/event-bus'
import { formatBusinessName } from '@lib/utils/dom-formatters'
import { debugWarn } from '@lib/utils/debug'
import { isCompactSearchViewport } from '@lib/utils/ui-presentation'
import { updateSearchTrailCue as renderSearchTrailCue } from '@lib/journey/search-trail-cue-renderer'
import {
    setSearchPanelState,
    renderSearchResultItems,
    applySemanticSearchDegradedState,
    stopSearchVectorScramble,
    startSearchVectorScramble,
    updateSearchPreviewOverlay,
    activateSearchGlow,
    resetSemanticGuideUi,
    clearShortSemanticSearchState,
    clearSearchPreviewHoverTimer,
    setSearchStateNamespace,
    dedupeNearDuplicateResults
} from './results-ui'
import { setupMobileSearchSheetToggle } from './search-panel-adapter'
import { setActiveSearchResultRow } from './result-renderer'
import { startSearch, cancelSearch, isRecentlyRestoredQuery } from './search-abort'
import { performLocalIndexSearch, localHitsToResults } from '@lib/search/local-search-index'
import { shouldSurfaceApiFailures } from '@lib/search/mock-search-fallback'
import { showExperienceToast } from '@lib/orchestration/toast'
import { DisposableRegistry } from '@lib/utils/disposable-registry'

// ── Types ──────────────────────────────────────────────────────────────────

interface SearchOptions {
    preferCachedResults?: boolean
    offset?: number
    restoreAnchorLeadId?: string | number
    skipResetFocus?: boolean
    preserveSearch?: boolean
    suppressEvent?: boolean
}

interface SearchContext {
    trimmedQuery: string
    topIndex: number | null
    topScore: number | undefined
    anchorIndex: number | null
    resultIndices: number[]
}

// ── Focus Transition Timer Management ───────────────────────────────────────

// ── Search Status Reset Timer ───────────────────────────────────────────────
// Module-level DisposableRegistry for the short-query (1-char) status-reset
// timer.  Disposed at the top of each search() call so a stale timer from a
// superseded request cannot overwrite a newer search's status message.
let _statusTimerRegistry: DisposableRegistry | null = null

function _clearStatusTimerRegistry(): DisposableRegistry {
    _statusTimerRegistry?.disposeAll()
    _statusTimerRegistry = new DisposableRegistry({ label: 'search-status-timer' })
    return _statusTimerRegistry
}

// ── Search Orchestration ───────────────────────────────────────────────────

/**
 * Pending focus transition token. STARTED is published synchronously by
 * beginSearchFocusTransition(); SETTLED is emitted later by the camera/focus
 * pipeline once CAMERA_NODE_FOCUSED fires. Keeping the token here lets the
 * focus pipeline correlate the SETTLED event with its STARTED event across
 * overlapping transitions without coupling the two modules.
 */
let _pendingFocusTransitionToken: number | null = null

export function getPendingFocusTransitionToken(): number | null {
    return _pendingFocusTransitionToken
}

export function clearPendingFocusTransitionToken(): void {
    _pendingFocusTransitionToken = null
}

/**
 * Execute a search and update the UI.
 * Single-track implementation using Svelte store and search engine.
 */
export async function search(query: string, options: SearchOptions = {}): Promise<void> {
    // Clear any status-reset timer left by a prior call so a stale timer
    // cannot overwrite this search's status message.
    const statusReg = _clearStatusTimerRegistry()
    try {
        sessionStorage.removeItem('searchVisibleCount')
    } catch (error) {
        debugWarn('[search/orchestration] sessionStorage may be unavailable:', error)
    }
    const trimmedQuery = String(query || '').trim()
    let resultsEl = document.getElementById('search-results')
    let statusEl = document.getElementById('search-status')
    const searchInput = document.getElementById('search-input') as HTMLInputElement | null
    // Lazy-mount bridge (task #3, 2026-08-03): SearchBar lazy-loads SearchResults
    // (#search-results) only once a search state exists (showResults /
    // testLoadingPhase / isStoreError) — so a fresh idle boot has NO
    // #search-results and the old hard `return` here silently dropped every
    // first search (deep-link ?q= and typed input alike). Registration is
    // best-effort: the UI module also self-registers on its own mount. The
    // panel is resolved again after results land (see the wait below).
    if (resultsEl && statusEl) {
        setSearchStateNamespace(resultsEl, {
            search,
            clearSearch: () => clearSearch(),
            bindSearchResultInteractions
        })
    }

    incrementFocusTransitionToken()
    if (typeof clearSearchPreviewHoverTimer === 'function') clearSearchPreviewHoverTimer()

    // startSearch (below) handles dedup atomically via isNew — no separate
    // isSearchInFlight check needed (fixes BUG-002 check-then-start race).

    if (!trimmedQuery || trimmedQuery.length < 2) {
        stopSearchVectorScramble()
        // F2 (orch sweep 2026-08-07): cancel any ≥2-char search still in flight
        // before clearing — clearSearch() alone leaves isRequestCurrent true, so
        // the old search's results would resurrect under the cleared input.
        cancelSearch()
        if (trimmedQuery && trimmedQuery.length > 0 && trimmedQuery.length < 2) {
            if (statusEl) statusEl.textContent = 'Type at least 2 characters to search'
            statusReg.schedule(2000, () => {
                if (statusEl && !searchStore().summary) {
                    statusEl.textContent = 'Type to find businesses by need, place, or trade.'
                }
            })
            if (resultsEl && statusEl) clearShortSemanticSearchState(resultsEl, statusEl)
        } else {
            clearSearch()
        }
        return
    }

    if (trimmedQuery.length > 200) {
        if (statusEl) statusEl.textContent = 'Search query is too long. Try a shorter phrase.'
        if (searchInput) {
            searchInput.value = trimmedQuery.slice(0, 200)
            searchInput.classList.remove('shake-input')
            void searchInput.offsetWidth
            searchInput.classList.add('shake-input')
        }
        return
    }

    const replacingPriorQuery = searchStore().summary?.query && searchStore().summary!.query !== trimmedQuery
    if (replacingPriorQuery) {
        withSearchNotify(() => {
            setSearchSummary(null)
            setAnchorIndex(null)
            setPreviewIndex(null)
        })
    }

    // Clear exploration focus if needed
    publish(EVENTS.SEARCH_STATE_RESET_REQUESTED, { preserveSearch: true, skipUrlSync: true })

        const { signal, isNew, release } = startSearch(trimmedQuery)
    if (!isNew) return
    // W71b: the URL-restore path already fulfilled this exact query within the
    // boot window (markRestoredQuery set by _restoreSearchFromParams). A
    // mount-time hydrological re-entry for the same text must NOT dispatch a
    // second semantic_search round-trip (zero-result deep-link regression).
    if (isRecentlyRestoredQuery(trimmedQuery)) {
        release()
        return
    }

    const requestId = incrementRequestSequence()
    setSearchStatus('searching')

    publish(EVENTS.SEARCH_STARTED, { resultsEl, statusEl, query: trimmedQuery })
    startSearchVectorScramble()

    let searchResults: SearchResult[]
    let reg: DisposableRegistry | null = null
    let onPrimaryAbort: (() => void) | null = null
    try {
        // `?staticDev=0` is the explicit API-failure contract used by the
        // search contract tests. It must not silently replace a slow/erroring
        // API with local results, and it must not wait for the local fallback
        // timer before surfacing the API error.
        if (shouldSurfaceApiFailures()) {
            searchResults = await performSearch(
                trimmedQuery,
                signal,
                0,
                options.offset ?? 0,
                options.preferCachedResults
            )
        } else {
            // ── Fast-fail wrapper ──────────────────────────────────────────
            // Race performSearch against a timer so a slow/absent API does NOT
            // leave the user staring at a spinner for ~25s (8s × 3 exponent retries
            // with no feedback). After 3s we show a toast; after 7s we abort the
            // API and fall back to the local index directly.
            const FAST_FAIL_MS = 7000
            const FEEDBACK_DELAY_MS = 3000

            const fastFailController = new AbortController()
            onPrimaryAbort = () => fastFailController.abort()
            signal.addEventListener('abort', onPrimaryAbort, { once: true })

            let feedbackFired = false
            let fallbackResolve: ((v: SearchResult[]) => void) | null = null

            reg = new DisposableRegistry()
            void reg.schedule(FEEDBACK_DELAY_MS, () => {
                feedbackFired = true
                showExperienceToast(
                    'Searching local data',
                    `Live search is taking longer than expected. Using local data for "${trimmedQuery}"...`
                )
                if (statusEl) statusEl.textContent = `Searching local data for "${trimmedQuery}"...`
            })
            void reg.schedule(FAST_FAIL_MS, () => {
                if (!feedbackFired) {
                    showExperienceToast(
                        'Searching local data',
                        `Live search is taking longer than expected. Using local data for "${trimmedQuery}"...`
                    )
                    if (statusEl) statusEl.textContent = `Searching local data for "${trimmedQuery}"...`
                }
                fastFailController.abort()
                const localHits = performLocalIndexSearch(trimmedQuery, options.offset ?? 0, 18)
                const localResults = localHits && localHits.length > 0 ? localHitsToResults(localHits) : []
                fallbackResolve?.(localResults)
            })

            const fallbackPromise = new Promise<SearchResult[]>((resolve) => {
                fallbackResolve = resolve
            })

            const apiPromise = performSearch(
                trimmedQuery,
                fastFailController.signal,
                0,
                options.offset ?? 0,
                options.preferCachedResults
            )

            searchResults = await Promise.race([apiPromise, fallbackPromise])

            // Swallow late API rejection so an unhandled rejection doesn't
            // surface when the fast-fail path resolves first.
            apiPromise.catch(() => {})
        }
    } catch (error: unknown) {
        if (signal.aborted || !isRequestCurrent(requestId)) return
        stopSearchVectorScramble()
        publish(EVENTS.SEARCH_DEGRADED, { resultsEl, statusEl, query: trimmedQuery, error })
        if (resultsEl && statusEl) {
            applySemanticSearchDegradedState(
                resultsEl,
                statusEl,
                trimmedQuery,
                error instanceof Error ? error : new Error(String(error))
            )
        }
        return
    } finally {
        reg?.dispose()
        if (onPrimaryAbort) {
            signal.removeEventListener('abort', onPrimaryAbort)
        }
        release()
    }

    // Bug #1 (bugsweep): always stop the scramble animation, even when the
    // request was superseded by a newer search. Previously the early return
    // below skipped stopSearchVectorScramble(), leaving .search-vector-scramble
    // on <body> indefinitely.
    stopSearchVectorScramble()
    if (!isRequestCurrent(requestId)) return

    const results = dedupeNearDuplicateResults(searchResults)

    if (!isRequestCurrent(requestId)) return
    if (!results.length) {
        setSearchStatus('empty')
        publish(EVENTS.SEARCH_EMPTY, { query: trimmedQuery })
        return
    }

    const topResult = results[0] || null
    const resultIndices = results.map((r) => r.index)
    const anchorResult = options.restoreAnchorLeadId
        ? results.find((r) => String(r.point?.lead_id) === String(options.restoreAnchorLeadId)) || topResult
        : topResult
    const anchorIndex = anchorResult?.index ?? topResult?.index ?? null
    const anchorName = anchorResult ? formatBusinessName(anchorResult.point?.name as string) : null

    setSearchSummary({
        // CONTRACT (2026-08-06, search-race audit): this DOM-path write populates
        // currentSearchSummary for the renderContext/status consumers. The STORE
        // path (setSearchResults in search.svelte.ts) is the other canonical
        // writer — both must stay field-aligned (totalMatches/visibleMatches/
        // topScore/anchorIndex/topIndex/renderContext). New consumers: read
        // appState.searchResults + currentSearchSummary, not appState.searchSummary
        // (the render-context-only alias written by results-ui.ts:233).
        query: trimmedQuery,
        totalMatches: results.length,
        totalSemanticMatches: results.length,
        visibleMatches: results.length,
        resultCount: results.length,
        topScore: topResult?.score ?? 0,
        anchorIndex,
        topIndex: topResult?.index ?? null,
        resultIndices,
        summaryType: 'semantic',
        // mirror … store path (setSearchResults): DOM-path searches must
        // populate renderContext too, or SearchResults.svelte's $derived
        // falls back to the empty context (bars/strengths render blank on
        // typed-search runs). See 2026-08-06 dual-path audit.
        renderContext: {
            trimmedQuery,
            topIndex: topResult?.index ?? null,
            anchorIndex,
            topScore: topResult?.score ?? 0
        }
    })

    publish(EVENTS.SEARCH_SUCCESS, {
        resultsEl,
        query: trimmedQuery,
        source: 'search-engine'
    })

    // Lazy-mount bridge (task #3, 2026-08-03): #search-results is lazy-loaded
    // by SearchBar only once a search state exists — it cannot exist when the
    // search starts from idle, so the entry guard must not require it, and the
    // render below must wait for the panel that setSearchSummary just mounted
    // (hasSearchSummary flips -> SearchBar's $effect lazy-imports SearchResults).
    if (!resultsEl || !statusEl) {
        const deadline = Date.now() + 2500
        while (Date.now() < deadline) {
            if (signal.aborted || !isRequestCurrent(requestId)) break
            resultsEl = document.getElementById('search-results')
            statusEl = document.getElementById('search-status')
            if (resultsEl && statusEl) break
            const _domPollReg = new DisposableRegistry({ label: 'search-dom-mount-poll' })
            await new Promise<void>((resolve) => _domPollReg.schedule(40, () => resolve()))
        }
    }
    if (!resultsEl || !statusEl) {
        // Degradation: the panel never mounted. Results/summary are already in
        // the store, and SearchResults renders from the store reactively, so
        // only the interaction binding + chrome polish are lost.
        debugWarn('[search/orchestration] #search-results did not mount; skipping DOM render', trimmedQuery)
        return
    }

    if (!isRequestCurrent(requestId)) return

    if (results.length === 1) {
        const soleIndex = anchorIndex
        const soleName = anchorName || formatBusinessName(results[0]!.point?.name as string)
        updateSearchTrailCue({
            beat: 'focus',
            kicker: 'Single result',
            title: `${soleName} — only match for "${trimmedQuery}"`,
            note: 'Only one listing matches. Click it to inspect, or search again for a broader result.',
            immediate: isCompactSearchViewport()
        })
        if (typeof soleIndex === 'number' && Number.isFinite(soleIndex)) {
            publish(EVENTS.SEARCH_FOCUS_REQUESTED, { point: results[0]!.point, index: soleIndex })
        }
        statusEl.textContent = `1 match for "${trimmedQuery}" — ${soleName} is the only listing.`
        setSearchPanelState({ searching: false, focusing: false, hasQuery: true, resultsRendered: true })
        return
    }

    resetSemanticGuideUi()
    activateSearchGlow(resultIndices, anchorIndex)
    updateSearchPreviewOverlay()

    const renderContext = {
        trimmedQuery,
        topIndex: topResult?.index ?? null,
        topScore: topResult?.score ?? undefined,
        anchorIndex,
        resultIndices
    }
    renderSearchResultItems(
        resultsEl,
        results as unknown as import('@lib/state/state-types').SearchResult[],
        renderContext,
        statusEl
    )
    bindSearchResultInteractions(resultsEl, statusEl, results, renderContext)

    resultsEl.hidden = false
    resultsEl.classList.add('active')
    updateSearchTrailCue({ stage: 'explore' })
    setSearchPanelState({ searching: false, focusing: false, hasQuery: true, resultsRendered: true })
    setupMobileSearchSheetToggle({ isCompactSearchViewport })
    setActiveSearchResultRow(resultsEl, anchorIndex)
}

/**
 * Bind click/hover interactions to rendered search result items.
 */
export function bindSearchResultInteractions(
    resultsEl: HTMLElement,
    statusEl: HTMLElement,
    results: SearchResult[],
    renderContext: SearchContext
): void {
    resultsEl.querySelectorAll('.search-result-item').forEach((el: Element) => {
        const htmlEl = el as HTMLElement
        const index = Number(htmlEl.dataset.index)
        const point = results.find((r) => r.index === index)?.point

        htmlEl.onclick = () => {
            beginSearchFocusTransition(resultsEl, statusEl, renderContext.resultIndices, index, point, htmlEl)
        }

        htmlEl.onmouseenter = () => {
            updateSearchPreviewOverlay()
        }
    })

    const retryBtn = resultsEl.querySelector('.search-error-inline-retry .search-error-retry-btn') as HTMLElement | null
    if (retryBtn && retryBtn.dataset.retryQuery) {
        retryBtn.onclick = () => search(retryBtn.dataset.retryQuery!, { preferCachedResults: false })
    }
}

/**
 * Begin transition to focus on a specific search result.
 */
export function beginSearchFocusTransition(
    resultsEl: HTMLElement,
    statusEl: HTMLElement,
    resultIndices: number[],
    targetIndex: number,
    point: SearchResult['point'] | undefined,
    el: HTMLElement
): void {
    if (!point || !searchStore().summary) return
    if (!el) return
    const token = incrementFocusTransitionToken()
    _pendingFocusTransitionToken = token

    publish(EVENTS.SEARCH_FOCUS_TRANSITION_STARTED, {
        resultsEl,
        statusEl,
        resultIndices,
        targetIndex,
        point,
        transitionToken: token
    })

    // Update active result
    setActiveResult(String(targetIndex))
    setAnchorIndex(targetIndex)

    // Focus the result in the 3D scene
    publish(EVENTS.SEARCH_FOCUS_REQUESTED, { point, index: targetIndex })
}

/**
 * Update search trail cue in the UI.
 */
function updateSearchTrailCue(params: {
    beat?: string
    kicker?: string
    title?: string
    note?: string
    stage?: string
    immediate?: boolean
}): void {
    renderSearchTrailCue(params)
}

// ── Re-exports for backward compatibility ──────────────────────────────────

export { setSearchContainerState, setSearchGlowState, setupMobileSearchSheetToggle } from './search-panel-adapter'

export {
    setSearchPanelState,
    renderSearchResultItems,
    applySemanticSearchDegradedState,
    finishSemanticSearchSuccessState,
    applyEmptySemanticSearchState,
    stopSearchVectorScramble,
    startSearchVectorScramble,
    updateSearchPreviewOverlay,
    activateSearchGlow,
    clearSearchGlow as clearResultsGlow,
    resetSemanticGuideUi,
    clearShortSemanticSearchState,
    clearSearchPreviewHoverTimer,
    updateSearchStatusMessage
} from './results-ui'

export {
    setSearchQuery,
    setSearchStatus,
    setSearchSummary,
    setAnchorIndex,
    setPreviewIndex,
    setSearchGlow,
    clearSearchGlow,
    incrementRequestSequence,
    isRequestCurrent,
    incrementFocusTransitionToken,
    setTrailCue,
    setSemanticGuide,
    setCompactViewport,
    clearSearch,
    clearSearchResults,
    validateSearchQuery,
    setActiveResult,
    searchVisibleCount,
    setSearchVisibleCount,
    setSearchResults
} from '@lib/stores/search.svelte'

export type { SearchOptions, SearchContext }
