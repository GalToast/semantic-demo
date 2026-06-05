/**
 * js/modules/camera-controls.ts
 *
 * TypeScript shadow of camera-controls.js.
 * Facade re-exporting from camera-controls-core, camera-controls-restore, and camera-controls-choreography.
 */
import * as core from './camera-controls-core.js';
import * as restore from './camera-controls-restore.js';
import * as choreography from './camera-controls-choreography.js';

export const OVERVIEW_CAMERA_POSE = (restore as any).OVERVIEW_CAMERA_POSE;

export function animateCameraToNode(index: number, options: any = {}): any {
    return (choreography as any).animateCameraToNode(index, options);
}

export function focusOnNode(index: number, options: any = {}): any {
    return (choreography as any).focusOnNode(index, options);
}

export function animateCameraToSearchCorridor(anchorIndex: number, resultIndices: number[] = [], options: any = {}): any {
    return (choreography as any).animateCameraToSearchCorridor(anchorIndex, resultIndices, options);
}

export function animateCameraToTerrainPrelude(options: any = {}): any {
    return (choreography as any).animateCameraToTerrainPrelude(options);
}

export function applySemanticCentroidCamera(now = performance.now()): any {
    return (choreography as any).applySemanticCentroidCamera(now);
}

export function zoomCamera(multiplier: number): any {
    return (choreography as any).zoomCamera(multiplier);
}

export function clearInsideCentroid(): any {
    return (choreography as any).clearInsideCentroid();
}

export function settleCameraToOverviewPose(): any {
    return (restore as any).settleCameraToOverviewPose();
}

export function isCameraIdleOrbitAllowed(): any {
    return (restore as any).isCameraIdleOrbitAllowed();
}

export function syncOrbitAutoRotate(): any {
    return (restore as any).syncOrbitAutoRotate();
}

export function setAutoRotateSuspended(suspended: boolean): any {
    return (restore as any).setAutoRotateSuspended(suspended);
}

export function clearAutoRotateResumeTimer(): any {
    return (restore as any).clearAutoRotateResumeTimer();
}

export function scheduleAutoRotateResume(delay: number): any {
    return (restore as any).scheduleAutoRotateResume(delay);
}

export function noteSceneInteraction(delay: number): any {
    return (restore as any).noteSceneInteraction(delay);
}

export function updateAutoRotateSoftResume(now = performance.now()): any {
    return (restore as any).updateAutoRotateSoftResume(now);
}

export function toggleAutoRotate(): any {
    return (restore as any).toggleAutoRotate();
}

export function setFocusTransitionMode(mode: string, options: any = {}): any {
    return (core as any).setFocusTransitionMode(mode, options);
}

export function getFocusTransitionProgress(duration = 640): any {
    return (core as any).getFocusTransitionProgress(duration);
}

export function startFocusCameraAssist(duration = 900, reason = 'focus'): any {
    return (core as any).startFocusCameraAssist(duration, reason);
}

export function releaseFocusCameraAssist(reason = 'manual'): any {
    return (core as any).releaseFocusCameraAssist(reason);
}

export function focusCameraAssistIsActive(now = performance.now()): any {
    return (core as any).focusCameraAssistIsActive(now);
}

export function syncCameraAssistDataset(): any {
    return (core as any).syncCameraAssistDataset();
}

export function setCameraAssistChoreography(phase = 'free', reason = 'view-handoff'): any {
    return (core as any).setCameraAssistChoreography(phase, reason);
}

export function setRouteExplorationState(phase = 'idle', reason = ''): any {
    return (core as any).setRouteExplorationState(phase, reason);
}

export function clearRouteExploration(reason = 'clear'): any {
    return (core as any).clearRouteExploration(reason);
}

export function markRouteExploration(reason = 'user-control'): any {
    return (core as any).markRouteExploration(reason);
}

export function shouldMarkRouteExploration(reason = ''): any {
    return (core as any).shouldMarkRouteExploration(reason);
}

export function getRouteLayerOrigin(): any {
    return (core as any).getRouteLayerOrigin();
}
