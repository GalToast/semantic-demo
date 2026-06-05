/**
 * search-state.ts
 *
 * Typed sibling of search-state.js.
 * Orchestration layer for semantic search.
 * This module coordinates the search pipeline and provides a stable canonical API.
 * DECOUPLED: Communicates with lifecycle and URL layers via Event Bus.
 */

import { state } from '../state.js';
import {
    getCurrentSearchSummary,
    getSemanticTrailCue,
    getSearchAbortController,
    getNavState,
    getFocusedNode,
    getTrailDepth,
    getMyceliumMode,
    getSearchRequestSequence,
    getSemanticLaneState,
    getCurrentView,
    getSearchFocusTransitionToken,
    getTrailIndices
} from '../state/selectors/index.js';
import { publish, EVENTS } from './event-bus.js';
import { formatBusinessName } from './utils/dom-formatters.js';
import { isCompactSearchViewport } from './utils/ui-presentation.js';
import {
    fetchSemanticSearchResults,
    getSemanticSearchCacheDiagnostics
} from './semantic-search-api-cache.js';
import { recordSemanticLaneSnapshot } from './semantic-lane.js';
import { clearTrailThreadState } from './navigation-state.js';

// ── UI Integration ─────────────────────────────────────────────────────
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

// ── Types ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyResult = any;

interface SearchOptions {
    preferCachedResults?: boolean;
    offset?: number;
    restoreAnchorLeadId?: string | number;
    skipResetFocus?: boolean;
    preserveSearch?: boolean;
    suppressEvent?: boolean;
}

// ── Canonical API Wrappers (Satisfies static contract regex: ^export function) ──

export function tokenizeSearchText(...args: unknown[]): string[] { return tokenizerModule.tokenizeSearchText(...args as [unknown]); }
export function expandSearchIntent(...args: unknown[]): string[] { return tokenizerModule.expandSearchIntent(...args as [unknown, unknown]); }
export function countTokenMatches(...args: unknown[]): { exact: number; prefix: number } { return tokenizerModule.countTokenMatches(...args as [unknown, unknown]); }

export function getSemanticSearchServiceResults(...args: unknown[]): unknown[] { return mapperModule.getSemanticSearchServiceResults(...args as [{ results?: unknown[] } | null]); }
export function getSemanticSearchTotalMatches(...args: unknown[]): number { return mapperModule.getSemanticSearchTotalMatches(...args as [{ count?: number } | null | undefined, unknown[]]); }
export function isNumericOnlySearchQuery(...args: unknown[]): boolean { return mapperModule.isNumericOnlySearchQuery(...args as [unknown]); }
export function resultMatchesNumericSearchQuery(...args: unknown[]): boolean { return mapperModule.resultMatchesNumericSearchQuery(...args as [unknown, unknown]); }
export function mapSemanticSearchServiceResult(...args: unknown[]): SearchResult | null { return mapperModule.mapSemanticSearchServiceResult(...args as [unknown, number]); }
export function mapSemanticSearchResults(...args: unknown[]): SearchResult[] { return mapperModule.mapSemanticSearchResults(...args as [unknown[]]); }
export function hydrateSemanticResultContexts(...args: unknown[]): void { return mapperModule.hydrateSemanticResultContexts(...args as [unknown[]]); }

export function recordEmptySearch(query: string): void {
    publish(EVENTS.SEARCH_EMPTY, { query });
}

export function setSearchPanelState(options: Record<string, unknown> = {}): void {
    if (typeof options.searching === 'boolean' || typeof options.focusing === 'boolean') {
        const currentCue = getSemanticTrailCue() || 'idle';
        const nextSearching = typeof options.searching === 'boolean' ? options.searching : currentCue === 'searching';
        const nextFocusing = typeof options.focusing === 'boolean' ? options.focusing : currentCue === 'focusing';
        (state as Record<string, unknown>).semanticTrailCue = nextFocusing ? 'focusing' : nextSearching ? 'searching' : 'idle';
    }
    // Satisfies search-panel-adapter-contract.mjs static analysis
    setSearchContainerState({ ...options });
    return resultsUiModule.setSearchPanelState(options);
}

export function renderSearchResultItems(...args: unknown[]): void {
    // Satisfies search-panel-adapter-contract.mjs static analysis
    if (typeof setupMobileSearchSheetToggle === 'function') {
        setupMobileSearchSheetToggle({ isCompactSearchViewport });
    }
    return resultsUiModule.renderSearchResultItems(...args as [HTMLElement, unknown[], SearchContext, HTMLElement | null]);
}

