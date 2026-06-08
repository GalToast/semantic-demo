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
import { formatBusinessName } from './utils/dom-formatters.js'
import {
    getSearchResultStrength,
    getSearchResultStrengthLabel,
    getSearchResultCardClasses,
    buildSearchResultSnippet,
    buildSearchRankLabel
} from './search-result-renderer.js'

function syncSearchResultsA11y(resultsEl) {
    if (!resultsEl) return;
    const hasContent = resultsEl.children.length > 0;
    resultsEl.setAttribute('aria-hidden', hasContent ? 'false' : 'true');
}

// ── Legacy DOM rendering ───────────────────────────────────────────────────
//
// renderSearchResultItems() historically pushed deduped results into Svelte
// stores and relied on src/components/SearchResults.svelte to materialize
// the rows. The canonical served shell (vector-explorer-polished.html) only
// loads dist/bundle.js and never mounts that Svelte root, so the rows never
// reached the DOM. We now also render the rows directly into #search-results
// so the legacy shell is self-sufficient. Both paths run so the Svelte
// future state keeps working when the focus track eventually wires up.

let _lastLegacyRender = null;

function clearLegacySearchResultsDom(resultsEl) {
    if (!resultsEl) return;
    if (resultsEl.dataset.legacyResultsSource === 'legacy') {
        resultsEl.replaceChildren();
    } else {
        // Wipe any stale children that aren't ours so a11y + class state is
        // honest before the next render pass.
        const own = resultsEl.querySelectorAll('[data-legacy-search-results="1"]');
        own.forEach((el) => el.remove());
    }
    resultsEl.dataset.legacyResultsSource = '';
    resultsEl.removeAttribute('data-legacy-results-count');
    resultsEl.removeAttribute('data-legacy-results-anchor');
    resultsEl.removeAttribute('data-legacy-results-mode');
}

function buildCountLine({ total, visibleCount, mode }) {
    const count = document.createElement('div');
    count.id = 'search-results-count';
    count.className = 'search-results-count';
    count.setAttribute('role', 'status');
    count.setAttribute('aria-live', 'polite');
    count.setAttribute('aria-atomic', 'true');
    if (total === 0) return count;
    if (total === 1) {
        const anchor = document.createElement('span');
        anchor.className = 'search-results-count-anchor';
        anchor.textContent = '1 anchor';
        count.append(anchor);
        return count;
    }
    if (mode === 'peek') {
        const anchor = document.createElement('span');
        anchor.className = 'search-results-count-anchor';
        anchor.textContent = 'Anchor';
        count.append(anchor);
        const divider = document.createElement('span');
        divider.className = 'search-results-count-divider';
        divider.setAttribute('aria-hidden', 'true');
        divider.textContent = '·';
        count.append(divider);
        const hidden = document.createElement('span');
        hidden.className = 'search-results-count-hidden';
        hidden.textContent = `${total - visibleCount} more`;
        count.append(hidden);
        return count;
    }
    if (visibleCount >= total) {
        const all = document.createElement('span');
        all.className = 'search-results-count-all';
        all.textContent = `All ${total}`;
        count.append(all);
        const suffix = document.createElement('span');
        suffix.className = 'search-results-count-suffix';
        suffix.textContent = ' matches';
        count.append(suffix);
        return count;
    }
    const shown = document.createElement('span');
    shown.className = 'search-results-count-shown';
    shown.textContent = `${visibleCount} of ${total}`;
    count.append(shown);
    const divider = document.createElement('span');
    divider.className = 'search-results-count-divider';
    divider.setAttribute('aria-hidden', 'true');
    divider.textContent = '·';
    count.append(divider);
    const hidden = document.createElement('span');
    hidden.className = 'search-results-count-hidden';
    hidden.textContent = `${total - visibleCount} behind`;
    count.append(hidden);
    return count;
}

