import * as THREE from 'three'
import { state } from '../state.js'
import type { NodePosition, SemanticState, NavState, NavFocusPocketMeta } from '../../types/state'
import {
  getNavState
} from '../state/selectors/index.js'
import { prefersReducedMotion } from './environment.js'
import {
  type AppStateLike,
  getCanvasUnobstructedRegion,
  computeFocusPocketScreenBounds,
  computeSafeAreaCameraTargetOffset
} from './camera-framing-utils.js'
import {
  type FramingParams,
  type PocketProfile,
  computeTravelVectorHeading,
  computeOrbitBiasHeading,
  computeCameraArcControlPoints
} from './camera-math-utils.js'
import {
  easeInOutSine,
  easeInOutCubic,
  quadraticBezierComponent,
  easeOutBack,
  easeOutQuint
} from './utils/math-easing.js'
import { setFocusTransitionMode, startFocusCameraAssist } from './camera-controls-core.js'
import type {
  ChoreographyCamera,
  ChoreographyControls,
  ChoreographyPersonality
} from './camera-controls-choreography-types.js'

interface FocusFramingOptions extends FramingParams {
  transitionStyle?: string
  distance?: number
  verticalLift?: number
  framingDrop?: number
  targetOffset?: THREE.Vector3
  duration?: number
}

interface FocusPocketProfile extends PocketProfile {
  targetOffsetLimit?: number
}

interface FocusPersonality extends ChoreographyPersonality {
  [key: string]: unknown
  cameraDuration?: number
  easing?: string
}

/** Narrowed navState for focus camera animation. Overrides base types with camera-specific shapes. */
interface FocusNavState extends NavState {
  focusFramingMeta: Partial<FocusFramingOptions> | null
  focusPocketMeta: (NavFocusPocketMeta & { viewportProfile?: FocusPocketProfile }) | null
  currentPersonality: FocusPersonality | null
}

interface FocusCameraState extends Omit<SemanticState, 'camera' | 'controls' | 'navState'> {
  camera: ChoreographyCamera
  controls: ChoreographyControls
  navState: FocusNavState
}

const _s = state as unknown as FocusCameraState

function getTypedNavState(): FocusNavState {
  return getNavState() as FocusNavState
}

// -----------------------------------------------------------------------------
// FOCUS CAMERA ANIMATION — animateCameraToNode
// -----------------------------------------------------------------------------

let _focusCameraRafId: number | null = null;

export function cancelFocusCameraAnimation() {
    if (_focusCameraRafId !== null) {
        window.cancelAnimationFrame(_focusCameraRafId);
        _focusCameraRafId = null;
    }
}

