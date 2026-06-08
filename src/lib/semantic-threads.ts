/**
 * @lib/semantic-threads.ts — Semantic thread artifact loading (typed port)
 *
 * Port of: js/modules/semantic-threads.js
 *
 * Loads semantic thread neighbor data (from semantic_threads.dat / semantic_threads_ui.dat),
 * populating state.semanticNeighborMapByLeadId.  Uses a Web Worker for parsing when
 * available, falling back to main-thread fetch+JSON.
 *
 * All state writes are wrapped in withStateMutation() from the extracted TS guard
 * so that production Proxy traps on CRITICAL_KEYS are satisfied.
 */

import { withStateMutation } from '@lib/state/with-state-mutation';
import type {
  SemanticThreadBundle,
  SemanticThreadNode,
  SemanticNeighborEntry,
  SemanticNeighborDetail,
  LayoutManifest,
} from '@lib/types/business';
import { normalizeRelationshipRole } from '@lib/utils/relationship-roles';
import { debugWarn } from '@lib/utils/diagnostic-adapter';

// ── Legacy state singleton (ambient typed) ────────────────────────────────────
// Imported from the legacy JS tree via @legacy alias.  The ambient declaration
// in legacy-modules.d.ts provides the `state` export with `any` type.  All
// mutations to `state` properties are wrapped in withStateMutation() from the
// extracted TS guard.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _state: any = null;

function getState(): typeof _state {
  if (!_state) {
    // Lazy-initialise from the legacy singleton at first use.
    // At bundle time the Vite @legacy alias resolves to js/.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      _state = require('@legacy/state.js').state;
    } catch {
      // During Vite dev/build the CJS require won't resolve.
      // The state will be lazily assigned via _attachLegacyState().
      _state = null;
    }
  }
  return _state;
}

/**
 * Attach the legacy state singleton explicitly (called by the engine bridge
 * during init so the module can access the same state object the Three.js
 * engine reads from).
 */
export function attachLegacyState(stateRef: Record<string, unknown>): void {
  _state = stateRef;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SEMANTIC_THREAD_RETRY_DELAYS_MS = [2500, 8000, 15000] as const;

// ── Worker singleton ──────────────────────────────────────────────────────────

let _dataWorker: Worker | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildAssetUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  return new URL(path, window.location.href).href;
}

function artifactNameFromUrl(url: string): string {
  try {
    return (
      (new URL(url, window.location.href).pathname.split('/').pop() ||
        url.split('?')[0]) ??
      url
    );
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
    _dataWorker = new Worker('js/workers/data-worker.js');
    return _dataWorker;
  } catch (err) {
    console.warn(
      'Web Worker instantiation failed for threads, using main-thread fallback.',
      err,
    );
    return null;
  }
}

// ── Layout manifest loading ───────────────────────────────────────────────────

async function _loadSemanticSpaceLayoutManifest(
  cacheBust: number,
): Promise<Record<string, unknown>> {
  const manifestUrl = buildAssetUrl(
    `semantic_space_layout_manifest.json?v=${cacheBust}`,
  );
  const response = await fetch(manifestUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`semantic space manifest unavailable (${response.status})`);
  }
  const manifest: unknown = await response.json();
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    Array.isArray(manifest)
  ) {
    throw new Error('semantic space manifest is not an object');
  }
  return manifest as Record<string, unknown>;
}

function _basename(value: unknown): string {
  if (!value) return '';
  return String(value).replaceAll('\\', '/').split('/').pop() || '';
}

function _countThreadEdges(bundle: SemanticThreadBundle): number {
  const nodes =
    bundle?.nodes && typeof bundle.nodes === 'object' ? bundle.nodes : {};
  return Object.values(nodes).reduce(
    (sum, node) =>
      sum + (Array.isArray(node?.neighbors) ? node.neighbors.length : 0),
    0,
  );
}

interface LayoutValidationSummary {
  generatedAt: string | null;
  method: string | null;
  rows: number;
  edges: number;
  threadArtifact: string | null;
}

