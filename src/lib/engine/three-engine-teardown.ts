/**
 * @lib/engine/three-engine-teardown.ts — Engine teardown / dispose
 *
 * Extracted from three-engine-core.ts. Owns the renderer/scene/canvas
 * teardown sequence (cancelAnimate) and the higher-level deinit() that
 * mirrors lifecycle.ts cleanup.
 */

import { engineState } from './three-engine-state'
import { disposeEventListeners } from '@lib/ui/global-bindings'
import { cancelOverviewCameraAnimation } from '@lib/demo/camera'
import { disposeCanvasNodeInteractionBindings } from '@lib/journey/canvas-interaction'
import { cancelRouteAnimations } from '@lib/engine/camera-choreography/routes'
import { disposeObject3D } from '@lib/engine/resource-tracker'
import {
    disposeNodeVisuals as disposeNodeVisualsPort
} from '@lib/engine/node-manager'
import {
    disposeMycelium as disposeMyceliumPort
} from '@lib/engine/thread-manager'
import { invalidateRestoreMachine } from './three-engine-restore'
import { debugWarn } from '@lib/utils/debug'
import { pauseRenderLoopTimers } from './three-engine-timers'
import { clearScheduledFrameTasks } from './frame-scheduler'
import { setEngineStatus } from '@lib/stores/engine.svelte.ts'
import { webglContext } from '@lib/engine/webgl-context'

// ── Teardown ────────────────────────────────────────────────────────────────

