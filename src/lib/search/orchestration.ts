import type { SearchResult, SearchSummary } from '@lib/types/state';
import {
  searchStore,
  setSearchQuery,
  setSearchStatus,
  setSearchSummary,
  setAnchorIndex,
  setPreviewIndex,
  setSearchGlow,
  clearSearchGlow,
  incrementRequestSequence,
  isRequestCurrent,
  incrementFocusTransitionToken,
  setTrailCue,
  setSemanticGuide,
  setCompactViewport,
  clearSearch,
  clearSearchResults,
  validateSearchQuery,
  setActiveResult,
  searchVisibleCount,
  setSearchVisibleCount,
  setSearchResults
} from '@lib/stores/search.svelte';
import { performSearch } from '@lib/search-engine';
import { publish, EVENTS } from '@lib/orchestration/event-bus';
import { formatBusinessName } from '@lib/utils/dom-formatters';
import { isCompactSearchViewport } from '@lib/utils/ui-presentation';
import { updateSearchTrailCue as renderSearchTrailCue } from '@lib/journey/search-trail-cue-renderer';
import {
  setSearchContainerState,
  setSearchGlowState,
  setupMobileSearchSheetToggle
} from './panel-adapter';
import {
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
  clearSearchGlow as clearResultsGlow,
  resetSemanticGuideUi,
  clearShortSemanticSearchState,
  startMobileRouteFieldPeek,
  clearSearchPreviewHoverTimer,
  clearMobileRouteFieldPeek,
  isMobileRouteFieldPeekActive,
  focusSearchInputForReplacement,
  updateSearchStatusMessage
} from './results-ui';
import { setActiveSearchResultRow } from './result-renderer';

// ── Types ──────────────────────────────────────────────────────────────────

interface SearchOptions {
  preferCachedResults?: boolean;
  offset?: number;
  restoreAnchorLeadId?: string | number;
  skipResetFocus?: boolean;
  preserveSearch?: boolean;
  suppressEvent?: boolean;
}

interface SearchContext {
  trimmedQuery: string;
  topIndex: number | null;
  topScore: number | undefined;
  anchorIndex: number | null;
  resultIndices: number[];
}

// ── Focus Transition Timer Management ───────────────────────────────────────

const _searchFocusTransitionTimers: ReturnType<typeof setTimeout>[] = [];

function _clearSearchFocusTimers(): void {
  _searchFocusTransitionTimers.forEach(clearTimeout);
  _searchFocusTransitionTimers.length = 0;
}

// ── Search Orchestration ───────────────────────────────────────────────────

/**
 * Execute a search and update the UI.
 * Single-track implementation using Svelte store and search engine.
 */
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
    clearSearch: () => clearSearch(),
    bindSearchResultInteractions
  };

  incrementFocusTransitionToken();
  if (typeof clearSearchPreviewHoverTimer === 'function') clearSearchPreviewHoverTimer();

  // Abort any in-flight search
  const currentController = new AbortController();
  // Store controller for abort (simplified - in production this would be in appState)

  if (!trimmedQuery || trimmedQuery.length < 2) {
    stopSearchVectorScramble();
    if (trimmedQuery && trimmedQuery.length > 0 && trimmedQuery.length < 2) {
      statusEl.textContent = 'Type at least 2 characters to search';
      setTimeout(() => {
        if (statusEl && !searchStore().summary) {
          statusEl.textContent = 'Type to find businesses by need, place, or trade.';
        }
      }, 2000);
      clearShortSemanticSearchState(resultsEl, statusEl);
    } else {
      clearSearch();
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

  const replacingPriorQuery = searchStore().summary?.query
    && searchStore().summary!.query !== trimmedQuery;
  if (replacingPriorQuery) {
    setSearchSummary(null);
    setAnchorIndex(null);
    setPreviewIndex(null);
  }

  // Clear exploration focus if needed
  publish(EVENTS.SEARCH_STATE_RESET_REQUESTED, { preserveSearch: true, skipUrlSync: true } as any);

  const requestId = incrementRequestSequence();
  setSearchStatus('searching');

  publish(EVENTS.SEARCH_STARTED, { resultsEl, statusEl, query: trimmedQuery } as any);
  startSearchVectorScramble();

  let searchResults: SearchResult[];
  try {
    searchResults = await performSearch(trimmedQuery, currentController.signal, 0, options.offset ?? 0);
  } catch (error: unknown) {
    if (currentController.signal.aborted || !isRequestCurrent(requestId)) return;
    stopSearchVectorScramble();
    publish(EVENTS.SEARCH_DEGRADED, { resultsEl, statusEl, query: trimmedQuery, error });
    applySemanticSearchDegradedState(resultsEl, statusEl, trimmedQuery, error instanceof Error ? error : new Error(String(error)));
    return;
  } finally {
    // Controller cleanup handled by search engine
  }

  if (!isRequestCurrent(requestId)) return;
  stopSearchVectorScramble();

  const results = searchResults;

  if (!isRequestCurrent(requestId)) return;
  if (!results.length) {
    publish(EVENTS.SEARCH_EMPTY, { resultsEl, statusEl, query: trimmedQuery, restoreAnchorLeadId: options.restoreAnchorLeadId } as any);
    return;
  }

  const topResult = results[0] || null;
  const resultIndices = results.map((r) => r.index);
  const anchorResult = options.restoreAnchorLeadId
    ? results.find((r) => String((r.point as any)?.lead_id) === String(options.restoreAnchorLeadId)) || topResult
    : topResult;
  const anchorIndex = anchorResult?.index ?? topResult?.index ?? null;
  const anchorName = anchorResult ? formatBusinessName(anchorResult.point?.name as string) : null;

  setSearchSummary({
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
  });

  publish(EVENTS.SEARCH_SUCCESS, {
    resultsEl,
    query: trimmedQuery,
    source: 'search-engine'
  });

  if (results.length === 1) {
    const soleIndex = anchorIndex;
    const soleName = anchorName || formatBusinessName(results[0]!.point?.name as string);
    updateSearchTrailCue({
      beat: 'focus', kicker: 'Single result',
      title: `${soleName} — only match for "${trimmedQuery}"`,
      note: 'Only one record matches. Click it to inspect, or search again for a broader result.',
      immediate: isCompactSearchViewport()
    });
    if (typeof soleIndex === 'number' && Number.isFinite(soleIndex)) {
      publish(EVENTS.SEARCH_FOCUS_REQUESTED, { point: results[0]!.point, index: soleIndex } as any);
    }
    statusEl.textContent = `1 match for "${trimmedQuery}" — ${soleName} is the only record.`;
    setSearchPanelState({ searching: false, focusing: false, hasQuery: true, resultsRendered: false });
    return;
  }

  resetSemanticGuideUi();
  activateSearchGlow(resultIndices, anchorIndex);
  updateSearchPreviewOverlay();

  const renderContext = {
    trimmedQuery,
    topIndex: topResult?.index ?? null,
    topScore: topResult?.score ?? undefined,
    anchorIndex,
    resultIndices
  };
  renderSearchResultItems(resultsEl, results as any, renderContext, statusEl);
  bindSearchResultInteractions(resultsEl, statusEl, results, renderContext);

  resultsEl.hidden = false;
  resultsEl.classList.add('active');
  setSearchPanelState({ searching: false, focusing: false, hasQuery: true, resultsRendered: true });
  setupMobileSearchSheetToggle({ isCompactSearchViewport });
  setActiveSearchResultRow(resultsEl, anchorIndex);
}

/**
 * Bind click/hover interactions to rendered search result items.
 */
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
      updateSearchPreviewOverlay();
    };
  });

  const retryBtn = resultsEl.querySelector('.search-error-inline-retry .search-error-retry-btn') as HTMLElement | null;
  if (retryBtn && retryBtn.dataset.retryQuery) {
    retryBtn.onclick = () => search(retryBtn.dataset.retryQuery!, { preferCachedResults: false });
  }
}