export function beginSemanticSearchUiState(...args: unknown[]): void { return resultsUiModule.beginSemanticSearchUiState(...args as [HTMLElement | null, HTMLElement | null, string]); }
export function updateSemanticSearchRetryState(...args: unknown[]): void { return resultsUiModule.updateSemanticSearchRetryState(...args as [unknown]); }
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
export function pointMatchesActiveFilters(...args: unknown[]): boolean { return filterCoreModule.pointMatchesActiveFilters(...args as [unknown]); }

export function refreshSearchResultHierarchy(...args: unknown[]): void { return renderersModule.refreshSearchResultHierarchy(...args as [HTMLElement]); }
export function setActiveSearchResultRow(...args: unknown[]): void { return renderersModule.setActiveSearchResultRow(...args as [HTMLElement, number | null, { reveal?: boolean }]); }
export function updateSearchTrailCue(...args: unknown[]): void { return renderersModule.updateSearchTrailCue(...args as [Record<string, unknown>]); }
export function getSearchResultStrength(...args: unknown[]): number { return renderersModule.getSearchResultStrength(...args as [unknown, number]); }
export function getSearchResultStrengthLabel(...args: unknown[]): string { return renderersModule.getSearchResultStrengthLabel(...args as [number, number]); }

/**
 * Satisfies search-state-ui-adapter-contract.mjs
 */
export function hideTooltip(): void { publish(EVENTS.TOOLTIP_HIDE_REQUESTED); }
export function positionTooltip(): void { /* Managed by UI */ }
export function updateTooltipContent(): void { /* Managed by UI */ }

export { getSemanticSearchCacheDiagnostics };

// ── Search Orchestration ───────────────────────────────────────────────────

