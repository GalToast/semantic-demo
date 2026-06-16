/**
 * @lib/engine/search-state-bridge.ts — Legacy bridge to the canonical
 * search orchestration layer.
 *
 * Replaces the deprecated `js/modules/search-state.ts` shim. All 11
 * importer files in the legacy kernel tree should switch to this bridge
 * during the W14-T8 search domain port.
 *
 * Architecture: orchestration logic lives in `src/lib/search/orchestration.ts`
 * (search/bind/begin transitions/etc.). The state facade in
 * `src/lib/search/state.ts` re-exports the canonical names with the legacy
 * `clearSearch(options)` argument signature preserved. Public-facing wrapper
 * functions that the kernel re-exported live in `src/lib/search/legacy-exports.ts`
 * (tokenize/expandSearchIntent/countTokenMatches/mapper re-exports/etc.).
 * The bridge re-exports from both, then forwards a handful of values and
 * types that the legacy kernel surfaced alongside them.
 */

import { publish, EVENTS } from '@lib/orchestration/event-bus';
import { formatBusinessName } from '@lib/utils/dom-formatters';
import { isCompactSearchViewport } from '@lib/utils/ui-presentation';
import {
  // Canonical state facade (preserves the legacy clearSearch(options) shape)
  search,
  clearSearch,
  bindSearchResultInteractions,
  beginSearchFocusTransition,
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
  updateSearchTrailCue,
  applyFilters,
  getFilteredIndices,
  pointMatchesActiveFilters,
  refreshSearchResultHierarchy,
  getSearchResultStrength,
  getSearchResultStrengthLabel,
  getSemanticSearchCacheDiagnostics,
  type SearchOptions,
  type SearchContext
} from '../search/state';
import {
  // Legacy kernel public API (tokenizer, mapper, filter, result-renderer,
  // tooltip, hide/position/update, etc.) — names that the parallel-session
  // state facade does not surface directly.
  getSemanticSearchServiceResults,
  getSemanticSearchTotalMatches,
  isNumericOnlySearchQuery,
  resultMatchesNumericSearchQuery,
  mapSemanticSearchServiceResult,
  mapSemanticSearchResults,
  hydrateSemanticResultContexts,
  recordEmptySearch,
  tokenizeSearchText,
  expandSearchIntent,
  countTokenMatches,
  hideTooltip,
  positionTooltip,
  updateTooltipContent
} from '../search/legacy-exports';
// Filter-state legacy exports. These live in `js/modules/filter-state.ts`
// and are not yet ported to a Svelte store. The bridge re-exports them
// so the W14-T8 search port can retire the search-state kernel without
// forcing a parallel filter-state port. The bridge remains the single
// seam that legacy consumers should depend on.
import {
  setActiveFilter,
  toggleActiveFilterSignal,
  resetActiveFilters,
  restoreActiveFiltersFromUrl
} from '../../../js/modules/filter-state';
// `clearSearchRelatedFocusState` is a legacy-side-effect helper. The
// canonical implementation lives in legacy-exports.ts for now (see
// that module for the side-effect contract). Re-export it here so the
// bridge surface matches the deprecated search-state kernel.
import { clearSearchRelatedFocusState } from '../search/legacy-exports';

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
export type { SearchOptions, SearchContext } from '../search/state';
