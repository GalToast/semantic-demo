/**
 * @lib/engine/camera-choreography/routes.ts
 * Search corridor, terrain prelude, semantic centroid, zoom animations
 *
 * Canonical Svelte 5 implementation (legacy js/modules/ version retired in W16-T-CAM-4)
 */
import { Vector3, Box3 } from 'three'
import type { ChoreographyCamera, ChoreographyControls, ChoreographyPersonality } from './types'
import { easeInOutCubic, quadraticBezierComponent } from '@lib/utils/math-easing'
import { isMobile, prefersReducedMotion } from '@lib/utils/environment'
import { publish, EVENTS } from '@lib/orchestration/event-bus'
import { noteSceneInteraction } from '@lib/engine/camera-controls-restore.svelte'
import { setFocusTransitionMode } from '@lib/engine/camera-controls-core'
import { appState } from '@lib/state/app.svelte'
import { debugError } from '@lib/utils/debug'
import { DisposableRegistry } from '@lib/utils/disposable-registry'

// ── Local Types ──────────────────────────────────────────────────────────────

interface RouteOptions {
    duration?: number
    reason?: string
}

/** Node position shape from the state selectors. */
interface NodePosition {
    x: number
    y: number
    z: number
}

/** Point shape from the points array. */
interface Point {
    cluster?: number | string
    lead_id?: number | string | null
    [key: string]: unknown
}

// ── Module-level Mutable State ───────────────────────────────────────────────

let _insideCentroidLerpToken = 0

// M7: reusable DisposableRegistry for requestAnimationFrame tracking across
// all route animations. Each animation function clears the previous registry
// (cancelling any pending rAF) before creating new entries.
//
// M4: stored rAF ids ensure cancelAnimationFrame is called during teardown
// rather than relying solely on the module token check at step() top, which
// still lets the pending rAF fire once against potentially-nulled camera/controls.
let _routeRafRegistry: DisposableRegistry | null = null

/**
 * Cancel all pending route animations and clear the rAF registry.
 * Safe to call even when no animation is active.
 */
export function cancelRouteAnimations(): void {
    if (_routeRafRegistry) {
        _routeRafRegistry.disposeAll()
        _routeRafRegistry = null
    }
}

// ── animateCameraToSearchCorridor ────────────────────────────────────────────

export function animateCameraToSearchCorridor(
    anchorIndex: number,
    resultIndices: number[] = [],
    options: RouteOptions = {}
): boolean {
    const camera = appState.camera
    const controls = appState.controls
    if (!camera || !controls || appState.currentView !== 'galaxy') return false
    const activeCamera: ChoreographyCamera = camera
    const activeControls: ChoreographyControls = controls
    if (!Number.isFinite(anchorIndex) || appState.navState.focusedIndex !== null || appState.semanticDiveMode)
        return false

    const isPointVisible = (index: number, points: Point[], clusterFilter: number | null): boolean => {
        if (!Number.isFinite(index) || index < 0 || index >= points.length) return false
        const point = points[index]
        if (!point) return false
        if (clusterFilter !== null) {
            const pointCluster = Number.isFinite(Number(point.cluster)) ? Number(point.cluster) : 0
            if (pointCluster !== clusterFilter) return false
        }
        return true
    }

    const allPoints = appState.points as Point[]
    const routeIndices = [...new Set([anchorIndex, ...(resultIndices || [])])]
        .filter(
            (index) =>
                Number.isFinite(index) &&
                index >= 0 &&
                index < allPoints.length &&
                isPointVisible(index, allPoints, appState.activeClusterFilter)
        )
        .slice(0, isMobile() ? 8 : 12)

    const allTargetPositions = appState.targetPositions as NodePosition[]
    const allNodePositions = appState.nodePositions as NodePosition[]
    const allOriginalPositions = appState.originalPositions as NodePosition[]
    const vectors = routeIndices
        .map((index) => allTargetPositions[index] || allNodePositions[index] || allOriginalPositions[index])
        .filter((pos): pos is NodePosition => Boolean(pos))
        .map((pos) => new Vector3(pos.x, pos.y, pos.z))
    if (!vectors.length) return false
    const box = new Box3().setFromPoints(vectors)
    const boundsCenter = new Vector3()
    const boundsSize = new Vector3()
    box.getCenter(boundsCenter)
    box.getSize(boundsSize)
    const radius = Math.max(0.08, boundsSize.length() * 0.5)

    const anchorPosition =
        allTargetPositions[anchorIndex] || allNodePositions[anchorIndex] || allOriginalPositions[anchorIndex]
    if (
        !anchorPosition ||
        !Number.isFinite(anchorPosition.x) ||
        !Number.isFinite(anchorPosition.y) ||
        !Number.isFinite(anchorPosition.z)
    )
        return false

    const anchorVector = new Vector3(anchorPosition.x, anchorPosition.y, anchorPosition.z)
    const startTarget = activeControls.target.clone()
    const startPos = activeCamera.position.clone()
    const currentHeading = startPos.clone().sub(startTarget)
    if (currentHeading.lengthSq() < 0.0001) currentHeading.set(1.4, 1.1, 2)
    currentHeading.normalize()

    const worldUp = new Vector3(0, 1, 0)
    const rightVector = new Vector3().crossVectors(worldUp, currentHeading)
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
    let animationToken = 0
    appState.routeCameraAnimationToken = (appState.routeCameraAnimationToken || 0) + 1
    animationToken = appState.routeCameraAnimationToken

    publish(EVENTS.TRANSITION_PHASE_CHANGED, {
        phase: 'search-corridor',
        details: {
            reason: options.reason || 'search-success',
            anchorIndex,
            indexCount: routeIndices.length,
            lastCameraMove: 'search-corridor'
        }
    })
    noteSceneInteraction(duration + 1200)

    const controlTarget = startTarget.clone().lerp(endTarget, 0.56).add(worldUp.clone().multiplyScalar(0.025))

    // M4/M7: cancel any prior route rAF and create a fresh registry for this animation.
    cancelRouteAnimations()
    _routeRafRegistry = new DisposableRegistry({ label: 'camera-route-search-corridor' })

    function step(now: number) {
        if (
            animationToken! !== appState.routeCameraAnimationToken ||
            appState.navState.focusedIndex !== null ||
            appState.currentView !== 'galaxy'
        )
            return
        if (!activeControls.target || !activeCamera.position) return
        const t = Math.min((now - startTime) / duration, 1)
        const eased = easeInOutCubic(t)
        activeControls.target.set(
            quadraticBezierComponent(startTarget.x, controlTarget.x, endTarget.x, eased),
            quadraticBezierComponent(startTarget.y, controlTarget.y, endTarget.y, eased),
            quadraticBezierComponent(startTarget.z, controlTarget.z, endTarget.z, eased)
        )
        activeCamera.position.lerpVectors(startPos, endPos, eased)
        if (t < 1) {
            _routeRafRegistry!.raf(requestAnimationFrame(step))
        }
    }
    _routeRafRegistry.raf(requestAnimationFrame(step))
    return true
}

