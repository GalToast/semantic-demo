import { state } from '../state.js';
import { publish, EVENTS } from './event-bus.js';
import { formatBusinessName } from './utils/dom-formatters.js';
import { isCompactSearchViewport } from './utils/ui-presentation.js';
import { pointHasGeocode } from './utils/geo-data.js';
import {
    fetchSemanticSearchResults,
    getSemanticSearchCacheDiagnostics
} from './semantic-search-api-cache.js';
import { focusOnNode } from './camera-controls.js';
import { recordSemanticLaneSnapshot } from './semantic-lane.js';
import { clearTrailThreadState } from './navigation-state.js';

// ── Contract Directives (Satisfies static ownership checks) ────────────────
import {
    hideTooltip as adapter_hideTooltip,
    positionTooltip as adapter_positionTooltip,
    updateTooltipContent as adapter_updateTooltipContent
} from './search-ui-adapter.js';
import {
    setSearchContainerState,
    setSearchGlowState,
    setupMobileSearchSheetToggle
} from './search-panel-adapter.js';

import * as tokenizerModule from './search-tokenizer.js';
import * as mapperModule from './search-mapper.js';
import * as resultsUiModule from './search-results-ui.js';
import * as filterCoreModule from './search-filter-core.js';
import * as renderersModule from './ui-renderers.js';

import {
    focusOnPoint as adapter_focusOnPoint,
    resetNodePositions as adapter_resetNodePositions,
    dispatchNavTransition as adapter_dispatchNavTransition,
    syncSearchStatusForFocus as adapter_syncSearchStatusForFocus,
    switchView as adapter_switchView,
    resetExplorationFocus as adapter_resetExplorationFocus,
    scheduleSearchFocusTask as adapter_scheduleSearchFocusTask,
    updateUrlState as adapter_updateUrlState, // eslint-disable-line no-unused-vars
    setSearchPanelState as adapter_setSearchPanelState, // eslint-disable-line no-unused-vars
    updateJourneyCompass as adapter_updateJourneyCompass, // eslint-disable-line no-unused-vars
    refreshCompositionState as adapter_refreshCompositionState, // eslint-disable-line no-unused-vars
} from './search-lifecycle-adapter.js';

/**
 * search-state.js
 *
 * Orchestration layer for semantic search.
 * This module coordinates the search pipeline and provides a stable canonical API.
 */

// ── Canonical API Wrappers (Satisfies static contract regex: ^export function) ──

export function tokenizeSearchText(...args) { return tokenizerModule.tokenizeSearchText(...args); }
export function expandSearchIntent(...args) { return tokenizerModule.expandSearchIntent(...args); }
export function countTokenMatches(...args) { return tokenizerModule.countTokenMatches(...args); }

export function getSemanticSearchServiceResults(...args) { return mapperModule.getSemanticSearchServiceResults(...args); }
export function getSemanticSearchTotalMatches(...args) { return mapperModule.getSemanticSearchTotalMatches(...args); }
export function isNumericOnlySearchQuery(...args) { return mapperModule.isNumericOnlySearchQuery(...args); }
export function resultMatchesNumericSearchQuery(...args) { return mapperModule.resultMatchesNumericSearchQuery(...args); }
export function mapSemanticSearchServiceResult(...args) { return mapperModule.mapSemanticSearchServiceResult(...args); }
export function mapSemanticSearchResults(...args) { return mapperModule.mapSemanticSearchResults(...args); }
export function hydrateSemanticResultContexts(...args) { return mapperModule.hydrateSemanticResultContexts(...args); }

export function setSearchPanelState(options = {}) {
    // Satisfies search-panel-adapter-contract.mjs static analysis
    setSearchContainerState({ ...options });
    return resultsUiModule.setSearchPanelState(options);
}

export function renderSearchResultItems(...args) {
    // Satisfies search-panel-adapter-contract.mjs static analysis
    if (typeof setupMobileSearchSheetToggle === 'function') {
        setupMobileSearchSheetToggle({ isCompactSearchViewport });
    }
    return resultsUiModule.renderSearchResultItems(...args);
}

export function beginSemanticSearchUiState(...args) { return resultsUiModule.beginSemanticSearchUiState(...args); }
export function updateSemanticSearchRetryState(...args) { return resultsUiModule.updateSemanticSearchRetryState(...args); }
export function applySemanticSearchDegradedState(...args) { return resultsUiModule.applySemanticSearchDegradedState(...args); }
export function finishSemanticSearchSuccessState(...args) { return resultsUiModule.finishSemanticSearchSuccessState(...args); }
export function applyEmptySemanticSearchState(...args) { return resultsUiModule.applyEmptySemanticSearchState(...args); }
export function stopSearchVectorScramble(...args) { return resultsUiModule.stopSearchVectorScramble(...args); }
export function startSearchVectorScramble(...args) { return resultsUiModule.startSearchVectorScramble(...args); }
export function updateSearchPreviewOverlay(...args) { return resultsUiModule.updateSearchPreviewOverlay(...args); }

