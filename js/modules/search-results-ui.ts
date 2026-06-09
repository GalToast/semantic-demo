/**
 * search-results-ui.ts
 *
 * Typed sibling of search-results-ui.js.
 * State management for the search results panel.
 * RENDERING: legacy DOM is rendered directly into #search-results so the
 * served shell (which never mounts the Svelte SearchResults root) still
 * shows rows. Svelte stores are also updated so the future Svelte focus
 * track can re-render the same data from the canonical source of truth.
 */

import { state } from '../state.js';
import { publish, EVENTS } from './event-bus.js';
import { isCompactSearchViewport } from './utils/ui-presentation.js';
import { setSearchContainerState, setupMobileSearchSheetToggle } from './search-panel-adapter.js';
import { recordSemanticLaneSnapshot } from './semantic-lane.js';
import {
    searchResultsStore,
    searchSummaryStore,
    isSearchingStore,
    searchErrorStore,
    searchVisibleCountStore
} from './stores.js';
import { formatBusinessName } from './utils/dom-formatters.js';
import {
    getSearchResultStrength,
    getSearchResultStrengthLabel,
    getSearchResultCardClasses,
    buildSearchResultSnippet,
    buildSearchRankLabel
} from './search-result-renderer.js';
import { updateSearchTrailCue } from './ui-renderers.js';

// ── Types ──────────────────────────────────────────────────────────────────

interface SearchResultPoint {
    lead_id?: string | number;
    name?: string;
    city?: string;
    [key: string]: unknown;
}

interface SearchResult {
    point: SearchResultPoint | null;
    index: number;
    score: number;
    publicNote?: string;
    publicDetail?: string;
    [key: string]: unknown;
}

interface RenderContext {
    trimmedQuery: string;
    topIndex?: number | null;
    anchorIndex?: number | null;
    topScore?: number;
    resultIndices?: number[];
}

interface SearchPanelStateOptions {
    searching?: boolean;
    focusing?: boolean;
    hasQuery?: boolean;
    resultsRendered?: boolean;
    degraded?: boolean;
    error?: boolean;
    hasResults?: boolean;
}

interface SearchErrorData {
    query: string;
    type: 'inline' | 'full';
    message: string;
}

interface SearchSummaryState {
    query?: string;
    anchorIndex?: number | null;
    topIndex?: number | null | undefined;
    resultIndices?: number[];
    dedupedResultCount?: number;
    visibleMatches?: number;
}

interface LegacyRenderCache {
    dedupedResults: SearchResult[];
    total: number;
    renderContext: RenderContext;
}

interface LegacyRenderParams extends LegacyRenderCache {
    resultsEl: HTMLElement | null;
    visibleCount: number;
    mode: string;
}

// ── HELPERS ────────────────────────────────────────────────────────────────

function syncSearchResultsA11y(resultsEl: HTMLElement | null): void {
    if (!resultsEl) return;
    const hasContent = resultsEl.children.length > 0;
    resultsEl.setAttribute('aria-hidden', hasContent ? 'false' : 'true');
}

// ── Legacy DOM rendering ───────────────────────────────────────────────────

let _lastLegacyRender: LegacyRenderCache | null = null;

function clearLegacySearchResultsDom(resultsEl: HTMLElement): void {
    if (!resultsEl) return;
    if (resultsEl.dataset.legacyResultsSource === 'legacy') {
        resultsEl.replaceChildren();
    } else {
        const own = resultsEl.querySelectorAll('[data-legacy-search-results="1"]');
        own.forEach((el) => el.remove());
    }
    resultsEl.dataset.legacyResultsSource = '';
    resultsEl.removeAttribute('data-legacy-results-count');
    resultsEl.removeAttribute('data-legacy-results-anchor');
    resultsEl.removeAttribute('data-legacy-results-mode');
}

function buildCountLine({ total, visibleCount, mode }: { total: number; visibleCount: number; mode: string }): HTMLElement {
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
        divider.textContent = '\u00B7';
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
    divider.textContent = '\u00B7';
    count.append(divider);
    const hidden = document.createElement('span');
    hidden.className = 'search-results-count-hidden';
    hidden.textContent = `${total - visibleCount} behind`;
    count.append(hidden);
    return count;
}

