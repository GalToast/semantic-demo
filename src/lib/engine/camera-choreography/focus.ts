/**
 * @lib/engine/camera-choreography/focus.ts
 * Focus camera animation — animateCameraToNode, cancelFocusCameraAnimation
 *
 * Ported from:
 */
import { Vector3 } from 'three'
import { appState } from '@lib/state/app.svelte'
import type { NodePosition } from '@lib/state/state-types'
import { prefersReducedMotion } from '@lib/utils/environment'
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
interface FocusFramingOptions extends FramingParams {
    transitionStyle?: string
    distance?: number
    verticalLift?: number
    framingDrop?: number
    targetOffset?: Vector3
    duration?: number
}

/** Public alias consumed by camera-choreography/index.ts barrel re-export. */
export type AnimateCameraToNodeOptions = FocusFramingOptions

/** Camera-readable personality shape. Structurally compatible with
 * `appState.navState.currentPersonality: Record<string, unknown> | null`
 * via the `[key: string]: unknown` index signature. */
interface FocusPersonality {
    type?: string
    cameraDuration?: number
    cameraArc?: string
    easing?: string
    [key: string]: unknown
}

// -----------------------------------------------------------------------------
// FOCUS CAMERA ANIMATION — animateCameraToNode
// -----------------------------------------------------------------------------

let _focusCameraRafId: number | null = null

export function cancelFocusCameraAnimation() {
    if (_focusCameraRafId !== null) {
        window.cancelAnimationFrame(_focusCameraRafId)
        _focusCameraRafId = null
    }
}

export function animateCameraToNode(index: number, options: FocusFramingOptions = {}) {
    if (!appState.camera || !appState.controls) return
    const camera = appState.camera
    const controls = appState.controls
    const targetPosition: NodePosition | undefined = appState.nodePositions[index] || appState.originalPositions[index]
    if (!targetPosition) return
    // NavFocusFramingMeta and FocusFramingOptions have similar shape but
    // NavFocusFramingMeta.targetOffset is `unknown` while FocusFramingOptions
    // expects `Vector3`. Spread is sound at runtime; the final `as
    // FocusFramingOptions` documents the intentional narrowing.
    const framing = {
        ...(appState.navState.focusFramingMeta || {}),
        ...options
    } as FocusFramingOptions
    const transitionStyle = framing.transitionStyle || 'focus'
    const tx = targetPosition.x,
        ty = targetPosition.y,
        tz = targetPosition.z
    if (!Number.isFinite(tx) || !Number.isFinite(ty) || !Number.isFinite(tz)) return
    const nodePos = new Vector3(tx, ty, tz)
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
    const framingOffset = framing.targetOffset?.clone ? framing.targetOffset.clone() : new Vector3()
    let focusTarget = nodePos
        .clone()
        .add(framingOffset)
        .add(new Vector3(0, -framingDrop, 0))
    if (!appState.focusCameraTargetOffset?.copy) appState.focusCameraTargetOffset = new Vector3()
    let heading = currentHeading.clone()
    let stageRightVector: Vector3 | null = null
    let safeTargetOffset: Vector3 | null = null
    const navState = appState.navState
    const isSemanticPocketFocus = navState.threadSource === 'semantic' && navState.focusPocketMeta?.active

    if (isSemanticPocketFocus && navState.focusPocketIndices?.length) {
        const pocketBounds = computeFocusPocketScreenBounds(
            navState.focusedIndex,
            // computeFocusPocketScreenBounds expects mutable number[] but
            // navState.focusPocketIndices is readonly. Spread to copy.
            [...navState.focusPocketIndices],
            appState as unknown as AppStateLike
        )
        if (pocketBounds) {
            const region = getCanvasUnobstructedRegion()
            const camDist = camera.position.distanceTo(controls.target)
            const safeOffset = computeSafeAreaCameraTargetOffset(pocketBounds, region, camDist, camera, controls)
            if (safeOffset) {
                const pocketProfile = navState.focusPocketMeta?.viewportProfile
                const rawOffsetLimit: number | undefined =
                    pocketProfile && typeof pocketProfile === 'object'
                        ? (pocketProfile as { targetOffsetLimit?: number }).targetOffsetLimit
                        : undefined
                const offsetLimit = Number.isFinite(rawOffsetLimit) ? Number(rawOffsetLimit) : 0.12
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
        const pocketProfile = appState.navState.focusPocketMeta?.viewportProfile
        // computeOrbitBiasHeading expects PocketProfile (key?: string).
        // viewportProfile has key?: string + extras; structurally compatible.
        const res = computeOrbitBiasHeading(currentHeading, transitionStyle, (pocketProfile ?? {}) as PocketProfile)
        heading = res.heading
        stageRightVector = res.stageRightVector
    }

    const desiredCamPos = focusTarget
        .clone()
        .add(heading.multiplyScalar(distance))
        .add(new Vector3(0, verticalLift, 0))

    const personality = (appState.navState.currentPersonality as FocusPersonality | null) || {
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
        appState.focusCameraTargetOffset = new Vector3()
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
    let cameraControlPoint: Vector3 | null = null
    let targetControlPoint: Vector3 | null = null

    if (stageArcActive) {
        const pocketProfile = (appState.navState.focusPocketMeta?.viewportProfile as PocketProfile | undefined) ?? {
            key: undefined
        }
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
            const worldUp = new Vector3(0, 1, 0)
            const driftDir = new Vector3().crossVectors(worldUp, currentHeading).normalize()
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
