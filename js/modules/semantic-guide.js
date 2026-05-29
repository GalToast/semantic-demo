import { state } from '../state.js';
import { escapeHtml } from './utils/dom-formatters.js';
import { buildSemanticGuideRequestPayload } from './semantic-guide-payload.js';
import { search, beginSearchFocusTransition } from './search-state.js';
import {updateLegendGuideState} from './legend-ui.js';
import {showSemanticThreadsDetail} from './connection-analysis.js';

// === Semantic Guide Summary Card ===

function getMostFrequent(values) {
    if (!values?.length) return null;
    const counts = values.reduce((acc, value) => {
        acc[value] = (acc[value] || 0) + 1;
        return acc;
    }, {});
    return Object.keys(counts).reduce((a, b) => (counts[a] > counts[b] ? a : b));
}

function generateLogicalSynthesis(payload) {
    const results = Array.isArray(payload?.results) ? payload.results : [];
    if (!results.length) return 'Search opens a trail — explore the neighborhood below.';

    const query = payload.query || 'this search';
    const clusters = results.map((row) => row.cluster_label).filter(Boolean);
    const cities = [...new Set(results.map((row) => row.city).filter(Boolean))];
    const topCluster = clusters.length ? getMostFrequent(clusters) : 'mixed themes';
    const citySummary =
        cities.length > 1 ? `${cities.length} cities including ${cities.slice(0, 2).join(' and ')}` : cities[0] || 'Montgomery County';

    return `Logical mapping of ${payload.visible_matches || results.length} matches for "${query}". Strongest thematic overlap in ${topCluster} with signal across ${citySummary}. Trail anchored by ${results[0]?.name || 'the primary match'}.`;
}

function buildClientSemanticGuideFallback(payload) {
    const results = Array.isArray(payload?.results) ? payload.results : [];
    const anchor = results.find((row) => String(row.lead_id) === String(payload?.anchor_lead_id)) || results[0] || null;
    const suggestions = results.slice(0, 3).map((row, index) => ({
        lead_id: row.lead_id,
        label: index === 0 ? 'Trail anchor' : index === 1 ? 'Next stop' : 'Side trail',
        name: row.name,
        city: row.city || '',
        reason:
            index === 0
                ? 'Start with the strongest semantic anchor.'
                : row.cluster_label
                  ? `Follow the ${row.cluster_label} trail.`
                  : 'Keep exploring the current semantic neighborhood.'
    }));

    return {
        title: anchor?.name ? `${anchor.name} anchors this trail` : `Guide for "${payload?.query || 'this trail'}"`,
        summary: generateLogicalSynthesis(payload),
        suggestions,
        degraded: true,
        cached: false,
        source: 'deterministic',
        mode: 'fallback'
    };
}

export function semanticGuideIcon(id, label = '') {
    return `<svg class="ui-icon" aria-hidden="${label ? 'false' : 'true'}"${label ? ` aria-label="${escapeHtml(label)}"` : ''}><use href="#icon-${escapeHtml(id)}"></use></svg>`;
}

function getSemanticGuideButtonHtml(mode = 'ready') {
    if (mode === 'loading') return `<span class="sparkle">${semanticGuideIcon('trail-bloom')}</span> Reading connections...`;
    if (mode === 'refresh') return `<span class="sparkle">${semanticGuideIcon('trail-bloom')}</span> Refresh Suggestions`;
    return `<span class="sparkle">${semanticGuideIcon('trail-bloom')}</span> Summarize Results<span class="guide-btn-hint"> — explain the strongest connections</span>`;
}

export function setSemanticGuideButtonState(button, mode = 'ready', options = {}) {
    if (!button) return;
    const isLoading = mode === 'loading';
    button.disabled = Object.prototype.hasOwnProperty.call(options, 'disabled') ? !!options.disabled : isLoading;
    button.classList.toggle('is-loading', isLoading);
    button.innerHTML = getSemanticGuideButtonHtml(mode);
}

function getSemanticGuideLoadingCardConfig() {
    return {
        title: 'READING CONNECTIONS',
        text: 'The semantic guide is reading this neighborhood and preparing the next three strongest stops.',
        suggestions: [],
        laneStatus: 'Preparing trail',
        instant: true
    };
}

