/**
 * @lib/engine/camera-choreography/routes.ts
 * Search corridor, terrain prelude, semantic centroid, zoom animations
 *
 * Port of js/modules/camera-controls-choreography-routes.js
 */
import * as THREE from 'three';
import type { NavState } from '@lib/types/state';
// ActiveFilters removed — was unused in this bridge file
import {
  easeInOutCubic,
  quadraticBezierComponent,
} from '@lib/utils/math-easing';
import {
  getCamera,
  getControls,
  getNodePositions,
  getOriginalPositions,
  getTargetPositions,
  getNavState,
  getCurrentView,
  getSemanticDiveMode,
  getPoints,
  getTrailDepth,
  getActiveClusterFilter,
  // getActiveFilters removed — unused in bridge
  getRouteCameraAnimationToken,
  getMapHandoffPreludeMs,
  getOrbitMinDistanceDefault,
  getOrbitMaxDistanceDefault,
} from '@lib/engine/state-selectors-bridge';
import { state as legacyState } from '@lib/engine/state-bridge';
import { setFocusTransitionMode } from '@lib/engine/camera-controls-core-bridge';
import { noteSceneInteraction } from '@lib/engine/camera-controls-restore-bridge';

// ── Legacy Module Type Contracts ──────────────────────────────────────────────

/** Camera personality profile from nav state. */
interface PersonalityProfile {
  type: string;
  cameraDuration: number;
  cameraArc: string;
  easing: string;
  [key: string]: unknown;
}

/** Nav state shape as used by choreography (fixes currentPersonality type). */
interface ChoreographyNavState extends Omit<NavState, 'currentPersonality' | 'focusPocketMeta'> {
  currentPersonality: PersonalityProfile | null;
  focusPocketMeta: { active: boolean; viewportProfile: Record<string, number> } | null;
}

/** Point shape from the points array. */
interface Point {
  cluster?: number | string;
  lead_id?: number | string | null;
  [key: string]: unknown;
}

/** Minimal legacy state properties accessed by this module. */
interface LegacyState {
  camera: { position: THREE.Vector3 } | null;
  controls: {
    target: THREE.Vector3;
    enabled: boolean;
    update(): void;
    minDistance: number;
    maxDistance: number;
  } | null;
  routeCameraAnimationToken: number;
  focusCameraAnimationToken: number;
  navState: ChoreographyNavState;
}



/** Environment module shape. */
interface EnvironmentModule {
  isMobile(): boolean;
  prefersReducedMotion(): boolean;
}

/** Event bus module shape. */
interface EventBusModule {
  publish(eventName: string, payload?: Record<string, unknown>): void;
  EVENTS: Record<string, string>;
}

// ── Lazy Module Cache ────────────────────────────────────────────────────────

let _state: LegacyState | null = null;
let _environment: EnvironmentModule | null = null;
let _eventBus: EventBusModule | null = null;

let _loaded = false;

async function _ensureModules(): Promise<void> {
  if (_loaded) return;
  try {
    const [envMod, busMod] = await Promise.all([
      import('../../../../js/modules/environment.js'),
      import('../../../../js/modules/event-bus.js'),
    ]);
    _state = legacyState as unknown as LegacyState;
    _environment = envMod as unknown as EnvironmentModule;
    _eventBus = busMod as unknown as EventBusModule;
    _loaded = true;
  } catch (err) {
    console.error('[camera-choreography/routes] Failed to load legacy modules:', err);
  }
}

void _ensureModules();

// ── Module-level Mutable State ───────────────────────────────────────────────

let _insideCentroidLerpToken = 0;

function normalizeIndexArray(indices: unknown): number[] {
  return Array.isArray(indices) ? Array.prototype.slice.call(indices) : [];
}

// ── animateCameraToSearchCorridor ────────────────────────────────────────────

