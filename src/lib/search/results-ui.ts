/**
 * @lib/search/results-ui.ts — Svelte search results UI bridge.
 *
 * The canonical DOM implementation still lives in the legacy engine kernel
 * while the Svelte search orchestration port is in progress.
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
} from '@lib/engine/search-results-ui-bridge';
