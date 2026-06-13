/**
 * @lib/engine/camera-choreography/focus.ts
 * Focus camera animation — animateCameraToNode
 *
 * Port of js/modules/camera-controls-choreography-focus.js
 */
import * as THREE from 'three';
import type { NavState } from '@lib/types/state';
import {
  easeInOutSine,
  easeInOutCubic,
  quadraticBezierComponent,
  easeOutBack,
  easeOutQuint,
} from '@lib/utils/math-easing';
import * as legacyStateModule from '@legacy/state.js';
import * as selectorsStaticModule from '@legacy/state/selectors/index.js';
import * as cameraFramingUtilsStaticModule from '@legacy/modules/camera-framing-utils.js';
import * as cameraMathUtilsStaticModule from '@legacy/modules/camera-math-utils.js';
import * as cameraControlsCoreStaticModule from '@legacy/modules/camera-controls-core.ts';

// ── Legacy Module Type Contracts ──────────────────────────────────────────────

/** Camera personality profile from nav state. */
interface PersonalityProfile {
  type: string;
  cameraDuration: number;
  cameraArc: string;
  easing: string;
  [key: string]: unknown;
}

/** Runtime FocusPocketMeta (extends @lib/types/state FocusPocketMeta with runtime-only fields). */
interface ChoreographyFocusPocketMeta {
  active: boolean;
  viewportProfile: Record<string, number>;
  motif: string;
  label: string;
  directLift: number;
  supportLift: number;
  directPriority: number;
  supportPriority: number;
  braid: number;
}

/** Runtime shape of focusFramingMeta (broader than @lib/types/state FocusFramingMeta). */
interface FocusFramingMetaLegacy {
  distance?: number;
  verticalLift?: number;
  framingDrop?: number;
  targetOffset?: THREE.Vector3;
  duration?: number;
  travelVector?: unknown;
  transitionStyle?: string;
  [key: string]: unknown;
}

/** Nav state shape as used by choreography (fixes currentPersonality type). */
interface ChoreographyNavState extends Omit<NavState, 'currentPersonality' | 'focusFramingMeta' | 'focusPocketMeta'> {
  currentPersonality: PersonalityProfile | null;
  focusFramingMeta: FocusFramingMetaLegacy | null;
  focusPocketMeta: ChoreographyFocusPocketMeta | null;
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
  nodePositions: Array<{ x: number; y: number; z: number }> | null;
  originalPositions: Array<{ x: number; y: number; z: number }> | null;
  focusCameraAnimationToken: number;
  focusCameraOffset: THREE.Vector3 | null;
  focusCameraTargetOffset: THREE.Vector3 | null;
  navState: ChoreographyNavState;
}

/** Selectors module shape. */
interface SelectorsModule {
  getNavState(): ChoreographyNavState;
}

/** Environment module shape. */
interface EnvironmentModule {
  prefersReducedMotion(): boolean;
}

