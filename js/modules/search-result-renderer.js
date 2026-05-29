import { state } from '../state.js';
import { getViewportSize } from './environment.js';
import {
    describeCluster,
    escapeHtml,
    formatBusinessName,
    highlightMatch,
    sanitizePublicFacingNote,
    cleanPublicNoteText,
    isCompactSearchViewport
} from '../utils.js';

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

function compactSearchSnippetText(value, max = 128) {
    const clean = sanitizePublicFacingNote(value);
    if (!clean || clean.length <= max) return clean || '';
    const slice = clean.slice(0, max + 1);
    const boundary = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf(', '), slice.lastIndexOf(' '));
    const cutAt = boundary > Math.floor(max * 0.62) ? boundary : max;
    return `${slice.slice(0, cutAt).replace(/[,\s;:.]+$/, '')}...`;
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

function buildSearchContactBadge(type, label, iconPath) {
    return `
        <span class="search-result-badge ${type}" title="${label}" aria-label="${label}">
            <svg class="search-result-badge-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                ${iconPath}
            </svg>
        </span>
    `;
}

// ─── SEARCH RENDERERS ────────────────────────────────────────────────────────

export function getSearchResultStrength(result, topScore) {
    if (!Number.isFinite(topScore) || topScore <= 0) return 14;
    if (!Number.isFinite(result?.score)) return 14;
    return Math.max(14, Math.min(100, Math.round((result.score / topScore) * 100)));
}

export function getSearchResultStrengthLabel(order, strength) {
    if (order === 0) return 'Search Anchor';
    if (strength >= 90) return 'High Synergy';
    if (strength >= 75) return 'Strong Signal';
    if (strength >= 50) return 'Related Link';
    return 'Broad Match';
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

export function buildSearchResultItemHtml(result, order, renderContext) {
    const { trimmedQuery, topIndex, anchorIndex, topScore } = renderContext;
    const strength = getSearchResultStrength(result, topScore);
    const strengthLabel = getSearchResultStrengthLabel(order, strength);
    const isAnchor = anchorIndex !== null && anchorIndex !== undefined && result.index === anchorIndex;
    const rankLabel = buildSearchRankLabel({ index: result.index, order, topIndex, anchorIndex });
    const cardClasses = getSearchResultCardClasses(order, isAnchor);
    const snippetText = buildSearchResultSnippet(result);
    const detailText = escapeHtml(snippetText);
    const contextText = `${describeCluster(result.point.cluster)} · ${result.point.city ? result.point.city.trim() : 'Location unknown'}`;
    const clusterText = escapeHtml(contextText);

    const badges = [];
    if (result.point.website) {
        badges.push(buildSearchContactBadge('website', 'Website available', '<circle cx="12" cy="12" r="9"></circle><path d="M3 12h18"></path><path d="M12 3a13.5 13.5 0 0 1 0 18"></path><path d="M12 3a13.5 13.5 0 0 0 0 18"></path>'));
    }
    if (result.point.email) {
        badges.push(buildSearchContactBadge('email', 'Email available', '<rect x="3.5" y="5.5" width="17" height="13" rx="2"></rect><path d="m4.5 7 7.5 6 7.5-6"></path>'));
    }
    if (result.point.phone) {
        badges.push(buildSearchContactBadge('phone', 'Phone available', '<path d="M7.5 4.5 10 7 8.4 9.1c1 2.2 2.3 3.5 4.5 4.5L15 12l2.5 2.5-.8 3.1c-.2.7-.9 1.1-1.6 1A12.5 12.5 0 0 1 5.4 8.9c-.1-.7.3-1.4 1-1.6l1.1-.3Z"></path>'));
    }
    const badgesHtml = badges.length ? `<div class="search-result-badges">${badges.join('')}</div>` : '';

    return `
        <div class="search-result-listitem" role="listitem">
        <button class="${cardClasses}" id="search-result-${Number(result.index)}" data-index="${Number(result.index)}" data-order="${order}" type="button" tabindex="0"
            aria-label="${escapeHtml(`Focus ${formatBusinessName(result.point.name)}. ${rankLabel}. ${snippetText} ${contextText}.`)}"
            style="animation-delay:${Math.min(order * 32, 224)}ms">
            <div class="search-result-row">
                <div class="search-result-rank">${rankLabel}</div>
                <div class="search-result-name">${highlightMatch(formatBusinessName(result.point.name), trimmedQuery)}</div>
                ${badgesHtml}
            </div>
            <div class="search-result-what">${detailText}</div>
            <div class="search-result-context">${clusterText}</div>
            <div class="search-result-meta">
                <div class="search-result-stage">${buildSearchStageLabel(result.index, topIndex, anchorIndex)}</div>
                <div class="search-result-strength">${strengthLabel}</div>
            </div>
            <div class="search-result-bar"><span style="width:${strength}%"></span></div>
        </button>
        </div>
    `;
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
    const effectiveIndex = isCommittedExplore && Number.isFinite(state.navState.focusedIndex) ? state.navState.focusedIndex : activeIndex;
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
