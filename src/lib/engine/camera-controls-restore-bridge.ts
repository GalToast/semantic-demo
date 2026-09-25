/**
 * @lib/engine/camera-controls-restore-bridge.ts — Bridge for kernel consumers
 *
 * W16-T-CAM-3: Retires js/modules/camera-controls-restore.ts.
 * Kernel files (js/modules/*) import from this bridge instead of the legacy module.
 * Canonical implementation lives in camera-controls-restore.svelte.ts.
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
