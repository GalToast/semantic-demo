/**
 * @lib/search/results-ui.ts — State management for the search results panel.
 *
 * RENDERING: legacy DOM is rendered directly into #search-results so the
 * served shell (which never mounts the Svelte SearchResults root) still
 * shows rows. Svelte stores are also updated so the future Svelte focus
 * track can re-render the same data from the canonical source of truth.
 *
 * Port of
 */

import { publish, EVENTS } from '@lib/orchestration/event-bus'
import { isCompactSearchViewport } from '@lib/utils/ui-presentation'
import { setSearchContainerState, setSearchGlowState, setupMobileSearchSheetToggle } from './search-panel-adapter'
import { setSearchGlow as storeSetSearchGlow, withSearchNotify } from '@lib/stores/search.svelte'
import { recordSemanticLaneSnapshot } from '../orchestration/semantic-lane'
import { appState } from '@lib/state/app.svelte'
import type { SemanticState, SearchErrorData, SearchResult } from '@lib/state/state-types'
import { updateSearchTrailCue } from '@lib/journey/search-trail-cue-renderer'

// appState (AppState class instance) structurally matches SemanticState at runtime;
// the Svelte 5 $state type marker prevents a direct cast, so the intermediate
// `unknown` bridges the disjoint type hierarchies.
const state = appState as unknown as SemanticState

// ── Types ──────────────────────────────────────────────────────────────────

interface RenderContext {
    trimmedQuery: string
    topIndex?: number | null
    anchorIndex?: number | null
    topScore?: number
    resultIndices?: number[]
}

interface SearchPanelStateOptions {
    searching?: boolean
    focusing?: boolean
    hasQuery?: boolean
    resultsRendered?: boolean
    degraded?: boolean
    error?: boolean
    hasResults?: boolean
}

interface SearchSummaryState {
    query?: string
    anchorIndex?: number | null
    topIndex?: number | null | undefined
    resultIndices?: number[]
    dedupedResultCount?: number
    visibleMatches?: number
}

// ── Search State Namespace Registry (replaces DOM property mutation) ────

const _searchStateRegistry = new WeakMap<HTMLElement, SearchStateNamespace>()

export interface SearchStateNamespace {
    search?: (query: string, options?: { preferCachedResults?: boolean }) => void
    clearSearch?: () => void
    bindSearchResultInteractions?: unknown
    isMobileRouteFieldPeekActive?: () => boolean
}

/**
 * Register a SearchStateNamespace for a given DOM element, replacing the
 * previous fragile _searchStateNamespace property attached directly to the
 * element. Callers MUST remove the mapping via clearSearchState().
 */
export function setSearchStateNamespace(el: HTMLElement, ns: SearchStateNamespace): void {
    _searchStateRegistry.set(el, ns)
}

/**
 * Look up the SearchStateNamespace previously registered for a DOM element.
 * Returns null when no namespace has been registered.
 */
export function getSearchStateNamespace(el: HTMLElement | null): SearchStateNamespace | null {
    if (!el) return null
    return _searchStateRegistry.get(el) ?? null
}

function appendQueryInQuotes(parent: HTMLElement, query: string): void {
    parent.append(document.createTextNode('"'))
    const strong = document.createElement('strong')
    strong.textContent = query
    parent.append(strong)
    parent.append(document.createTextNode('"'))
}

