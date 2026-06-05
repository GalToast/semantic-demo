import { state } from '../state.js';
import { getViewportSize } from './environment.js';
import { isCompactSearchViewport } from './utils/ui-presentation.js';
import { sanitizePublicFacingNote, cleanPublicNoteText } from './utils/dom-formatters.js';

/**
 * search-result-renderer.js
 *
 * Dedicated module for rendering search result HTML and managing the result list DOM.
 */

// ─── PRIVATE HELPERS ────────────────────────────────────────────────────────

function humanizeSearchSnippetCase(value) {
    const clean = cleanPublicNoteText(value);
    if (!clean) return '';
    return clean
        .toLowerCase()
        .replace(/\b([a-z])/g, (match) => match.toUpperCase())
        .replace(/\b(Llc|Lp|Ltd|Pc|Pllc|Inc)\b/g, (match) => match.toUpperCase());
}

function compactSearchSnippetText(value, _max = 128) {
    const clean = sanitizePublicFacingNote(value);
    return clean || '';
}

function buildCategoryLocationSnippet(point) {
    const category = humanizeSearchSnippetCase(sanitizePublicFacingNote(point?.what || ''));
    const city = cleanPublicNoteText(point?.city || '');
    const hasUsefulCategory = category && !/^(local business|montgomery county business|registry or thin business record)$/i.test(category);
    if (hasUsefulCategory && city) return `${category} in ${city}.`;
    if (hasUsefulCategory) return category;
    if (city) return `Montgomery County business in ${city}.`;
    return 'Montgomery County business.';
}

function buildOfficialSiteSnippet(note, point) {
    const category = humanizeSearchSnippetCase(sanitizePublicFacingNote(point?.what || '')).toLowerCase();
    const city = cleanPublicNoteText(point?.city || '');
    if (category && city) return `Official site confirms this ${category} in ${city}.`;
    if (category) return `Official site confirms this ${category}.`;
    return compactSearchSnippetText(note);
}

// ─── SEARCH RENDERERS ────────────────────────────────────────────────────────

export function renderResultCountLine(total, currentVisibleCount, mode = 'initial') {
    if (total === 0) return '';
    if (total === 1) return '1 anchor';
    const hidden = total - currentVisibleCount;
    if (mode === 'peek') {
        return `Anchor · ${hidden} more`;
    }
    if (currentVisibleCount >= total) {
        return `All ${total} matches`;
    }
    return `${currentVisibleCount} of ${total} · ${hidden} behind`;
}

export function getSearchResultStrength(result, topScore) {
    if (!Number.isFinite(topScore) || topScore <= 0) return 14;
    if (!Number.isFinite(result?.score)) return 14;
    return Math.max(14, Math.min(100, Math.round((result.score / topScore) * 100)));
}

export function getSearchResultStrengthLabel(order, strength) {
    if (order === 0) return 'Best match';
    if (strength >= 90) return 'Strong match';
    if (strength >= 75) return 'Good match';
    if (strength >= 50) return 'Related';
    return 'Broader match';
}

export function getSearchResultCardClasses(order, isAnchor) {
    return ['search-result-item', order === 0 ? 'top-result' : '', isAnchor ? 'is-anchor' : 'is-secondary']
        .filter(Boolean)
        .join(' ');
}

export function buildSearchResultSnippet(result) {
    const point = result?.point || {};
    const rawNote = result?.publicNote || result?.publicDetail || '';
    if (!rawNote) return buildCategoryLocationSnippet(point);

    const sanitized = sanitizePublicFacingNote(rawNote, point);
    const lower = cleanPublicNoteText(rawNote).toLowerCase();

    if (sanitized && (sanitized !== rawNote || /^legal name:/i.test(rawNote))) {
        return sanitized;
    }

    if (
        lower === 'pending research.' ||
        lower === 'pending research' ||
        lower.startsWith('no public') ||
        lower.startsWith('no verified') ||
        lower.startsWith('no verifiable') ||
        lower.startsWith('official texas comptroller') ||
        lower.startsWith('texas taxpayer record') ||
        lower.startsWith('registry-only') ||
        lower.startsWith('search for exact') ||
        lower.includes('no reliable public business contact')
    ) {
        return buildCategoryLocationSnippet(point);
    }

    if (/^official .*site identifies/i.test(rawNote) || /^official .*site confirms/i.test(rawNote)) {
        return buildOfficialSiteSnippet(rawNote, point);
    }

    return compactSearchSnippetText(rawNote);
}

