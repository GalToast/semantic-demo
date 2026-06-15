/**
 * @lib/data-store.ts — Data stores for business records and semantic threads
 *
 * Replaces the data slices from js/state.js with Svelte stores.
 * The stores are populated by loadBusinessData() and loadSemanticThreads()
 * from data-loader.ts, orchestrated by initData().
 */

import { writable, derived, get } from 'svelte/store';
import type {
  BusinessRecord,
  BusinessDataResult,
  SemanticThreadBundle,
  SemanticThreadDataResult,
  SemanticNeighborEntry,
  LayoutManifest,
  PositionBufferDescriptor,
} from '@lib/types/business';
import type { LoadingPhase } from '@lib/types/state';
import {
  loadBusinessData,
  loadSemanticThreads,
  loadLayoutManifest,
} from '@lib/data-loader';
import { debugInfo, debugWarn } from '@lib/utils/diagnostic-adapter';
import { state as legacyState, withStateMutation } from '@lib/engine/state-bridge';

// ── Status Types ──────────────────────────────────────────────────────────────

export type DataLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface DataLoadState {
  /** Overall loading status */
  status: DataLoadStatus;
  /** Business records loaded successfully */
  businessLoaded: boolean;
  /** Semantic threads loaded successfully */
  threadsLoaded: boolean;
  /** Error message if status is 'error' */
  error: string | null;
}

// ── Stores ────────────────────────────────────────────────────────────────────

/** Raw business records loaded from data.dat */
export const businessRecords = writable<readonly BusinessRecord[]>([]);

/**
 * Hydrate the Svelte stores from the legacy state.
 * The Svelte build is layered on top of the legacy code; during the
 * migration the legacy init path still loads records into __APP_STATE__.points
 * and the Svelte stores need to be populated from that source so reactive
 * components can read the data.
 */
export function hydrateFromLegacyState(): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as {
    __APP_STATE__?: {
      points?: readonly BusinessRecord[];
      semanticNeighborMapByLeadId?: Map<string, unknown>;
      semanticThreadsStatus?: string;
      semanticSpaceLayoutManifest?: unknown;
      threadCandidates?: readonly number[];
      threadSource?: string;
    };
  };
  const appState = w.__APP_STATE__;
  if (!appState) return;
  if (Array.isArray(appState.points) && appState.points.length > 0) {
    businessRecords.set(appState.points as BusinessRecord[]);
  }
  if (appState.semanticNeighborMapByLeadId instanceof Map) {
    semanticNeighborMap.set(appState.semanticNeighborMapByLeadId as Map<string, SemanticNeighborEntry>);
  }
}

/** Synchronous snapshot of business records. */
export function getBusinessRecords(): readonly BusinessRecord[] {
  let result: readonly BusinessRecord[] = [];
  const unsub = businessRecords.subscribe((v) => { result = v; });
  unsub();
  if (result.length > 0) return result;
  // Fallback: read from the legacy state when the Svelte store is empty.
  // (Hydration may not have run yet for components created before main.ts calls
  // hydrateFromLegacyState.)
  if (typeof window !== 'undefined') {
    const w = window as unknown as { __APP_STATE__?: { points?: readonly BusinessRecord[] } };
    const points = w.__APP_STATE__?.points;
    if (Array.isArray(points) && points.length > 0) {
      return points;
    }
  }
  return result;
}

/** Float32Array of interleaved [x,y,z] positions in [0,1] unit cube */
export const positionBuffer = writable<Float32Array | null>(null);

/** Uint16Array of cluster assignments per point (parallel to positions) */
export const clustersBuffer = writable<Uint16Array | null>(null);

/** Map from lead_id to point index for O(1) lookup */
export const pointIndexByLeadId = writable<Map<string, number>>(new Map());

/** Enrichment data keyed by lead_id */
export const leadEnrichment = writable<Record<string, import('@lib/types/business').LeadEnrichment> | null>(null);

/** Raw semantic thread bundle */
export const semanticThreadBundle = writable<SemanticThreadBundle | null>(null);

/** Name of the loaded thread artifact file */
export const semanticThreadArtifactName = writable<string | null>(null);

/** Normalized neighbor map keyed by lead_id */
export const semanticNeighborMap = writable<Map<string, SemanticNeighborEntry>>(new Map());

/** Semantic space layout manifest (validation metadata) */
export const layoutManifest = writable<LayoutManifest | null>(null);

/** Overall data loading state */
export const dataLoadState = writable<DataLoadState>({
  status: 'idle',
  businessLoaded: false,
  threadsLoaded: false,
  error: null,
});

// ── Loading Phase Store ─────────────────────────────────────────────────────

/**
 * Four-phase loading progression: records → scene → restore → launch.
 * The LoadingOverlay and parity-attrs layer read from this store.
 * Replaces the collapsed 2-state derivation that only had records/launch.
 */
export const loadingPhaseStore = writable<LoadingPhase>('records');

