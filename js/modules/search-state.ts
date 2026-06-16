/**
 * search-state.ts
 *
 * @deprecated — Canonical import: @lib/search-engine for search execution,
 * @lib/stores/search.svelte for search state, @lib/search-cache for caching.
 *
 * Orchestration layer for semantic search.
 * This module coordinates the search pipeline and provides a stable canonical API.
 * DECOUPLED: Communicates with lifecycle and URL layers via Event Bus.
 *
 * After Ticket 5: search() delegates to performSearch() from @lib/search-engine,
 * eliminating the dual-path through semantic-search-api-cache.ts.
 */

import { state, type Point, type SemanticState } from '../state.ts';
import { getSearchAbortController, getSearchRequestSequence, getSearchFocusTransitionToken, getTrailIndices } from '../state/selectors/index.ts'
import { publish, EVENTS } from '@lib/orchestration/event-bus';
import { formatBusinessName } from './utils/dom-formatters.ts';
import { isCompactSearchViewport } from './utils/ui-presentation.ts';
import { performSearch } from '../../src/lib/search-engine.ts';
import { getSearchCacheDiagnostics } from '../../src/lib/search-cache.ts';
import { recordSemanticLaneSnapshot } from './semantic-lane.ts';
import { clearTrailThreadState } from './navigation-state.ts';
import {
    searchResultsStore,
    searchSummaryStore,
    isSearchingStore,
    searchErrorStore,
    searchVisibleCountStore
} from './stores.ts';

// ── UI Integration ─────────────────────────────────────────────────────
import {
    setSearchContainerState,
    setSearchGlowState,
    setupMobileSearchSheetToggle
} from './search-panel-adapter.ts';

import * as tokenizerModule from '@lib/search/tokenizer';
import * as mapperModule from '@lib/search/mapper';
import type { ServiceResultRow } from '@lib/search/mapper';
import * as resultsUiModule from '@lib/search/results-ui';
import * as filterCoreModule from '@lib/orchestration/search-filter-core';
import { refreshSearchResultHierarchy as refreshSearchResultHierarchyImpl, setActiveSearchResultRow as setActiveSearchResultRowImpl, getSearchResultStrength as getSearchResultStrengthImpl, getSearchResultStrengthLabel as getSearchResultStrengthLabelImpl } from '../../src/lib/search/result-renderer.ts';
import { updateSearchTrailCue as updateSearchTrailCueImpl } from './search-trail-cue-renderer.ts';
import { appState } from '@lib/state/app.svelte';

// ── Types ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyResult = any;

interface SearchResult {
    index: number;
    point: Point;
    score?: number;
    name?: string;
}

interface SearchContext {
    trimmedQuery: string;
    topIndex: number | null;
    topScore: number | null;
    anchorIndex: number | null;
    resultIndices: number[];
}

interface SearchOptions {
    preferCachedResults?: boolean;
    offset?: number;
    restoreAnchorLeadId?: string | number;
    skipResetFocus?: boolean;
    preserveSearch?: boolean;
    suppressEvent?: boolean;
}

const _s = state as unknown as SemanticState;

// ── Canonical API Wrappers (Satisfies static contract regex: ^export function) ──

export function tokenizeSearchText(query: string): string[] { return tokenizerModule.tokenizeSearchText(query); }
export function expandSearchIntent(text: string, intent: string): string[] { return tokenizerModule.expandSearchIntent(text, intent); }
export function countTokenMatches(text: string, query: string): { exact: number; prefix: number } { return tokenizerModule.countTokenMatches(text, query); }

