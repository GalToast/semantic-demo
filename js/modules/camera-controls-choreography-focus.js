import * as THREE from 'three'
import { state } from '../state.js'
import {
  getNavState
} from '../state/selectors/index.js'
import { prefersReducedMotion } from './environment.js'
import {
  getCanvasUnobstructedRegion,
  computeFocusPocketScreenBounds,
  computeSafeAreaCameraTargetOffset
} from './camera-framing-utils.js'
import {
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

// -----------------------------------------------------------------------------
// FOCUS CAMERA ANIMATION — animateCameraToNode
// -----------------------------------------------------------------------------

export function animateCameraToNode(index, options = {}) {
  if (!state.camera || !state.controls) return
  const targetPosition = state.nodePositions[index] || state.originalPositions[index]
  if (!targetPosition) return
  const framing = {
    ...(getNavState().focusFramingMeta || {}),
    ...options
  }
  const transitionStyle = framing.transitionStyle || 'focus'
  const tx = targetPosition.x, ty = targetPosition.y, tz = targetPosition.z
  if (!Number.isFinite(tx) || !Number.isFinite(ty) || !Number.isFinite(tz)) return
  const nodePos = new THREE.Vector3(tx, ty, tz)
  if (!state.controls?.target || !state.camera?.position) return
  const startTarget = state.controls.target.clone()
  const startPos = state.camera.position.clone()
  const currentHeading = state.camera.position.clone().sub(state.controls.target).normalize()

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
  if (!state.focusCameraTargetOffset?.copy) state.focusCameraTargetOffset = new THREE.Vector3()
  let heading = currentHeading.clone()
  let stageRightVector = null
  let safeTargetOffset = null
  const isSemanticPocketFocus = getNavState().threadSource === 'semantic' && getNavState().focusPocketMeta?.active

  if (isSemanticPocketFocus && getNavState().focusPocketIndices?.length) {
    const pocketBounds = computeFocusPocketScreenBounds(
      getNavState().focusedIndex,
      getNavState().focusPocketIndices,
      state
    )
    if (pocketBounds) {
      const region = getCanvasUnobstructedRegion()
      const camDist = state.camera.position.distanceTo(state.controls.target)
      const safeOffset = computeSafeAreaCameraTargetOffset(
        pocketBounds,
        region,
        camDist,
        state.camera,
        state.controls
      )
      if (safeOffset) {
        const pocketProfile = getNavState().focusPocketMeta.viewportProfile || {}
        const offsetLimit = Number.isFinite(pocketProfile.targetOffsetLimit)
          ? pocketProfile.targetOffsetLimit
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
    const pocketProfile = getNavState().focusPocketMeta.viewportProfile || {}
    const res = computeOrbitBiasHeading(currentHeading, transitionStyle, pocketProfile)
    heading = res.heading
    stageRightVector = res.stageRightVector
  }

  const desiredCamPos = focusTarget
    .clone()
    .add(heading.multiplyScalar(distance))
    .add(new THREE.Vector3(0, verticalLift, 0))

  const personality = getNavState().currentPersonality || {
    type: 'STANDARD',
    cameraDuration: 980,
    cameraArc: 'standard',
    easing: 'easeInOutCubic'
  }
  const baseDuration = framing.duration || (transitionStyle === 'dive' ? 1480 : personality.cameraDuration || 980)
  const prefersReducedCameraMotion = prefersReducedMotion()
  const duration = prefersReducedCameraMotion ? 1 : baseDuration

  const animationToken = ++state.focusCameraAnimationToken
  state.focusCameraOffset = desiredCamPos.clone().sub(focusTarget)
  if (!state.focusCameraTargetOffset || typeof state.focusCameraTargetOffset.copy !== 'function') {
    state.focusCameraTargetOffset = new THREE.Vector3()
  }
  if (state.focusCameraTargetOffset) {
    state.focusCameraTargetOffset.copy(focusTarget.clone().sub(nodePos))
  }
  setFocusTransitionMode(transitionStyle, { duration })
  if (prefersReducedCameraMotion) {
    state.controls.target.copy(focusTarget)
    state.camera.position.copy(desiredCamPos)
    state.controls.update()
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
  let cameraControlPoint = null
  let targetControlPoint = null

  if (stageArcActive) {
    const pocketProfile = state.navState.focusPocketMeta.viewportProfile || {}
    const res = computeCameraArcControlPoints(
      startPos, startTarget, desiredCamPos, focusTarget,
      currentHeading, distance, transitionStyle, personality, pocketProfile, stageRightVector
    )
    cameraControlPoint = res.cameraControlPoint
    targetControlPoint = res.targetControlPoint
  }

  function step(now) {
    if (animationToken !== state.focusCameraAnimationToken) return
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
      state.controls.target.set(
        quadraticBezierComponent(startTarget.x, targetControlPoint.x, focusTarget.x, eased),
        quadraticBezierComponent(startTarget.y, targetControlPoint.y, focusTarget.y, eased),
        quadraticBezierComponent(startTarget.z, targetControlPoint.z, focusTarget.z, eased)
      )
      state.camera.position.set(
        quadraticBezierComponent(startPos.x, cameraControlPoint.x, desiredCamPos.x, eased),
        quadraticBezierComponent(startPos.y, cameraControlPoint.y, desiredCamPos.y, eased),
        quadraticBezierComponent(startPos.z, cameraControlPoint.z, desiredCamPos.z, eased)
      )
    } else {
      state.controls.target.lerpVectors(startTarget, focusTarget, eased)
      state.camera.position.lerpVectors(startPos, desiredCamPos, eased)
    }

    if (t > 0.85 && stageArcActive && !prefersReducedCameraMotion) {
      const driftIntensity = (t - 0.85) * 0.15
      const worldUp = new THREE.Vector3(0, 1, 0)
      const driftDir = new THREE.Vector3().crossVectors(worldUp, currentHeading).normalize()
      state.camera.position.add(driftDir.multiplyScalar(driftIntensity * 0.02))
    }

    state.controls.update()
    if (t < 1) {
      requestAnimationFrame(step)
    } else {
      state.focusCameraOffset = null
    }
  }
  requestAnimationFrame(step)
}