export function cancelAnimate() {
    engineState.renderLoopStartPending = false
    pauseRenderLoopTimers()
    clearScheduledFrameTasks()
    // M4/M7: cancel any pending route frame tasks before the renderer/canvas are
    // torn down, so a pending step() won't fire against nulled camera/controls.
    cancelRouteAnimations()
    // M9: also cancel any pending focus-camera animation rAF. The route
    // registry above only tracks route animations; focus.ts manages its rAF
    // via a module-level _focusCameraRafId that is otherwise only cancelled
    // in deinit() (:421). A standalone cancelAnimate() — e.g. initThreeJS
    // re-init at :121, or lifecycle.ts:474 — would leave a pending focus
    // step() to fire against the stale/about-to-be-replaced camera+controls,
    // the exact M4/M7 hazard. Wiring it here covers both teardown paths.
    engineState.cameraControls?.cancelFocusCameraAnimation()
    // M8: abort canvas pointer listeners before the renderer/canvas are torn
    // down, so stale AbortController listeners don't survive across re-init.
    disposeCanvasNodeInteractionBindings()
    // H-2/H-3 (engine lifecycle bugsweep 2026-08-07): clear the camera-timer
    // orphans on cancel — the focus-transition settle timer (core:74-76) and
    // the auto-rotate resume timer (restore:118-121) are module-singleton
    // timeouts that otherwise fire post-teardown against nulled appState
    // refs (each HMR accumulated one pending dangling callback).
    engineState.cameraControls?.setFocusTransitionMode?.('idle')
    engineState.cameraControls?.clearAutoRotateResumeTimer?.()
    // Dispose all registered event listeners and timers via the central
    // registry.  Replaces the previous per-handler null-check dance.
    engineState.sceneRegistry?.disposeAll()
    engineState.sceneRegistry = null
    // Remove mapButton click listener (defensive cleanup)
    if (engineState.mapButtonClickHandler) {
        const mapBtn = document.querySelector('.webgl-fallback-map')
        if (mapBtn) {
            mapBtn.removeEventListener('click', engineState.mapButtonClickHandler as EventListener)
        }
        engineState.mapButtonClickHandler = null
    }
    const contextWasLost = engineState.webglContextLost
    engineState.webglContextLost = false
    const renderer = engineState.state?.renderer
    const scene = engineState.state?.scene
    const camera = engineState.state?.camera
    if (!contextWasLost && renderer && scene && camera) {
        try {
            renderer.render(scene, camera)
        } catch (error) {
            debugWarn('[three-engine] renderer.render failed (context likely lost):', error)
        }
    }
    if (engineState.state?.controls && typeof engineState.state.controls.dispose === 'function') {
        try {
            engineState.state.controls.dispose()
        } catch (error) {
            debugWarn('[three-engine] controls already disposed:', error)
        }
    }
    // Tear down the mycelium line layers here (not only in deinit) so the
    // webglContext.mycelium* handles are released on EVERY teardown path —
    // including cancelAnimate(), which initThreeJS() calls on re-init. Without
    // this, a stale mycelium group survives on webglContext across re-init and
    // only self-heals because createMycelium() calls disposeMycelium() first.
    disposeMyceliumPort()
    if (engineState.state) {
        engineState.state.scene = null
        engineState.state.camera = null
        engineState.state.controls = null
    }
    try {
        disposeObject3D(scene)
    } catch (error) {
        debugWarn('[three-engine] disposeObject3D already cleaned up:', error)
    }
    engineState.focusAnchor?.disposeFocusAnchorIndicator()
    // Dispose postprocessing composer BEFORE renderer.dispose() so the
    // composer's GL framebuffer/texture resources release cleanly while the
    // underlying WebGL context is still valid.
    try {
        engineState.ppModule?.disposePostProcessing()
    } catch (ppErr) {
        debugWarn('[three-engine] postprocessing dispose failed:', ppErr)
    }
    if (renderer) {
        renderer.dispose()
        // W53 WebGL-context leak fix: Three.js r163+ `dispose()` frees GPU
        // programs/buffers but does NOT force context loss. A renderer that is
        // only disposed (and whose refs are later nulled) leaves its GL context
        // counted as "active" by Chromium until garbage collection — so each
        // journey test that mounted the 3D canvas leaked one context, and the
        // suite hit Chrome's active-context ceiling (~16) and aborted around
        // test ~18 with "Too many active WebGL contexts" / context-creation
        // failure. forceContextLoss() calls WEBGL_lose_context.loseContext(),
        // which releases the context from the active pool on the same tick as
        // teardown. This is the canonical engine-teardown cleanup and must run
        // BEFORE the canvas is detached and the refs are nulled below.
        try {
            renderer.forceContextLoss()
        } catch (error) {
            debugWarn('[three-engine] forceContextLoss failed:', error)
        }
        const canvas = renderer.domElement
        try {
            canvas?.parentNode?.removeChild(canvas)
        } catch (error) {
            debugWarn('[three-engine] canvas already removed from DOM:', error)
        }
    }
    if (engineState.state) {
        engineState.state.renderer = null
        engineState.state.pointsMesh = null
        engineState.state.pointsMaterial = null
        engineState.state.nodeSporeMesh = null
        engineState.state.nodeSporeMaterial = null
    }
    webglContext.scene = null
    webglContext.camera = null
    webglContext.renderer = null
    webglContext.controls = null
    webglContext.pointsMesh = null
    webglContext.pointsMaterial = null
    webglContext.nodeSporeMesh = null
    webglContext.nodeSporeMaterial = null
    // Cancel any pending semantic-thread retry timer so it cannot fire a worker
    // load AFTER the engine has torn down (orphaned-timer leak). The timer id
    // lives on the legacy state object — the same singleton semantic-threads.ts
    // mutates — so clearing here keeps both teardown paths (cancelAnimate and
    // deinit→cancelAnimate) free of stale timers. engineState.state is null in
    // the unit-test mock, so this guard is a safe no-op there.
    const legacyState = engineState.state as unknown as {
        semanticThreadsRetryTimer?: ReturnType<typeof setTimeout> | null
    } | null
    if (legacyState && legacyState.semanticThreadsRetryTimer) {
        try {
            clearTimeout(legacyState.semanticThreadsRetryTimer)
        } catch {
            // clearTimeout on an already-fired/invalid id is a no-op; ignore.
        }
        legacyState.semanticThreadsRetryTimer = null
    }
    engineState.lastHoveredNode = null
    engineState.hoverEmissiveFlash = 0
    // Reset the camera-matrix snapshot so a fresh engine mount gets a
    // non-stale baseline (W49-H doc contract: "Reset by the dispose path").
    engineState.lastCameraSnapshot = null
    // Reset skip counters as well; otherwise a destroy→re-init cycle exposes
    // stale performance history and the first fresh frames inherit the old
    // consecutive-skip run.
    engineState.consecutiveSkippedFrames = 0
    engineState.renderSkipOpportunities = 0
    if (engineState.state?.scenePerformanceDiagnostics) {
        engineState.state.scenePerformanceDiagnostics.renderSkipOpportunities = 0
        engineState.state.scenePerformanceDiagnostics.consecutiveSkippedFrames = 0
    }
}

export function deinit() {
    cancelAnimate()
    // P1-1 / F2: invalidate restore retry machine on teardown — pending
    // retry timers, the watchdog, and in-flight init body settles become
    // no-ops against a torn-down engine.
    invalidateRestoreMachine()
    cancelOverviewCameraAnimation()
    engineState.cameraControls?.cancelFocusCameraAnimation()
    engineState.loadingUi?.cancelLoadingHide()
    engineState.threeSearchAnimations?.disposeHeroAnimation()
    if (engineState.state) {
        engineState.state.sceneRevealActive = false
        engineState.state.sceneRevealCameraStart = null
        engineState.state.sceneRevealCameraEnd = null
        if (engineState.state.inspectedStrandGroup) {
            engineState.state.inspectedStrandGroup = null
        }
    }
    disposeNodeVisualsPort()
    engineState.threeInteractionVisuals?.disposeInteractionVisuals()
    engineState.audioScape?.disposeAudio()
    disposeEventListeners()
    // Clean up dev-only window globals so stale getters aren't retained.
    if (typeof window !== 'undefined') {
        try {
            delete (window as unknown as { __semanticEngine?: unknown }).__semanticEngine
        } catch {
            // ignore
        }
    }
    // Reset module-cache flag so ensureModules() re-reads fresh references on
    // subsequent initThreeJS() calls (W1-M1).
    engineState.loaded = false
}
