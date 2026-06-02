import { state } from '../state.js';
import { getBusinessNamePresentation, sanitizePublicFacingNote } from './utils/dom-formatters.js';

/**
 * focus-stage-renderer.js
 *
 * Dedicated module for rendering components within the "Focus Stage" business detail card.
 */

// ── Viewport helper (private) ──────────────────────────────────────────────────

let _switchView = () => {};

export function initFocusStageRendererAdapter({ switchView } = {}) {
    if (typeof switchView === 'function') _switchView = switchView;
}

// ── Renderers ──────────────────────────────────────────────────────────────────

export function renderSignalBadges(point) {
    if (state.currentView === 'map') return '';
    if (!point) return '';
    const badges = [];
    if (point.website) badges.push('<span class="signal-badge meta" title="Website">Website</span>');
    if (point.email) badges.push('<span class="signal-badge fact" title="Email">Email</span>');
    if (point.phone) badges.push('<span class="signal-badge ai" title="Phone">Phone</span>');
    return badges.join('');
}

export function updateSelectedCardHeading(point = null) {
    const titleEl = document.getElementById('selected-card-title');
    if (!titleEl) return;

    const activePoint = point || state.selectedPoint || null;
    const activeIndex = activePoint && Array.isArray(state.points)
        ? state.points.indexOf(activePoint)
        : -1;
    const summary = state.currentSearchSummary || {};
    const resultIndices = Array.isArray(summary.resultIndices) ? summary.resultIndices : [];

    if (!activePoint) {
        titleEl.textContent = state.currentView === 'map' ? 'Map Selection' : 'Focused Business';
    } else if (Number.isFinite(summary.anchorIndex) && activeIndex === summary.anchorIndex) {
        titleEl.textContent = 'Search Anchor';
    } else if (resultIndices.includes(activeIndex)) {
        titleEl.textContent = 'Related Match';
    } else if (state.currentView === 'map') {
        titleEl.textContent = 'Map Selection';
    } else {
        titleEl.textContent = 'Focused Business';
    }
}

export function renderSelectedMetaStrip(point) {
    const el = document.getElementById('selected-meta-strip');
    if (!el) return;
    if (state.currentView === 'map') { el.style.display = 'none'; return; }
    if (!point) { el.textContent = ''; el.style.display = 'none'; return; }
    el.style.display = '';
    const rawCity = point.city ? point.city.trim() : null;
    const rawStatus = point.status ? point.status.trim() : null;
    const cityPart = rawCity === '-' || rawCity === '' ? null : rawCity;
    const statusPart = rawStatus === '-' || rawStatus === '' ? null : rawStatus;
    if (cityPart && statusPart) {
        el.textContent = `${cityPart} — ${statusPart}`;
    } else if (cityPart) {
        el.textContent = cityPart;
    } else if (statusPart) {
        el.textContent = statusPart;
    } else {
        el.textContent = 'Montgomery County';
    }
}

export function renderSelectedMatchPanel(point) {
    const panelEl = document.getElementById('selected-match-panel');
    const copyEl = document.getElementById('selected-match-copy');
    if (!panelEl || !copyEl) return;
    const panelSurface = document.body?.dataset?.panelSurface || '';
    if (state.currentView === 'map' && panelSurface !== 'map-focus-search') { panelEl.style.display = 'none'; return; }
    if (!point) return;
    if (state.currentSearchSummary?.anchorIndex !== undefined) {
        const idx = state.points.indexOf(point);
        if (idx === state.currentSearchSummary.anchorIndex) {
            panelEl.style.display = '';
            copyEl.textContent = 'This record is the semantic search anchor - the starting point for the current connection trail.';
        } else if ((state.currentSearchSummary.resultIndices || []).includes(idx)) {
            panelEl.style.display = '';
            copyEl.textContent = 'This record appeared in the semantic search results as a nearby connection.';
        } else if (panelSurface === 'map-focus-search') {
            panelEl.style.display = '';
            copyEl.textContent = 'This record is connected to the current semantic search trail.';
        } else {
            panelEl.style.display = 'none';
        }
    } else {
        if (panelSurface === 'map-focus-search') {
            panelEl.style.display = '';
            copyEl.textContent = 'This record is connected to the current semantic search trail.';
        } else {
            panelEl.style.display = 'none';
        }
    }
}

export function renderSelectedActionRow(point) {
    const el = document.getElementById('selected-action-row');
    if (!el) return;
    if (state.currentView === 'map') { el.style.display = 'none'; return; }
    if (!point) return;
    el.style.display = '';
    el.innerHTML = '<button class="action-btn" id="btn-selected-map" type="button">View on Map</button>';
    const btn = document.getElementById('btn-selected-map');
    if (btn) {
        btn.addEventListener('click', () => {
            _switchView('map');
        });
    }
}

function setSurfaceHidden(el, hidden) {
    if (!el) return;
    if (hidden) {
        el.hidden = true;
        el.setAttribute('aria-hidden', 'true');
        el.style.display = 'none';
    } else {
        el.hidden = false;
        el.setAttribute('aria-hidden', 'false');
        el.style.display = '';
    }
}

function getSelectedMapSummaryRole(point) {
    if (!point || !Array.isArray(state.points)) return 'Trail match';
    const idx = state.points.indexOf(point);
    const summary = state.currentSearchSummary || {};
    if (Number.isFinite(summary.anchorIndex) && idx === summary.anchorIndex) return 'Search anchor';
    if (Array.isArray(summary.resultIndices) && summary.resultIndices.includes(idx)) return 'Related match';
    return 'Trail match';
}

