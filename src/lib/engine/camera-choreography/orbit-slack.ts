/**
 * @lib/engine/camera-choreography/orbit-slack.ts — Focus orbit slack: pivot adjustment and distance/speed configuration.
 *
 * Ported from:
 *
 * The orbit slack system adjusts the camera pivot point and orbit controls
 * when a focused node is being explored via search route. It shifts the
 * orbit target toward the route centroid and widens max distance / speed
 * for freer exploration.
 */

import { Vector3, Box3, PerspectiveCamera } from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { appState as _state } from '@lib/state/app.svelte'
import { withStateMutation } from '@lib/state/with-state-mutation'
const state = _state
import type { SemanticState } from '@lib/state/state-types'
import { appState } from '@lib/state/app.svelte'
import { CONFIG } from '@lib/engine/config'
import { isMobile, prefersReducedMotion } from '@lib/utils/environment'

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * PositionPoint is the structural shape of items in appState.nodePositions
 * and appState.originalPositions, which are typed `unknown[]` globally.
 * Introduced to consolidate 4 inline structural casts (Phase 16 pattern).
 */
interface PositionPoint {
    x: number
    y: number
    z: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Typed accessor for appState.nodePositions. Internalizes the cast so call
 * sites can index the result directly without re-asserting the structural
 * shape (Phase 16 typed-helper pattern).
 */
function getNodePositions(): PositionPoint[] {
    return appState.nodePositions as unknown as PositionPoint[]
}

/**
 * Typed accessor for appState.originalPositions. Same pattern as
 * getNodePositions above.
 */
function getOriginalPositions(): PositionPoint[] {
    return appState.originalPositions as unknown as PositionPoint[]
}

const _s = state as unknown as SemanticState

function getTypedCamera(): PerspectiveCamera | null {
    return appState.camera
}

function getTypedControls(): OrbitControls | null {
    return appState.controls
}

function getRouteEmbodimentIndices(): number[] {
    const routeIndices = (appState.navState.trailNeighborIndices || []).slice(0, 6)
    const seedIndex = appState.navState.trailSeedIndex
    if (seedIndex !== null && seedIndex !== undefined) routeIndices.unshift(seedIndex)
    return routeIndices
}

function getRoutePositionBounds(
    routeIndices: number[] = []
): { center: Vector3; size: Vector3; radius: number } | null {
    const nodePositions = getNodePositions()
    const originalPositions = getOriginalPositions()
    const vectors = routeIndices
        .map((index) => {
            const pos = nodePositions[index] || originalPositions[index]
            if (!pos) return null
            const px = pos.x,
                py = pos.y,
                pz = pos.z
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
        getNodePositions()[focusedNode] ||
        getOriginalPositions()[focusedNode]
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
    // NOTE: body.dataset writes removed. parity-attrs.svelte.ts handles body.dataset sync
    // from cameraStore.orbitSlack (which mirrors _s.focusOrbitSlackState).
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
        // NOTE: body.dataset writes removed. parity-attrs.svelte.ts handles body.dataset sync.
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
    // NOTE: body.dataset writes removed. parity-attrs.svelte.ts handles body.dataset sync.
    if (controls && !appState.semanticDiveMode) {
        controls.maxDistance = CONFIG.ORBIT_MAX_DISTANCE_DEFAULT
        controls.rotateSpeed = CONFIG.ORBIT_ROTATE_SPEED_DEFAULT
        controls.panSpeed = CONFIG.ORBIT_PAN_SPEED_DEFAULT
    }
}