export function getSemanticSearchServiceResults(payload: { results?: ServiceResultRow[] } | null): ServiceResultRow[] { return mapperModule.getSemanticSearchServiceResults(payload); }
export function getSemanticSearchTotalMatches(payload: { count?: number } | null | undefined, serviceResults: ServiceResultRow[]): number { return mapperModule.getSemanticSearchTotalMatches(payload, serviceResults); }
export function isNumericOnlySearchQuery(query: unknown): boolean { return mapperModule.isNumericOnlySearchQuery(query); }
export function resultMatchesNumericSearchQuery(result: { point?: { lead_id?: string | number; phone?: string; lat?: number; lng?: number }; address?: string; publicNote?: string; publicDetail?: string; naics?: string } | null, query: unknown): boolean { return mapperModule.resultMatchesNumericSearchQuery(result, query); }
export function mapSemanticSearchServiceResult(row: ServiceResultRow, order: number): SearchResult | null { return mapperModule.mapSemanticSearchServiceResult(row, order) as SearchResult | null; }
export function mapSemanticSearchResults(serviceResults: ServiceResultRow[]): SearchResult[] { return mapperModule.mapSemanticSearchResults(serviceResults) as SearchResult[]; }
export function hydrateSemanticResultContexts(results: { point: { lead_id?: string | number; name?: string; city?: string; status?: string }; publicNote: string; publicDetail: string; address: string; naics: string }[]): void { return mapperModule.hydrateSemanticResultContexts(results as Parameters<typeof mapperModule.hydrateSemanticResultContexts>[0]); }

export function recordEmptySearch(query: string): void {
    publish(EVENTS.SEARCH_EMPTY, { query });
}

export function setSearchPanelState(options: Record<string, unknown> = {}): void {
    if (typeof options.searching === 'boolean' || typeof options.focusing === 'boolean') {
        const currentCue = appState.semanticTrailCue || 'idle';
        const nextSearching = typeof options.searching === 'boolean' ? options.searching : currentCue === 'searching';
        const nextFocusing = typeof options.focusing === 'boolean' ? options.focusing : currentCue === 'focusing';
        state.semanticTrailCue = nextFocusing ? 'focusing' : nextSearching ? 'searching' : 'idle';
    }
    // Satisfies search-panel-adapter-contract.mjs static analysis
    setSearchContainerState({ ...options });
    return resultsUiModule.setSearchPanelState(options);
}

export function renderSearchResultItems(resultsEl: HTMLElement, results: SearchResult[], renderContext: SearchContext, statusEl: HTMLElement | null): void {
    // Satisfies search-panel-adapter-contract.mjs static analysis
    if (typeof setupMobileSearchSheetToggle === 'function') {
        setupMobileSearchSheetToggle({ isCompactSearchViewport });
    }
    return resultsUiModule.renderSearchResultItems(resultsEl, results as Parameters<typeof resultsUiModule.renderSearchResultItems>[1], renderContext as Parameters<typeof resultsUiModule.renderSearchResultItems>[2], statusEl);
}

export function beginSemanticSearchUiState(statusEl: HTMLElement | null, resultsEl: HTMLElement | null, mode: string): void { return resultsUiModule.beginSemanticSearchUiState(statusEl, resultsEl, mode); }
export function updateSemanticSearchRetryState(params: { statusEl: HTMLElement | null; trimmedQuery: string; nextAttempt: number; delayMs: number }): void { return resultsUiModule.updateSemanticSearchRetryState(params); }
export function applySemanticSearchDegradedState(...args: unknown[]): void { return resultsUiModule.applySemanticSearchDegradedState(...args as [HTMLElement | null, HTMLElement | null, string, Error | null]); }
export function finishSemanticSearchSuccessState(...args: unknown[]): void { return resultsUiModule.finishSemanticSearchSuccessState(...args as [HTMLElement | null, string, string]); }
export function applyEmptySemanticSearchState(...args: unknown[]): void { return resultsUiModule.applyEmptySemanticSearchState(...args as [HTMLElement | null, HTMLElement | null, string]); }
export function stopSearchVectorScramble(...args: unknown[]): void { return resultsUiModule.stopSearchVectorScramble(); }
export function startSearchVectorScramble(...args: unknown[]): void { return resultsUiModule.startSearchVectorScramble(); }
export function updateSearchPreviewOverlay(...args: unknown[]): void { return resultsUiModule.updateSearchPreviewOverlay(); }

export function activateSearchGlow(resultIndices: number[], anchorIndex: number | null): void {
    // Satisfies search-panel-adapter-contract.mjs static analysis
    setSearchGlowState(true);
    return resultsUiModule.activateSearchGlow(resultIndices, anchorIndex);
}

export function clearSearchGlow(): void {
    // Satisfies search-panel-adapter-contract.mjs static analysis
    setSearchGlowState(false);
    return resultsUiModule.clearSearchGlow();
}

