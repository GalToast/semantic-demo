/**
 * @lib/engine/three-engine-render-loop.ts — Render loop + frame helpers
 *
 * Extracted from three-engine-core.ts. Owns the animate() RAF loop and
 * its frame-tick helpers.
 */

import { engineState } from './three-engine-state'
import { webglContext } from '@lib/engine/webgl-context'
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
import { scheduleNextAnimationFrame, setAnimateFn } from './three-engine-timers'
import {
    hasScheduledFrameTasks,
    runFrameTasks,
    setFrameSchedulerWake
} from './frame-scheduler'
import {
    shouldSkipNextRender as shouldSkipNextRenderHelper,
    type SceneStaticSnapshot
} from './renderer/scene-static-tracker'
import {
    updateRouteTraceOverlayFrame,
    updateArrivalHandoffOverlayFrame,
    updateFocusSemanticOverlayFrame,
    updateFocusSemanticOverlayPositions
} from '@lib/engine/journey-webgl-lazy'
import { syncFocusPocketSizeMesh } from './focus-pocket-size-mesh'
import {
    updateMyceliumThreads as updateMyceliumThreadsPort,
    drainMyceliumDirtyState as drainMyceliumDirtyStatePort,
    shouldRenderThreads as shouldRenderThreadsPort
} from '@lib/engine/thread-manager'
import {
    _armRestoreWatchdog,
    _restoreReinitWithRetry
} from './three-engine-restore'

// ── Render loop ──────────────────────────────────────────────────────────────

export function animate() {
    // Cancel any pending RAF callback before clearing the id so a direct
    // animate() invocation (restartLoop from C6/C7) cannot clobber a pending
    // callback and create a double-RAF chain that cancelAnimate can't kill.
    if (engineState.rafId !== null) {
        window.cancelAnimationFrame(engineState.rafId)
    }
    engineState.rafId = null

    // T3-1: If the WebGL context was lost and restored, trigger a full
    // GPU resource re-creation. This check runs BEFORE _shouldSkipFrame()
    // because the C5 handler pauses the render loop (webglContextLost=true)
    // and the C6 handler calls restartLoop() to wake it. Without this early
    // check, _shouldSkipFrame() would return true (webglContextLost may still
    // be set) and the re-init would never fire.
    if (engineState.webglNeedsRestoreReinit) {
        engineState.webglNeedsRestoreReinit = false
        // F2 / P2-3: arm a bounded watchdog + retry escalation so a stuck
        // restore never leaves the engine permanently dead. Cleared by
        // initThreeJS on success, by _escalateRestoreFailure on final failure,
        // or by deinit on teardown.
        _armRestoreWatchdog()
        _restoreReinitWithRetry()
        return
    }

    // F4: bail before scheduling when engine handles are null (teardown).
    // A wake after teardown must not restart a self-sustaining zombie RAF loop.
    if (!webglContext.renderer || !webglContext.scene || !webglContext.camera) {
        return
    }

    // Schedule next frame FIRST so the RAF loop stays alive even when
    // _shouldSkipFrame() returns true (document hidden, view switched away
    // from 'galaxy', etc.). The skip check still gates the actual frame work.
    const sceneNeedsContinuous =
        sceneNeedsContinuousFrame(performance.now(), engineState.state, cameraControlsRestore.autoRotateResumeDueAt) ||
        hasScheduledFrameTasks()
    scheduleNextAnimationFrame(sceneNeedsContinuous)

    if (_shouldSkipFrame()) {
        return
    }
    // _shouldSkipFrame() already verified state?.currentView, but TS can't
    // narrow across the function boundary. Re-capture for the rest of the frame.
    const state = engineState.state
    if (!state) return

    try {
        const frameStart = performance.now()
        const frameNow = frameStart
        // Camera/search choreography runs in this engine-owned frame before
        // controls, interaction visuals, and the renderer consume the state.
        runFrameTasks(frameNow)
        const sceneFrameMs = engineState.state?.scenePerformanceDiagnostics?.lastFrameAt
            ? Math.min(250, Math.max(0, frameNow - engineState.state.scenePerformanceDiagnostics.lastFrameAt))
            : 0
        engineState.withStateMutation?.(() => {
            if (engineState.state?.scenePerformanceDiagnostics)
                engineState.state.scenePerformanceDiagnostics.lastFrameAt = frameNow
        })

        engineState.cameraControls?.updateAutoRotateSoftResume(frameNow)
        engineState.cameraControls?.focusCameraAssistIsActive(frameNow)
        if (webglContext.controls) {
            webglContext.controls.update()
        }

        const updateStart = performance.now()
        const {
            revealed: revealProgress,
            points: pointsRevealProgress,
            camera: cameraRevealProgress
        } = computeRevealProgress(frameNow)

        const nodeMotionStart = performance.now()
        if (lerpNodesForFrame(frameNow)) return

        const nodeMotionEnd = performance.now()

        _tickRevealAndParticles(cameraRevealProgress, revealProgress, pointsRevealProgress, frameNow)

        const hoveredNode = engineState.state?.hoverHighlightIndex ?? -1
        const focusedNode = engineState.state?.focusedNode ?? null

        const overlayUpdateMs = tickInteraction(
            frameNow,
            hoveredNode,
            focusedNode,
            sceneNeedsContinuous,
            pointsRevealProgress
        )

        const threadUpdateMs = tickThreads(sceneNeedsContinuous)
        if (sceneNeedsContinuous) {
            engineState.cameraControls?.applySemanticCentroidCamera(frameNow)
            engineState.clusterLabels?.updateClusterLabels()
        }

        const updateEnd = performance.now()
        const renderStart = performance.now()
        const renderEnd = tickRenderAndPerf(frameNow, sceneFrameMs, sceneNeedsContinuous)
        sampleScenePerformance(
            sceneFrameMs,
            {
                updateMs: updateEnd - updateStart,
                renderMs: renderEnd - renderStart,
                nodeMotionMs: nodeMotionEnd - nodeMotionStart,
                overlayUpdateMs,
                threadUpdateMs
            },
            state
        )
    } catch (err) {
        debugError('[three-engine] Unhandled exception in animate loop:', err)
        engineState.circuitBreakerTripped = true
    }
}

