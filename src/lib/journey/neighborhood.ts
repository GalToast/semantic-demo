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
import { navStore } from '@lib/stores/navigation.svelte.ts';
import { journeyStore, setTrailSeedIndex, setTrailNeighborIndices } from '@lib/stores/journey.svelte.ts';
import { appState } from '@lib/state/app.svelte.ts';
import { isPointVisible } from '@lib/utils/geo-data';
import { getSemanticThreadCandidates, getGeometricThreadCandidates, getThreadCandidatesForIndex, normalizeLeadId } from './thread-model';

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

type ThreadCandidateLike = number | { index?: number };

function valueArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value instanceof Map) return [...value.values()];
  if (value && typeof (value as Iterable<unknown>)[Symbol.iterator] === 'function') {
    return [...(value as Iterable<unknown>)];
  }
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function candidateIndex(candidate: ThreadCandidateLike | unknown): number | null {
  if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
  if (!candidate || typeof candidate !== 'object') return null;
  const index = Number((candidate as { index?: unknown }).index);
  return Number.isFinite(index) ? index : null;
}

function normalizeThreadCandidates(value: unknown): number[] {
  return valueArray(value)
    .map(candidateIndex)
    .filter((index): index is number => index !== null);
}

function finiteIndexList(value: unknown): number[] {
  return valueArray(value)
    .map((index) => Number(index))
    .filter((index) => Number.isFinite(index));
}

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
  if (js.trailDepth > 0 && finiteIndexList(js.walkHistoryIndices).length > 0) return true;

  // Check nav state for trail activity
  const nav = get(navStore);
  if (nav.trailDepth > 0 && finiteIndexList(nav.trailNeighborIndices).length > 0) return true;

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
  if (normalizeThreadCandidates(js.threadCandidates).includes(idx)) {
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
    ...finiteIndexList(js.walkHistoryIndices),
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
): any {
  const records = get(businessRecords);
  if (!Number.isFinite(anchorIndex) || anchorIndex < 0 || anchorIndex >= records.length) return null;

  const displayLimit = options.displayLimit ?? getSemanticThreadDisplayLimit();
  const uniqueRoute: number[] = [];
  const fallbackCandidateByIndex = new Map<number, { index: number; score: number; reason: string; source: string }>();
  const seen = new Set<number>([anchorIndex]);
  const filters = appState.activeFilters;

  const appendRouteCandidate = (
    candidateIndex: number,
    fallbackCandidate?: { index: number; score: number; reason: string; source: string }
  ): void => {
    if (
      !Number.isFinite(candidateIndex) ||
      seen.has(candidateIndex) ||
      candidateIndex === anchorIndex ||
      !isPointVisible(candidateIndex, records, null, filters) ||
      !appState.nodePositions[candidateIndex]
    ) {
      return;
    }
    seen.add(candidateIndex);
    uniqueRoute.push(candidateIndex);
    if (fallbackCandidate) fallbackCandidateByIndex.set(candidateIndex, fallbackCandidate);
  };

  (routeIndices || []).forEach((candidateIndex: number) => {
    appendRouteCandidate(candidateIndex);
  });

  const candidates = new Map<number, any>();
  const edges: Array<{ a: number; b: number; score: number; role: string; reason: string }> = [];
  const anchorLeadId = normalizeLeadId(records[anchorIndex]?.lead_id);
  candidates.set(anchorIndex, {
    index: anchorIndex,
    role: 'anchor',
    slotNumber: 0,
    leadId: anchorLeadId,
    anchorThread: { path: [anchorIndex], type: 'anchor', reason: 'neighborhood anchor' },
    peerThreads: [],
    score: 1,
    semanticScore: 1,
    reason: 'neighborhood anchor',
    source: 'semantic'
  });

  let scoredRoute = uniqueRoute
    .map((candidateIndex: number) => {
      const candidate = getNeighborhoodCandidateForIndex(candidateIndex) || ({} as any);
      const fallbackCandidate = fallbackCandidateByIndex.get(candidateIndex);
      const anchorRecord = getSemanticNeighborRecordBetween(anchorIndex, candidateIndex);
      const score = Number(
        candidate.semanticScore ||
          candidate.score ||
          fallbackCandidate?.score ||
          anchorRecord?.semanticScore ||
          anchorRecord?.score ||
          0
      );
      return {
        candidateIndex,
        candidate: { ...fallbackCandidate, ...candidate },
        anchorRecord,
        score
      };
    })
    .filter((entry) => entry.anchorRecord || fallbackCandidateByIndex.has(entry.candidateIndex))
    .sort((a, b) => b.score - a.score || a.candidateIndex - b.candidateIndex)
    .slice(0, displayLimit);

  if (scoredRoute.length === 0) {
    const semanticFallbacks = resolveSemanticNeighbors(anchorIndex, displayLimit);
    const fallbackCandidates = [...semanticFallbacks];
    if (fallbackCandidates.length < Math.min(6, displayLimit)) {
      const existing = new Set(fallbackCandidates.map((candidate) => candidate.index));
      existing.add(anchorIndex);
      for (const candidate of resolveGeometricNeighbors(anchorIndex, displayLimit)) {
        if (existing.has(candidate.index)) continue;
        fallbackCandidates.push(candidate);
        existing.add(candidate.index);
        if (fallbackCandidates.length >= displayLimit) break;
      }
    }

    for (const candidate of fallbackCandidates) {
      appendRouteCandidate(candidate.index, candidate);
    }

    scoredRoute = uniqueRoute
      .map((candidateIndex: number) => {
        const candidate = getNeighborhoodCandidateForIndex(candidateIndex) || ({} as any);
        const fallbackCandidate = fallbackCandidateByIndex.get(candidateIndex);
        const anchorRecord = getSemanticNeighborRecordBetween(anchorIndex, candidateIndex);
        const score = Number(
          candidate.semanticScore ||
            candidate.score ||
            fallbackCandidate?.score ||
            anchorRecord?.semanticScore ||
            anchorRecord?.score ||
            0
        );
        return {
          candidateIndex,
          candidate: { ...fallbackCandidate, ...candidate },
          anchorRecord,
          score
        };
      })
      .filter((entry) => entry.anchorRecord || fallbackCandidateByIndex.has(entry.candidateIndex))
      .sort((a, b) => b.score - a.score || a.candidateIndex - b.candidateIndex)
      .slice(0, displayLimit);
  }

  scoredRoute.forEach((entry, order) => {
    const { candidateIndex, candidate, anchorRecord, score } = entry;
    if (!Number.isFinite(candidateIndex) || candidateIndex < 0 || candidateIndex >= records.length) return;
    const leadId = normalizeLeadId(records[candidateIndex]?.lead_id);
    const reason =
      candidate.reason ||
      anchorRecord?.reason ||
      (appState.navState as any).neighborhoodReasonByIndex?.get(candidateIndex) ||
      'semantic neighbor';
    candidates.set(candidateIndex, {
      index: candidateIndex,
      role: 'peer',
      slotNumber: order + 1,
      leadId,
      anchorThread: {
        path: [anchorIndex, candidateIndex],
        type: 'direct',
        reason
      },
      peerThreads: [],
      score,
      semanticScore: Number(candidate.semanticScore || anchorRecord?.semanticScore || score || 0),
      sameCity: Boolean(candidate.sameCity || anchorRecord?.sameCity),
      sameStatus: Boolean(candidate.sameStatus || anchorRecord?.sameStatus),
      threadType: candidate.threadType || anchorRecord?.threadType || 'local_semantic_neighbor',
      reason,
      source: 'semantic'
    });
    edges.push({
      a: anchorIndex,
      b: candidateIndex,
      score,
      role: 'anchor-peer',
      reason
    });
  });

  const peerEdges: Array<{ a: number; b: number; score: number; role: string; reason: string }> = [];
  const nMap = get(semanticNeighborMap);
  const idxMap = get(pointIndexByLeadId);

  for (const [candidateIndex, candidate] of candidates) {
    if (candidate.role !== 'peer') continue;
    const candidateNode = nMap.get(candidate.leadId!);
    if (!candidateNode?.neighbors?.length) continue;
    candidateNode.neighbors.forEach((neighbor: any) => {
      const peerIndex = idxMap.get(neighbor.leadId);
      if (
        !Number.isFinite(peerIndex) ||
        peerIndex === anchorIndex ||
        peerIndex === candidateIndex ||
        !candidates.has(peerIndex!)
      ) {
        return;
      }
      const a = Math.min(candidateIndex, peerIndex!);
      const b = Math.max(candidateIndex, peerIndex!);
      if (peerEdges.some((edge) => edge.a === a && edge.b === b)) return;
      const score = Number(neighbor.semanticScore || neighbor.score || 0);
      peerEdges.push({
        a,
        b,
        score,
        role: 'peer-peer',
        reason: neighbor.reason || 'shared semantic thread'
      });
    });
  }

  const maxPeerEdges = getSemanticPeerThreadDisplayLimit(candidates.size);
  peerEdges.sort((a, b) => b.score - a.score || a.a - b.a || a.b - b.b);
  const displayedPeerEdges = peerEdges.slice(0, maxPeerEdges);
  displayedPeerEdges.forEach((edge) => {
    edges.push(edge);
    const aCandidate = candidates.get(edge.a);
    const bCandidate = candidates.get(edge.b);
    if (aCandidate) {
      aCandidate.peerThreads.push({
        peerIndex: edge.b,
        score: edge.score,
        reason: edge.reason
      });
    }
    if (bCandidate) {
      bCandidate.peerThreads.push({
        peerIndex: edge.a,
        score: edge.score,
        reason: edge.reason
      });
    }
  });

  return {
    anchorIndex,
    displayLimit,
    candidates,
    edges,
    candidateIndices: [...candidates.keys()].filter((candidateIndex) => candidateIndex !== anchorIndex),
    anchorEdgeCount: edges.filter((edge) => edge.role === 'anchor-peer').length,
    peerEdgeCount: displayedPeerEdges.length,
    totalPeerEdgeCandidates: peerEdges.length,
    peerEdgesCulled: Math.max(0, peerEdges.length - displayedPeerEdges.length),
    hairballRisk: displayedPeerEdges.length > candidates.size * 2
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
  const visited = new Set<number>([...finiteIndexList(js.walkHistoryIndices), idx]);

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

/**
 * Get the semantic neighbor record between a source and a target.
 * Ported from journey-neighborhood.js getSemanticNeighborRecordBetween().
 */
export function getSemanticNeighborRecordBetween(sourceIndex: number, targetIndex: number): any {
  const records = get(businessRecords);
  if (!Number.isFinite(sourceIndex) || sourceIndex < 0 || sourceIndex >= records.length) return null;
  const sourcePoint = records[sourceIndex];
  if (!sourcePoint) return null;
  const sourceLeadId = normalizeLeadId(sourcePoint.lead_id);
  if (!sourceLeadId || !Number.isFinite(targetIndex)) return null;
  const nMap = get(semanticNeighborMap);
  const sourceNode = nMap.get(sourceLeadId);
  if (!sourceNode?.neighbors?.length) return null;
  const idxMap = get(pointIndexByLeadId);
  return (
    sourceNode.neighbors.find((neighbor: any) => {
      const candidateIndex = idxMap.get(neighbor.leadId);
      return candidateIndex === targetIndex;
    }) || null
  );
}

/**
 * Ensure the bounded neighborhood is configured from the active focus pocket.
 * Ported from journey-neighborhood.js ensureBoundedNeighborhoodFromActivePocket().
 */
export function ensureBoundedNeighborhoodFromActivePocket(seedIndex: number): void {
  if (!Number.isFinite(seedIndex)) return;
  const nav = appState.navState as any;
  if (isBoundedNeighborhoodActive()) {
    if (nav.focusPocketMeta && !nav.focusPocketMeta.boundedLoop) {
      appState.withMutation(() => {
        nav.focusPocketMeta = {
          ...(nav.focusPocketMeta as any),
          boundedLoop: true,
          motifLabel: nav.focusPocketMeta.motifLabel || 'selected neighborhood loop'
        };
      });
    }
    if (!nav.neighborhoodManifest) {
      appState.withMutation(() => {
        nav.neighborhoodManifest = buildNeighborhoodManifest(
          seedIndex,
          finiteIndexList(nav.neighborhoodIndices),
          { displayLimit: getSemanticThreadDisplayLimit() }
        ) as any;
      });
    }
    return;
  }
  if (!nav.focusPocketMeta?.active) return;
  const hasSemanticSource =
    nav.threadSource === 'semantic' ||
    valueArray(nav.threadCandidates).some((candidate: any) => candidate?.source === 'semantic') ||
    (nav.focusPocketMeta.motifLabel || '').toLowerCase().includes('semantic');
  if (!hasSemanticSource) return;
  const limit = getSemanticThreadDisplayLimit();
  const threadRoute = valueArray(nav.threadCandidates)
    .filter((candidate: unknown) => (candidate as { source?: string } | null)?.source === 'semantic')
    .map((candidate: unknown) => candidateIndex(candidate))
    .filter((index): index is number => index !== null);
  const pocketRoute = [...threadRoute, ...finiteIndexList(nav.focusPocketIndices)]
    .filter((candidateIndex: number) => Number.isFinite(candidateIndex) && candidateIndex !== seedIndex)
    .filter((candidateIndex: number) => {
      const role = nav.focusPocketRoleByIndex?.get(candidateIndex);
      return !role || role === 'primary' || role === 'support';
    })
    .filter((candidateIndex: number, order: number, list: number[]) => list.indexOf(candidateIndex) === order)
    .slice(0, limit);
  if (!pocketRoute.length) return;
  const manifest = buildNeighborhoodManifest(seedIndex, pocketRoute, { displayLimit: limit });
  if (!manifest?.candidateIndices?.length) return;
  appState.withMutation(() => {
    nav.neighborhoodAnchorIndex = seedIndex;
    nav.neighborhoodIndices = manifest.candidateIndices;
    nav.neighborhoodCursor = 0;
    nav.neighborhoodReasonByIndex = new Map(
      manifest.candidateIndices.map((candidateIndex: number) => [
        candidateIndex,
        manifest.candidates?.get(candidateIndex)?.reason ||
        nav.threadReasonByIndex?.get(candidateIndex) ||
        getNeighborhoodCandidateForIndex(candidateIndex)?.reason ||
        'tied stop in this selected neighborhood'
      ])
    );
    nav.neighborhoodSource = 'semantic';
    nav.neighborhoodManifest = manifest as any;
    nav.focusPocketMeta = {
      ...(nav.focusPocketMeta as any),
      boundedLoop: true,
      motifLabel: 'selected neighborhood loop'
    };
  });
}

/**
 * Configure and set trail state from a given seed index.
 * Ported from journey-neighborhood.js setTrailFromSeed().
 */
export function setTrailFromSeed(seedIndex: number): void {
  const semanticCandidates = getSemanticThreadCandidates(seedIndex);
  const limit = getSemanticThreadDisplayLimit();
  const allCandidates = (semanticCandidates.length ? semanticCandidates : getGeometricThreadCandidates(seedIndex))
    .sort((a, b) => {
      const as = a.semanticScore || 0;
      const bs = b.semanticScore || 0;
      if (bs !== as) return bs - as;
      const sa = a.score || 0;
      const sb = b.score || 0;
      if (sb !== sa) return sb - sa;
      return a.index - b.index;
    });
  const records = get(businessRecords);
  const filters = appState.activeFilters;
  const candidates = allCandidates
    .filter((candidate) => isPointVisible(candidate.index, records, null, filters))
    .slice(0, limit);
  const source = semanticCandidates.length ? 'semantic' : (candidates[0]?.source || 'geometric-fallback');
  const reasonByIndex = new Map<number, string>(candidates.map((candidate) => [candidate.index, candidate.reason || '']));
  const neighborIndices = candidates.map((candidate) => candidate.index);
  const nav = appState.navState as any;
  const cursor = (() => {
    const tc = candidates.findIndex((candidate) => candidate.index === nav.focusedIndex);
    return tc >= 0 ? tc : 0;
  })();
  
  appState.withMutation(() => {
    nav.trailSeedIndex = seedIndex;
    nav.threadCandidates = candidates;
    nav.threadSource = source;
    nav.threadReasonByIndex = reasonByIndex;
    nav.trailNeighborIndices = neighborIndices;
    nav.trailCursor = cursor;
  });
}

/**
 * Update the trail indices set.
 * Ported from journey-neighborhood.js updateTrailIndices().
 */
export function updateTrailIndices(seedIndex: number | null = getCurrentTrailFocusIndex(appState.navState.focusedIndex)): void {
  appState.withMutation(() => {
    appState.trailIndices.clear();
    const records = get(businessRecords);
    if (seedIndex === null || seedIndex === undefined || seedIndex < 0 || seedIndex >= records.length) return;
    const nav = appState.navState as any;
    const filters = appState.activeFilters;
    if (!isPointVisible(seedIndex, records, null, filters)) return;
    appState.trailIndices.add(seedIndex);
    const limit = getSemanticThreadDisplayLimit();
    const candidates = valueArray(nav.threadCandidates).length
      ? valueArray(nav.threadCandidates)
      : getThreadCandidatesForIndex(seedIndex).slice(0, limit);
    candidates
      .map((candidate: unknown) => candidateIndex(candidate))
      .filter((index): index is number => index !== null && isPointVisible(index, records, null, filters))
      .forEach((index: number) => appState.trailIndices.add(index));
  });
}