function _validateSemanticSpaceLayoutManifest(
  manifest: Record<string, unknown>,
  bundle: SemanticThreadBundle,
  artifactName: string | null,
): LayoutValidationSummary {
  const nodes =
    bundle?.nodes && typeof bundle.nodes === 'object' ? bundle.nodes : {};
  const nodeCount = Object.keys(nodes).length;
  const edgeCount = _countThreadEdges(bundle);
  const state = getState();
  const pointCount = Array.isArray(state?.points) ? state.points.length : 0;
  const rows = Number(manifest.rows);
  const edges = Number(manifest.edges);
  const manifestThreadName = _basename(manifest.thread_path);
  const loadedThreadName = artifactName ? _basename(artifactName) : '';

  const failures: string[] = [];
  if (!Number.isFinite(rows) || rows <= 0)
    failures.push('rows must be a positive number');
  if (!Number.isFinite(edges) || edges <= 0)
    failures.push('edges must be a positive number');
  if (rows !== nodeCount)
    failures.push(`rows ${rows} != semantic nodes ${nodeCount}`);
  if (pointCount > 0 && rows !== pointCount)
    failures.push(`rows ${rows} != loaded points ${pointCount}`);
  if (edges !== edgeCount)
    failures.push(`edges ${edges} != semantic edges ${edgeCount}`);
  if (manifestThreadName && loadedThreadName && manifestThreadName !== loadedThreadName) {
    failures.push(
      `thread_path ${manifestThreadName} != loaded artifact ${loadedThreadName}`,
    );
  }
  if (
    _basename(manifest.data_path) &&
    _basename(manifest.data_path) !== 'data.dat'
  ) {
    failures.push(
      `data_path must reference data.dat, got ${_basename(manifest.data_path)}`,
    );
  }

  if (failures.length) {
    throw new Error(
      `semantic space manifest mismatch: ${failures.join('; ')}`,
    );
  }

  return {
    generatedAt: (manifest.generated_at as string) || null,
    method: (manifest.method as string) || null,
    rows,
    edges,
    threadArtifact: loadedThreadName || manifestThreadName || null,
  };
}

async function _guardSemanticSpaceLayout(
  bundle: SemanticThreadBundle,
  artifactName: string | null,
  cacheBust: number,
): Promise<LayoutValidationSummary> {
  const manifest = await _loadSemanticSpaceLayoutManifest(cacheBust);
  const summary = _validateSemanticSpaceLayoutManifest(
    manifest,
    bundle,
    artifactName,
  );
  const state = getState();
  withStateMutation(() => {
    state.semanticSpaceLayoutManifest = manifest;
    state.semanticSpaceLayoutStatus = 'ready';
    state.semanticSpaceLayoutError = null;
  });
  _recordSemanticLaneSnapshot({
    semantic_space_layout_status: 'ready',
    semantic_space_layout_rows: summary.rows,
    semantic_space_layout_edges: summary.edges,
    semantic_space_layout_thread_artifact: summary.threadArtifact,
    semantic_space_layout_generated_at: summary.generatedAt,
  });
  return summary;
}

// ── Worker communication ──────────────────────────────────────────────────────

interface WorkerResponse {
  type: string;
  payload: unknown;
}

interface WorkerThreadResult {
  neighborEntries: Array<[string, SemanticThreadNode]>;
  artifactName: string;
  bundle: SemanticThreadBundle;
}

function callWorker(
  type: string,
  payload: unknown,
): Promise<WorkerThreadResult> {
  return new Promise((resolve, reject) => {
    const worker = getWorker();
    if (!worker) {
      reject(new Error('Worker unavailable'));
      return;
    }

    const handler = (event: MessageEvent<WorkerResponse>): void => {
      const { type: resType, payload: resPayload } = event.data;
      if (resType === `${type}_SUCCESS`) {
        worker.removeEventListener('message', handler);
        resolve(resPayload as WorkerThreadResult);
      } else if (resType === 'ERROR') {
        worker.removeEventListener('message', handler);
        _dataWorker = null;
        reject(
          new Error(
            (resPayload as { message?: string })?.message || 'Worker failed',
          ),
        );
      }
    };

    worker.addEventListener('message', handler);
    worker.postMessage({ type, payload });
  });
}

// ── Neighbor normalization helpers ────────────────────────────────────────────

function _normalizeLeadId(id: unknown): string | null {
  if (id === null || id === undefined) return null;
  const s = String(id).trim();
  return s.length > 0 ? s : null;
}

function _cleanOptionalValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

/**
 * Build a Map<leadId, SemanticNeighborEntry> from a raw SemanticThreadBundle.
 * Writes the result into state.semanticNeighborMapByLeadId.
 */
