/**
 * @lib/engine/camera-choreography/routes.ts
 * Search corridor, terrain prelude, semantic centroid, zoom animations
 *
 * Port of js/modules/camera-controls-choreography-routes.ts
 */
import * as THREE from 'three';
import type {
  ChoreographyCamera,
  ChoreographyControls,
  ChoreographyPersonality,
} from './types';
import {
  easeInOutCubic,
  quadraticBezierComponent,
} from '@lib/utils/math-easing';
import { isMobile, prefersReducedMotion } from '@lib/utils/environment';
import { publish, EVENTS } from '@lib/orchestration/event-bus';
import { noteSceneInteraction } from '@lib/engine/camera-controls-restore';
import { setFocusTransitionMode } from '@lib/engine/camera-controls-core';
import * as legacyStateModule from '../../../../js/state';
import * as selectorsStaticModule from '../../../../js/state/selectors/index';

// ── Selectors ────────────────────────────────────────────────────────────────

const getCamera = selectorsStaticModule.getCamera;
const getControls = selectorsStaticModule.getControls;
const getNodePositions = selectorsStaticModule.getNodePositions;
const getOriginalPositions = selectorsStaticModule.getOriginalPositions;
const getTargetPositions = selectorsStaticModule.getTargetPositions;
const getNavState = selectorsStaticModule.getNavState;
const getCurrentView = selectorsStaticModule.getCurrentView;
const getSemanticDiveMode = selectorsStaticModule.getSemanticDiveMode;
const getPoints = selectorsStaticModule.getPoints;
const getTrailDepth = selectorsStaticModule.getTrailDepth;
const getActiveClusterFilter = selectorsStaticModule.getActiveClusterFilter;
const getRouteCameraAnimationToken = selectorsStaticModule.getRouteCameraAnimationToken;
const getMapHandoffPreludeMs = selectorsStaticModule.getMapHandoffPreludeMs;
const getOrbitMinDistanceDefault = selectorsStaticModule.getOrbitMinDistanceDefault;
const getOrbitMaxDistanceDefault = selectorsStaticModule.getOrbitMaxDistanceDefault;

// ── State ────────────────────────────────────────────────────────────────────

const state = legacyStateModule.state;

// ── Typed Accessors ──────────────────────────────────────────────────────────

function getTypedCamera(): ChoreographyCamera | null {
  return getCamera() as ChoreographyCamera | null;
}

function getTypedControls(): ChoreographyControls | null {
  return getControls() as ChoreographyControls | null;
}

function getTypedNodePositions(): NodePosition[] {
  return getNodePositions() as NodePosition[];
}

function getTypedOriginalPositions(): NodePosition[] {
  return getOriginalPositions() as NodePosition[];
}

function getTypedTargetPositions(): NodePosition[] {
  return getTargetPositions() as NodePosition[];
}

function getTypedPoints(): Point[] {
  return getPoints() as Point[];
}

// ── Local Types ──────────────────────────────────────────────────────────────

interface RouteOptions {
  duration?: number;
  reason?: string;
}

/** Node position shape from the state selectors. */
interface NodePosition {
  x: number;
  y: number;
  z: number;
}

/** Point shape from the points array. */
interface Point {
  cluster?: number | string;
  lead_id?: number | string | null;
  [key: string]: unknown;
}

// ── Module-level Mutable State ───────────────────────────────────────────────

let _insideCentroidLerpToken = 0;

// ── animateCameraToSearchCorridor ────────────────────────────────────────────

