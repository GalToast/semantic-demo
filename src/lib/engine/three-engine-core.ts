/**
 * @lib/engine/three-engine-core.ts — Core lifecycle & render loop
 *
 * Scene initialization, render loop, teardown, and camera management.
 * State is managed via the singleton `engineState` imported from
 * three-engine-state.ts (Phase 0 decomposition).
 *
 * Extracted from three-engine.ts (W47 decomposition). Public API is
 * re-exported through the barrel three-engine.ts — consumers should not
 * import this file directly.
 */

// ── Static @lib/* imports ────────────────────────────────────────────────────

import { registerContextListeners } from './three-listener-registration'
import {
    buildThreeSceneOrFallback,
    applyReducedMotionGate,
    applyAutoRotateConfig,
    exposeDevEngineBridge
} from './three-engine-init-helpers'
import { sceneNeedsContinuousFrame } from './three-engine-helpers'
// LegacyState is imported from @lib/state/legacy-state (Phase 4, 2026-06-25)
// so it can be shared with legacy-state-adapter.ts without a circular import.
import type { LegacyState } from '@lib/state/legacy-state'
export type { LegacyState }
import { webglContext } from '@lib/engine/webgl-context'
import { disposeEventListeners } from '@lib/ui/global-bindings'
import { cancelOverviewCameraAnimation } from '@lib/demo/camera'
import { disposeCanvasNodeInteractionBindings } from '@lib/journey/canvas-interaction'
import { cancelRouteAnimations } from '@lib/engine/camera-choreography/routes'

import { sampleScenePerformance } from './renderer/renderer-diagnostics'
import { disposeObject3D } from '@lib/engine/resource-tracker'
import {
    compilePointMaterialForReadiness as compilePointMaterialForReadinessPort,
    createPoints as createPointsPort,
    disposeNodeVisuals as disposeNodeVisualsPort
} from '@lib/engine/node-manager'
import {
    createMycelium as createMyceliumPort,
    disposeMycelium as disposeMyceliumPort,
    updateMyceliumThreads as updateMyceliumThreadsPort,
    drainMyceliumDirtyState as drainMyceliumDirtyStatePort,
    syncMyceliumLineResolution as syncMyceliumLineResolutionPort,
    shouldRenderThreads as shouldRenderThreadsPort
} from '@lib/engine/thread-manager'
// Postprocessing is dynamically imported to save ~150-200 kB from the main
// chunk. The module is only needed when premium mode is toggled ON.
import { engineState, ensureModules } from './three-engine-state'
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
import { scheduleNextAnimationFrame, yieldToBrowser, pauseRenderLoopTimers, setAnimateFn } from './three-engine-timers'
import {
    shouldSkipNextRender as shouldSkipNextRenderHelper,
    type SceneStaticSnapshot
} from './renderer/scene-static-tracker'
import { ensurePostProcessing } from './three-pp-init'
import { syncSceneHandles, syncPointsHandles, syncMyceliumHandles } from './three-store-sync'
import { debugWarn, debugInfo, debugError } from '@lib/utils/debug'
import { isMobileViewport } from '@lib/utils/environment'
import { appState } from '@lib/state/app.svelte'
import {
    updateRouteTraceOverlayFrame,
    updateArrivalHandoffOverlayFrame,
    updateFocusSemanticOverlayFrame,
    syncFocusSemanticOverlayResolutionPort,
    updateFocusSemanticOverlayPositions
} from '@lib/engine/journey-webgl-lazy'
import { syncFocusPocketSizeMesh } from './focus-pocket-size-mesh'

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
}

