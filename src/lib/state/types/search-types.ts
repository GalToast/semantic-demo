/**
 * @lib/state/types/search-types.ts — Search-related state types.
 *
 * Extracted from state-types.ts (W13-T5b) to reduce file size.
 * Contains search summaries, results, errors, guides, and the SearchAppState aggregate.
 */

import type { SearchStatus, SearchRenderContext } from '@lib/types/state'

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
    renderContext?: SearchRenderContext
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
 *
 * Field sources (merged from 3 duplicate declarations):
 *   - search-types (original): lead_id, name, city
 *   - result-presentation.ts: what, lat, lng, cluster, status, website, email, phone, trivia
 *   - types/state.ts: what, cluster, website, email, phone
 */
export interface SearchResultPoint {
    lead_id?: string | number
    name?: string
    /** Business category description (from result-presentation.ts + types/state.ts). */
    what?: string
    city?: string
    /** Latitude (from result-presentation.ts). */
    lat?: number
    /** Longitude (from result-presentation.ts). */
    lng?: number
    /** Thematic cluster id (from result-presentation.ts + types/state.ts). */
    cluster?: number
    /** Business status label (from result-presentation.ts). */
    status?: string
    /** Official website URL (from result-presentation.ts + types/state.ts). */
    website?: string | null
    /** Public email (from result-presentation.ts + types/state.ts). */
    email?: string | null
    /** Public phone (from result-presentation.ts + types/state.ts). */
    phone?: string | null
    /** Trivia / note field (from result-presentation.ts). */
    trivia?: string
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
 *
 * CANONICAL definition — the single source of truth for SearchResult.
 * Merged from 3 duplicate declarations (2026-08-06):
 *   - search-types.ts (original): point?, index, score, publicNote?, publicDetail?
 *   - result-presentation.ts: point (required), index, score, publicNote?, publicDetail?
 *   - types/state.ts: id, name, index, score, category, snippet, point?
 *
 * All 3 modules now re-export from here.
 */
export interface SearchResult {
    /** Stable identifier for dedup / keying (from types/state.ts via semantic-search-mapper + local-search-index). */
    id: string
    /** Display name (from types/state.ts via semantic-search-mapper + local-search-index). */
    name: string
    /** Canonical corpus index. */
    index: number
    /** Match score, semantically normalized. */
    score: number
    /** Business category label (from types/state.ts). */
    category: string
    /** Human-readable snippet (from types/state.ts). */
    snippet: string
    /** Structured point data for focus/glow/transition consumers. */
    point?: SearchResultPoint | null
    /** Raw public note from data source (from result-presentation.ts + search-types.ts). */
    publicNote?: string
    /** Raw public detail from data source (from result-presentation.ts + search-types.ts). */
    publicDetail?: string
    /** Allow custom fields from external sources (all 3 modules). */
    [key: string]: unknown
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
 *   - currentEmptyQuery: last query that returned zero results
 *   - semanticTrailCue: idle|searching|focusing (the search→trail signal)
 *   - isCompactViewport: UI layout hint for search panel
 *   - semanticGuideRequestSequence: monotonic counter for guide rebuilds
 *   - currentSemanticGuide: latest semantic-guide text
 *   - summaryCardTypeToken: type-token for summary card renders
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
    currentEmptyQuery: string | null
    semanticTrailCue: string
    isCompactViewport: boolean
    semanticGuideRequestSequence: number
    currentSemanticGuide: string | null
    summaryCardTypeToken: number
    searchVisibleCount: number
}
