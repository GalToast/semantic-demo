import { state } from '../state.js';
import {
    describeCluster,
    escapeHtml,
    formatBusinessName,
    isPointVisible,
    sanitizePublicFacingNote,
    cleanPublicNoteText,
    isCompactSearchViewport,
    pointHasGeocode,
    normalizeCityForFilter as normalizeCityForFilterValue
} from '../utils.js';
import {
    fetchSemanticSearchResults,
    getSemanticSearchCacheDiagnostics
} from './semantic-search-api-cache.js';
export { getSemanticSearchCacheDiagnostics };
import { animateCameraToSearchCorridor, focusOnNode } from './camera-controls.js';
import { recordSemanticLaneSnapshot } from './semantic-lane.js';
import { refreshMapMarkers } from './map-state.js';
import { updateClusterList } from './cluster-filter.js';
import { buildLegend } from './ui-renderers.js';
import { hideTooltip, positionTooltip, updateTooltipContent } from './search-ui-adapter.js';
import { setSearchContainerState, setSearchGlowState, setupMobileSearchSheetToggle } from './search-panel-adapter.js';
import { clearTrailThreadState } from './navigation-state.js';
import {
    updateUrlState as adapter_updateUrlState,
    setSearchPanelState as adapter_setSearchPanelState,
    focusOnPoint as adapter_focusOnPoint,
    resetNodePositions as adapter_resetNodePositions,
    dispatchNavTransition as adapter_dispatchNavTransition,
    syncSearchStatusForFocus as adapter_syncSearchStatusForFocus,
    updateJourneyCompass as adapter_updateJourneyCompass,
    refreshCompositionState as adapter_refreshCompositionState,
    clearMobileRouteFieldPeek as adapter_clearMobileRouteFieldPeek,
    clearCompactSearchResultRevealTimers as adapter_clearCompactSearchResultRevealTimers,
    clearSearchPreviewHoverTimer as adapter_clearSearchPreviewHoverTimer,
    settleCompactSearchFocusCard as adapter_settleCompactSearchFocusCard,
    switchView as adapter_switchView,
    updateSelectedBusiness as adapter_updateSelectedBusiness,
    syncMobileRoutePeek as adapter_syncMobileRoutePeek,
    updateTrailIndices as adapter_updateTrailIndices,
    applyPointFilterColors as adapter_applyPointFilterColors,
    refreshHoverSemanticOverlay as adapter_refreshHoverSemanticOverlay,
    resetExplorationFocus as adapter_resetExplorationFocus,
    setSemanticLaneUiState as adapter_setSemanticLaneUiState,
    clearSearch as adapter_clearSearch,
    triggerCorridorNodeGlow as adapter_triggerCorridorNodeGlow,
    triggerSearchCorridorAnimation as adapter_triggerSearchCorridorAnimation,
    hideSummaryCard as adapter_hideSummaryCard,
    setSemanticGuideButtonState as adapter_setSemanticGuideButtonState,
    scheduleCompactSearchResultReveal as adapter_scheduleCompactSearchResultReveal,
    scheduleSearchFocusTask as adapter_scheduleSearchFocusTask,
} from './search-lifecycle-adapter.js';
export {
    setActiveFilter,
    toggleActiveFilterSignal,
    resetActiveFilters,
    restoreActiveFiltersFromUrl
} from './filter-state.js';

import {
    buildSearchRankLabel,
    buildSearchStageLabel,
    buildSearchResultItemHtml,
    refreshSearchResultHierarchy,
    setActiveSearchResultRow,
    scheduleCompactSearchResultReveal,
    revealActiveSearchResultOnCompact,
    buildSearchResultSnippet,
    getSearchResultStrength,
    getSearchResultStrengthLabel,
    getSearchResultCardClasses,
    clearCompactSearchResultRevealTimers,
    updateSearchTrailCue
} from './ui-renderers.js';
export {
    buildSearchRankLabel,
    buildSearchStageLabel,
    buildSearchResultItemHtml,
    refreshSearchResultHierarchy,
    setActiveSearchResultRow,
    scheduleCompactSearchResultReveal,
    revealActiveSearchResultOnCompact,
    buildSearchResultSnippet,
    getSearchResultStrength,
    getSearchResultStrengthLabel,
    getSearchResultCardClasses,
    clearCompactSearchResultRevealTimers,
    updateSearchTrailCue
};

const SEARCH_STOP_WORDS = new Set([
    'a', 'an', 'and', 'are', 'at', 'by', 'for', 'from', 'in', 'into', 'is', 'me', 'my', 'of', 'on', 'or', 'place', 'places', 'take', 'the', 'to', 'with', 'your'
]);

export function setSearchPanelState({
    searching,
    focusing,
    hasQuery,
    resultsRendered,
    degraded
} = {}) {
    let effectiveHasQuery = hasQuery;
    if (typeof effectiveHasQuery !== 'boolean') {
        const searchInput = document.getElementById('search-input');
        if (searchInput) effectiveHasQuery = Boolean(searchInput.value.trim());
    }
    setSearchContainerState({ searching, focusing, hasQuery: effectiveHasQuery, resultsRendered, degraded });
}

// === Tokenization and Intent ===

const SEARCH_INTENT_EXPANSIONS = [
    {
        matchAny: ['alcohol', 'booze', 'drink', 'drinks', 'liquor', 'spirits'],
        aliases: [
            'alcohol', 'liquor', 'spirits', 'tequila', 'whiskey', 'vodka', 'beer', 'wine', 'brewery',
            'distillery', 'cocktail', 'cantina', 'pub', 'tavern', 'bar', 'lounge', 'saloon'
        ]
    },
    {
        matchAny: ['dog', 'dogs', 'pet', 'pets', 'puppy', 'animal', 'animals'],
        aliases: [
            'dog', 'dogs', 'pet', 'pets', 'puppy', 'animal', 'animals', 'grooming', 'groomer', 'groomers',
            'kennel', 'kennels', 'boarding', 'daycare', 'vet', 'veterinary', 'wash', 'trainer', 'trainers', 'park'
        ]
    },
    {
        matchPhrases: ['places to take dogs', 'dog friendly', 'take dogs'],
        aliases: [
            'dog', 'dogs', 'pet', 'pets', 'park', 'boarding', 'daycare', 'wash', 'grooming', 'veterinary', 'vet', 'trainer'
        ]
    }
];

export function tokenizeSearchText(text) {
    return [
        ...new Set(
            (
                String(text || '')
                    .toLowerCase()
                    .match(/[a-z0-9]+/g) || []
            )
                .filter(Boolean)
                .filter((token) => token.length > 1 && !SEARCH_STOP_WORDS.has(token))
        )
    ];
}