/** Canvas region from framing utils. */
interface CanvasRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Pocket bounds from framing utils. */
interface PocketBounds {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

/** Framing utils module shape. */
interface FramingUtilsModule {
  getCanvasUnobstructedRegion(): CanvasRegion;
  computeFocusPocketScreenBounds(
    focusIndex: number | null,
    pocketIndices: readonly number[],
    state: unknown,
  ): PocketBounds | null;
  computeSafeAreaCameraTargetOffset(
    pocketBounds: PocketBounds,
    canvasRegion: CanvasRegion,
    focusDistance: number,
    camera: { position: THREE.Vector3 },
    controls: { target: THREE.Vector3 },
  ): THREE.Vector3 | null;
}

/** Math utils module shape. */
interface MathUtilsModule {
  computeTravelVectorHeading(
    focusTarget: THREE.Vector3,
    currentHeading: THREE.Vector3,
    transitionStyle: string,
    framing: Record<string, unknown>,
  ): { focusTarget: THREE.Vector3; heading: THREE.Vector3 };
  computeOrbitBiasHeading(
    currentHeading: THREE.Vector3,
    transitionStyle: string,
    pocketProfile: Record<string, unknown>,
  ): { heading: THREE.Vector3; stageRightVector: THREE.Vector3 | null };
  computeCameraArcControlPoints(
    startPos: THREE.Vector3,
    startTarget: THREE.Vector3,
    desiredCamPos: THREE.Vector3,
    focusTarget: THREE.Vector3,
    currentHeading: THREE.Vector3,
    distance: number,
    transitionStyle: string,
    personality: PersonalityProfile,
    pocketProfile: Record<string, unknown>,
    stageRightVector: THREE.Vector3 | null,
  ): {
    cameraControlPoint: THREE.Vector3 | null;
    targetControlPoint: THREE.Vector3 | null;
  };
}

/** Camera controls core module shape. */
interface CameraCoreModule {
  setFocusTransitionMode(mode: string, options?: { duration?: number }): void;
  startFocusCameraAssist(duration: number, reason: string): void;
}

// ── Lazy Module Cache ────────────────────────────────────────────────────────

let _state: LegacyState | null = null;
let _selectors: SelectorsModule | null = null;
let _environment: EnvironmentModule | null = null;
let _framingUtils: FramingUtilsModule | null = cameraFramingUtilsStaticModule as unknown as FramingUtilsModule;
let _mathUtils: MathUtilsModule | null = cameraMathUtilsStaticModule as unknown as MathUtilsModule;
let _cameraCore: CameraCoreModule | null = cameraControlsCoreStaticModule as unknown as CameraCoreModule;

let _loaded = false;

async function _ensureModules(): Promise<void> {
  if (_loaded) return;
  try {
    const [envMod] = await Promise.all([
      import('../../../../js/modules/environment.js'),
    ]);
    _state = (legacyStateModule as unknown as { state: LegacyState }).state;
    _selectors = selectorsStaticModule as unknown as SelectorsModule;
    _environment = envMod as unknown as EnvironmentModule;
    _loaded = true;
  } catch (err) {
    console.error('[camera-choreography/focus] Failed to load legacy modules:', err);
  }
}

void _ensureModules();

// ── Options ──────────────────────────────────────────────────────────────────

export interface AnimateCameraToNodeOptions {
  transitionStyle?: string;
  distance?: number;
  verticalLift?: number;
  framingDrop?: number;
  targetOffset?: THREE.Vector3;
  duration?: number;
  travelVector?: unknown;
}

// ── animateCameraToNode ──────────────────────────────────────────────────────

export function animateCameraToNode(
  index: number,
  options: AnimateCameraToNodeOptions = {},
): void {
  if (!_loaded || !_state || !_selectors || !_environment || !_framingUtils || !_mathUtils || !_cameraCore) return;
  if (!_state.camera || !_state.controls) return;

  const targetPosition = _state.nodePositions?.[index] || _state.originalPositions?.[index];
  if (!targetPosition) return;

  const navState = _selectors.getNavState();
  const framing: FocusFramingMetaLegacy & AnimateCameraToNodeOptions = {
    ...(navState.focusFramingMeta || {}),
    ...options,
  };
  const transitionStyle = framing.transitionStyle || 'focus';
  const tx = targetPosition.x, ty = targetPosition.y, tz = targetPosition.z;
  if (!Number.isFinite(tx) || !Number.isFinite(ty) || !Number.isFinite(tz)) return;

  const nodePos = new THREE.Vector3(tx, ty, tz);
  if (!_state.controls?.target || !_state.camera?.position) return;

  const startTarget = _state.controls.target.clone();
  const startPos = _state.camera.position.clone();
  const currentHeading = _state.camera.position.clone().sub(_state.controls.target).normalize();

  let defaultDistance = 0.86;
  if (transitionStyle === 'search') defaultDistance = 1.08;
  if (transitionStyle === 'walk' || transitionStyle === 'dive' || transitionStyle === 'dive-walk')
    defaultDistance = 1.0;
  const distance = framing.distance || defaultDistance;

  const verticalLift = framing.verticalLift || 0.045;
  const framingDrop = framing.framingDrop ?? 0.02;
  const framingOffset = framing.targetOffset?.clone ? framing.targetOffset.clone() : new THREE.Vector3();
  let focusTarget = nodePos
    .clone()
    .add(framingOffset)
    .add(new THREE.Vector3(0, -framingDrop, 0));
  if (!_state.focusCameraTargetOffset?.copy) _state.focusCameraTargetOffset = new THREE.Vector3();
  let heading = currentHeading.clone();
  let stageRightVector: THREE.Vector3 | null = null;
  let safeTargetOffset: THREE.Vector3 | null = null;
  const isSemanticPocketFocus = navState.threadSource === 'semantic' && navState.focusPocketMeta?.active;

  if (isSemanticPocketFocus && navState.focusPocketIndices?.length) {
    const pocketBounds = _framingUtils.computeFocusPocketScreenBounds(
      navState.focusedIndex,
      navState.focusPocketIndices,
      _state,
    );
    if (pocketBounds) {
      const region = _framingUtils.getCanvasUnobstructedRegion();
      const camDist = _state.camera.position.distanceTo(_state.controls.target);
      const safeOffset = _framingUtils.computeSafeAreaCameraTargetOffset(
        pocketBounds,
        region,
        camDist,
        _state.camera,
        _state.controls,
      );
      if (safeOffset) {
        const pocketProfile = navState.focusPocketMeta?.viewportProfile || {};
        const offsetLimit = Number.isFinite(pocketProfile.targetOffsetLimit as number)
          ? (pocketProfile.targetOffsetLimit as number)
          : 0.12;
        if (safeOffset.length() > offsetLimit) safeOffset.setLength(offsetLimit);
        const nudgeTarget = focusTarget.clone().add(safeOffset);
        if (
          Number.isFinite(nudgeTarget.x) &&
          Number.isFinite(nudgeTarget.y) &&
          Number.isFinite(nudgeTarget.z)
        ) {
          safeTargetOffset = safeOffset;
        }
      }
    }
  }
  if (safeTargetOffset) {
    focusTarget = focusTarget.clone().add(safeTargetOffset);
  }

  if (
    (transitionStyle === 'walk' || transitionStyle === 'dive' || transitionStyle === 'dive-walk') &&
    framing.travelVector
  ) {
    const res = _mathUtils.computeTravelVectorHeading(focusTarget, currentHeading, transitionStyle, framing as unknown as Record<string, unknown>);
    focusTarget = res.focusTarget;
    heading = res.heading;
  }

  if (
    (transitionStyle === 'search' ||
      transitionStyle === 'focus' ||
      transitionStyle === 'walk' ||
      transitionStyle === 'dive' ||
      transitionStyle === 'dive-walk') &&
    isSemanticPocketFocus
  ) {
    const pocketProfile = (navState.focusPocketMeta?.viewportProfile || {}) as Record<string, unknown>;
    const res = _mathUtils.computeOrbitBiasHeading(currentHeading, transitionStyle, pocketProfile);
    heading = res.heading;
    stageRightVector = res.stageRightVector;
  }

  const desiredCamPos = focusTarget
    .clone()
    .add(heading.multiplyScalar(distance))
    .add(new THREE.Vector3(0, verticalLift, 0));

  const personality: PersonalityProfile = navState.currentPersonality || {
    type: 'STANDARD',
    cameraDuration: 980,
    cameraArc: 'standard',
    easing: 'easeInOutCubic',
  };
  const baseDuration = framing.duration || (transitionStyle === 'dive' ? 1480 : personality.cameraDuration || 980);
  const prefersReducedCameraMotion = _environment.prefersReducedMotion();
  const duration = prefersReducedCameraMotion ? 1 : baseDuration;

  const animationToken = ++_state.focusCameraAnimationToken;
  _state.focusCameraOffset = desiredCamPos.clone().sub(focusTarget);
  if (!_state.focusCameraTargetOffset || typeof _state.focusCameraTargetOffset.copy !== 'function') {
    _state.focusCameraTargetOffset = new THREE.Vector3();
  }
  if (_state.focusCameraTargetOffset) {
    _state.focusCameraTargetOffset.copy(focusTarget.clone().sub(nodePos));
  }
  _cameraCore.setFocusTransitionMode(transitionStyle, { duration });
  if (prefersReducedCameraMotion) {
    _state.controls.target.copy(focusTarget);
    _state.camera.position.copy(desiredCamPos);
    _state.controls.update();
    return;
  }

  _cameraCore.startFocusCameraAssist(duration + 100, transitionStyle);
  const startTime = performance.now();
  if (
    !Number.isFinite(
      startTarget.x + startTarget.y + startTarget.z +
      startPos.x + startPos.y + startPos.z +
      focusTarget.x + focusTarget.y + focusTarget.z +
      desiredCamPos.x + desiredCamPos.y + desiredCamPos.z,
    )
  )
    return;

  const stageArcActive =
    isSemanticPocketFocus &&
    (transitionStyle === 'search' ||
      transitionStyle === 'focus' ||
      transitionStyle === 'walk' ||
      transitionStyle === 'dive' ||
      transitionStyle === 'dive-walk');
  let cameraControlPoint: THREE.Vector3 | null = null;
  let targetControlPoint: THREE.Vector3 | null = null;

  if (stageArcActive) {
    const pocketProfile = (navState.focusPocketMeta?.viewportProfile || {}) as Record<string, unknown>;
    const res = _mathUtils.computeCameraArcControlPoints(
      startPos, startTarget, desiredCamPos, focusTarget,
      currentHeading, distance, transitionStyle, personality, pocketProfile, stageRightVector,
    );
    cameraControlPoint = res.cameraControlPoint;
    targetControlPoint = res.targetControlPoint;
  }

  function step(now: number): void {
    if (animationToken !== _state!.focusCameraAnimationToken) return;
    const t = Math.min((now - startTime) / duration, 1);

    const personalityEasing =
      personality.easing === 'easeOutBack'
        ? easeOutBack(t)
        : personality.easing === 'easeOutQuint'
          ? easeOutQuint(t)
          : easeInOutCubic(t);
    const eased = stageArcActive
      ? personality.type === 'TIGHT_CLUSTER'
        ? easeInOutCubic(t)
        : easeInOutSine(t)
      : transitionStyle === 'walk' || transitionStyle === 'dive-walk'
        ? easeInOutCubic(t)
        : transitionStyle === 'search'
          ? easeInOutCubic(t)
          : personalityEasing;

    if (cameraControlPoint && targetControlPoint) {
      _state!.controls!.target.set(
        quadraticBezierComponent(startTarget.x, targetControlPoint.x, focusTarget.x, eased),
        quadraticBezierComponent(startTarget.y, targetControlPoint.y, focusTarget.y, eased),
        quadraticBezierComponent(startTarget.z, targetControlPoint.z, focusTarget.z, eased),
      );
      _state!.camera!.position.set(
        quadraticBezierComponent(startPos.x, cameraControlPoint.x, desiredCamPos.x, eased),
        quadraticBezierComponent(startPos.y, cameraControlPoint.y, desiredCamPos.y, eased),
        quadraticBezierComponent(startPos.z, cameraControlPoint.z, desiredCamPos.z, eased),
      );
    } else {
      _state!.controls!.target.lerpVectors(startTarget, focusTarget, eased);
      _state!.camera!.position.lerpVectors(startPos, desiredCamPos, eased);
    }

    if (t > 0.85 && stageArcActive && !prefersReducedCameraMotion) {
      const driftIntensity = (t - 0.85) * 0.15;
      const worldUp = new THREE.Vector3(0, 1, 0);
      const driftDir = new THREE.Vector3().crossVectors(worldUp, currentHeading).normalize();
      _state!.camera!.position.add(driftDir.multiplyScalar(driftIntensity * 0.02));
    }

    _state!.controls!.update();
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      _state!.focusCameraOffset = null;
    }
  }
  requestAnimationFrame(step);
}
