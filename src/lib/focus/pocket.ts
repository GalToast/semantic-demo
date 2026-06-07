/**
 * @lib/focus/pocket.ts — Focus pocket layout and state management
 *
 * Ported from: js/modules/focus-pocket.js
 *
 * Builds a deterministic constellation of nearby business nodes around
 * a focused anchor. Positions are derived from the semantic neighbor
 * map (if available) or spatial proximity, placed on a rosette/lattice
 * ring using seededUnit() for determinism. Roles are mapped from
 * relationship-role classification.
 */

import { get } from 'svelte/store';
import { setPocketNodes, clearPocketNodes, setAnchorIndicator } from '@lib/stores/focus';
import { navStore } from '@lib/stores/navigation';
import { businessRecords, positionBuffer, pointIndexByLeadId, semanticNeighborMap } from '@lib/data-store';
import { seededUnit } from '@lib/utils/seeded-random';
import type { FocusPocketNode, FocusTransitionMode } from '@lib/types/state';
import type { BusinessRecord } from '@lib/types/business';

// ── Focus Pocket Index Management ─────────────────────────────────────────────

/**
 * Get the current focus pocket indices from the store.
 */
export function getFocusPocketIndices(): readonly number[] {
  return get(navStore).focusPocketIndices;
}

/**
 * Set focus pocket indices via the navigation store.
 */
export function setFocusPocketIndices(indices: readonly number[]): void {
  navStore.update((s) => ({ ...s, focusPocketIndices: indices }));
}

/**
 * Clear focus pocket indices.
 */
export function clearFocusPocketIndices(): void {
  navStore.update((s) => ({ ...s, focusPocketIndices: [], focusPocketMeta: null }));
}

/**
 * Get focus pocket role by index map.
 */
export function getFocusPocketRoleByIndex(): Map<number, string> {
  return get(navStore).focusPocketRoleByIndex ?? new Map();
}

/**
 * Set focus pocket role by index map.
 */
export function setFocusPocketRoleByIndex(map: Map<number, string>): void {
  navStore.update((s) => ({ ...s, focusPocketRoleByIndex: map }));
}

/**
 * Set the focus pocket meta.
 */
export function setFocusPocketMeta(meta: Record<string, unknown> | null): void {
  if (meta === null) {
    navStore.update((s) => ({ ...s, focusPocketMeta: null }));
  } else {
    navStore.update((s) => {
      const existing: Record<string, unknown> = {};
      if (s.focusPocketMeta) {
        Object.assign(existing, s.focusPocketMeta);
      }
      return { ...s, focusPocketMeta: Object.assign(existing, meta) as any };
    });
  }
}

/**
 * Clear focus pocket meta.
 */
export function clearFocusPocketMeta(): void {
  navStore.update((s) => ({ ...s, focusPocketMeta: null }));
}

// ── Focus Pocket Node Management ─────────────────────────────────────────────

/** Max pocket nodes to render (matches legacy focus-pocket.js). */
const MAX_POCKET_NODES = 8;

/** Constellation ring radius in normalized [−1,1] screen space. */
const CONSTELLATION_RADIUS = 0.38;

/**
 * Map a raw relationship-role string to a focus-pocket role.
 * Only three pocket roles exist: direct, support, civic.
 */
function mapToPocketRole(rawRole: string): FocusPocketNode['role'] {
  const r = rawRole?.toLowerCase?.() ?? '';
  if (r === 'civic' || r === 'same_owner' || r === 'shared_principal') return 'civic';
  if (r === 'direct' || r === 'partner' || r === 'client' || r === 'vendor' ||
      r === 'referral_source' || r === 'referral_target' || r === 'same_owner') return 'direct';
  // Everything else lands in support
  return 'support';
}

/**
 * Resolve the anchor node's 3D position from the position buffer.
 */
function getAnchorPosition(index: number, positions: Float32Array): [number, number, number] | null {
  if (!positions || index < 0 || index * 3 + 2 >= positions.length) return null;
  const x = positions[index * 3] as number;
  const y = positions[index * 3 + 1] as number;
  const z = positions[index * 3 + 2] as number;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return [x, y, z];
}

