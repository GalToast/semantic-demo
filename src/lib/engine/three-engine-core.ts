/**
 * @lib/engine/three-engine-core.ts — Core lifecycle & render loop hub
 *
 * Scene initialization, render loop, teardown, and camera management.
 * State is managed via the singleton `engineState` imported from
 * three-engine-state.ts (Phase 0 decomposition).
 *
 * Extracted from three-engine.ts (W47 decomposition). Public API is
 * re-exported through the barrel three-engine.ts — consumers should not
 * import this file directly.
 *
 * Decomposition (W47+):
 *   three-engine-restore.ts    — WebGL restore retry escalation
 *   three-engine-init.ts       — initThreeJS orchestration
 *   three-engine-teardown.ts   — cancelAnimate / deinit
 *   three-engine-render-loop.ts — animate() + frame helpers
 */

// ── Re-export: restore machine ───────────────────────────────────────────────

export {
    invalidateRestoreMachine,
    setRestoreInitFn,
    setRestoreAnimateCb,
    setRestoreSuccessCb,
    _armRestoreWatchdog,
    _restoreReinitWithRetry
} from './three-engine-restore'

// ── Re-export: init orchestration ─────────────────────────────────────────────

export { initThreeJS } from './three-engine-init'

// ── Re-export: teardown ───────────────────────────────────────────────────────

export {
    cancelAnimate,
    deinit
} from './three-engine-teardown'

// ── Re-export: render loop ────────────────────────────────────────────────────

export { animate } from './three-engine-render-loop'

// ── Local imports ─────────────────────────────────────────────────────────────

import { engineState } from './three-engine-state'
import { webglContext } from '@lib/engine/webgl-context'
import { appState } from '@lib/state/app.svelte'
import { sceneNeedsContinuousFrame, sceneVisualsNeedRender } from './three-engine-helpers'
import { cameraControlsRestore } from '@lib/engine/camera-controls-restore.svelte.ts'
import { sampleScenePerformance } from './renderer/renderer-diagnostics'
import { debugWarn, debugError } from '@lib/utils/debug'
import { prefersReducedMotion } from '@lib/utils/environment'
import {
    computeRevealProgress,
    lerpNodesForFrame,
    lerpCameraForReveal,
    updateFogDensity,
    updatePointsMaterial,
    updateReferenceSphereOpacity,
    updateSporeOpacity,
    updateHoverEmissiveFlash,
    updateMyceliumPulse,
    updateThreadLayerOpacities,
    updatePointsShaderHoverBoost
} from './three-engine-frame-updates'
import { scheduleNextAnimationFrame } from './three-engine-timers'
import {
    clearScheduledFrameTasks,
    hasScheduledFrameTasks,
    runFrameTasks
} from './frame-scheduler'
import {
    shouldSkipNextRender as shouldSkipNextRenderHelper,
    type SceneStaticSnapshot
} from './renderer/scene-static-tracker'
import {
    updateRouteTraceOverlayFrame,
    updateArrivalHandoffOverlayFrame,
    updateFocusSemanticOverlayFrame,
    syncFocusSemanticOverlayResolutionPort,
    updateFocusSemanticOverlayPositions
} from '@lib/engine/journey-webgl-lazy'
import { syncFocusPocketSizeMesh } from './focus-pocket-size-mesh'
import {
    updateMyceliumThreads as updateMyceliumThreadsPort,
    drainMyceliumDirtyState as drainMyceliumDirtyStatePort,
    shouldRenderThreads as shouldRenderThreadsPort,
    syncMyceliumLineResolution as syncMyceliumLineResolutionPort
} from '@lib/engine/thread-manager'

// ── Helpers ───────────────────────────────────────────────────────────────────

export function markEngineInitPhase(phase: string): void {
    if (typeof performance?.mark === 'function') performance.mark(`engine-init-${phase}`)
}

export function updateCameraViewportOffset() {
    const camera = webglContext.camera || appState.camera
    if (!camera) return
    const container = document.getElementById('canvas-container')
    const width = container?.clientWidth ?? window.innerWidth
    const height = container?.clientHeight ?? window.innerHeight

    // Only shift the camera frustum when the info-panel is actually showing
    // content that takes real screen real estate on desktop. Idle / launch
    // surfaces keep the panel chrome open but empty; offsetting the camera
    // there pushes the 3D cloud off-center on first paint.
    const surface = document.body?.dataset?.panelSurface
    const focused = document.body?.dataset?.focusedNode
    const hasContent = Boolean(
        focused ||
        surface === 'focus' ||
        surface === 'search' ||
        surface === 'focus-search' ||
        surface === 'semantic-dive'
    )
    const panel = document.querySelector('.info-panel')
    if (panel && hasContent && panel.classList.contains('active') && width > 768) {
        const rect = panel.getBoundingClientRect()
        const offset = rect.right / 2
        camera.setViewOffset?.(width, height, -offset, 0, width, height)
    } else {
        camera.clearViewOffset?.()
    }
    camera.updateProjectionMatrix?.()
    // Frustum changed from a view-offset shift — the render-skip snapshot
    // (camera pos/quat only) is now stale and would skip a needed frame for
    // reduced-motion users. Invalidate it (render sweep 2026-08-07).
    engineState.lastCameraSnapshot = null
}

export function onWindowResize() {
    const container = document.getElementById('canvas-container')
    const camera = webglContext.camera || engineState.state?.camera
    const renderer = webglContext.renderer || engineState.state?.renderer
    if (!container || !camera || !renderer) return

    const width = container.clientWidth || window.innerWidth
    const height = container.clientHeight || window.innerHeight

    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height)
    // Re-apply the device pixel ratio on resize — moving the window between
    // monitors of different DPI, or zooming, changes window.devicePixelRatio
    // but setSize() alone does not update the draw buffer density, leaving
    // the canvas blurry. Cap matches scene-init.ts init (perf budget = 2).
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    engineState.ppModule?.resizePostProcessing(width, height)
    // Keep LineMaterial.resolution in sync with the drawing buffer so the
    // mycelium linewidth shader renders thin filaments, not fat bands.
    syncMyceliumLineResolutionPort()
    // Sync the focus semantic overlay resolution too — a resize while focused
    // would otherwise leave the overlay linewidth shader at the old size.
    syncFocusSemanticOverlayResolutionPort()
    // Render-skip snapshot is camera-pos/quat only; a resize changes the
    // drawing buffer + frustum, so the cached snapshot is stale and would
    // skip (blank/stale canvas) for reduced-motion users until the camera
    // moves. Invalidate it so the next frame renders (render sweep 2026-08-07).
    engineState.lastCameraSnapshot = null
}

// ── Render-loop start gate ────────────────────────────────────────────────────

export function requestRenderLoopStart(): void {
    engineState.renderLoopStartPending = true
}

export function startRenderLoop(): void {
    if (!engineState.renderLoopStartPending) return
    engineState.renderLoopStartPending = false
    markEngineInitPhase('animate-scheduled')
    scheduleNextAnimationFrame(true)
}

export function applyMapFlatteningLayout(enabled: boolean): void {
    engineState.mapFlattening?.applyMapFlatteningLayout(enabled)
}