export function expandSearchIntent(query, queryTokens) {
    const safeQueryTokens = Array.isArray(queryTokens) ? queryTokens : [];
    const expanded = new Set(safeQueryTokens);
    const lowerQuery = String(query || '').toLowerCase();

    SEARCH_INTENT_EXPANSIONS.forEach((intent) => {
        const phraseMatch = (intent.matchPhrases || []).some((phrase) => lowerQuery.includes(phrase));
        const tokenMatch = (intent.matchAny || []).some((token) => safeQueryTokens.includes(token));
        if (!phraseMatch && !tokenMatch) return;
        (intent.aliases || []).forEach((alias) => {
            if (alias && !SEARCH_STOP_WORDS.has(alias)) expanded.add(alias);
        });
    });

    return [...expanded];
}

export function countTokenMatches(fieldTokens, queryTokens) {
    if (!Array.isArray(fieldTokens)) fieldTokens = [];
    if (!Array.isArray(queryTokens)) queryTokens = [];
    let exact = 0,
        prefix = 0;
    queryTokens.forEach((token) => {
        if (fieldTokens.includes(token)) exact += 1;
        else if (fieldTokens.some((e) => e.startsWith(token) || token.startsWith(e))) prefix += 1;
    });
    return { exact, prefix };
}


// === Render result items ===

export function renderSearchResultItems(resultsEl, results, renderContext, statusEl) {
    const INITIAL_SHOW = 5;
    const total = results.length;
    const savedCount = (() => {
        try { return Number.parseInt(sessionStorage.getItem('searchVisibleCount') || '0', 10); } catch { return 0; }
    })();
    const visibleCount = Math.min(
        total,
        Math.max(INITIAL_SHOW, Number.isFinite(savedCount) && savedCount > 0 ? savedCount : INITIAL_SHOW)
    );
    const visible = results.slice(0, visibleCount);

    const setExpandedResultState = (expanded) => {
        const isExpanded = !!expanded && total > INITIAL_SHOW;
        resultsEl.classList.toggle('is-expanded', isExpanded);
        const searchContainer = typeof resultsEl.closest === 'function' ? resultsEl.closest('.search-container') : null;
        if (searchContainer) searchContainer.classList.toggle('has-expanded-results', isExpanded);
    };

    const renderResultCountLine = (currentVisibleCount) => {
        return total === 1 ? '1 trail result' : `${currentVisibleCount} shown · ${total} found`;
    };

    const renderResultsMarkup = (resultSlice, currentVisibleCount) => {
        const statusText = renderResultCountLine(currentVisibleCount);
        resultsEl.innerHTML = `
            <div id="search-results-count" class="search-results-count" role="status" aria-live="polite" aria-atomic="true">${escapeHtml(statusText)}</div>
            <div id="search-result-list" class="search-result-list" role="list" aria-label="Search result businesses">
                ${resultSlice.map((r, i) => buildSearchResultItemHtml(r, i, renderContext)).join('')}
            </div>
        `;
        resultsEl.setAttribute('aria-describedby', 'search-results-count');
        if (statusEl) statusEl.textContent = statusText;
        const liveEl = document.getElementById('search-status-live');
        if (liveEl) liveEl.textContent = statusText;
        return statusText;
    };

    setExpandedResultState(visibleCount >= total);
    renderResultsMarkup(visible, visibleCount);
    setupMobileSearchSheetToggle({ isCompactSearchViewport });
    
    if (total > visibleCount) {
        const remaining = total - visibleCount;
        const btn = document.createElement('button');
        btn.className = 'search-show-more-btn';
        btn.type = 'button';
        btn.setAttribute('aria-label', `Show ${remaining} more search results`);
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-controls', 'search-result-list');
        btn.setAttribute('aria-describedby', 'search-results-count');
        btn.textContent = `Show ${remaining} more results`;
        btn.onclick = () => {
            const nextVisibleCount = results.length;
            const previousScrollTop = resultsEl.scrollTop;
            btn.setAttribute('aria-expanded', 'true');
            try { sessionStorage.setItem('searchVisibleCount', String(nextVisibleCount)); } catch (err) { console.warn('[search-state] searchVisibleCount persistence failed:', err); }
            adapter_updateUrlState({ offset: null }, { reason: 'search-more' });
            setExpandedResultState(true);
            renderResultsMarkup(results.slice(0, nextVisibleCount), nextVisibleCount);
            bindSearchResultInteractions(resultsEl, statusEl, results, renderContext);
            refreshSearchResultHierarchy(resultsEl);
            const activeIndex = state.currentSearchSummary?.anchorIndex ?? renderContext.anchorIndex ?? renderContext.topIndex;
            if (Number.isFinite(activeIndex)) setActiveSearchResultRow(resultsEl, activeIndex, { reveal: false });
            resultsEl.scrollTop = previousScrollTop;
            if (typeof window.requestAnimationFrame === 'function') {
                window.requestAnimationFrame(() => {
                    resultsEl.scrollTop = previousScrollTop;
                });
            }
        };
        resultsEl.appendChild(btn);
    }
    resultsEl.scrollTop = 0;
}


// === Focus transition ===

export function focusSearchResultFromElement(resultsEl, statusEl, resultIndices, targetIndex, sourceEl) {
    const targetPoint = (Number.isFinite(targetIndex) && targetIndex >= 0 && targetIndex < state.points.length)
        ? state.points[targetIndex]
        : null;
    beginSearchFocusTransition(resultsEl, statusEl, resultIndices, targetIndex, targetPoint, sourceEl);
}

export function beginSearchFocusTransition(resultsEl, statusEl, resultIndices, targetIndex, point, el) {
    if (!point || !state.currentSearchSummary) return;
    if (!el) return;
    const token = (state.searchFocusTransitionToken = (state.searchFocusTransitionToken || 0) + 1);

    if (typeof adapter_clearMobileRouteFieldPeek === 'function') adapter_clearMobileRouteFieldPeek();
    if (typeof adapter_clearCompactSearchResultRevealTimers === 'function') adapter_clearCompactSearchResultRevealTimers();
    if (typeof adapter_clearSearchPreviewHoverTimer === 'function') adapter_clearSearchPreviewHoverTimer();
    hideTooltip();

    resultsEl
        .querySelectorAll('.search-result-item')
        .forEach((r) => r.classList.remove('active-preview', 'active-focus', 'active-explore', 'is-processing'));
    
    // 10/10 Polish: Instant click feedback
    el.classList.add('is-processing');
    el.classList.add('active-focus');
    state.currentSearchSummary.anchorIndex = targetIndex;
    refreshSearchResultHierarchy(resultsEl);
    
    activateSearchGlow(resultIndices, targetIndex);
    updateSearchPreviewOverlay(targetIndex);
    adapter_setSearchPanelState({ focusing: true });

    const focusDelayMs = isCompactSearchViewport() ? 40 : 120;
    adapter_scheduleSearchFocusTask(() => {
        if (token !== state.searchFocusTransitionToken) return;
        if (state.currentView === 'map' && pointHasGeocode(point)) {
            adapter_focusOnPoint(point, { fromSearchResult: true });
        }
        // 10/10 Polish: Dismiss mobile keyboard during transition
        const input = document.getElementById('search-input');
        if (input) input.blur();

        focusOnNode(targetIndex, { fromSearchResult: true });

        adapter_syncSearchStatusForFocus(point, { fromSearchResult: true });
        adapter_refreshCompositionState();
        if (typeof adapter_settleCompactSearchFocusCard === 'function') adapter_settleCompactSearchFocusCard();

        // Fix 3: switch back to galaxy view after focus completes (map view search result click)
        if (state.currentView === 'map') {
            adapter_scheduleSearchFocusTask(() => {
                if (typeof adapter_switchView === 'function') adapter_switchView('galaxy');
            }, 800);
        }

        adapter_scheduleSearchFocusTask(() => {
            if (token !== state.searchFocusTransitionToken) return;
            adapter_setSearchPanelState({ focusing: false });
        }, 260);
    }, focusDelayMs);
}