function _shouldSkipFrame(): boolean {
    if (engineState.circuitBreakerTripped) return true
    if (engineState.webglContextLost) return true
    // Pause the steady-state RAF loop when the document is not visible.
    // This lets Lighthouse find an idle period so the perf score becomes
    // measurable. The loop resumes via the visibilitychange listener
    // registered in initThreeJS.
    if (typeof document !== 'undefined' && document.hidden) return true
    if (!webglContext.renderer || !webglContext.scene || !webglContext.camera) return true
    if (engineState.state?.currentView !== 'galaxy') return true
    return false
}

function _tickRevealAndParticles(
    cameraRevealProgress: number,
    revealProgress: number,
    pointsRevealProgress: number,
    frameNow?: number
): void {
    const state = engineState.state
    if (!state) return
    lerpCameraForReveal(cameraRevealProgress, revealProgress, state)
    updatePointsMaterial(pointsRevealProgress, state, frameNow)
    updateFogDensity(pointsRevealProgress)
    updateReferenceSphereOpacity(revealProgress, state?.sceneRevealActive)
    updateSporeOpacity(pointsRevealProgress, state)
}

function tickInteraction(
    frameNow: number,
    hoveredNode: number,
    focusedNode: number | null,
    sceneNeedsContinuous: boolean,
    pointsRevealProgress: number
): number {
    const state = engineState.state
    updateHoverEmissiveFlash(state)
    const threadsVisible = updateMyceliumPulse(state)
    updateThreadLayerOpacities(threadsVisible, pointsRevealProgress, state)
    updatePointsShaderHoverBoost(hoveredNode, state)
    if (!sceneNeedsContinuous) return 0

    engineState.threeInteractionVisuals?.updateInteractionVisuals(frameNow, hoveredNode, focusedNode)
    engineState.threeSearchAnimations?.updateCorridorNodeGlow(frameNow)
    engineState.threeSearchAnimations?.updateSearchCorridorAnimation(frameNow)
    const overlayStart = performance.now()
    try {
        engineState.inspectedStrand?.updateInspectedStrandOverlayFrame(frameNow)
        updateRouteTraceOverlayFrame(frameNow)
        updateArrivalHandoffOverlayFrame(frameNow)
        updateFocusSemanticOverlayFrame(frameNow)
        updateFocusSemanticOverlayPositions(frameNow)
        syncFocusPocketSizeMesh()
    } catch (overlayErr) {
        debugWarn('overlay update threw:', overlayErr)
    }
    return performance.now() - overlayStart
}

function tickThreads(sceneNeedsContinuous: boolean): number {
    if (!sceneNeedsContinuous) return 0

    const threadStart = performance.now()
    if (shouldRenderThreadsPort()) {
        updateMyceliumThreadsPort()
    } else {
        drainMyceliumDirtyStatePort()
    }
    return performance.now() - threadStart
}

function tickRenderAndPerf(frameNow: number, sceneFrameMs: number, sceneNeedsContinuous: boolean): number {
    if (!(webglContext.renderer && webglContext.scene && webglContext.camera)) {
        return performance.now()
    }
    const camera = webglContext.camera!
    const posArr = camera.position.toArray() as unknown as [number, number, number]
    const quatArr = camera.quaternion.toArray() as unknown as [number, number, number, number]
    const newSnapshot: SceneStaticSnapshot = {
        cameraPos: [posArr[0], posArr[1], posArr[2]] as const,
        cameraQuat: [quatArr[0], quatArr[1], quatArr[2], quatArr[3]] as const
    }
    const reducedMotionPref = prefersReducedMotion()
    const visualsNeedRender = sceneVisualsNeedRender(
        sceneNeedsContinuous,
        reducedMotionPref,
        engineState.hoverEmissiveFlash
    )
    const skipCheck = shouldSkipNextRenderHelper(engineState.lastCameraSnapshot, newSnapshot, visualsNeedRender)
    if (!skipCheck.shouldSkip) {
        const pp = engineState.ppModule
        const renderedViaComposer = pp ? pp.renderPostProcessing() : false
        if (!renderedViaComposer) {
            webglContext.renderer.render(webglContext.scene, webglContext.camera)
        }
    }
    engineState.lastCameraSnapshot = newSnapshot
    if (skipCheck.shouldSkip) {
        engineState.renderSkipOpportunities += 1
        engineState.consecutiveSkippedFrames += 1
    } else {
        engineState.consecutiveSkippedFrames = 0
    }
    engineState.withStateMutation?.(() => {
        if (!engineState.state?.scenePerformanceDiagnostics) return
        engineState.state.scenePerformanceDiagnostics.drawCalls = webglContext.renderer!.info.render.calls
        engineState.state.scenePerformanceDiagnostics.triangles = webglContext.renderer!.info.render.triangles
        engineState.state.scenePerformanceDiagnostics.renderSkipOpportunities = engineState.renderSkipOpportunities
        engineState.state.scenePerformanceDiagnostics.consecutiveSkippedFrames = engineState.consecutiveSkippedFrames
    })
    return performance.now()
}

// Wire animate callback into timers module (avoids circular import)
setAnimateFn(animate)
// Choreography tasks wake the existing engine loop; they never create a second
// RAF chain of their own.
setFrameSchedulerWake(() => scheduleNextAnimationFrame(true))
