/**
 * @lib/engine/camera-controls-restore.ts — Shim re-exporting from the Svelte 5 rune-class
 *
 * Ticket W11-T6: The canonical implementation now lives in camera-controls-restore.svelte.ts.
 * This file re-exports everything so existing consumers don't need import changes.
 *
 * Each function delegates to the singleton cameraControlsRestore instance.
 */

export {
    OVERVIEW_CAMERA_POSE,
    cameraControlsRestore,
    settleCameraToOverviewPose,
    isCameraIdleOrbitAllowed,
    syncOrbitAutoRotate,
    setAutoRotateSuspended,
    clearAutoRotateResumeTimer,
    scheduleAutoRotateResume,
    noteSceneInteraction,
    updateAutoRotateSoftResume,
    toggleAutoRotate,
} from './camera-controls-restore.svelte';
