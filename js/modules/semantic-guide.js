import { state } from '../state.js';
import { escapeHtml } from './utils/dom-formatters.js';
import { buildSemanticGuideRequestPayload } from './semantic-guide-payload.js';
import {updateLegendGuideState} from './legend-ui.js';
import {showSemanticThreadsDetail} from './connection-analysis.js';
import { semanticGuideStateStore } from './stores.js';

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
    if (!id) return '';
    return `<svg class="ui-icon" aria-hidden="${label ? 'false' : 'true'}"${label ? ` aria-label="${escapeHtml(label)}"` : ''}><use href="#icon-${escapeHtml(id)}"></use></svg>`;
}

export function setSemanticGuideButtonState(mode = 'ready', options = {}) {
    let currentState;
    semanticGuideStateStore.subscribe(s => currentState = s)();
    semanticGuideStateStore.set({
        ...currentState,
        buttonMode: mode,
        buttonOptions: options
    });
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

export function showSummaryCard(config = {}) {
    const settings = normalizeSummaryCardConfig(config);
    state.currentSemanticGuide = settings;
    state.summaryCardTypeToken = (state.summaryCardTypeToken || 0) + 1;

    let currentState;
    semanticGuideStateStore.subscribe(s => currentState = s)();
    semanticGuideStateStore.set({
        ...currentState,
        isVisible: true,
        config: settings,
        typeToken: state.summaryCardTypeToken
    });
}

export function hideSummaryCard() {
    state.summaryCardTypeToken = (state.summaryCardTypeToken || 0) + 1;
    let currentState;
    semanticGuideStateStore.subscribe(s => currentState = s)();
    semanticGuideStateStore.set({
        ...currentState,
        isVisible: false,
        config: null,
        typeToken: state.summaryCardTypeToken,
        isSynthesizing: false
    });
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

function startSemanticGuideRequest() {
    if (state.semanticGuideAbortController) {
        state.semanticGuideAbortController.abort();
        state.semanticGuideAbortController = null;
    }
    const requestId = (state.semanticGuideRequestSequence = (state.semanticGuideRequestSequence || 0) + 1);
    const controller = new AbortController();
    state.semanticGuideAbortController = controller;
    setSemanticGuideButtonState('loading');

    let currentState;
    semanticGuideStateStore.subscribe(s => currentState = s)();
    semanticGuideStateStore.set({
        ...currentState,
        isSynthesizing: true
    });

    showSummaryCard(getSemanticGuideLoadingCardConfig());

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
    let currentState;
    semanticGuideStateStore.subscribe(s => currentState = s)();
    semanticGuideStateStore.set({
        ...currentState,
        isSynthesizing: false
    });
    const fallback = buildClientSemanticGuideFallback(payload, error?.message || 'Guide response is still warming up.');
    showSummaryCard(buildSemanticGuideFallbackCardConfig(fallback));
}

function finishSemanticGuideRequest(controller) {
    if (state.semanticGuideAbortController === controller) {
        state.semanticGuideAbortController = null;
    }
    setSemanticGuideButtonState('refresh', { disabled: false });
    if (typeof updateLegendGuideState === 'function') updateLegendGuideState();
}

function ensureSemanticGuideCorrelationId(error) {
    if (!error || Object.prototype.hasOwnProperty.call(error, 'correlationId')) return;
    Object.defineProperty(error, 'correlationId', { value: crypto.randomUUID(), writable: false, configurable: true });
}

export async function requestSemanticGuide() {
    const payload = buildSemanticGuideRequestPayload();
    if (!payload) return;

    const { requestId, controller } = startSemanticGuideRequest();

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
        finishSemanticGuideRequest(controller);
    }
}
