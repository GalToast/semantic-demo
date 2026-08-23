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
import { withSearchNotify } from './search-core'
import { appState } from '@lib/state/app.svelte'

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

// P3-LCP (2026-08-21): a search-glows chunk extraction (S-2) originally planned
// runtime-lazy wrappers here. Hardening pass (2026-08-23, bug catalog #7): the
// extracted module turned out to be PURE DUPLICATION of these state writes —
// no visual side effects — and nothing ever called the loader, so the 717KB
// chunk was never fetched and the sync fallback below was already the complete
// behavior. Removed the dead dynamic-import machinery instead of wiring it up:
// wiring it would only add a pointless first-search fetch. If glow rendering
// ever gains real canvas work again, re-extract WITH a call site + ordering
// guarantee (re-apply latest state after load) from day one.
function _applySearchGlowState(forward: () => void): void {
    withSearchNotify(forward)
}
export function setGlowIndices(indices: Set<number>): void {
    _applySearchGlowState(() => {
        appState.searchState.searchGlowIndices = new Set(indices)
    })
}
export function setGlowActive(active: boolean): void {
    _applySearchGlowState(() => {
        appState.searchState.searchGlowActive = active
    })
}
export function setSearchGlow(indices: readonly number[], topIndex: number | null = indices[0] ?? null): void {
    _applySearchGlowState(() => {
        appState.searchState.searchGlowIndices = new Set(indices)
        appState.searchState.searchGlowTopIndex = topIndex
        appState.searchState.searchGlowActive = indices.length > 0
    })
}
export function clearSearchGlow(): void {
    _applySearchGlowState(() => {
        appState.searchState.searchGlowIndices = new Set()
        appState.searchState.searchGlowTopIndex = null
        appState.searchState.searchGlowActive = false
    })
}
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
