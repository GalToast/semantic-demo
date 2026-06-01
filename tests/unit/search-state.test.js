import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as searchState from '../../js/modules/search-state.js';
import { state, withStateMutation } from '../../js/state.js';

// Mock dependencies
vi.mock('../../js/modules/search-tokenizer.js', () => ({
    tokenizeSearchText: vi.fn(),
    expandSearchIntent: vi.fn(),
    countTokenMatches: vi.fn()
}));

vi.mock('../../js/modules/search-mapper.js', () => ({
    getSemanticSearchServiceResults: vi.fn(),
    getSemanticSearchTotalMatches: vi.fn(),
    isNumericOnlySearchQuery: vi.fn(),
    resultMatchesNumericSearchQuery: vi.fn(),
    mapSemanticSearchServiceResult: vi.fn(),
    mapSemanticSearchResults: vi.fn(),
    hydrateSemanticResultContexts: vi.fn()
}));

vi.mock('../../js/modules/search-results-ui.js', () => ({
    setSearchPanelState: vi.fn(),
    renderSearchResultItems: vi.fn(),
    beginSemanticSearchUiState: vi.fn(),
    updateSemanticSearchRetryState: vi.fn(),
    applySemanticSearchDegradedState: vi.fn(),
    finishSemanticSearchSuccessState: vi.fn(),
    applyEmptySemanticSearchState: vi.fn(),
    stopSearchVectorScramble: vi.fn(),
    startSearchVectorScramble: vi.fn(),
    updateSearchPreviewOverlay: vi.fn(),
    activateSearchGlow: vi.fn(),
    clearSearchGlow: vi.fn(),
    resetSemanticGuideUi: vi.fn(),
    clearShortSemanticSearchState: vi.fn(),
    startMobileRouteFieldPeek: vi.fn(),
    clearSearchPreviewHoverTimer: vi.fn(),
    clearMobileRouteFieldPeek: vi.fn(),
    isMobileRouteFieldPeekActive: vi.fn(),
    focusSearchInputForReplacement: vi.fn(),
    updateSearchStatusMessage: vi.fn(),
    clearSearch: vi.fn()
}));

vi.mock('../../js/modules/search-filter-core.js', () => ({
    applyFilters: vi.fn(),
    getFilteredIndices: vi.fn(),
    pointMatchesActiveFilters: vi.fn()
}));

vi.mock('../../js/modules/ui-renderers.js', () => ({
    buildSearchResultItemHtml: vi.fn(),
    refreshSearchResultHierarchy: vi.fn(),
    setActiveSearchResultRow: vi.fn(),
    updateSearchTrailCue: vi.fn(),
    getSearchResultStrength: vi.fn(),
    getSearchResultStrengthLabel: vi.fn()
}));

vi.mock('../../js/modules/semantic-search-api-cache.js', () => ({
    fetchSemanticSearchResults: vi.fn(),
    getSemanticSearchCacheDiagnostics: vi.fn()
}));

vi.mock('../../js/modules/camera-controls.js', () => ({
    focusOnNode: vi.fn()
}));

vi.mock('../../js/modules/semantic-lane.js', () => ({
    recordSemanticLaneSnapshot: vi.fn()
}));

vi.mock('../../js/modules/navigation-state.js', () => ({
    clearTrailThreadState: vi.fn()
}));

vi.mock('../../js/modules/search-ui-adapter.js', () => ({
    hideTooltip: vi.fn(),
    positionTooltip: vi.fn(),
    updateTooltipContent: vi.fn()
}));

vi.mock('../../js/modules/search-panel-adapter.js', () => ({
    setSearchContainerState: vi.fn(),
    setSearchGlowState: vi.fn(),
    setupMobileSearchSheetToggle: vi.fn()
}));

vi.mock('../../js/modules/search-lifecycle-adapter.js', () => ({
    updateUrlState: vi.fn(),
    setSearchPanelState: vi.fn(),
    focusOnPoint: vi.fn(),
    resetNodePositions: vi.fn(),
    dispatchNavTransition: vi.fn(),
    syncSearchStatusForFocus: vi.fn(),
    updateJourneyCompass: vi.fn(),
    refreshCompositionState: vi.fn(),
    clearMobileRouteFieldPeek: vi.fn(),
    clearCompactSearchResultRevealTimers: vi.fn(),
    settleCompactSearchFocusCard: vi.fn(),
    switchView: vi.fn(),
    resetExplorationFocus: vi.fn(),
    scheduleSearchFocusTask: vi.fn((fn, delay) => {
        if (delay) {
            setTimeout(fn, delay);
        } else {
            fn();
        }
    })
}));

// Mock utils
vi.mock('../../js/modules/utils/dom-formatters.js', () => ({
    formatBusinessName: vi.fn(n => n)
}));

vi.mock('../../js/modules/utils/ui-presentation.js', () => ({
    isCompactSearchViewport: vi.fn(() => false)
}));

vi.mock('../../js/modules/utils/geo-data.js', () => ({
    pointHasGeocode: vi.fn(() => false)
}));

describe('search-state orchestration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        
        // Reset state
        withStateMutation(() => {
            Object.assign(state, {
                currentSearchSummary: null,
                searchAnchorIndex: null,
                searchPreviewIndex: null,
                navState: { focusedIndex: null },
                focusedNode: null,
                trailDepth: 0,
                myceliumMode: 'default',
                activeFilters: {},
                trailIndices: new Set()
            });
        });
        
        // Setup DOM
        document.body.innerHTML = `
            <div id="search-results"></div>
            <div id="search-status"></div>
            <input id="search-input" />
        `;
    });
    
    it('should short-circuit and clear on empty query', async () => {
        await searchState.search('');
        expect(state.currentSearchSummary).toBeNull();
    });
    
    it('should short-circuit on query less than 2 characters', async () => {
        await searchState.search('a');
        expect(state.currentSearchSummary).toBeNull();
    });
    
    it('should short-circuit on very long query', async () => {
        const longQuery = 'a'.repeat(201);
        await searchState.search(longQuery);
        const statusEl = document.getElementById('search-status');
        expect(statusEl.textContent).toContain('too long');
    });
    
    it('should clearSearch correctly', () => {
        searchState.clearSearch();
        expect(state.currentSearchSummary).toBeNull();
    });

    it('should clear search related focus state', () => {
        withStateMutation(() => {
            state.selectedPoint = { id: 1 };
            state.focusedNode = 1;
            state.navState.focusedIndex = 1;
            state.trailIndices.add(1);
        });
        
        searchState.clearSearchRelatedFocusState();
        
        expect(state.selectedPoint).toBeNull();
        expect(state.focusedNode).toBeNull();
        expect(state.trailIndices.size).toBe(0);
    });
});
