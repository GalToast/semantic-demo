import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as searchState from '../../js/modules/search-state.ts';
import { subscribe, EVENTS } from '../../js/modules/event-bus';
import { state, withStateMutation } from '../../js/state';
import { fetchSemanticSearchResults } from '../../js/modules/semantic-search-api-cache.js';
import {
    getSemanticSearchServiceResults,
    getSemanticSearchTotalMatches,
    mapSemanticSearchResults
} from '../../src/lib/search/mapper.ts';

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

vi.mock('../../js/modules/search-panel-adapter.js', () => ({
    setSearchContainerState: vi.fn(),
    setSearchGlowState: vi.fn(),
    setupMobileSearchSheetToggle: vi.fn()
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
        const resetEvents = [];
        const unsubscribe = subscribe(EVENTS.STATE_RESET, (payload) => resetEvents.push(payload));
        withStateMutation(() => {
            state.selectedPoint = { id: 1 };
            state.focusedNode = 1;
            state.navState.focusedIndex = 1;
            state.trailIndices.add(1);
        });
        
        searchState.clearSearchRelatedFocusState();
        unsubscribe();
        
        expect(state.selectedPoint).toBeNull();
        expect(resetEvents.at(-1)).toMatchObject({ reason: 'filter-invalidate', silent: true });
        expect(state.trailIndices.size).toBe(0);
    });

    it('publishes one success event for a single-result search while still requesting focus', async () => {
        const successEvents = [];
        const focusEvents = [];
        const unsubscribeSuccess = subscribe(EVENTS.SEARCH_SUCCESS, (payload) => successEvents.push(payload));
        const unsubscribeFocus = subscribe(EVENTS.SEARCH_FOCUS_REQUESTED, (payload) => focusEvents.push(payload));
        const point = {
            lead_id: 'lead-1',
            name: 'Single Result Plumbing',
            cluster: 1
        };

        fetchSemanticSearchResults.mockResolvedValue({ client_cache_hit: false });
        getSemanticSearchServiceResults.mockReturnValue([{ id: 'lead-1' }]);
        getSemanticSearchTotalMatches.mockReturnValue(1);
        mapSemanticSearchResults.mockReturnValue([{ index: 7, point }]);

        try {
            await searchState.search('plumbing');
        } finally {
            unsubscribeSuccess();
            unsubscribeFocus();
        }

        expect(successEvents).toHaveLength(1);
        expect(successEvents[0]).toMatchObject({ query: 'plumbing', source: 'network' });
        expect(focusEvents).toHaveLength(1);
        expect(focusEvents[0]).toMatchObject({ point, index: 7 });
        expect(document.getElementById('search-status').textContent)
            .toContain('1 match for "plumbing"');
    });
});