function buildResultButton({ result, order, topScore, topIndex, anchorIndex, trimmedQuery }: {
    result: SearchResult;
    order: number;
    topScore: number | null;
    topIndex: number | null;
    anchorIndex: number | null;
    trimmedQuery: string;
}): HTMLElement {
    const index = result.index;
    const point = result.point || ({} as SearchResultPoint);
    const isAnchor = Number.isFinite(anchorIndex) && index === anchorIndex;
    const classes = getSearchResultCardClasses(order, isAnchor);
    const strength = getSearchResultStrength(result as SearchResult & { point: SearchResultPoint }, topScore ?? 0);
    const strengthLabel = getSearchResultStrengthLabel(order, strength);
    const rank = buildSearchRankLabel({ index, order, topIndex, anchorIndex });
    const name = formatBusinessName(point.name) || 'Unnamed business';
    const snippet = buildSearchResultSnippet(result as SearchResult & { point: SearchResultPoint }) || '';
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

function renderLegacySearchResultsDom({ resultsEl, dedupedResults, total, visibleCount, mode, renderContext }: LegacyRenderParams): void {
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

    _lastLegacyRender = { dedupedResults, total, renderContext };
}

function handleLegacyShowMoreClick(event: Event): void {
    const target = event.target as HTMLElement;
    const button = target.closest('[data-legacy-show-more="1"]');
    if (!button || !_lastLegacyRender) return;
    event.preventDefault();
    const { dedupedResults, total, renderContext } = _lastLegacyRender;
    const resultsEl = button.closest('#search-results') as HTMLElement | null;
    if (!resultsEl) return;
    try {
        sessionStorage.setItem('searchVisibleCount', String(total));
    } catch { /* noop */ }
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

// ── EXPORTS ────────────────────────────────────────────────────────────────

export function setSearchPanelState(options: SearchPanelStateOptions = {}): void {
    let hasQuery = options.hasQuery;
    if (typeof hasQuery !== 'boolean') {
        const input = document.getElementById('search-input') as HTMLInputElement | null;
        if (input) hasQuery = Boolean(input.value.trim());
    }
    setSearchContainerState({ ...options, hasQuery });
}

export function renderSearchResultItems(
    resultsEl: HTMLElement,
    results: SearchResult[],
    renderContext: RenderContext,
    statusEl: HTMLElement | null
): void {
    const INITIAL_SHOW = 10;
    const dedupedResults = dedupeNearDuplicateResults(results);
    const total = dedupedResults.length;
    const savedCount = (() => {
        try {
            return Number.parseInt(sessionStorage.getItem('searchVisibleCount') || '0', 10);
        } catch {
            return 0;
        }
    })();
    const visibleCount = Math.min(
        total,
        Math.max(INITIAL_SHOW, Number.isFinite(savedCount) && savedCount > 0 ? savedCount : INITIAL_SHOW)
    );

    const isPeek = document.body?.dataset?.panelSurfaceDetail === 'peek';
    const mode = visibleCount >= total ? 'expanded' : isPeek ? 'peek' : 'initial';

    const isExpanded = total > INITIAL_SHOW && visibleCount >= total;
    if (resultsEl) {
        resultsEl.classList.toggle('is-expanded', isExpanded);
        const searchContainer = resultsEl.closest?.('.search-container') as HTMLElement | null;
        if (searchContainer) searchContainer.classList.toggle('has-expanded-results', isExpanded);
        resultsEl.classList.add('active');
        if (!(resultsEl as HTMLElement & { _legacyShowMoreBound?: boolean })._legacyShowMoreBound) {
            resultsEl.addEventListener('click', handleLegacyShowMoreClick);
            (resultsEl as HTMLElement & { _legacyShowMoreBound?: boolean })._legacyShowMoreBound = true;
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
        resultsEl.setAttribute('aria-describedby', 'search-results-count');
    }

    // Legacy DOM render so the served shell (which never mounts the Svelte
    // SearchResults root) still shows result rows.
    renderLegacySearchResultsDom({
        resultsEl,
        dedupedResults,
        total,
        visibleCount,
        mode,
        renderContext
    });

    if (state.currentSearchSummary) {
        (state.currentSearchSummary as SearchSummaryState).dedupedResultCount = total;
    }
    setupMobileSearchSheetToggle({ isCompactSearchViewport });

    publish(EVENTS.URL_SYNC_REQUESTED, { params: { offset: null }, reason: 'search-results-render' });

    if (resultsEl) resultsEl.scrollTop = 0;
}

// ── Search Lifecycle State ──────────────────────────────────────────────────

export function applySemanticSearchLoadingState(resultsEl: HTMLElement | null): void {
    isSearchingStore.set(true);
    searchErrorStore.set(null);

    if (resultsEl) {
        resultsEl.classList.add('searching');
        resultsEl.classList.add('is-searching-skeleton');
        resultsEl.setAttribute('aria-busy', 'true');
        resultsEl.scrollTop = 0;
        syncSearchResultsA11y(resultsEl);
        resultsEl.hidden = false;
    }
    clearSearchGlow();
}

export function applySemanticSearchErrorState(
    resultsEl: HTMLElement | null,
    statusEl: HTMLElement | null,
    trimmedQuery: string,
    error: Error | null
): void {
    const preservingSameQuery = state.currentSearchSummary && (state.currentSearchSummary as SearchSummaryState).query === trimmedQuery;

    const errorData: SearchErrorData = {
        query: trimmedQuery,
        type: preservingSameQuery ? 'inline' : 'full',
        message: error?.message || 'Search failed'
    };

    searchErrorStore.set(errorData);
    isSearchingStore.set(false);

    if (resultsEl) {
        resultsEl.classList.remove('is-searching-skeleton');
        resultsEl.setAttribute('aria-busy', 'false');
        clearLegacySearchResultsDom(resultsEl);
    }

    if (!preservingSameQuery) {
        setSearchPanelState({ error: true, hasQuery: true });
    }

    if (statusEl) {
        statusEl.textContent = `Search paused for "${trimmedQuery}". Try again in a moment.`;
        statusEl.hidden = false;
        statusEl.classList.add('search-status-compact');
    }
    recordSemanticLaneSnapshot({ state: 'degraded', query: trimmedQuery, reason: 'search-degraded' });
}

export function finishSemanticSearchSuccessState(
    resultsEl: HTMLElement | null,
    trimmedQuery: string,
    cacheSource: string = 'network'
): void {
    const spinner = document.getElementById('search-spinner');
    if (spinner) spinner.hidden = true;
    if (resultsEl) {
        resultsEl.classList.remove('searching');
        resultsEl.classList.remove('is-searching-skeleton');
        resultsEl.setAttribute('aria-busy', 'false');
        syncSearchResultsA11y(resultsEl);
    }
    setSearchPanelState({ searching: false, resultsRendered: true, hasResults: true, hasQuery: true });
    if (cacheSource === 'network') recordSemanticLaneSnapshot({ state: 'healthy', query: trimmedQuery });
}

export function clearSearchState(_resultsEl: HTMLElement | null, _statusEl: HTMLElement | null): void {
    state.currentSearchSummary = null;

    // Clear stores
    searchResultsStore.set([]);
    searchSummaryStore.set(null);
    isSearchingStore.set(false);
    searchErrorStore.set(null);
    searchVisibleCountStore.set(10);

    setSearchPanelState({ searching: false, focusing: false, resultsRendered: false, degraded: false });
    const spinner = document.getElementById('search-spinner');
    if (spinner) spinner.hidden = true;
    if (_resultsEl) {
        _resultsEl.classList.remove('active');
        _resultsEl.classList.remove('searching');
        _resultsEl.classList.remove('is-searching-skeleton');
        _resultsEl.setAttribute('aria-busy', 'false');
        clearLegacySearchResultsDom(_resultsEl);
        syncSearchResultsA11y(_resultsEl);
    }
    if (_statusEl) {
        _statusEl.hidden = true;
        _statusEl.classList.remove('search-status-compact');
    }
    updateSearchTrailCue({ stage: 'query' });
    publish(EVENTS.SEARCH_CLEARED);
}

// ── Canonical Bridges and Stubs ─────────────────────────────────────────────

export function beginSemanticSearchUiState(
    resultsEl: HTMLElement | null,
    statusEl: HTMLElement | null,
    trimmedQuery: string
): void {
    publish(EVENTS.TOOLTIP_HIDE_REQUESTED);
    applySemanticSearchLoadingState(resultsEl);
    if (statusEl) {
        statusEl.textContent = `Searching for businesses related to "${trimmedQuery}"...`;
        statusEl.hidden = false;
    }
    updateSearchTrailCue({ stage: 'query' });
}

export function updateSemanticSearchRetryState(params: {
    statusEl: HTMLElement | null;
    trimmedQuery: string;
    nextAttempt: number;
    delayMs: number;
}): void {
    const { statusEl, trimmedQuery, nextAttempt, delayMs } = params;
    const retryDelayLabel = delayMs >= 1000 ? `${Math.round((delayMs / 1000) * 10) / 10}s` : `${delayMs}ms`;
    if (statusEl) {
        statusEl.textContent = `Semantic search is reconnecting for "${trimmedQuery}"... retry ${nextAttempt} starts in ${retryDelayLabel}.`;
    }
    recordSemanticLaneSnapshot({ state: 'reconnecting', query: trimmedQuery });
}

export function applySemanticSearchDegradedState(
    resultsEl: HTMLElement | null,
    statusEl: HTMLElement | null,
    trimmedQuery: string,
    error: Error | null
): void {
    applySemanticSearchErrorState(resultsEl, statusEl, trimmedQuery, error);
}

export function applyEmptySemanticSearchState(
    resultsEl: HTMLElement | null,
    statusEl: HTMLElement | null,
    trimmedQuery: string
): void {
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

export function startSearchVectorScramble(): void {
    document.body?.classList?.add('search-vector-scramble');
}

export function stopSearchVectorScramble(): void {
    document.body?.classList?.remove('search-vector-scramble');
}

export function updateSearchPreviewOverlay(): void {
    publish(EVENTS.COMPOSITION_UPDATED, { reason: 'search-preview' });
}

export function activateSearchGlow(resultIndices: number[] = [], anchorIndex: number | null = null): void {
    (state as Record<string, unknown>).searchGlowActive = true;
    (state as Record<string, unknown>).searchGlowIndices = new Set(Array.isArray(resultIndices) ? resultIndices : []);
    (state as Record<string, unknown>).searchGlowTopIndex = Number.isFinite(anchorIndex) ? anchorIndex : ((state as Record<string, unknown>).searchGlowIndices as Set<number>).values().next().value ?? null;
    publish(EVENTS.COMPOSITION_UPDATED, { reason: 'search-glow' });
}

export function resetSemanticGuideUi(): void {
    publish(EVENTS.SUMMARY_CARD_HIDE_REQUESTED);
}

export function clearShortSemanticSearchState(resultsEl: HTMLElement | null, statusEl: HTMLElement | null): void {
    clearSearchState(resultsEl, statusEl);
}

export function startMobileRouteFieldPeek(): void {
    (state as Record<string, unknown>).mobileRouteFieldPeekToken = ((state as Record<string, unknown>).mobileRouteFieldPeekToken as number || 0) + 1;
    document.body.dataset.mobileRoutePeek = 'active';
}

export function clearMobileRouteFieldPeek(): void {
    if ((state as Record<string, unknown>).mobileRouteFieldPeekTimer) clearTimeout((state as Record<string, unknown>).mobileRouteFieldPeekTimer as number);
    (state as Record<string, unknown>).mobileRouteFieldPeekTimer = null;
    delete document.body.dataset.mobileRoutePeek;
    delete document.body.dataset.mobileRoutePeekReason;
}

export function isMobileRouteFieldPeekActive(): boolean {
    return document.body?.dataset?.mobileRoutePeek === 'active';
}

export function clearSearchPreviewHoverTimer(): void {
    if ((state as Record<string, unknown>).searchPreviewHoverTimer) clearTimeout((state as Record<string, unknown>).searchPreviewHoverTimer as number);
    (state as Record<string, unknown>).searchPreviewHoverTimer = null;
}

export function focusSearchInputForReplacement(): void {
    const input = document.getElementById('search-input') as HTMLInputElement | null;
    if (input && typeof input.focus === 'function') input.focus();
}

export function updateSearchStatusMessage(matchCount: number | null = null): void {
    const statusEl = document.getElementById('search-status');
    if (!statusEl) return;
    if (Number.isFinite(matchCount)) {
        statusEl.textContent = matchCount === 1 ? '1 match visible.' : `${matchCount} matches visible.`;
    } else if ((state.currentSearchSummary as unknown as SearchSummaryState | null)?.visibleMatches) {
        statusEl.textContent = `${(state.currentSearchSummary as unknown as SearchSummaryState).visibleMatches} matches visible.`;
    }
}

// ── Dedupe near-duplicate results ───────────────────────────────────────────

function dedupeNearDuplicateResults(results: SearchResult[]): SearchResult[] {
    if (!Array.isArray(results) || results.length < 2) return results;
    const seen = new Map<string, SearchResult>();
    const out: SearchResult[] = [];
    for (const result of results) {
        if (!result?.point) { out.push(result); continue; }
        const key = nearDuplicateKey(result.point);
        if (!key) { out.push(result); continue; }

        if (seen.has(key)) {
            const existing = seen.get(key)!;
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

function nearDuplicateKey(point: SearchResultPoint): string | null {
    if (!point.name || !point.city) return null;
    const cleanName = point.name.toLowerCase()
        .replace(/\b(llc|inc|corp|co|ltd)\b/g, '')
        .replace(/[^a-z0-9]/g, '')
        .trim();
    const cleanCity = point.city.toLowerCase().trim();
    return `${cleanName}|${cleanCity}`;
}

export function clearSearchGlow(): void {
    (state as Record<string, unknown>).searchGlowActive = false;
    if ((state as Record<string, unknown>).searchGlowIndices && typeof ((state as Record<string, unknown>).searchGlowIndices as Set<number>).clear === 'function') {
        ((state as Record<string, unknown>).searchGlowIndices as Set<number>).clear();
    }
    publish(EVENTS.COMPOSITION_UPDATED);
}
