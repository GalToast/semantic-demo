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

// P3-LCP (2026-08-21): search-glows chunk co-bundles three helpers → 717KB on boot.
// Provide runtime-lazy wrappers so the chunk is never fetched on mobile 2D cold paint.
// The real setters live in ./search-glows; this barrel dynamic-imports them on first use.
let _glowMod: typeof import('./search-glows') | null = null
let _glowProm: Promise<typeof import('./search-glows')> | null = null
function _ensureGlow() {
    if (_glowMod) return Promise.resolve(_glowMod)
    if (!_glowProm) _glowProm = import('./search-glows').then((m) => (_glowMod = m, m)).catch((e) => { _glowProm = null; throw e })
    return _glowProm
}
// Sync fallback while the glow chunk loads: mirror search-glows' exact
// appState writes (withSearchNotify included) so first-call readers never see
// stale state — the T4 migration contract asserts synchronously.
function _glowFallback(forward: () => void): void {
    if (_glowMod) { forward(); return }
    withSearchNotify(forward)
}
export function setGlowIndices(indices: Set<number>): void {
    _glowFallback(() => { appState.searchState.searchGlowIndices = new Set(indices) })
}
export function setGlowActive(active: boolean): void {
    _glowFallback(() => { appState.searchState.searchGlowActive = active })
}
export function setSearchGlow(indices: readonly number[], topIndex: number | null = indices[0] ?? null): void {
    _glowFallback(() => {
        appState.searchState.searchGlowIndices = new Set(indices)
        appState.searchState.searchGlowTopIndex = topIndex
        appState.searchState.searchGlowActive = indices.length > 0
    })
}
export function clearSearchGlow(): void {
    _glowFallback(() => {
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