/**
 * Build a FocusPocketNode for a neighbor at a deterministic position
 * on a rosette ring around the anchor.
 */
function buildPocketNode(
  neighborIndex: number,
  slot: number,
  totalSlots: number,
  anchorPos: [number, number, number],
  relationshipRole: string,
  records: readonly BusinessRecord[],
  positions: Float32Array
): FocusPocketNode | null {
  if (neighborIndex < 0 || neighborIndex >= records.length) return null;

  // Deterministic angular placement on the ring (golden-angle spread)
  const goldenAngle = 2.39996323; // ≈ 2π / φ
  const angle = slot * goldenAngle + seededUnit(neighborIndex, 7.3) * 0.4;
  const ringRadius = CONSTELLATION_RADIUS * (0.7 + seededUnit(neighborIndex, 11.1) * 0.6);

  // Z-depth jitter for visual depth
  const zJitter = (seededUnit(neighborIndex, 3.7) - 0.5) * 0.08;

  // Read the neighbor's own position for optional proximity blend
  const neighborPos = getAnchorPosition(neighborIndex, positions);

  let px: number;
  let py: number;
  let pz: number;

  if (neighborPos) {
    // Blend: 40% ring placement + 60% relative displacement (keeps semantic proximity visible)
    const ringX = anchorPos[0] + Math.cos(angle) * ringRadius;
    const ringY = anchorPos[1] + Math.sin(angle) * ringRadius;
    const ringZ = anchorPos[2] + zJitter;
    px = ringX * 0.4 + (neighborPos[0]) * 0.6;
    py = ringY * 0.4 + (neighborPos[1]) * 0.6;
    pz = ringZ * 0.4 + (neighborPos[2]) * 0.6;
  } else {
    // Pure ring fallback
    px = anchorPos[0] + Math.cos(angle) * ringRadius;
    py = anchorPos[1] + Math.sin(angle) * ringRadius;
    pz = anchorPos[2] + zJitter;
  }

  const role = mapToPocketRole(relationshipRole);
  const label = records[neighborIndex]?.name ?? `Node ${neighborIndex}`;
  const score = seededUnit(neighborIndex, 19.9); // deterministic score

  return {
    index: neighborIndex,
    position: [px, py, pz],
    role,
    score,
    label,
    rotationSeed: seededUnit(neighborIndex, 5.5),
    scaleSeed: seededUnit(neighborIndex, 8.8),
  };
}

/**
 * Collect candidate neighbor indices for the focus pocket.
 *
 * Priority order:
 * 1. Semantic neighbor map entries (highest fidelity)
 * 2. Focus-pocket indices already set in nav state (legacy path)
 * 3. Spatial proximity fallback (geometric nearest)
 */
