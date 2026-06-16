/**
 * search-results-ui.ts — Re-export stub.
 *
 * The canonical implementation moved to src/lib/search/results-ui.ts
 * as part of W14-T2 (search kernel retirement). This stub preserves
 * the import path for legacy consumers (js/modules/app.ts) until they
 * are migrated to import through the engine bridge or src/lib/ directly.
 */
export {
	setSearchPanelState,
	renderSearchResultItems,
	applySemanticSearchLoadingState,
	applySemanticSearchErrorState,
	beginSemanticSearchUiState,
	updateSemanticSearchRetryState,
	applySemanticSearchDegradedState,
	finishSemanticSearchSuccessState,
	applyEmptySemanticSearchState,
	clearSearchState,
	startSearchVectorScramble,
	stopSearchVectorScramble,
	updateSearchPreviewOverlay,
	activateSearchGlow,
	clearSearchGlow,
	resetSemanticGuideUi,
	clearShortSemanticSearchState,
	startMobileRouteFieldPeek,
	clearMobileRouteFieldPeek,
	isMobileRouteFieldPeekActive,
	clearSearchPreviewHoverTimer,
	focusSearchInputForReplacement,
	updateSearchStatusMessage
} from '../../src/lib/search/results-ui';
