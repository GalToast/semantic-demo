/**
 * js/modules/semantic-threads.ts
 *
 * TypeScript shadow of semantic-threads.js.
 * Semantic thread artifact loading with worker and main-thread fallback.
 */
import { state, type SemanticNode } from '../state.ts';
import { updateSemanticThreadsStatus } from './state-mutators.ts';
import { normalizeRelationshipRole } from './relationship-roles.ts';
import { recordSemanticLaneSnapshot } from './semantic-lane.ts';
import { debugWarn } from './diagnostic-adapter.ts';

const SEMANTIC_THREAD_RETRY_DELAYS_MS = [2500, 8000, 15000];

let _dataWorker: Worker | null = null;

function buildAssetUrl(path: string): string {
    if (typeof window === 'undefined') return path;
    return new URL(path, window.location.href).href;
}

function artifactNameFromUrl(url: string): string {
    try {
        const parsed = new URL(url, window.location.href);
        const parts = parsed.pathname.split('/');
        const last = parts[parts.length - 1];
        return last ?? url.split('?')[0] ?? url;
    } catch {
        return url.split('?')[0] ?? url;
    }
}

function getWorker(): Worker | null {
    if (typeof Worker === 'undefined') {
        _dataWorker = null;
        return null;
    }
    if (_dataWorker) return _dataWorker;

    try {
        _dataWorker = new Worker(buildAssetUrl('js/workers/data-worker.js?v=20260609'));
        return _dataWorker;
    } catch (err) {
        console.warn('Web Worker instantiation failed for threads, using main-thread fallback.', err);
        return null;
    }
}

async function _loadSemanticSpaceLayoutManifest(cacheBust: number): Promise<any> {
    const manifestUrl = buildAssetUrl(`semantic_space_layout_manifest.json?v=${cacheBust}`);
    const response = await fetch(manifestUrl, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`semantic space manifest unavailable (${response.status})`);
    }
    const manifest = await response.json();
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
        throw new Error('semantic space manifest is not an object');
    }
    return manifest;
}

function _basename(value: string): string {
    if (!value) return '';
    return String(value).replaceAll('\\', '/').split('/').pop() || '';
}

function _countThreadEdges(bundle: any): number {
    const nodes = bundle?.nodes && typeof bundle.nodes === 'object' ? bundle.nodes : {};
    return Object.values(nodes).reduce((sum: number, node: any) => (
        sum + (Array.isArray(node?.neighbors) ? node.neighbors.length : 0)
    ), 0);
}

function _validateSemanticSpaceLayoutManifest(manifest: any, bundle: any, artifactName: string): any {
    const nodes = bundle?.nodes && typeof bundle.nodes === 'object' ? bundle.nodes : {};
    const nodeCount = Object.keys(nodes).length;
    const edgeCount = _countThreadEdges(bundle);
    const pointCount = Array.isArray(state.points) ? state.points.length : 0;
    const rows = Number(manifest.rows);
    const edges = Number(manifest.edges);
    const manifestThreadName = _basename(manifest.thread_path);
    const loadedThreadName = artifactName ? _basename(artifactName) : '';

    const failures: string[] = [];
    if (!Number.isFinite(rows) || rows <= 0) failures.push('rows must be a positive number');
    if (!Number.isFinite(edges) || edges <= 0) failures.push('edges must be a positive number');
    if (rows !== nodeCount) failures.push(`rows ${rows} != semantic nodes ${nodeCount}`);
    if (pointCount > 0 && rows !== pointCount) failures.push(`rows ${rows} != loaded points ${pointCount}`);
    if (edges !== edgeCount) failures.push(`edges ${edges} != semantic edges ${edgeCount}`);
    if (manifestThreadName && loadedThreadName && manifestThreadName !== loadedThreadName) {
        failures.push(`thread_path ${manifestThreadName} != loaded artifact ${loadedThreadName}`);
    }
    if (_basename(manifest.data_path) && _basename(manifest.data_path) !== 'data.dat') {
        failures.push(`data_path must reference data.dat, got ${_basename(manifest.data_path)}`);
    }

    if (failures.length) {
        throw new Error(`semantic space manifest mismatch: ${failures.join('; ')}`);
    }

    return {
        generatedAt: manifest.generated_at || null,
        method: manifest.method || null,
        rows,
        edges,
        threadArtifact: loadedThreadName || manifestThreadName || null,
    };
}