// ── animateCameraToTerrainPrelude ────────────────────────────────────────────

export function animateCameraToTerrainPrelude(options: RouteOptions = {}): void {
    const reducedMotion = prefersReducedMotion()
    const duration = reducedMotion ? 1 : options.duration || appState.MAP_HANDOFF_PRELUDE_MS || 1200

    publish(EVENTS.TRANSITION_PHASE_CHANGED, { phase: 'map-prelude', options: { duration } })

    try {
        const camera = appState.camera
        const controls = appState.controls
        if (!camera || !controls) {
            // No animation possible — release the 'map-prelude' phase we just announced.
            publish(EVENTS.TRANSITION_PHASE_CHANGED, { phase: 'idle' })
            return
        }
        const activeCamera: ChoreographyCamera = camera
        const activeControls: ChoreographyControls = controls
        const startPos = activeCamera.position.clone()
        const startTarget = activeControls.target.clone()

        const heading = startPos.clone().sub(startTarget).normalize()
        const worldUp = new Vector3(0, 1, 0)
        const desiredPos = startTarget.clone().add(heading.multiplyScalar(0.8)).add(worldUp.multiplyScalar(0.4))

        if (reducedMotion) {
            activeCamera.position.copy(desiredPos)
            activeControls.update()
            // Reduced-motion arrival is instantaneous, so signal it now.
            publish(EVENTS.TRANSITION_PHASE_CHANGED, { phase: 'idle' })
            return
        }

        const animationToken = ++appState.focusCameraAnimationToken
        const startTime = performance.now()

        setFocusTransitionMode('map-prelude', { duration })

        const priorControlsEnabled = activeControls.enabled
        activeControls.enabled = false

        // M4/M7: cancel any prior route rAF and create a fresh registry.
        cancelRouteAnimations()
        _routeRafRegistry = new DisposableRegistry({ label: 'camera-route-terrain-prelude' })

        function step(now: number) {
            if (animationToken !== appState.focusCameraAnimationToken) {
                activeControls.enabled = priorControlsEnabled
                return
            }
            const t = Math.min((now - startTime) / duration, 1)
            const eased = easeInOutCubic(t)

            activeCamera.position.lerpVectors(startPos, desiredPos, eased)

            if (t < 1) {
                _routeRafRegistry!.raf(requestAnimationFrame(step))
            } else {
                activeControls.enabled = priorControlsEnabled
                // Signal arrival WHEN the prelude animation actually completes.
                // A previous try/finally here published 'idle' synchronously the
                // instant the rAF was queued, which (a) stomped the 'map-prelude'
                // phase announced just above and (b) prematurely fired
                // onCameraArrived → completeCameraTransition, snapping the camera
                // store position/target to a stale transition.to before a single
                // prelude frame had run. The token-mismatch cancel branch
                // intentionally does NOT publish 'idle': the superseding
                // animation owns the arrival signal.
                publish(EVENTS.TRANSITION_PHASE_CHANGED, { phase: 'idle' })
            }
        }
        _routeRafRegistry.raf(requestAnimationFrame(step))
    } catch (_err) {
        debugError('animateCameraToTerrainPrelude failed:', _err)
        // Error path: release the announced phase so subscribers aren't stuck.
        publish(EVENTS.TRANSITION_PHASE_CHANGED, { phase: 'idle' })
    }
}

