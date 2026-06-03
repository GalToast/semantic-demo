/**
 * Semantic Lane Health & Ops Cluster
 *
 * Extracted from js/modules/lifecycle.js (original lines 1745-2088).
 * Manages the readiness health-check loop for semantic search, including
 * warming logic, DOM pill/assist/ops panel state, and ops-mode refresh.
 *
 * All window/document accesses are guarded with typeof checks.
 */
import { state } from '../state.js';
import { detectStaticDevPHP } from './utils/ui-presentation.js';
import { updateSemanticLaneState } from './state-mutators.js';

let legendGuideStateUpdater = null;
let staticDevFallbackWarningShown = false;

export function initSemanticLaneAdapter({ updateLegendGuideState } = {}) {
    legendGuideStateUpdater = typeof updateLegendGuideState === 'function'
        ? updateLegendGuideState
        : null;
}

function getWindow() {
    return typeof window !== 'undefined' ? window : null;
}

function getDocument() {
    return typeof document !== 'undefined' ? document : null;
}

function allowsStaticDevFallback() {
    const win = getWindow();
    if (!win?.location) return false;
    const host = win.location.hostname;
    // Expanded local dev range to include common E2E and container hostnames
    if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1' && host !== '0.0.0.0') return false;
    const params = new URLSearchParams(win.location.search || '');
    return params.get('staticDev') !== '0';
}

