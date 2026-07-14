/**
 * @lib/state/types/search-types.ts — Search-related state types.
 *
 * Extracted from state-types.ts (W13-T5b) to reduce file size.
 * Contains search summaries, results, errors, guides, and the SearchAppState aggregate.
 */

import type { CacheEntry } from '@lib/search/cache'
import type { SearchStatus } from '@lib/types/state'

/** Shape of state.searchState.currentSearchSummary — set by search-state.ts, consumed by map-state, semantic-guide-ui, etc. */
export interface SearchSummary {
    query: string
    totalMatches: number
    totalSemanticMatches: number
    visibleMatches: number
    resultCount: number
    topScore: number
    anchorIndex: number | null
    topIndex: number | null
    resultIndices: number[]
    summaryType: 'semantic' | 'text' | 'mixed'
    reason?: string
}

/** Shape of state.semanticGuideState — drives the SemanticGuideCard component. */
export interface SemanticGuideState {
    isVisible: boolean
    isSynthesizing: boolean
    config: {
        title?: string
        text?: string
        laneStatus?: string
        suggestions?: Array<{
            lead_id?: string | number | null
            label?: string
            name?: string
            reason?: string
        }>
        degraded?: boolean
        cached?: boolean
        instant?: boolean
        summary?: string
        [key: string]: unknown
    } | null
    storyText?: string
    storySource?: string
    showStory?: boolean
    buttonMode?: string
    buttonOptions?: Record<string, unknown>
    typeToken?: number
}

/**
 * Shape of state.searchState.searchError — set by search.svelte.ts (setSearchError) and
 * results-ui.ts (searchErrorEnvelopes). Consumed by triggers.ts as a truthy
 * sentinel only — no consumer currently reads inner fields directly, but the
 * runtime shape is well-defined: a single object per failed search.
 *
 * Promotion: was a local interface in src/lib/search/results-ui.ts.
 * Hoisted to state-types.ts so appState can declare the field's shape.
 */
export interface SearchErrorData {
    query: string
    type: 'inline' | 'full'
    message: string
}

/**
 * A single point referenced by a search result.
 * Index signature allows custom fields from external sources.
 *
 * Promotion: was a local interface in src/lib/search/results-ui.ts.
 */
export interface SearchResultPoint {
    lead_id?: string | number
    name?: string
    city?: string
    [key: string]: unknown
}

/**
 * Shape of state.searchResults entries — produced by results-ui.ts and
 * consumed by search-result-renderer. The index signature preserves
 * back-compat with external sources that inject custom fields.
 *
 * Promotion: was a local interface in src/lib/search/results-ui.ts.
 * Hoisted to state-types.ts so appState can declare the field's shape
 * without `Array<Record<string, unknown>>`.
 */
export interface SearchResult {
    point: SearchResultPoint | null
    index: number
    score: number
    publicNote?: string
    publicDetail?: string
    [key: string]: unknown
}

export interface SemanticSearchCacheDiagnostics {
    hits: number
    misses: number
    stores: number
    evictions: number
    lastKey: string | null
    lastSource: string | null
    lastAgeMs: number | null
}

/**
 * @lib/state/types/search-types.ts — SearchAppState sub-aggregate (Phase 6b)
 *
 * The 20 persistent search-domain fields that used to live flat on
 * `AppState` are now grouped under `appState.searchState`. The factory
 * migration's `computeFromAppState` reads from appState, so this
 * partition doesn't break the search mirror — it just makes the
 * domain boundary explicit.
 *
 * Fields match what was previously flat on AppState (search.svelte.ts
 * Phase-4 migration snapshot):
 *   - currentSearchSummary: the active SearchSummary payload
 *   - searchStatus: idle|searching|focusing|results|empty|error
 *   - searchError: structured error envelope
 *   - searchRequestSequence: monotonic counter for stale-request cancellation
 *   - searchAnchorIndex / searchPreviewIndex: selection/preview hooks
 *   - searchGlowIndices / searchGlowTopIndex / searchGlowActive: visualization state
 *   - searchFocusTransitionToken: search↔focus bridge signal
 *   - isSearching: derived-friendly boolean flag
 *   - currentEmptyQuery: last query that returned zero results
 *   - semanticTrailCue: idle|searching|focusing (the search→trail signal)
 *   - isCompactViewport: UI layout hint for search panel
 *   - semanticGuideRequestSequence: monotonic counter for guide rebuilds
 *   - currentSemanticGuide: latest semantic-guide text
 *   - summaryCardTypeToken: type-token for summary card renders
 *   - semanticSearchCacheDiagnostics: cache health telemetry
 *   - semanticSearchResultCache: cached search results by lead-id
 *   - searchVisibleCount: pagination size
 */
export interface SearchAppState {
    currentSearchSummary: SearchSummary | null
    searchStatus: SearchStatus
    searchError: SearchErrorData | null
    searchRequestSequence: number
    searchAnchorIndex: number | null
    searchPreviewIndex: number | null
    searchGlowIndices: Set<number>
    searchGlowTopIndex: number | null
    searchGlowActive: boolean
    searchFocusTransitionToken: number
    isSearching: boolean
    currentEmptyQuery: string | null
    semanticTrailCue: string
    isCompactViewport: boolean
    semanticGuideRequestSequence: number
    currentSemanticGuide: string | null
    summaryCardTypeToken: number
    semanticSearchCacheDiagnostics: SemanticSearchCacheDiagnostics
    semanticSearchResultCache: Map<string, CacheEntry>
    searchVisibleCount: number
}