// ── applySemanticCentroidCamera ───────────────────────────────────────────────

export function applySemanticCentroidCamera(now = performance.now()): void {
    const camera = appState.camera
    const controls = appState.controls
    if (!camera || !controls) return
    const activeControls: ChoreographyControls = controls
    if (appState.trailDepth !== 2) {
        return
    }
    const navState = appState.navState
    const indices = navState.focusPocketIndices
    if (!indices || !indices.length) return

    const anchorIdx = navState.focusedIndex
    const pocketIndices = anchorIdx !== null && anchorIdx !== undefined ? [anchorIdx, ...indices] : indices

    const allNodePositions = appState.nodePositions as NodePosition[]
    const allOriginalPositions = appState.originalPositions as NodePosition[]
    let cx = 0,
        cy = 0,
        cz = 0,
        count = 0
    for (const idx of pocketIndices) {
        const pos = allNodePositions[idx] || allOriginalPositions[idx]
        if (!pos) continue
        cx += Number.isFinite(pos.x) ? pos.x : 0
        cy += Number.isFinite(pos.y) ? pos.y : 0
        cz += Number.isFinite(pos.z) ? pos.z : 0
        count++
    }
    if (!count) return

    const pocketCentroid = new Vector3(cx / count, cy / count, cz / count)

    const anchorPos =
        anchorIdx !== null && anchorIdx !== undefined
            ? allNodePositions[anchorIdx] || allOriginalPositions[anchorIdx]
            : null
    if (!anchorPos) return

    const anchorVec = new Vector3(
        Number.isFinite(anchorPos.x) ? anchorPos.x : 0,
        Number.isFinite(anchorPos.y) ? anchorPos.y : 0,
        Number.isFinite(anchorPos.z) ? anchorPos.z : 0
    )

    const personality = (appState.navState.currentPersonality || {}) as ChoreographyPersonality
    let centroidWeight: number
    if (personality.type === 'TIGHT_CLUSTER') {
        centroidWeight = 0.12
    } else if (personality.cameraArc === 'tight') {
        centroidWeight = 0.18
    } else {
        centroidWeight = 0.28
    }
    const lookAtTarget = anchorVec.clone().lerp(pocketCentroid, centroidWeight)

    const token = ++_insideCentroidLerpToken
    const startTarget = activeControls.target.clone()
    const startTime = now
    const reducedMotion = prefersReducedMotion()
    const duration = reducedMotion ? 1 : 1600

    // M4/M7: cancel any prior route rAF and create a fresh registry for centroid.
    cancelRouteAnimations()
    _routeRafRegistry = new DisposableRegistry({ label: 'camera-route-centroid' })

    function stepCentroid(nowInner: number) {
        if (token !== _insideCentroidLerpToken) return
        const t = Math.min(1, (nowInner - startTime) / duration)
        const eased = easeInOutCubic(t)
        activeControls.target.lerpVectors(startTarget, lookAtTarget, eased)
        activeControls.update()
        if (t < 1) {
            _routeRafRegistry!.raf(requestAnimationFrame(stepCentroid))
        }
    }
    if (prefersReducedMotion()) {
        activeControls.target.copy(lookAtTarget)
        activeControls.update()
    } else {
        _routeRafRegistry.raf(requestAnimationFrame(stepCentroid))
    }
}

// ── zoomCamera ───────────────────────────────────────────────────────────────

export function zoomCamera(multiplier: number): void {
    const camera = appState.camera
    const controls = appState.controls
    if (!camera || !controls) return
    const target = controls.target
    if (!target) return
    const camPos = camera.position
    if (!Number.isFinite(camPos.x + camPos.y + camPos.z + target.x + target.y + target.z)) return
    const direction = camPos.clone().sub(target).normalize()
    const currentDistance = camPos.distanceTo(target)
    const newDistance = currentDistance * multiplier
    const minDist = controls.minDistance || appState.ORBIT_MIN_DISTANCE_DEFAULT || 0.5
    const maxDist = controls.maxDistance || appState.ORBIT_MAX_DISTANCE_DEFAULT || 8.0
    const clampedDistance = Math.max(minDist, Math.min(maxDist, newDistance))
    camera.position.copy(target.clone().add(direction.multiplyScalar(clampedDistance)))
}

// ── clearInsideCentroid ──────────────────────────────────────────────────────

export function clearInsideCentroid(): void {
    _insideCentroidLerpToken++
}