export function getSemanticGuideTitle(guide = {}) {
    if (guide.title) return String(guide.title).toUpperCase();
    if (guide.degraded) return 'FAST FALLBACK';
    if (guide.cached) return 'SAVED SUMMARY';
    return 'SEARCH SUMMARY';
}

function getSemanticGuideLaneStatus(guide = {}) {
    if (guide.degraded) return 'Quick summary ready';
    return guide.cached ? 'Saved summary' : 'Fresh summary';
}

function buildSemanticGuideCardConfig(guide = {}) {
    return {
        title: getSemanticGuideTitle(guide),
        text: guide.summary || 'The current neighborhood is ready.',
        suggestions: guide.suggestions || [],
        laneStatus: getSemanticGuideLaneStatus(guide)
    };
}

function buildSemanticGuideFallbackCardConfig(fallback = {}) {
    return {
        title: (fallback.title || 'FAST FALLBACK').toUpperCase(),
        text: fallback.summary || 'Search opens a trail — explore the neighborhood below.',
        suggestions: fallback.suggestions || [],
        laneStatus: 'Deterministic fallback active',
        instant: true
    };
}

function normalizeSummarySuggestions(items = []) {
    return Array.isArray(items) ? items.filter((item) => item && item.lead_id) : [];
}

function getSummarySuggestionIcon(label = '') {
    if (label === 'Trail anchor') return semanticGuideIcon('guide', 'Trail anchor');
    if (label === 'Next stop') return semanticGuideIcon('arrow-right', 'Next stop');
    return semanticGuideIcon('mycelium', 'Related record');
}

function buildSummarySuggestionButtonHtml(item = {}) {
    const label = item.label || 'Related record';
    const name = item.name || 'Open record';
    return `
        <button class="suggestion-btn" type="button" data-lead-id="${escapeHtml(String(item.lead_id))}" data-name="${escapeHtml(name)}" aria-label="${escapeHtml(label)}: ${escapeHtml(name)}">
            <span>${getSummarySuggestionIcon(item.label)}</span>
            <span class="suggestion-copy">
                <span class="suggestion-label">${escapeHtml(label)}</span>
                <span class="suggestion-name">${escapeHtml(name)}</span>
                <span class="suggestion-reason">${escapeHtml(item.reason || '')}</span>
            </span>
        </button>
    `;
}

function focusSummarySuggestion(leadId, sourceEl = null) {
    const targetIndex = state.pointIndexByLeadId?.get?.(String(leadId));
    const resultsEl = document.getElementById('search-results');
    const statusEl = document.getElementById('search-status');
    // During degraded state (no active search), use the suggestion's name to trigger a search
    if (!state.currentSearchSummary) {
        const name = sourceEl?.dataset?.name || '';
        if (name) {
            search(name);
            return true;
        }
        return false;
    }
    if (targetIndex === undefined || !resultsEl || !statusEl) return false;
    const point = state.points[targetIndex];
    if (!point) return false;
    beginSearchFocusTransition(resultsEl, statusEl, state.currentSearchSummary.resultIndices, targetIndex, point, sourceEl);
    return true;
}

function bindSummarySuggestionClicks(suggestionsEl) {
    if (!suggestionsEl) return;
    suggestionsEl.querySelectorAll('[data-lead-id]').forEach((button) => {
        button.onclick = () => focusSummarySuggestion(button.dataset.leadId, button);
    });
}

function renderSummarySuggestions(suggestionsEl, items = []) {
    if (!suggestionsEl) return;
    const suggestions = normalizeSummarySuggestions(items);
    suggestionsEl.innerHTML = suggestions.map(buildSummarySuggestionButtonHtml).join('');
    bindSummarySuggestionClicks(suggestionsEl);
}

function getSummaryCardElements() {
    const card = document.getElementById('semantic-summary-card');
    const textEl = document.getElementById('summary-text');
    const suggestions = document.getElementById('summary-suggestions');
    const titleEl = document.getElementById('summary-card-title-text');
    const laneStatusEl = document.getElementById('summary-lane-status');

    return {
        card,
        textEl,
        suggestions,
        titleEl,
        laneStatusEl,
        isReady: !!(card && textEl && suggestions)
    };
}