export async function fetchSemanticLaneHealth({ warm = false, signal = null } = {}) {
    const response = await fetch(`api.php?action=semantic_lane_health&warm=${warm ? '1' : '0'}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal
    });

    const responseText = await response.text();
    let payload;

    if (detectStaticDevPHP(responseText) && allowsStaticDevFallback()) {
        if (!staticDevFallbackWarningShown) {
            console.warn('[semantic-lane] Detected raw PHP response. Assuming static dev server. Returning mock healthy state.');
            staticDevFallbackWarningShown = true;
        }
        payload = {
            ok: true,
            state: 'healthy',
            provenance: {
                label: 'Static Dev Mode',
                detail: 'Local development mock active.'
            },
            is_mock: true
        };
    } else if (detectStaticDevPHP(responseText)) {
        const error = new Error('Semantic search readiness check returned raw PHP source.');
        Object.defineProperty(error, 'correlationId', { value: crypto.randomUUID(), writable: false, configurable: true });
        throw error;
    } else {
        try {
            payload = JSON.parse(responseText);
        } catch (error) {
            Object.defineProperty(error, 'correlationId', { value: crypto.randomUUID(), writable: false, configurable: true });
            throw new Error('Semantic search readiness check returned invalid JSON.', { cause: error });
        }
    }

    if (!response.ok || !payload?.ok) {
        const err = new Error(payload?.error || 'Semantic search readiness check failed.');
        Object.defineProperty(err, 'correlationId', { value: crypto.randomUUID(), writable: false, configurable: true });
        throw err;
    }

    return payload;
}

function isStaticDevLaneFallbackActive() {
    return allowsStaticDevFallback()
        && state.semanticLaneSnapshot?.is_mock === true
        && state.semanticLaneSnapshot?.provenance?.label === 'Static Dev Mode';
}

/**
 * Sanitize provenance label to prevent internal implementation details from leaking into user-facing UI.
 * Maps known internal/s diagnostic labels to clean user-facing equivalents; rejects anything that looks
 * like an internal detail (contains "Lane:", "Ops", "PROBING", "cold", etc.).
 */
function sanitizeProvenanceLabel(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const lower = raw.toLowerCase();
    if (lower.includes('lane:') || lower.includes('semantic lane:') || lower.includes('ops:') ||
        lower.includes('probing') || lower.includes('cold') || lower.includes('warm') ||
        lower.includes('thread') || lower.includes('embed') ||
        lower.includes('static') || lower.includes('dev mode') ||
        lower.includes('semanticlaneops') || lower.includes('semantic_lane_ops')) {
        return null;
    }
    if (raw !== raw.trim() || raw.length > 60) return null;
    return raw;
}

/**
 * Sanitize provenance detail text. Rejects any string that exposes internal implementation details.
 */
function sanitizeProvenanceDetail(raw) {
    if (!raw || typeof raw !== 'string') return null;
    const lower = raw.toLowerCase();
    if (lower.includes('lane:') || lower.includes('semantic lane:') || lower.includes('ops:') ||
        lower.includes('probing') || lower.includes('cold') || lower.includes('thread') ||
        lower.includes('embed') ||
        lower.includes('semanticlaneops') || lower.includes('semantic_lane_ops') ||
        lower.includes('0 threads') || lower.includes('ops mode')) {
        return null;
    }
    if (raw !== raw.trim() || raw.length > 120) return null;
    return raw;
}

export function applySemanticLaneHealthPayload(payload, options = {}) {
    recordSemanticLaneSnapshot(payload || {});
    const win = getWindow();
    if (typeof win?.scheduleSemanticLaneCooldownProbe === 'function') win.scheduleSemanticLaneCooldownProbe(payload || {});
    if (state.semanticLaneOpsMode) {
        refreshSemanticLaneOpsSummary().catch((err) => console.warn('refreshSemanticLaneOpsSummary failed:', err));
    }
    const laneState = payload?.state || 'degraded';
    const rawProvenanceLabel = payload?.provenance?.label || null;
    const rawProvenanceDetail = payload?.provenance?.detail || null;
    const provenanceLabel = sanitizeProvenanceLabel(rawProvenanceLabel);
    const provenanceDetail = sanitizeProvenanceDetail(rawProvenanceDetail);

    // Track consecutive warming (degraded) probes for stuck detection
    if (laneState === 'warming' || laneState === 'degraded') {
        state.semanticLaneWarmingCounter = (state.semanticLaneWarmingCounter || 0) + 1;
    } else {
        state.semanticLaneWarmingCounter = 0;
    }

    // If warming persists beyond 3 consecutive probes, mark as stuck
    if (state.semanticLaneWarmingCounter >= 3) {
        setSemanticLaneUiState('stuck', {
            label: options.label || provenanceLabel || 'Service Busy',
            title: options.title || provenanceDetail || 'Semantic search is taking longer than expected. Click to reload.'
        });
        return;
    }

    if (laneState === 'healthy') {
        recordSemanticLaneSnapshot({
            retry_source: null,
            retry_count: null,
            retry_total: null,
            retry_wait_until: null,
            retry_reason: null,
            cooldown_wait_until: null
        });
        setSemanticLaneUiState('healthy', {
            label: options.label || provenanceLabel || 'Search ready',
            title: options.title || provenanceDetail || 'Semantic search is ready.'
        });
        return;
    }

    if (laneState === 'reconnecting') {
        const reconnectLabel =
            options.label ||
            provenanceLabel ||
            'Refreshing search';
        setSemanticLaneUiState('reconnecting', {
            label: reconnectLabel,
            title: options.title || provenanceDetail || 'Semantic search is refreshing in the background.'
        });
        return;
    }

    setSemanticLaneUiState('degraded', {
        label: options.label || provenanceLabel || 'Search warming',
        title:
            options.title ||
            provenanceDetail ||
            'Semantic search is still getting ready.'
    });
}

export function shouldWarmSemanticLane(reason = 'interval') {
    if (reason === 'focus' || reason === 'visibility') return true;
    const doc = getDocument();
    if (doc && doc.visibilityState !== 'visible') return false;
    const inputValue = doc?.getElementById?.('search-input')?.value?.trim() || '';
    return !!state.currentSearchSummary || inputValue.length >= 2;
}

export async function probeSemanticLane({ warm = false, reason = 'interval' } = {}) {
    const win = getWindow();
    if (state.semanticLaneProbePromise) {
        state.semanticLanePendingWarm = state.semanticLanePendingWarm || warm;
        if (typeof win?.updateSemanticLaneAssistUi === 'function') win.updateSemanticLaneAssistUi();
        return state.semanticLaneProbePromise;
    }

    const effectiveWarm = warm || state.semanticLanePendingWarm;
    state.semanticLanePendingWarm = false;
    const trackWarmupAttempt =
        effectiveWarm ||
        state.semanticLaneState !== 'healthy' ||
        reason === 'manual-retry' ||
        reason === 'focus' ||
        reason === 'visibility' ||
        reason === 'queued-warm';

    if (trackWarmupAttempt) {
        const priorWarmupCount =
            state.semanticLaneSnapshot?.retry_source === 'warmup'
                ? Number(state.semanticLaneSnapshot.retry_count || 0)
                : 0;
        recordSemanticLaneSnapshot({
            retry_source: 'warmup',
            retry_count: priorWarmupCount + 1,
            retry_total: null,
            retry_wait_until: null,
            retry_reason: reason,
            attempted_warm: effectiveWarm
        });
    }
    if (typeof win?.updateSemanticLaneAssistUi === 'function') win.updateSemanticLaneAssistUi();

    state.semanticLaneProbePromise = (async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        try {
            const payload = await fetchSemanticLaneHealth({ warm: effectiveWarm, signal: controller.signal });
            applySemanticLaneHealthPayload(payload);
            return payload;
        } catch (err) {
            const isTimeout = err.name === 'AbortError';
            if (isTimeout) console.warn('Semantic lane probe timed out after 5s');

            if (reason === 'focus' || reason === 'visibility' || effectiveWarm || isTimeout || state.semanticLaneState === 'checking' || state.semanticLaneState === 'degraded' || state.semanticLaneState === 'unavailable') {
                recordSemanticLaneSnapshot({
                    state: 'unavailable',
                    search_ok: false,
                    embed_ok: false,
                    attempted_warm: effectiveWarm,
                    retry_wait_until: null,
                    cooldown_wait_until: null
                });
                if (typeof win?.clearSemanticLaneCooldownProbeTimer === 'function') win.clearSemanticLaneCooldownProbeTimer();
                setSemanticLaneUiState('unavailable', {
                    title: 'Search health check failed to connect.'
                });
            }
            return null;
        } finally {
            clearTimeout(timeoutId);
            state.semanticLaneProbePromise = null;
            if (typeof win?.updateSemanticLaneAssistUi === 'function') win.updateSemanticLaneAssistUi();
            if (state.semanticLanePendingWarm) {
                const pendingWarm = state.semanticLanePendingWarm;
                state.semanticLanePendingWarm = false;
                probeSemanticLane({ warm: pendingWarm, reason: 'queued-warm' });
            }
        }
    })();

    if (typeof win?.updateSemanticLaneAssistUi === 'function') win.updateSemanticLaneAssistUi();

    return state.semanticLaneProbePromise;
}

export function scheduleSemanticLaneMonitor() {
    const win = getWindow();
    if (state.semanticLaneMonitorTimer) {
        win?.clearInterval?.(state.semanticLaneMonitorTimer);
    }

    state.semanticLaneMonitorTimer = typeof win?.setInterval === 'function' ? win.setInterval(() => {
        if (isStaticDevLaneFallbackActive()) return;
        probeSemanticLane({
            warm: shouldWarmSemanticLane('interval'),
            reason: 'interval'
        });
    }, 45000) : undefined;
}

export function setSemanticLaneUiState(laneState, options = {}) {
    const doc = getDocument();
    updateSemanticLaneState(laneState);
    const pill = doc?.getElementById?.('semantic-lane-pill') || null;
    const container = doc?.querySelector?.('.search-container') || null;
    if (container) {
        container.dataset.laneState = laneState;
    }
    if (!pill) return;

    let label = 'Checking search';
    let title = 'Checking search readiness.';
    if (laneState === 'healthy') {
        label = options.label || 'Search: ready';
        title = options.title || 'Search is ready.';
    } else if (laneState === 'reconnecting') {
        label = options.label || 'Search: reconnecting';
        title = options.title || 'Search is refreshing in the background.';
    } else if (laneState === 'degraded') {
        label = options.label || 'Search: warming up';
        title = options.title || 'Search is still getting ready.';
    } else if (laneState === 'unavailable') {
        label = options.label || 'Search: unavailable';
        title = options.title || 'Search is unavailable. Try again in a moment.';
    } else if (laneState === 'stuck') {
        label = options.label || 'Service Busy';
        title = options.title || 'Semantic search is taking longer than expected. Click to reload.';
    }

    pill.dataset.state = laneState;
    const assistEl = doc?.getElementById?.('semantic-lane-assist') || null;
    if (assistEl) {
        const hasFocusedRecord = Boolean(state.selectedPoint)
            || state.focusedNode !== null && state.focusedNode !== undefined
            || state.navState?.focusedIndex !== null && state.navState?.focusedIndex !== undefined;
        const focusOwnsRail = doc?.body?.dataset?.graphContext === 'focus-search'
            || doc?.body?.dataset?.graphContext === 'focus'
            || hasFocusedRecord;
        const hasVisibleResults = Boolean(state.currentSearchSummary);
        // Hide the assist card once results are visible: the pill at the top of
        // the search surface already communicates the degraded lane state, and
        // stacking the inline card above results paints over the first result
        // row on narrow viewports.
        if (laneState === 'healthy' || focusOwnsRail || hasVisibleResults) {
            assistEl.hidden = true;
            assistEl.style.display = 'none';
            assistEl.dataset.state = 'idle';
        } else {
            assistEl.hidden = false;
            assistEl.style.display = '';
            assistEl.dataset.state = 'degraded';
            const assistCopyEl = doc?.getElementById?.('semantic-lane-assist-copy') || null;
            const assistMetaEl = doc?.getElementById?.('semantic-lane-assist-meta') || null;
            if (assistCopyEl) {
                assistCopyEl.textContent = 'Semantic search readiness is temporarily unavailable. The visualization remains available while recovery checks continue in the background.';
            }
            if (assistMetaEl) {
                assistMetaEl.textContent = 'Offline or blocked request detected just now.';
            }
        }
    }
    if (state.semanticLaneOpsMode) {
        pill.textContent = label;
        pill.title = title;
        pill.setAttribute('aria-label', title);
        pill.hidden = false;
        pill.style.display = '';
    } else {
        if (laneState === 'unavailable') {
            pill.textContent = '';
            pill.removeAttribute('title');
            pill.removeAttribute('aria-label');
            pill.hidden = true;
        } else if (laneState === 'stuck') {
            pill.textContent = label;
            pill.title = title;
            pill.setAttribute('aria-label', title);
            pill.hidden = false;
            pill.style.display = '';
            pill.style.cursor = 'pointer';
        } else {
            pill.textContent = label;
            pill.title = title;
            pill.setAttribute('aria-label', title);
            pill.hidden = false;
            pill.style.display = '';
        }
    }
    if (legendGuideStateUpdater) legendGuideStateUpdater();
}

export function recordSemanticLaneSnapshot(partial = {}) {
    state.semanticLaneSnapshot = {
        ...(state.semanticLaneSnapshot || {}),
        ...partial,
        checked_at: partial.checked_at || new Date().toISOString()
    };
    return state.semanticLaneSnapshot;
}

export function setSemanticLaneOpsMode(enabled) {
    const win = getWindow();
    const doc = getDocument();
    state.semanticLaneOpsMode = !!enabled;
    const panel = doc?.getElementById?.('semantic-lane-ops') || null;
    if (panel) {
        panel.hidden = !state.semanticLaneOpsMode;
    }
    if (!state.semanticLaneOpsMode) {
        if (state.semanticLaneOpsRefreshTimer) {
            win?.clearInterval?.(state.semanticLaneOpsRefreshTimer);
            state.semanticLaneOpsRefreshTimer = null;
        }
        return;
    }
    if (!state.semanticLaneOpsRefreshTimer && typeof win?.setInterval === 'function') {
        state.semanticLaneOpsRefreshTimer = win.setInterval(() => {
            refreshSemanticLaneOpsSummary();
        }, 60000);
    }
}

export async function refreshSemanticLaneOpsSummary() {
    const win = getWindow();
    const doc = getDocument();
    if (!state.semanticLaneOpsMode) return null;
    if (state.semanticLaneOpsFetchPromise) return state.semanticLaneOpsFetchPromise;

    state.semanticLaneOpsFetchPromise = (async () => {
        try {
            const summary = await (typeof win?.fetchSemanticLaneOpsSummary === 'function' ? win.fetchSemanticLaneOpsSummary() : Promise.resolve(null));
            if (typeof win?.renderSemanticLaneOpsSummary === 'function') win.renderSemanticLaneOpsSummary(summary);
            return summary;
        } catch {
            const metaEl = doc?.getElementById?.('semantic-lane-ops-meta') || null;
            if (metaEl && state.semanticLaneOpsMode) {
                metaEl.textContent = 'Search readiness summary failed to load.';
            }
            return null;
        } finally {
            state.semanticLaneOpsFetchPromise = null;
        }
    })();

    return state.semanticLaneOpsFetchPromise;
}