export async function initThreeJS() {
    ensureModules()
    cancelAnimate()

    // Reset circuit breaker so a fresh init can start the loop even if a
    // previous animate() iteration tripped it.
    engineState.circuitBreakerTripped = false

    const container = document.getElementById('canvas-container')
    if (!container) throw new Error('initThreeJS: #canvas-container element not found in DOM')

    const width = container.clientWidth || window.innerWidth
    const height = container.clientHeight || window.innerHeight

    const sceneResult = await buildThreeSceneOrFallback(
        container,
        width,
        height,
        (handler) => {
            engineState.mapButtonClickHandler = handler
        },
        {
            state: engineState.state,
            viewController: engineState.viewController,
            mapState: engineState.mapState,
            uiFeedback: engineState.uiFeedback
        }
    )
    if (!sceneResult.success) {
        return false
    }

    const { scene, camera, renderer, controls, hemiLight, dirLight } = sceneResult.setup

    // C3 — multi-store handle mirror (webglContext + appState + legacyState + engineState.state)
    syncSceneHandles({ scene, camera, renderer, controls, hemiLight, dirLight })

    // C4 — Clean up any previous init cycle's registry before creating a fresh one.
    engineState.sceneRegistry?.disposeAll()

    // C5-C7/C10 — register all DOM/Three.js event listeners in a single
    // DisposableRegistry (extracted to three-listener-registration.ts).
    engineState.sceneRegistry = registerContextListeners({
        renderer,
        controls,
        restartLoop: animate
    })

    applyReducedMotionGate(engineState.state, appState)
    applyAutoRotateConfig(controls, engineState.state, appState)

    // W8: yield before heavy geometry/buffer work to break the init long task.
    // createPoints() uploads 8,406 × 3 floats + 8,406 × 16 instance matrices;
    // createMycelium() uploads 100,872 edge line segments. Both are O(n)
    // synchronous work that benefits from interleaved yield.
    await yieldToBrowser()

    // Inline createPoints logic (was engineDelegates.createPoints) to avoid
    // circular dependency with three-engine-mycelium.
    createPointsPort()

    // C11 — points/spore handle mirror (webglContext → appState + engineState.state)
    syncPointsHandles({
        pointsMesh: webglContext.pointsMesh,
        pointsMaterial: webglContext.pointsMaterial,
        nodeSporeMesh: webglContext.nodeSporeMesh,
        nodeSporeMaterial: webglContext.nodeSporeMaterial
    })

    // W8: yield between createPoints() and createMycelium() to keep individual
    // tasks under 200ms. createMycelium() uploads 100k+ edge line segments.
    await yieldToBrowser()

    createMyceliumPort()

    // C12 — mycelium handle mirror (webglContext → appState + legacyState + engineState.state)
    syncMyceliumHandles({
        myceliumGroup: webglContext.myceliumGroup,
        myceliumCoreLines: webglContext.myceliumCoreLines,
        myceliumWispyLines: webglContext.myceliumWispyLines,
        myceliumBridgeLines: webglContext.myceliumBridgeLines,
        myceliumConnectionPairs: webglContext.myceliumConnectionPairs
    })

    // W8: yield after mycelium buffer upload (100k+ edges) before the
    // material compilation and visual setup phases.
    await yieldToBrowser()

    compilePointMaterialForReadinessPort()
    engineState.threeInteractionVisuals?.initSemanticLens()
    engineState.threeInteractionVisuals?.initSemanticManifold()
    updateCameraViewportOffset()

    // W8: yield before starting the render loop. The first frame() call
    // triggers shader compilation and uniform binding which can block.
    await yieldToBrowser()

    // Start the render loop explicitly. The new Svelte lifecycle no longer
    // receives the legacy DOM scene-ready path, and without this the renderer
    // exposes a populated scene but never issues its first draw.
    animate()

    // Postprocessing composer: wraps renderer/scene/camera in an EffectComposer
    // (vignette + chromatic aberration + bloom + DOF). Effects stay disabled
    // until premium mode is toggled on via the body data-attribute. The
    // composer's render path is invoked from the animate loop below; if
    // premium mode is off, the loop falls through to vanilla renderer.render().
    //
    // Gated on mobile: postprocessing adds 80+ KB and heavy GPU passes that
    // are unnecessary on small viewports. The vanilla renderer.render() path
    // is used instead.
    if (!isMobileViewport()) {
        ensurePostProcessing(engineState).then((pp) => {
            try {
                pp.initPostProcessing(renderer, scene, camera)
            } catch (ppErr) {
                debugWarn('[three-engine] postprocessing init failed, vanilla render will be used:', ppErr)
            }
        })
    } else {
        // W46-A: Mark the intentional mobile performance path so tests and
        // future UI can detect it without relying on console text.
        if (typeof document !== 'undefined' && document.body) {
            document.body.dataset.postprocessing = 'skipped'
        }
        debugInfo('[three-engine] postprocessing skipped on mobile viewport (performance mode)')
    }

    exposeDevEngineBridge()

    return true
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
    engineState.ppModule?.resizePostProcessing(width, height)
    // Keep LineMaterial.resolution in sync with the drawing buffer so the
    // mycelium linewidth shader renders thin filaments, not fat bands.
    syncMyceliumLineResolutionPort()
    // Sync the focus semantic overlay resolution too — a resize while focused
    // would otherwise leave the overlay linewidth shader at the old size.
    syncFocusSemanticOverlayResolutionPort()
}

export function cancelAnimate() {
    pauseRenderLoopTimers({ clearRestoreTimer: true })
    // M4/M7: cancel any pending route animation rAFs before the renderer/canvas
    // are torn down, so a pending step() won't fire against nulled camera/controls.
    cancelRouteAnimations()
    // M8: abort canvas pointer listeners before the renderer/canvas are torn
    // down, so stale AbortController listeners don't survive across re-init.
    disposeCanvasNodeInteractionBindings()
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
}

