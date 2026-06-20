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

export function animateCameraToNode(index: number, options?: any): void {
    import('./camera-choreography').then((m: any) => m.animateCameraToNode(index, options))
}

export function focusOnNode(index: number, options?: any): boolean {
    import('./camera-choreography').then((m: any) => m.focusOnNode(index, options))
    return true
}

export function animateCameraToSearchCorridor(...args: any[]): void {
    import('./camera-choreography').then((m: any) => m.animateCameraToSearchCorridor(...args))
}

export function animateCameraToTerrainPrelude(...args: any[]): void {
    import('./camera-choreography').then((m: any) => m.animateCameraToTerrainPrelude(...args))
}

export function applySemanticCentroidCamera(...args: any[]): void {
    import('./camera-choreography').then((m: any) => m.applySemanticCentroidCamera(...args))
}

export function zoomCamera(...args: any[]): void {
    import('./camera-choreography').then((m: any) => m.zoomCamera(...args))
}

export function clearInsideCentroid(...args: any[]): void {
    import('./camera-choreography').then((m: any) => m.clearInsideCentroid(...args))
}

export type { FocusOnNodeOptions, AnimateCameraToNodeOptions } from './camera-choreography'

// ── Re-export cancelFocusCameraAnimation from ported choreography focus ─────

export function cancelFocusCameraAnimation(): void {
    import('./camera-choreography/focus').then((m: any) => m.cancelFocusCameraAnimation())
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
