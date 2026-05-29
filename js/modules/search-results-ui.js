import { state } from '../state.js';
import { escapeHtml } from './utils/dom-formatters.js';
import { describeCluster, isCompactSearchViewport } from './utils/ui-presentation.js';
import {
    hideTooltip
} from './search-ui-adapter.js';
import {
    setSearchContainerState,
    setupMobileSearchSheetToggle
} from './search-panel-adapter.js';
import {
    recordSemanticLaneSnapshot
} from './semantic-lane.js';
import {
    buildSearchResultItemHtml,
    refreshSearchResultHierarchy,
    setActiveSearchResultRow,
    updateSearchTrailCue
} from './ui-renderers.js';
import {
    updateUrlState as adapter_updateUrlState,
    setSearchPanelState as adapter_setSearchPanelState,
    updateJourneyCompass as adapter_updateJourneyCompass,
    refreshCompositionState as adapter_refreshCompositionState,
    refreshHoverSemanticOverlay as adapter_refreshHoverSemanticOverlay,
    setSemanticLaneUiState as adapter_setSemanticLaneUiState,
    resetExplorationFocus as adapter_resetExplorationFocus,
    hideSummaryCard as adapter_hideSummaryCard,
    setSemanticGuideButtonState as adapter_setSemanticGuideButtonState,
    scheduleCompactSearchResultReveal as adapter_scheduleCompactSearchResultReveal
} from './search-lifecycle-adapter.js';
import { isMobileViewport } from './environment.js';

/**
 * search-results-ui.js
 *
 * DOM manipulation for the search results panel and associated UI states.
 */

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
            // Re-binding must happen via the orchestrator (search-state) to avoid circular imports.
            const searchState = resultsEl._searchStateNamespace;
            if (searchState && typeof searchState.bindSearchResultInteractions === 'function') {
                searchState.bindSearchResultInteractions(resultsEl, statusEl, results, renderContext);
            }
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

