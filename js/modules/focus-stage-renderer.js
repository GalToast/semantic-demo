import { state } from '../state.js';
import { publish, EVENTS } from './event-bus.js';
import { getBusinessNamePresentation, sanitizePublicFacingNote } from './utils/dom-formatters.js';
import { getPanelSurface, isMapSummarySurface } from './environment.js';

/**
 * focus-stage-renderer.js
 *
 * Dedicated module for rendering components within the "Focus Stage" business detail card.
 */

// ── Renderers ──────────────────────────────────────────────────────────────────

export function renderSignalBadges(point) {
    if (state.currentView === 'map') return '';
    if (!point) return '';
    const badges = [];
    if (point.website) badges.push('<span class="signal-badge meta" title="Website present">Website present</span>');
    if (point.email) badges.push('<span class="signal-badge fact" title="Email present">Email present</span>');
    if (point.phone) badges.push('<span class="signal-badge ai" title="Phone present">Phone present</span>');
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
        titleEl.textContent = state.currentView === 'map' ? 'Map Selection' : 'Selection';
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
    if (state.currentView === 'map') { el.hidden = true; return; }
    if (!point) { el.textContent = ''; el.hidden = true; return; }
    el.hidden = false;
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
    if (state.currentView === 'map' && !isMapSummarySurface()) { panelEl.hidden = true; return; }
    if (!point) return;
    if (state.currentSearchSummary?.anchorIndex !== undefined) {
        const idx = state.points.indexOf(point);
        if (idx === state.currentSearchSummary.anchorIndex) {
            panelEl.hidden = false;
            copyEl.textContent = 'This record is the semantic search anchor - the starting point for the current connection trail.';
        } else if ((state.currentSearchSummary.resultIndices || []).includes(idx)) {
            panelEl.hidden = false;
            copyEl.textContent = 'This record appeared in the semantic search results as a nearby connection.';
        } else if (isMapSummarySurface()) {
            panelEl.hidden = false;
            copyEl.textContent = 'This record is connected to the current semantic search trail.';
        } else {
            panelEl.hidden = true;
        }
    } else {
        if (isMapSummarySurface()) {
            panelEl.hidden = false;
            copyEl.textContent = 'This record is connected to the current semantic search trail.';
        } else {
            panelEl.hidden = true;
        }
    }
}

export function renderSelectedActionRow(point) {
    const el = document.getElementById('selected-action-row');
    if (!el) return;
    if (state.currentView === 'map') { el.hidden = true; return; }
    if (!point) return;
    el.hidden = false;
    el.innerHTML = '<button class="action-btn" id="btn-selected-map" type="button">View on Map</button>';
    const btn = document.getElementById('btn-selected-map');
    if (btn) {
        btn.addEventListener('click', () => {
            publish(EVENTS.VIEW_CHANGE_REQUESTED, { view: 'map' });
        });
    }
}

function setSurfaceHidden(el, hidden) {
    if (!el) return;
    if (hidden) {
        el.hidden = true;
        el.setAttribute('aria-hidden', 'true');
    } else {
        el.hidden = false;
        el.setAttribute('aria-hidden', 'false');
    }
}

function scheduleFrame(callback) {
    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(callback);
        return;
    }
    setTimeout(callback, 0);
}

export function triggerSelectedCardFade(cardEl) {
    if (!cardEl) return;
    cardEl.style.setProperty('--selected-card-fade-ms', `${state.SELECTED_CARD_FADE_MS}ms`);
    cardEl.classList.add('is-fading');
    scheduleFrame(() => {
        scheduleFrame(() => {
            cardEl.classList.remove('is-fading');
        });
    });
}

