/**
 * @lib/utils/camera-math-utils.ts — Pure mathematical and vector functions for 3D camera orchestration.
 *
 * Port of
 */

import { Vector3 } from 'three'

export interface FramingParams {
    travelVector?: Vector3
    [key: string]: unknown
}

export interface PersonalityParams {
    cameraArc?: string
    [key: string]: unknown
}

export interface PocketProfile {
    key?: string
    [key: string]: unknown
}

/**
 * Compute the focus target and camera heading based on a travel vector.
 */
export function computeTravelVectorHeading(
    focusTarget: Vector3,
    currentHeading: Vector3,
    transitionStyle: string,
    framing: FramingParams
): { focusTarget: Vector3; heading: Vector3 } {
    let newFocusTarget = focusTarget.clone()
    let newHeading = currentHeading.clone()

    const travel = framing.travelVector?.clone() ?? new Vector3()
    if (travel.lengthSq() > 0.000001) {
        const travelDir = travel.normalize()
        const travelPull = transitionStyle === 'dive' ? -0.58 : transitionStyle === 'dive-walk' ? -0.38 : -0.3
        const blendedHeading = currentHeading
            .clone()
            .multiplyScalar(transitionStyle === 'dive' ? 0.62 : 0.7)
            .add(travelDir.clone().multiplyScalar(travelPull))
        if (blendedHeading.lengthSq() > 0.000001) {
            newHeading = blendedHeading.normalize()
        }
        newFocusTarget = focusTarget
            .clone()
            .add(
                travelDir.multiplyScalar(
                    transitionStyle === 'dive' ? 0.06 : transitionStyle === 'dive-walk' ? 0.022 : 0.014
                )
            )
    }
    return { focusTarget: newFocusTarget, heading: newHeading }
}

/**
 * Compute an orbital bias for the camera heading to avoid direct top-down
 * or purely lateral views in semantic pockets.
 */
export function computeOrbitBiasHeading(
    currentHeading: Vector3,
    transitionStyle: string,
    pocketProfile: PocketProfile
): { heading: Vector3; stageRightVector: Vector3 | null } {
    const baseOrbitBias =
        pocketProfile.key === 'roomy'
            ? 0.11
            : pocketProfile.key === 'compact' || pocketProfile.key === 'condensed'
              ? 0.04
              : 0.075
    const orbitBias =
        transitionStyle === 'dive' || transitionStyle === 'dive-walk' ? baseOrbitBias * 1.55 : baseOrbitBias
    const worldUp = new Vector3(0, 1, 0)
    const right = new Vector3().crossVectors(worldUp, currentHeading)

    if (right.lengthSq() > 0.000001) {
        right.normalize()
        const stageRightVector = right.clone()
        const composedHeading = currentHeading
            .clone()
            .multiplyScalar(0.92)
            .add(right.clone().multiplyScalar(orbitBias))
            .add(worldUp.multiplyScalar(0.035))

        let newHeading = currentHeading.clone()
        if (composedHeading.lengthSq() > 0.000001) {
            newHeading = composedHeading.normalize()
        }
        return { heading: newHeading, stageRightVector }
    }
    return { heading: currentHeading, stageRightVector: null }
}

/**
 * Compute quadratic bezier control points for a smooth camera arc.
 */
export function computeCameraArcControlPoints(
    startPos: Vector3,
    startTarget: Vector3,
    desiredCamPos: Vector3,
    focusTarget: Vector3,
    currentHeading: Vector3,
    distance: number,
    transitionStyle: string,
    personality: PersonalityParams,
    pocketProfile: PocketProfile,
    stageRightVector: Vector3 | null
): { cameraControlPoint: Vector3; targetControlPoint: Vector3 } {
    const worldUp = new Vector3(0, 1, 0)
    const rightVector = stageRightVector || new Vector3().crossVectors(worldUp, currentHeading).normalize()
    if (rightVector.lengthSq() < 0.000001) rightVector.set(1, 0, 0)
    const roomyBoost = pocketProfile.key === 'roomy' ? 1.2 : pocketProfile.key === 'condensed' ? 0.72 : 1

    const arcMult =
        personality.cameraArc === 'wide'
            ? 1.45
            : personality.cameraArc === 'side'
              ? 1.15
              : personality.cameraArc === 'narrow'
                ? 0.65
                : 1.0
    const arcSide = Math.min(0.18, Math.max(0.035, distance * 0.16 * roomyBoost * arcMult))
    const arcLift = Math.min(0.16, Math.max(0.034, distance * 0.15 * (personality.cameraArc === 'wide' ? 1.25 : 1.0)))
    const arcPullback = Math.min(0.12, Math.max(0.035, distance * 0.12))

    const cameraControlPoint = startPos
        .clone()
        .lerp(desiredCamPos, transitionStyle === 'search' ? 0.52 : 0.48)
        .add(rightVector.clone().multiplyScalar(arcSide))
        .add(worldUp.clone().multiplyScalar(arcLift))
        .add(currentHeading.clone().multiplyScalar(arcPullback))

    const targetControlPoint = startTarget
        .clone()
        .lerp(focusTarget, 0.58)
        .add(rightVector.clone().multiplyScalar(arcSide * 0.32))
        .add(worldUp.clone().multiplyScalar(arcLift * 0.12))

    return { cameraControlPoint, targetControlPoint }
}