function normalizeSummaryCardConfig(config = {}) {
    const settings = typeof config === 'string' ? { text: config } : config || {};
    return {
        ...settings,
        text: String(settings.text || ''),
        title: String(settings.title || 'Search').trim() || 'Search',
        laneStatus: String(settings.laneStatus || 'Ready').trim() || 'Ready',
        suggestions: Array.isArray(settings.suggestions) ? settings.suggestions : [],
        instant: !!settings.instant
    };
}

function setSummaryCardVisibility(elements, isVisible) {
    if (!elements?.card) return;
    if (isVisible) elements.card.hidden = false;
    elements.card.classList.toggle('hidden', !isVisible);
    elements.card.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
    if (!isVisible) elements.card.hidden = true;
}

function getSummaryTrailStoryElements() {
    const note = document.getElementById('summary-gemma-story') || document.getElementById('summary-trail-story');
    return {
        note,
        text: document.getElementById('summary-gemma-story-text') || document.getElementById('summary-trail-story-text'),
        source: document.getElementById('summary-gemma-story-source') || document.getElementById('summary-trail-story-source'),
        isReady: !!note
    };
}

function hideSummaryTrailStoryNote() {
    const elements = getSummaryTrailStoryElements();
    if (!elements.isReady) return;
    elements.note.classList.add('hidden');
    elements.note.setAttribute('aria-hidden', 'true');
    if (elements.text) elements.text.textContent = '';
    if (elements.source) elements.source.textContent = '';
}

function resetSummaryCardContent(elements, settings) {
    elements.card.classList.remove('is-synthesizing');
    elements.textEl.textContent = '';
    hideSummaryTrailStoryNote();
    elements.suggestions.classList.remove('active');
    renderSummarySuggestions(elements.suggestions, settings.suggestions);
    if (elements.titleEl) elements.titleEl.textContent = settings.title;
    if (elements.laneStatusEl) elements.laneStatusEl.textContent = settings.laneStatus;
}

function revealSummaryCardSuggestions(elements, suggestions = []) {
    if (suggestions.length) elements.suggestions.classList.add('active');
}

function typeSummaryCardText(elements, text, suggestions, typeToken) {
    let index = 0;
    const speed = 16;

    function type() {
        if (typeToken !== state.summaryCardTypeToken) return;
        if (index < text.length) {
            elements.textEl.textContent += text.charAt(index);
            index += 1;
            window.setTimeout(type, speed);
        } else {
            revealSummaryCardSuggestions(elements, suggestions);
        }
    }

    type();
}

export function showSummaryCard(config = {}) {
    const elements = getSummaryCardElements();
    if (!elements.isReady) return;
    const settings = normalizeSummaryCardConfig(config);
    state.currentSemanticGuide = settings;
    state.summaryCardTypeToken = (state.summaryCardTypeToken || 0) + 1;
    const typeToken = state.summaryCardTypeToken;

    setSummaryCardVisibility(elements, true);
    resetSummaryCardContent(elements, settings);

    if (settings.instant) {
        elements.textEl.textContent = settings.text;
        revealSummaryCardSuggestions(elements, settings.suggestions);
        return;
    }

    typeSummaryCardText(elements, settings.text, settings.suggestions, typeToken);
}

export function hideSummaryCard() {
    state.summaryCardTypeToken = (state.summaryCardTypeToken || 0) + 1;
    hideSummaryTrailStoryNote();
    const elements = getSummaryCardElements();
    if (elements.suggestions) {
        elements.suggestions.innerHTML = '';
        elements.suggestions.classList.remove('active');
    }
    setSummaryCardVisibility(elements, false);
}

function getSemanticGuideTimeoutMs() {
    // Keep the production default fixed, with a call-time override for deterministic harness runs.
    if (typeof window !== 'undefined' && typeof window.__SEMANTIC_GUIDE_TIMEOUT_MS__ === 'number' && window.__SEMANTIC_GUIDE_TIMEOUT_MS__ > 0) {
        return window.__SEMANTIC_GUIDE_TIMEOUT_MS__;
    }
    return 30000;
}