/**
 * Graphics mode: 'webgl' when GPU rendering is available, 'fallback' otherwise.
 * The engine bridge should set this during init; parity-attrs reads it.
 */
export const graphicsModeStore = writable<'webgl' | 'fallback'>('webgl');

/**
 * Set the loading phase and sync body.dataset for legacy test compat.
 */
export function setLoadingPhase(phase: LoadingPhase): void {
  loadingPhaseStore.set(phase);
  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.loadingPhase = phase;
  }
}

/**
 * Set the graphics mode and sync body.dataset.
 */
export function setGraphicsMode(mode: 'webgl' | 'fallback'): void {
  graphicsModeStore.set(mode);
  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.graphicsMode = mode;
  }
}

// ── Derived Stores ────────────────────────────────────────────────────────────

/** Number of loaded business records */
export const recordCount = derived(businessRecords, ($r) => $r.length);

/** Whether all data is ready */
export const isDataReady = derived(dataLoadState, ($s) => $s.status === 'ready');

/** Whether data is currently loading */
export const isLoading = derived(dataLoadState, ($s) => $s.status === 'loading');

// ── Getter wrappers (match the .svelte.ts API for compatibility) ──────────

export function getPositionBuffer(): Float32Array | null { return get(positionBuffer); }
export function getClustersBuffer(): Uint16Array | null { return get(clustersBuffer); }
export function getPointIndexByLeadId(): Map<string, number> { return get(pointIndexByLeadId); }
export function getLeadEnrichment(): Record<string, import('@lib/types/business').LeadEnrichment> | null { return get(leadEnrichment); }
export function getSemanticThreadBundle(): SemanticThreadBundle | null { return get(semanticThreadBundle); }
export function getSemanticThreadArtifactName(): string | null { return get(semanticThreadArtifactName); }
export function getSemanticNeighborMap(): Map<string, SemanticNeighborEntry> { return get(semanticNeighborMap); }
export function getLayoutManifest(): LayoutManifest | null { return get(layoutManifest); }
export function getDataLoadState(): DataLoadState { return get(dataLoadState); }
export function getLoadingPhaseStore(): LoadingPhase { return get(loadingPhaseStore); }
export function getGraphicsModeStore(): 'webgl' | 'fallback' { return get(graphicsModeStore); }
export function getRecordCount(): number { return get(recordCount); }
export function getIsDataReady(): boolean {
  const local = get(isDataReady);
  if (local) return true;
  // Fallback: if the Svelte dataLoadState hasn't been initialized but the
  // legacy state has the data loaded, treat the data as ready.
  if (typeof window !== 'undefined') {
    const w = window as unknown as { __APP_STATE__?: { points?: readonly unknown[] } };
    if (Array.isArray(w.__APP_STATE__?.points) && (w.__APP_STATE__?.points?.length ?? 0) > 0) {
      return true;
    }
  }
  return false;
}
export function getIsLoading(): boolean { return get(isLoading); }
export function getPositionDescriptor(): PositionBufferDescriptor | null { return get(positionDescriptor); }
export function getThreadEdgeCount(): number { return get(threadEdgeCount); }
export function getNeighborMapSize(): number { return get(neighborMapSize); }

/** Position buffer as a PositionBufferDescriptor (ready for WebGL) */
export const positionDescriptor = derived(
  [positionBuffer, clustersBuffer],
  ([$pos, $clust]): PositionBufferDescriptor | null => {
    if (!$pos || !$clust) return null;
    return {
      buffer: $pos,
      count: $pos.length / 3,
      clusters: $clust,
    };
  }
);

/** Total number of semantic thread edges */
export const threadEdgeCount = derived(semanticThreadBundle, ($bundle) => {
  if (!$bundle?.nodes) return 0;
  return Object.values($bundle.nodes).reduce(
    (sum, node) =>
      sum + (Array.isArray(node?.neighbors) ? node.neighbors.length : 0),
    0
  );
});

/** Number of entries in the semantic neighbor map */
export const neighborMapSize = derived(
  semanticNeighborMap,
  ($map) => $map.size
);

// ── Actions ───────────────────────────────────────────────────────────────────

/**
 * Set business data from a load result.
 */
export function setBusinessData(result: BusinessDataResult): void {
  businessRecords.set(result.records);
  positionBuffer.set(result.positionsBuffer);
  clustersBuffer.set(result.clustersBuffer);
  pointIndexByLeadId.set(result.pointIndexByLeadId);
  leadEnrichment.set(result.enrichment);

  // Sync back to legacy state so legacy engine selectors (getPoints())
  // and focus flows (focusOnNode) see the data.
  try {
    withStateMutation(() => {
      (legacyState as any).points = result.records;
      (legacyState as any).rawPositionsBuffer = result.positionsBuffer;
      (legacyState as any).rawClustersBuffer = result.clustersBuffer;
      (legacyState as any).leadEnrichment = result.enrichment;
      (legacyState as any).pointIndexByLeadId = result.pointIndexByLeadId;
    });
  } catch (e) {
    console.warn('[data-store] Legacy state sync failed:', e);
  }
  dataLoadState.update((s) => ({
    ...s,
    businessLoaded: true,
    error: null,
  }));
}