/**
 * Begin transition to focus on a specific search result.
 */
export function beginSearchFocusTransition(
  resultsEl: HTMLElement,
  statusEl: HTMLElement,
  resultIndices: number[],
  targetIndex: number,
  point: SearchResult['point'] | undefined,
  el: HTMLElement
): void {
  if (!point || !searchStore().summary) return;
  if (!el) return;
  _clearSearchFocusTimers();
  const token = incrementFocusTransitionToken();

  publish(EVENTS.SEARCH_FOCUS_TRANSITION_STARTED, {
    resultsEl,
    statusEl,
    resultIndices,
    targetIndex,
    point,
    transitionToken: token
  } as any);

  // Update active result
  setActiveResult(String(targetIndex));
  setAnchorIndex(targetIndex);

  // Focus the result in the 3D scene
  publish(EVENTS.SEARCH_FOCUS_REQUESTED, { point, index: targetIndex } as any);
  publish(EVENTS.SEARCH_FOCUS_TRANSITION_SETTLED, {
    resultsEl,
    statusEl,
    resultIndices,
    targetIndex,
    point,
    transitionToken: token
  } as any);
}

/**
 * Update search trail cue in the UI.
 */
function updateSearchTrailCue(params: {
  beat?: string;
  kicker?: string;
  title?: string;
  note?: string;
  immediate?: boolean;
}): void {
  renderSearchTrailCue(params);
}

// ── Re-exports for backward compatibility ──────────────────────────────────

export {
  setSearchContainerState,
  setSearchGlowState,
  setupMobileSearchSheetToggle
} from './panel-adapter';

export {
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
  clearSearchGlow as clearResultsGlow,
  resetSemanticGuideUi,
  clearShortSemanticSearchState,
  startMobileRouteFieldPeek,
  clearSearchPreviewHoverTimer,
  clearMobileRouteFieldPeek,
  isMobileRouteFieldPeekActive,
  focusSearchInputForReplacement,
  updateSearchStatusMessage
} from './results-ui';

export {
  searchStore,
  searchState,
  setSearchQuery,
  setSearchStatus,
  setSearchSummary,
  setAnchorIndex,
  setPreviewIndex,
  setSearchGlow,
  clearSearchGlow,
  incrementRequestSequence,
  isRequestCurrent,
  incrementFocusTransitionToken,
  setTrailCue,
  setSemanticGuide,
  setCompactViewport,
  clearSearch,
  clearSearchResults,
  validateSearchQuery,
  setActiveResult,
  searchVisibleCount,
  setSearchVisibleCount,
  setSearchResults
} from '@lib/stores/search.svelte';

export type { SearchOptions, SearchContext };