function getSelectedMapSummaryCopy(point) {
    if (!point || !Array.isArray(state.points)) return 'This record is connected to the current semantic search trail.';
    const idx = state.points.indexOf(point);
    const summary = state.currentSearchSummary || {};
    if (Number.isFinite(summary.anchorIndex) && idx === summary.anchorIndex) {
        return 'This record anchors the current semantic trail on the county map.';
    }
    if (Array.isArray(summary.resultIndices) && summary.resultIndices.includes(idx)) {
        return 'This record appeared as a nearby semantic match in the current trail.';
    }
    return 'This record is connected to the current semantic search trail.';
}

export function syncSelectedCardContentVariant(point = null) {
    const cardEl = document.getElementById('selected-card');
    const emptyEl = document.getElementById('selected-empty');
    const detailsEl = document.getElementById('selected-details');
    const titleEl = document.getElementById('selected-card-title');
    const summaryEl = document.getElementById('selected-map-summary');
    const surface = document.body?.dataset?.panelSurface || '';
    const isMapSummary = Boolean(point) && state.currentView === 'map' && surface === 'map-focus-search';

    if (cardEl) {
        cardEl.dataset.contentVariant = isMapSummary ? 'map-summary' : (point ? 'detail' : 'empty');
        cardEl.dataset.contentOwner = isMapSummary ? 'selected-map-summary' : 'selected-detail-card';
    }

    setSurfaceHidden(summaryEl, !isMapSummary);
    setSurfaceHidden(titleEl, isMapSummary);

    if (point) {
        setSurfaceHidden(detailsEl, isMapSummary);
        if (emptyEl) setSurfaceHidden(emptyEl, true);
    } else {
        setSurfaceHidden(detailsEl, true);
        if (emptyEl) setSurfaceHidden(emptyEl, false);
    }

    if (!isMapSummary) {
        return;
    }

    const presentation = getBusinessNamePresentation(point.name);
    const nameEl = document.getElementById('selected-map-summary-name');
    const whatEl = document.getElementById('selected-map-summary-what');
    const roleEl = document.getElementById('selected-map-summary-role');
    const kickerEl = document.getElementById('selected-map-summary-kicker');
    const matchCopyEl = document.getElementById('selected-map-summary-match-copy');

    if (nameEl) nameEl.textContent = presentation.display;
    if (whatEl) whatEl.textContent = sanitizePublicFacingNote(point.what) || 'Montgomery County business record';
    if (roleEl) roleEl.textContent = getSelectedMapSummaryRole(point);
    if (kickerEl) kickerEl.textContent = 'Map trail match';
    if (matchCopyEl) matchCopyEl.textContent = getSelectedMapSummaryCopy(point);
}

/**
 * Filter business trivia, suppressing placeholders and internal metadata.
 */
export function getInterestingBusinessNote(point) {
    if (!point) return null;
    if (point.trivia) {
        const t = point.trivia.trim();
        if (t === 'Pending research.' || t === 'Pending research') return null;
        if (t.includes('SearXNG') || t.includes('Insufficient evidence')) return null;
        if (t.includes('exact entity name') || t.includes('verified official') || t.includes('entity confirmed') || t.includes('Registry-only') || t.includes('FMCSA carrier') || t.includes('USDOT') || t.includes('SAFER snapshot') || t.includes('Texas Comptroller')) return null;
        if (t.includes('Research check') || t.includes('MapQuest') || t.includes('GoDaddy') || t.includes('WordPress site on Cloudflare') || t.includes('Hotel page is active') || t.includes('Local dirt track') || t.includes('carrier records') || t.includes('carrier lookup') || t.includes('via carrier') || t.includes('via lookup') || t.includes('contact found') || t.includes('Verified phone') || t.includes('Verified email')) return null;
        if (t.includes('formerly ') || t.includes('formerly known') || t.includes('renamed') || t.includes('rebranded as')) return null;
        if (t.includes('retail chain location') || t.includes('brand location') || t.includes('chain location')) return null;
        if (t.includes('operating as') || t.includes('operated as') || t.includes('dba') || t.includes('also known as') || t.includes('doing business as')) return null;
        if (t.includes('Disqualified') || t.includes('SKIP') || t.includes('DO NOT') || t.includes('REDACTED') || t.includes(' Omits ')) return null;
        if (t.includes('NAICS') || t.includes('**Industry**') || t.includes('**Service**') || t.includes('SIC ') || t.includes('SIC:')) return null;
        if (t.includes('New lead profile') || t.includes('directory:') || t.includes('from directory') || t.includes('created from')) return null;
        if (t.toLowerCase().startsWith('no ') || t.toLowerCase().startsWith('none') || t.toLowerCase().startsWith('no verifiable') || t.toLowerCase().startsWith('unable to') || t.toLowerCase().startsWith('could not')) return null;
        if (t.length < 20) return null;
        if (t === 'Has both email and phone.') return null;
        if (t === 'Website only — no direct contact on file.') return null;
        return t;
    }
    if (point.email && point.phone) return null;
    if (point.website && !point.email && !point.phone) return null;
    return null;
}

/**
 * Build selected match narrative copy.
 */
export function buildSelectedMatchNarrative(point) {
    if (!point) return '';
    if (state.currentSearchSummary?.reason) return state.currentSearchSummary.reason;
    return '';
}
