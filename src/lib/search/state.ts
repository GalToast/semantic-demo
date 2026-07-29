/**
 * search/state.ts — Search state facade.
 *
 * Re-exports the canonical search API from already-ported modules.
 * Consumers import from here instead of the legacy
 */

import { publish, EVENTS } from '@lib/orchestration/event-bus'
import { clearSearch as storeClearSearch } from '@lib/stores/search.svelte'
import { appState } from '@lib/state/app.svelte'
import type { SearchResult } from './result-presentation'

export interface SearchOptions {
    preferCachedResults?: boolean
    offset?: number
    restoreAnchorLeadId?: string | number
    skipResetFocus?: boolean
    preserveSearch?: boolean
    suppressEvent?: boolean
}

export function clearSearch(options: SearchOptions = {}): void {
    if (!options.skipResetFocus) {
        publish(EVENTS.SEARCH_STATE_RESET_REQUESTED, {
            preserveSearch: true,
            skipUrlSync: true,
            skipSearchClearEvent: true
        })
    }
    storeClearSearch()
    if (!options.suppressEvent) {
        publish(EVENTS.SEARCH_CLEARED, {
            ...options,
            preservedSearch: !!options.preserveSearch
        })
    }
}

/**
 * Read one search result by index from the canonical search-state facade.
 * Returns null if results are empty or the index is out of range.
 */
export function getSearchResult(index: number): SearchResult | null {
    const results = appState.searchResults
    if (!Array.isArray(results) || index < 0 || index >= results.length) return null
    const result = results[index]
    if (!result || typeof result.index !== 'number') return null
    return result as SearchResult
}

export function getFirstSearchHit(): number | null {
    const first = getSearchResult(0)
    return first ? first.index : null
}

export { search, bindSearchResultInteractions, beginSearchFocusTransition, type SearchContext } from './orchestration'
export { setActiveSearchResultRow } from './result-renderer'

export {
    setSearchPanelState,
    renderSearchResultItems,
    beginSemanticSearchUiState,
    applySemanticSearchDegradedState,
    finishSemanticSearchSuccessState,
    applyEmptySemanticSearchState,
    stopSearchVectorScramble,
    startSearchVectorScramble,
    updateSearchPreviewOverlay,
    activateSearchGlow,
    clearSearchGlow,
    resetSemanticGuideUi,
    clearShortSemanticSearchState,
    startMobileRouteFieldPeek,
    clearSearchPreviewHoverTimer,
    clearMobileRouteFieldPeek,
    isMobileRouteFieldPeekActive,
    updateSearchStatusMessage
} from './results-ui'

export { setSearchContainerState, setSearchGlowState, setupMobileSearchSheetToggle } from './search-panel-adapter'
export { tokenizeSearchText, expandSearchIntent, countTokenMatches } from './tokenizer'
export { refreshSearchResultHierarchy, getSearchResultStrength, getSearchResultStrengthLabel } from './result-renderer'
export { updateSearchTrailCue } from '@lib/journey/search-trail-cue-renderer'

import { pointMatchesActiveFilters } from '@lib/stores/filter.svelte'
export { applyFilters, getFilteredIndices } from '@lib/orchestration/search-filter-core'
export { pointMatchesActiveFilters }

export { getSearchCacheDiagnostics as getSemanticSearchCacheDiagnostics } from '@lib/search/cache'
export { publish, EVENTS } from '@lib/orchestration/event-bus'