export function beginSemanticSearchUiState(resultsEl, statusEl, trimmedQuery) {
    const preservingSameQuery = state.currentSearchSummary?.query === trimmedQuery;
    hideTooltip();

    const spinner = document.getElementById('search-spinner');
    if (spinner) spinner.style.display = 'block';

    if (!preservingSameQuery) {
        clearMobileRouteFieldPeek();
        state.currentSearchSummary = null;
        adapter_refreshCompositionState();
        state.searchAnchorIndex = null;
        state.searchPreviewIndex = null;
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
        const existingInlineRetry = (typeof resultsEl.querySelector === 'function') ? resultsEl.querySelector('.search-error-inline-retry') : null;
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
                // Circular dependency handle
                const searchState = resultsEl._searchStateNamespace;
                if (searchState) {
                    inlineRetryBtn.onclick = () => searchState.search(trimmedQuery, { preferCachedResults: false });
                }
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
                    <button class="search-error-retry-btn" type="button" aria-label="Retry search for ${escapedQuery}" data-retry-query="${escapedQuery}">Retry</button>
                    <button class="search-error-dismiss-btn" type="button" aria-label="Clear search and dismiss">Clear</button>
                </div>
            </div>
        `;
        const retryBtn = (typeof resultsEl.querySelector === 'function') ? resultsEl.querySelector('.search-error-retry-btn') : null;
        const dismissBtn = (typeof resultsEl.querySelector === 'function') ? resultsEl.querySelector('.search-error-dismiss-btn') : null;
        const searchState = resultsEl._searchStateNamespace;
        if (retryBtn && searchState) {
            retryBtn.onclick = () => searchState.search(trimmedQuery, { preferCachedResults: false });
        }
        if (dismissBtn && searchState) {
            dismissBtn.onclick = () => searchState.clearSearch();
        }
    }
    resultsEl.hidden = false;
    resultsEl.classList.add('active');
    adapter_updateUrlState({}, { reason: 'search-degraded' });
    resetSemanticGuideUi({ hideTrigger: true });
}

export function finishSemanticSearchSuccessState(resultsEl, trimmedQuery, cacheSource = 'network') {
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

    const suggestions = ['coffee', 'plumber', 'restaurant', 'healthcare', 'auto repair'];

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
    adapter_setSearchPanelState({ resultsRendered: false });
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
        const length = isMobileViewport() ? 6 : 10;
        const parts = Array.from({ length }, () => (Math.random() * 2 - 1).toFixed(3));
        const noise = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        return `[${parts.join(', ')}] ${noise}`;
    };

    let scrambleCount = 0;
    scrambleOverlay.classList.add('active');
    scrambleOverlay.textContent = generateVector();

    state.searchVectorScrambleInterval = setInterval(() => {
        scrambleOverlay.textContent = generateVector();
        if (++scrambleCount > 18) stopSearchVectorScramble();
    }, 32);

    state.searchVectorScrambleTimer = setTimeout(stopSearchVectorScramble, 800);
}

export function updateSearchPreviewOverlay(index = null) {
    state.searchPreviewIndex = Number.isFinite(index) ? index : null;
    if (typeof adapter_refreshHoverSemanticOverlay === 'function') adapter_refreshHoverSemanticOverlay();
}

export function activateSearchGlow(resultIndices, anchorIndex) {
    state.searchGlowActive = true;
    state.searchAnchorIndex = anchorIndex;
    if (Array.isArray(resultIndices)) {
        state.searchGlowIndices = new Set(resultIndices);
    }
}

export function clearSearchGlow() {
    state.searchGlowActive = false;
    state.searchAnchorIndex = null;
    if (state.searchGlowIndices?.clear) state.searchGlowIndices.clear();
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

export function clearShortSemanticSearchState(_resultsEl, _statusEl) {
    clearMobileRouteFieldPeek();
    state.currentSearchSummary = null;
    setSearchPanelState({ searching: false, focusing: false, resultsRendered: false, degraded: false });
    const spinner = document.getElementById('search-spinner');
    if (spinner) spinner.style.display = 'none';
    if (_resultsEl) {
        _resultsEl.innerHTML = '';
        _resultsEl.classList.remove('active', 'searching');
    }
    clearSearchGlow();
}

export function clearSearch(options = {}) {
    const resultsEl = document.getElementById('search-results');
    const statusEl = document.getElementById('search-status');
    clearShortSemanticSearchState(resultsEl, statusEl);

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

export function startMobileRouteFieldPeek({ resultsEl = null, activeIndex = null, reason = 'search-corridor' } = {}) {
    if (!isCompactSearchViewport() || !resultsEl) {
        clearMobileRouteFieldPeek();
        return false;
    }

    clearMobileRouteFieldPeek();
    const token = (state.mobileRouteFieldPeekToken = (state.mobileRouteFieldPeekToken || 0) + 1);
    document.body.dataset.mobileRoutePeek = 'active';
    document.body.dataset.mobileRoutePeekReason = reason;

    state.mobileRouteFieldPeekTimer = window.setTimeout(() => {
        if (token !== state.mobileRouteFieldPeekToken) return;
        clearMobileRouteFieldPeek();
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

export function updateSearchStatusMessage(totalMatches) {
    const statusEl = document.getElementById('search-status');
    if (!statusEl) return;

    if (totalMatches === undefined) {
        if (state.currentSearchSummary) {
            totalMatches = state.currentSearchSummary.totalMatches;
        } else {
            statusEl.textContent = 'Search 8,406 MoCo businesses semantically by need, venue, service, or clue.';
            return;
        }
    }

    const count = Number(totalMatches) || 0;
    if (count === 0) {
        statusEl.textContent = 'No matching records found.';
    } else if (count === 1) {
        statusEl.textContent = '1 matching record found.';
    } else {
        statusEl.textContent = `${count.toLocaleString()} matching records found.`;
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
