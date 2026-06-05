import * as THREE from 'three'
import { state } from '../state.js'
import {
    getCamera, getControls, getNodePositions, getOriginalPositions, getTargetPositions,
    getNavState, getCurrentView, getSemanticDiveMode, getPoints,
    getTrailDepth, getMyceliumMode,
    getActiveClusterFilter, getActiveFilters,
    getRouteCameraAnimationToken,
    getMapHandoffPreludeMs, getOrbitMinDistanceDefault, getOrbitMaxDistanceDefault
} from '../state/selectors/index.js'
import { isMobile, prefersReducedMotion } from './environment.js'
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
import { refreshMapRouteEmbodiment } from './map-state.js'
import {
    refreshCompositionState,
    dispatchNavTransition,
    setTrailDepth,
    setMyceliumMode,
    updateExplorationUi,
    syncSearchStatusForFocus
} from './lifecycle.js'
import { updateJourneyCompass } from './journey-compass-controller.js'
import { applyPointFilterColors, syncFocusStage } from './journey.js'
import { syncSemanticDiveUi } from './semantic-dive-ui.js'
import { publish, EVENTS } from './event-bus.js'

import { setFocusTransitionMode, startFocusCameraAssist, clearRouteExploration } from './camera-controls-core.js'
import { noteSceneInteraction } from './camera-controls-restore.js'
import { setFocusPanelMode, FOCUS_PANEL_MODE } from './focus-panel-mode.js'

// -----------------------------------------------------------------------------
// ANIMATION PRIMITIVES
// -----------------------------------------------------------------------------
let _insideCentroidTarget = null
let _insideCentroidLerpToken = 0

// Constants
// -----------------------------------------------------------------------------
// 1. ANIMATION PRIMITIVES
// -----------------------------------------------------------------------------

