/**
 * @lib/engine/index.ts — Engine bridge public API + TS port re-exports
 *
 * Re-exports the bridge factory, consumer-facing types, and direct TS port
 * functions so consumers can choose between:
 *   - Bridge: `createEngineBridge()` for full lifecycle orchestration
 *   - TS ports: direct imports from three-engine, camera-controls, etc.
 *
 * Usage:
 * ```ts
 * // Bridge (orchestration)
 * import { createEngineBridge } from '@lib/engine';
 * import type { EngineBridge, EngineCallbacks } from '@lib/engine';
 *
 * // Direct TS ports (specific functions)
 * import { initThreeJS, animate } from '@lib/engine/three-engine';
 * import { focusOnNode, settleCameraToOverviewPose } from '@lib/engine/camera-controls';
 * import { createPoints, disposeNodeVisuals } from '@lib/engine/node-manager';
 * import { createMycelium, disposeMycelium } from '@lib/engine/thread-manager';
 * ```
 */

// ── Bridge factory and types ─────────────────────────────────────────────────

export { createEngineBridge } from './bridge'

export type {
    EngineBridge,
    EngineCallbacks,
    EngineStatus,
    FocusNodeOptions,
    SearchCorridorOptions,
    FilterOptions,
    SceneDiagnostics
} from './bridge'

// ── TS port re-exports: three-engine ─────────────────────────────────────────

export {
    initThreeJS,
    deinit,
    animate,
    onWindowResize,
    cancelAnimate,
    getSceneRenderableDiagnostics,
    updateCameraViewportOffset,
    updateMyceliumThreads,
    applyMapFlatteningLayout,
    triggerSearchHeroMoment,
    triggerCorridorNodeGlow,
    updateCorridorNodeGlow,
    triggerSearchCorridorAnimation,
    updateSearchCorridorAnimation,
    disposeSearchCorridorAnimation,
    updateInteractionVisuals,
    disposeInteractionVisuals,
    initSemanticLens,
    initSemanticManifold,
    shouldRenderThreads,
    shouldRenderBridgeThreads,
    createPoints,
    createMycelium,
    SCENE_ATMOSPHERE,
    MYCELIUM_FIELD_SCALE
} from './three-engine'

import { cancelFocusCameraAnimation } from '@lib/engine/camera-choreography'
import {
    settleCameraToOverviewPose,
    isCameraIdleOrbitAllowed,
    syncOrbitAutoRotate,
    setAutoRotateSuspended,
    clearAutoRotateResumeTimer,
    scheduleAutoRotateResume,
    noteSceneInteraction,
    updateAutoRotateSoftResume,
    toggleAutoRotate,
    OVERVIEW_CAMERA_POSE
} from '@lib/engine/camera-controls-restore-bridge'
import {
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
} from '@lib/engine/camera-controls-core'

export {
    cancelFocusCameraAnimation,
    settleCameraToOverviewPose,
    isCameraIdleOrbitAllowed,
    syncOrbitAutoRotate,
    setAutoRotateSuspended,
    clearAutoRotateResumeTimer,
    scheduleAutoRotateResume,
    noteSceneInteraction,
    updateAutoRotateSoftResume,
    toggleAutoRotate,
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
    OVERVIEW_CAMERA_POSE
}

// ── TS port re-exports: node-manager ─────────────────────────────────────────

export {
    disposeNodeVisuals,
    createNodeSporeLayer,
    getNodeSporeScale,
    setNodeSporeInstanceMatrix,
    getNodeSporeColor,
    getPointBoundsCenter,
    compilePointMaterialForReadiness,
    disposeTextures
} from './node-manager'

// ── TS port re-exports: thread-manager ───────────────────────────────────────

export {
    disposeMycelium,
    getThreadPulseOpacity,
    getMyceliumPresentationProfile,
    getGroupLineSegmentCount
} from './thread-manager'

// ── Demo choreography ────────────────────────────────────────────────────────

export {
    PHASE as DemoChoreographyPhase,
    getDemoPhase,
    getDemoNodeIndex,
    isDemoCancelled,
    setDemoNodeIndex,
    clearDemoTimers,
    resetRetryState,
    runDemo,
    cancelChoreography,
    isMicroDemoRunning
} from './demo-choreography'

// ── Camera choreography (legacy wrappers) ────────────────────────────────────

export {
    focusOnNode,
    animateCameraToNode,
    animateCameraToSearchCorridor,
    animateCameraToTerrainPrelude,
    applySemanticCentroidCamera,
    zoomCamera,
    clearInsideCentroid
} from './camera-choreography'

export type { FocusOnNodeOptions, AnimateCameraToNodeOptions } from './camera-choreography'
