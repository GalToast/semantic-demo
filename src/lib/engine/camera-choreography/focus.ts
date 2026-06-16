/**
 * @lib/engine/camera-choreography/focus.ts
 * Focus camera animation — animateCameraToNode, cancelFocusCameraAnimation
 *
 * Ported from: js/modules/camera-controls-choreography-focus.ts
 */
import * as THREE from 'three'
import { appState } from '@lib/state/app.svelte'
import type { NodePosition, NavFocusPocketMeta } from '../../../../js/state.ts'
import { prefersReducedMotion } from '../../../../js/modules/environment.ts'
import {
  type AppStateLike,
  getCanvasUnobstructedRegion,
  computeFocusPocketScreenBounds,
  computeSafeAreaCameraTargetOffset
} from './framing-utils'
import {
  type FramingParams,
  type PocketProfile,
  computeTravelVectorHeading,
  computeOrbitBiasHeading,
  computeCameraArcControlPoints
} from '@lib/utils/camera-math-utils'
import {
  easeInOutSine,
  easeInOutCubic,
  quadraticBezierComponent,
  easeOutBack,
  easeOutQuint
} from '@lib/utils/math-easing'
import { setFocusTransitionMode, startFocusCameraAssist } from '../camera-controls-core'
import type {
  ChoreographyCamera,
  ChoreographyControls,
  ChoreographyPersonality
} from './types'

interface FocusFramingOptions extends FramingParams {
  transitionStyle?: string
  distance?: number
  verticalLift?: number
  framingDrop?: number
  targetOffset?: THREE.Vector3
  duration?: number
}

/** Public alias consumed by camera-choreography/index.ts barrel re-export. */
export type AnimateCameraToNodeOptions = FocusFramingOptions

interface FocusPocketProfile extends PocketProfile {
  targetOffsetLimit?: number
}

interface FocusPersonality extends ChoreographyPersonality {
  [key: string]: unknown
  cameraDuration?: number
  easing?: string
}

/** Narrowed navState for focus camera animation. Overrides base types with camera-specific shapes. */
interface FocusNavState {
  mode: string
  focusedIndex: number | null
  threadSource: string
  focusPocketIndices: number[]
  focusPocketMeta: (NavFocusPocketMeta & { viewportProfile?: FocusPocketProfile }) | null
  focusFramingMeta: Partial<FocusFramingOptions> | null
  currentPersonality: FocusPersonality | null
  [key: string]: unknown
}

function getTypedNavState(): FocusNavState {
  return appState.navState as unknown as FocusNavState
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
  if (!appState.camera || !appState.controls) return
  const camera = appState.camera as unknown as ChoreographyCamera
  const controls = appState.controls as unknown as ChoreographyControls
  const targetPosition: NodePosition | undefined = appState.nodePositions[index] || appState.originalPositions[index]
  if (!targetPosition) return
  const framing = {
    ...(getTypedNavState().focusFramingMeta || {}),
    ...options
  } as FocusFramingOptions
  const transitionStyle = framing.transitionStyle || 'focus'
  const tx = targetPosition.x, ty = targetPosition.y, tz = targetPosition.z
  if (!Number.isFinite(tx) || !Number.isFinite(ty) || !Number.isFinite(tz)) return
  const nodePos = new THREE.Vector3(tx, ty, tz)
  if (!controls.target || !camera.position) return
  const startTarget = controls.target.clone()
  const startPos = camera.position.clone()
  const currentHeading = camera.position.clone().sub(controls.target).normalize()

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
  if (!appState.focusCameraTargetOffset?.copy) appState.focusCameraTargetOffset = new THREE.Vector3()
  let heading = currentHeading.clone()
  let stageRightVector: THREE.Vector3 | null = null
  let safeTargetOffset: THREE.Vector3 | null = null
  const navState = getTypedNavState()
  const isSemanticPocketFocus = navState.threadSource === 'semantic' && navState.focusPocketMeta?.active

  if (isSemanticPocketFocus && navState.focusPocketIndices?.length) {
    const pocketBounds = computeFocusPocketScreenBounds(
      navState.focusedIndex,
      navState.focusPocketIndices,
      appState as unknown as AppStateLike
    )
    if (pocketBounds) {
      const region = getCanvasUnobstructedRegion()
      const camDist = camera.position.distanceTo(controls.target)
      const safeOffset = computeSafeAreaCameraTargetOffset(
        pocketBounds,
        region,
        camDist,
        camera,
        controls
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

  const animationToken = ++appState.focusCameraAnimationToken
  appState.focusCameraOffset = desiredCamPos.clone().sub(focusTarget)
  if (!appState.focusCameraTargetOffset || typeof appState.focusCameraTargetOffset.copy !== 'function') {
    appState.focusCameraTargetOffset = new THREE.Vector3()
  }
  if (appState.focusCameraTargetOffset) {
    appState.focusCameraTargetOffset?.copy?.(focusTarget.clone().sub(nodePos))
  }
  setFocusTransitionMode(transitionStyle, { duration })
  if (prefersReducedCameraMotion) {
    controls.target.copy(focusTarget)
    camera.position.copy(desiredCamPos)
    controls.update()
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
    const pocketProfile = (appState.navState as any).focusPocketMeta?.viewportProfile || {}
    const res = computeCameraArcControlPoints(
      startPos, startTarget, desiredCamPos, focusTarget,
      currentHeading, distance, transitionStyle, personality, pocketProfile, stageRightVector
    )
    cameraControlPoint = res.cameraControlPoint
    targetControlPoint = res.targetControlPoint
  }

  function step(now: number) {
    if (animationToken !== appState.focusCameraAnimationToken) return
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
      controls.target.set(
        quadraticBezierComponent(startTarget.x, targetControlPoint.x, focusTarget.x, eased),
        quadraticBezierComponent(startTarget.y, targetControlPoint.y, focusTarget.y, eased),
        quadraticBezierComponent(startTarget.z, targetControlPoint.z, focusTarget.z, eased)
      )
      camera.position.set(
        quadraticBezierComponent(startPos.x, cameraControlPoint.x, desiredCamPos.x, eased),
        quadraticBezierComponent(startPos.y, cameraControlPoint.y, desiredCamPos.y, eased),
        quadraticBezierComponent(startPos.z, cameraControlPoint.z, desiredCamPos.z, eased)
      )
    } else {
      controls.target.lerpVectors(startTarget, focusTarget, eased)
      camera.position.lerpVectors(startPos, desiredCamPos, eased)
    }

    if (t > 0.85 && stageArcActive && !prefersReducedCameraMotion) {
      const driftIntensity = (t - 0.85) * 0.15
      const worldUp = new THREE.Vector3(0, 1, 0)
      const driftDir = new THREE.Vector3().crossVectors(worldUp, currentHeading).normalize()
      camera.position.add(driftDir.multiplyScalar(driftIntensity * 0.02))
    }

    controls.update()
    if (t < 1) {
      _focusCameraRafId = requestAnimationFrame(step)
    } else {
      appState.focusCameraOffset = null
    }
  }
  _focusCameraRafId = requestAnimationFrame(step)
}
