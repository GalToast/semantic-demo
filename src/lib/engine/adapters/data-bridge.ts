/**
 * @lib/engine/adapters/data-bridge.ts — Data loading orchestration and dataset syncing
 *
 * Responsible for synchronising Svelte data stores (business records, position
 * buffers, enrichment maps) into the legacy state singleton so the Three.js
 * engine can consume them during init and rebuild.
 *
 * DESIGN PRINCIPLES
 * ─────────────────
 * 1. SINGLE RESPONSIBILITY.  This adapter only handles data sync.  It does not
 *    touch camera, search, or lifecycle logic.
 * 2. STATE MUTATION AWARE.  Uses `ctx._withMutation()` for critical properties
 *    that the legacy Proxy guards (rawPositionsBuffer, rawClustersBuffer, etc.).
 * 3. TIMEOUT-AWARE.  Polls Svelte stores for readiness with a 15-second ceiling
 *    so the engine init does not hang indefinitely.
 */

import { get } from 'svelte/store';
import {
  isDataReady,
  businessRecords,
  positionBuffer,
  clustersBuffer,
  leadEnrichment,
  pointIndexByLeadId,
} from '@lib/data-store';
import type { BridgeContext } from './types';

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Ensure the legacy state singleton has the latest data from Svelte stores.
 *
 * If data is already loaded (`isDataReady` is true), syncs immediately.
 * Otherwise polls every 200ms up to 15 seconds, then gives up.
 *
 * Called by the lifecycle adapter during engine init BEFORE initThreeJS()
 * so that createPoints() reads valid state.points / state.rawPositionsBuffer.
 */
export async function syncDataToLegacyState(ctx: BridgeContext): Promise<void> {
  if (!ctx._state) return;

  if (get(isDataReady)) {
    _syncDataFields(ctx);
    return;
  }

  // Poll for data readiness (records loading from data.dat is async)
  const start = Date.now();
  while (!get(isDataReady) && Date.now() - start < 15000) {
    await new Promise((r) => setTimeout(r, 200));
  }

  if (!get(isDataReady)) {
    console.warn(
      '[EngineBridge] syncDataToLegacyState: data not ready after 15s, proceeding anyway'
    );
  }

  _syncDataFields(ctx);
}

// ── Internal ─────────────────────────────────────────────────────────────────

/**
 * Read the current value from each Svelte store and assign it to the
 * corresponding field on the legacy state singleton.
 *
 * Fields guarded by the legacy Proxy (rawPositionsBuffer, rawClustersBuffer,
 * points) are wrapped in ctx._withMutation() to satisfy production guards.
 */
function _syncDataFields(ctx: BridgeContext): void {
  if (!ctx._state) return;

  const records = get(businessRecords);
  const posBuf = get(positionBuffer);
  const clustBuf = get(clustersBuffer);
  const enrichment = get(leadEnrichment);
  const indexMap = get(pointIndexByLeadId);

  // CRITICAL_KEYS must route through withStateMutation
  ctx._withMutation(() => {
    if (records.length > 0) {
      ctx._state!.points = records as unknown as Array<{
        x: number; y: number; z: number; cluster: number; lead_id?: number | null;
      }>;
    }
    if (posBuf) {
      ctx._state!.rawPositionsBuffer = posBuf;
    }
    if (clustBuf) {
      ctx._state!.rawClustersBuffer = clustBuf;
    }
  });

  // Non-critical properties can be set directly
  if (enrichment) {
    ctx._state.leadEnrichment = enrichment as unknown as Record<string, unknown>;
  }
  if (indexMap) {
    ctx._state.pointIndexByLeadId = indexMap as unknown as Map<string, number>;
  }
}
