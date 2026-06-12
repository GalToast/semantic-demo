/**
 * @lib/focus/pocket.ts — Focus pocket constellation layout and animation
 *
 * Port of js/modules/focus-pocket.js
 *
 * Builds a deterministic constellation of nearby business nodes around
 * a focused anchor. Delegates geometry to focus/geometry.ts and personality
 * to focus/personality.ts. All state writes to navState.focusPocket* and
 * related tracked sub-objects are wrapped in withStateMutation().
 */
import * as THREE from 'three';
import type { Vector3 } from 'three';
import { state, withStateMutation } from '@legacy/state.js';
import { prefersReducedMotion } from '@lib/utils/environment';
import { normalizeCityForFilter } from '@lib/utils/geo-data';
import { getBusinessRecords } from '@lib/data-store';
import { setPocketNodes } from '@lib/stores/focus.svelte';
import type { FocusPocketNode } from '@lib/types/state';
import {
  clampNumber,
  easeOutQuint,
  safeUnitScore,
  getFocusViewBasis,
  getFocusConstellationMotif,
  getFocusConstellationMotifForPersonality,
  getFocusConstellationViewportProfile,
  getFocusBeaconDeclutterProfile,
  getDeclutteredFocusBeaconIndices,
  getFocusConstellationPlacement,
  applyRelationshipRolePlacementBias,
  getFocusThreadCurvePoint,
  buildFocusedPocketStagedPositions,
  buildFocusedSemanticPocket,
} from '@lib/focus/geometry';
import type { PocketEntry } from '@lib/focus/geometry';
import { getNeighborhoodPersonality, getSemanticCandidateSlice } from '@lib/focus/personality';

// ── Re-exports from geometry/personality (matching JS export surface) ────────

export {
  clampNumber,
  easeOutQuint,
  safeUnitScore,
  getFocusViewBasis,
  getFocusConstellationMotif,
  getFocusConstellationMotifForPersonality,
  getFocusConstellationViewportProfile,
  getFocusBeaconDeclutterProfile,
  getDeclutteredFocusBeaconIndices,
  getFocusConstellationPlacement,
  applyRelationshipRolePlacementBias,
  getFocusThreadCurvePoint,
  getNeighborhoodPersonality,
  getSemanticCandidateSlice,
};

// ── Focus Pocket Getter/Setter API ──────────────────────────────────────────
// All writes to navState.focusPocket* and focusPocketMotionByIndex must flow
// through these functions. No direct assignment outside this API.

export function getFocusPocketIndices(): number[] {
  const indices = (state.navState as Record<string, unknown>).focusPocketIndices;
  return Array.isArray(indices) ? indices : [];
}

export function setFocusPocketIndices(indices: number[]): void {
  withStateMutation(() => {
    ((state as Record<string, unknown>).navState as Record<string, unknown>).focusPocketIndices = indices;
  });
}

export function getFocusPocketRoleByIndex(): Map<number, string> {
  return ((state.navState as Record<string, unknown>).focusPocketRoleByIndex as Map<number, string>) ?? new Map();
}

export function setFocusPocketRoleByIndex(map: Map<number, string>): void {
  withStateMutation(() => {
    ((state as Record<string, unknown>).navState as Record<string, unknown>).focusPocketRoleByIndex = map;
  });
}

export function setFocusPocketRoleForIndex(index: number, role: string): void {
  withStateMutation(() => {
    const navState = (state as Record<string, unknown>).navState as Record<string, unknown>;
    if (!(navState.focusPocketRoleByIndex instanceof Map)) {
      navState.focusPocketRoleByIndex = new Map();
    }
    (navState.focusPocketRoleByIndex as Map<number, string>).set(index, role);
  });
}

export function clearFocusPocketRoleByIndex(): void {
  withStateMutation(() => {
    ((state as Record<string, unknown>).navState as Record<string, unknown>).focusPocketRoleByIndex = new Map();
  });
}

export function getFocusPocketMotionByIndex(): Map<number, Record<string, unknown>> {
  return ((state as Record<string, unknown>).focusPocketMotionByIndex as Map<number, Record<string, unknown>>) ?? new Map();
}