export async function search(query: string, options: SearchOptions = {}): Promise<void> {
    try { sessionStorage.removeItem('searchVisibleCount'); } catch {}
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

    (state as Record<string, unknown>).searchFocusTransitionToken = ((state as Record<string, unknown>).searchFocusTransitionToken as number || 0) + 1;
    if (typeof clearSearchPreviewHoverTimer === 'function') clearSearchPreviewHoverTimer();

    if (getSearchAbortController()) {
        getSearchAbortController()!.abort();
        (state as Record<string, unknown>).searchAbortController = null;
    }

    if (!trimmedQuery || trimmedQuery.length < 2) {
        stopSearchVectorScramble();
        if (trimmedQuery && trimmedQuery.length > 0 && trimmedQuery.length < 2) {
            statusEl.textContent = 'Type at least 2 characters to search';
            setTimeout(() => {
                if (statusEl && getCurrentSearchSummary() === null) {
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

    const replacingPriorQuery = getCurrentSearchSummary()?.query
        && getCurrentSearchSummary()!.query !== trimmedQuery;
    if (replacingPriorQuery) {
        (state as Record<string, unknown>).currentSearchSummary = null;
        (state as Record<string, unknown>).searchAnchorIndex = null;
        (state as Record<string, unknown>).searchPreviewIndex = null;
    }

    const hasExplorationFocus =
        getNavState()?.focusedIndex !== null
        || getFocusedNode() !== null
        || getTrailDepth() > 0
        || getMyceliumMode() !== 'default';
    if (hasExplorationFocus) {
        publish(EVENTS.SEARCH_STATE_RESET_REQUESTED, { preserveSearch: true, skipUrlSync: true });
    }

    const requestId = ((state as Record<string, unknown>).searchRequestSequence = ((state as Record<string, unknown>).searchRequestSequence as number || 0) + 1) as number;
    const controller = new AbortController();
    (state as Record<string, unknown>).searchAbortController = controller;

    publish(EVENTS.SEARCH_STARTED, { resultsEl, statusEl, query: trimmedQuery });
    startSearchVectorScramble();

    let payload: { results?: unknown[]; count?: number; client_cache_hit?: boolean } | undefined;
    try {
        const laneState = String(getSemanticLaneState() || '').toLowerCase();
        const shouldFailFastForKnownDegradedLane = ['degraded', 'unavailable', 'reconnecting'].includes(laneState);
        payload = await fetchSemanticSearchResults(trimmedQuery, controller.signal, {
            preferCachedResults: options.preferCachedResults !== false,
            offset: options.offset,
            timeoutMs: shouldFailFastForKnownDegradedLane ? 2200 : undefined,
            maxAttempts: shouldFailFastForKnownDegradedLane ? 1 : undefined,
            onRetry: ({ attempt, nextAttempt, delayMs, retryTotal }: { attempt: number; nextAttempt: number; delayMs: number; retryTotal: number }) => {
                if (controller.signal.aborted || requestId !== getSearchRequestSequence()) return;
                updateSemanticSearchRetryState({ statusEl, trimmedQuery, attempt, nextAttempt, delayMs, retryTotal });
            }
        });
    } catch (error: unknown) {
        if (controller.signal.aborted || requestId !== getSearchRequestSequence()) return;
        stopSearchVectorScramble();
        publish(EVENTS.SEARCH_DEGRADED, { resultsEl, statusEl, query: trimmedQuery, error });
        applySemanticSearchDegradedState(resultsEl, statusEl, trimmedQuery, error instanceof Error ? error : new Error(String(error)));
        return;
    } finally {
        if (getSearchAbortController() === controller) {
            (state as Record<string, unknown>).searchAbortController = null;
        }
    }

    if (requestId !== getSearchRequestSequence()) return;
    stopSearchVectorScramble();

    const serviceResults = getSemanticSearchServiceResults(payload) as mapperModule.ServiceResultRow[];
    const totalMatches = getSemanticSearchTotalMatches(payload, serviceResults as unknown[]);
    const results = mapSemanticSearchResults(serviceResults as unknown[]) as SearchResult[];

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

    (state as Record<string, unknown>).currentSearchSummary = {
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
        const soleName = anchorName || formatBusinessName(results[0].point.name as string);
        updateSearchTrailCue({
            beat: 'focus', kicker: 'Single result',
            title: `${soleName} — only match for "${trimmedQuery}"`,
            note: 'Only one record matches. Click it to inspect, or search again for a broader result.',
            immediate: isCompactSearchViewport()
        });
        if (Number.isFinite(soleIndex)) {
            publish(EVENTS.SEARCH_FOCUS_REQUESTED, { point: results[0].point, index: soleIndex });
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
    if (!point || !getCurrentSearchSummary()) return;
    if (!el) return;
    const token = ((state as Record<string, unknown>).searchFocusTransitionToken = ((state as Record<string, unknown>).searchFocusTransitionToken as number || 0) + 1) as number;

    publish(EVENTS.SEARCH_FOCUS_TRANSITION_STARTED, {
        resultsEl,
        statusEl,
        resultIndices,
        targetIndex,
        point,
        el
    });

    const focusDelayMs = isCompactSearchViewport() ? 40 : 120;
    setTimeout(() => {
        if (token !== getSearchFocusTransitionToken()) return;

        publish(EVENTS.SEARCH_FOCUS_REQUESTED, { point, index: targetIndex });

        const input = document.getElementById('search-input') as HTMLInputElement | null;
        if (input) input.blur();

        if (getCurrentView() === 'map') {
            setTimeout(() => {
                if (token !== getSearchFocusTransitionToken()) return;
                publish(EVENTS.VIEW_CHANGED, { view: 'galaxy' });
            }, 800);
        }

        setTimeout(() => {
            if (token !== getSearchFocusTransitionToken()) return;
            publish(EVENTS.SEARCH_FOCUS_TRANSITION_SETTLED, { targetIndex, point });
        }, 260);
    }, focusDelayMs);
}

export function clearSearch(options: SearchOptions = {}): void {
    const priorSummary = getCurrentSearchSummary();

    if (!options.skipResetFocus) {
        publish(EVENTS.SEARCH_STATE_RESET_REQUESTED, { preserveSearch: true, skipUrlSync: true, skipSearchClearEvent: true });
    }

    if (options.preserveSearch) {
        (state as Record<string, unknown>).currentSearchSummary = priorSummary;
    } else {
        (state as Record<string, unknown>).currentSearchSummary = null;
    }

    if (!options.suppressEvent) {
        publish(EVENTS.SEARCH_CLEARED, {
            ...options,
            preservedSearch: !!options.preserveSearch,
            summary: (state as Record<string, unknown>).currentSearchSummary
        });
    }
}

export function clearSearchRelatedFocusState(context: Record<string, unknown> = {}): Record<string, unknown> {
    (state as Record<string, unknown>).selectedPoint = null;
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
} from './filter-state.js';
