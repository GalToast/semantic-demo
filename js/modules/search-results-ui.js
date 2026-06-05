import { state } from '../state.js'
import { publish, EVENTS } from './event-bus.js'
import { isCompactSearchViewport } from './utils/ui-presentation.js'
import { setSearchContainerState, setupMobileSearchSheetToggle } from './search-panel-adapter.js'
import { recordSemanticLaneSnapshot } from './semantic-lane.js'
import {
    searchResultsStore,
    searchSummaryStore,
    isSearchingStore,
    searchErrorStore,
    searchVisibleCountStore
} from './stores.js'

function syncSearchResultsA11y(resultsEl) {
    if (!resultsEl) return;
    const hasContent = resultsEl.children.length > 0;
    resultsEl.setAttribute('aria-hidden', hasContent ? 'false' : 'true');
}
import {
    updateSearchTrailCue
} from './ui-renderers.js'

/**
 * search-results-ui.js
 *
 * State management for the search results panel.
 * RENDERING: Fully owned by SearchResultsList.svelte via Svelte stores.
 */

export function setSearchPanelState(options = {}) {
    let hasQuery = options.hasQuery
    if (typeof hasQuery !== 'boolean') {
        const input = document.getElementById('search-input')
        if (input) hasQuery = Boolean(input.value.trim())
    }
    setSearchContainerState({ ...options, hasQuery })
}

export function renderSearchResultItems(resultsEl, results, renderContext, statusEl) {
    const INITIAL_SHOW = 5
    const dedupedResults = dedupeNearDuplicateResults(results)
    const total = dedupedResults.length
    const savedCount = (() => {
        try {
            return Number.parseInt(sessionStorage.getItem('searchVisibleCount') || '0', 10)
        } catch {
            return 0
        }
    })()
    const visibleCount = Math.min(
        total,
        Math.max(INITIAL_SHOW, Number.isFinite(savedCount) && savedCount > 0 ? savedCount : INITIAL_SHOW)
    )

    const isPeek = document.body?.dataset?.panelSurfaceDetail === 'peek'
    const mode = visibleCount >= total ? 'expanded' : isPeek ? 'peek' : 'initial'

    const isExpanded = total > INITIAL_SHOW && visibleCount >= total
    if (resultsEl) {
        resultsEl.classList.toggle('is-expanded', isExpanded)
        const searchContainer = resultsEl.closest?.('.search-container')
        if (searchContainer) searchContainer.classList.toggle('has-expanded-results', isExpanded)
        resultsEl.classList.add('active');
    }

    // Push to Svelte stores
    searchResultsStore.set(dedupedResults);
    searchVisibleCountStore.set(visibleCount);
    searchSummaryStore.set({
        query: renderContext.trimmedQuery,
        renderContext,
        mode
    });
    publish(EVENTS.SEARCH_UI_SYNC_REQUESTED, { resultsEl, statusEl, results: dedupedResults, renderContext });
    publish(EVENTS.SEMANTIC_LANE_STATE_REQUESTED, { laneState: 'healthy', options: { query: renderContext.trimmedQuery } });
    publish(EVENTS.SEMANTIC_GUIDE_BUTTON_STATE_REQUESTED, { button: document.getElementById('btn-synthesize'), mode: 'idle' });
    isSearchingStore.set(false);
    searchErrorStore.set(null);

    if (resultsEl) {
        resultsEl.setAttribute('aria-describedby', 'search-results-count')
        syncSearchResultsA11y(resultsEl)
    }

    if (state.currentSearchSummary) {
        state.currentSearchSummary.dedupedResultCount = total;
    }
    setupMobileSearchSheetToggle({ isCompactSearchViewport })

    publish(EVENTS.URL_SYNC_REQUESTED, { params: { offset: null }, reason: 'search-results-render' });

    if (resultsEl) resultsEl.scrollTop = 0
}

// ── Search Lifecycle State ──────────────────────────────────────────────────

export function applySemanticSearchLoadingState(resultsEl) {
    isSearchingStore.set(true);
    searchErrorStore.set(null);

    if (resultsEl) {
        resultsEl.classList.add('searching')
        resultsEl.classList.add('is-searching-skeleton')
        resultsEl.setAttribute('aria-busy', 'true')
        resultsEl.scrollTop = 0
        syncSearchResultsA11y(resultsEl)
        resultsEl.hidden = false
    }
    clearSearchGlow()
}