export function animateCameraToSearchCorridor(
  anchorIndex: number,
  resultIndices: number[] = [],
  options: { duration?: number; reason?: string } = {},
): boolean {
  if (!_loaded || !_environment || !_eventBus) return false;
  if (!getCamera() || !getControls() || getCurrentView() !== 'galaxy') return false;
  if (!Number.isFinite(anchorIndex) || getNavState().focusedIndex !== null || getSemanticDiveMode()) return false;

  const isPointVisible = (index: number, points: Point[], clusterFilter: number | null): boolean => {
    if (!Number.isFinite(index) || index < 0 || index >= points.length) return false;
    const point = points[index];
    if (!point) return false;
    if (clusterFilter !== null) {
      const pointCluster = Number.isFinite(Number(point.cluster)) ? Number(point.cluster) : 0;
      if (pointCluster !== clusterFilter) return false;
    }
    return true;
  };

  const allPoints = getPoints();
  if (!allPoints) return false;

  const routeIndices = [...new Set([anchorIndex, ...(resultIndices || [])])]
    .filter(
      (index) =>
        Number.isFinite(index) &&
        index >= 0 &&
        index < allPoints.length &&
        isPointVisible(index, allPoints, getActiveClusterFilter()),
    )
    .slice(0, _environment.isMobile() ? 8 : 12);

  const targetPositions = getTargetPositions();
  const nodePositions = getNodePositions();
  const originalPositions = getOriginalPositions();

  const vectors = routeIndices
    .map((index) => targetPositions?.[index] || nodePositions?.[index] || originalPositions?.[index])
    .filter(Boolean)
    .map((pos) => new THREE.Vector3(pos!.x, pos!.y, pos!.z));
  if (!vectors.length) return false;
  const box = new THREE.Box3().setFromPoints(vectors);
  const boundsCenter = new THREE.Vector3();
  const boundsSize = new THREE.Vector3();
  box.getCenter(boundsCenter);
  box.getSize(boundsSize);
  const radius = Math.max(0.08, boundsSize.length() * 0.5);

  const anchorPosition =
    targetPositions?.[anchorIndex] || nodePositions?.[anchorIndex] || originalPositions?.[anchorIndex];
  if (
    !anchorPosition ||
    !Number.isFinite(anchorPosition.x) ||
    !Number.isFinite(anchorPosition.y) ||
    !Number.isFinite(anchorPosition.z)
  )
    return false;

  const anchorVector = new THREE.Vector3(anchorPosition.x, anchorPosition.y, anchorPosition.z);
  const startTarget = _state!.controls!.target.clone();
  const startPos = _state!.camera!.position.clone();
  const currentHeading = startPos.clone().sub(startTarget);
  if (currentHeading.lengthSq() < 0.0001) currentHeading.set(1.4, 1.1, 2);
  currentHeading.normalize();

  const worldUp = new THREE.Vector3(0, 1, 0);
  const rightVector = new THREE.Vector3().crossVectors(worldUp, currentHeading);
  if (rightVector.lengthSq() < 0.0001) rightVector.set(1, 0, 0);
  rightVector.normalize();

  const compact = _environment.isMobile();
  const routeSpan = Math.max(radius, 0.14);
  const targetBias = compact ? 0.42 : 0.34;
  const endTarget = boundsCenter
    .clone()
    .lerp(anchorVector, targetBias)
    .add(worldUp.clone().multiplyScalar(compact ? 0.018 : 0.028));
  const distance = Math.min(
    compact ? 2.35 : 1.95,
    Math.max(compact ? 1.1 : 0.92, routeSpan * (compact ? 4.1 : 3.2) + 0.52),
  );
  const endPos = endTarget
    .clone()
    .add(currentHeading.clone().multiplyScalar(distance))
    .add(worldUp.clone().multiplyScalar(compact ? 0.16 : 0.2))
    .add(rightVector.clone().multiplyScalar(compact ? 0.035 : 0.065));
  const duration = options.duration || (compact ? 1180 : 1320);
  const startTime = performance.now();
  const animationToken = (_state!.routeCameraAnimationToken = (_state!.routeCameraAnimationToken || 0) + 1);

  _eventBus.publish(_eventBus.EVENTS['TRANSITION_PHASE_CHANGED']!, {
    phase: 'search-corridor',
    details: {
      reason: options.reason || 'search-success',
      anchorIndex,
      indexCount: routeIndices.length,
      lastCameraMove: 'search-corridor',
    },
  });
  noteSceneInteraction(duration + 1200);

  const controlTarget = startTarget.clone().lerp(endTarget, 0.56).add(worldUp.clone().multiplyScalar(0.025));

  function step(now: number): void {
    if (
      animationToken !== getRouteCameraAnimationToken() ||
      getNavState().focusedIndex !== null ||
      getCurrentView() !== 'galaxy'
    )
      return;
    if (!_state?.controls?.target || !_state?.camera?.position) return;
    const t = Math.min((now - startTime) / duration, 1);
    const eased = easeInOutCubic(t);
    _state!.controls!.target.set(
      quadraticBezierComponent(startTarget.x, controlTarget.x, endTarget.x, eased),
      quadraticBezierComponent(startTarget.y, controlTarget.y, endTarget.y, eased),
      quadraticBezierComponent(startTarget.z, controlTarget.z, endTarget.z, eased),
    );
    _state!.camera!.position.lerpVectors(startPos, endPos, eased);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
  return true;
}

// ── animateCameraToTerrainPrelude ────────────────────────────────────────────

export function animateCameraToTerrainPrelude(
  options: { duration?: number } = {},
): void {
  if (!_loaded || !_environment || !_eventBus) return;

  const reducedMotion = _environment.prefersReducedMotion();
  const duration = reducedMotion ? 1 : options.duration || getMapHandoffPreludeMs() || 1200;

  _eventBus.publish(_eventBus.EVENTS['TRANSITION_PHASE_CHANGED']!, { phase: 'map-prelude', options: { duration } });

  try {
    if (!_state?.camera || !_state?.controls) return;
    const startPos = _state.camera.position.clone();
    const startTarget = _state.controls.target.clone();

    const heading = startPos.clone().sub(startTarget).normalize();
    const worldUp = new THREE.Vector3(0, 1, 0);
    const desiredPos = startTarget.clone().add(heading.multiplyScalar(0.8)).add(worldUp.multiplyScalar(0.4));

    if (reducedMotion) {
      _state.camera.position.copy(desiredPos);
      _state.controls.update();
      return;
    }

    const animationToken = ++_state.focusCameraAnimationToken;
    const startTime = performance.now();

    setFocusTransitionMode('map-prelude', { duration });

    const priorControlsEnabled = _state.controls.enabled;
    _state.controls.enabled = false;

    function step(now: number): void {
      if (animationToken !== _state!.focusCameraAnimationToken) {
        _state!.controls!.enabled = priorControlsEnabled;
        return;
      }
      const t = Math.min((now - startTime) / duration, 1);
      const eased = easeInOutCubic(t);

      _state!.camera!.position.lerpVectors(startPos, desiredPos, eased);

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        _state!.controls!.enabled = priorControlsEnabled;
      }
    }
    requestAnimationFrame(step);
  } catch (_err) {
    console.error('animateCameraToTerrainPrelude failed:', _err);
  } finally {
    _eventBus!.publish(_eventBus!.EVENTS['TRANSITION_PHASE_CHANGED']!, { phase: 'idle' });
  }
}