function buildResultButton({ result, order, topScore, topIndex, anchorIndex, trimmedQuery }) {
    const index = result.index;
    const point = result.point || {};
    const isAnchor = Number.isFinite(anchorIndex) && index === anchorIndex;
    const classes = getSearchResultCardClasses(order, isAnchor);
    const strength = getSearchResultStrength(result, topScore);
    const strengthLabel = getSearchResultStrengthLabel(order, strength);
    const rank = buildSearchRankLabel({ index, order, topIndex, anchorIndex });
    const name = formatBusinessName(point.name) || 'Unnamed business';
    const snippet = buildSearchResultSnippet(result) || '';
    const context = point.city || '';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = classes;
    button.dataset.index = String(index);
    button.dataset.order = String(order);
    button.dataset.strength = String(strength);
    button.id = `search-result-${index}`;
    button.tabIndex = 0;
    button.setAttribute('aria-label', `Focus ${name}. ${rank}. ${snippet} ${context}.`);

    const row = document.createElement('div');
    row.className = 'search-result-row';

    const eyebrow = document.createElement('div');
    eyebrow.className = 'search-result-eyebrow';
    const rankEl = document.createElement('span');
    rankEl.className = 'search-result-rank';
    rankEl.textContent = rank;
    const strengthEl = document.createElement('span');
    strengthEl.className = 'search-result-strength';
    strengthEl.textContent = strengthLabel;
    eyebrow.append(rankEl, strengthEl);

    const nameEl = document.createElement('div');
    nameEl.className = 'search-result-name';
    if (trimmedQuery && name.toLowerCase().includes(trimmedQuery.toLowerCase())) {
        const lower = name.toLowerCase();
        const matchAt = lower.indexOf(trimmedQuery.toLowerCase());
        if (matchAt > 0) nameEl.append(document.createTextNode(name.slice(0, matchAt)));
        const mark = document.createElement('mark');
        mark.className = 'search-result-match';
        mark.textContent = name.slice(matchAt, matchAt + trimmedQuery.length);
        nameEl.append(mark);
        if (matchAt + trimmedQuery.length < name.length) {
            nameEl.append(document.createTextNode(name.slice(matchAt + trimmedQuery.length)));
        }
    } else {
        nameEl.textContent = name;
    }

    row.append(eyebrow, nameEl);
    button.append(row);

    if (snippet) {
        const what = document.createElement('div');
        what.className = 'search-result-what';
        what.textContent = snippet;
        button.append(what);
    }
    if (context) {
        const ctx = document.createElement('div');
        ctx.className = 'search-result-context';
        ctx.textContent = context;
        button.append(ctx);
    }

    const bar = document.createElement('div');
    bar.className = 'search-result-bar';
    const fill = document.createElement('span');
    fill.style.width = `${strength}%`;
    bar.append(fill);
    button.append(bar);

    return button;
}