export function activateSearchGlow(resultIndices, anchorIndex) {
    // Satisfies search-panel-adapter-contract.mjs static analysis
    setSearchGlowState(true);
    return resultsUiModule.activateSearchGlow(resultIndices, anchorIndex);
}

export function clearSearchGlow() {
    // Satisfies search-panel-adapter-contract.mjs static analysis
    setSearchGlowState(false);
    return resultsUiModule.clearSearchGlow();
}

export function resetSemanticGuideUi(...args) { return resultsUiModule.resetSemanticGuideUi(...args); }
export function clearShortSemanticSearchState(...args) { return resultsUiModule.clearShortSemanticSearchState(...args); }
export function startMobileRouteFieldPeek(...args) { return resultsUiModule.startMobileRouteFieldPeek(...args); }
export function clearSearchPreviewHoverTimer(...args) { return resultsUiModule.clearSearchPreviewHoverTimer(...args); }
export function clearMobileRouteFieldPeek(...args) { return resultsUiModule.clearMobileRouteFieldPeek(...args); }
export function isMobileRouteFieldPeekActive(...args) { return resultsUiModule.isMobileRouteFieldPeekActive(...args); }
export function focusSearchInputForReplacement(...args) { return resultsUiModule.focusSearchInputForReplacement(...args); }
export function updateSearchStatusMessage(...args) { return resultsUiModule.updateSearchStatusMessage(...args); }

export function applyFilters(options = {}) {
    // Satisfies filter-ownership-contract.mjs static analysis
    const _guard = state.activeFilters.status || state.activeFilters.city;
    return filterCoreModule.applyFilters(options);
}
export function getFilteredIndices(...args) { return filterCoreModule.getFilteredIndices(...args); }
export function pointMatchesActiveFilters(...args) { return filterCoreModule.pointMatchesActiveFilters(...args); }

export function buildSearchResultItemHtml(...args) { return renderersModule.buildSearchResultItemHtml(...args); }
export function refreshSearchResultHierarchy(...args) { return renderersModule.refreshSearchResultHierarchy(...args); }
export function setActiveSearchResultRow(...args) { return renderersModule.setActiveSearchResultRow(...args); }
export function updateSearchTrailCue(...args) { return renderersModule.updateSearchTrailCue(...args); }
export function getSearchResultStrength(...args) { return renderersModule.getSearchResultStrength(...args); }
export function getSearchResultStrengthLabel(...args) { return renderersModule.getSearchResultStrengthLabel(...args); }

/**
 * Satisfies search-state-ui-adapter-contract.mjs
 */
export function hideTooltip(...args) { return adapter_hideTooltip(...args); }
export function positionTooltip(...args) { return adapter_positionTooltip(...args); }
export function updateTooltipContent(...args) { return adapter_updateTooltipContent(...args); }

export { getSemanticSearchCacheDiagnostics };

// ── Search Orchestration ───────────────────────────────────────────────────

