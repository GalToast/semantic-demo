/**
 * @lib/stores/search.svelte.ts — Search engine barrel (Svelte 5 runes)
 *
 * Re-exports from sibling modules so all consumer imports resolve here
 * with no path changes.
 *
 * S-1: search-react-selectors.ts  — read getters + focus-intent shim
 * S-2: search-glows.ts            — glow/highlight setters
 * S-3: search-core.ts             — mirror singleton + mutation/setter surface
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

// ── Rerank Feature Flag ─────────────────────────────────────────────────────

/**
 * A/B test toggle for NIM rerank. Off by default.
 */
export const searchUseRerank = writable(false)

// ── Re-export tokenizer functions ───────────────────────────────────────────

export { tokenizeRaw as tokenizeSearchText, expandRaw as expandSearchIntent, countRaw as countTokenMatches }
export { SEARCH_STOP_WORDS }
export type { IntentExpansion, TokenMatchResult }

// ── Re-export from sibling modules ──────────────────────────────────────────

export {
    searchQuery,
    searchStatus,
    searchResults,
    hasSearchQuery,
    hasResults,
    isSearching,
    searchSummary,
    activeResult,
    getSearchSummary,
    requestSearchInputFocus,
    consumeSearchInputFocusIntent
} from './search-react-selectors'

export {
    setGlowIndices,
    setGlowActive,
    setSearchGlow,
    clearSearchGlow
} from './search-glows'

export type { SearchStoreState, SearchStoreApi } from './search-core'

export {
    searchStore,
    searchState,
    resetSearchForTests,
    withSearchNotify,
    setSearchQuery,
    setSearchStatus,
    setSearchError,
    setSearchSummary,
    setAnchorIndex,
    setPreviewIndex,
    clearShortSemanticSearchStateStore,
    setTrailCue,
    incrementRequestSequence,
    isRequestCurrent,
    incrementFocusTransitionToken,
    setSemanticGuide,
    setCompactViewport,
    bumpSummaryCardTypeToken,
    clearSearch,
    clearSearchResults,
    validateSearchQuery,
    setActiveResult,
    searchVisibleCount,
    setSearchVisibleCount,
    setSearchResults,
    runSearch,
    castSearchResults
} from './search-core'