function renderLegacySearchResultsDom({ resultsEl, dedupedResults, total, visibleCount, mode, renderContext }) {
    if (!resultsEl) return;
    if (!total) {
        clearLegacySearchResultsDom(resultsEl);
        return;
    }
    clearLegacySearchResultsDom(resultsEl);
    const wrapper = document.createElement('div');
    wrapper.dataset.legacySearchResults = '1';
    wrapper.className = 'search-results-wrapper';

    const trimmedQuery = renderContext?.trimmedQuery || '';
    const topIndex = renderContext?.topIndex ?? null;
    const anchorIndex = renderContext?.anchorIndex ?? null;
    const topScore = renderContext?.topScore ?? null;

    wrapper.append(buildCountLine({ total, visibleCount, mode }));

    const list = document.createElement('div');
    list.id = 'search-result-list';
    list.className = 'search-result-list';
    list.setAttribute('role', 'list');
    list.setAttribute('aria-label', 'Search result businesses');

    const slice = dedupedResults.slice(0, visibleCount);
    slice.forEach((result, order) => {
        if (!result || !Number.isFinite(result.index)) return;
        const item = document.createElement('div');
        item.className = 'search-result-listitem';
        item.setAttribute('role', 'listitem');
        const button = buildResultButton({
            result,
            order,
            topScore,
            topIndex,
            anchorIndex,
            trimmedQuery
        });
        item.append(button);
        list.append(item);
    });
    wrapper.append(list);

    if (total > visibleCount) {
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'search-show-more-btn';
        more.dataset.legacyShowMore = '1';
        more.setAttribute('aria-label', `Show ${total - visibleCount} more search results`);
        more.setAttribute('aria-expanded', 'false');
        more.setAttribute('aria-controls', 'search-result-list');
        more.setAttribute('aria-describedby', 'search-results-count');
        more.textContent = `Show ${total - visibleCount} more results`;
        wrapper.append(more);
    }

    resultsEl.append(wrapper);
    resultsEl.dataset.legacyResultsSource = 'legacy';
    resultsEl.dataset.legacyResultsCount = String(total);
    resultsEl.dataset.legacyResultsAnchor = String(anchorIndex ?? '');
    resultsEl.dataset.legacyResultsMode = mode;
    resultsEl.setAttribute('aria-describedby', 'search-results-count');
    syncSearchResultsA11y(resultsEl);

    // Cache for the show-more handler. The Svelte-side path does the same
    // thing via sessionStorage; for the legacy shell we keep the data in
    // module-local state so a click on the legacy "Show more" button can
    // re-render without a network round-trip.
    _lastLegacyRender = { dedupedResults, total, renderContext };
}

function handleLegacyShowMoreClick(event) {
    const button = event.target.closest('[data-legacy-show-more="1"]');
    if (!button || !_lastLegacyRender) return;
    event.preventDefault();
    const { dedupedResults, total, renderContext } = _lastLegacyRender;
    const resultsEl = button.closest('#search-results');
    if (!resultsEl) return;
    try {
        sessionStorage.setItem('searchVisibleCount', String(total));
    } catch {}
    searchVisibleCountStore.set(total);
    renderLegacySearchResultsDom({
        resultsEl,
        dedupedResults,
        total,
        visibleCount: total,
        mode: 'expanded',
        renderContext
    });
}

import {
    updateSearchTrailCue
} from './ui-renderers.js'

/**
 * search-results-ui.js
 *
 * State management for the search results panel.
 * RENDERING: legacy DOM is rendered directly into #search-results so the
 * served shell (which never mounts the Svelte SearchResults root) still
 * shows rows. Svelte stores are also updated so the future Svelte focus
 * track can re-render the same data from the canonical source of truth.
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
    const INITIAL_SHOW = 10
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
        if (!resultsEl._legacyShowMoreBound) {
            resultsEl.addEventListener('click', handleLegacyShowMoreClick);
            resultsEl._legacyShowMoreBound = true;
        }
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
    }

    // Legacy DOM render so the served shell (which never mounts the Svelte
    // SearchResults root) still shows result rows. Mirrors the structure
    // expected by css/search.css, css/mobile_premium__chrome.css, and the
    // bindSearchResultInteractions() selector.
    renderLegacySearchResultsDom({
        resultsEl,
        dedupedResults,
        total,
        visibleCount,
        mode,
        renderContext
    });

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
        clearLegacySearchResultsDom(resultsEl)
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
    searchVisibleCountStore.set(10);

    setSearchPanelState({ searching: false, focusing: false, resultsRendered: false, degraded: false })
    const spinner = document.getElementById('search-spinner')
    if (spinner) spinner.hidden = true
    if (_resultsEl) {
        _resultsEl.classList.remove('active')
        _resultsEl.classList.remove('searching')
        _resultsEl.classList.remove('is-searching-skeleton')
        _resultsEl.setAttribute('aria-busy', 'false')
        clearLegacySearchResultsDom(_resultsEl)
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
        clearLegacySearchResultsDom(resultsEl);
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