export function animateCameraToNode(index, options = {}) {
    if (!state.camera || !state.controls) return
    // Guardrail: nodePositions is the source of truth for camera destinations.
    // targetPositions is visual-staging/compression only; never read for camera path.
    const targetPosition = state.nodePositions[index] || state.originalPositions[index]
    if (!targetPosition) return
    const framing = {
        ...(getNavState().focusFramingMeta || {}),
        ...options
    }
    const transitionStyle = framing.transitionStyle || 'focus'
    const tx = targetPosition.x,
        ty = targetPosition.y,
        tz = targetPosition.z
    if (!Number.isFinite(tx) || !Number.isFinite(ty) || !Number.isFinite(tz)) return
    const nodePos = new THREE.Vector3(tx, ty, tz)
    if (!state.controls?.target || !state.camera?.position) return
    const startTarget = state.controls.target.clone()
    const startPos = state.camera.position.clone()
    const currentHeading = state.camera.position.clone().sub(state.controls.target).normalize()

    // Keep focused constellations readable: the selected node should anchor the
    // route without filling the whole field of view.
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

    // --- SAFE AREA: keep pocket/neighborhood nodes visible and reachable ---
    // When in semantic pocket focus, compute pocket screen bounds and nudge
    // the camera target so off-center neighbors stay within the unobstructed
    // canvas region. This prevents the "parked high/under focus panel" issue
    // where neighbor nodes go off-screen after the camera settles on the anchor.
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
            startPos,
            startTarget,
            desiredCamPos,
            focusTarget,
            currentHeading,
            distance,
            transitionStyle,
            personality,
            pocketProfile,
            stageRightVector
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

        // --- Dynamic Arrival Drift (UX Polish) ---
        if (t > 0.85 && stageArcActive && !prefersReducedCameraMotion) {
            const driftIntensity = (t - 0.85) * 0.15 // subtle drift factor
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

export function focusOnNode(index, options = {}) {
    if (!Number.isFinite(index) || index < 0 || !getPoints() || index >= getPoints().length) return false
    const point = getPoints()[index]
    if (!point) return false

    state.selectedPoint = point
    state.hoverHighlightIndex = -1
    state.pinnedThreadIndex = null

    // Delegate only navState/history writes to the FOCUS_NODE reducer.
    // focusOnNode retains ownership of focusedNode, selectedPoint, trailDepth,
    // myceliumMode, and all side-effect calls.
    dispatchNavTransition('FOCUS_NODE', {
        index,
        preserveMode: !!options.preserveMode,
        fromTraversal: !!options.fromTraversal,
        fromCanvasNode: !!options.fromCanvasNode,
        appendHistory: !!options.appendHistory,
        restoreHistory: !!options.restoreHistory
    })

    // 10/10 Polish: Automatically enter Trail Depth 1 when focusing a node.
    // This resolves the 'broken feedback loop' where the Trail chip stays inactive despite focusing a business.
    if (getTrailDepth() === 0) {
        setTrailDepth(1, { skipUrlSync: true })
    }

    // Keep myceliumMode in sync with navState.mode when entering trail mode from focus
    if (getNavState().mode === 'trail' && getMyceliumMode() !== 'trail') {
        setMyceliumMode('trail', { skipUrlSync: true })
    }

    // 10/10 Polish: Clear processing feedback once transition begins
    document.querySelectorAll('.search-result-item.is-processing').forEach((el) => el.classList.remove('is-processing'))

    document.getElementById('onboarding-hint')?.classList.remove('visible')
    const hint = document.getElementById('onboarding-hint')
    if (hint) {
        hint._dismissedThisSession = true
        if (hint._autoHideTimer) clearTimeout(hint._autoHideTimer)
    }
    document.body.dataset.focusOrigin = options.fromCanvasNode
        ? 'field-node'
        : options.fromSearchResult
          ? 'search-result'
          : options.fromTraversal
            ? 'trail-walk'
            : 'programmatic'
    if (options.fromCanvasNode) {
        setFocusPanelMode(FOCUS_PANEL_MODE.FIELD_NODE)
    }

    // 10/10 Polish: Reduce mobile UI density by collapsing secondary sections on focus
    if (isMobile()) {
        const storySection = document.getElementById('story-section')
        const clusterSection = document.getElementById('cluster-section')
        if (storySection) storySection.open = false
        if (clusterSection) clusterSection.open = false
    }

    publish(EVENTS.CAMERA_MOVED, { reason: 'focus-node', index })
    publish(EVENTS.CAMERA_NODE_FOCUSED, { index, point, options })

    applyPointFilterColors()
    updateExplorationUi()

    syncFocusStage(point)
    refreshMapRouteEmbodiment()

    clearRouteExploration(options.fromTraversal ? 'trail-walk' : options.fromCanvasNode ? 'field-node-focus' : 'focus')

    syncSearchStatusForFocus(point, {
        fromTraversal: !!options.fromTraversal,
        fromSearchResult: !!options.fromSearchResult
    })

    animateCameraToNode(index, {
        transitionStyle: options.fromTraversal ? 'walk' : options.fromSearchResult ? 'search' : 'focus'
    })

    syncSemanticDiveUi()
    refreshCompositionState()
    if (!options.skipUrlSync) {
        publish(EVENTS.URL_SYNC_REQUESTED, {
            params: { record: point.lead_id || null },
            mode: options.historyMode || 'push',
            reason: 'focus'
        })
    }
    updateJourneyCompass()
    return true
}

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

    // Show "Preparing terrain..." progress overlay during the prelude
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

        // 10/10 Polish: Prevent control jitter during prelude
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
            // Don't call controls.update() here as we want a raw position lerp

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
        // Remove the prelude overlay when the animation completes (or on error)
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

    // --- Compute pocket centroid (neighbor average around anchor) ---
    let cx = 0,
        cy = 0,
        cz = 0,
        count = 0
    for (const idx of pocketIndices) {
        // Guardrail: nodePositions is source of truth for camera centroid; targetPositions is compression layer.
        const pos = getNodePositions()[idx] || getOriginalPositions()[idx]
        if (!pos) continue
        cx += Number.isFinite(pos.x) ? pos.x : 0
        cy += Number.isFinite(pos.y) ? pos.y : 0
        cz += Number.isFinite(pos.z) ? pos.z : 0
        count++
    }
    if (!count) return

    const pocketCentroid = new THREE.Vector3(cx / count, cy / count, cz / count)

    // --- Anchor position is the primary lookAt base ---
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

    // --- Personality-driven centroid influence: anchor stays dominant ---
    // Default: 0.28 centroid weight → 72% anchor influence
    // DEEP_DIVE / tight arc: 0.18 → 82% anchor influence
    // TIGHT_CLUSTER: 0.12 → 88% anchor influence
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

    // --- Smooth the controls.target toward the anchor-weighted lookAt ---
    const token = ++_insideCentroidLerpToken
    const startTarget = state.controls.target.clone()
    const startTime = now
    const reducedMotion = prefersReducedMotion()
    const duration = reducedMotion ? 1 : 1600 // Snap for reduced motion; otherwise lerp to final lookAt.

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