function _buildSemanticNeighborMap(
  bundle: SemanticThreadBundle,
): void {
  const state = getState();
  withStateMutation(() => {
    state.semanticNeighborMapByLeadId = new Map<
      string,
      SemanticNeighborEntry
    >();
  });
  if (!bundle?.nodes || typeof bundle.nodes !== 'object') return;

  Object.entries(bundle.nodes).forEach(([fallbackLeadId, node]) => {
    const leadId = _normalizeLeadId(node?.lead_id ?? fallbackLeadId);
    if (!leadId) return;

    const neighbors: SemanticNeighborDetail[] = Array.isArray(node?.neighbors)
      ? node.neighbors
          .map((neighbor) => {
            const nLeadId = _normalizeLeadId(neighbor?.lead_id);
            if (!nLeadId) return null;
            return {
              leadId: nLeadId,
              score: Number(neighbor?.score ?? 0),
              semanticScore: Number(neighbor?.semantic_score ?? 0),
              sameCity: Boolean(neighbor?.same_city),
              sameStatus: Boolean(neighbor?.same_status),
              bridgeScore: Number(neighbor?.bridge_score ?? 0),
              signalScore: Number(neighbor?.signal_score ?? 0),
              threadType:
                _cleanOptionalValue(neighbor?.thread_type) ||
                'local_semantic_neighbor',
              relationshipRole: normalizeRelationshipRole(
                neighbor?.relationship_role,
              ) as SemanticNeighborDetail['relationshipRole'],
              relationshipAxis:
                _cleanOptionalValue(neighbor?.relationship_axis) || '',
              roleReason:
                _cleanOptionalValue(neighbor?.role_reason) || '',
              reason:
                _cleanOptionalValue(neighbor?.reason) ||
                'semantic neighbor',
            };
          })
          .filter((n): n is SemanticNeighborDetail => n !== null)
      : [];

    state.semanticNeighborMapByLeadId.set(leadId, {
      leadId,
      name: node?.name || null,
      city: node?.city || null,
      status: node?.status || null,
      signalScore: Number(node?.signal_score ?? 0),
      neighbors,
    });
  });
}

function _normalizeSemanticNeighborEntries(
  neighborEntries: Array<[string, SemanticThreadNode]>,
): Array<[string, SemanticNeighborEntry]> {
  if (!Array.isArray(neighborEntries)) return [];
  return neighborEntries.map(([leadId, node]) => [
    leadId,
    {
      leadId,
      name: node?.name ?? null,
      city: node?.city ?? null,
      status: node?.status ?? null,
      signalScore: Number(node?.signal_score ?? 0),
      neighbors: Array.isArray(node?.neighbors)
        ? node.neighbors.map((neighbor) => ({
            leadId: _normalizeLeadId(neighbor?.lead_id) ?? '',
            score: Number(neighbor?.score ?? 0),
            semanticScore: Number(neighbor?.semantic_score ?? 0),
            sameCity: Boolean(neighbor?.same_city),
            sameStatus: Boolean(neighbor?.same_status),
            bridgeScore: Number(neighbor?.bridge_score ?? 0),
            signalScore: Number(neighbor?.signal_score ?? 0),
            threadType:
              _cleanOptionalValue(neighbor?.thread_type) ||
              'local_semantic_neighbor',
            relationshipRole: normalizeRelationshipRole(
              neighbor?.relationship_role,
            ) as SemanticNeighborDetail['relationshipRole'],
            relationshipAxis:
              _cleanOptionalValue(neighbor?.relationship_axis) || '',
            roleReason:
              _cleanOptionalValue(neighbor?.role_reason) || '',
            reason:
              _cleanOptionalValue(neighbor?.reason) ||
              'semantic neighbor',
          }))
        : [],
    },
  ]);
}

// ── Semantic lane snapshot ────────────────────────────────────────────────────

function _recordSemanticLaneSnapshot(
  partial: Record<string, unknown> = {},
): void {
  // In the TS port, semantic lane snapshots are recorded via the
  // lifecycle orchestration module.  This is a no-op during direct
  // port — the actual recording happens when the lifecycle bridge
  // adapter calls into the legacy semantic-lane module.
  void partial;
}

// ── Focused state refresh ─────────────────────────────────────────────────────

function _refreshFocusedSemanticState(): void {
  // No-op in the direct port.  Focused state refresh is handled by
  // the Svelte store subscriptions in the UI layer.
}