export function animateCameraToSearchCorridor(
  anchorIndex: number,
  resultIndices: number[] = [],
  options: RouteOptions = {},
): boolean {
  const camera = getTypedCamera();
  const controls = getTypedControls();
  if (!camera || !controls || getCurrentView() !== 'galaxy') return false;
  const activeCamera: ChoreographyCamera = camera;
  const activeControls: ChoreographyControls = controls;
  if (!Number.isFinite(anchorIndex) || getNavState().focusedIndex !== null || getSemanticDiveMode()) return false;

  const isPointVisible = (
    index: number,
    points: Point[],
    clusterFilter: number | null,
  ): boolean => {
    if (!Number.isFinite(index) || index < 0 || index >= points.length) return false;
    const point = points[index];
    if (!point) return false;
    if (clusterFilter !== null) {
      const pointCluster = Number.isFinite(Number(point.cluster)) ? Number(point.cluster) : 0;
      if (pointCluster !== clusterFilter) return false;
    }
    return true;
  };

  const routeIndices = [...new Set([anchorIndex, ...(resultIndices || [])])]
    .filter(
      (index) =>
        Number.isFinite(index) &&
        index >= 0 &&
        index < getTypedPoints().length &&
        isPointVisible(index, getTypedPoints(), getActiveClusterFilter()),
    )
    .slice(0, isMobile() ? 8 : 12);

  const vectors = routeIndices
    .map((index) => getTypedTargetPositions()[index] || getTypedNodePositions()[index] || getTypedOriginalPositions()[index])
    .filter((pos): pos is NodePosition => Boolean(pos))
    .map((pos) => new THREE.Vector3(pos.x, pos.y, pos.z));
  if (!vectors.length) return false;
  const box = new THREE.Box3().setFromPoints(vectors);
  const boundsCenter = new THREE.Vector3();
  const boundsSize = new THREE.Vector3();
  box.getCenter(boundsCenter);
  box.getSize(boundsSize);
  const radius = Math.max(0.08, boundsSize.length() * 0.5);

  const anchorPosition =
    getTypedTargetPositions()[anchorIndex] || getTypedNodePositions()[anchorIndex] || getTypedOriginalPositions()[anchorIndex];
  if (
    !anchorPosition ||
    !Number.isFinite(anchorPosition.x) ||
    !Number.isFinite(anchorPosition.y) ||
    !Number.isFinite(anchorPosition.z)
  )
    return false;

  const anchorVector = new THREE.Vector3(anchorPosition.x, anchorPosition.y, anchorPosition.z);
  const startTarget = activeControls.target.clone();
  const startPos = activeCamera.position.clone();
  const currentHeading = startPos.clone().sub(startTarget);
  if (currentHeading.lengthSq() < 0.0001) currentHeading.set(1.4, 1.1, 2);
  currentHeading.normalize();

  const worldUp = new THREE.Vector3(0, 1, 0);
  const rightVector = new THREE.Vector3().crossVectors(worldUp, currentHeading);
  if (rightVector.lengthSq() < 0.0001) rightVector.set(1, 0, 0);
  rightVector.normalize();

  const compact = isMobile();
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
  const animationToken = (state.routeCameraAnimationToken = (state.routeCameraAnimationToken || 0) + 1);

  publish(EVENTS.TRANSITION_PHASE_CHANGED, {
    phase: 'search-corridor',
    details: {
      reason: options.reason || 'search-success',
      anchorIndex,
      indexCount: routeIndices.length,
      lastCameraMove: 'search-corridor',
    },
  } as any);
  noteSceneInteraction(duration + 1200);

  const controlTarget = startTarget.clone().lerp(endTarget, 0.56).add(worldUp.clone().multiplyScalar(0.025));

  function step(now: number) {
    if (
      animationToken !== getRouteCameraAnimationToken() ||
      getNavState().focusedIndex !== null ||
      getCurrentView() !== 'galaxy'
    )
      return;
    if (!activeControls.target || !activeCamera.position) return;
    const t = Math.min((now - startTime) / duration, 1);
    const eased = easeInOutCubic(t);
    activeControls.target.set(
      quadraticBezierComponent(startTarget.x, controlTarget.x, endTarget.x, eased),
      quadraticBezierComponent(startTarget.y, controlTarget.y, endTarget.y, eased),
      quadraticBezierComponent(startTarget.z, controlTarget.z, endTarget.z, eased),
    );
    activeCamera.position.lerpVectors(startPos, endPos, eased);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
  return true;
}

// ── animateCameraToTerrainPrelude ────────────────────────────────────────────

export function animateCameraToTerrainPrelude(
  options: RouteOptions = {},
): void {
  const reducedMotion = prefersReducedMotion();
  const duration = reducedMotion ? 1 : options.duration || getMapHandoffPreludeMs() || 1200;

  publish(EVENTS.TRANSITION_PHASE_CHANGED, { phase: 'map-prelude', options: { duration } } as any);

  try {
    const camera = getTypedCamera();
    const controls = getTypedControls();
    if (!camera || !controls) return;
    const activeCamera: ChoreographyCamera = camera;
    const activeControls: ChoreographyControls = controls;
    const startPos = activeCamera.position.clone();
    const startTarget = activeControls.target.clone();

    const heading = startPos.clone().sub(startTarget).normalize();
    const worldUp = new THREE.Vector3(0, 1, 0);
    const desiredPos = startTarget.clone().add(heading.multiplyScalar(0.8)).add(worldUp.multiplyScalar(0.4));

    if (reducedMotion) {
      activeCamera.position.copy(desiredPos);
      activeControls.update();
      return;
    }

    const animationToken = ++state.focusCameraAnimationToken;
    const startTime = performance.now();

    setFocusTransitionMode('map-prelude', { duration });

    const priorControlsEnabled = activeControls.enabled;
    activeControls.enabled = false;

    function step(now: number) {
      if (animationToken !== state.focusCameraAnimationToken) {
        activeControls.enabled = priorControlsEnabled;
        return;
      }
      const t = Math.min((now - startTime) / duration, 1);
      const eased = easeInOutCubic(t);

      activeCamera.position.lerpVectors(startPos, desiredPos, eased);

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        activeControls.enabled = priorControlsEnabled;
      }
    }
    requestAnimationFrame(step);
  } catch (_err) {
    console.error('animateCameraToTerrainPrelude failed:', _err);
  } finally {
    publish(EVENTS.TRANSITION_PHASE_CHANGED, { phase: 'idle' });
  }
}

