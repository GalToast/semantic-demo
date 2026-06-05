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
import {
  loadBusinessData,
  loadSemanticThreads,
  loadLayoutManifest,
} from '@lib/data-loader';

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

// ── Derived Stores ────────────────────────────────────────────────────────────

/** Number of loaded business records */
export const recordCount = derived(businessRecords, ($r) => $r.length);

/** Whether all data is ready */
export const isDataReady = derived(dataLoadState, ($s) => $s.status === 'ready');

/** Whether data is currently loading */
export const isLoading = derived(dataLoadState, ($s) => $s.status === 'loading');

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
    console.warn('[data-store] initData() called while', current.status);
    return;
  }

  setDataLoadStatus('loading');
  console.log('[data-store] Starting data initialization...');

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
      console.log('[data-store] Business records loaded.');
    } else {
      const msg =
        businessResult.reason instanceof Error
          ? businessResult.reason.message
          : String(businessResult.reason);
      console.error('[data-store] Failed to load business records:', msg);
      setDataLoadError(`Business data failed: ${msg}`);
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
      console.log('[data-store] Semantic threads loaded.');
    } else {
      const msg =
        threadResult.reason instanceof Error
          ? threadResult.reason.message
          : String(threadResult.reason);
      console.warn(
        '[data-store] Semantic threads failed (geometric fallback):',
        msg
      );
      // Don't error — threads are optional
    }

    dataLoadState.update((s) => ({
      ...s,
      status: 'ready',
      error: null,
    }));
    console.log('[data-store] Data initialization complete.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[data-store] Unexpected error during init:', msg);
    setDataLoadError(msg);
  }
}
