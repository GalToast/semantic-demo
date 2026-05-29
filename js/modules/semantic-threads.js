// js/modules/semantic-threads.js — semantic thread artifact loading
import { state } from '../state.js';
import { recordSemanticLaneSnapshot } from './url-navigation-adapter.js';
import { updateSemanticThreadsStatus } from './state-mutators.js';

const SEMANTIC_THREAD_RETRY_DELAYS_MS = [2500, 8000, 15000];

let _dataWorker = null;

function buildAssetUrl(path) {
    if (typeof window === 'undefined') return path;
    return new URL(path, window.location.href).href;
}

function artifactNameFromUrl(url) {
    try {
        return new URL(url, window.location.href).pathname.split('/').pop() || url.split('?')[0];
    } catch {
        return url.split('?')[0];
    }
}

function getWorker() {
    if (typeof Worker === 'undefined') {
        _dataWorker = null;
        return null;
    }
    if (_dataWorker) return _dataWorker;

    try {
        _dataWorker = new Worker('js/workers/data-worker.js');
        return _dataWorker;
    } catch (err) {
        console.warn('Web Worker instantiation failed for threads, using main-thread fallback.', err);
        return null;
    }
}

/**
 * Promise-based wrapper for worker communication.
 */
function callWorker(type, payload) {
    return new Promise((resolve, reject) => {
        const worker = getWorker();
        if (!worker) {
            reject(new Error('Worker unavailable'));
            return;
        }

        const handler = (event) => {
            const { type: resType, payload: resPayload } = event.data;
            if (resType === `${type}_SUCCESS`) {
                worker.removeEventListener('message', handler);
                resolve(resPayload);
            } else if (resType === 'ERROR') {
                worker.removeEventListener('message', handler);
                _dataWorker = null;
                reject(new Error(resPayload?.message || 'Worker failed'));
            }
        };

        worker.addEventListener('message', handler);
        worker.postMessage({ type, payload });
    });
}

function _normalizeLeadId(id) {
    if (id === null || id === undefined) return null;
    const s = String(id).trim();
    return s.length > 0 ? s : null;
}

function _cleanOptionalValue(value) {
    if (value === null || value === undefined) return null;
    return String(value);
}

function _buildSemanticNeighborMap(bundle) {
    state.semanticNeighborMapByLeadId = new Map();
    if (!bundle?.nodes || typeof bundle.nodes !== 'object') return;

    Object.entries(bundle.nodes).forEach(([fallbackLeadId, node]) => {
        const leadId = _normalizeLeadId(node?.lead_id ?? fallbackLeadId);
        if (!leadId) return;

        const neighbors = Array.isArray(node?.neighbors)
            ? node.neighbors.map((neighbor) => ({
                leadId: _normalizeLeadId(neighbor?.lead_id),
                score: Number(neighbor?.score ?? 0),
                semanticScore: Number(neighbor?.semantic_score ?? 0),
                sameCity: Boolean(neighbor?.same_city),
                sameStatus: Boolean(neighbor?.same_status),
                bridgeScore: Number(neighbor?.bridge_score ?? 0),
                signalScore: Number(neighbor?.signal_score ?? 0),
                threadType: _cleanOptionalValue(neighbor?.thread_type) || 'local_semantic_neighbor',
                reason: _cleanOptionalValue(neighbor?.reason) || 'semantic neighbor'
            })).filter((neighbor) => neighbor.leadId)
            : [];

        state.semanticNeighborMapByLeadId.set(leadId, {
            leadId,
            name: node?.name || null,
            city: node?.city || null,
            status: node?.status || null,
            signalScore: Number(node?.signal_score ?? 0),
            neighbors
        });
    });
}

function _recordSemanticLaneSnapshot(partial = {}) {
    if (typeof recordSemanticLaneSnapshot === 'function') {
        recordSemanticLaneSnapshot(partial);
    }
}

function _refreshFocusedSemanticState() {}

function _clearSemanticThreadsRetryTimer() {
    if (state.semanticThreadsRetryTimer) {
        window.clearTimeout(state.semanticThreadsRetryTimer);
        state.semanticThreadsRetryTimer = null;
    }
}

function _scheduleSemanticThreadsRetry(reason = 'artifact-retry') {
    if (state.semanticThreadsStatus === 'ready' || state.semanticThreadsLoadPromise || state.semanticThreadsRetryTimer) return;
    if (typeof state.semanticThreadsRetryAttempt !== 'number') {
        state.semanticThreadsRetryAttempt = 0;
    }
    const MAX_RETRIES = 5;
    if (state.semanticThreadsRetryAttempt >= MAX_RETRIES) {
        console.warn(`loadSemanticThreads: max retries (${MAX_RETRIES}) reached, giving up`);
        updateSemanticThreadsStatus('failed');
        return;
    }
    const delayMs = SEMANTIC_THREAD_RETRY_DELAYS_MS[Math.min(Number.isFinite(state.semanticThreadsRetryAttempt) ? state.semanticThreadsRetryAttempt : 0, SEMANTIC_THREAD_RETRY_DELAYS_MS.length - 1)] || 15000;
    state.semanticThreadsRetryAttempt += 1;
    _recordSemanticLaneSnapshot({
        thread_retry_source: reason,
        thread_retry_count: state.semanticThreadsRetryAttempt,
        thread_retry_wait_until: new Date(Date.now() + delayMs).toISOString(),
    });
    state.semanticThreadsRetryTimer = window.setTimeout(() => {
        state.semanticThreadsRetryTimer = null;
        loadSemanticThreads({ reason }).catch(err => {
            console.warn('loadSemanticThreads retry failed:', err);
        });
    }, delayMs);
}

