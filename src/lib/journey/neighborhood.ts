/**
 * @lib/journey/neighborhood.ts — Bounded neighborhood manifest and walk candidates
 *
 * Ported from: js/modules/journey-neighborhood.js
 *
 * Provides neighborhood computation utilities backed by the semantic
 * neighbor map and spatial proximity. Functions read from Svelte stores
 * (semanticNeighborMap, businessRecords, pointIndexByLeadId) to derive
 * real candidate indices, manifest metadata, and walk progression.
 */

import { get } from 'svelte/store';
import { semanticNeighborMap, businessRecords, pointIndexByLeadId, positionBuffer } from '@lib/data-store';
import { navStore } from '@lib/stores/navigation';
import { journeyStore, setTrailSeedIndex, setTrailNeighborIndices } from '@lib/stores/journey.svelte.ts';

// ── Configuration ────────────────────────────────────────────────────────────

/** Max candidates returned by buildNeighborhoodManifest. */
const MAX_MANIFEST_CANDIDATES = 18;

/** Max candidates for peer thread display. */
const MAX_PEER_THREAD_DISPLAY = 14;

// ── Module-level adapter state ───────────────────────────────────────────────

let adapterDeps: {
  isThreadCandidateVisibleOnCanvas?: (index: number) => boolean;
  setTrailFromSeed?: (seedIndex: number) => void;
  applyLocalNeighborhoodFocus?: (seedIndex: number) => void;
} = {};

let boundedNeighborhoodActive = false;
let boundedNeighborhoodAnchorIndex: number | null = null;
let boundedNeighborhoodCandidates: number[] = [];

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve neighbor indices from the semantic neighbor map for a given anchor.
 * Returns up to `limit` candidate indices sorted by semantic score descending.
 */
