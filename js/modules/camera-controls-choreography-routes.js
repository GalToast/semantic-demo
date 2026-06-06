import * as THREE from 'three'
import { state } from '../state.js'
import {
  getCamera, getControls, getNodePositions, getOriginalPositions, getTargetPositions,
  getNavState, getCurrentView, getSemanticDiveMode, getPoints,
  getTrailDepth,
  getActiveClusterFilter, getActiveFilters,
  getRouteCameraAnimationToken,
  getMapHandoffPreludeMs, getOrbitMinDistanceDefault, getOrbitMaxDistanceDefault
} from '../state/selectors/index.js'
import { isMobile, prefersReducedMotion } from './environment.js'
import {
  easeInOutCubic,
  quadraticBezierComponent
} from './utils/math-easing.js'
import { setFocusTransitionMode } from './camera-controls-core.js'
import { noteSceneInteraction } from './camera-controls-restore.js'
import { publish, EVENTS } from './event-bus.js'

// -----------------------------------------------------------------------------
// ROUTE / CORRIDOR / TERRAIN / CENTROID / ZOOM ANIMATIONS
// -----------------------------------------------------------------------------

let _insideCentroidTarget = null
let _insideCentroidLerpToken = 0

export function animateCameraToSearchCorridor(anchorIndex, resultIndices = [], options = {}) {
  if (!getCamera() || !getControls() || getCurrentView() !== 'galaxy') return false
  if (!Number.isFinite(anchorIndex) || getNavState().focusedIndex !== null || getSemanticDiveMode()) return false

  const isPointVisible = (index, points, clusterFilter) => {
    if (!Number.isFinite(index) || index < 0 || index >= points.length) return false
    const point = points[index]
    if (!point) return false
    if (clusterFilter !== null) {
      const pointCluster = Number.isFinite(Number(point.cluster)) ? Number(point.cluster) : 0
      if (pointCluster !== clusterFilter) return false
    }
    return true
  }

  const routeIndices = [...new Set([anchorIndex, ...(resultIndices || [])])]
    .filter(
      (index) =>
        Number.isFinite(index) &&
        index >= 0 &&
        index < getPoints().length &&
        isPointVisible(index, getPoints(), getActiveClusterFilter(), getActiveFilters())
    )
    .slice(0, isMobile() ? 8 : 12)

  const vectors = routeIndices
    .map((index) => getTargetPositions()[index] || getNodePositions()[index] || getOriginalPositions()[index])
    .filter(Boolean)
    .map((pos) => new THREE.Vector3(pos.x, pos.y, pos.z))
  if (!vectors.length) return null
  const box = new THREE.Box3().setFromPoints(vectors)
  const boundsCenter = new THREE.Vector3()
  const boundsSize = new THREE.Vector3()
  box.getCenter(boundsCenter)
  box.getSize(boundsSize)
  const radius = Math.max(0.08, boundsSize.length() * 0.5)

  const anchorPosition =
    getTargetPositions()[anchorIndex] || getNodePositions()[anchorIndex] || getOriginalPositions()[anchorIndex]
  if (
    !anchorPosition ||
    !Number.isFinite(anchorPosition.x) ||
    !Number.isFinite(anchorPosition.y) ||
    !Number.isFinite(anchorPosition.z)
  )
    return false

  const anchorVector = new THREE.Vector3(anchorPosition.x, anchorPosition.y, anchorPosition.z)
  const startTarget = state.controls.target.clone()
  const startPos = state.camera.position.clone()
  const currentHeading = startPos.clone().sub(startTarget)
  if (currentHeading.lengthSq() < 0.0001) currentHeading.set(1.4, 1.1, 2)
  currentHeading.normalize()

  const worldUp = new THREE.Vector3(0, 1, 0)
  const rightVector = new THREE.Vector3().crossVectors(worldUp, currentHeading)
  if (rightVector.lengthSq() < 0.0001) rightVector.set(1, 0, 0)
  rightVector.normalize()

  const compact = isMobile()
  const routeSpan = Math.max(radius, 0.14)
  const targetBias = compact ? 0.42 : 0.34
  const endTarget = boundsCenter
    .clone()
    .lerp(anchorVector, targetBias)
    .add(worldUp.clone().multiplyScalar(compact ? 0.018 : 0.028))
  const distance = Math.min(
    compact ? 2.35 : 1.95,
    Math.max(compact ? 1.1 : 0.92, routeSpan * (compact ? 4.1 : 3.2) + 0.52)
  )
  const endPos = endTarget
    .clone()
    .add(currentHeading.clone().multiplyScalar(distance))
    .add(worldUp.clone().multiplyScalar(compact ? 0.16 : 0.2))
    .add(rightVector.clone().multiplyScalar(compact ? 0.035 : 0.065))
  const duration = options.duration || (compact ? 1180 : 1320)
  const startTime = performance.now()
  const animationToken = (state.routeCameraAnimationToken = (state.routeCameraAnimationToken || 0) + 1)

  publish(EVENTS.TRANSITION_PHASE_CHANGED, {
    phase: 'search-corridor',
    details: {
      reason: options.reason || 'search-success',
      anchorIndex,
      indexCount: routeIndices.length,
      lastCameraMove: 'search-corridor'
    }
  })
  noteSceneInteraction(duration + 1200);

  const controlTarget = startTarget.clone().lerp(endTarget, 0.56).add(worldUp.clone().multiplyScalar(0.025))

  function step(now) {
    if (
      animationToken !== getRouteCameraAnimationToken() ||
      getNavState().focusedIndex !== null ||
      getCurrentView() !== 'galaxy'
    )
      return
    if (!state.controls?.target || !state.camera?.position) return
    const t = Math.min((now - startTime) / duration, 1)
    const eased = easeInOutCubic(t)
    state.controls.target.set(
      quadraticBezierComponent(startTarget.x, controlTarget.x, endTarget.x, eased),
      quadraticBezierComponent(startTarget.y, controlTarget.y, endTarget.y, eased),
      quadraticBezierComponent(startTarget.z, controlTarget.z, endTarget.z, eased)
    )
    state.camera.position.lerpVectors(startPos, endPos, eased)
    if (t < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
  return true
}

export function animateCameraToTerrainPrelude(options = {}) {
  const reducedMotion = prefersReducedMotion()
  const duration = reducedMotion ? 1 : options.duration || getMapHandoffPreludeMs() || 1200

  publish(EVENTS.TRANSITION_PHASE_CHANGED, { phase: 'map-prelude', options: { duration } })

  try {
    if (!state.camera || !state.controls) return
    const startPos = state.camera.position.clone()
    const startTarget = state.controls.target.clone()

    const heading = startPos.clone().sub(startTarget).normalize()
    const worldUp = new THREE.Vector3(0, 1, 0)
    const desiredPos = startTarget.clone().add(heading.multiplyScalar(0.8)).add(worldUp.multiplyScalar(0.4))

    if (reducedMotion) {
      state.camera.position.copy(desiredPos)
      state.controls.update()
      return
    }

    const animationToken = ++state.focusCameraAnimationToken
    const startTime = performance.now()

    setFocusTransitionMode('map-prelude', { duration })

    const priorControlsEnabled = state.controls.enabled
    state.controls.enabled = false

    function step(now) {
      if (animationToken !== state.focusCameraAnimationToken) {
        state.controls.enabled = priorControlsEnabled
        return
      }
      const t = Math.min((now - startTime) / duration, 1)
      const eased = easeInOutCubic(t)

      state.camera.position.lerpVectors(startPos, desiredPos, eased)

      if (t < 1) {
        requestAnimationFrame(step)
      } else {
        state.controls.enabled = priorControlsEnabled
      }
    }
    requestAnimationFrame(step)
  } catch (_err) {
    console.error('animateCameraToTerrainPrelude failed:', _err)
  } finally {
    publish(EVENTS.TRANSITION_PHASE_CHANGED, { phase: 'idle' })
  }
}

export function applySemanticCentroidCamera(now = performance.now()) {
  if (!state.camera || !state.controls) return
  if (getTrailDepth() !== 2) {
    _insideCentroidTarget = null
    return
  }
  const indices = getNavState().focusPocketIndices
  if (!indices || !indices.length) return

  const anchorIdx = getNavState().focusedIndex
  const pocketIndices = anchorIdx !== null && anchorIdx !== undefined ? [anchorIdx, ...indices] : indices

  let cx = 0, cy = 0, cz = 0, count = 0
  for (const idx of pocketIndices) {
    const pos = getNodePositions()[idx] || getOriginalPositions()[idx]
    if (!pos) continue
    cx += Number.isFinite(pos.x) ? pos.x : 0
    cy += Number.isFinite(pos.y) ? pos.y : 0
    cz += Number.isFinite(pos.z) ? pos.z : 0
    count++
  }
  if (!count) return

  const pocketCentroid = new THREE.Vector3(cx / count, cy / count, cz / count)

  const anchorPos =
    anchorIdx !== null && anchorIdx !== undefined
      ? getNodePositions()[anchorIdx] || getOriginalPositions()[anchorIdx]
      : null
  if (!anchorPos) return

  const anchorVec = new THREE.Vector3(
    Number.isFinite(anchorPos.x) ? anchorPos.x : 0,
    Number.isFinite(anchorPos.y) ? anchorPos.y : 0,
    Number.isFinite(anchorPos.z) ? anchorPos.z : 0
  )

  const personality = state.navState.currentPersonality || {}
  let centroidWeight
  if (personality.type === 'TIGHT_CLUSTER') {
    centroidWeight = 0.12
  } else if (personality.cameraArc === 'tight') {
    centroidWeight = 0.18
  } else {
    centroidWeight = 0.28
  }
  const lookAtTarget = anchorVec.clone().lerp(pocketCentroid, centroidWeight)

  const token = ++_insideCentroidLerpToken
  const startTarget = state.controls.target.clone()
  const startTime = now
  const reducedMotion = prefersReducedMotion()
  const duration = reducedMotion ? 1 : 1600

  function stepCentroid(now) {
    if (token !== _insideCentroidLerpToken) return
    const t = Math.min(1, (now - startTime) / duration)
    const eased = easeInOutCubic(t)
    state.controls.target.lerpVectors(startTarget, lookAtTarget, eased)
    state.controls.update()
    if (t < 1) requestAnimationFrame(stepCentroid)
  }
  if (prefersReducedMotion) {
    state.controls.target.copy(lookAtTarget)
    state.controls.update()
  } else {
    requestAnimationFrame(stepCentroid)
  }
}

export function zoomCamera(multiplier) {
  if (!getCamera() || !getControls()) return
  const target = getControls().target
  if (!target) return
  const camPos = getCamera().position
  if (!Number.isFinite(camPos.x + camPos.y + camPos.z + target.x + target.y + target.z)) return
  const direction = camPos.clone().sub(target).normalize()
  const currentDistance = camPos.distanceTo(target)
  const newDistance = currentDistance * multiplier
  const minDist = state.controls.minDistance || getOrbitMinDistanceDefault() || 0.5
  const maxDist = state.controls.maxDistance || getOrbitMaxDistanceDefault() || 8.0
  const clampedDistance = Math.max(minDist, Math.min(maxDist, newDistance))
  state.camera.position.copy(target.clone().add(direction.multiplyScalar(clampedDistance)))
}

export function clearInsideCentroid() {
  _insideCentroidTarget = null
  _insideCentroidLerpToken++
}