// === Update search status message ===

export function updateSearchStatusMessage() {
    const statusEl = document.getElementById('search-status');
    const liveEl = document.getElementById('search-status-live');
    if (!statusEl) return;
    if (state.currentSearchSummary) {
        restoreSearchSummaryStatus();
        return;
    }
    const msg = 'Search 8,406 MoCo businesses semantically by need, venue, service, or clue.';
    statusEl.textContent = msg;
    if (liveEl) liveEl.textContent = msg;
}

// === Restore summary status ===

export function restoreSearchSummaryStatus() {
    const statusEl = document.getElementById('search-status');
    const liveEl = document.getElementById('search-status-live');
    const resultsEl = document.getElementById('search-results');
    if (!statusEl || !state.currentSearchSummary) return;
    if (!resultsEl?.classList.contains('active')) return;
    refreshSearchResultHierarchy(resultsEl);
    const compact = isCompactSearchViewport();
    let msg;
    if (state.currentSearchSummary.anchorIndex !== null) {
        const anchorIdx = state.currentSearchSummary.anchorIndex;
        const anchorPoint = (Number.isFinite(anchorIdx) && anchorIdx >= 0 && anchorIdx < state.points.length)
            ? state.points[anchorIdx]
            : null;
        const anchorName = anchorPoint ? formatBusinessName(anchorPoint.name) : 'the current anchor';
        msg = compact
            ? `${state.currentSearchSummary.visibleMatches} of ${state.currentSearchSummary.totalMatches} matches | ${anchorName} anchors this trail.`
            : `Showing ${state.currentSearchSummary.visibleMatches} of ${state.currentSearchSummary.totalMatches} semantic matches | ${anchorName} is anchoring this view.`;
    } else {
        msg = compact
            ? `${state.currentSearchSummary.visibleMatches} of ${state.currentSearchSummary.totalMatches} semantic matches`
            : `Showing ${state.currentSearchSummary.visibleMatches} of ${state.currentSearchSummary.totalMatches} semantic matches`;
    }
    statusEl.textContent = msg;
    if (liveEl) liveEl.textContent = msg;
}

/**
 * Clears focus/search-selection state invalidated when the selected point
 * is no longer visible under the active filters.  All direct writes to
 * selectedPoint, focusedNode, navState fields, and trailIndices live here so
 * the ownership is auditable.
 *
 * @param {object} [context]
 * @param {string} [context.reason] - Human-readable cause (e.g. 'filter-hide')
 * @returns {{ reason: string, hadSelectedPoint: boolean, hadFocusedNode: boolean, hadTrail: boolean }}
 */
export function clearSearchRelatedFocusState(context = {}) {
    const hadSelectedPoint = state.selectedPoint !== null;
    const hadFocusedNode   = state.focusedNode !== null;
    const hadTrail         = state.trailIndices.size > 0 || state.navState.trailDepth > 0;

    state.selectedPoint = null;
    state.focusedNode    = null;

    // navState.mode, navState.focusedIndex, and explorationHistoryIndices are owned by lifecycle/navigation.
    // search-state.js (secondary/clear helper). Route through lifecycle's canonical
    // dispatch to keep ownership auditable and prevent duplicate writer conflicts.
    adapter_dispatchNavTransition('RESET_FOCUS');

    clearTrailThreadState();
    state.navState.lastTraversalReason       = null;
    state.trailIndices.clear();

    return {
        reason:             context.reason ?? 'filter-invalidate',
        hadSelectedPoint,
        hadFocusedNode,
        hadTrail,
    };
}

// === Filtering ===

export function normalizeCityForFilter(city) {
    return normalizeCityForFilterValue(city);
}

export function getFilteredIndices() {
    if (!state.points) return [];
    const indices = [];
    for (let i = 0; i < state.points.length; i++) {
        const point = state.points[i];
        if (!point) continue;
        const pointCluster = Number.isFinite(Number(point.cluster)) ? Number(point.cluster) : 0;
        if (state.activeClusterFilter !== null && pointCluster !== state.activeClusterFilter) continue;
        if (state.activeFilters.status !== 'all' && point.status !== state.activeFilters.status) continue;
        if (state.activeFilters.city !== 'all' && normalizeCityForFilter(point.city) !== state.activeFilters.city) continue;
        if (state.activeFilters.website && !point.website) continue;
        if (state.activeFilters.email && !point.email) continue;
        if (state.activeFilters.geocoded && !pointHasGeocode(point)) continue;
        indices.push(i);
    }
    return indices;
}

export function applyFilters() {
    if (!state.points) return;
    const filteredIndices = getFilteredIndices();
    const filteredCount = filteredIndices.length;
    const filteredCities = new Set(filteredIndices
        .filter((idx) => Number.isFinite(idx) && idx >= 0 && idx < state.points.length)
        .map((index) => {
            const point = state.points[index];
            return point ? normalizeCityForFilter(point.city) : null;
        })
        .filter(Boolean));

    const totalCountEl = document.getElementById('total-count');
    const cityCountEl = document.getElementById('city-count');
    if (totalCountEl) totalCountEl.textContent = filteredCount.toLocaleString();
    if (cityCountEl) cityCountEl.textContent = filteredCities.size.toLocaleString();

    if (typeof updateClusterList === 'function') updateClusterList();

    document.querySelectorAll('.cluster-item').forEach((el) => {
        el.classList.toggle('active', state.activeClusterFilter !== null && Number(el.dataset.cluster) === state.activeClusterFilter);
    });

    if (typeof buildLegend === 'function') buildLegend();
    updateSearchStatusMessage(filteredCount);
    refreshMapMarkers();

    if (state.selectedPoint) {
        const selectedIndex = state.points.indexOf(state.selectedPoint);
        if (selectedIndex >= 0 && !isPointVisible(selectedIndex, state.points, state.activeClusterFilter, state.activeFilters)) {
            if (typeof adapter_updateSelectedBusiness === 'function') adapter_updateSelectedBusiness(null);
            clearSearchRelatedFocusState({ reason: 'filter-hide' });
            if (typeof adapter_syncMobileRoutePeek === 'function') adapter_syncMobileRoutePeek();
        }
    }

    if (state.trailDepth >= 1) {
        if (typeof adapter_updateTrailIndices === 'function') adapter_updateTrailIndices();
    }

    if (typeof adapter_applyPointFilterColors === 'function') adapter_applyPointFilterColors();
    adapter_refreshCompositionState();
    if (typeof adapter_refreshHoverSemanticOverlay === 'function') adapter_refreshHoverSemanticOverlay();
}