// ── applySemanticCentroidCamera ───────────────────────────────────────────────

export function applySemanticCentroidCamera(now = performance.now()): void {
  const camera = getTypedCamera();
  const controls = getTypedControls();
  if (!camera || !controls) return;
  const activeControls: ChoreographyControls = controls;
  if (getTrailDepth() !== 2) {
    return;
  }
  const navState = getNavState();
  const indices = navState.focusPocketIndices;
  if (!indices || !indices.length) return;

  const anchorIdx = navState.focusedIndex;
  const pocketIndices = anchorIdx !== null && anchorIdx !== undefined ? [anchorIdx, ...indices] : indices;

  let cx = 0, cy = 0, cz = 0, count = 0;
  for (const idx of pocketIndices) {
    const pos = getTypedNodePositions()[idx] || getTypedOriginalPositions()[idx];
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
      ? getTypedNodePositions()[anchorIdx] || getTypedOriginalPositions()[anchorIdx]
      : null;
  if (!anchorPos) return;

  const anchorVec = new THREE.Vector3(
    Number.isFinite(anchorPos.x) ? anchorPos.x : 0,
    Number.isFinite(anchorPos.y) ? anchorPos.y : 0,
    Number.isFinite(anchorPos.z) ? anchorPos.z : 0,
  );

  const personality = (state.navState.currentPersonality || {}) as ChoreographyPersonality;
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
  const startTarget = activeControls.target.clone();
  const startTime = now;
  const reducedMotion = prefersReducedMotion();
  const duration = reducedMotion ? 1 : 1600;

  function stepCentroid(nowInner: number) {
    if (token !== _insideCentroidLerpToken) return;
    const t = Math.min(1, (nowInner - startTime) / duration);
    const eased = easeInOutCubic(t);
    activeControls.target.lerpVectors(startTarget, lookAtTarget, eased);
    activeControls.update();
    if (t < 1) requestAnimationFrame(stepCentroid);
  }
  if (prefersReducedMotion()) {
    activeControls.target.copy(lookAtTarget);
    activeControls.update();
  } else {
    requestAnimationFrame(stepCentroid);
  }
}

// ── zoomCamera ───────────────────────────────────────────────────────────────

export function zoomCamera(multiplier: number): void {
  const camera = getTypedCamera();
  const controls = getTypedControls();
  if (!camera || !controls) return;
  const target = controls.target;
  if (!target) return;
  const camPos = camera.position;
  if (!Number.isFinite(camPos.x + camPos.y + camPos.z + target.x + target.y + target.z)) return;
  const direction = camPos.clone().sub(target).normalize();
  const currentDistance = camPos.distanceTo(target);
  const newDistance = currentDistance * multiplier;
  const minDist = controls.minDistance || getOrbitMinDistanceDefault() || 0.5;
  const maxDist = controls.maxDistance || getOrbitMaxDistanceDefault() || 8.0;
  const clampedDistance = Math.max(minDist, Math.min(maxDist, newDistance));
  camera.position.copy(target.clone().add(direction.multiplyScalar(clampedDistance)));
}

// ── clearInsideCentroid ──────────────────────────────────────────────────────

export function clearInsideCentroid(): void {
  _insideCentroidLerpToken++;
}