export function animateCameraToNode(index: number, options: FocusFramingOptions = {}) {
  if (!_s.camera || !_s.controls) return
  const targetPosition: NodePosition | undefined = _s.nodePositions[index] || _s.originalPositions[index]
  if (!targetPosition) return
  const framing = {
    ...(getTypedNavState().focusFramingMeta || {}),
    ...options
  } as FocusFramingOptions
  const transitionStyle = framing.transitionStyle || 'focus'
  const tx = targetPosition.x, ty = targetPosition.y, tz = targetPosition.z
  if (!Number.isFinite(tx) || !Number.isFinite(ty) || !Number.isFinite(tz)) return
  const nodePos = new THREE.Vector3(tx, ty, tz)
  if (!_s.controls?.target || !_s.camera?.position) return
  const startTarget = _s.controls.target.clone()
  const startPos = _s.camera.position.clone()
  const currentHeading = _s.camera.position.clone().sub(_s.controls.target).normalize()

  let defaultDistance = 0.86
  if (transitionStyle === 'search') defaultDistance = 1.08
  if (transitionStyle === 'walk' || transitionStyle === 'dive' || transitionStyle === 'dive-walk')
    defaultDistance = 1.0
  const distance = framing.distance || defaultDistance

  const verticalLift = framing.verticalLift || 0.045
  const framingDrop = framing.framingDrop ?? 0.02
  const framingOffset = framing.targetOffset?.clone ? framing.targetOffset.clone() : new THREE.Vector3()
  let focusTarget = nodePos
    .clone()
    .add(framingOffset)
    .add(new THREE.Vector3(0, -framingDrop, 0))
  if (!_s.focusCameraTargetOffset?.copy) _s.focusCameraTargetOffset = new THREE.Vector3()
  let heading = currentHeading.clone()
  let stageRightVector: THREE.Vector3 | null = null
  let safeTargetOffset: THREE.Vector3 | null = null
  const navState = getTypedNavState()
  const isSemanticPocketFocus = navState.threadSource === 'semantic' && navState.focusPocketMeta?.active

  if (isSemanticPocketFocus && navState.focusPocketIndices?.length) {
    const pocketBounds = computeFocusPocketScreenBounds(
      navState.focusedIndex,
      navState.focusPocketIndices,
      _s as unknown as AppStateLike
    )
    if (pocketBounds) {
      const region = getCanvasUnobstructedRegion()
      const camDist = _s.camera.position.distanceTo(_s.controls.target)
      const safeOffset = computeSafeAreaCameraTargetOffset(
        pocketBounds,
        region,
        camDist,
        _s.camera,
        _s.controls
      )
      if (safeOffset) {
        const pocketProfile = navState.focusPocketMeta?.viewportProfile || {}
        const rawOffsetLimit = pocketProfile.targetOffsetLimit
        const offsetLimit = Number.isFinite(rawOffsetLimit)
          ? Number(rawOffsetLimit)
          : 0.12
        if (safeOffset.length() > offsetLimit) safeOffset.setLength(offsetLimit)
        const nudgeTarget = focusTarget.clone().add(safeOffset)
        if (
          Number.isFinite(nudgeTarget.x) &&
          Number.isFinite(nudgeTarget.y) &&
          Number.isFinite(nudgeTarget.z)
        ) {
          safeTargetOffset = safeOffset
        }
      }
    }
  }
  if (safeTargetOffset) {
    focusTarget = focusTarget.clone().add(safeTargetOffset)
  }

  if (
    (transitionStyle === 'walk' || transitionStyle === 'dive' || transitionStyle === 'dive-walk') &&
    framing.travelVector
  ) {
    const res = computeTravelVectorHeading(focusTarget, currentHeading, transitionStyle, framing)
    focusTarget = res.focusTarget
    heading = res.heading
  }

  if (
    (transitionStyle === 'search' ||
      transitionStyle === 'focus' ||
      transitionStyle === 'walk' ||
      transitionStyle === 'dive' ||
      transitionStyle === 'dive-walk') &&
    isSemanticPocketFocus
  ) {
    const pocketProfile = getTypedNavState().focusPocketMeta?.viewportProfile || {}
    const res = computeOrbitBiasHeading(currentHeading, transitionStyle, pocketProfile)
    heading = res.heading
    stageRightVector = res.stageRightVector
  }

  const desiredCamPos = focusTarget
    .clone()
    .add(heading.multiplyScalar(distance))
    .add(new THREE.Vector3(0, verticalLift, 0))

  const personality = getTypedNavState().currentPersonality || {
    type: 'STANDARD',
    cameraDuration: 980,
    cameraArc: 'standard',
    easing: 'easeInOutCubic'
  }
  const baseDuration = framing.duration || (transitionStyle === 'dive' ? 1480 : personality.cameraDuration || 980)
  const prefersReducedCameraMotion = prefersReducedMotion()
  const duration = prefersReducedCameraMotion ? 1 : baseDuration

  const animationToken = ++_s.focusCameraAnimationToken
  _s.focusCameraOffset = desiredCamPos.clone().sub(focusTarget)
  if (!_s.focusCameraTargetOffset || typeof _s.focusCameraTargetOffset.copy !== 'function') {
    _s.focusCameraTargetOffset = new THREE.Vector3()
  }
  if (_s.focusCameraTargetOffset) {
    _s.focusCameraTargetOffset?.copy?.(focusTarget.clone().sub(nodePos))
  }
  setFocusTransitionMode(transitionStyle, { duration })
  if (prefersReducedCameraMotion) {
    _s.controls.target.copy(focusTarget)
    _s.camera.position.copy(desiredCamPos)
    _s.controls.update()
    return
  }

  startFocusCameraAssist(duration + 100, transitionStyle)
  const startTime = performance.now()
  if (
    !Number.isFinite(
      startTarget.x +
      startTarget.y +
      startTarget.z +
      startPos.x +
      startPos.y +
      startPos.z +
      focusTarget.x +
      focusTarget.y +
      focusTarget.z +
      desiredCamPos.x +
      desiredCamPos.y +
      desiredCamPos.z
    )
  )
    return

  const stageArcActive =
    isSemanticPocketFocus &&
    (transitionStyle === 'search' ||
      transitionStyle === 'focus' ||
      transitionStyle === 'walk' ||
      transitionStyle === 'dive' ||
      transitionStyle === 'dive-walk')
  let cameraControlPoint: THREE.Vector3 | null = null
  let targetControlPoint: THREE.Vector3 | null = null

  if (stageArcActive) {
    const pocketProfile = _s.navState.focusPocketMeta?.viewportProfile || {}
    const res = computeCameraArcControlPoints(
      startPos, startTarget, desiredCamPos, focusTarget,
      currentHeading, distance, transitionStyle, personality, pocketProfile, stageRightVector
    )
    cameraControlPoint = res.cameraControlPoint
    targetControlPoint = res.targetControlPoint
  }

  function step(now: number) {
    if (animationToken !== _s.focusCameraAnimationToken) return
    const t = Math.min((now - startTime) / duration, 1)

    const personalityEasing =
      personality.easing === 'easeOutBack'
        ? easeOutBack(t)
        : personality.easing === 'easeOutQuint'
          ? easeOutQuint(t)
          : easeInOutCubic(t)
    const eased = stageArcActive
      ? personality.type === 'TIGHT_CLUSTER'
        ? easeInOutCubic(t)
        : easeInOutSine(t)
      : transitionStyle === 'walk' || transitionStyle === 'dive-walk'
        ? easeInOutCubic(t)
        : transitionStyle === 'search'
          ? easeInOutCubic(t)
          : personalityEasing

    if (cameraControlPoint && targetControlPoint) {
      _s.controls.target.set(
        quadraticBezierComponent(startTarget.x, targetControlPoint.x, focusTarget.x, eased),
        quadraticBezierComponent(startTarget.y, targetControlPoint.y, focusTarget.y, eased),
        quadraticBezierComponent(startTarget.z, targetControlPoint.z, focusTarget.z, eased)
      )
      _s.camera.position.set(
        quadraticBezierComponent(startPos.x, cameraControlPoint.x, desiredCamPos.x, eased),
        quadraticBezierComponent(startPos.y, cameraControlPoint.y, desiredCamPos.y, eased),
        quadraticBezierComponent(startPos.z, cameraControlPoint.z, desiredCamPos.z, eased)
      )
    } else {
      _s.controls.target.lerpVectors(startTarget, focusTarget, eased)
      _s.camera.position.lerpVectors(startPos, desiredCamPos, eased)
    }

    if (t > 0.85 && stageArcActive && !prefersReducedCameraMotion) {
      const driftIntensity = (t - 0.85) * 0.15
      const worldUp = new THREE.Vector3(0, 1, 0)
      const driftDir = new THREE.Vector3().crossVectors(worldUp, currentHeading).normalize()
      _s.camera.position.add(driftDir.multiplyScalar(driftIntensity * 0.02))
    }

    _s.controls.update()
    if (t < 1) {
      _focusCameraRafId = requestAnimationFrame(step)
    } else {
      _s.focusCameraOffset = null
    }
  }
  _focusCameraRafId = requestAnimationFrame(step)
}
