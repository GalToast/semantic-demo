// js/modules/search-state.js — extracted from monolithic HTML
// Most functions are stubs that defer to main script for cross-module orchestration.
// The module owns the search state machine logic; orchestration calls go through state or window.

import { state } from '../state.js';
import {
    stripTerminalPunctuation,
    describeCluster,
    escapeHtml,
    formatBusinessName,
    highlightMatch,
    isPointVisible,
    sanitizePublicFacingNote,
    cleanPublicNoteText
} from '../utils.js';

const SEARCH_STOP_WORDS = new Set([
    'a',
    'an',
    'and',
    'are',
    'at',
    'by',
    'for',
    'from',
    'in',
    'into',
    'is',
    'me',
    'my',
    'of',
    'on',
    'or',
    'place',
    'places',
    'take',
    'the',
    'to',
    'with',
    'your'
]);

function tokenizeSearchText(text) {
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

function expandSearchIntent(query, queryTokens) {
    const expanded = new Set(queryTokens);
    const lowerQuery = String(query || '').toLowerCase();
    const expansions = [
        {
            matchAny: ['alcohol', 'booze', 'drink', 'liquor', 'spirits'],
            aliases: [
                'liquor',
                'spirits',
                'tequila',
                'whiskey',
                'vodka',
                'beer',
                'wine',
                'brewery',
                'distillery',
                'cocktail',
                'cantina',
                'pub',
                'tavern',
                'bar',
                'lounge',
                'saloon'
            ]
        },
        {
            matchAny: ['dog', 'dogs', 'pet', 'pets', 'puppy', 'animal'],
            aliases: [
                'dog',
                'grooming',
                'kennel',
                'boarding',
                'daycare',
                'vet',
                'veterinary',
                'wash',
                'trainer',
                'park'
            ]
        }
    ];
    expansions.forEach((exp) => {
        const match = exp.matchAny.some((t) => queryTokens.includes(t));
        if (!match) return;
        exp.aliases.forEach((a) => {
            if (a && !SEARCH_STOP_WORDS.has(a)) expanded.add(a);
        });
    });
    return [...expanded];
}

function countTokenMatches(fieldTokens, queryTokens) {
    let exact = 0,
        prefix = 0;
    queryTokens.forEach((token) => {
        if (fieldTokens.includes(token)) exact += 1;
        else if (fieldTokens.some((e) => e.startsWith(token) || token.startsWith(e))) prefix += 1;
    });
    return { exact, prefix };
}

// highlightMatch imported from utils.js

// === Search result strength ===

function getSearchResultStrength(result, topScore) {
    return Math.max(14, Math.min(100, Math.round((result.score / topScore) * 100)));
}

function getSearchResultStrengthLabel(order, strength) {
    return order === 0 ? 'Closest' : `${strength}%`;
}

function getSearchResultCardClasses(order, isAnchor) {
    return ['search-result-item', order === 0 ? 'top-result' : '', isAnchor ? 'is-anchor' : 'is-secondary']
        .filter(Boolean)
        .join(' ');
}

function buildSearchRankLabel({ index, order, topIndex, anchorIndex = null, walkIndex = null }) {
    if (walkIndex !== null && walkIndex !== undefined && index === walkIndex)
        return order === 0 ? 'Current stop' : 'Current stop';
    if (anchorIndex !== null && anchorIndex !== undefined && index === anchorIndex) {
        if (walkIndex !== null && walkIndex !== undefined && walkIndex !== anchorIndex) return 'Original anchor';
        return order === 0 ? 'Anchor' : 'Anchor';
    }
    if (topIndex !== null && topIndex !== undefined && index === topIndex) {
        return walkIndex !== null && walkIndex !== undefined && walkIndex !== topIndex
            ? 'Original top match'
            : 'Top match';
    }
    return order === 0 ? 'Top match' : `Match ${order + 1}`;
}

function buildSearchStageLabel(index, topIndex, anchorIndex = null, walkIndex = null) {
    if (walkIndex !== null && walkIndex !== undefined && index === walkIndex) {
        return walkIndex === anchorIndex ? 'Centered' : 'Current stop';
    }
    if (anchorIndex !== null && anchorIndex !== undefined && index === anchorIndex) {
        if (walkIndex !== null && walkIndex !== undefined && walkIndex !== anchorIndex) return 'Original anchor';
        return index === topIndex ? 'Anchor' : 'Centered';
    }
    if (index === topIndex) {
        return walkIndex !== null && walkIndex !== undefined && walkIndex !== topIndex
            ? 'Original closest'
            : 'Closest match';
    }
    const point = state.points[index];
    if (!point) return 'Related match';
    if (Number.isFinite(topIndex) && state.points[topIndex]?.cluster === point.cluster) return 'Same theme';
    return 'Related match';
}

// === Build result item HTML ===

export function buildSearchResultItemHtml(result, order, renderContext) {
    const { trimmedQuery, topIndex, anchorIndex, topScore } = renderContext;
    const strength = getSearchResultStrength(result, topScore);
    const strengthLabel = getSearchResultStrengthLabel(order, strength);
    const isAnchor = anchorIndex !== null && anchorIndex !== undefined && result.index === anchorIndex;
    const rankLabel = buildSearchRankLabel({ index: result.index, order, topIndex, anchorIndex });
    const cardClasses = getSearchResultCardClasses(order, isAnchor);
    const detailText = result.publicNote || result.point.what || '';
    const clusterText = `${describeCluster(result.point.cluster)} | ${result.point.city || ''}`;

    return `
        <div class="${cardClasses}" data-index="${result.index}" data-order="${order}" role="button" tabindex="0"
            aria-label="${escapeHtml(`Focus ${formatBusinessName(result.point.name)} from search result ${order + 1}`)}"
            style="animation-delay:${Math.min(order * 32, 224)}ms">
            <div class="search-result-row">
                <div class="search-result-rank">${rankLabel}</div>
                <div class="search-result-name">${highlightMatch(formatBusinessName(result.point.name), trimmedQuery)}</div>
            </div>
            <div class="search-result-what" title="${escapeHtml(detailText)}">${detailText}</div>
            <div class="search-result-cluster" style="color:${state.COLORS[result.point.cluster % state.COLORS.length]}">${clusterText}</div>
            <div class="search-result-meta">
                <div class="search-result-stage">${buildSearchStageLabel(result.index, topIndex, anchorIndex)}</div>
                <div class="search-result-strength">${strengthLabel}</div>
            </div>
            <div class="search-result-bar"><span style="width:${strength}%"></span></div>
        </div>
    `;
}

// === Render result items (show 5 + "Show more") ===

export function renderSearchResultItems(resultsEl, results, renderContext, statusEl) {
    const INITIAL_SHOW = 5;
    const total = results.length;
    const visible = results.slice(0, INITIAL_SHOW);
    resultsEl.innerHTML = visible.map((r, i) => buildSearchResultItemHtml(r, i, renderContext)).join('');
    if (total > INITIAL_SHOW) {
        const remaining = total - INITIAL_SHOW;
        const btn = document.createElement('button');
        btn.className = 'search-show-more-btn';
        btn.type = 'button';
        btn.textContent = `Show ${remaining} more`;
        btn.setAttribute('aria-label', `Show ${remaining} more search results`);
        btn.onclick = () => {
            resultsEl.innerHTML = results.map((r, i) => buildSearchResultItemHtml(r, i, renderContext)).join('');
            bindSearchResultInteractions(resultsEl, statusEl, results, renderContext);
        };
        resultsEl.appendChild(btn);
    }
    resultsEl.scrollTop = 0;
}

// === Refresh hierarchy (walk state labels) ===

export function refreshSearchResultHierarchy(resultsEl) {
    if (!resultsEl || !state.currentSearchSummary) return;
    const anchorIndex = state.currentSearchSummary.anchorIndex;
    const topIndex = state.currentSearchSummary.topIndex ?? null;
    const walkIndex = state.navState.walkHistoryIndices?.length > 1 ? state.navState.focusedIndex : null;
    resultsEl.querySelectorAll('.search-result-item').forEach((row) => {
        const index = Number(row.dataset.index);
        const order = Number(row.dataset.order);
        const rankEl = row.querySelector('.search-result-rank');
        const stageEl = row.querySelector('.search-result-stage');
        row.classList.toggle(
            'is-origin-anchor',
            walkIndex !== null && anchorIndex !== null && index === anchorIndex && index !== walkIndex
        );
        row.classList.toggle(
            'is-origin-top',
            walkIndex !== null && topIndex !== null && index === topIndex && index !== walkIndex && index !== anchorIndex
        );
        if (rankEl) rankEl.textContent = buildSearchRankLabel({ index, order, topIndex, anchorIndex, walkIndex });
        if (stageEl) stageEl.textContent = buildSearchStageLabel(index, topIndex, anchorIndex, walkIndex);
    });
}

// === Set active row ===

export function setActiveSearchResultRow(resultsEl, activeIndex = null) {
    if (!resultsEl) return;
    const effectiveIndex =
        (state.navState.walkHistoryIndices?.length > 1 ? state.navState.focusedIndex : null) ?? activeIndex;
    const activeKey = effectiveIndex !== null ? String(effectiveIndex) : null;
    resultsEl.querySelectorAll('.search-result-item').forEach((row) => {
        const isActive = activeKey !== null && row.dataset.index === activeKey;
        row.classList.toggle('active-focus', isActive);
        row.classList.toggle('active-walk', isActive && state.navState.walkHistoryIndices?.length > 1);
        if (isActive) row.setAttribute('aria-current', 'true');
        else row.removeAttribute('aria-current');
    });
    refreshSearchResultHierarchy(resultsEl);
}

// === Focus transition ===

export function beginSearchFocusTransition(resultsEl, statusEl, resultIndices, targetIndex, point, el) {
    if (!point || !state.currentSearchSummary) return;
    state.searchFocusTransitionToken = (state.searchFocusTransitionToken || 0) + 1;
    resultsEl
        .querySelectorAll('.search-result-item')
        .forEach((r) => r.classList.remove('active-preview', 'active-focus', 'active-walk'));
    el.classList.add('active-focus');
    state.currentSearchSummary.anchorIndex = targetIndex;
    refreshSearchResultHierarchy(resultsEl);
    // animateCameraToSearchCorridor, focusOnNode/focusOnPoint — deferred to main script
    // syncSearchStatusForFocus — deferred to main script
}

// === Update search status message ===

export function updateSearchStatusMessage(filteredCount) {
    const statusEl = document.getElementById('search-status');
    if (!statusEl) return;
    if (state.currentSearchSummary) {
        restoreSearchSummaryStatus();
        return;
    }
    statusEl.textContent = 'Search 8,406 MoCo businesses semantically by need, venue, service, or clue.';
}

// === Restore summary status ===

export function restoreSearchSummaryStatus() {
    const statusEl = document.getElementById('search-status');
    const resultsEl = document.getElementById('search-results');
    if (!statusEl || !state.currentSearchSummary) return;
    if (!resultsEl?.classList.contains('active')) return;
    refreshSearchResultHierarchy(resultsEl);
    const compact = window.innerWidth <= 768;
    if (state.currentSearchSummary.anchorIndex !== null) {
        const anchorPoint = state.points[state.currentSearchSummary.anchorIndex];
        const anchorName = anchorPoint ? formatBusinessName(anchorPoint.name) : 'the current anchor';
        statusEl.textContent = compact
            ? `${state.currentSearchSummary.visibleMatches} of ${state.currentSearchSummary.totalMatches} matches | ${anchorName} anchors this trail.`
            : `Showing ${state.currentSearchSummary.visibleMatches} of ${state.currentSearchSummary.totalMatches} semantic matches | ${anchorName} is anchoring this view.`;
    } else {
        statusEl.textContent = compact
            ? `${state.currentSearchSummary.visibleMatches} of ${state.currentSearchSummary.totalMatches} semantic matches`
            : `Showing ${state.currentSearchSummary.visibleMatches} of ${state.currentSearchSummary.totalMatches} semantic matches`;
    }
}

// === Trail cue update ===

export function updateSearchTrailCue(nextCue = {}) {
    const cueEl = document.getElementById('search-trail-cue');
    const kickerEl = document.getElementById('search-trail-cue-kicker');
    const titleEl = document.getElementById('search-trail-cue-title');
    const noteEl = document.getElementById('search-trail-cue-note');
    if (!cueEl || !kickerEl) return;

    if (nextCue.beat === 'idle' || !nextCue.title) {
        cueEl.hidden = true;
        cueEl.classList.remove('active');
        return;
    }
    kickerEl.textContent = nextCue.kicker || '';
    titleEl.textContent = nextCue.title || '';
    noteEl.textContent = nextCue.note || '';
    cueEl.hidden = false;
    cueEl.classList.add('active');
    state.searchTrailCueLastRenderedAt = performance.now();
}

// === Interaction binding ===

export function bindSearchResultInteractions(resultsEl, statusEl, results, renderContext) {
    const { resultIndices, fallbackPreviewIndex } = renderContext;
    resultsEl.querySelectorAll('.search-result-item').forEach((el) => {
        const index = Number(el.dataset.index);
        const result = results.find((r) => r.index === index);
        if (!result) return;
        el.onmouseenter = () => {
            clearTimeout(state.searchPreviewHoverTimer);
            state.searchPreviewHoverTimer = window.setTimeout(() => {
                el.classList.add('active-preview');
                activateSearchGlow(resultIndices, index);
                // updateTooltipContent — deferred
            }, 85);
        };
        el.onmouseleave = () => {
            clearTimeout(state.searchPreviewHoverTimer);
            el.classList.remove('active-preview');
            restoreSearchResultPreview(resultIndices, fallbackPreviewIndex);
        };
        el.onclick = () => beginSearchFocusTransition(resultsEl, statusEl, resultIndices, index, result.point, el);
        el.onkeydown = (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            beginSearchFocusTransition(resultsEl, statusEl, resultIndices, index, result.point, el);
        };
    });
}

// === Search glow (deferred helpers) ===

export function activateSearchGlow(resultIndices, anchorIndex) {
    state.searchGlowActive = true;
    state.searchGlowIndices = new Set(resultIndices || []);
    state.searchGlowTopIndex = anchorIndex;
    // refreshHoverSemanticOverlay — deferred to main script
}

export function clearSearchGlow() {
    state.searchGlowActive = false;
    state.searchGlowIndices = new Set();
    state.searchGlowTopIndex = null;
}

// === Restore preview ===

export function restoreSearchResultPreview(resultIndices, fallbackIndex = null) {
    const anchorIndex = state.currentSearchSummary?.anchorIndex ?? fallbackIndex;
    activateSearchGlow(resultIndices, anchorIndex);
}

// === Clear short semantic search state ===

export function clearShortSemanticSearchState(resultsEl, statusEl) {
    state.currentSearchSummary = null;
    clearSearchGlow();
    resultsEl?.classList.remove('active', 'searching');
    if (statusEl) statusEl.textContent = 'Search 8,406 MoCo businesses semantically by need, venue, service, or clue.';
    if (resultsEl) resultsEl.innerHTML = '';
}

// === Search result map ===

export function mapSemanticSearchServiceResult(row) {
    const pointIndex = state.pointIndexByLeadId.get(String(row.lead_id));
    if (pointIndex === undefined) return null;
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

// Debug access
window._ss = {
    buildSearchResultItemHtml,
    renderSearchResultItems,
    refreshSearchResultHierarchy,
    setActiveSearchResultRow,
    beginSearchFocusTransition,
    updateSearchStatusMessage,
    restoreSearchSummaryStatus,
    updateSearchTrailCue,
    bindSearchResultInteractions,
    activateSearchGlow,
    clearSearchGlow,
    restoreSearchResultPreview,
    clearShortSemanticSearchState,
    mapSemanticSearchServiceResult,
    mapSemanticSearchResults
};