function focusStageOwnsSelectedContent(surface) {
    return state.currentView === 'galaxy'
        && ['focus', 'focus-search', 'semantic-dive'].includes(surface);
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
    const cascadeEl = document.getElementById('vector-cascade-bg');
    const surface = getPanelSurface();
    const isMapSummary = Boolean(point) && state.currentView === 'map' && isMapSummarySurface();
    const isFocusStageOwner = Boolean(point) && focusStageOwnsSelectedContent(surface);

    if (cardEl) {
        const isEmpty = !point && !isMapSummary;
        cardEl.dataset.contentVariant = isFocusStageOwner ? 'focus-stage' : isMapSummary ? 'map-summary' : (point ? 'detail' : 'empty');
        cardEl.dataset.contentOwner = isFocusStageOwner ? 'focus-stage' : isMapSummary ? 'selected-map-summary' : 'selected-detail-card';
        if (isFocusStageOwner || isEmpty) {
            // Empty / focus-stage variants carry only placeholder H3s ("Business
            // Name", "Semantic Connection Path"). Inert keeps them out of the
            // heading outline and tab order until a real point is selected.
            cardEl.setAttribute('aria-hidden', 'true');
            cardEl.inert = true;
        } else if (isMapSummary) {
            cardEl.removeAttribute('aria-hidden');
            cardEl.inert = false;
            triggerSelectedCardFade(cardEl);
        } else {
            cardEl.removeAttribute('aria-hidden');
            cardEl.inert = false;
        }
    }

    if (cascadeEl) {
        const suppressCascade = isFocusStageOwner || isMapSummary || !point;
        cascadeEl.hidden = suppressCascade;
        if (suppressCascade) {
            cascadeEl.classList.remove('active');
            cascadeEl.innerHTML = '';
        }
    }

    if (isFocusStageOwner) {
        setSurfaceHidden(summaryEl, true);
        setSurfaceHidden(titleEl, true);
        setSurfaceHidden(detailsEl, true);
        if (emptyEl) setSurfaceHidden(emptyEl, true);
        return;
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
export const TRIVIA_BLOCKLIST = Object.freeze({
    exact: Object.freeze([
        'Pending research.',
        'Pending research'
    ]),
    equals: Object.freeze([
        'Has both email and phone.',
        'Website only — no direct contact on file.'
    ]),
    prefixes: Object.freeze([
        'no ',
        'none',
        'no verifiable',
        'unable to',
        'could not'
    ]),
    substrings: Object.freeze([
        'SearXNG',
        'Insufficient evidence',
        'exact entity name',
        'verified official',
        'entity confirmed',
        'Registry-only',
        'FMCSA carrier',
        'USDOT',
        'SAFER snapshot',
        'Texas Comptroller',
        'Research check',
        'MapQuest',
        'GoDaddy',
        'WordPress site on Cloudflare',
        'Hotel page is active',
        'Local dirt track',
        'carrier records',
        'carrier lookup',
        'via carrier',
        'via lookup',
        'contact found',
        'Verified phone',
        'Verified email',
        'formerly ',
        'formerly known',
        'renamed',
        'rebranded as',
        'retail chain location',
        'brand location',
        'chain location',
        'operating as',
        'operated as',
        'dba',
        'also known as',
        'doing business as',
        'Disqualified',
        'SKIP',
        'DO NOT',
        'REDACTED',
        ' Omits ',
        'NAICS',
        '**Industry**',
        '**Service**',
        'SIC ',
        'SIC:',
        'New lead profile',
        'directory:',
        'from directory',
        'created from'
    ]),
    minLength: 20
});

export function rejectsTrivia(trivia = '') {
    const trimmed = String(trivia || '').trim();
    if (!trimmed) return true;
    if (TRIVIA_BLOCKLIST.exact.includes(trimmed)) return true;
    if (TRIVIA_BLOCKLIST.equals.includes(trimmed)) return true;
    if (trimmed.length < TRIVIA_BLOCKLIST.minLength) return true;
    const lower = trimmed.toLowerCase();
    if (TRIVIA_BLOCKLIST.prefixes.some((prefix) => lower.startsWith(prefix))) return true;
    return TRIVIA_BLOCKLIST.substrings.some((substring) => trimmed.includes(substring));
}

export function getInterestingBusinessNote(point) {
    if (!point) return null;
    // Bug Sweep 33: prefer the lead's own one-liner from the enrichment
    // (snapshot > business_overview > observations) over the database
    // trivia field, which is often database noise.
    if (state.leadEnrichment) {
        const enr = state.leadEnrichment[String(point.lead_id)];
        if (enr) {
            const candidates = [
                enr.snapshot,
                enr.business_overview_extended,
                enr.business_overview,
                enr.observations
            ];
            for (const c of candidates) {
                if (c && !rejectsTrivia(c)) return c.trim();
            }
        }
    }
    if (point.trivia) {
        const t = point.trivia.trim();
        if (rejectsTrivia(t)) return null;
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
