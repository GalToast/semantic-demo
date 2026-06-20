/**
 * @lib/engine/camera-controls.ts — Camera controls facade
 *
 * Port of js/modules/camera-controls.ts.
 *
 * Re-exports choreography functions from @lib/engine/camera-choreography
 * (already ported), core functions from the local camera-controls-core port,
 * and restore functions from the local camera-controls-restore port.
 */

// ── Re-export ported choreography functions ──────────────────────────────────

import {
    animateCameraToNode as runAnimateCameraToNode,
    focusOnNode as runFocusOnNode,
    animateCameraToSearchCorridor as runAnimateCameraToSearchCorridor,
    animateCameraToTerrainPrelude as runAnimateCameraToTerrainPrelude,
    applySemanticCentroidCamera as runApplySemanticCentroidCamera,
    zoomCamera as runZoomCamera,
    clearInsideCentroid as runClearInsideCentroid,
    cancelFocusCameraAnimation as runCancelFocusCameraAnimation
} from './camera-choreography'

export function animateCameraToNode(index: number, options?: any): void {
    runAnimateCameraToNode(index, options)
}

export function focusOnNode(index: number, options?: any): boolean {
    return runFocusOnNode(index, options)
}

export function animateCameraToSearchCorridor(...args: Parameters<typeof runAnimateCameraToSearchCorridor>): void {
    runAnimateCameraToSearchCorridor(...args)
}

export function animateCameraToTerrainPrelude(...args: Parameters<typeof runAnimateCameraToTerrainPrelude>): void {
    runAnimateCameraToTerrainPrelude(...args)
}

export function applySemanticCentroidCamera(...args: Parameters<typeof runApplySemanticCentroidCamera>): void {
    runApplySemanticCentroidCamera(...args)
}

export function zoomCamera(...args: Parameters<typeof runZoomCamera>): void {
    runZoomCamera(...args)
}

export function clearInsideCentroid(...args: Parameters<typeof runClearInsideCentroid>): void {
    runClearInsideCentroid(...args)
}

export type { FocusOnNodeOptions, AnimateCameraToNodeOptions } from './camera-choreography'

// ── Re-export cancelFocusCameraAnimation from ported choreography focus ─────

export function cancelFocusCameraAnimation(): void {
    runCancelFocusCameraAnimation()
}

// ── Re-export core functions (ported to local) ───────────────────────────────

export {
    setFocusTransitionMode,
    getFocusTransitionProgress,
    startFocusCameraAssist,
    releaseFocusCameraAssist,
    focusCameraAssistIsActive,
    syncCameraAssistDataset,
    setCameraAssistChoreography,
    setRouteExplorationState,
    clearRouteExploration,
    markRouteExploration,
    shouldMarkRouteExploration,
    getRouteLayerOrigin
} from './camera-controls-core'

// ── Re-export restore functions (ported to local) ────────────────────────────

export {
    OVERVIEW_CAMERA_POSE,
    settleCameraToOverviewPose,
    isCameraIdleOrbitAllowed,
    syncOrbitAutoRotate,
    setAutoRotateSuspended,
    clearAutoRotateResumeTimer,
    scheduleAutoRotateResume,
    noteSceneInteraction,
    updateAutoRotateSoftResume,
    toggleAutoRotate
} from './camera-controls-restore'