export function applySemanticSearchErrorState(resultsEl, statusEl, trimmedQuery, error) {
    const preservingSameQuery = state.currentSearchSummary && state.currentSearchSummary.query === trimmedQuery

    const errorData = {
        query: trimmedQuery,
        type: preservingSameQuery ? 'inline' : 'full',
        message: error?.message || 'Search failed'
    };

    searchErrorStore.set(errorData);
    isSearchingStore.set(false);

    if (resultsEl) {
        resultsEl.classList.remove('is-searching-skeleton')
        resultsEl.setAttribute('aria-busy', 'false')
    }

    if (!preservingSameQuery) {
        setSearchPanelState({ error: true, hasQuery: true })
    }

    if (statusEl) {
        statusEl.textContent = `Search paused for "${trimmedQuery}". Try again in a moment.`
        statusEl.hidden = false
        statusEl.classList.add('search-status-compact')
    }
    recordSemanticLaneSnapshot({ state: 'degraded', query: trimmedQuery, reason: 'search-degraded' })
}

export function finishSemanticSearchSuccessState(resultsEl, trimmedQuery, cacheSource = 'network') {
    const spinner = document.getElementById('search-spinner')
    if (spinner) spinner.hidden = true
    if (resultsEl) {
        resultsEl.classList.remove('searching')
        resultsEl.classList.remove('is-searching-skeleton')
        resultsEl.setAttribute('aria-busy', 'false')
        syncSearchResultsA11y(resultsEl)
    }
    setSearchPanelState({ searching: false, resultsRendered: true, hasResults: true, hasQuery: true })
    if (cacheSource === 'network') recordSemanticLaneSnapshot({ state: 'healthy', query: trimmedQuery })
}

export function clearSearchState(_resultsEl, _statusEl) {
    state.currentSearchSummary = null

    // Clear stores
    searchResultsStore.set([]);
    searchSummaryStore.set(null);
    isSearchingStore.set(false);
    searchErrorStore.set(null);
    searchVisibleCountStore.set(5);

    setSearchPanelState({ searching: false, focusing: false, resultsRendered: false, degraded: false })
    const spinner = document.getElementById('search-spinner')
    if (spinner) spinner.hidden = true
    if (_resultsEl) {
        _resultsEl.classList.remove('active')
        _resultsEl.classList.remove('searching')
        _resultsEl.classList.remove('is-searching-skeleton')
        _resultsEl.setAttribute('aria-busy', 'false')
        syncSearchResultsA11y(_resultsEl)
    }
    if (_statusEl) {
        _statusEl.hidden = true
        _statusEl.classList.remove('search-status-compact')
    }
    updateSearchTrailCue({ stage: 'query' })
    publish(EVENTS.SEARCH_CLEARED)
}

// ── Canonical Bridges and Stubs ─────────────────────────────────────────────

export function beginSemanticSearchUiState(resultsEl, statusEl, trimmedQuery) {
    publish(EVENTS.TOOLTIP_HIDE_REQUESTED);
    applySemanticSearchLoadingState(resultsEl);
    if (statusEl) {
        statusEl.textContent = `Searching for businesses related to "${trimmedQuery}"...`;
        statusEl.hidden = false;
    }
    updateSearchTrailCue({ stage: 'query' });
}

export function updateSemanticSearchRetryState({ statusEl, trimmedQuery, nextAttempt, delayMs }) {
    const retryDelayLabel = delayMs >= 1000 ? `${Math.round((delayMs / 1000) * 10) / 10}s` : `${delayMs}ms`;
    if (statusEl) {
        statusEl.textContent = `Semantic search is reconnecting for "${trimmedQuery}"... retry ${nextAttempt} starts in ${retryDelayLabel}.`;
    }
    recordSemanticLaneSnapshot({ state: 'reconnecting', query: trimmedQuery });
}

export function applySemanticSearchDegradedState(resultsEl, statusEl, trimmedQuery, error) {
    applySemanticSearchErrorState(resultsEl, statusEl, trimmedQuery, error);
}