export function setFocusPocketMotionByIndex(map: Map<number, Record<string, unknown>>): void {
  withStateMutation(() => {
    (state as Record<string, unknown>).focusPocketMotionByIndex = map;
  });
}

export function setFocusPocketMotionForIndex(index: number, motion: Record<string, unknown>): void {
  withStateMutation(() => {
    const s = state as Record<string, unknown>;
    if (!(s.focusPocketMotionByIndex instanceof Map)) {
      s.focusPocketMotionByIndex = new Map();
    }
    (s.focusPocketMotionByIndex as Map<number, Record<string, unknown>>).set(index, motion);
  });
}

export function clearFocusPocketMotionByIndex(): void {
  withStateMutation(() => {
    (state as Record<string, unknown>).focusPocketMotionByIndex = new Map();
  });
}

export function clearFocusPocketIndices(): void {
  withStateMutation(() => {
    ((state as Record<string, unknown>).navState as Record<string, unknown>).focusPocketIndices = [];
  });
}

export function getFocusPocketMeta(): Record<string, unknown> | null {
  return ((state.navState as Record<string, unknown>).focusPocketMeta as Record<string, unknown>) ?? null;
}

export function setFocusPocketMeta(meta: Record<string, unknown> | null): void {
  withStateMutation(() => {
    ((state as Record<string, unknown>).navState as Record<string, unknown>).focusPocketMeta = meta;
  });
}

export function clearFocusPocketMeta(): void {
  withStateMutation(() => {
    ((state as Record<string, unknown>).navState as Record<string, unknown>).focusPocketMeta = null;
  });
}

// ── Apply Local Neighborhood Focus ──────────────────────────────────────────