/**
 * Set semantic thread data from a load result.
 */
export function setSemanticThreadData(
  result: SemanticThreadDataResult
): void {
  semanticThreadBundle.set(result.bundle);
  semanticThreadArtifactName.set(result.artifactName);
  semanticNeighborMap.set(result.neighborMap);
  layoutManifest.set(result.layoutManifest);

  // Sync back to legacy state so legacy neighborhood / thread builders see the data.
  try {
    withStateMutation(() => {
      (legacyState as any).semanticNeighborMapByLeadId = result.neighborMap;
      (legacyState as any).semanticThreadBundle = result.bundle;
      (legacyState as any).semanticThreadArtifactName = result.artifactName;
    });
  } catch (e) {
    console.warn('[data-store] Legacy semantic thread sync failed:', e);
  }

  dataLoadState.update((s) => ({
    ...s,
    threadsLoaded: true,
    error: null,
  }));
}

/**
 * Set the loading status.
 */
export function setDataLoadStatus(status: DataLoadStatus): void {
  dataLoadState.update((s) => ({ ...s, status }));
}

/**
 * Set a data loading error.
 */
export function setDataLoadError(error: string): void {
  dataLoadState.set({
    status: 'error',
    businessLoaded: get(dataLoadState).businessLoaded,
    threadsLoaded: get(dataLoadState).threadsLoaded,
    error,
  });
}

/**
 * Reset all data stores to initial state.
 */
export function resetDataStores(): void {
  businessRecords.set([]);
  positionBuffer.set(null);
  clustersBuffer.set(null);
  pointIndexByLeadId.set(new Map());
  leadEnrichment.set(null);
  semanticThreadBundle.set(null);
  semanticThreadArtifactName.set(null);
  semanticNeighborMap.set(new Map());
  layoutManifest.set(null);
  dataLoadState.set({
    status: 'idle',
    businessLoaded: false,
    threadsLoaded: false,
    error: null,
  });
  setLoadingPhase('records');
  setGraphicsMode('webgl');
}

// ── Orchestration ─────────────────────────────────────────────────────────────

/**
 * Initialize all data by loading business records and semantic threads.
 *
 * Business records load first (required for rendering). Semantic threads
 * load in parallel (non-blocking — the app degrades gracefully without them).
 *
 * Call this once at app startup, typically from main.ts or App.svelte.
 */
export async function initData(): Promise<void> {
  const current = get(dataLoadState);
  if (current.status === 'loading' || current.status === 'ready') {
    debugWarn('[data-store] initData() called while', current.status);
    return;
  }

  setDataLoadStatus('loading');
  setLoadingPhase('records');
  debugInfo('[data-store] Starting data initialization...');

  try {
    // Load business records (required) and semantic threads (optional) in parallel.
    // Business records must be loaded first for thread normalization,
    // but the loader itself is stateless so parallel is fine.
    const [businessResult, threadResult, manifestResult] = await Promise.allSettled([
      loadBusinessData(),
      loadSemanticThreads(),
      loadLayoutManifest(),
    ]);

    // Business records are required
    if (businessResult.status === 'fulfilled') {
      setBusinessData(businessResult.value);
      setLoadingPhase('scene');
      debugInfo('[data-store] Business records loaded.');
    } else {
      const msg =
        businessResult.reason instanceof Error
          ? businessResult.reason.message
          : String(businessResult.reason);
      console.error('[data-store] Failed to load business records:', msg);
      setDataLoadError(`Business data failed: ${msg}`);
      setLoadingPhase('launch'); // dismiss overlay on error
      return; // Can't continue without business data
    }

    // Semantic threads are optional (degrade gracefully)
    if (threadResult.status === 'fulfilled') {
      const threadData = threadResult.value;
      // Attach layout manifest if loaded separately
      if (manifestResult.status === 'fulfilled' && manifestResult.value) {
        threadData.layoutManifest = manifestResult.value;
      }
      setSemanticThreadData(threadData);
      setLoadingPhase('restore');
      debugInfo('[data-store] Semantic threads loaded.');
    } else {
      const msg =
        threadResult.reason instanceof Error
          ? threadResult.reason.message
          : String(threadResult.reason);
      debugWarn(
        '[data-store] Semantic threads failed (geometric fallback):',
        msg
      );
      setLoadingPhase('restore'); // still progress even without threads
      // Don't error — threads are optional
    }

    // Final phase: launch
    setLoadingPhase('launch');
    dataLoadState.update((s) => ({
      ...s,
      status: 'ready',
      error: null,
    }));
    debugInfo('[data-store] Data initialization complete.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[data-store] Unexpected error during init:', msg);
    setDataLoadError(msg);
    setLoadingPhase('launch'); // dismiss overlay on error
  }
}
