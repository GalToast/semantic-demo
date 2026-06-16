/**
 * DEATH-BRIDGE: js/modules/search-state.ts — Retained during W15 rewire.
 *
 * This file was ported to `src/lib/search/state.ts`. All consumers should
 * migrate to the canonical facade at `@lib/search/state` or the legacy bridge
 * at `@lib/engine/search-state-bridge`.
 *
 * This re-export stub preserves imports until all legacy consumers are rewired.
 * TODO(w15) — Wave 15 follow-up: remove once all js/modules/ consumers are migrated.
 */

export {
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
  applyFilters,
  getFilteredIndices,
  pointMatchesActiveFilters,
  refreshSearchResultHierarchy,
  setActiveSearchResultRow,
  updateSearchTrailCue,
  getSearchResultStrength,
  getSearchResultStrengthLabel,
  getSemanticSearchCacheDiagnostics,
  clearSearchRelatedFocusState
} from '@lib/engine/search-state-bridge';

export type {
  SearchOptions,
  SearchContext
} from '@lib/engine/search-state-bridge';
