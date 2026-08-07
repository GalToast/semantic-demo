/**
 * @lib/stores/search.svelte.ts — Search engine, tokenization, and result state store (Svelte 5 runes)
 */
import type { SearchState, SearchResult, SearchSummary, SearchStatus } from '@lib/types/state'
import type { BusinessRecord } from '@lib/types/business'
import { type Readable, writable } from 'svelte/store'
import {
    tokenizeSearchText as tokenizeRaw,
    expandSearchIntent as expandRaw,
    countTokenMatches as countRaw,
    SEARCH_STOP_WORDS,
    type IntentExpansion,
    type TokenMatchResult
} from '@lib/search/tokenizer'
import { testCompatStore } from './test-compat.svelte'
import { performSearch } from '@lib/search-engine'
import { appState } from '@lib/state/app.svelte.ts'
import { updateSearchTrailCue } from '@lib/journey/search-trail-cue-renderer'
import { writeNavStateMirror } from './navigation.svelte.ts'
import { publish, EVENTS } from '@lib/orchestration/event-bus'
import { getBusinessRecords } from '@lib/data-store'
import { createStateMirror } from '@lib/state/create-state-mirror'

// ── Rerank Feature Flag ─────────────────────────────────────────────────────

/**
 * A/B test toggle for NIM rerank. Off by default.
 */
export const searchUseRerank = writable(false)

// ── Re-export tokenizer functions ───────────────────────────────────────────

export { tokenizeRaw as tokenizeSearchText, expandRaw as expandSearchIntent, countRaw as countTokenMatches }
export { SEARCH_STOP_WORDS }
export type { IntentExpansion, TokenMatchResult }

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_QUERY_LENGTH = 200
const MIN_QUERY_LENGTH = 2

// ── Initial State ────────────────────────────────────────────────────────────

const INITIAL_SEARCH_STATE: SearchState = {
    query: '',
    results: [],
    activeResultId: null,
    summary: null,
    status: 'idle',
    hasQuery: false,
    resultsRendered: false,
    degraded: false
}

// ── Extended Search Store ────────────────────────────────────────────────────

export interface SearchStoreState extends SearchState {
    /** Request sequence number (for cancelling stale requests). */
    requestSequence: number
    /** Anchor index of the search results. */
    anchorIndex: number | null
    /** Preview index (hovered result). */
    previewIndex: number | null
    /** Indices that are glowing in the field. */
    glowIndices: Set<number>
    /** Top glow index (first result). */
    glowTopIndex: number | null
    /** Whether search glow is active. */
    glowActive: boolean
    /** Last empty query recorded. */
    currentEmptyQuery: string | null
    /** Search focus transition token. */
    focusTransitionToken: number
    /** Semantic trail cue state. */
    trailCue: 'idle' | 'searching' | 'focusing'
    /** Whether search input is compact viewport. */
    isCompactViewport: boolean
    /** Semantic guide abort controller. */
    semanticGuideRequestSequence: number
    /** Current semantic guide text. */
    currentSemanticGuide: string | null
    /** Summary card type token. */
    summaryCardTypeToken: number
}

// ── Store ────────────────────────────────────────────────────────────────────

/** SearchStore type: callable function + Readable + actions. */
export type SearchStoreApi = (() => SearchStoreState) &
    Readable<SearchStoreState> & {
        update(_fn: (_s: SearchStoreState) => SearchStoreState): void
        set(_value: SearchStoreState): void
    }

function buildSearchResultsFromIndices(indices: number[] | undefined): SearchResult[] {
    if (!indices || !indices.length) return []
    const records = (getBusinessRecords() || []) as BusinessRecord[]
    return indices.map((idx) => {
        const index = Number(idx)
        const record = records[index]
        return {
            id: String(index),
            name: record?.name ?? 'Unknown',
            index,
            score: 0,
            category: record?.category ?? '',
            snippet: record?.what ?? '',
            point: record
                ? {
                      name: record.name,
                      what: record.what,
                      cluster: record.cluster,
                      city: record.city,
                      website: record.website,
                      email: record.email,
                      phone: record.phone
                  }
                : undefined
        }
    })
}