async function _guardSemanticSpaceLayout(bundle: any, artifactName: string, cacheBust: number): Promise<any> {
    const manifest = await _loadSemanticSpaceLayoutManifest(cacheBust);
    const summary = _validateSemanticSpaceLayoutManifest(manifest, bundle, artifactName);
    state.semanticSpaceLayoutManifest = manifest;
    state.semanticSpaceLayoutStatus = 'ready';
    state.semanticSpaceLayoutError = null;
    _recordSemanticLaneSnapshot({
        semantic_space_layout_status: 'ready',
        semantic_space_layout_rows: summary.rows,
        semantic_space_layout_edges: summary.edges,
        semantic_space_layout_thread_artifact: summary.threadArtifact,
        semantic_space_layout_generated_at: summary.generatedAt,
    });
    return summary;
}

function callWorker(type: string, payload: Record<string, unknown>): Promise<any> {
    return new Promise((resolve, reject) => {
        const worker = getWorker();
        if (!worker) {
            reject(new Error('Worker unavailable'));
            return;
        }

        const handler = (event: MessageEvent) => {
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

function _normalizeLeadId(id: any): string | null {
    if (id === null || id === undefined) return null;
    const s = String(id).trim();
    return s.length > 0 ? s : null;
}

function _cleanOptionalValue(value: any): string | null {
    if (value === null || value === undefined) return null;
    return String(value);
}

function _buildSemanticNeighborMap(bundle: any): void {
    state.semanticNeighborMapByLeadId = new Map();
    if (!bundle?.nodes || typeof bundle.nodes !== 'object') return;

    Object.entries(bundle.nodes).forEach(([fallbackLeadId, node]: [string, any]) => {
        const leadId = _normalizeLeadId(node?.lead_id ?? fallbackLeadId);
        if (!leadId) return;

        const neighbors = Array.isArray(node?.neighbors)
            ? node.neighbors.map((neighbor: any) => ({
                leadId: _normalizeLeadId(neighbor?.lead_id),
                score: Number(neighbor?.score ?? 0),
                semanticScore: Number(neighbor?.semantic_score ?? 0),
                sameCity: Boolean(neighbor?.same_city),
                sameStatus: Boolean(neighbor?.same_status),
                bridgeScore: Number(neighbor?.bridge_score ?? 0),
                signalScore: Number(neighbor?.signal_score ?? 0),
                threadType: _cleanOptionalValue(neighbor?.thread_type) || 'local_semantic_neighbor',
                relationshipRole: normalizeRelationshipRole(neighbor?.relationship_role),
                relationshipAxis: _cleanOptionalValue(neighbor?.relationship_axis) || '',
                roleReason: _cleanOptionalValue(neighbor?.role_reason) || '',
                reason: _cleanOptionalValue(neighbor?.reason) || 'semantic neighbor'
            })).filter((neighbor: any) => neighbor.leadId)
            : [];

        state.semanticNeighborMapByLeadId.set(leadId, {
            leadId,
            name: node?.name || null,
            city: node?.city || null,
            status: node?.status || null,
            signalScore: Number(node?.signal_score ?? 0),
            neighbors
        } as any);
    });
}

function _normalizeSemanticNeighborEntries(neighborEntries: any): any[] {
    if (!Array.isArray(neighborEntries)) return [];
    return neighborEntries.map(([leadId, node]: [string, any]) => [
        leadId,
        {
            ...node,
            neighbors: Array.isArray(node?.neighbors)
                ? node.neighbors.map((neighbor: any) => ({
                    ...neighbor,
                    relationshipRole: normalizeRelationshipRole(neighbor?.relationshipRole),
                    relationshipAxis: _cleanOptionalValue(neighbor?.relationshipAxis) || '',
                    roleReason: _cleanOptionalValue(neighbor?.roleReason) || '',
                    reason: _cleanOptionalValue(neighbor?.reason) || 'semantic neighbor'
                }))
                : []
        }
    ]);
}

function _recordSemanticLaneSnapshot(partial: Record<string, any> = {}): void {
    if (typeof recordSemanticLaneSnapshot === 'function') {
        recordSemanticLaneSnapshot(partial);
    }
}

function _refreshFocusedSemanticState(): void {}

function _clearSemanticThreadsRetryTimer(): void {
    if (state.semanticThreadsRetryTimer) {
        window.clearTimeout(state.semanticThreadsRetryTimer);
        state.semanticThreadsRetryTimer = null;
    }
}

function _scheduleSemanticThreadsRetry(reason = 'artifact-retry'): void {
    if (state.semanticThreadsStatus === 'ready' || state.semanticThreadsLoadPromise || state.semanticThreadsRetryTimer) return;
    if (typeof (state as any).semanticThreadsRetryAttempt !== 'number') {
        (state as any).semanticThreadsRetryAttempt = 0;
    }
    const MAX_RETRIES = 5;
    if ((state as any).semanticThreadsRetryAttempt >= MAX_RETRIES) {
        console.warn(`loadSemanticThreads: max retries (${MAX_RETRIES}) reached, giving up`);
        updateSemanticThreadsStatus('failed');
        return;
    }
    const delayMs = SEMANTIC_THREAD_RETRY_DELAYS_MS[Math.min(Number.isFinite((state as any).semanticThreadsRetryAttempt) ? (state as any).semanticThreadsRetryAttempt : 0, SEMANTIC_THREAD_RETRY_DELAYS_MS.length - 1)] || 15000;
    (state as any).semanticThreadsRetryAttempt += 1;
    _recordSemanticLaneSnapshot({
        thread_retry_source: reason,
        thread_retry_count: (state as any).semanticThreadsRetryAttempt,
        thread_retry_wait_until: new Date(Date.now() + delayMs).toISOString(),
    });
    state.semanticThreadsRetryTimer = window.setTimeout(() => {
        state.semanticThreadsRetryTimer = null;
        loadSemanticThreads({ reason }).catch((err: any) => {
            console.warn('loadSemanticThreads retry failed:', err);
        });
    }, delayMs) as unknown as ReturnType<typeof setTimeout>;
}

export async function loadSemanticThreads(options: Record<string, any> = {}): Promise<any> {
    if (state.semanticThreadsLoadPromise) return state.semanticThreadsLoadPromise;

    const cacheBust = Math.floor(Date.now() / (1000 * 60 * 60));
    const requestUrls = [
        buildAssetUrl(`semantic_threads_ui.dat?v=${cacheBust}`),
        buildAssetUrl(`semantic_threads.dat?v=${cacheBust}`)
    ];
    const attemptConfigs = [
        { cache: 'default' as const },
        { cache: 'force-cache' as const },
        { cache: 'reload' as const },
        { cache: 'no-store' as const },
    ];

    updateSemanticThreadsStatus('loading');
    state.semanticThreadsLoadPromise = (async () => {
        try {
            _clearSemanticThreadsRetryTimer();

            const worker = getWorker();
            if (worker) {
                try {
                    const { neighborEntries, artifactName, bundle } = await callWorker('LOAD_THREADS', { urls: requestUrls, attemptConfigs });
                    await _guardSemanticSpaceLayout(bundle, artifactName, cacheBust);
                    (state as any).semanticThreadBundle = bundle;
                    state.semanticThreadArtifactName = artifactName;
                    state.semanticNeighborMapByLeadId = new Map(_normalizeSemanticNeighborEntries(neighborEntries));
                    finalizeThreadLoad();
                    return true;
                } catch (err) {
                    console.warn('Worker-based thread loading failed, falling back to main thread.', err);
                    _dataWorker = null;
                }
            }

            let bundle: any = null;
            let loadedArtifactName: string | null = null;
            let lastError: Error | null = null;

            outer: for (let requestIndex = 0; requestIndex < requestUrls.length; requestIndex++) {
                const requestUrl = requestUrls[requestIndex];
                if (!requestUrl) continue;
                const artifactName = artifactNameFromUrl(requestUrl);
                for (let attempt = 0; attempt < attemptConfigs.length; attempt++) {
                    try {
                        const response = await fetch(requestUrl, attemptConfigs[attempt]);
                        if (!response.ok) throw new Error(`semantic thread artifact unavailable (${response.status})`);
                        bundle = await response.json();
                        loadedArtifactName = artifactName;
                        break outer;
                    } catch (error: any) {
                        lastError = error;
                        if (attempt < attemptConfigs.length - 1) {
                            await new Promise((resolve) => setTimeout(resolve, 220 * (attempt + 1)));
                        }
                    }
                }
            }

            if (!bundle) throw lastError || new Error('semantic thread artifact unavailable');
            if (!loadedArtifactName) throw new Error('semantic thread artifact name unavailable');

            (state as any).semanticThreadBundle = bundle;
            state.semanticThreadArtifactName = loadedArtifactName;
            await _guardSemanticSpaceLayout(bundle, loadedArtifactName, cacheBust);
            _buildSemanticNeighborMap(bundle);
            finalizeThreadLoad();
            return state.semanticNeighborMapByLeadId.size > 0;
        } catch (error: any) {
            console.warn('Failed to load semantic thread artifact; using geometric fallback.', error);
            (state as any).semanticThreadBundle = null;
            state.semanticThreadArtifactName = null;
            state.semanticSpaceLayoutManifest = null;
            state.semanticSpaceLayoutStatus = 'failed';
            state.semanticSpaceLayoutError = error?.message || String(error);
            state.semanticNeighborMapByLeadId = new Map();
            updateSemanticThreadsStatus('failed');
            state.semanticThreadsLoadPromise = null;
            _recordSemanticLaneSnapshot({
                thread_artifact_status: 'failed',
                thread_artifact_name: null,
                semantic_space_layout_status: state.semanticSpaceLayoutStatus,
                semantic_space_layout_error: state.semanticSpaceLayoutError,
                thread_retry_source: options.reason || 'artifact-load',
                thread_retry_count: (state as any).semanticThreadsRetryAttempt,
            });
            _scheduleSemanticThreadsRetry(options.reason ?? 'artifact-load');
            _refreshFocusedSemanticState();
            return false;
        }
    })();

    return state.semanticThreadsLoadPromise;
}

function finalizeThreadLoad(): void {
    if (new URLSearchParams(window.location.search).has('debug')) {
        debugWarn('[semantic-threads] artifact loaded', {
            artifact: state.semanticThreadArtifactName,
            records: state.semanticNeighborMapByLeadId.size
        });
    }
    updateSemanticThreadsStatus(state.semanticNeighborMapByLeadId.size > 0 ? 'ready' : 'failed');
    (state as any).semanticThreadsRetryAttempt = state.semanticThreadsStatus === 'ready' ? 0 : (state as any).semanticThreadsRetryAttempt;
    _recordSemanticLaneSnapshot({
        thread_artifact_status: state.semanticThreadsStatus,
        thread_artifact_name: state.semanticThreadArtifactName,
        semantic_space_layout_status: state.semanticSpaceLayoutStatus,
        thread_retry_source: null,
        thread_retry_count: state.semanticThreadsStatus === 'ready' ? 0 : (state as any).semanticThreadsRetryAttempt,
        thread_retry_wait_until: null,
    });
    if (state.semanticThreadsStatus !== 'ready') {
        state.semanticThreadsLoadPromise = null;
        _scheduleSemanticThreadsRetry('empty-artifact');
    }
    _refreshFocusedSemanticState();
}

export default loadSemanticThreads;