// ── applySemanticCentroidCamera ───────────────────────────────────────────────

export function applySemanticCentroidCamera(now: number = performance.now()): void {
  if (!_loaded || !_state || !_environment) return;
  if (!_state.camera || !_state.controls) return;
  if (getTrailDepth() !== 2) {
    return;
  }
  const navState = getNavState();
  const indices = normalizeIndexArray(navState.focusPocketIndices);
  if (!indices || !indices.length) return;

  const anchorIdx = navState.focusedIndex;
  const pocketIndices = anchorIdx !== null && anchorIdx !== undefined ? [anchorIdx].concat(indices) : indices;

  let cx = 0, cy = 0, cz = 0, count = 0;
  for (const idx of pocketIndices) {
    const pos = getNodePositions()?.[idx] || getOriginalPositions()?.[idx];
    if (!pos) continue;
    cx += Number.isFinite(pos.x) ? pos.x : 0;
    cy += Number.isFinite(pos.y) ? pos.y : 0;
    cz += Number.isFinite(pos.z) ? pos.z : 0;
    count++;
  }
  if (!count) return;

  const pocketCentroid = new THREE.Vector3(cx / count, cy / count, cz / count);

  const anchorPos =
    anchorIdx !== null && anchorIdx !== undefined
      ? getNodePositions()?.[anchorIdx] || getOriginalPositions()?.[anchorIdx]
      : null;
  if (!anchorPos) return;

  const anchorVec = new THREE.Vector3(
    Number.isFinite(anchorPos.x) ? anchorPos.x : 0,
    Number.isFinite(anchorPos.y) ? anchorPos.y : 0,
    Number.isFinite(anchorPos.z) ? anchorPos.z : 0,
  );

  const personality = _state.navState.currentPersonality || ({} as PersonalityProfile);
  let centroidWeight: number;
  if (personality.type === 'TIGHT_CLUSTER') {
    centroidWeight = 0.12;
  } else if (personality.cameraArc === 'tight') {
    centroidWeight = 0.18;
  } else {
    centroidWeight = 0.28;
  }
  const lookAtTarget = anchorVec.clone().lerp(pocketCentroid, centroidWeight);

  const token = ++_insideCentroidLerpToken;
  const startTarget = _state.controls.target.clone();
  const startTime = now;
  const reducedMotion = _environment.prefersReducedMotion();
  const duration = reducedMotion ? 1 : 1600;

  function stepCentroid(nowInner: number): void {
    if (token !== _insideCentroidLerpToken) return;
    const t = Math.min(1, (nowInner - startTime) / duration);
    const eased = easeInOutCubic(t);
    _state!.controls!.target.lerpVectors(startTarget, lookAtTarget, eased);
    _state!.controls!.update();
    if (t < 1) requestAnimationFrame(stepCentroid);
  }
  if (reducedMotion) {
    _state.controls.target.copy(lookAtTarget);
    _state.controls.update();
  } else {
    requestAnimationFrame(stepCentroid);
  }
}