// ── Retry timer management ────────────────────────────────────────────────────

function _clearSemanticThreadsRetryTimer(): void {
  const state = getState();
  withStateMutation(() => {
    if (state.semanticThreadsRetryTimer) {
      window.clearTimeout(state.semanticThreadsRetryTimer);
      state.semanticThreadsRetryTimer = null;
    }
  });
}

function _scheduleSemanticThreadsRetry(
  reason = 'artifact-retry',
): void {
  const state = getState();
  if (
    state.semanticThreadsStatus === 'ready' ||
    state.semanticThreadsLoadPromise ||
    state.semanticThreadsRetryTimer
  )
    return;

  if (typeof state.semanticThreadsRetryAttempt !== 'number') {
    withStateMutation(() => {
      state.semanticThreadsRetryAttempt = 0;
    });
  }

  const MAX_RETRIES = 5;
  if (state.semanticThreadsRetryAttempt >= MAX_RETRIES) {
    debugWarn(
      `loadSemanticThreads: max retries (${MAX_RETRIES}) reached, giving up`,
    );
    _updateSemanticThreadsStatus('failed');
    return;
  }

  const delayMs =
    SEMANTIC_THREAD_RETRY_DELAYS_MS[
      Math.min(
        Number.isFinite(state.semanticThreadsRetryAttempt)
          ? state.semanticThreadsRetryAttempt
          : 0,
        SEMANTIC_THREAD_RETRY_DELAYS_MS.length - 1,
      )
    ] || 15000;

  _recordSemanticLaneSnapshot({
    thread_retry_source: reason,
    thread_retry_count: state.semanticThreadsRetryAttempt + 1,
    thread_retry_wait_until: new Date(Date.now() + delayMs).toISOString(),
  });

  withStateMutation(() => {
    state.semanticThreadsRetryAttempt += 1;
    state.semanticThreadsRetryTimer = window.setTimeout(() => {
      withStateMutation(() => {
        state.semanticThreadsRetryTimer = null;
      });
      loadSemanticThreads({ reason }).catch((err: unknown) => {
        debugWarn('loadSemanticThreads retry failed:', err);
      });
    }, delayMs);
  });
}

// ── Status mutator ────────────────────────────────────────────────────────────

function _updateSemanticThreadsStatus(
  status: 'idle' | 'loading' | 'ready' | 'failed',
): void {
  const state = getState();
  withStateMutation(() => {
    state.semanticThreadsStatus = status;
  });
}

// ── Finalize ──────────────────────────────────────────────────────────────────