export function buildSearchRankLabel({ index, order, topIndex, anchorIndex = null, exploreIndex = null }) {
    if (index === null || index === undefined) return 'Match';
    if (exploreIndex !== null && exploreIndex !== undefined && index === exploreIndex)
        return 'Current stop';
    if (anchorIndex !== null && anchorIndex !== undefined && index === anchorIndex) {
        if (exploreIndex !== null && exploreIndex !== undefined && exploreIndex !== anchorIndex) return 'Original anchor';
        return 'Anchor';
    }
    if (topIndex !== null && topIndex !== undefined && index === topIndex) {
        return exploreIndex !== null && exploreIndex !== undefined && exploreIndex !== topIndex
            ? 'Original top match'
            : 'Top match';
    }
    const orderNum = Number(order);
    return orderNum === 0 ? 'Top result' : `Result ${orderNum + 1}`;
}

export function buildSearchStageLabel(index, topIndex, anchorIndex = null, exploreIndex = null) {
    if (exploreIndex !== null && exploreIndex !== undefined && index === exploreIndex) {
        return exploreIndex === anchorIndex ? 'Centered' : 'Current stop';
    }
    if (anchorIndex !== null && anchorIndex !== undefined && index === anchorIndex) {
        if (exploreIndex !== null && exploreIndex !== undefined && exploreIndex !== anchorIndex) return 'Original anchor';
        return index === topIndex ? 'Anchor' : 'Centered';
    }
    if (index === topIndex) {
        return exploreIndex !== null && exploreIndex !== undefined && exploreIndex !== topIndex
            ? 'Original closest'
            : 'Closest match';
    }
    if (!state.points) return 'Related match';
    const inBounds = Number.isFinite(index) && index >= 0 && index < state.points.length;
    const point = inBounds ? state.points[index] : null;
    if (!point) return 'Related match';
    if (Number.isFinite(topIndex) && topIndex >= 0 && topIndex < state.points.length && state.points[topIndex]?.cluster === point.cluster) return 'Same theme';
    return 'Related match';
}

// ─── DOM UPDATERS ───────────────────────────────────────────────────────────

export function revealActiveSearchResultOnCompact(resultsEl, activeRow = null) {
    if (!resultsEl || !isCompactSearchViewport()) return false;
    if (document.body?.dataset?.mobileSearchSheet === 'peek') return false;

    const content = document.getElementById('info-panel-content');
    const row = activeRow || resultsEl.querySelector('.search-result-item');
    if (!content || !row) return false;

    const rowRect = row.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    if (!rowRect.width || !rowRect.height || !contentRect.height) return false;

    const targetTop = Math.min(getViewportSize().height * 0.52, Math.max(contentRect.top + 16, contentRect.bottom - rowRect.height - 36));
    const nextScrollTop = Math.max(0, content.scrollTop + rowRect.top - targetTop);
    content.scrollTo({ top: nextScrollTop, behavior: 'auto' });
    return true;
}

export function clearCompactSearchResultRevealTimers() {
    state.compactSearchRevealToken = (state.compactSearchRevealToken || 0) + 1;
    if (state.compactSearchRevealTimers) {
        state.compactSearchRevealTimers.forEach((timerId) => window.clearTimeout(timerId));
        state.compactSearchRevealTimers = [];
    }
}

export function scheduleCompactSearchResultReveal(resultsEl, activeIndex = null) {
    if (!resultsEl || !isCompactSearchViewport()) return;

    clearCompactSearchResultRevealTimers();
    const token = state.compactSearchRevealToken;
    const reveal = () => {
        if (token !== state.compactSearchRevealToken || !isCompactSearchViewport()) return;
        const row = activeIndex !== null && activeIndex !== undefined
            ? resultsEl.querySelector(`.search-result-item[data-index="${CSS.escape(String(activeIndex))}"]`)
            : resultsEl.querySelector('.search-result-item.active-focus, .search-result-item');
        revealActiveSearchResultOnCompact(resultsEl, row);
    };

    requestAnimationFrame(() => requestAnimationFrame(reveal));
    if (!state.compactSearchRevealTimers) state.compactSearchRevealTimers = [];
    [80, 240, 520].forEach((delay) => {
        state.compactSearchRevealTimers.push(window.setTimeout(reveal, delay));
    });
}