export function applyLocalNeighborhoodFocus(index: number): void {
  const lState = state as Record<string, unknown>;
  const navState = lState.navState as Record<string, unknown>;
  const points = lState.points as Array<Record<string, unknown>> | undefined;
  const originalPositions = lState.originalPositions as Array<{ x: number; y: number; z: number }> | undefined;
  const nodePositions = lState.nodePositions as Array<{ x: number; y: number; z: number }> | undefined;
  const targetPositions = lState.targetPositions as Array<{ x: number; y: number; z: number }> | undefined;

  // --- TRAVERSAL CONTINUITY: capture previous pocket before reset ---
  const prevPocketMeta = navState.focusPocketMeta as Record<string, unknown> | null;
  const prevPocketIndexArray = Array.isArray(navState.focusPocketIndices)
    ? (navState.focusPocketIndices as number[])
    : [];
  const prevPocketIndices = prevPocketMeta?.active
    ? new Set<number>([index, ...prevPocketIndexArray])
    : new Set<number>();
  const prevTargetByIndex = new Map<number, { x: number; y: number; z: number }>();
  if (prevPocketIndices.size > 0) {
    prevPocketIndices.forEach((i) => {
      const currentPosition = nodePositions?.[i] || targetPositions?.[i];
      if (currentPosition) {
        prevTargetByIndex.set(i, { x: currentPosition.x, y: currentPosition.y, z: currentPosition.z });
      }
    });
  }

  if (!points || !Array.isArray(points) || !originalPositions) return;
  for (let i = 0; i < points.length; i++) {
    const pos = originalPositions[i];
    const px = Number.isFinite(pos?.x) ? pos!.x : 0;
    const py = Number.isFinite(pos?.y) ? pos!.y : 0;
    const pz = Number.isFinite(pos?.z) ? pos!.z : 0;
    if (targetPositions) targetPositions[i] = { x: px, y: py, z: pz };
  }

  // --- POLISH 312: Determine Personality ---
  const personality = getNeighborhoodPersonality(index);
  withStateMutation(() => {
    navState.currentPersonality = personality;
  });

  clearFocusPocketIndices();
  clearFocusPocketMeta();
  clearFocusPocketRoleByIndex();
  clearFocusPocketMotionByIndex();
  withStateMutation(() => {
    (lState as Record<string, unknown>).focusPocketTransitionStartedAt = performance.now();
  });

  if (navState.threadSource === 'semantic') {
    const pocket = buildFocusedSemanticPocket(index);
    if (pocket?.positions?.size) {
      pocket.positions.forEach((position: { x: number; y: number; z: number } | undefined, pocketIndex: number) => {
        if (position && targetPositions) {
          targetPositions[pocketIndex] = { x: position.x, y: position.y, z: position.z };
        }
      });
      setFocusPocketIndices(pocket.indices.filter((candidateIndex: number) => candidateIndex !== index));
      setFocusPocketRoleByIndex(pocket.roles || new Map());

      // --- TRAVERSAL CONTINUITY: inject preserved position into motion for continuing nodes ---
      const newPocketSet = new Set(pocket.indices);
      const motion = pocket.motion || new Map<number, Record<string, unknown>>();
      prevTargetByIndex.forEach((prevPos, pocketIdx) => {
        if (newPocketSet.has(pocketIdx)) {
          const existing = motion.get(pocketIdx);
          motion.set(pocketIdx, {
            ...(existing || {}),
            role: existing?.role ?? 'support',
            motif: existing?.motif ?? pocket.meta.motif ?? 'market',
            delay: existing?.delay ?? 0,
            duration: existing?.duration ?? 0,
            speed: existing?.speed ?? 0,
            breatheAmp: existing?.breatheAmp ?? 0,
            _preservePos: { ...prevPos },
            _firstFrameApplied: false,
          });
        }
      });
      setFocusPocketMotionByIndex(motion);

      setFocusPocketMeta(pocket.meta);
      withStateMutation(() => {
        (lState as Record<string, unknown>).nodesAreSettling = true;
        (lState as Record<string, unknown>).autoRotate = false;
      });
      syncPocketNodesToStore();
      return;
    }
  }

  // Fallback: geometric/thread-candidate path
  const focusPos = originalPositions?.[index];
  if (!focusPos) {
    withStateMutation(() => {
      (lState as Record<string, unknown>).nodesAreSettling = false;
      (lState as Record<string, unknown>).autoRotate = true;
    });
    syncPocketNodesToStore();
    return;
  }

  const viewportProfile = getFocusConstellationViewportProfile();
  const threadCandidates = (navState.threadCandidates as Array<Record<string, unknown>>) ?? [];
  const neighborhoodCandidates = threadCandidates.slice(0, viewportProfile.primaryLimit);

  const primaryIndices = neighborhoodCandidates.map((c) => c.index as number);
  const supportIndices: number[] = [];

  const localIndices = new Set<number>([index, ...primaryIndices, ...supportIndices]);
  const fallbackPocketEntries = new Map<number, PocketEntry>();
  neighborhoodCandidates.forEach((candidate) => {
    if (!candidate || !Number.isFinite(candidate.index as number) || (candidate.index as number) === index) return;
    const point = (Number.isFinite(candidate.index as number) && (candidate.index as number) >= 0 && (candidate.index as number) < (points?.length ?? 0))
      ? points?.[candidate.index as number] || ({} as Record<string, unknown>)
      : ({} as Record<string, unknown>);
    fallbackPocketEntries.set(candidate.index as number, {
      index: candidate.index as number,
      kind: 'primary',
      score: Number((candidate as Record<string, unknown>).semanticScore ?? (candidate as Record<string, unknown>).score ?? 0.62),
      relationshipRole: String((candidate as Record<string, unknown>).relationshipRole || ''),
      relationshipAxis: String((candidate as Record<string, unknown>).relationshipAxis || ''),
      roleReason: String((candidate as Record<string, unknown>).roleReason || ''),
      sameCity:
        normalizeCityForFilter(point.city as string) ===
        normalizeCityForFilter(
          (Number.isFinite(index) && index >= 0 && index < (points?.length ?? 0))
            ? (points?.[index]?.city as string)
            : undefined
        ),
      reason: String((candidate as Record<string, unknown>).reason || 'nearby business relationship'),
    });
  });

  const fallbackPocket = fallbackPocketEntries.size
    ? buildFocusedPocketStagedPositions(index, fallbackPocketEntries)
    : null;
  if (fallbackPocket?.positions?.size) {
    fallbackPocket.positions.forEach((position: { x: number; y: number; z: number } | undefined, pocketIndex: number) => {
      if (position) {
        const px = Number.isFinite(position.x) ? position.x : 0;
        const py = Number.isFinite(position.y) ? position.y : 0;
        const pz = Number.isFinite(position.z) ? position.z : 0;
        if (targetPositions) targetPositions[pocketIndex] = { x: px, y: py, z: pz };
      }
    });
    setFocusPocketIndices([...fallbackPocketEntries.keys()]);
    setFocusPocketRoleByIndex((fallbackPocket.roles as Map<number, string>) || new Map([[index, 'anchor']]));
    setFocusPocketMotionByIndex((fallbackPocket.motion as Map<number, Record<string, unknown>>) || new Map());
    setFocusPocketMeta({
      active: true,
      nodeCount: fallbackPocket.positions.size,
      primaryCount: fallbackPocketEntries.size,
      supportCount: 0,
      haloCount: 0,
      motif: fallbackPocket.motif?.key || 'market',
      motifLabel: fallbackPocket.motif?.label || 'threaded neighborhood',
      viewportProfile: fallbackPocket.viewportProfile || viewportProfile,
    } as Record<string, unknown>);
    withStateMutation(() => {
      (lState as Record<string, unknown>).nodesAreSettling = true;
      (lState as Record<string, unknown>).autoRotate = false;
    });
    syncPocketNodesToStore();
    return;
  }

  // Final fallback: simple local indices, no staged positions
  setFocusPocketIndices([...localIndices].filter((ci) => ci !== index));
  setFocusPocketRoleByIndex(new Map([[index, 'anchor']]));
  setFocusPocketMotionByIndex(new Map([
    [
      index,
      {
        role: 'anchor',
        delay: 0,
        duration: (personality as Record<string, unknown>).cameraDuration as number * 0.7,
        speed: 0.38,
        personality: (personality as Record<string, unknown>).type as string,
      },
    ],
  ]));
  setFocusPocketMeta({
    active: getFocusPocketIndices().length > 0,
    nodeCount: localIndices.size,
    primaryCount: primaryIndices.length,
    supportCount: supportIndices.length,
    haloCount: 0,
    viewportProfile,
    personality: (personality as Record<string, unknown>).type as string,
  } as Record<string, unknown>);

  const focusPosX = Number.isFinite(focusPos.x) ? focusPos.x : 0;
  const focusPosY = Number.isFinite(focusPos.y) ? focusPos.y : 0;
  const focusPosZ = Number.isFinite(focusPos.z) ? focusPos.z : 0;
  if (!points || !Array.isArray(points)) return;
  for (let i = 0; i < points.length; i++) {
    if (i === index) continue;
    if (!localIndices.has(i)) continue;
    const origPos = originalPositions?.[i];
    if (!origPos) continue;
    const origX = Number.isFinite(origPos.x) ? origPos.x : 0;
    const origY = Number.isFinite(origPos.y) ? origPos.y : 0;
    const origZ = Number.isFinite(origPos.z) ? origPos.z : 0;
    const dx = focusPosX - origX;
    const dy = focusPosY - origY;
    const dz = focusPosZ - origZ;
    const isPrimary = primaryIndices.includes(i);
    setFocusPocketRoleForIndex(i, isPrimary ? 'primary' : 'support');

    const baseDelay = isPrimary ? primaryIndices.indexOf(i) * 34 : 160;
    const staggerMult = (personality as Record<string, unknown>).staggerMult as number ?? 1;
    const cameraDuration = (personality as Record<string, unknown>).cameraDuration as number ?? 980;
    const compressionMult = (personality as Record<string, unknown>).compressionMult as number ?? 1;

    setFocusPocketMotionForIndex(i, {
      role: isPrimary ? 'primary' : 'support',
      delay: baseDelay * staggerMult,
      duration: (isPrimary ? 980 : 1120) * (cameraDuration / 980),
      speed: isPrimary ? 0.22 : 0.16,
      personality: (personality as Record<string, unknown>).type as string,
    });

    let compression = isPrimary
      ? navState.threadSource === 'semantic'
        ? 0.62
        : 0.28
      : navState.threadSource === 'semantic'
        ? 0.34
        : 0.18;

    // Step Inside: tighter pocket geometry at trailDepth 2
    if ((lState as Record<string, unknown>).trailDepth === 2) {
      compression *= isPrimary ? 0.4 : 0.52;
    }

    compression *= compressionMult;

    if (targetPositions) {
      targetPositions[i] = {
        x: origX + dx * compression,
        y: origY + dy * compression,
        z: origZ + dz * compression,
      };
    }
  }
  withStateMutation(() => {
    (lState as Record<string, unknown>).nodesAreSettling = true;
  });
  syncPocketNodesToStore();
}