// === Interaction binding ===

export function bindSearchResultInteractions(resultsEl, statusEl, results, renderContext) {
    const { resultIndices, fallbackPreviewIndex } = renderContext;
    resultsEl.querySelectorAll('.search-result-item').forEach((el, order) => {
        const result = results[order];
        if (!result) return;
        const targetIndex = result.index;

        el.onmouseenter = () => {
            if (isCompactSearchViewport()) return;
            if (typeof adapter_clearSearchPreviewHoverTimer === 'function') adapter_clearSearchPreviewHoverTimer();
            state.searchPreviewHoverTimer = window.setTimeout(() => {
                el.classList.add('active-preview');
                activateSearchGlow(resultIndices, targetIndex);
                // Fix 5: visual connection — highlight the corresponding node in the mycelium
                state.hoverHighlightIndex = targetIndex;
                updateSearchPreviewOverlay(targetIndex);
                updateTooltipContent(result.point);
                const rect = el.getBoundingClientRect();
                positionTooltip(rect.right + 8, rect.top + Math.min(rect.height, 48));
            }, 85);
        };
        el.onmouseleave = () => {
            if (isCompactSearchViewport()) {
                hideTooltip();
                return;
            }
            if (typeof adapter_clearSearchPreviewHoverTimer === 'function') adapter_clearSearchPreviewHoverTimer();
            el.classList.remove('active-preview');
            // Fix 5: clear node highlight when leaving search result card
            state.hoverHighlightIndex = -1;
            restoreSearchResultPreview(resultIndices, fallbackPreviewIndex);
            hideTooltip();
        };
        el.onclick = () => focusSearchResultFromElement(resultsEl, statusEl, resultIndices, targetIndex, el);
        el.onfocus = () => {
            el.classList.add('active-preview');
            activateSearchGlow(resultIndices, targetIndex);
            updateSearchPreviewOverlay(targetIndex);
        };
        el.onblur = () => {
            el.classList.remove('active-preview');
            restoreSearchResultPreview(resultIndices, fallbackPreviewIndex);
        };
        el.onkeydown = (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            e.stopPropagation();
            focusSearchResultFromElement(resultsEl, statusEl, resultIndices, targetIndex, e.currentTarget);
        };
    });
}

// === Search glow ===

export function activateSearchGlow(resultIndices, anchorIndex) {
    state.searchGlowActive = true;
    state.searchGlowIndices = new Set(resultIndices || []);
    state.searchGlowTopIndex = anchorIndex;
    setSearchGlowState(true);
    if (typeof adapter_refreshHoverSemanticOverlay === 'function') adapter_refreshHoverSemanticOverlay();
}

export function clearSearchGlow() {
    state.searchGlowActive = false;
    state.searchGlowIndices = new Set();
    state.searchGlowTopIndex = null;
    setSearchGlowState(false);
}

// === Restore preview ===

export function restoreSearchResultPreview(resultIndices, fallbackIndex = null) {
    const anchorIndex = state.currentSearchSummary?.anchorIndex ?? fallbackIndex;
    activateSearchGlow(resultIndices, anchorIndex);
    updateSearchPreviewOverlay(anchorIndex);
}

// === Clear short semantic search state ===
export function clearShortSemanticSearchState(_resultsEl, _statusEl) {
    clearMobileRouteFieldPeek();
    state.currentSearchSummary = null;
    setSearchPanelState({ searching: false, focusing: false, resultsRendered: false, degraded: false });

    // 10/10 Polish: Toggle search spinner
    const spinner = document.getElementById('search-spinner');
    if (spinner) spinner.style.display = 'none';

    adapter_refreshCompositionState();
}

/**
 * 10/10 Polish: Comprehensive Search Clearing
 * Resets all search-related state, UI elements, and classes.
 */