export function setActiveSearchResultRow(resultsEl, activeIndex = null, { reveal = true } = {}) {
    if (!resultsEl) return;
    const isCommittedExplore = state.navState.mode === 'trail' && (state.navState.explorationHistoryIndices || []).length > 1;
    const summaryResultIndices = Array.isArray(state.currentSearchSummary?.resultIndices)
        ? state.currentSearchSummary.resultIndices
        : [];
    const focusedIndex = Number.isFinite(state.focusedNode)
        ? state.focusedNode
        : Number.isFinite(state.navState?.focusedIndex)
          ? state.navState.focusedIndex
          : null;
    const focusIsOutsideSearchTrail = Number.isFinite(focusedIndex)
        && summaryResultIndices.length > 0
        && !summaryResultIndices.includes(focusedIndex);
    const effectiveIndex = focusIsOutsideSearchTrail
        ? null
        : isCommittedExplore && Number.isFinite(state.navState.focusedIndex) ? state.navState.focusedIndex : activeIndex;
    const activeKey = effectiveIndex !== null ? String(effectiveIndex) : null;
    let activeRow = null;

    resultsEl.querySelectorAll('.search-result-item').forEach((row) => {
        const isActive = activeKey !== null && row.dataset.index === activeKey;
        row.classList.toggle('active-focus', isActive);
        row.classList.toggle('active-explore', isActive && isCommittedExplore);
        if (isActive) {
            row.setAttribute('aria-current', 'true');
            activeRow = row;
        } else {
            row.removeAttribute('aria-current');
        }
    });

    if (typeof window.refreshSearchResultHierarchy === 'function') {
        window.refreshSearchResultHierarchy(resultsEl);
    }

    if (reveal && activeRow && typeof activeRow.scrollIntoView === 'function') {
        const searchState = resultsEl._searchStateNamespace;
        if (searchState && typeof searchState.isMobileRouteFieldPeekActive === 'function' && searchState.isMobileRouteFieldPeekActive()) {
            return;
        }
        if (!revealActiveSearchResultOnCompact(resultsEl, activeRow)) {
            activeRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
        scheduleCompactSearchResultReveal(resultsEl, effectiveIndex);
    }
}

export function refreshSearchResultHierarchy(resultsEl) {
    if (!resultsEl || !state.currentSearchSummary) return;
    const anchorIndex = state.currentSearchSummary.anchorIndex;
    const topIndex = state.currentSearchSummary.topIndex ?? null;
    const isCommittedExplore = state.navState.mode === 'trail' && (state.navState.explorationHistoryIndices || []).length > 1;
    const exploreIndex = isCommittedExplore && Number.isFinite(state.navState.focusedIndex) ? state.navState.focusedIndex : null;

    resultsEl.querySelectorAll('.search-result-item').forEach((row) => {
        const index = Number.isFinite(+row.dataset.index) ? +row.dataset.index : null;
        const order = Number.isFinite(+row.dataset.order) ? +row.dataset.order : null;
        const rankEl = row.querySelector('.search-result-rank');
        const stageEl = row.querySelector('.search-result-stage');

        const isOriginAnchor = isCommittedExplore && anchorIndex !== null && index === anchorIndex && index !== exploreIndex;
        const isOriginTop = isCommittedExplore && topIndex !== null && index === topIndex && index !== exploreIndex && index !== anchorIndex;

        row.classList.toggle('is-origin-anchor', isOriginAnchor);
        row.classList.toggle('is-origin-top', isOriginTop);

        if (rankEl && Number.isFinite(order)) {
            rankEl.textContent = buildSearchRankLabel({ index, order, topIndex, anchorIndex, exploreIndex });
        }
        if (stageEl) {
            stageEl.textContent = buildSearchStageLabel(index, topIndex, anchorIndex, exploreIndex);
        }
    });
}