export function deinit() {
    cancelAnimate()
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
    // Reset module-cache flag so ensureModules() re-reads fresh references on
    // subsequent initThreeJS() calls (W1-M1).
    engineState.loaded = false
}

export function applyMapFlatteningLayout(enabled: boolean): void {
    engineState.mapFlattening?.applyMapFlatteningLayout(enabled)
}

export function animate() {
    // Clear the RAF id at the start of every callback so book-keeping
    // stays correct across frames. Without this, the first scheduled
    // callback would see engineState.rafId != null and exit, killing the loop.
    engineState.rafId = null

    if (engineState.circuitBreakerTripped) {
        return
    }
    if (engineState.webglContextLost) {
        return
    }
    // Pause the steady-state RAF loop when the document is not visible.
    // This lets Lighthouse find an idle period so the perf score becomes
    // measurable.  The loop resumes via the visibilitychange listener
    // registered in initThreeJS.
    if (typeof document !== 'undefined' && document.hidden) {
        return
    }
    if (!webglContext.renderer || !webglContext.scene || !webglContext.camera) {
        return
    }
    if (engineState.state?.currentView !== 'galaxy' && !engineState.state?.forceAnimate) {
        return
    }

    try {
        const frameStart = performance.now()
        const frameNow = frameStart
        const sceneNeedsContinuous = sceneNeedsContinuousFrame(frameNow, engineState.state)
        scheduleNextAnimationFrame(sceneNeedsContinuous)
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

        if (lerpNodesForFrame(frameNow)) return

        lerpCameraForReveal(cameraRevealProgress, revealProgress, engineState.state)
        updatePointsMaterial(pointsRevealProgress, engineState.state)
        updateFogDensity(pointsRevealProgress)
        updateReferenceSphereOpacity(revealProgress, engineState.state?.sceneRevealActive)
        updateSporeOpacity(pointsRevealProgress, engineState.state)

        const hoveredNode = engineState.state?.hoverHighlightIndex ?? -1
        const focusedNode = engineState.state?.focusedNode ?? null

        tickInteraction(frameNow, hoveredNode, focusedNode, sceneNeedsContinuous, pointsRevealProgress)
        tickThreads(sceneNeedsContinuous)
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
                renderMs: renderEnd - renderStart
            },
            engineState.state
        )
    } catch (err) {
        debugError('[three-engine] Unhandled exception in animate loop:', err)
        engineState.circuitBreakerTripped = true
    }
}

function tickInteraction(
    frameNow: number,
    hoveredNode: number,
    focusedNode: number | null,
    sceneNeedsContinuous: boolean,
    pointsRevealProgress: number
): void {
    const state = engineState.state
    updateHoverEmissiveFlash(state)
    const threadsVisible = updateMyceliumPulse(state)
    updateThreadLayerOpacities(threadsVisible, pointsRevealProgress, state)
    updatePointsShaderHoverBoost(hoveredNode, state)
    if (sceneNeedsContinuous) {
        engineState.threeInteractionVisuals?.updateInteractionVisuals(frameNow, hoveredNode, focusedNode)
        engineState.threeSearchAnimations?.updateCorridorNodeGlow(frameNow)
        engineState.threeSearchAnimations?.updateSearchCorridorAnimation(frameNow)
        try {
            engineState.inspectedStrand?.updateInspectedStrandOverlayFrame(frameNow)
            updateRouteTraceOverlayFrame(frameNow)
            updateArrivalHandoffOverlayFrame(frameNow)
            updateFocusSemanticOverlayFrame(frameNow)
            updateFocusSemanticOverlayPositions()
            syncFocusPocketSizeMesh()
        } catch (overlayErr) {
            debugWarn('overlay update threw:', overlayErr)
        }
    }
}

function tickThreads(sceneNeedsContinuous: boolean): void {
    if (sceneNeedsContinuous && shouldRenderThreadsPort()) {
        updateMyceliumThreadsPort()
    } else if (sceneNeedsContinuous) {
        drainMyceliumDirtyStatePort()
    }
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
    const skipCheck = shouldSkipNextRenderHelper(engineState.lastCameraSnapshot, newSnapshot, sceneNeedsContinuous)
    const pp = engineState.ppModule
    const renderedViaComposer = pp ? pp.renderPostProcessing() : false
    if (!renderedViaComposer) {
        webglContext.renderer.render(webglContext.scene, webglContext.camera)
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