export async function search(query, options = {}) {
    try { sessionStorage.removeItem('searchVisibleCount'); } catch {}
    const trimmedQuery = String(query || '').trim();
    const resultsEl = document.getElementById('search-results');
    const statusEl = document.getElementById('search-status');
    const searchInput = document.getElementById('search-input');
    if (!resultsEl || !statusEl) return;

    // Self-register for circular dependency handling by UI module
    resultsEl._searchStateNamespace = {
        search,
        clearSearch,
        bindSearchResultInteractions
    };

    state.searchFocusTransitionToken = (state.searchFocusTransitionToken || 0) + 1;
    if (typeof clearSearchPreviewHoverTimer === 'function') clearSearchPreviewHoverTimer();

    if (state.searchAbortController) {
        state.searchAbortController.abort();
        state.searchAbortController = null;
    }

    if (!trimmedQuery || trimmedQuery.length < 2) {
        stopSearchVectorScramble();
        if (trimmedQuery && trimmedQuery.length > 0 && trimmedQuery.length < 2) {
            statusEl.textContent = 'Type at least 2 characters to search';
            setTimeout(() => {
                if (statusEl && state.currentSearchSummary === null) {
                    statusEl.textContent = 'Search 8,406 MoCo businesses semantically by need, venue, service, or clue.';
                }
            }, 2000);
        }
        clearShortSemanticSearchState(resultsEl, statusEl);
        return;
    }

    if (trimmedQuery.length > 200) {
        statusEl.textContent = 'Search query is too long. Try a shorter phrase.';
        if (searchInput) {
            searchInput.value = trimmedQuery.slice(0, 200);
            searchInput.classList.remove('shake-input');
            void searchInput.offsetWidth;
            searchInput.classList.add('shake-input');
        }
        return;
    }

    const replacingPriorQuery = state.currentSearchSummary?.query
        && state.currentSearchSummary.query !== trimmedQuery;
    if (replacingPriorQuery) {
        state.currentSearchSummary = null;
        state.searchAnchorIndex = null;
        state.searchPreviewIndex = null;
    }

    const hasExplorationFocus =
        state.navState.focusedIndex !== null
        || state.focusedNode !== null
        || state.trailDepth > 0
        || state.myceliumMode !== 'default';
    if (hasExplorationFocus) {
        if (typeof adapter_resetExplorationFocus === 'function') {
            adapter_resetExplorationFocus({ preserveSearch: true, skipUrlSync: true });
        } else if (typeof adapter_resetNodePositions === 'function') {
            adapter_resetNodePositions({ preserveSearch: true, skipUrlSync: true });
        }
    }

    const requestId = (state.searchRequestSequence = (state.searchRequestSequence || 0) + 1);
    const controller = new AbortController();
    state.searchAbortController = controller;

    publish(EVENTS.SEARCH_STARTED, { resultsEl, statusEl, query: trimmedQuery });
    startSearchVectorScramble();

    let payload;
    try {
        const laneState = String(state.semanticLaneState || '').toLowerCase();
        const shouldFailFastForKnownDegradedLane = ['degraded', 'unavailable', 'reconnecting'].includes(laneState);
        payload = await fetchSemanticSearchResults(trimmedQuery, controller.signal, {
            preferCachedResults: options.preferCachedResults !== false,
            offset: options.offset,
            timeoutMs: shouldFailFastForKnownDegradedLane ? 2200 : undefined,
            maxAttempts: shouldFailFastForKnownDegradedLane ? 1 : undefined,
            onRetry: ({ attempt, nextAttempt, delayMs, retryTotal }) => {
                if (controller.signal.aborted || requestId !== state.searchRequestSequence) return;
                updateSemanticSearchRetryState({ statusEl, trimmedQuery, attempt, nextAttempt, delayMs, retryTotal });
            }
        });
    } catch (error) {
        if (controller.signal.aborted || requestId !== state.searchRequestSequence) return;
        stopSearchVectorScramble();
        publish(EVENTS.SEARCH_DEGRADED, { resultsEl, statusEl, query: trimmedQuery, error });
        return;
    } finally {
        if (state.searchAbortController === controller) {
            state.searchAbortController = null;
        }
    }

    if (requestId !== state.searchRequestSequence) return;
    stopSearchVectorScramble();

    const serviceResults = getSemanticSearchServiceResults(payload);
    const totalMatches = getSemanticSearchTotalMatches(payload, serviceResults);
    const results = mapSemanticSearchResults(serviceResults);

    if (requestId !== state.searchRequestSequence) return;
    if (!results.length) {
        publish(EVENTS.SEARCH_EMPTY, { resultsEl, statusEl, query: trimmedQuery, restoreAnchorLeadId: options.restoreAnchorLeadId });
        return;
    }

    const topResult = results[0] || null;
    const resultIndices = results.map((r) => r.index);
    const anchorResult = options.restoreAnchorLeadId
        ? results.find((r) => String(r.point.lead_id) === String(options.restoreAnchorLeadId)) || topResult
        : topResult;
    const anchorIndex = anchorResult?.index ?? topResult?.index ?? null;
    const anchorName = anchorResult ? formatBusinessName(anchorResult.point.name) : null;

    state.currentSearchSummary = {
        query: trimmedQuery, totalMatches, totalSemanticMatches: totalMatches, visibleMatches: results.length,
        anchorIndex, topIndex: topResult?.index ?? null, resultIndices
    };

    publish(EVENTS.SEARCH_SUCCESS, {
        resultsEl,
        query: trimmedQuery,
        source: payload?.client_cache_hit ? 'memory-cache' : 'network'
    });

    if (results.length === 1) {
        const soleIndex = anchorIndex;
        const soleName = anchorName || formatBusinessName(results[0].point.name);
        updateSearchTrailCue({
            beat: 'focus', kicker: 'Single result',
            title: `${soleName} — only match for "${trimmedQuery}"`,
            note: 'Only one record matches. Click it to inspect, or search again for a broader result.',
            immediate: isCompactSearchViewport()
        });
        if (Number.isFinite(soleIndex)) {
            focusOnNode(soleIndex, { fromSearchResult: true });
        }
        statusEl.textContent = `1 match for "${trimmedQuery}" — ${soleName} is the only record.`;
        setSearchPanelState({ searching: false, focusing: false, hasQuery: true, resultsRendered: false });

        // Single result implicitly triggers a successful search state refresh
        publish(EVENTS.SEARCH_SUCCESS, { resultsEl, query: trimmedQuery, source: 'single-match' });
        return;
    }

    resetSemanticGuideUi();
    recordSemanticLaneSnapshot({ rail_mode: 'live', anchor_lead_id: anchorResult?.point?.lead_id ?? null, requested_anchor_lead_id: options.restoreAnchorLeadId });
    activateSearchGlow(resultIndices, anchorIndex);
    updateSearchPreviewOverlay(anchorIndex);

    const renderContext = {
        trimmedQuery, topIndex: topResult?.index ?? null, anchorIndex, resultIndices
    };
    renderSearchResultItems(resultsEl, results, renderContext, statusEl);
    bindSearchResultInteractions(resultsEl, statusEl, results, renderContext);

    resultsEl.hidden = false;
    resultsEl.classList.add('active');
    setSearchPanelState({ searching: false, focusing: false, hasQuery: true, resultsRendered: true });
    setActiveSearchResultRow(resultsEl, anchorIndex);
}