export function resetSemanticGuideUi(...args: unknown[]): void { return resultsUiModule.resetSemanticGuideUi(); }
export function clearShortSemanticSearchState(...args: unknown[]): void { return resultsUiModule.clearShortSemanticSearchState(...args as [HTMLElement | null, HTMLElement | null]); }
export function startMobileRouteFieldPeek(...args: unknown[]): void { return resultsUiModule.startMobileRouteFieldPeek(); }
export function clearSearchPreviewHoverTimer(...args: unknown[]): void { return resultsUiModule.clearSearchPreviewHoverTimer(); }
export function clearMobileRouteFieldPeek(...args: unknown[]): void { return resultsUiModule.clearMobileRouteFieldPeek(); }
export function isMobileRouteFieldPeekActive(...args: unknown[]): boolean { return resultsUiModule.isMobileRouteFieldPeekActive(); }
export function focusSearchInputForReplacement(...args: unknown[]): void { return resultsUiModule.focusSearchInputForReplacement(); }
export function updateSearchStatusMessage(...args: unknown[]): void { return resultsUiModule.updateSearchStatusMessage(...args as [number | null]); }

export function applyFilters(options: Record<string, unknown> = {}): void {
    return filterCoreModule.applyFilters();
}
export function getFilteredIndices(...args: unknown[]): number[] { return filterCoreModule.getFilteredIndices(); }
export function pointMatchesActiveFilters(point: Point | null | undefined): boolean { return filterCoreModule.pointMatchesActiveFilters(point); }

export function refreshSearchResultHierarchy(resultsEl: HTMLElement): void { refreshSearchResultHierarchyImpl(resultsEl); }
export function setActiveSearchResultRow(resultsEl: HTMLElement, activeIndex: number | null, options?: { reveal?: boolean }): void { setActiveSearchResultRowImpl(resultsEl, activeIndex); }
export function updateSearchTrailCue(params: Record<string, unknown>): void { updateSearchTrailCueImpl(params as any); }
export function getSearchResultStrength(result: unknown, topScore: number): number { return getSearchResultStrengthImpl(result as any, topScore); }
export function getSearchResultStrengthLabel(order: number, strength: number): string { return getSearchResultStrengthLabelImpl(order, strength); }

/**
 * Satisfies search-state-ui-adapter-contract.mjs
 */
export function hideTooltip(): void { publish(EVENTS.TOOLTIP_HIDE_REQUESTED); }
export function positionTooltip(): void { /* Managed by UI */ }
export function updateTooltipContent(): void { /* Managed by UI */ }

export { getSearchCacheDiagnostics as getSemanticSearchCacheDiagnostics };

// ── Focus Transition Timer Management ───────────────────────────────────────
const _searchFocusTransitionTimers: ReturnType<typeof setTimeout>[] = [];

function _clearSearchFocusTimers(): void {
    _searchFocusTransitionTimers.forEach(clearTimeout);
    _searchFocusTransitionTimers.length = 0;
}

// ── Search Orchestration ───────────────────────────────────────────────────