// ── zoomCamera ───────────────────────────────────────────────────────────────

export function zoomCamera(multiplier: number): void {
  if (!_loaded) return;
  const camera = getCamera() as THREE.Camera | null;
  const controls = getControls() as unknown as { target: THREE.Vector3 | undefined; minDistance?: number; maxDistance?: number } | null;
  if (!camera || !controls) return;
  const target = controls.target;
  if (!target) return;
  const camPos = camera.position;
  if (!Number.isFinite(camPos.x + camPos.y + camPos.z + target.x + target.y + target.z)) return;
  const clonedPos = camPos.clone();
  const direction = (clonedPos as THREE.Vector3).sub(target as THREE.Vector3).normalize();
  const currentDistance = (camPos as THREE.Vector3).distanceTo(target as THREE.Vector3);
  const newDistance = currentDistance * multiplier;
  const minDist = controls.minDistance || getOrbitMinDistanceDefault() || 0.5;
  const maxDist = controls.maxDistance || getOrbitMaxDistanceDefault() || 8.0;
  const clampedDistance = Math.max(minDist, Math.min(maxDist, newDistance));
  const offset = (direction as THREE.Vector3).multiplyScalar(clampedDistance);
  const newPos = (target as THREE.Vector3).clone().add(offset as THREE.Vector3);
  (camera as THREE.Camera).position.copy(newPos as THREE.Vector3);
}

// ── clearInsideCentroid ──────────────────────────────────────────────────────

export function clearInsideCentroid(): void {
  _insideCentroidLerpToken++;
}