// ── Sync Pocket Nodes → Svelte Store ────────────────────────────────────────

/**
 * Read the legacy `state.navState.focusPocketIndices` + `targetPositions`
 * + `focusPocketRoleByIndex` and push a derived `FocusPocketNode[]` into
 * the Svelte `focusStore.pocketNodes`. Called from the normal exit points
 * of `applyLocalNeighborhoodFocus` so the a11y layer (which reads the
 * Svelte store) stays in sync with the legacy engine state. Replaces the
 * previous public `mirrorFocusPocketToSvelteStore` which the FocusPocket
 * HTML overlay invoked after the build step.
 */
function syncPocketNodesToStore(): void {
  const lState = state as Record<string, unknown>;
  const navState = lState.navState as Record<string, unknown> | undefined;
  if (!navState) return;
  const indices = (navState.focusPocketIndices as number[] | undefined) ?? [];
  const roles =
    (navState.focusPocketRoleByIndex as Map<number, string> | undefined) ?? new Map<number, string>();
  const targetPositions = lState.targetPositions as Array<{ x: number; y: number; z: number }> | undefined;
  const nodePositions = lState.nodePositions as Array<{ x: number; y: number; z: number }> | undefined;
  const originalPositions = lState.originalPositions as Array<{ x: number; y: number; z: number }> | undefined;
  const records = getBusinessRecords();
  const anchorIndex = Number.isFinite(navState.focusedIndex as number)
    ? (navState.focusedIndex as number)
    : null;
  if (indices.length === 0 || anchorIndex == null) {
    setPocketNodes([]);
    return;
  }
  const nodes: FocusPocketNode[] = [];
  for (const idx of indices) {
    if (!Number.isFinite(idx) || idx < 0) continue;
    if (idx === anchorIndex) continue; // anchor is rendered separately
    const position =
      targetPositions?.[idx] ?? nodePositions?.[idx] ?? originalPositions?.[idx] ?? null;
    if (!position) continue;
    const legacyRole = (roles.get(idx) || 'support').toLowerCase();
    const role: FocusPocketNode['role'] =
      legacyRole === 'primary' || legacyRole === 'direct'
        ? 'direct'
        : legacyRole === 'civic'
        ? 'civic'
        : 'support';
    const record = records[idx];
    const label = record?.name ?? `Node ${idx}`;
    nodes.push({
      index: idx,
      position: [position.x ?? 0, position.y ?? 0, position.z ?? 0],
      role,
      score: 0.62,
      label,
      rotationSeed: (idx * 7919) % 360,
      scaleSeed: ((idx * 104729) % 1000) / 1000
    });
  }
  setPocketNodes(nodes);
}