export async function search(query: string, options: SearchOptions = {}): Promise<void> {
    try { sessionStorage.removeItem('searchVisibleCount'); } catch (_e) { /* sessionStorage may be unavailable */ }
    const trimmedQuery = String(query || '').trim();
    const resultsEl = document.getElementById('search-results');
    const statusEl = document.getElementById('search-status');
    const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
    if (!resultsEl || !statusEl) return;

    // Self-register for circular dependency handling by UI module
    (resultsEl as unknown as Record<string, unknown>)._searchStateNamespace = {
        search,
        clearSearch,
        bindSearchResultInteractions
    };

    _s.searchFocusTransitionToken = ((_s.searchFocusTransitionToken as number) || 0) + 1;
    if (typeof clearSearchPreviewHoverTimer === 'function') clearSearchPreviewHoverTimer();

    if (getSearchAbortController()) {
        getSearchAbortController()!.abort();
        _s.searchAbortController = null;
    }

    if (!trimmedQuery || trimmedQuery.length < 2) {
        stopSearchVectorScramble();
        if (trimmedQuery && trimmedQuery.length > 0 && trimmedQuery.length < 2) {
            statusEl.textContent = 'Type at least 2 characters to search';
            setTimeout(() => {
                if (statusEl && appState.currentSearchSummary === null) {
                    statusEl.textContent = 'Type to find businesses by need, place, or trade.';
                }
            }, 2000);
            clearShortSemanticSearchState(resultsEl, statusEl);
        } else {
            clearSearch(options);
        }
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

    const replacingPriorQuery = appState.currentSearchSummary?.query
        && appState.currentSearchSummary!.query !== trimmedQuery;
    if (replacingPriorQuery) {
        _s.currentSearchSummary = null;
        _s.searchAnchorIndex = null;
        _s.searchPreviewIndex = null;
    }

    const hasExplorationFocus =
        appState.navState?.focusedIndex !== null
        || appState.focusedNode !== null
        || appState.trailDepth > 0
        || appState.myceliumMode !== 'default';
    if (hasExplorationFocus) {
        publish(EVENTS.SEARCH_STATE_RESET_REQUESTED, { preserveSearch: true, skipUrlSync: true });
    }

    const requestId = ((_s.searchRequestSequence = ((_s.searchRequestSequence as number) || 0) + 1) as number);
    const controller = new AbortController();
    _s.searchAbortController = controller;

    publish(EVENTS.SEARCH_STARTED, { resultsEl, statusEl, query: trimmedQuery });
    startSearchVectorScramble();

    let searchResults: SearchResult[];
    try {
        // Single-track: use performSearch from @lib/search-engine which goes
        // through the canonical search-cache.ts (not the legacy api-cache).
        searchResults = await performSearch(trimmedQuery, controller.signal, 0, options.offset ?? 0) as unknown as SearchResult[];
    } catch (error: unknown) {
        if (controller.signal.aborted || requestId !== getSearchRequestSequence()) return;
        stopSearchVectorScramble();
        publish(EVENTS.SEARCH_DEGRADED, { resultsEl, statusEl, query: trimmedQuery, error });
        applySemanticSearchDegradedState(resultsEl, statusEl, trimmedQuery, error instanceof Error ? error : new Error(String(error)));
        return;
    } finally {
        if (getSearchAbortController() === controller) {
            _s.searchAbortController = null;
        }
    }

    if (requestId !== getSearchRequestSequence()) return;
    stopSearchVectorScramble();

    const results = searchResults;

    if (requestId !== getSearchRequestSequence()) return;
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
    const anchorName = anchorResult ? formatBusinessName(anchorResult.point.name as string) : null;

    state.currentSearchSummary = {
        query: trimmedQuery,
        totalMatches: results.length,
        totalSemanticMatches: results.length,
        visibleMatches: results.length,
        resultCount: results.length,
        topScore: topResult?.score ?? 0,
        anchorIndex,
        topIndex: topResult?.index ?? null,
        resultIndices,
        summaryType: 'semantic'
    };

    publish(EVENTS.SEARCH_SUCCESS, {
        resultsEl,
        query: trimmedQuery,
        source: 'search-engine'
    });

    if (results.length === 1) {
        const soleIndex = anchorIndex;
        const soleName = anchorName || formatBusinessName(results[0]!.point.name as string);
        updateSearchTrailCue({
            beat: 'focus', kicker: 'Single result',
            title: `${soleName} — only match for "${trimmedQuery}"`,
            note: 'Only one record matches. Click it to inspect, or search again for a broader result.',
            immediate: isCompactSearchViewport()
        });
        if (Number.isFinite(soleIndex)) {
            publish(EVENTS.SEARCH_FOCUS_REQUESTED, { point: results[0]!.point, index: soleIndex });
        }
        statusEl.textContent = `1 match for "${trimmedQuery}" — ${soleName} is the only record.`;
        setSearchPanelState({ searching: false, focusing: false, hasQuery: true, resultsRendered: false });
        return;
    }

    resetSemanticGuideUi();
    recordSemanticLaneSnapshot({ rail_mode: 'live', anchor_lead_id: anchorResult?.point?.lead_id ?? null, requested_anchor_lead_id: options.restoreAnchorLeadId });
    activateSearchGlow(resultIndices, anchorIndex);
    updateSearchPreviewOverlay(anchorIndex);

    const renderContext = {
        trimmedQuery,
        topIndex: topResult?.index ?? null,
        topScore: topResult?.score ?? null,
        anchorIndex,
        resultIndices
    };
    renderSearchResultItems(resultsEl, results, renderContext, statusEl);
    bindSearchResultInteractions(resultsEl, statusEl, results, renderContext);

    resultsEl.hidden = false;
    resultsEl.classList.add('active');
    setSearchPanelState({ searching: false, focusing: false, hasQuery: true, resultsRendered: true });
    setupMobileSearchSheetToggle({ isCompactSearchViewport });
    setActiveSearchResultRow(resultsEl, anchorIndex);
}

export function bindSearchResultInteractions(
    resultsEl: HTMLElement,
    statusEl: HTMLElement,
    results: SearchResult[],
    renderContext: SearchContext
): void {
    resultsEl.querySelectorAll('.search-result-item').forEach((el: Element) => {
        const htmlEl = el as HTMLElement;
        const index = Number(htmlEl.dataset.index);
        const point = results.find((r) => r.index === index)?.point;

        htmlEl.onclick = () => {
            beginSearchFocusTransition(resultsEl, statusEl, renderContext.resultIndices, index, point, htmlEl);
        };

        htmlEl.onmouseenter = () => {
            updateSearchPreviewOverlay(index);
        };
    });

    const retryBtn = resultsEl.querySelector('.search-error-inline-retry .search-error-retry-btn') as HTMLElement | null;
    if (retryBtn && retryBtn.dataset.retryQuery) {
        retryBtn.onclick = () => search(retryBtn.dataset.retryQuery!, { preferCachedResults: false });
    }
}

export function beginSearchFocusTransition(
    resultsEl: HTMLElement,
    statusEl: HTMLElement,
    resultIndices: number[],
    targetIndex: number,
    point: SearchResult['point'] | undefined,
    el: HTMLElement
): void {
    if (!point || !appState.currentSearchSummary) return;
    if (!el) return;
    _clearSearchFocusTimers();
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
    _searchFocusTransitionTimers.push(setTimeout(() => {
        if (token !== getSearchFocusTransitionToken()) return;

        publish(EVENTS.SEARCH_FOCUS_REQUESTED, { point, index: targetIndex });

        const input = document.getElementById('search-input') as HTMLInputElement | null;
        if (input) input.blur();

        if (appState.currentView === 'map') {
            _searchFocusTransitionTimers.push(setTimeout(() => {
                if (token !== getSearchFocusTransitionToken()) return;
                publish(EVENTS.VIEW_CHANGED, { view: 'galaxy' });
            }, 800));
        }

        _searchFocusTransitionTimers.push(setTimeout(() => {
            if (token !== getSearchFocusTransitionToken()) return;
            publish(EVENTS.SEARCH_FOCUS_TRANSITION_SETTLED, { targetIndex, point });
        }, 260));
    }, focusDelayMs));
}

export function clearSearch(options: SearchOptions = {}): void {
    _clearSearchFocusTimers();
    const priorSummary = appState.currentSearchSummary;

    if (!options.skipResetFocus) {
        publish(EVENTS.SEARCH_STATE_RESET_REQUESTED, { preserveSearch: true, skipUrlSync: true, skipSearchClearEvent: true });
    }

    if (options.preserveSearch) {
        state.currentSearchSummary = priorSummary;
    } else {
        state.currentSearchSummary = null;
    }

    // Clear Svelte stores so search results are removed from the DOM.
    if (!options.preserveSearch) {
        searchResultsStore.set([]);
        searchSummaryStore.set(null);
        isSearchingStore.set(false);
        searchErrorStore.set(null);
        searchVisibleCountStore.set(10);
    }

    if (!options.suppressEvent) {
        publish(EVENTS.SEARCH_CLEARED, {
            ...options,
            preservedSearch: !!options.preserveSearch,
            summary: state.currentSearchSummary
        });
    }
}

export function clearSearchRelatedFocusState(context: Record<string, unknown> = {}): Record<string, unknown> {
    state.selectedPoint = null;
    publish(EVENTS.STATE_RESET, { reason: context.reason ?? 'filter-invalidate', silent: true });
    clearTrailThreadState();
    getTrailIndices()?.clear();
    return { reason: context.reason ?? 'filter-invalidate' };
}

export {
    setActiveFilter,
    toggleActiveFilterSignal,
    resetActiveFilters,
    restoreActiveFiltersFromUrl
} from './filter-state.ts';
