/**
 * @lib/engine/search-results-ui-bridge.ts — Legacy search results DOM bridge.
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
} from '../../../js/modules/search-results-ui';
