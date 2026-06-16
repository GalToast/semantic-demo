/**
 * @lib/engine/search-state-bridge.ts — Legacy bridge to the canonical
 * search orchestration layer.
 *
 * Replaces the deprecated `js/modules/search-state.ts` shim. All 11
 * importer files in the legacy kernel tree should switch to this bridge
 * during the W14-T8 search domain port.
 *
 * Architecture: orchestration logic lives in `src/lib/search/orchestration.ts`
 * (search/clearSearch/bind/begin transitions/etc.). Public-facing wrapper
 * functions that the kernel re-exported live in `src/lib/search/legacy-exports.ts`
 * (tokenize/expandSearchIntent/countTokenMatches/mapper re-exports/etc.).
 * The bridge re-exports from both, then forwards a handful of values and
 * types that the legacy kernel surfaced alongside them.
 */

import { publish, EVENTS } from '@lib/orchestration/event-bus';
import { formatBusinessName } from '@lib/utils/dom-formatters';
import { isCompactSearchViewport } from '@lib/utils/ui-presentation';
import {
  // Orchestration exports (canonical names)
  search,
  clearSearch,
  bindSearchResultInteractions,
  beginSearchFocusTransition,
  clearSearchRelatedFocusState,
  setSearchPanelState,
  renderSearchResultItems,
  beginSemanticSearchUiState,
  updateSemanticSearchRetryState,
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
  focusSearchInputForReplacement,
  updateSearchStatusMessage,
  setActiveSearchResultRow,
  updateSearchTrailCue
} from '../search/orchestration';
import {
  // Legacy kernel public API (tokenizer, mapper, filter, result-renderer)
  tokenizeSearchText,
  expandSearchIntent,
  countTokenMatches,
  getSemanticSearchServiceResults,
  getSemanticSearchTotalMatches,
  isNumericOnlySearchQuery,
  resultMatchesNumericSearchQuery,
  mapSemanticSearchServiceResult,
  mapSemanticSearchResults,
  hydrateSemanticResultContexts,
  recordEmptySearch,
  pointMatchesActiveFilters,
  applyFilters,
  getFilteredIndices,
  refreshSearchResultHierarchy,
  getSearchResultStrength,
  getSearchResultStrengthLabel,
  hideTooltip,
  positionTooltip,
  updateTooltipContent,
  getSemanticSearchCacheDiagnostics
} from '../search/legacy-exports';
import {
  setActiveFilter,
  toggleActiveFilterSignal,
  resetActiveFilters,
  restoreActiveFiltersFromUrl
} from '@lib/stores/filter.svelte';

// Re-export the entire public API. The bridge is the single seam that
// 11 legacy kernel importers switch to during the W14-T8 search port.
export {
  search,
  clearSearch,
  bindSearchResultInteractions,
  beginSearchFocusTransition,
  clearSearchRelatedFocusState,
  setSearchPanelState,
  renderSearchResultItems,
  beginSemanticSearchUiState,
  updateSemanticSearchRetryState,
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
  focusSearchInputForReplacement,
  updateSearchStatusMessage,
  applyFilters,
  getFilteredIndices,
  pointMatchesActiveFilters,
  refreshSearchResultHierarchy,
  setActiveSearchResultRow,
  updateSearchTrailCue,
  getSearchResultStrength,
  getSearchResultStrengthLabel,
  hideTooltip,
  positionTooltip,
  updateTooltipContent,
  getSemanticSearchCacheDiagnostics,
  tokenizeSearchText,
  expandSearchIntent,
  countTokenMatches,
  getSemanticSearchServiceResults,
  getSemanticSearchTotalMatches,
  isNumericOnlySearchQuery,
  resultMatchesNumericSearchQuery,
  mapSemanticSearchServiceResult,
  mapSemanticSearchResults,
  hydrateSemanticResultContexts,
  recordEmptySearch,
  setActiveFilter,
  toggleActiveFilterSignal,
  resetActiveFilters,
  restoreActiveFiltersFromUrl,
  formatBusinessName,
  publish,
  EVENTS,
  isCompactSearchViewport
};

// Type re-exports
export type { Point, ServiceResultRow } from '../search/legacy-exports';