/** Build a fresh SearchStoreState snapshot from appState. */
function buildSearchStoreSnapshot(): SearchStoreState {
    return {
        ...INITIAL_SEARCH_STATE,
        query: appState.searchState.currentSearchSummary?.query ?? '',
        results:
            buildSearchResultsFromIndices(
                appState.searchState.currentSearchSummary?.resultIndices as number[] | undefined
            ) ?? [],
        activeResultId: appState.navState.focusedIndex !== null ? String(appState.navState.focusedIndex) : null,
        summary: appState.searchState.currentSearchSummary ? { ...appState.searchState.currentSearchSummary } : null,
        status: appState.searchState.searchStatus,
        hasQuery: (appState.searchState.currentSearchSummary?.query ?? '').length > 0,
        resultsRendered: (appState.searchState.currentSearchSummary?.resultIndices?.length ?? 0) > 0,
        requestSequence: appState.searchState.searchRequestSequence,
        anchorIndex: appState.searchState.searchAnchorIndex,
        previewIndex: appState.searchState.searchPreviewIndex,
        glowIndices:
            appState.searchState.searchGlowIndices instanceof Set
                ? new Set(appState.searchState.searchGlowIndices)
                : appState.searchState.searchGlowIndices,
        glowTopIndex: appState.searchState.searchGlowTopIndex,
        glowActive: appState.searchState.searchGlowActive,
        currentEmptyQuery: appState.searchState.currentEmptyQuery,
        focusTransitionToken: appState.searchState.searchFocusTransitionToken,
        trailCue: appState.searchState.semanticTrailCue as SearchStoreState['trailCue'],
        isCompactViewport: appState.searchState.isCompactViewport,
        semanticGuideRequestSequence: appState.searchState.semanticGuideRequestSequence,
        currentSemanticGuide: appState.searchState.currentSemanticGuide as string | null,
        summaryCardTypeToken: appState.searchState.summaryCardTypeToken
    }
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * The search mirror.
 *
 * The factory owns the writable subscriber channel (replacing the hand-rolled
 * `_searchWritable` from the pre-migration file) and the window-keyed singleton
 * that preserves the channel
 * across dynamic imports. `computeFromAppState` reads the current appState-
 * derived snapshot on every call — so `searchStore()` always returns a value
 * that matches appState byte-for-byte.
 *
 * Every binding is intentionally `null`. This store's writable is a pure
 * subscriber notification channel; `appState` is the single source of truth
 * for all 22 fields, and every write path goes `appState.X =
 * ...; searchMirror.set(fresh)` via `withSearchNotify`. There is no
 * mirrorToAppState target — setting a binding would double-write to appState.
 *
 * The `storageKey` MUST be the deterministic string below — tests using
 * `delete window['__SEMANTIC_EXPLORER_SEARCH_MIRROR__']` rely on a predictable
 * key to reset the cross-chunk singleton between cases. Do NOT replace with a
 * random suffix.
 */
const searchMirror = createStateMirror<SearchStoreState>({
    computeFromAppState: buildSearchStoreSnapshot,
    storageKey: '__SEMANTIC_EXPLORER_SEARCH_MIRROR__',
    bindings: {
        // All fields null — writable is a notification channel, appState is SoT.
        query: null,
        results: null,
        activeResultId: null,
        summary: null,
        status: null,
        hasQuery: null,
        resultsRendered: null,
        requestSequence: null,
        anchorIndex: null,
        previewIndex: null,
        glowIndices: null,
        glowTopIndex: null,
        glowActive: null,
        currentEmptyQuery: null,
        focusTransitionToken: null,
        trailCue: null,
        isCompactViewport: null,
        semanticGuideRequestSequence: null,
        currentSemanticGuide: null,
        summaryCardTypeToken: null
    }
})

/** Build the SearchStoreApi over the factory mirror. */
function _createSearchStore(): SearchStoreApi {
    // Function call: returns fresh sync snapshot from kernel
    const fn = (() => searchMirror()) as unknown as SearchStoreApi

    fn.subscribe = searchMirror.subscribe
    fn.update = searchMirror.update
    fn.set = (value: SearchStoreState) => withSearchNotify(() => value)

    return fn
}

/** Single reactive instance of the search state. */
export const searchStore: SearchStoreApi = _createSearchStore()

/** Backwards-compatible alias. */
export const searchState: SearchStoreApi = searchStore

/** Test-only escape hatch — drops the window-keyed singleton. */
export const resetSearchForTests = searchMirror.resetForTests

// ── Derived Getters ──────────────────────────────────────────────────────────

export const searchQuery = () => appState.searchState.currentSearchSummary?.query ?? ''
export const searchStatus = () => appState.searchState.searchStatus
export const searchResults = () => appState.searchState.currentSearchSummary?.resultIndices ?? []
export const hasSearchQuery = () => (appState.searchState.currentSearchSummary?.query ?? '').length > 0
export const hasResults = () => (appState.searchState.currentSearchSummary?.resultIndices?.length ?? 0) > 0
export const isSearching = () => appState.searchState.searchStatus === 'searching'
export const searchSummary = () => appState.searchState.currentSearchSummary
export const activeResult = () =>
    appState.navState.focusedIndex !== null ? String(appState.navState.focusedIndex) : null

/** Returns the current search summary, or null. */
export function getSearchSummary(): SearchSummary | null {
    if (appState.searchState.currentSearchSummary) return appState.searchState.currentSearchSummary as SearchSummary
    const testState = testCompatStore()
    // @ts-expect-error -- testCompatStore returns TestCompatState which lacks searchState; legacy bridge gap (w32-b). Remove when TestCompatState includes a searchState field (ticket W53-L2-followup)
    return (testState?.searchState?.summary as SearchSummary) ?? null
}

// ── Actions ──────────────────────────────────────────────────────────────────

/**
 * Wrap an appState mutation so the Svelte store facade wakes its subscribers.
 *
 * After `fn()` runs (and therefore all `appState.X = ...` mutations have fired),
 * this re-reads the current appState-derived snapshot and publishes it to the
 * factory-writable. Since `buildSearchStoreSnapshot()` returns a brand-new
 * object literal every call, `safe_not_equal` detects the change and notifies
 * every `$searchState` subscriber — which is what wakes `SearchResults.svelte`
 * and the other `$searchState`-prefixed consumers. This is the A3-1 regression
 * root cause: `?q=restaurant` updates the store query in appState, but without
 * this explicit publish, the result list never repaints because the facade
 * never propagates the new `resultIndices` to its subscribers.
 *
 * Always prefer this over direct `appState.X = ...` writes inside the action
 * functions below.
 */
export function withSearchNotify<T>(fn: () => T): T {
    const result = fn()
    const fresh = buildSearchStoreSnapshot()
    searchMirror.set(fresh)
    return result
}

// ── Focus-intent bridge (idle↔search-surface remount) ───────────────────────
//
// Typing into #search-input flips the panel surface 'idle'→'search' (parity
// layer), which unmounts the idle <SearchBar> (App.svelte {#if idleSearchVisible})
// and mounts the panel-contained one inside InfoPanel. That remount destroys
// the focused <input>, dropping focus to <body> and swallowing every keystroke
// after the first. This module-scoped flag bridges the two SearchInput
// instances: the dying instance sets it on input; the freshly-mounted instance
// consumes it in onMount and restores focus.
let _searchInputFocusIntent = false

/** Mark that #search-input should reclaim focus after the next mount. */
export function requestSearchInputFocus(): void {
    _searchInputFocusIntent = true
}

/** One-shot: returns true if focus should be restored, then resets the flag. */
export function consumeSearchInputFocusIntent(): boolean {
    const v = _searchInputFocusIntent
    _searchInputFocusIntent = false
    return v
}

export function setSearchQuery(query: string): void {
    withSearchNotify(() => {
        if (!appState.searchState.currentSearchSummary) {
            appState.searchState.currentSearchSummary = {
                query: '',
                totalMatches: 0,
                totalSemanticMatches: 0,
                visibleMatches: 0,
                resultCount: 0,
                topScore: 0,
                anchorIndex: null,
                topIndex: null,
                resultIndices: [],
                summaryType: 'text'
            }
        }
        appState.searchState.currentSearchSummary.query = query
    })
}

export function setSearchStatus(status: SearchStatus): void {
    withSearchNotify(() => {
        appState.searchState.searchStatus = status
        if (status === 'searching') {
            updateSearchTrailCue({ stage: 'query' })
        }
    })
}

type SearchErrorType = 'full' | 'inline'

export function setSearchError(query: string, error: unknown, type: SearchErrorType = 'full'): void {
    withSearchNotify(() => {
        appState.searchState.searchStatus = 'error'
        appState.searchState.searchError = {
            query,
            type,
            message: error instanceof Error ? error.message : String(error || 'Search failed')
        }
        updateSearchTrailCue({ stage: 'empty' })
    })
}

export function setSearchSummary(summary: SearchSummary | null): void {
    withSearchNotify(() => {
        appState.searchState.currentSearchSummary = summary
        if (summary) appState.searchState.searchStatus = 'results'
    })
}

export function setAnchorIndex(index: number | null): void {
    withSearchNotify(() => {
        appState.searchState.searchAnchorIndex = index
    })
}

export function setPreviewIndex(index: number | null): void {
    withSearchNotify(() => {
        appState.searchState.searchPreviewIndex = index
    })
}

export function setGlowIndices(indices: Set<number>): void {
    withSearchNotify(() => {
        appState.searchState.searchGlowIndices = indices
    })
}

export function setGlowActive(active: boolean): void {
    withSearchNotify(() => {
        appState.searchState.searchGlowActive = active
    })
}

export function setSearchGlow(indices: readonly number[], topIndex: number | null = indices[0] ?? null): void {
    withSearchNotify(() => {
        appState.searchState.searchGlowIndices = new Set(indices)
        appState.searchState.searchGlowTopIndex = topIndex
        appState.searchState.searchGlowActive = indices.length > 0
    })
}

export function clearSearchGlow(): void {
    withSearchNotify(() => {
        appState.searchState.searchGlowIndices = new Set()
        appState.searchState.searchGlowTopIndex = null
        appState.searchState.searchGlowActive = false
    })
}

/**
 * Kernel-write mirror of the former searchStore.update() clear in
 * search-filter-core. The mirror bindings are null, so update() only
 * notified subscribers and never touched appState; this action writes the
 * real kernel fields via withSearchNotify so consumers reading appState
 * (glow slices, currentSearchSummary) actually see the clear.
 */
export function clearShortSemanticSearchStateStore(): void {
    withSearchNotify(() => {
        appState.searchState.currentSearchSummary = null
        appState.searchState.searchGlowActive = false
        appState.searchState.searchGlowIndices = new Set()
        appState.searchState.searchGlowTopIndex = null
        appState.searchState.searchPreviewIndex = null
        appState.searchState.searchAnchorIndex = null
    })
}

export function setTrailCue(cue: SearchStoreState['trailCue']): void {
    withSearchNotify(() => {
        appState.searchState.semanticTrailCue = cue
    })
}

export function incrementRequestSequence(): number {
    let next = 0
    withSearchNotify(() => {
        appState.searchState.searchRequestSequence += 1
        next = appState.searchState.searchRequestSequence
    })
    return next
}

export function isRequestCurrent(sequence: number): boolean {
    return appState.searchState.searchRequestSequence === sequence
}

export function incrementFocusTransitionToken(): number {
    let next = 0
    withSearchNotify(() => {
        appState.searchState.searchFocusTransitionToken += 1
        next = appState.searchState.searchFocusTransitionToken
    })
    return next
}

export function setSemanticGuide(text: string | null): void {
    withSearchNotify(() => {
        appState.searchState.currentSemanticGuide = text
    })
}

export function setCompactViewport(value: boolean): void {
    withSearchNotify(() => {
        appState.searchState.isCompactViewport = value
    })
}

export function bumpSummaryCardTypeToken(): number {
    let next = 0
    withSearchNotify(() => {
        appState.searchState.summaryCardTypeToken += 1
        next = appState.searchState.summaryCardTypeToken
    })
    return next
}

export function clearSearch(): void {
    withSearchNotify(() => {
        appState.searchResults = []
        appState.searchState.currentSearchSummary = null
        appState.searchState.searchStatus = 'idle'
        appState.searchState.searchError = null
        appState.searchState.searchAnchorIndex = null
        appState.searchState.searchPreviewIndex = null
        appState.searchState.searchGlowIndices = new Set()
        appState.searchState.searchGlowTopIndex = null
        appState.searchState.searchGlowActive = false
        appState.searchState.currentEmptyQuery = null
        updateSearchTrailCue({ beat: 'idle' })
    })
}

/** Clear result payloads while preserving the current query text. */
export function clearSearchResults(): void {
    withSearchNotify(() => {
        if (appState.searchState.currentSearchSummary) {
            appState.searchState.currentSearchSummary.resultIndices = []
            appState.searchState.currentSearchSummary.resultCount = 0
            appState.searchState.currentSearchSummary.totalMatches = 0
            appState.searchState.currentSearchSummary.totalSemanticMatches = 0
            appState.searchState.currentSearchSummary.visibleMatches = 0
            appState.searchState.currentSearchSummary.topScore = 0
            appState.searchState.currentSearchSummary.anchorIndex = null
            appState.searchState.currentSearchSummary.topIndex = null
        }
        appState.searchState.searchStatus = 'idle'
        appState.searchState.searchError = null
        appState.searchState.searchAnchorIndex = null
        appState.searchState.searchPreviewIndex = null
    })
}

/** Normalize and validate a user-entered search query. */
export function validateSearchQuery(query: string): { valid: boolean; query: string; reason?: string } {
    const normalized = String(query ?? '')
        .trim()
        .slice(0, MAX_QUERY_LENGTH)
    if (normalized.length === 0) return { valid: false, query: '', reason: 'empty' }
    if (normalized.length < MIN_QUERY_LENGTH) return { valid: false, query: normalized, reason: 'too-short' }
    return { valid: true, query: normalized }
}

export function setActiveResult(id: string | null): void {
    withSearchNotify(() => {
        writeNavStateMirror({ focusedIndex: id ? Number(id) : null })
    })
}

export function searchVisibleCount(): number {
    try {
        const v = sessionStorage.getItem('searchVisibleCount')
        if (v) return Number(v) || 10
    } catch {
        /* ignore */
    }
    return 10
}

export function setSearchVisibleCount(n: number): void {
    try {
        sessionStorage.setItem('searchVisibleCount', String(n))
    } catch {
        /* ignore */
    }
}

export function setSearchResults(results: SearchResult[]): void {
    // CONTRACT (2026-08-06, search-race audit): canonical STORE-path writer of
    // currentSearchSummary. Sibling writer: orchestration.search() →
    // setSearchSummary (DOM path). Both populate appState.searchResults. Keep
    // the field sets aligned; consumers read currentSearchSummary (the legacy
    // appState.searchSummary mirror was removed — it had 0 readers).
    withSearchNotify(() => {
        if (!appState.searchState.currentSearchSummary) {
            appState.searchState.currentSearchSummary = {
                query: '',
                totalMatches: 0,
                totalSemanticMatches: 0,
                visibleMatches: 0,
                resultCount: 0,
                topScore: 0,
                anchorIndex: null,
                topIndex: null,
                resultIndices: [],
                summaryType: 'text'
            }
        }
        const summary = appState.searchState.currentSearchSummary
        summary.resultIndices = results.map((r) => r.index)
        summary.resultCount = results.length
        summary.totalMatches = results.length
        summary.visibleMatches = results.length
        summary.topScore = results[0]?.score ?? 0
        summary.topIndex = results[0]?.index ?? null
        summary.anchorIndex = results[0]?.index ?? null
        summary.renderContext = {
            trimmedQuery: summary.query,
            topIndex: summary.topIndex,
            anchorIndex: summary.anchorIndex,
            topScore: summary.topScore
        }
        // Consumers (getSearchResult / getFirstSearchHit) and the deep-link
        // path read appState.searchResults directly — keep it in sync.
        appState.searchResults = results
        appState.searchState.searchStatus = 'results'
        appState.searchState.searchError = null
        updateSearchTrailCue(results.length > 0 ? { stage: 'explore' } : { stage: 'empty' })
    })
}

/**
 * Execute a search and update the store. Used by URL restoration and search input.
 */
export async function runSearch(query: string, signal: AbortSignal): Promise<void> {
    // Clear any persisted visible count from a prior search so the
    // new result set's count starts fresh. The input-driven path
    // (orchestration.search) does the same; the deep-link path
    // (url-state.ts -> runSearch) was missing this, allowing a
    // stale sessionStorage value to overshoot the current total.
    try {
        sessionStorage.removeItem('searchVisibleCount')
    } catch {
        /* ignore */
    }

    const trimmed = query.trim()
    if (trimmed.length < 2) {
        clearSearch()
        return
    }

    setSearchQuery(trimmed)
    setSearchStatus('searching')
    const requestId = incrementRequestSequence()

    try {
        const results = await performSearch(trimmed, signal)
        // A newer runSearch may have superseded this request while the
        // search was in flight. Only the latest request may write results
        // or publish success/empty — a slower superseded request must not
        // overwrite the newer query's results.
        if (!isRequestCurrent(requestId)) return
        setSearchResults(results)
        if (results.length > 0) {
            publish(EVENTS.SEARCH_SUCCESS, { query: trimmed, count: results.length })
        } else {
            publish(EVENTS.SEARCH_EMPTY, { query: trimmed })
        }
    } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        // Errors from a superseded request must not create a visible error
        // state — the newer request owns the status/error fields now.
        if (!isRequestCurrent(requestId)) return
        setSearchError(trimmed, err)
    }
}

/** Utility to clean and cast search results from a service payload. */
export function castSearchResults(
    serviceResults: Array<{
        index: number | string
        name?: string
        score?: number
        category?: string
        snippet?: string
        lead_id?: string
        id?: string
    }>
): SearchResult[] {
    return serviceResults.map((r) => ({
        id: String(r.id ?? r.lead_id ?? r.index),
        name: String(r.name ?? 'Unknown'),
        index: Number(r.index),
        score: Number(r.score ?? 0),
        category: String(r.category ?? ''),
        snippet: String(r.snippet ?? '')
    }))
}