async function fetchSemanticGuide(payload, signal) {
    const timeoutController = new AbortController();
    let timedOut = false;
    const timeoutMs = getSemanticGuideTimeoutMs();
    const timeoutId = window.setTimeout(() => {
        timedOut = true;
        timeoutController.abort();
    }, timeoutMs);
    const abortFromRequest = () => timeoutController.abort(signal?.reason);

    if (signal?.aborted) {
        abortFromRequest();
    } else {
        signal?.addEventListener('abort', abortFromRequest, { once: true });
    }

    let response;
    try {
        response = await fetch('api.php?action=semantic_guide', {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json'
            },
            cache: 'no-store',
            body: JSON.stringify(payload),
            signal: timeoutController.signal
        });
    } catch (error) {
        if (timedOut) {
            const timeoutError = new Error('Guide response timed out. Showing a local summary instead.');
            Object.defineProperty(timeoutError, 'correlationId', { value: crypto.randomUUID(), writable: false, configurable: true });
            throw timeoutError;
        }
        throw error;
    } finally {
        window.clearTimeout(timeoutId);
        signal?.removeEventListener('abort', abortFromRequest);
    }

    let result;
    try {
        result = await response.json();
    } catch (jsonErr) {
        Object.defineProperty(jsonErr, 'correlationId', { value: crypto.randomUUID(), writable: false, configurable: true });
        throw new Error('Guide response returned invalid JSON.', { cause: jsonErr });
    }

    if (!response.ok || !result?.ok) {
        const err = new Error(result?.error || 'Guide response is unavailable right now.');
        Object.defineProperty(err, 'correlationId', { value: crypto.randomUUID(), writable: false, configurable: true });
        throw err;
    }

    return result;
}

function startSemanticGuideRequest(button) {
    if (state.semanticGuideAbortController) {
        state.semanticGuideAbortController.abort();
        state.semanticGuideAbortController = null;
    }
    const requestId = (state.semanticGuideRequestSequence = (state.semanticGuideRequestSequence || 0) + 1);
    const controller = new AbortController();
    state.semanticGuideAbortController = controller;
    setSemanticGuideButtonState(button, 'loading');

    const card = document.getElementById('semantic-summary-card');
    if (card) card.classList.add('is-synthesizing');
    showSummaryCard(getSemanticGuideLoadingCardConfig());
    if (card) card.classList.add('is-synthesizing');

    return { requestId, controller };
}

function isSemanticGuideRequestCurrent(requestId) {
    return requestId === state.semanticGuideRequestSequence;
}

function isSemanticGuideRequestCancelled(requestId, controller) {
    return controller.signal.aborted || !isSemanticGuideRequestCurrent(requestId);
}

function showSemanticGuideSuccess(guide) {
    showSummaryCard(buildSemanticGuideCardConfig(guide));
}

function showSemanticGuideFailure(payload, error) {
    const card = document.getElementById('semantic-summary-card');
    if (card) card.classList.remove('is-synthesizing');
    hideSummaryTrailStoryNote();
    const fallback = buildClientSemanticGuideFallback(payload, error?.message || 'Guide response is still warming up.');
    showSummaryCard(buildSemanticGuideFallbackCardConfig(fallback));
}

function finishSemanticGuideRequest(controller, button) {
    if (state.semanticGuideAbortController === controller) {
        state.semanticGuideAbortController = null;
    }
    setSemanticGuideButtonState(button, 'refresh', { disabled: false });
    if (typeof updateLegendGuideState === 'function') updateLegendGuideState();
}

function ensureSemanticGuideCorrelationId(error) {
    if (!error || Object.prototype.hasOwnProperty.call(error, 'correlationId')) return;
    Object.defineProperty(error, 'correlationId', { value: crypto.randomUUID(), writable: false, configurable: true });
}

export async function requestSemanticGuide() {
    const payload = buildSemanticGuideRequestPayload();
    const button = document.getElementById('btn-synthesize');
    if (!payload) return;

    const { requestId, controller } = startSemanticGuideRequest(button);

    try {
        const guide = await fetchSemanticGuide(payload, controller.signal);
        if (!isSemanticGuideRequestCurrent(requestId)) return;
        showSemanticGuideSuccess(guide);
        if (typeof showSemanticThreadsDetail === 'function') {
            showSemanticThreadsDetail();
        }
    } catch (error) {
        if (isSemanticGuideRequestCancelled(requestId, controller)) return;
        ensureSemanticGuideCorrelationId(error);
        showSemanticGuideFailure(payload, error);
    } finally {
        finishSemanticGuideRequest(controller, button);
    }
}