function resolveSemanticNeighbors(
  anchorIndex: number,
  limit: number = MAX_MANIFEST_CANDIDATES
): Array<{ index: number; score: number; reason: string; source: string }> {
  const records = get(businessRecords);
  const nMap = get(semanticNeighborMap);
  const idxMap = get(pointIndexByLeadId);

  if (!records.length || nMap.size === 0 || idxMap.size === 0) return [];

  const anchorRecord = records[anchorIndex];
  if (!anchorRecord?.lead_id) return [];

  const entry = nMap.get(anchorRecord.lead_id);
  if (!entry?.neighbors?.length) return [];

  const results: Array<{ index: number; score: number; reason: string; source: string }> = [];
  const seen = new Set<number>([anchorIndex]);

  for (const n of entry.neighbors) {
    const nIdx = idxMap.get(n.leadId);
    if (nIdx === undefined || seen.has(nIdx)) continue;
    seen.add(nIdx);

    const score = Number.isFinite(n.semanticScore)
      ? n.semanticScore
      : Number.isFinite(n.score)
        ? n.score
        : 0;

    results.push({
      index: nIdx,
      score,
      reason: n.reason || 'semantic neighbor',
      source: 'semantic'
    });

    if (results.length >= limit) break;
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  return results;
}

/**
 * Resolve geometric neighbors using the position buffer (spatial proximity fallback).
 */
function resolveGeometricNeighbors(
  anchorIndex: number,
  limit: number
): Array<{ index: number; score: number; reason: string; source: string }> {
  const positions = get(positionBuffer);
  const records = get(businessRecords);
  if (!positions || !records.length) return [];

  const count = Math.min(records.length, positions.length / 3);
  const anchorOffset = anchorIndex * 3;
  if (anchorOffset + 2 >= positions.length) return [];

  const ax = positions[anchorOffset] as number;
  const ay = positions[anchorOffset + 1] as number;
  const az = positions[anchorOffset + 2] as number;
  if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(az)) return [];

  const candidates: Array<{ index: number; score: number; reason: string; source: string }> = [];
  const stride = Math.max(1, Math.floor(count / 500));

  for (let i = 0; i < count; i += stride) {
    if (i === anchorIndex) continue;
    const offset = i * 3;
    const px = positions[offset] as number;
    const py = positions[offset + 1] as number;
    const pz = positions[offset + 2] as number;
    if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) continue;

    const dist = Math.hypot(px - ax, py - ay, pz - az);
    if (!Number.isFinite(dist) || dist < 0.0001) continue;

    candidates.push({
      index: i,
      score: 1 / Math.max(dist, 0.0001),
      reason: 'geometric proximity',
      source: 'geometric-fallback'
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the semantic thread display limit based on viewport.
 * Ported from journey-neighborhood.js getSemanticThreadDisplayLimit().
 */
export function getSemanticThreadDisplayLimit(): number {
  return MAX_MANIFEST_CANDIDATES;
}

/**
 * Get the semantic peer thread display limit.
 * Ported from journey-neighborhood.js getSemanticPeerThreadDisplayLimit().
 */
export function getSemanticPeerThreadDisplayLimit(candidateCount: number): number {
  const peerCount = Math.max(0, (candidateCount || 1) - 1);
  return Math.min(MAX_PEER_THREAD_DISPLAY, peerCount);
}

/**
 * Get neighborhood route indices from the nav state.
 * Ported from journey-neighborhood.js getNeighborhoodRouteIndices().
 */
export function getNeighborhoodRouteIndices(
  anchorIndex?: number | null,
  neighborIndices?: readonly number[]
): number[] {
  if (!Number.isFinite(anchorIndex) && !neighborIndices?.length) return [];
  return [
    ...(Number.isFinite(anchorIndex) ? [anchorIndex as number] : []),
    ...(neighborIndices || []).filter((idx: number) => Number.isFinite(idx))
  ];
}

/**
 * Check if a bounded neighborhood is active.
 * Ported from journey-neighborhood.js isBoundedNeighborhoodActive().
 *
 * A bounded neighborhood is active when:
 * 1. primeBoundedSemanticNeighborhoodForTraversal was called (sets the flag), OR
 * 2. The journey store has trailDepth > 0 and walkHistoryIndices has entries
 */
export function isBoundedNeighborhoodActive(
  source?: string,
  routeIndices?: number[]
): boolean {
  if (boundedNeighborhoodActive) return true;

  // Derive from journey store state
  const js = journeyStore();
  if (js.trailDepth > 0 && js.walkHistoryIndices.length > 0) return true;

  // Check nav state for trail activity
  const nav = get(navStore);
  if (nav.trailDepth > 0 && nav.trailNeighborIndices.length > 0) return true;

  return false;
}

/**
 * Get the neighborhood candidate for a given index.
 * Ported from journey-neighborhood.js getNeighborhoodCandidateForIndex().
 *
 * Returns the semantic candidate entry for a given index, or creates
 * a basic one from geometric fallback.
 */
export function getNeighborhoodCandidateForIndex(
  index: number | null
): { index: number; reason: string; source: string } | null {
  if (!Number.isFinite(index)) return null;

  const idx = index as number;

  // Check bounded neighborhood candidates
  if (boundedNeighborhoodActive && boundedNeighborhoodAnchorIndex !== null) {
    const pos = boundedNeighborhoodCandidates.indexOf(idx);
    if (pos >= 0) {
      return { index: idx, reason: 'bounded neighbor', source: 'semantic' };
    }
  }

  // Check thread candidates in the journey store
  const js = journeyStore();
  if (js.threadCandidates.includes(idx)) {
    const reason = js.threadReasonByIndex.get(idx) ?? 'semantic neighbor';
    return { index: idx, reason, source: js.threadSource };
  }

  // Default: report as semantic neighbor (the index exists in the dataset)
  return { index: idx, reason: 'semantic neighbor', source: 'semantic' };
}

/**
 * Get the next walk candidate for a given index.
 * Ported from journey-neighborhood.js getNextWalkCandidateForIndex().
 *
 * Resolves candidates from the semantic neighbor map (preferred) or
 * geometric fallback, then returns the first unvisited candidate.
 */
export function getNextWalkCandidateForIndex(
  currentIndex: number,
  options: {
    requireSemantic?: boolean;
    requireOnCanvas?: boolean;
    commitNeighborhood?: boolean;
    allowNeighborhood?: boolean;
  } = {}
): { index: number; reason?: string; source?: string; semanticScore?: number; score?: number } | null {
  if (!Number.isFinite(currentIndex)) return null;

  const idx = currentIndex as number;
  const js = journeyStore();
  const nav = get(navStore);

  // Build exclusion set (already visited)
  const visited = new Set<number>([
    ...js.walkHistoryIndices,
    idx
  ]);

  // 1. Try semantic neighbors first
  if (options.requireSemantic !== false) {
    const semanticCandidates = resolveSemanticNeighbors(idx, MAX_MANIFEST_CANDIDATES);
    for (const c of semanticCandidates) {
      if (!visited.has(c.index)) {
        if (options.commitNeighborhood) {
          setTrailNeighborIndices([c.index]);
        }
        return {
          index: c.index,
          reason: c.reason,
          source: 'semantic',
          semanticScore: c.score,
          score: c.score
        };
      }
    }
  }

  // 2. Try bounded neighborhood candidates
  if (boundedNeighborhoodActive && boundedNeighborhoodCandidates.length > 0) {
    for (const cIdx of boundedNeighborhoodCandidates) {
      if (!visited.has(cIdx)) {
        return {
          index: cIdx,
          reason: 'bounded neighbor',
          source: 'semantic',
          score: 0.5
        };
      }
    }
  }

  // 3. Geometric fallback (if semantic not required)
  if (options.requireSemantic !== true) {
    const geoCandidates = resolveGeometricNeighbors(idx, 10);
    for (const c of geoCandidates) {
      if (!visited.has(c.index)) {
        if (options.commitNeighborhood) {
          setTrailNeighborIndices([c.index]);
        }
        return {
          index: c.index,
          reason: c.reason,
          source: 'geometric-fallback',
          score: c.score
        };
      }
    }
  }

  return null;
}

/**
 * Build a neighborhood manifest from anchor index and route indices.
 * Ported from journey-neighborhood.js buildNeighborhoodManifest().
 *
 * Resolves all semantic neighbors for the anchor, returning a manifest
 * with candidate indices, display limit, and edge counts.
 */
export function buildNeighborhoodManifest(
  anchorIndex: number,
  routeIndices: readonly number[],
  options: { displayLimit?: number } = {}
): {
  anchorIndex: number;
  displayLimit: number;
  candidateIndices: number[];
  anchorEdgeCount: number;
  peerEdgeCount: number;
} | null {
  if (!Number.isFinite(anchorIndex) || anchorIndex < 0) return null;

  const displayLimit = options.displayLimit ?? MAX_MANIFEST_CANDIDATES;

  // Resolve semantic neighbors
  const semanticNeighbors = resolveSemanticNeighbors(anchorIndex, displayLimit);

  // Also collect geometric neighbors as fallback
  let allCandidates = semanticNeighbors.map(c => c.index);

  // If we don't have enough semantic neighbors, supplement with geometric
  if (allCandidates.length < displayLimit) {
    const geoNeighbors = resolveGeometricNeighbors(anchorIndex, displayLimit - allCandidates.length);
    const existingSet = new Set(allCandidates);
    existingSet.add(anchorIndex);
    for (const g of geoNeighbors) {
      if (!existingSet.has(g.index)) {
        allCandidates.push(g.index);
        existingSet.add(g.index);
      }
    }
  }

  // Include any route indices that aren't the anchor
  const routeSet = new Set(allCandidates);
  for (const r of routeIndices) {
    if (Number.isFinite(r) && r !== anchorIndex && !routeSet.has(r)) {
      allCandidates.push(r);
      routeSet.add(r);
    }
  }

  allCandidates = allCandidates.slice(0, displayLimit);

  // Compute edge counts
  const anchorEdgeCount = semanticNeighbors.length;
  const peerEdgeCount = allCandidates.length;

  return {
    anchorIndex,
    displayLimit,
    candidateIndices: allCandidates,
    anchorEdgeCount,
    peerEdgeCount
  };
}

/**
 * Get the bounded neighborhood walk candidate.
 * Ported from journey-neighborhood.js getBoundedNeighborhoodWalkCandidate().
 *
 * When a bounded neighborhood is active, returns the next candidate
 * at the given step, or picks the best unvisited candidate from the
 * bounded candidate list.
 */
export function getBoundedNeighborhoodWalkCandidate(
  step?: number,
  currentIndex?: number | null,
  options?: { commit?: boolean }
): { index: number; reason?: string; source?: string } | null {
  if (!boundedNeighborhoodActive) return null;

  const idx = (currentIndex ?? boundedNeighborhoodAnchorIndex) as number;
  if (!Number.isFinite(idx)) return null;

  const js = journeyStore();
  const visited = new Set<number>([...js.walkHistoryIndices, idx]);

  // Walk candidate list from the step offset or from the start
  const start = (step !== undefined && Number.isFinite(step) && step > 0) ? step : 0;

  for (let i = start; i < boundedNeighborhoodCandidates.length; i++) {
    const cIdx = boundedNeighborhoodCandidates[i] as number;
    if (!visited.has(cIdx)) {
      if (options?.commit) {
        // Commit means advance the trail cursor and record this candidate
        setTrailNeighborIndices([cIdx]);
      }
      return {
        index: cIdx,
        reason: 'bounded walk',
        source: 'semantic'
      };
    }
  }

  return null;
}

/**
 * Get the current trail focus index.
 * Ported from journey-neighborhood.js getCurrentTrailFocusIndex().
 */
export function getCurrentTrailFocusIndex(
  focusedIndex: number | null
): number | null {
  if (Number.isFinite(focusedIndex)) return focusedIndex;

  // Fall back to the trail seed
  const js = journeyStore();
  return js.trailSeedIndex ?? null;
}

/**
 * Prime the bounded semantic neighborhood for traversal.
 * Ported from journey-neighborhood.js primeBoundedSemanticNeighborhoodForTraversal().
 *
 * Resolves semantic neighbors for the seed index, populates the bounded
 * candidate list, and updates the journey store with trail seed + neighbors.
 * Returns true if candidates were found.
 */
export function primeBoundedSemanticNeighborhoodForTraversal(
  seedIndex: number
): boolean {
  if (!Number.isFinite(seedIndex) || seedIndex < 0) return false;

  const records = get(businessRecords);
  if (!records.length) return false;

  const candidates = resolveSemanticNeighbors(seedIndex, MAX_MANIFEST_CANDIDATES);

  // Supplement with geometric fallback if semantic alone is sparse
  let allIndices = candidates.map(c => c.index);
  if (allIndices.length < 6) {
    const geoCandidates = resolveGeometricNeighbors(seedIndex, 12);
    const existingSet = new Set(allIndices);
    existingSet.add(seedIndex);
    for (const g of geoCandidates) {
      if (!existingSet.has(g.index)) {
        allIndices.push(g.index);
        existingSet.add(g.index);
      }
    }
  }

  // Set bounded neighborhood state
  boundedNeighborhoodActive = true;
  boundedNeighborhoodAnchorIndex = seedIndex;
  boundedNeighborhoodCandidates = allIndices;

  // Update journey store
  setTrailSeedIndex(seedIndex);
  setTrailNeighborIndices(allIndices);

  // Update nav store trail state
  const nav = get(navStore);
  navStore.update((s) => ({
    ...s,
    trailSeedIndex: seedIndex,
    trailNeighborIndices: allIndices,
    trailDepth: Math.max(s.trailDepth, 1),
    neighborhoodIndices: allIndices
  }));

  return allIndices.length > 0;
}

/**
 * Initialize the journey neighborhood adapter.
 * Ported from journey-neighborhood.js initJourneyNeighborhoodAdapter().
 *
 * Stores the adapter dependencies (bridge callbacks) for use by
 * bounded neighborhood walk and thread candidate resolution.
 */
export function initJourneyNeighborhoodAdapter(
  deps: {
    isThreadCandidateVisibleOnCanvas?: (index: number) => boolean;
    setTrailFromSeed?: (seedIndex: number) => void;
    applyLocalNeighborhoodFocus?: (seedIndex: number) => void;
  } = {}
): void {
  adapterDeps = { ...deps };
}

/**
 * Reset bounded neighborhood state. Called when returning to overview.
 */
export function resetBoundedNeighborhood(): void {
  boundedNeighborhoodActive = false;
  boundedNeighborhoodAnchorIndex = null;
  boundedNeighborhoodCandidates = [];
}