function finalizeThreadLoad(): void {
  const state = getState();

  if (new URLSearchParams(window.location.search).has('debug')) {
    debugWarn('[semantic-threads] artifact loaded', {
      artifact: state.semanticThreadArtifactName,
      records: state.semanticNeighborMapByLeadId.size,
    });
  }

  _updateSemanticThreadsStatus(
    state.semanticNeighborMapByLeadId.size > 0 ? 'ready' : 'failed',
  );

  _recordSemanticLaneSnapshot({
    thread_artifact_status: state.semanticThreadsStatus,
    thread_artifact_name: state.semanticThreadArtifactName,
    semantic_space_layout_status: state.semanticSpaceLayoutStatus,
    thread_retry_source: null,
    thread_retry_count:
      state.semanticThreadsStatus === 'ready'
        ? 0
        : state.semanticThreadsRetryAttempt,
    thread_retry_wait_until: null,
  });

  if (state.semanticThreadsStatus !== 'ready') {
    withStateMutation(() => {
      state.semanticThreadsLoadPromise = null;
    });
    _scheduleSemanticThreadsRetry('empty-artifact');
  } else {
    withStateMutation(() => {
      state.semanticThreadsRetryAttempt = 0;
    });
  }

  _refreshFocusedSemanticState();
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface LoadSemanticThreadsOptions {
  reason?: string;
}

/**
 * Load the semantic thread neighbor artifact, populating
 * state.semanticNeighborMapByLeadId.
 *
 * Attempts Web Worker parsing first; falls back to main-thread
 * fetch + JSON parse on failure.
 */
export async function loadSemanticThreads(
  options: LoadSemanticThreadsOptions = {},
): Promise<boolean> {
  const state = getState();
  if (state.semanticThreadsLoadPromise)
    return state.semanticThreadsLoadPromise as Promise<boolean>;

  const cacheBust = Math.floor(Date.now() / (1000 * 60 * 60));
  const requestUrls = [
    buildAssetUrl(`semantic_threads_ui.dat?v=${cacheBust}`),
    buildAssetUrl(`semantic_threads.dat?v=${cacheBust}`),
  ];
  const attemptConfigs: RequestCache[] = [
    'default',
    'force-cache',
    'reload',
    'no-store',
  ];

  _updateSemanticThreadsStatus('loading');

  const loadPromise = (async (): Promise<boolean> => {
    try {
      _clearSemanticThreadsRetryTimer();

      // 1. Attempt Worker-Based Loading
      const worker = getWorker();
      if (worker) {
        try {
          const { neighborEntries, artifactName, bundle } = await callWorker(
            'LOAD_THREADS',
            { urls: requestUrls, attemptConfigs },
          );
          await _guardSemanticSpaceLayout(bundle, artifactName, cacheBust);
          withStateMutation(() => {
            state.semanticThreadBundle = bundle;
            state.semanticThreadArtifactName = artifactName;
            state.semanticNeighborMapByLeadId = new Map(
              _normalizeSemanticNeighborEntries(neighborEntries),
            );
          });
          finalizeThreadLoad();
          return true;
        } catch (err) {
          console.warn(
            'Worker-based thread loading failed, falling back to main thread.',
            err,
          );
          _dataWorker = null;
        }
      }

      // 2. Main-Thread Fallback
      let bundle: SemanticThreadBundle | null = null;
      let loadedArtifactName: string | null = null;
      let lastError: Error | null = null;

      outer: for (
        let requestIndex = 0;
        requestIndex < requestUrls.length;
        requestIndex++
      ) {
        const requestUrl = requestUrls[requestIndex]!;
        const threadArtifactName = artifactNameFromUrl(requestUrl);
        for (let attempt = 0; attempt < attemptConfigs.length; attempt++) {
          try {
            const response = await fetch(requestUrl, {
              cache: attemptConfigs[attempt],
            });
            if (!response.ok)
              throw new Error(
                `semantic thread artifact unavailable (${response.status})`,
              );
            bundle = (await response.json()) as SemanticThreadBundle;
            loadedArtifactName = threadArtifactName;
            break outer;
          } catch (error) {
            lastError =
              error instanceof Error ? error : new Error(String(error));
            if (attempt < attemptConfigs.length - 1) {
              await new Promise((resolve) =>
                setTimeout(resolve, 220 * (attempt + 1)),
              );
            }
          }
        }
      }

      if (!bundle)
        throw lastError || new Error('semantic thread artifact unavailable');

      withStateMutation(() => {
        state.semanticThreadBundle = bundle;
        state.semanticThreadArtifactName = loadedArtifactName;
      });
      await _guardSemanticSpaceLayout(
        bundle,
        loadedArtifactName,
        cacheBust,
      );
      _buildSemanticNeighborMap(bundle);
      finalizeThreadLoad();
      return state.semanticNeighborMapByLeadId.size > 0;
    } catch (error) {
      console.warn(
        'Failed to load semantic thread artifact; using geometric fallback.',
        error,
      );
      const errMessage =
        error instanceof Error ? error.message : String(error);
      withStateMutation(() => {
        state.semanticThreadBundle = null;
        state.semanticThreadArtifactName = null;
        state.semanticSpaceLayoutManifest = null;
        state.semanticSpaceLayoutStatus = 'failed';
        state.semanticSpaceLayoutError = errMessage;
        state.semanticNeighborMapByLeadId = new Map();
      });
      _updateSemanticThreadsStatus('failed');
      state.semanticThreadsLoadPromise = null;
      _recordSemanticLaneSnapshot({
        thread_artifact_status: 'failed',
        thread_artifact_name: null,
        semantic_space_layout_status: state.semanticSpaceLayoutStatus,
        semantic_space_layout_error: state.semanticSpaceLayoutError,
        thread_retry_source: options.reason || 'artifact-load',
        thread_retry_count: state.semanticThreadsRetryAttempt,
      });
      _scheduleSemanticThreadsRetry(options.reason || 'artifact-load');
      _refreshFocusedSemanticState();
      return false;
    }
  })();

  withStateMutation(() => {
    state.semanticThreadsLoadPromise = loadPromise;
  });

  return loadPromise;
}

export default loadSemanticThreads;
