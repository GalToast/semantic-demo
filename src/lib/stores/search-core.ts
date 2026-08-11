/**
 * @lib/stores/search-core.ts — Search mutation/setter surface (Svelte 5 runes)
 *
 * Extracted from search.svelte.ts (S-3). Owns the window-keyed searchMirror
 * singleton, the mutation/setter family, and the notification bridge.
 *
 * The mirror is created here so the factory + resetForTests stay in ONE atomic
 * unit. search.svelte.ts re-exports the public API so all consumer imports
 * remain unchanged.
 */
import type { SearchState, SearchResult, SearchSummary, SearchStatus } from '@lib/types/state'
import type { BusinessRecord } from '@lib/types/business'
import { type Readable } from 'svelte/store'
import { getBusinessRecords } from '@lib/data-store'
import { performSearch } from '@lib/search-engine'
import { appState } from '@lib/state/app.svelte.ts'
import { createStateMirror } from '@lib/state/create-state-mirror'
import { updateSearchTrailCue } from '@lib/journey/search-trail-cue-renderer'
import { writeNavStateMirror } from './navigation.svelte.ts'
import { publish, EVENTS } from '@lib/orchestration/event-bus'

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
    // Score retention (2026-08-07, F-search-8 exposure): the summary keeps
    // resultIndices + topScore, but the render slice rebuilt here hardcoded
    // score: 0, so the DOM never surfaced real scores (scores are normalized
    // 0-1 upstream, e.g. local-index Math.min(1, hit.score/3.0)). Look up the
    // live score from appState.searchResults (the canonical scored array) by
    // index so rendered items carry honest scores.
    const scoredByIndex = new Map<number, number>()
    for (const r of appState.searchResults ?? []) {
        scoredByIndex.set(r.index, r.score)
    }
    return indices.map((idx) => {
        const index = Number(idx)
        const record = records[index]
        return {
            id: String(index),
            name: record?.name ?? 'Unknown',
            index,
            score: scoredByIndex.get(index) ?? 0,
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
 * mirrorToAppState target in the factory bindings — setting a binding would
 * double-write to appState. The ONE explicit exception is `update()`: it
 * wraps through withSearchNotify and bridges the updater result into appState
 * via `syncSearchUpdateToAppState` (P1-1 state sweep, 2026-08-07) — factory
 * update() with all-null bindings was a silent no-op for appState.
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
    // Wrapped through withSearchNotify (same as `set`): the updater runs inside
    // the notify, its result is bridged into appState (SoT) by
    // syncSearchUpdateToAppState, then the fresh appState-derived snapshot is
    // published. Fixes P1-1: factory update() with all-null bindings never
    // synced appState, so update callers (lifecycle.ts: resetExperienceState /
    // activateSearchGlow / recordEmptySearch / hideExploreTrailReview) silently
    // desynced the writable from appState.
    fn.update = (updater: (_s: SearchStoreState) => SearchStoreState) => {
        withSearchNotify(() => {
            const current = searchMirror()
            syncSearchUpdateToAppState(current, updater(current))
        })
    }
    fn.set = (value: SearchStoreState) => withSearchNotify(() => value)

    return fn
}

/** Single reactive instance of the search state. */
export const searchStore: SearchStoreApi = _createSearchStore()

/** Backwards-compatible alias. */
export const searchState: SearchStoreApi = searchStore

/** Test-only escape hatch — drops the window-keyed singleton. */
export const resetSearchForTests = searchMirror.resetForTests

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

/**
 * Reverse of `buildSearchStoreSnapshot`: write an `update()` updater's result
 * back into appState, the single source of truth. The factory bindings are
 * intentionally all-null (notification channel — see searchMirror doc), so
 * this explicit bridge is what makes `searchStore.update(fn)` sync appState
 * the way `set` does via withSearchNotify. Derived fields (query / results /
 * hasQuery / resultsRendered) have no appState home of their own — they are
 * bridged onto the summary object only when the updater changed them, so the
 * inverse stays lossless. `activeResultId` is written only on change via the
 * canonical nav mirror (same as setActiveResult) to avoid clobbering unrelated
 * nav state.
 */
function syncSearchUpdateToAppState(current: SearchStoreState, next: SearchStoreState): void {
    // When the updater sets a query but there's no summary, auto-create
    // a minimal summary so the query is persisted to appState. Match the
    // pattern in setSearchQuery (L363–373). Without this, searchStore.update
    // silently drops the query field because the bridge only writes query
    // into summary.query inside the `if (next.summary)` block below.
    // (regression: lifecycle-composition-contract focused-record + query → focus-search, 2026-08-07)
    if (!next.summary && next.query && next.query !== current.query) {
        next.summary = {
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

    // Whole-object summary field: null lands as a clear, replacement lands as
    // the new object, and an untouched ref is an idempotent same-ref assign.
    appState.searchState.currentSearchSummary = next.summary
    if (next.summary) {
        const summary = next.summary
        // Inverse of the snapshot derivation (query/results are derived FROM
        // the summary) — only bridge when the updater actually changed them.
        if (next.query !== summary.query) summary.query = next.query
        const derivedIndices = next.results.map((r) => r.index)
        if (
            derivedIndices.length !== summary.resultIndices.length ||
            derivedIndices.some((idx, i) => idx !== summary.resultIndices[i])
        ) {
            summary.resultIndices = derivedIndices
        }
    }
    if (next.activeResultId !== current.activeResultId) {
        writeNavStateMirror({ focusedIndex: next.activeResultId !== null ? Number(next.activeResultId) : null })
    }
    appState.searchState.searchStatus = next.status
    appState.searchState.searchRequestSequence = next.requestSequence
    appState.searchState.searchAnchorIndex = next.anchorIndex
    appState.searchState.searchPreviewIndex = next.previewIndex
    appState.searchState.searchGlowIndices =
        next.glowIndices instanceof Set ? new Set(next.glowIndices) : next.glowIndices
    appState.searchState.searchGlowTopIndex = next.glowTopIndex
    appState.searchState.searchGlowActive = next.glowActive
    appState.searchState.currentEmptyQuery = next.currentEmptyQuery
    appState.searchState.searchFocusTransitionToken = next.focusTransitionToken
    appState.searchState.semanticTrailCue = next.trailCue
    appState.searchState.isCompactViewport = next.isCompactViewport
    appState.searchState.semanticGuideRequestSequence = next.semanticGuideRequestSequence
    appState.searchState.currentSemanticGuide = next.currentSemanticGuide
    appState.searchState.summaryCardTypeToken = next.summaryCardTypeToken
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