/**
 * Load the semantic thread neighbor artifact, populating state.semanticNeighborMapByLeadId.
 */
export async function loadSemanticThreads(options = {}) {
    if (state.semanticThreadsLoadPromise) return state.semanticThreadsLoadPromise;

    const cacheBust = Math.floor(Date.now() / (1000 * 60 * 60));
    const requestUrls = [
        buildAssetUrl(`semantic_threads_ui.dat?v=${cacheBust}`),
        buildAssetUrl(`semantic_threads.dat?v=${cacheBust}`)
    ];
    const attemptConfigs = [
        { cache: 'default' },
        { cache: 'force-cache' },
        { cache: 'reload' },
        { cache: 'no-store' },
    ];

    updateSemanticThreadsStatus('loading');
    state.semanticThreadsLoadPromise = (async () => {
        try {
            _clearSemanticThreadsRetryTimer();

            // 1. Attempt Worker-Based Loading
            const worker = getWorker();
            if (worker) {
                try {
                    const { neighborEntries, artifactName, bundle } = await callWorker('LOAD_THREADS', { urls: requestUrls, attemptConfigs });
                    state.semanticThreadBundle = bundle;
                    state.semanticThreadArtifactName = artifactName;
                    state.semanticNeighborMapByLeadId = new Map(neighborEntries);
                    finalizeThreadLoad();
                    return true;
                } catch (err) {
                    console.warn('Worker-based thread loading failed, falling back to main thread.', err);
                    _dataWorker = null;
                }
            }

            // 2. Main-Thread Fallback
            let bundle = null;
            let loadedArtifactName = null;
            let lastError = null;

            outer: for (let requestIndex = 0; requestIndex < requestUrls.length; requestIndex++) {
                const requestUrl = requestUrls[requestIndex];
                const artifactName = artifactNameFromUrl(requestUrl);
                for (let attempt = 0; attempt < attemptConfigs.length; attempt++) {
                    try {
                        const response = await fetch(requestUrl, attemptConfigs[attempt]);
                        if (!response.ok) throw new Error(`semantic thread artifact unavailable (${response.status})`);
                        bundle = await response.json();
                        loadedArtifactName = artifactName;
                        break outer;
                    } catch (error) {
                        lastError = error;
                        if (attempt < attemptConfigs.length - 1) {
                            await new Promise((resolve) => setTimeout(resolve, 220 * (attempt + 1)));
                        }
                    }
                }
            }

            if (!bundle) throw lastError || new Error('semantic thread artifact unavailable');

            state.semanticThreadBundle = bundle;
            state.semanticThreadArtifactName = loadedArtifactName;
            _buildSemanticNeighborMap(bundle);
            finalizeThreadLoad();
            return state.semanticNeighborMapByLeadId.size > 0;
        } catch (error) {
            console.warn('Failed to load semantic thread artifact; using geometric fallback.', error);
            state.semanticThreadBundle = null;
            state.semanticThreadArtifactName = null;
            state.semanticNeighborMapByLeadId = new Map();
            updateSemanticThreadsStatus('failed');
            state.semanticThreadsLoadPromise = null;
            _recordSemanticLaneSnapshot({
                thread_artifact_status: 'failed',
                thread_artifact_name: null,
                thread_retry_source: options.reason || 'artifact-load',
                thread_retry_count: state.semanticThreadsRetryAttempt,
            });
            _scheduleSemanticThreadsRetry(options.reason || 'artifact-load');
            _refreshFocusedSemanticState();
            return false;
        }
    })();

    return state.semanticThreadsLoadPromise;
}

function finalizeThreadLoad() {
    if (new URLSearchParams(window.location.search).has('debug')) {
        console.warn('[semantic-threads] artifact loaded', {
            artifact: state.semanticThreadArtifactName,
            records: state.semanticNeighborMapByLeadId.size
        });
    }
    updateSemanticThreadsStatus(state.semanticNeighborMapByLeadId.size > 0 ? 'ready' : 'failed');
    state.semanticThreadsRetryAttempt = state.semanticThreadsStatus === 'ready' ? 0 : state.semanticThreadsRetryAttempt;
    _recordSemanticLaneSnapshot({
        thread_artifact_status: state.semanticThreadsStatus,
        thread_artifact_name: state.semanticThreadArtifactName,
        thread_retry_source: null,
        thread_retry_count: state.semanticThreadsStatus === 'ready' ? 0 : state.semanticThreadsRetryAttempt,
        thread_retry_wait_until: null,
    });
    if (state.semanticThreadsStatus !== 'ready') {
        state.semanticThreadsLoadPromise = null;
        _scheduleSemanticThreadsRetry('empty-artifact');
    }
    _refreshFocusedSemanticState();
}

export default loadSemanticThreads;