export function clearSearch(options = {}) {
    const searchInput = document.getElementById('search-input');
    const searchContainer = document.querySelector('.search-container');
    const resultsEl = document.getElementById('search-results');
    const statusEl = document.getElementById('search-status');

    clearTimeout(state.searchTimeout);
    state.searchTimeout = null;
    state.searchRequestSequence = (state.searchRequestSequence || 0) + 1;
    if (state.searchAbortController) {
        state.searchAbortController.abort();
        state.searchAbortController = null;
    }
    stopSearchVectorScramble();

    if (searchInput) {
        searchInput.value = '';
        if (typeof searchInput.dispatchEvent === 'function') {
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }
    if (searchContainer) setSearchPanelState({ searching: false, focusing: false, hasQuery: false, resultsRendered: false, degraded: false });
    if (resultsEl) {
        resultsEl.innerHTML = '';
        resultsEl.classList.remove('active', 'is-expanded');
    }
    if (statusEl) {
        statusEl.textContent = '';
        statusEl.hidden = true;
        statusEl.classList.remove('active', 'search-status-compact');
    }

    if (!options.preserveSearch) {
        state.currentSearchSummary = null;
    }
    clearMobileRouteFieldPeek();
    clearSearchGlow();

    if (!options.skipResetFocus && typeof adapter_resetExplorationFocus === 'function') {
        adapter_resetExplorationFocus({ preserveSearch: true, skipUrlSync: true });
    }

    if (typeof adapter_updateUrlState === 'function') {
        adapter_updateUrlState({ q: null, anchor: null, offset: null, record: null }, { reason: 'search-clear' });
    }
    if (typeof adapter_updateJourneyCompass === 'function') {
        adapter_updateJourneyCompass();
    }
}
// === Search result state map ===

export function mapSemanticSearchServiceResult(row) {
    const pointIndex = state.pointIndexByLeadId.get(String(row.lead_id));
    if (pointIndex === undefined) return null;
    if (!(Number.isFinite(pointIndex) && pointIndex >= 0 && pointIndex < state.points.length)) return null;
    const point = state.points[pointIndex];
    if (!point || !isPointVisible(pointIndex, state.points, state.activeClusterFilter, state.activeFilters)) return null;

    return {
        point,
        index: pointIndex,
        score: Number(row.score || row.semantic_score || 0),
        semanticScore: Number(row.semantic_score || 0),
        lexicalBonus: Number(row.lexical_bonus || 0),
        publicNote: sanitizePublicFacingNote(row.public_note || ''),
        publicDetail: sanitizePublicFacingNote(row.public_detail || ''),
        address: cleanPublicNoteText(row.address || ''),
        naics: cleanPublicNoteText(row.naics || ''),
    };
}

export function mapSemanticSearchResults(serviceResults) {
    return (serviceResults || [])
        .map(mapSemanticSearchServiceResult)
        .filter(Boolean);
}

export function beginSemanticSearchUiState(resultsEl, statusEl, trimmedQuery) {
    const preservingSameQuery = state.currentSearchSummary?.query === trimmedQuery;
    hideTooltip();
    
    // 10/10 Polish: Show search spinner
    const spinner = document.getElementById('search-spinner');
    if (spinner) spinner.style.display = 'block';

    if (!preservingSameQuery) {
        if (typeof adapter_clearMobileRouteFieldPeek === 'function') adapter_clearMobileRouteFieldPeek();
        state.currentSearchSummary = null;
        adapter_refreshCompositionState();
        state.searchAnchorIndex = null;
        state.searchPreviewIndex = null;
        // Bug 3: Show loading skeleton instead of canned empty state during async search race
        resultsEl.innerHTML = `
            <div class="search-loading">
                <div class="search-loading-spinner"></div>
                <div class="search-loading-text">Searching...</div>
            </div>
        `;
        resultsEl.hidden = false;
        resultsEl.classList.add('active');
        clearSearchGlow();
    }
    setSearchPanelState({ searching: true, focusing: false, hasQuery: true, resultsRendered: false, degraded: false });
    adapter_refreshCompositionState();
    resetSemanticGuideUi({ hideTrigger: true });
    statusEl.textContent = `Searching for businesses related to "${trimmedQuery}"...`;
    updateSearchTrailCue({ stage: 'query' });
    resultsEl.classList.add('searching');
    adapter_updateJourneyCompass();
}

export function updateSemanticSearchRetryState({ statusEl, trimmedQuery, attempt, nextAttempt, delayMs, retryTotal }) {
    const retryDelayLabel = delayMs >= 1000 ? `${Math.round((delayMs / 1000) * 10) / 10}s` : `${delayMs}ms`;
    const preservingSameQuery = state.currentSearchSummary?.query === trimmedQuery;

    recordSemanticLaneSnapshot({
        state: 'reconnecting', attempted_warm: true, query: trimmedQuery,
        provenance: { label: 'Search reconnecting', detail: 'Public semantic search is retrying while the current result rail stays visible.' },
        retry_source: 'search', retry_count: attempt, retry_total: retryTotal,
        retry_wait_until: new Date(Date.now() + delayMs).toISOString(), cooldown_wait_until: null
    });
    if (typeof adapter_setSemanticLaneUiState === 'function') {
        adapter_setSemanticLaneUiState('reconnecting', {
            label: 'Search reconnecting', title: 'Public semantic search is retrying while the current result rail stays visible.'
        });
    }
    statusEl.textContent = preservingSameQuery
        ? `Semantic search is reconnecting for "${trimmedQuery}"... keeping ${state.currentSearchSummary.visibleMatches} matches visible while retry ${nextAttempt} starts in ${retryDelayLabel}.`
        : `Semantic search is reconnecting for "${trimmedQuery}"... retry ${nextAttempt} starts in ${retryDelayLabel}.`;
}

export function applySemanticSearchDegradedState(resultsEl, statusEl, trimmedQuery, _error) {
    resultsEl.classList.remove('searching');
    
    // 10/10 Polish: Toggle search spinner
    const spinner = document.getElementById('search-spinner');
    if (spinner) spinner.style.display = 'none';

    setSearchPanelState({ searching: false, focusing: false, hasQuery: true, resultsRendered: false, degraded: true });
    adapter_refreshCompositionState();
    const preservingSameQuery = state.currentSearchSummary?.query === trimmedQuery;
    if (!preservingSameQuery) {
        state.currentSearchSummary = null;
        adapter_refreshCompositionState();
        resultsEl.classList.remove('active');
        clearSearchGlow();
    }

    recordSemanticLaneSnapshot({
        state: 'degraded', search_ok: false, query: trimmedQuery,
        provenance: { label: 'Search paused', detail: 'Live semantic search is recovering after client retries.' },
        rail_mode: preservingSameQuery ? 'stale' : 'none',
        retry_wait_until: null, cooldown_wait_until: null
    });
    if (typeof adapter_setSemanticLaneUiState === 'function') {
        adapter_setSemanticLaneUiState('degraded', {
            label: 'Search paused', title: 'Live semantic search is recovering. Try again in a moment.'
        });
    }
    statusEl.textContent = preservingSameQuery
        ? `Search is still getting ready for "${trimmedQuery}". Keeping the last ${state.currentSearchSummary && state.currentSearchSummary.visibleMatches} matches visible.`
        : `Search paused for "${trimmedQuery}". Try again in a moment.`;
    statusEl.hidden = false;
    statusEl.classList.add('active', 'search-status-compact');

    const escapedQuery = escapeHtml(trimmedQuery);
    if (preservingSameQuery) {
        const existingInlineRetry = typeof resultsEl.querySelector === 'function' ? resultsEl.querySelector('.search-error-inline-retry') : null;
        if (existingInlineRetry) existingInlineRetry.remove();
        const inlineRetryMarkup = `
            <div class="search-error-inline-retry" role="status" aria-live="polite">
                <span class="search-error-inline-msg">Search is recovering for "<strong>${escapedQuery}</strong>".</span>
                <button class="search-error-retry-btn compact" type="button" aria-label="Retry search for ${escapedQuery}">Retry</button>
            </div>
        `;
        if (typeof resultsEl.insertAdjacentHTML === 'function') {
            resultsEl.insertAdjacentHTML('afterbegin', inlineRetryMarkup);
            const inlineRetryBtn = resultsEl.querySelector('.search-error-inline-retry .search-error-retry-btn');
            if (inlineRetryBtn) {
                inlineRetryBtn.onclick = () => search(trimmedQuery, { preferCachedResults: false });
            }
        }
    } else {
        resultsEl.innerHTML = `
            <div class="search-error-state" role="status" aria-live="polite">
                <span class="search-error-kicker">Retry needed</span>
                <div class="search-error-text">
                    We could not finish "<strong>${escapedQuery}</strong>" just now. Retry the live search or clear it and keep exploring.
                </div>
                <div class="search-error-actions">
                    <button class="search-error-retry-btn" type="button" aria-label="Retry search for ${escapedQuery}">Retry</button>
                    <button class="search-error-dismiss-btn" type="button" aria-label="Clear search and dismiss">Clear</button>
                </div>
            </div>
        `;
        const retryBtn = typeof resultsEl.querySelector === 'function' ? resultsEl.querySelector('.search-error-retry-btn') : null;
        if (retryBtn) {
            retryBtn.onclick = () => search(trimmedQuery, { preferCachedResults: false });
        }
        const dismissBtn = typeof resultsEl.querySelector === 'function' ? resultsEl.querySelector('.search-error-dismiss-btn') : null;
        if (dismissBtn) {
            dismissBtn.onclick = () => {
                if (typeof adapter_clearSearch === 'function') adapter_clearSearch();
            };
        }
    }
    resultsEl.hidden = false;
    resultsEl.classList.add('active');
    adapter_updateUrlState({}, { reason: 'search-degraded' });
    resetSemanticGuideUi({ hideTrigger: true });
}

export function finishSemanticSearchSuccessState(resultsEl, trimmedQuery, cacheSource = 'network') {
    // 10/10 Polish: Toggle search spinner
    const spinner = document.getElementById('search-spinner');
    if (spinner) spinner.style.display = 'none';

    recordSemanticLaneSnapshot({
        state: 'healthy', search_ok: true, embed_ok: true, attempted_warm: false, query: trimmedQuery, client_cache_source: cacheSource,
        provenance: null, retry_source: null, retry_count: null, retry_total: null, retry_wait_until: null, cooldown_wait_until: null
    });
    if (typeof adapter_setSemanticLaneUiState === 'function') adapter_setSemanticLaneUiState('healthy');
    setSearchPanelState({ searching: false, focusing: false, degraded: false });
    resultsEl.classList.remove('searching');
}

export function applyEmptySemanticSearchState(resultsEl, statusEl, trimmedQuery, requestedAnchorLeadId) {
    state.currentSearchSummary = null;
    adapter_refreshCompositionState();
    recordSemanticLaneSnapshot({ rail_mode: 'none', anchor_lead_id: null, requested_anchor_lead_id: requestedAnchorLeadId });
    state.searchAnchorIndex = null;
    state.searchPreviewIndex = null;

    // 10/10 Polish: Dynamic high-value suggestions for empty state
    const suggestions = ['coffee', 'plumber', 'restaurant', 'healthcare', 'auto repair'];
    
    // Add top clusters if available
    if (state.points?.length > 0) {
        const topClusters = [0, 1, 2].map(c => describeCluster(c).toLowerCase());
        topClusters.forEach(c => {
            if (!suggestions.includes(c)) suggestions.push(c);
        });
    }

    const suggestionButtons = suggestions.slice(0, 6)
        .map((term) => {
            const escaped = escapeHtml(term);
            return `<button class="search-suggestion-chip" data-suggestion="${escaped}" type="button" aria-label="Try search for ${escaped}">${escaped}</button>`;
        })
        .join('');

    resultsEl.innerHTML = `
        <div class="search-empty-state fade-in">
            <div class="search-empty-icon-wrap">
                <svg class="search-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                    <circle cx="11" cy="11" r="7"/>
                    <path d="M16.5 16.5L21 21"/>
                    <path d="M7 11h8" stroke-opacity="0.5"/>
                </svg>
            </div>
            <p class="search-empty-title">No direct matches found</p>
            <p class="search-empty-note">Try a broader term or one of these high-signal categories to open a new trail:</p>
            <div class="search-empty-suggestions">
                <div class="search-suggestion-buttons">${suggestionButtons}</div>
            </div>
            <div class="search-empty-discovery">
                <span class="discovery-tag">Pro Tip</span>
                <span class="discovery-text">The mycelium thrives on semantic relationships. Try searching for a specific trade like "HVAC" or a mood like "cozy".</span>
            </div>
        </div>
    `;

    resultsEl.querySelectorAll('.search-suggestion-chip').forEach((btn) => {
        btn.addEventListener('click', () => {
            const term = btn.dataset.suggestion;
            if (!term) return;
            const input = document.getElementById('search-input');
            if (input) {
                input.value = term;
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
    });

    resultsEl.hidden = false;
    resultsEl.classList.add('active');
    resultsEl.classList.remove('searching');
    clearSearchGlow();
    statusEl.textContent = `No matching records found for "${trimmedQuery}".`;
    updateSearchTrailCue({
        beat: 'query', kicker: 'No results trail', title: `No results trail for "${trimmedQuery}"`,
        note: 'Try a concrete service, place type, or business need.', immediate: true
    });
    adapter_updateUrlState({}, { reason: 'search-empty' });
    resetSemanticGuideUi({ hideTrigger: true });
    // Task #923: Remove results-rendered on empty results state
    adapter_setSearchPanelState({ resultsRendered: false });
}

export function finishSemanticSearchController(controller) {
    if (state.searchAbortController === controller) {
        state.searchAbortController = null;
    }
}

export function getSemanticSearchServiceResults(payload) {
    return Array.isArray(payload?.results) ? payload.results : [];
}

export function getSemanticSearchTotalMatches(payload, serviceResults) {
    return Number.isFinite(Number(payload?.count)) ? Number(payload.count) : serviceResults.length;
}

export function isNumericOnlySearchQuery(query) {
    const digits = String(query || '').replace(/\D/g, '');
    return digits.length >= 3 && digits.length <= 10 && /^[\d\s\-+().#]+$/.test(String(query || '').trim());
}

export function resultMatchesNumericSearchQuery(result, query) {
    const digits = String(query || '').replace(/\D/g, '');
    if (!digits || !result?.point) return false;
    const point = result.point;
    const exactFields = [point.lead_id, point.phone, point.lat, point.lng].map((v) => String(v || '').replace(/\D/g, ''));
    if (exactFields.some((v) => v && v.includes(digits))) return true;
    const contextualDigits = [result.address, result.publicNote, result.publicDetail, result.naics]
        .map((v) => String(v || '').replace(/\D/g, '')).filter(Boolean);
    return contextualDigits.some((v) => v.includes(digits));
}

function hydrateSemanticResultContext(result) {
    if (!state.semanticResultContextByLeadId) state.semanticResultContextByLeadId = new Map();
    state.semanticResultContextByLeadId.set(String(result.point.lead_id), {
        lead_id: result.point.lead_id, name: result.point.name, city: result.point.city,
        status: result.point.status, public_note: result.publicNote, public_detail: result.publicDetail,
        address: result.address, naics: result.naics
    });
}

export function hydrateSemanticResultContexts(results) {
    results.forEach(hydrateSemanticResultContext);
}

export function getRequestedSearchAnchorLeadId(options = {}) {
    return (options.restoreAnchorLeadId !== null && options.restoreAnchorLeadId !== undefined && options.restoreAnchorLeadId !== '')
        ? String(options.restoreAnchorLeadId) : null;
}

export function stopSearchVectorScramble() {
    if (state.searchVectorScrambleInterval) {
        clearInterval(state.searchVectorScrambleInterval);
        state.searchVectorScrambleInterval = null;
    }
    if (state.searchVectorScrambleTimer) {
        clearTimeout(state.searchVectorScrambleTimer);
        state.searchVectorScrambleTimer = null;
    }
    const scrambleOverlay = document.getElementById('search-vector-scramble');
    if (scrambleOverlay) {
        scrambleOverlay.classList.remove('active');
        scrambleOverlay.textContent = '';
    }
}

export function startSearchVectorScramble() {
    const scrambleOverlay = document.getElementById('search-vector-scramble');
    if (!scrambleOverlay) return;
    stopSearchVectorScramble();

    const chars = '0123456789ABCDEF<>[]|{}#*@';
    const generateVector = () => {
        const length = window.innerWidth <= 768 ? 6 : 10;
        const parts = Array.from({ length }, () => (Math.random() * 2 - 1).toFixed(3));
        const noise = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        return `[${parts.join(', ')}] ${noise}`;
    };

    let scrambleCount = 0;
    scrambleOverlay.classList.add('active');
    scrambleOverlay.textContent = generateVector();

    state.searchVectorScrambleInterval = setInterval(() => {
        scrambleOverlay.textContent = generateVector();
        // Polish: longer, more intense scramble (approx 600ms)
        if (++scrambleCount > 18) stopSearchVectorScramble();
    }, 32);

    state.searchVectorScrambleTimer = setTimeout(stopSearchVectorScramble, 800);
}

export async function search(query, options = {}) {
    try { sessionStorage.removeItem('searchVisibleCount'); } catch {}
    clearTimeout(state.searchTimeout);
    state.searchTimeout = null;
    const trimmedQuery = String(query || '').trim();
    const resultsEl = document.getElementById('search-results');
    const statusEl = document.getElementById('search-status');
    const searchInput = document.getElementById('search-input');
    if (!resultsEl || !statusEl) return;
    state.searchFocusTransitionToken = (state.searchFocusTransitionToken || 0) + 1;
    if (typeof adapter_clearSearchPreviewHoverTimer === 'function') adapter_clearSearchPreviewHoverTimer();

    if (state.searchAbortController) {
        state.searchAbortController.abort();
        state.searchAbortController = null;
    }

    if (!trimmedQuery || trimmedQuery.length < 2) {
        stopSearchVectorScramble();
        // Bug 1: Feedback for too-short query — transient message if user typed something
        if (trimmedQuery && trimmedQuery.length > 0 && trimmedQuery.length < 2) {
            if (statusEl) statusEl.textContent = 'Type at least 2 characters to search';
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
        // Bug 2: Long query error must be sticky — shake input and truncate excess
        if (statusEl) {
            statusEl.textContent = 'Search query is too long. Try a shorter phrase.';
        }
        if (searchInput) {
            // Truncate to 200 chars so the error doesn't keep re-triggering on each keystroke
            searchInput.value = trimmedQuery.slice(0, 200);
            searchInput.classList.remove('shake-input');
            // Force reflow to restart animation if class already present
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
        } else {
            adapter_resetNodePositions({ preserveSearch: true, skipUrlSync: true });
        }
    }

    const requestId = (state.searchRequestSequence = (state.searchRequestSequence || 0) + 1);
    const controller = new AbortController();
    state.searchAbortController = controller;
    beginSemanticSearchUiState(resultsEl, statusEl, trimmedQuery);
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
        applySemanticSearchDegradedState(resultsEl, statusEl, trimmedQuery, error);
        return;
    } finally {
        finishSemanticSearchController(controller);
    }

    if (requestId !== state.searchRequestSequence) return;
    stopSearchVectorScramble();
    finishSemanticSearchSuccessState(resultsEl, trimmedQuery, payload?.client_cache_hit ? 'memory-cache' : 'network');

    const serviceResults = getSemanticSearchServiceResults(payload);
    const totalMatches = getSemanticSearchTotalMatches(payload, serviceResults);
    let results = mapSemanticSearchResults(serviceResults);
    if (isNumericOnlySearchQuery(trimmedQuery)) {
        results = results.filter((result) => resultMatchesNumericSearchQuery(result, trimmedQuery));
    }
    hydrateSemanticResultContexts(results);

    const requestedAnchorLeadId = getRequestedSearchAnchorLeadId(options);

    if (!results.length) {
        applyEmptySemanticSearchState(resultsEl, statusEl, trimmedQuery, requestedAnchorLeadId);
        return;
    }

    const topResult = results[0] || null;
    const topScore = topResult ? Math.max(0.0001, topResult.score || 0.0001) : 1;
    const resultIndices = results.map((r) => r.index);
    const anchorResult = requestedAnchorLeadId
        ? results.find((r) => String(r.point.lead_id) === requestedAnchorLeadId) || topResult
        : topResult;
    const anchorIndex = anchorResult?.index ?? topResult?.index ?? null;
    const anchorName = anchorResult ? formatBusinessName(anchorResult.point.name) : null;
    
    state.currentSearchSummary = {
        query: trimmedQuery, totalMatches, totalSemanticMatches: totalMatches, visibleMatches: results.length,
        anchorIndex, topIndex: topResult?.index ?? null, resultIndices
    };
    adapter_refreshCompositionState();

    // Task #9: Special case — exactly 1 result: skip the trail theater,
    // anchor directly and go to focus stage. No summary prompt needed.
    if (results.length === 1) {
        const soleIndex = anchorIndex;
        const soleName = anchorName || formatBusinessName(results[0].point.name);

        // Hide summary prompt for single-result — there is no result stack to explain.
        const synthTrigger = document.getElementById('synthesize-trigger');
        if (synthTrigger) synthTrigger.style.display = 'none';
        const guideBtn = document.getElementById('btn-synthesize');
        if (guideBtn) guideBtn.style.display = 'none';

        updateSearchTrailCue({
            beat: 'focus', kicker: 'Single result',
            title: `${soleName} — only match for "${trimmedQuery}"`,
            note: 'Only one record matches. Click it to inspect, or search again for a broader result.',
            immediate: isCompactSearchViewport()
        });

        // Auto-center the sole result; focusOnNode cascades syncSearchStatusForFocus which
        // will overwrite the status message, so we call it first and let that settle.
        if (Number.isFinite(soleIndex)) {
            focusOnNode(soleIndex, { fromSearchResult: true });
        }

        // Set status after focusOnNode (so it sticks after the syncSearchStatusForFocus cascade)
        statusEl.textContent = `1 match for "${trimmedQuery}" — ${soleName} is the only record.`;
        adapter_setSearchPanelState({ searching: false, focusing: false, hasQuery: true, resultsRendered: false });
        return;
    }

    const synthTrigger = document.getElementById('synthesize-trigger');
    if (synthTrigger) {
        synthTrigger.style.display = 'none';
    }
    
    resetSemanticGuideUi();
    recordSemanticLaneSnapshot({ rail_mode: 'live', anchor_lead_id: anchorResult?.point?.lead_id ?? null, requested_anchor_lead_id: requestedAnchorLeadId });
    activateSearchGlow(resultIndices, anchorIndex);
    
    if (typeof adapter_triggerCorridorNodeGlow === 'function') {
        adapter_triggerCorridorNodeGlow(anchorIndex, resultIndices);
    }

    if (typeof adapter_triggerSearchCorridorAnimation === 'function') {
        adapter_triggerSearchCorridorAnimation(anchorIndex, resultIndices);
    }

    updateSearchPreviewOverlay(anchorIndex);
    animateCameraToSearchCorridor(anchorIndex, resultIndices, { reason: payload?.client_cache_hit ? 'search-cache-hit' : 'search-network' });

    const clusterFilterActive = state.activeClusterFilter !== null;
    const clusterContext = clusterFilterActive ? describeCluster(state.activeClusterFilter) : '';
    statusEl.textContent = clusterFilterActive
        ? (anchorName
            ? `${results.length} of ${totalMatches} matches in ${clusterContext} for "${trimmedQuery}". ${anchorName} anchors this view.`
            : `${results.length} of ${totalMatches} matches in ${clusterContext} for "${trimmedQuery}".`)
        : (anchorName
            ? `${results.length} of ${totalMatches} matches for "${trimmedQuery}". ${anchorName} anchors this view.`
            : `${results.length} of ${totalMatches} matches for "${trimmedQuery}".`);
        
    updateSearchTrailCue({
        beat: 'explore', kicker: 'Search opens a trail.',
        title: anchorName ? `${anchorName} anchors "${trimmedQuery}"` : `${totalMatches} matches found for "${trimmedQuery}"`,
        note: anchorName ? 'Next: ask the guide to read this stack, then click one suggested stop to pull it into a local neighborhood.' : 'Next: ask the guide to read the strongest matches, then open one suggested stop.',
        immediate: isCompactSearchViewport()
    });

    const renderContext = {
        trimmedQuery, topIndex: topResult?.index ?? null, anchorIndex, topScore, resultIndices, fallbackPreviewIndex: topResult?.index ?? null
    };
    renderSearchResultItems(resultsEl, results, renderContext, statusEl);
    bindSearchResultInteractions(resultsEl, statusEl, results, renderContext);

    resultsEl.hidden = false;
    resultsEl.classList.add('active');
    adapter_setSearchPanelState({ searching: false, focusing: false, hasQuery: true, resultsRendered: true });
    startMobileRouteFieldPeek({
        resultsEl, activeIndex: anchorIndex, reason: payload?.client_cache_hit ? 'search-cache-hit' : 'search-network'
    });
    setActiveSearchResultRow(resultsEl, anchorIndex);
    adapter_updateUrlState({ offset: null }, { reason: 'search' });
    // Advance the Journey compass from overview → search once results are rendered
    adapter_updateJourneyCompass();
}

export function resetSemanticGuideUi({ hideTrigger = false } = {}) {
    if (state.semanticGuideAbortController) {
        state.semanticGuideAbortController.abort();
        state.semanticGuideAbortController = null;
    }
    if (state.semanticTrailStoryAbortController) {
        state.semanticTrailStoryAbortController.abort();
        state.semanticTrailStoryAbortController = null;
    }
    state.semanticGuideRequestSequence = (state.semanticGuideRequestSequence || 0) + 1;
    state.semanticTrailStoryRequestSequence = (state.semanticTrailStoryRequestSequence || 0) + 1;
    state.currentSemanticGuide = null;
    if (typeof adapter_hideSummaryCard === 'function') adapter_hideSummaryCard();

    const button = document.getElementById('btn-synthesize');
    const trigger = document.getElementById('synthesize-trigger');
    const laneStatusEl = document.getElementById('summary-lane-status');
    const titleEl = document.getElementById('summary-card-title-text');

    if (button && typeof adapter_setSemanticGuideButtonState === 'function') {
        adapter_setSemanticGuideButtonState(button, 'ready', { disabled: !state.currentSearchSummary });
    }
    if (hideTrigger && trigger) trigger.style.display = 'none';
    if (titleEl) titleEl.textContent = 'Search';
    if (laneStatusEl) laneStatusEl.textContent = 'Ready';
}

export function updateSearchPreviewOverlay(index = null) {
    state.searchPreviewIndex = Number.isFinite(index) ? index : null;
    if (typeof adapter_refreshHoverSemanticOverlay === 'function') adapter_refreshHoverSemanticOverlay();
}


// Helper functions scheduleCompactSearchResultReveal, revealActiveSearchResultOnCompact and clearCompactSearchResultRevealTimers are imported from ui-renderers.js


export function startMobileRouteFieldPeek({ resultsEl = null, activeIndex = null, reason = 'search-corridor' } = {}) {
    if (!isCompactSearchViewport() || !resultsEl) {
        if (typeof adapter_clearMobileRouteFieldPeek === 'function') adapter_clearMobileRouteFieldPeek();
        return false;
    }

    if (typeof adapter_clearMobileRouteFieldPeek === 'function') adapter_clearMobileRouteFieldPeek();
    const token = (state.mobileRouteFieldPeekToken = (state.mobileRouteFieldPeekToken || 0) + 1);
    document.body.dataset.mobileRoutePeek = 'active';
    document.body.dataset.mobileRoutePeekReason = reason;

    state.mobileRouteFieldPeekTimer = window.setTimeout(() => {
        if (token !== state.mobileRouteFieldPeekToken) return;
        if (typeof adapter_clearMobileRouteFieldPeek === 'function') adapter_clearMobileRouteFieldPeek();
        if (typeof adapter_scheduleCompactSearchResultReveal === 'function') adapter_scheduleCompactSearchResultReveal(resultsEl, activeIndex);
    }, state.MOBILE_ROUTE_FIELD_PEEK_MS || 1550);
    return true;
}

export function clearSearchPreviewHoverTimer() {
    if (state.searchPreviewHoverTimer) {
        window.clearTimeout(state.searchPreviewHoverTimer);
        state.searchPreviewHoverTimer = null;
    }
}

export function clearMobileRouteFieldPeek() {
    if (state.mobileRouteFieldPeekTimer) {
        window.clearTimeout(state.mobileRouteFieldPeekTimer);
        state.mobileRouteFieldPeekTimer = null;
    }
    if (document.body) {
        delete document.body.dataset.mobileRoutePeek;
        delete document.body.dataset.mobileRoutePeekReason;
    }
}

export function isMobileRouteFieldPeekActive() {
    return document.body?.dataset.mobileRoutePeek === 'active';
}

export function focusSearchInputForReplacement() {
    const input = document.getElementById('search-input');
    if (input) {
        input.focus();
        input.select();
    }
}