export function applyEmptySemanticSearchState(resultsEl, statusEl, trimmedQuery) {
    searchResultsStore.set([]);
    searchSummaryStore.set({ query: trimmedQuery, renderContext: null, mode: 'empty' });
    searchErrorStore.set(null);
    isSearchingStore.set(false);
    if (resultsEl) {
        resultsEl.classList.remove('searching');
        resultsEl.classList.remove('is-searching-skeleton');
        resultsEl.setAttribute('aria-busy', 'false');
        syncSearchResultsA11y(resultsEl);
    }
    if (statusEl) {
        statusEl.textContent = `No matches found for "${trimmedQuery}".`;
        statusEl.hidden = false;
    }
    updateSearchTrailCue({ stage: 'empty' });
}

export function startSearchVectorScramble() {
    document.body?.classList?.add('search-vector-scramble');
}

export function stopSearchVectorScramble() {
    document.body?.classList?.remove('search-vector-scramble');
}

export function updateSearchPreviewOverlay() {
    publish(EVENTS.COMPOSITION_UPDATED, { reason: 'search-preview' });
}

export function activateSearchGlow(resultIndices = [], anchorIndex = null) {
    state.searchGlowActive = true;
    state.searchGlowIndices = new Set(Array.isArray(resultIndices) ? resultIndices : []);
    state.searchGlowTopIndex = Number.isFinite(anchorIndex) ? anchorIndex : state.searchGlowIndices.values().next().value ?? null;
    publish(EVENTS.COMPOSITION_UPDATED, { reason: 'search-glow' });
}

export function resetSemanticGuideUi() {
    publish(EVENTS.SUMMARY_CARD_HIDE_REQUESTED);
}

export function clearShortSemanticSearchState(resultsEl, statusEl) {
    clearSearchState(resultsEl, statusEl);
}

export function startMobileRouteFieldPeek() {
    state.mobileRouteFieldPeekToken = (state.mobileRouteFieldPeekToken || 0) + 1;
    document.body.dataset.mobileRoutePeek = 'active';
}

export function clearMobileRouteFieldPeek() {
    if (state.mobileRouteFieldPeekTimer) clearTimeout(state.mobileRouteFieldPeekTimer);
    state.mobileRouteFieldPeekTimer = null;
    delete document.body.dataset.mobileRoutePeek;
    delete document.body.dataset.mobileRoutePeekReason;
}

export function isMobileRouteFieldPeekActive() {
    return document.body?.dataset?.mobileRoutePeek === 'active';
}

export function clearSearchPreviewHoverTimer() {
    if (state.searchPreviewHoverTimer) clearTimeout(state.searchPreviewHoverTimer);
    state.searchPreviewHoverTimer = null;
}

export function focusSearchInputForReplacement() {
    const input = document.getElementById('search-input');
    if (input && typeof input.focus === 'function') input.focus();
}

export function updateSearchStatusMessage(matchCount = null) {
    const statusEl = document.getElementById('search-status');
    if (!statusEl) return;
    if (Number.isFinite(matchCount)) {
        statusEl.textContent = matchCount === 1 ? '1 match visible.' : `${matchCount} matches visible.`;
    } else if (state.currentSearchSummary?.visibleMatches) {
        statusEl.textContent = `${state.currentSearchSummary.visibleMatches} matches visible.`;
    }
}

// ── Dedupe near-duplicate results ───────────────────────────────────────────

function dedupeNearDuplicateResults(results) {
    if (!Array.isArray(results) || results.length < 2) return results;
    const seen = new Map();
    const out = [];
    for (const result of results) {
        if (!result?.point) { out.push(result); continue; }
        const key = nearDuplicateKey(result.point);
        if (!key) { out.push(result); continue; }

        if (seen.has(key)) {
            const existing = seen.get(key);
            if (result.score > existing.score) {
                out[out.indexOf(existing)] = result;
                seen.set(key, result);
            }
        } else {
            out.push(result);
            seen.set(key, result);
        }
    }
    return out;
}

function nearDuplicateKey(point) {
    if (!point.name || !point.city) return null;
    const cleanName = point.name.toLowerCase()
        .replace(/\b(llc|inc|corp|co|ltd)\b/g, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();
    const cleanCity = point.city.toLowerCase().trim();
    return `${cleanName}|${cleanCity}`;
}

export function clearSearchGlow() {
    state.searchGlowActive = false;
    if (state.searchGlowIndices?.clear) state.searchGlowIndices.clear();
    publish(EVENTS.COMPOSITION_UPDATED);
}
