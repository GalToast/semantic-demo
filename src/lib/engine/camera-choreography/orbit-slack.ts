/**
 * @lib/engine/camera-choreography/orbit-slack.ts — Focus orbit slack: pivot adjustment and distance/speed configuration.
 *
 * Ported from: js/modules/camera-orbit-slack.ts
 *
 * The orbit slack system adjusts the camera pivot point and orbit controls
 * when a focused node is being explored via search route. It shifts the
 * orbit target toward the route centroid and widens max distance / speed
 * for freer exploration.
 */

import { Vector3, Box3 } from 'three'
import { state, withStateMutation } from '@lib/engine/state-bridge';
import type { SemanticState } from '@lib/state/state-types'
import { appState } from '@lib/state/app.svelte'
import { CONFIG } from '@lib/engine/config'
import { isMobile, prefersReducedMotion } from '@lib/utils/environment'

// ── Types ────────────────────────────────────────────────────────────────────

interface OrbitSlackCamera {
  position: Vector3
}

interface OrbitSlackControls {
  target: Vector3
  maxDistance?: number
  rotateSpeed?: number
  panSpeed?: number
  update(): void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const _s = state as unknown as SemanticState

function getTypedCamera(): OrbitSlackCamera | null {
  return appState.camera as unknown as OrbitSlackCamera | null
}

function getTypedControls(): OrbitSlackControls | null {
  return appState.controls as unknown as OrbitSlackControls | null
}

function getRouteEmbodimentIndices(): number[] {
  const routeIndices = (appState.navState.trailNeighborIndices || []).slice(0, 6)
  const seedIndex = appState.navState.trailSeedIndex
  if (seedIndex !== null && seedIndex !== undefined) routeIndices.unshift(seedIndex)
  return routeIndices
}

function getRoutePositionBounds(routeIndices: number[] = []): { center: Vector3; size: Vector3; radius: number } | null {
  const nodePositions = appState.nodePositions as unknown as { x: number; y: number; z: number }[]
  const originalPositions = appState.originalPositions as unknown as { x: number; y: number; z: number }[]
  const vectors = routeIndices
    .map((index) => {
      const pos = nodePositions[index] || originalPositions[index]
      if (!pos) return null
      const px = pos.x, py = pos.y, pz = pos.z
      if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) return null
      return new Vector3(px, py, pz)
    })
    .filter((v): v is Vector3 => v !== null)
  if (!vectors.length) return null
  const box = new Box3().setFromPoints(vectors)
  const center = new Vector3()
  const size = new Vector3()
  box.getCenter(center)
  box.getSize(size)
  return { center, size, radius: Math.max(0.08, size.length() * 0.5) }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Check if search-route focus is active (galaxy view, focused node, search summary, walk depth 0).
 */
export function isSearchRouteFocusActive(): boolean {
  const hasFocus = appState.focusedNode !== null && appState.focusedNode !== undefined
  const walkDepth = Math.max(0, (appState.navState.walkHistoryIndices || []).length - 1)
  return (
    appState.currentView === 'galaxy' &&
    !appState.semanticDiveMode &&
    hasFocus &&
    !!appState.currentSearchSummary &&
    walkDepth === 0
  )
}

/**
 * Get the focus orbit slack pivot point — lerp between focus node and route centroid.
 */
export function getFocusOrbitSlackPivot(): Vector3 | null {
  const camera = getTypedCamera()
  const controls = getTypedControls()
  const focusedNode = appState.focusedNode
  if (!camera || !controls || focusedNode === null || focusedNode === undefined) return null
  const focusPosition =
    (appState.nodePositions as unknown as { x: number; y: number; z: number }[])[focusedNode] ||
    (appState.originalPositions as unknown as { x: number; y: number; z: number }[])[focusedNode]
  if (!focusPosition) return null

  const focusVector = new Vector3(focusPosition.x, focusPosition.y, focusPosition.z)
  const routeBounds = getRoutePositionBounds(getRouteEmbodimentIndices())
  const routeCenter = routeBounds?.center?.clone ? routeBounds.center.clone() : focusVector.clone()
  const compact = isMobile()
  const pivot = focusVector.clone().lerp(routeCenter, compact ? 0.48 : 0.38)
  const cameraOffset = camera.position.clone().sub(controls.target)
  const cameraDistance = cameraOffset.length()
  if (cameraDistance > 0.001) {
    pivot.add(cameraOffset.normalize().multiplyScalar(Math.min(compact ? 0.18 : 0.22, cameraDistance * 0.18)))
  }
  pivot.y += compact ? 0.018 : 0.026
  return pivot
}

/**
 * Apply focus orbit slack — shift pivot, widen controls, update state.
 * Returns true if slack was applied, false if skipped.
 */
export function applyFocusOrbitSlack(reason: string = 'user-control'): boolean {
  const camera = getTypedCamera()
  const controls = getTypedControls()
  if (!isSearchRouteFocusActive() || appState.semanticDiveMode || !camera || !controls) return false
  if (prefersReducedMotion()) {
    return false
  }
  const nextTarget = getFocusOrbitSlackPivot()
  if (!nextTarget) return false

  const currentTarget = controls.target.clone()
  const targetDelta = nextTarget.sub(currentTarget)
  const maxShift = isMobile() ? 0.24 : 0.2
  if (targetDelta.length() > maxShift) targetDelta.setLength(maxShift)
  if (targetDelta.lengthSq() < 0.000064) return false

  const distanceBefore = camera.position.distanceTo(controls.target)
  controls.target.add(targetDelta)
  const cameraDelta = targetDelta.clone().multiplyScalar(0.72)
  camera.position.add(cameraDelta)
  controls.maxDistance = Math.max(
    controls.maxDistance || CONFIG.ORBIT_MAX_DISTANCE_DEFAULT,
    CONFIG.ORBIT_MAX_DISTANCE_FREE
  )
  controls.rotateSpeed = CONFIG.ORBIT_ROTATE_SPEED_FREE
  controls.panSpeed = CONFIG.ORBIT_PAN_SPEED_FREE
  controls.update()

  withStateMutation(() => {
    _s.focusOrbitSlackState = {
      phase: 'free-pivot',
      reason,
      startedAt: performance.now(),
      targetShift: Number(targetDelta.length().toFixed(4)),
      cameraShift: Number(cameraDelta.length().toFixed(4)),
      distanceBefore: Number(distanceBefore.toFixed(4)),
      distanceAfter: Number(camera.position.distanceTo(controls.target).toFixed(4)),
      maxDistance: Number((controls.maxDistance || CONFIG.ORBIT_MAX_DISTANCE_FREE).toFixed(2)),
      rotateSpeed: Number((controls.rotateSpeed || CONFIG.ORBIT_ROTATE_SPEED_FREE).toFixed(2)),
      panSpeed: Number((controls.panSpeed || CONFIG.ORBIT_PAN_SPEED_FREE).toFixed(2))
    }
  })
  document.body.dataset.cameraSlack = 'free-pivot'
  document.body.dataset.cameraSlackReason = reason
  return true
}

/**
 * Clear focus orbit slack — reset controls to defaults, update state to idle.
 */
export function clearFocusOrbitSlack(reason: string = 'clear'): void {
  const camera = getTypedCamera()
  const controls = getTypedControls()
  const safeTarget = controls?.target ?? camera?.position ?? null
  if (safeTarget === null || !camera) {
    withStateMutation(() => {
      _s.focusOrbitSlackState = {
        phase: 'idle',
        reason,
        startedAt: performance.now(),
        targetShift: 0,
        cameraShift: 0,
        distanceBefore: 0,
        distanceAfter: 0,
        maxDistance: CONFIG.ORBIT_MAX_DISTANCE_DEFAULT,
        rotateSpeed: CONFIG.ORBIT_ROTATE_SPEED_DEFAULT,
        panSpeed: CONFIG.ORBIT_PAN_SPEED_DEFAULT
      }
    })
    if (document.body) {
      document.body.dataset.cameraSlack = 'idle'
      document.body.dataset.cameraSlackReason = reason
    }
    return
  }
  const dist = camera.position.distanceTo(safeTarget)
  withStateMutation(() => {
    _s.focusOrbitSlackState = {
      phase: 'idle',
      reason,
      startedAt: performance.now(),
      targetShift: 0,
      cameraShift: 0,
      distanceBefore: Number(dist.toFixed(4)),
      distanceAfter: Number(dist.toFixed(4)),
      maxDistance: CONFIG.ORBIT_MAX_DISTANCE_DEFAULT,
      rotateSpeed: CONFIG.ORBIT_ROTATE_SPEED_DEFAULT,
      panSpeed: CONFIG.ORBIT_PAN_SPEED_DEFAULT
    }
  })
  document.body.dataset.cameraSlack = 'idle'
  document.body.dataset.cameraSlackReason = reason
  if (controls && !appState.semanticDiveMode) {
    controls.maxDistance = CONFIG.ORBIT_MAX_DISTANCE_DEFAULT
    controls.rotateSpeed = CONFIG.ORBIT_ROTATE_SPEED_DEFAULT
    controls.panSpeed = CONFIG.ORBIT_PAN_SPEED_DEFAULT
  }
}