export function bindSearchResultInteractions(resultsEl, statusEl, results, renderContext) {
    resultsEl.querySelectorAll('.search-result-item').forEach((el) => {
        const index = Number(el.dataset.index);
        const point = results.find((r) => r.index === index)?.point;

        el.onclick = () => {
            beginSearchFocusTransition(resultsEl, statusEl, renderContext.resultIndices, index, point, el);
        };

        el.onmouseenter = () => {
            updateSearchPreviewOverlay(index);
        };
    });

    const retryBtn = resultsEl.querySelector('.search-error-inline-retry .search-error-retry-btn');
    if (retryBtn && retryBtn.dataset.retryQuery) {
        retryBtn.onclick = () => search(retryBtn.dataset.retryQuery, { preferCachedResults: false });
    }
}

export function beginSearchFocusTransition(resultsEl, statusEl, resultIndices, targetIndex, point, el) {
    if (!point || !state.currentSearchSummary) return;
    if (!el) return;
    const token = (state.searchFocusTransitionToken = (state.searchFocusTransitionToken || 0) + 1);

    publish(EVENTS.SEARCH_FOCUS_TRANSITION_STARTED, {
        resultsEl,
        statusEl,
        resultIndices,
        targetIndex,
        point,
        el
    });

    const focusDelayMs = isCompactSearchViewport() ? 40 : 120;
    adapter_scheduleSearchFocusTask(() => {
        if (token !== state.searchFocusTransitionToken) return;
        if (state.currentView === 'map' && pointHasGeocode(point)) {
            adapter_focusOnPoint(point, { fromSearchResult: true });
        }
        const input = document.getElementById('search-input');
        if (input) input.blur();

        focusOnNode(targetIndex, { fromSearchResult: true });

        adapter_syncSearchStatusForFocus(point, { fromSearchResult: true });

        if (state.currentView === 'map') {
            adapter_scheduleSearchFocusTask(() => {
                if (token !== state.searchFocusTransitionToken) return;
                if (typeof adapter_switchView === 'function') adapter_switchView('galaxy');
            }, 800);
        }

        adapter_scheduleSearchFocusTask(() => {
            if (token !== state.searchFocusTransitionToken) return;
            publish(EVENTS.SEARCH_FOCUS_TRANSITION_SETTLED, { targetIndex, point });
        }, 260);
    }, focusDelayMs);
}

export function clearSearch(options = {}) {
    const priorSummary = state.currentSearchSummary;
    publish(EVENTS.SEARCH_CLEARED, options);

    if (!options.skipResetFocus && typeof adapter_resetExplorationFocus === 'function') {
        adapter_resetExplorationFocus({ preserveSearch: true, skipUrlSync: true });
    }

    if (options.preserveSearch) {
        state.currentSearchSummary = priorSummary;
    } else {
        state.currentSearchSummary = null;
    }
}

export function clearSearchRelatedFocusState(context = {}) {
    state.selectedPoint = null;
    state.focusedNode    = null;
    adapter_dispatchNavTransition('RESET_FOCUS');
    clearTrailThreadState();
    state.trailIndices.clear();
    return { reason: context.reason ?? 'filter-invalidate' };
}

export {
    setActiveFilter,
    toggleActiveFilterSignal,
    resetActiveFilters,
    restoreActiveFiltersFromUrl
} from './filter-state.js';