function collectCandidateIndices(
  anchorIndex: number,
  records: readonly BusinessRecord[],
  positions: Float32Array | null
): Array<{ index: number; role: string }> {
  const candidates: Array<{ index: number; role: string }> = [];
  const seen = new Set<number>([anchorIndex]);

  // 1. Semantic neighbor map (resolve neighbor leadId -> numeric index via pointIndexByLeadId)
  const nMap = get(semanticNeighborMap);
  if (nMap.size > 0) {
    const anchorRecord = records[anchorIndex];
    const leadId = anchorRecord?.lead_id;
    const idxMap = get(pointIndexByLeadId);
    if (leadId && idxMap.size > 0) {
      const entry = nMap.get(leadId);
      if (entry?.neighbors?.length) {
        for (const n of entry.neighbors) {
          const nIdx = idxMap.get(n.leadId);
          if (nIdx === undefined || nIdx === anchorIndex || seen.has(nIdx)) continue;
          seen.add(nIdx);
          candidates.push({ index: nIdx, role: n.relationshipRole });
          if (candidates.length >= MAX_POCKET_NODES) break;
        }
      }
    }
  }

  // 2. Nav-state pocket indices (legacy bridge path)
  if (candidates.length < MAX_POCKET_NODES) {
    const nav = get(navStore);
    for (const idx of nav.focusPocketIndices) {
      if (!Number.isFinite(idx) || idx === anchorIndex || seen.has(idx)) continue;
      seen.add(idx);
      const roleFromMap = nav.focusPocketRoleByIndex?.get(idx) ?? 'support';
      candidates.push({ index: idx, role: roleFromMap });
      if (candidates.length >= MAX_POCKET_NODES) break;
    }
  }

  // 3. Spatial proximity fallback
  if (candidates.length < MAX_POCKET_NODES && positions && positions.length > 0) {
    const anchorPos = getAnchorPosition(anchorIndex, positions);
    if (anchorPos) {
      const proximityList: Array<{ index: number; dist: number }> = [];
      const count = Math.min(records.length, positions.length / 3);
      // Sample stride to avoid O(n) scan on every focus — stride grows with record count
      const stride = Math.max(1, Math.floor(count / 500));
      for (let i = 0; i < count; i += stride) {
        if (seen.has(i)) continue;
        const pos = getAnchorPosition(i, positions);
        if (!pos) continue;
        const dist = Math.hypot(pos[0] - anchorPos[0], pos[1] - anchorPos[1], pos[2] - anchorPos[2]);
        proximityList.push({ index: i, dist });
      }
      proximityList.sort((a, b) => a.dist - b.dist);
      for (const { index: i } of proximityList) {
        if (candidates.length >= MAX_POCKET_NODES) break;
        seen.add(i);
        candidates.push({ index: i, role: 'support' });
      }
    }
  }

  return candidates.slice(0, MAX_POCKET_NODES);
}

/**
 * Apply local neighborhood focus for the given index.
 * Ported from focus-pocket.js applyLocalNeighborhoodFocus().
 *
 * Reads business records, position buffer, and semantic neighbor map
 * to build a deterministic constellation of nearby nodes. Positions
 * use a rosette layout blended with actual semantic-space proximity.
 * Calls setPocketNodes() to populate the focus store.
 */
export function applyLocalNeighborhoodFocus(index: number): void {
  if (!Number.isFinite(index) || index < 0) {
    clearPocketNodes();
    return;
  }

  const records = get(businessRecords);
  const positions = get(positionBuffer);

  if (!records.length) {
    clearPocketNodes();
    return;
  }

  // Clamp index
  const anchorIndex = Math.min(index, records.length - 1);

  // Collect candidate neighbors
  const candidates = collectCandidateIndices(anchorIndex, records, positions);

  if (candidates.length === 0) {
    clearPocketNodes();
    setAnchorIndicator({ active: false, position: null });
    return;
  }

  // Resolve anchor position
  const anchorPos = positions
    ? getAnchorPosition(anchorIndex, positions)
    : [0.5, 0.5, 0.5] as [number, number, number];

  if (!anchorPos) {
    clearPocketNodes();
    setAnchorIndicator({ active: false, position: null });
    return;
  }

  // Build pocket nodes
  const nodes: FocusPocketNode[] = [];
  for (let slot = 0; slot < candidates.length; slot++) {
    const c = candidates[slot];
    if (!c) continue;
    const node = buildPocketNode(c.index, slot, candidates.length, anchorPos, c.role, records, positions!);
    if (node) nodes.push(node);
  }

  // Set the store
  setPocketNodes(nodes);

  // Activate anchor indicator at the anchor position
  setAnchorIndicator({
    active: true,
    position: anchorPos,
    pulsePhase: 0
  });

  // Also update nav-state pocket indices for downstream consumers
  setFocusPocketIndices(nodes.map((n) => n.index));
}

/**
 * Apply focus pocket breathing animation.
 * Ported from focus-pocket.js applyFocusPocketBreathing().
 * During migration, this is handled by the engine bridge.
 * Returns false to indicate no per-frame DOM work needed (Svelte handles
 * the CSS transitions).
 */
export function applyFocusPocketBreathing(_now: number, _positions: unknown): boolean {
  return false;
}

// ── Geometry Re-exports ──────────────────────────────────────────────────────

export type { FocusPocketNode, FocusTransitionMode } from '@lib/types/state';