function buildLegacySearchErrorStateDom(errorData: SearchErrorData): HTMLElement {
    // Sanitize query for safe HTML-attribute use (aria-label, dataset).
    // The query is never injected via innerHTML, so textContent-level escaping
    // (appendChild/textContent) is already safe; setAttribute needs quote escaping.
    const safeQuery = errorData.query.replace(/"/g, '&quot;')
    const errorEl = document.createElement('div')
    errorEl.className = errorData.type === 'inline' ? 'search-error-inline-retry' : 'search-error-state'
    errorEl.dataset.legacySearchErrorState = '1'
    errorEl.dataset.searchErrorType = errorData.type
    errorEl.dataset.query = errorData.query
    errorEl.dataset.errorMessage = errorData.message
    errorEl.setAttribute('role', 'status')
    errorEl.setAttribute('aria-live', 'polite')

    if (errorData.type === 'inline') {
        const message = document.createElement('span')
        message.className = 'search-error-inline-msg'
        message.append(document.createTextNode('Search is recovering for '))
        appendQueryInQuotes(message, errorData.query)
        message.append(document.createTextNode('.'))

        const retry = document.createElement('button')
        retry.type = 'button'
        retry.className = 'search-error-retry-btn compact'
        retry.setAttribute('aria-label', `Retry search for ${safeQuery}`)
        retry.textContent = 'Retry'

        errorEl.append(message, retry)
        return errorEl
    }

    errorEl.id = 'search-error-state'

    const kicker = document.createElement('span')
    kicker.className = 'search-error-kicker'
    kicker.textContent = 'Retry needed'

    const text = document.createElement('div')
    text.className = 'search-error-text'
    text.append(document.createTextNode('We could not finish '))
    appendQueryInQuotes(text, errorData.query)
    text.append(document.createTextNode(' just now. Retry the live search or clear it and keep exploring.'))

    const actions = document.createElement('div')
    actions.className = 'search-error-actions'

    const retry = document.createElement('button')
    retry.type = 'button'
    retry.className = 'search-error-retry-btn'
    retry.setAttribute('aria-label', `Retry search for ${safeQuery}`)
    retry.textContent = 'Retry'

    const dismiss = document.createElement('button')
    dismiss.type = 'button'
    dismiss.className = 'search-error-dismiss-btn'
    dismiss.setAttribute('aria-label', 'Clear search and dismiss')
    dismiss.textContent = 'Clear'

    actions.append(retry, dismiss)
    errorEl.append(kicker, text, actions)
    return errorEl
}

function attachLegacySearchErrorActions(resultsEl: HTMLElement | null, errorEl: HTMLElement): void {
    const namespace = getSearchStateNamespace(resultsEl)
    const query = errorEl.dataset.query || ''
    const retry = errorEl.querySelector('.search-error-retry-btn') as HTMLButtonElement | null
    if (retry) {
        retry.onclick = (event) => {
            event.preventDefault()
            if (namespace?.search) {
                namespace.search(query, { preferCachedResults: false })
            }
        }
    }

    const dismiss = errorEl.querySelector('.search-error-dismiss-btn') as HTMLButtonElement | null
    if (dismiss) {
        dismiss.onclick = (event) => {
            event.preventDefault()
            clearSearchState(resultsEl, document.getElementById('search-status'))
        }
    }
}

function renderLegacySearchErrorStateDom(resultsEl: HTMLElement | null, errorData: SearchErrorData): void {
    if (!resultsEl) return
    const errorEl = buildLegacySearchErrorStateDom(errorData)
    attachLegacySearchErrorActions(resultsEl, errorEl)
    resultsEl.append(errorEl)
    resultsEl.hidden = false
    resultsEl.classList.add('active')
    resultsEl.setAttribute('aria-describedby', errorData.type === 'inline' ? 'search-status' : 'search-error-state')
    resultsEl.setAttribute('aria-hidden', resultsEl.children.length > 0 ? 'false' : 'true')
}

// ── EXPORTS ────────────────────────────────────────────────────────────────

export function setSearchPanelState(options: SearchPanelStateOptions = {}): void {
    let hasQuery = options.hasQuery
    if (typeof hasQuery !== 'boolean') {
        const input = document.getElementById('search-input') as HTMLInputElement | null
        if (input) hasQuery = Boolean(input.value.trim())
    }
    setSearchContainerState({ ...options, hasQuery })
}

export function renderSearchResultItems(
    resultsEl: HTMLElement,
    results: SearchResult[],
    renderContext: RenderContext,
    statusEl: HTMLElement | null
): void {
    const INITIAL_SHOW = 10
    const dedupedResults = dedupeNearDuplicateResults(results)
    const total = dedupedResults.length
    const savedCount = (() => {
        try {
            return Number.parseInt(sessionStorage.getItem('searchVisibleCount') || '0', 10)
        } catch {
            return 0
        }
    })()
    const visibleCount = Math.min(
        total,
        Math.max(INITIAL_SHOW, Number.isFinite(savedCount) && savedCount > 0 ? savedCount : INITIAL_SHOW)
    )

    const isPeek = document.body?.dataset?.panelSurfaceDetail === 'peek'
    const mode = visibleCount >= total ? 'expanded' : isPeek ? 'peek' : 'initial'

    const isExpanded = total > INITIAL_SHOW && visibleCount >= total
    if (resultsEl) {
        resultsEl.classList.toggle('is-expanded', isExpanded)
        setSearchContainerState({ resultsExpanded: isExpanded })
        resultsEl.classList.add('active')
    }

    // Push to appState
    appState.searchResults = dedupedResults
    appState.searchState.searchVisibleCount = visibleCount
    appState.searchSummary = {
        query: renderContext.trimmedQuery,
        renderContext,
        mode
    }
    publish(EVENTS.TOOLTIP_HIDE_REQUESTED)
    publish(EVENTS.SEARCH_UI_SYNC_REQUESTED, { resultsEl, statusEl, results: dedupedResults, renderContext })
    publish(EVENTS.SEMANTIC_LANE_STATE_REQUESTED, {
        laneState: 'healthy',
        options: { query: renderContext.trimmedQuery }
    })
    publish(EVENTS.SEMANTIC_GUIDE_BUTTON_STATE_REQUESTED, {
        button: document.getElementById('btn-synthesize'),
        mode: 'idle'
    })
    appState.searchState.isSearching = false
    appState.searchState.searchError = null

    if (resultsEl) {
        resultsEl.setAttribute('aria-describedby', 'search-results-count')
    }

    // Legacy DOM render so the served shell (which never mounts the Svelte
    // SearchResults root) still shows result rows.
    // Legacy imperative DOM render RETIRED — SearchResults.svelte + SearchResultItem.svelte
    // now own #search-results declaratively (fed via searchState.results ← setSearchSummary/
    // resultIndices). The former renderLegacySearchResultsDom() call clobbered Svelte's DOM
    // via replaceChildren(), wiping the declarative rows,
    // keyboard nav, and a11y live-region. The served shell DOES mount the Svelte root
    // (SearchBar.svelte dynamically imports + renders <SearchResultsComponent>), so the
    // legacy "shell never mounts Svelte" premise is stale.

    if (state.searchState.currentSearchSummary) {
        ;(state.searchState.currentSearchSummary as SearchSummaryState).dedupedResultCount = total
    }
    setupMobileSearchSheetToggle({ isCompactSearchViewport })

    publish(EVENTS.URL_SYNC_REQUESTED, { params: { offset: null }, reason: 'search-results-render' })

    if (resultsEl) resultsEl.scrollTop = 0
}

// ── Search Lifecycle State ──────────────────────────────────────────────────

export function applySemanticSearchLoadingState(resultsEl: HTMLElement | null): void {
    appState.searchState.isSearching = true
    appState.searchState.searchError = null

    if (resultsEl) {
        resultsEl.classList.add('searching')
        resultsEl.classList.add('is-searching-skeleton')
        resultsEl.setAttribute('aria-busy', 'true')
        resultsEl.scrollTop = 0
        resultsEl.setAttribute('aria-hidden', resultsEl.children.length > 0 ? 'false' : 'true')
        resultsEl.hidden = false
    }
    clearSearchGlow()
}

export function applySemanticSearchErrorState(
    resultsEl: HTMLElement | null,
    statusEl: HTMLElement | null,
    trimmedQuery: string,
    error: Error | null
): void {
    const preservingSameQuery =
        state.searchState.currentSearchSummary &&
        (state.searchState.currentSearchSummary as SearchSummaryState).query === trimmedQuery

    const errorData: SearchErrorData = {
        query: trimmedQuery,
        type: preservingSameQuery ? 'inline' : 'full',
        message: error?.message || 'Search failed'
    }

    appState.searchState.searchError = errorData
    appState.searchState.isSearching = false

    if (resultsEl) {
        resultsEl.classList.remove('is-searching-skeleton')
        resultsEl.setAttribute('aria-busy', 'false')
        if (resultsEl.dataset.legacyResultsSource === 'legacy') {
            resultsEl.replaceChildren()
        } else {
            resultsEl
                .querySelectorAll('[data-legacy-search-results="1"], [data-legacy-search-error-state="1"]')
                .forEach((el) => el.remove())
        }
        resultsEl.dataset.legacyResultsSource = ''
        resultsEl.removeAttribute('data-legacy-results-count')
        resultsEl.removeAttribute('data-legacy-results-anchor')
        resultsEl.removeAttribute('data-legacy-results-mode')
        renderLegacySearchErrorStateDom(resultsEl, errorData)
    }

    setSearchPanelState({ error: true, degraded: true, hasQuery: true, resultsRendered: false })

    if (statusEl) {
        statusEl.textContent = `Search paused for "${trimmedQuery}". Try again in a moment.`
        statusEl.hidden = false
        statusEl.classList.add('search-status-compact')
    }
    recordSemanticLaneSnapshot({ state: 'degraded', query: trimmedQuery, reason: 'search-degraded' })
}

export function finishSemanticSearchSuccessState(
    resultsEl: HTMLElement | null,
    trimmedQuery: string,
    cacheSource: string = 'network'
): void {
    const spinner = document.getElementById('search-spinner')
    if (spinner) spinner.hidden = true
    if (resultsEl) {
        resultsEl.classList.remove('searching')
        resultsEl.classList.remove('is-searching-skeleton')
        resultsEl.setAttribute('aria-busy', 'false')
        resultsEl.setAttribute('aria-hidden', resultsEl.children.length > 0 ? 'false' : 'true')
    }
    setSearchPanelState({ searching: false, resultsRendered: true, hasResults: true, hasQuery: true })
    if (cacheSource === 'network') recordSemanticLaneSnapshot({ state: 'healthy', query: trimmedQuery })
}

export function clearSearchState(_resultsEl: HTMLElement | null, _statusEl: HTMLElement | null): void {
    withSearchNotify(() => {
        state.searchState.currentSearchSummary = null

        // Clear appState
        appState.searchResults = []
        appState.searchSummary = null
        appState.searchState.isSearching = false
        appState.searchState.searchError = null
        appState.searchState.searchVisibleCount = 10
    })

    setSearchPanelState({ searching: false, focusing: false, resultsRendered: false, degraded: false })
    const spinner = document.getElementById('search-spinner')
    if (spinner) spinner.hidden = true
    if (_resultsEl) {
        _resultsEl.classList.remove('active')
        _resultsEl.classList.remove('searching')
        _resultsEl.classList.remove('is-searching-skeleton')
        _resultsEl.setAttribute('aria-busy', 'false')
        if (_resultsEl.dataset.legacyResultsSource === 'legacy') {
            _resultsEl.replaceChildren()
        } else {
            _resultsEl
                .querySelectorAll('[data-legacy-search-results="1"], [data-legacy-search-error-state="1"]')
                .forEach((el) => el.remove())
        }
        _resultsEl.dataset.legacyResultsSource = ''
        _resultsEl.removeAttribute('data-legacy-results-count')
        _resultsEl.removeAttribute('data-legacy-results-anchor')
        _resultsEl.removeAttribute('data-legacy-results-mode')
        _resultsEl.setAttribute('aria-hidden', _resultsEl.children.length > 0 ? 'false' : 'true')
    }
    if (_resultsEl) {
        _searchStateRegistry.delete(_resultsEl)
    }
    if (_statusEl) {
        _statusEl.hidden = true
        _statusEl.classList.remove('search-status-compact')
    }
    updateSearchTrailCue({ stage: 'query' })
    publish(EVENTS.SEARCH_CLEARED)
}

// ── Canonical Bridges and Stubs ─────────────────────────────────────────────

export function beginSemanticSearchUiState(
    resultsEl: HTMLElement | null,
    statusEl: HTMLElement | null,
    trimmedQuery: string
): void {
    applySemanticSearchLoadingState(resultsEl)
    if (statusEl) {
        statusEl.textContent = `Searching for businesses related to "${trimmedQuery}"...`
        statusEl.hidden = false
    }
    updateSearchTrailCue({ stage: 'query' })
}

export function applySemanticSearchDegradedState(
    resultsEl: HTMLElement | null,
    statusEl: HTMLElement | null,
    trimmedQuery: string,
    error: Error | null
): void {
    applySemanticSearchErrorState(resultsEl, statusEl, trimmedQuery, error)
}

export function applyEmptySemanticSearchState(
    resultsEl: HTMLElement | null,
    statusEl: HTMLElement | null,
    trimmedQuery: string
): void {
    appState.searchResults = []
    appState.searchSummary = { query: trimmedQuery, renderContext: null, mode: 'empty' }
    appState.searchState.searchError = null
    appState.searchState.isSearching = false
    if (resultsEl) {
        resultsEl.classList.remove('searching')
        resultsEl.classList.remove('is-searching-skeleton')
        resultsEl.setAttribute('aria-busy', 'false')
        if (resultsEl.dataset.legacyResultsSource === 'legacy') {
            resultsEl.replaceChildren()
        } else {
            resultsEl
                .querySelectorAll('[data-legacy-search-results="1"], [data-legacy-search-error-state="1"]')
                .forEach((el) => el.remove())
        }
        resultsEl.dataset.legacyResultsSource = ''
        resultsEl.removeAttribute('data-legacy-results-count')
        resultsEl.removeAttribute('data-legacy-results-anchor')
        resultsEl.removeAttribute('data-legacy-results-mode')
        resultsEl.setAttribute('aria-hidden', resultsEl.children.length > 0 ? 'false' : 'true')
    }
    if (statusEl) {
        statusEl.textContent = `No matches found for "${trimmedQuery}".`
        statusEl.hidden = false
    }
    updateSearchTrailCue({ stage: 'empty' })
}

export function startSearchVectorScramble(): void {
    document.body?.classList?.add('search-vector-scramble')
}

export function stopSearchVectorScramble(): void {
    document.body?.classList?.remove('search-vector-scramble')
}

export function updateSearchPreviewOverlay(): void {
    publish(EVENTS.COMPOSITION_UPDATED, { reason: 'search-preview' })
}

export function activateSearchGlow(resultIndices: number[] = [], anchorIndex: number | null = null): void {
    const topIndex = Number.isFinite(anchorIndex) ? anchorIndex : resultIndices.length > 0 ? resultIndices[0] : null
    storeSetSearchGlow(resultIndices, topIndex)
    setSearchGlowState(true)
    publish(EVENTS.COMPOSITION_UPDATED, { reason: 'search-glow' })
}

export function resetSemanticGuideUi(): void {
    publish(EVENTS.SUMMARY_CARD_HIDE_REQUESTED)
}

export function clearShortSemanticSearchState(resultsEl: HTMLElement | null, statusEl: HTMLElement | null): void {
    clearSearchState(resultsEl, statusEl)
}

export function startMobileRouteFieldPeek(_reason: string = 'hover'): void {
    // W47+ parity migration: parity-attrs.svelte.ts owns the body data-* attribute
    // mirror via appState rune reactivity. The appState.mobileRoutePeekActive rune
    // is the source of truth — callers write directly to the rune.
    // This stub is kept for barrel re-export compatibility only (no runtime callers).
}

export function clearMobileRouteFieldPeek(): void {
    // W47+ parity migration: parity-attrs clears body attrs / route-peek class
    // on its next reactive snapshot when appState.mobileRoutePeekActive is cleared.
    // This stub is kept for barrel re-export compatibility only (no runtime callers).
}

export function isMobileRouteFieldPeekActive(): boolean {
    return state.mobileRoutePeekActive === true
}

export function clearSearchPreviewHoverTimer(): void {
    if (state.searchPreviewHoverTimer) clearTimeout(state.searchPreviewHoverTimer)
    state.searchPreviewHoverTimer = null
}

export function updateSearchStatusMessage(matchCount: number | null = null): void {
    const statusEl = document.getElementById('search-status')
    if (!statusEl) return
    if (Number.isFinite(matchCount)) {
        statusEl.textContent = matchCount === 1 ? '1 match visible.' : `${matchCount} matches visible.`
    } else if ((state.searchState.currentSearchSummary as SearchSummaryState | null)?.visibleMatches) {
        statusEl.textContent = `${state.searchState.currentSearchSummary?.visibleMatches} matches visible.`
    }
}

// ── Dedupe near-duplicate results ───────────────────────────────────────────

type DedupeResult = {
    point?: { name?: string; city?: string } | null
    score: number
}

export function dedupeNearDuplicateResults<T extends DedupeResult>(results: T[]): T[] {
    if (!Array.isArray(results) || results.length < 2) return results
    const seen = new Map<string, { result: T; index: number }>()
    const out: T[] = []
    for (const result of results) {
        if (!result?.point) {
            out.push(result)
            continue
        }
        const key = nearDuplicateKey(result.point)
        if (!key) {
            out.push(result)
            continue
        }

        if (seen.has(key)) {
            const entry = seen.get(key)!
            if (result.score > entry.result.score) {
                out[entry.index] = result
                seen.set(key, { result, index: entry.index })
            }
        } else {
            const index = out.length
            out.push(result)
            seen.set(key, { result, index })
        }
    }
    return out
}

function nearDuplicateKey(point: { name?: string; city?: string }): string | null {
    if (!point.name || !point.city) return null
    const cleanName = point.name
        .toLowerCase()
        .replace(/\b(llc|inc|corp|co|ltd)\b/g, '')
        .replace(/[^a-z0-9]/g, '')
        .trim()
    const cleanCity = point.city.toLowerCase().trim()
    return `${cleanName}|${cleanCity}`
}

export function clearSearchGlow(): void {
    storeSetSearchGlow([], null)
    setSearchGlowState(false)
    publish(EVENTS.COMPOSITION_UPDATED)
}