// ── Focus Pocket Breathing ──────────────────────────────────────────────────

export function applyFocusPocketBreathing(
  now: number,
  positions: Array<{ x: number; y: number; z: number }> | null
): boolean {
  const lState = state as Record<string, unknown>;
  const navState = lState.navState as Record<string, unknown>;
  const focusPocketMeta = navState.focusPocketMeta as Record<string, unknown> | null;
  const focusPocketMotionByIndex = lState.focusPocketMotionByIndex as Map<number, Record<string, unknown>> | undefined;
  const targetPositions = lState.targetPositions as Array<{ x: number; y: number; z: number }> | undefined;
  const nodePositions = lState.nodePositions as Array<{ x: number; y: number; z: number }> | undefined;
  const originalPositions = lState.originalPositions as Array<{ x: number; y: number; z: number }> | undefined;

  if (!focusPocketMeta?.active || !focusPocketMotionByIndex?.size || !positions) return false;
  if (prefersReducedMotion()) return false;

  const age = now - ((lState as Record<string, unknown>).focusPocketTransitionStartedAt as number);
  const anchorIndex = Number.isFinite(navState.focusedIndex as number) ? (navState.focusedIndex as number) : null;
  const anchor = (anchorIndex != null)
    ? (targetPositions?.[anchorIndex] || nodePositions?.[anchorIndex] || originalPositions?.[anchorIndex])
    : null;
  if (anchor && !(Number.isFinite(anchor.x) && Number.isFinite(anchor.y) && Number.isFinite(anchor.z))) return false;

  // Prepare camera view vector for rotation
  const camera = (lState as { camera?: THREE.PerspectiveCamera }).camera;
  const viewVec = new THREE.Vector3(0, 0, 1);
  if (camera && anchor) {
    viewVec.subVectors(camera.position, new THREE.Vector3(anchor.x, anchor.y, anchor.z)).normalize();
  }

  let changed = false;
  focusPocketMotionByIndex.forEach((motion, idx) => {
    const basePosition = targetPositions?.[idx] || nodePositions?.[idx] || originalPositions?.[idx];
    if (!basePosition) return;
    if (idx === anchorIndex || !anchor) return;

    const delay = (motion.delay as number) || 0;
    const duration = (motion.duration as number) || 800;
    const elapsed = Math.max(0, age - delay);
    const t = Math.min(1, elapsed / duration);
    const breatheAmp = (motion.breatheAmp as number) || 0.02;
    const phase = (motion.phase as number) || 0;
    const settle = easeOutQuint(t);
    const breatheOffset = Math.sin(age * 0.0015 + phase) * breatheAmp * settle;
    if (!Number.isFinite(breatheOffset)) return;

    const offset = new THREE.Vector3(
      basePosition.x - anchor.x,
      basePosition.y - anchor.y,
      basePosition.z - anchor.z
    );

    // Slow kinetic orbit swirling
    const speedFactor = motion.role === 'primary' ? 1.0 : 0.45;
    const direction = (idx % 2 === 0) ? 1 : -1;
    const orbitAngle = elapsed * 0.00035 * speedFactor * direction * settle;
    offset.applyAxisAngle(viewVec, orbitAngle);

    const x = anchor.x + offset.x * (1 + breatheOffset);
    const y = anchor.y + offset.y * (1 + breatheOffset);
    const z = anchor.z + offset.z * (1 + breatheOffset);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;

    const posObj = positions[idx];
    if (!posObj) return;

    if (
      Math.abs((posObj.x || 0) - x) > 0.00001 ||
      Math.abs((posObj.y || 0) - y) > 0.00001 ||
      Math.abs((posObj.z || 0) - z) > 0.00001
    ) {
      posObj.x = x;
      posObj.y = y;
      posObj.z = z;
      changed = true;
    }
  });
  return changed;
}

// ── Runtime State Sync ──────────────────────────────────────────────────────

export function syncRuntimeState(snapshot: Record<string, unknown> = {}): void {
  withStateMutation(() => {
    const s = state as Record<string, unknown>;
    Object.entries(snapshot).forEach(([key, value]) => {
      s[key] = value;
    });
  });
}

export function getRuntimeStateSnapshot(): Record<string, unknown> {
  const lState = state as Record<string, unknown>;
  return {
    navState: lState.navState,
    targetPositions: lState.targetPositions,
    focusPocketMotionByIndex: lState.focusPocketMotionByIndex,
    focusPocketTransitionStartedAt: lState.focusPocketTransitionStartedAt,
    nodesAreSettling: lState.nodesAreSettling,
    autoRotate: lState.autoRotate,
  };
}
