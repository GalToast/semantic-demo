/**
 * @lib/engine/camera-controls-core.ts — Shim re-exporting from the Svelte 5 rune-class
 *
 * Ticket W11-T6: The canonical implementation now lives in camera-controls-core.svelte.ts.
 * This file re-exports everything so existing consumers don't need import changes.
 *
 * Each function delegates to the singleton cameraControlsCore instance.
 */

export {
    cameraControlsCore,
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
    getRouteLayerOrigin,
} from './camera-controls-core.svelte';
