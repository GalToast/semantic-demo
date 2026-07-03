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
import { Material, FogExp2 } from 'three'
import * as sceneRevealMod from './scene-reveal'
import type { NodePosition } from '@lib/state/state-types'
// LegacyState is imported from @lib/state/legacy-state (Phase 4, 2026-06-25)
// so it can be shared with legacy-state-adapter.ts without a circular import.
import type { LegacyState } from '@lib/state/legacy-state'
export type { LegacyState }
import { webglContext } from '@lib/engine/webgl-context'

import { sampleScenePerformance } from './renderer/renderer-diagnostics'
import { CONFIG } from '@lib/engine/config'
import { disposeObject3D } from '@lib/engine/resource-tracker'
import {
    compilePointMaterialForReadiness as compilePointMaterialForReadinessPort,
    createPoints as createPointsPort,
    disposeNodeVisuals as disposeNodeVisualsPort,
    SCENE_ATMOSPHERE as PORT_SCENE_ATMOSPHERE,
    setNodeSporeInstanceMatrix as setNodeSporeInstanceMatrixPort
} from '@lib/engine/node-manager'
import {
    createMycelium as createMyceliumPort,
    disposeMycelium as disposeMyceliumPort,
    getMyceliumPresentationProfile as getMyceliumPresentationProfilePort,
    getThreadPulseOpacity as getThreadPulseOpacityPort,
    shouldRenderThreads as shouldRenderThreadsPort
} from '@lib/engine/thread-manager'
// Postprocessing is dynamically imported to save ~150-200 kB from the main
// chunk. The module is only needed when premium mode is toggled ON.
import { engineState, ensureModules } from './three-engine-state'
import {
    computeRevealProgress,
    updatePointsMaterial,
    updateHoverEmissiveFlash,
    updateMyceliumPulse,
    updatePointsShaderHoverBoost
} from './three-engine-frame-updates'
import { scheduleNextAnimationFrame, yieldToBrowser, pauseRenderLoopTimers, setAnimateFn } from './three-engine-timers'
import { shouldSkipNextRender as shouldSkipNextRenderHelper } from './renderer/scene-static-tracker'
import { ensurePostProcessing } from './three-pp-init'
import { syncSceneHandles, syncPointsHandles, syncMyceliumHandles } from './three-store-sync'
import { easeOutQuint } from '@lib/utils/math-easing'
import { debugWarn, debugInfo, debugError } from '@lib/utils/debug'
import { isMobileViewport } from '@lib/utils/environment'
import { appState } from '@lib/state/app.svelte'
import { updateRouteTraceOverlayFrame, updateArrivalHandoffOverlayFrame } from '@lib/engine/journey-webgl-lazy'

export function updateCameraViewportOffset() {
    const camera = webglContext.camera || appState.camera
    if (!camera) return
    const width = window.innerWidth
    const height = window.innerHeight

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
}

export function cancelAnimate() {
    pauseRenderLoopTimers({ clearRestoreTimer: true })
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
    engineState.lastHoveredNode = null
    engineState.hoverEmissiveFlash = 0
}

export function deinit() {
    cancelAnimate()
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
    disposeMyceliumPort()
    engineState.threeInteractionVisuals?.disposeInteractionVisuals()
    engineState.audioScape?.disposeAudio()
    engineState.eventBindings?.disposeEventListeners()
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
        const _state = engineState.state
        const {
            revealed: revealProgress,
            points: pointsRevealProgress,
            camera: cameraRevealProgress
        } = computeRevealProgress(frameNow)

        let anyNodeMoved = false
        if (engineState.state?.nodePositions && engineState.state?.targetPositions) {
            const lerpFactor = engineState.state?.focusState?.nodesAreSettling ? 0.14 : 0.08
            engineState.state.nodePositions.forEach((pos: NodePosition, i: number) => {
                const target = engineState.state!.targetPositions[i]
                if (!target) return
                const dx = target.x - pos.x
                const dy = target.y - pos.y
                const dz = target.z - pos.z
                if (Math.abs(dx) > 0.0001 || Math.abs(dy) > 0.0001 || Math.abs(dz) > 0.0001) {
                    pos.x += dx * lerpFactor
                    pos.y += dy * lerpFactor
                    pos.z += dz * lerpFactor
                    setNodeSporeInstanceMatrixPort(i)
                    anyNodeMoved = true
                }
            })

            if (!engineState.state) return
            if (engineState.focusPocket?.applyFocusPocketBreathing(frameNow, engineState.state.nodePositions)) {
                engineState.state.focusPocketMotionByIndex.forEach((_motion: number, idx: number) => {
                    setNodeSporeInstanceMatrixPort(idx)
                })
                anyNodeMoved = true
            }

            if (anyNodeMoved) {
                if (webglContext.nodeSporeMesh) webglContext.nodeSporeMesh.instanceMatrix.needsUpdate = true
                if (engineState.state) engineState.state.myceliumDirty = true
            }
        }

        if (
            engineState.state?.sceneRevealActive &&
            engineState.state?.sceneRevealCameraStart &&
            engineState.state?.sceneRevealCameraEnd &&
            engineState.state?.focusedNode === null
        ) {
            webglContext.camera.position.lerpVectors(
                engineState.state.sceneRevealCameraStart,
                engineState.state.sceneRevealCameraEnd,
                cameraRevealProgress
            )
            if (webglContext.controls) {
                webglContext.controls.target.set(0, 0, 0)
            }
            if (revealProgress >= 1) {
                engineState.withStateMutation?.(() => {
                    if (!_state) return
                    _state.sceneRevealActive = false
                    _state.sceneRevealCameraStart = null
                    _state.sceneRevealCameraEnd = null
                })
                sceneRevealMod.setSceneRevealDataset(false)
                engineState.cameraControls?.scheduleAutoRotateResume(1200)
            }
        }

        updatePointsMaterial(pointsRevealProgress, engineState.state)

        if (webglContext.scene.fog && 'density' in webglContext.scene.fog) {
            ;(webglContext.scene.fog as FogExp2).density =
                (PORT_SCENE_ATMOSPHERE.fogDensity ?? 0.62) * pointsRevealProgress
        }

        // W48-T2: Entry moment — peak the reference sphere wireframe mid-reveal
        // so the first 2s of entry gives users a clear "structured network" cue,
        // then settle back to the steady-state 0.03 opacity. Sin curve: 0 → 0.05 → 0.
        const refSphere = webglContext.scene.getObjectByName('county-depth-reference') as
            | (import('three').Mesh & { material: import('three').MeshBasicMaterial })
            | undefined
        if (refSphere?.material) {
            const baseRefOpacity = 0.03
            const revealBoost = engineState.state?.sceneRevealActive ? Math.sin(revealProgress * Math.PI) * 0.05 : 0
            refSphere.material.opacity = baseRefOpacity + revealBoost
        }

        if (webglContext.nodeSporeMaterial) {
            const isSemanticDive =
                engineState.state?.semanticDiveMode === true || (engineState.state?.trailDepth ?? 0) >= 2
            const focusBoost = isSemanticDive ? 0.22 : 1.0
            const targetSporeOpacity = (PORT_SCENE_ATMOSPHERE.sporeOpacity ?? 0.5) * pointsRevealProgress * focusBoost
            webglContext.nodeSporeMaterial.opacity +=
                (targetSporeOpacity - webglContext.nodeSporeMaterial.opacity) * 0.12
        }

        const hoveredNode = engineState.state?.hoverHighlightIndex ?? -1
        const focusedNode = engineState.state?.focusedNode ?? null

        // ── Hover emissive flash (spore material) ───────────────────────────────
        updateHoverEmissiveFlash(engineState.state)

        const threadsVisible = updateMyceliumPulse(engineState.state)

        const threadRevealProgress = easeOutQuint(Math.min(1.0, Math.max(0.0, (pointsRevealProgress - 0.25) / 0.5)))
        const graphProfile = getMyceliumPresentationProfilePort() as ReturnType<
            typeof getMyceliumPresentationProfilePort
        >
        const semanticDiveThreadScale =
            engineState.state?.semanticDiveMode === true || (engineState.state?.trailDepth ?? 0) >= 2 ? 0.42 : 1
        if (threadsVisible) {
            if (webglContext.myceliumCoreLines)
                (webglContext.myceliumCoreLines.material as Material).opacity =
                    (getThreadPulseOpacityPort(
                        graphProfile.core,
                        Math.sin(engineState.state?.pulsePhase ?? 0),
                        graphProfile.pulse,
                        threadRevealProgress
                    ) ?? 0) * semanticDiveThreadScale
            if (webglContext.myceliumWispyLines)
                (webglContext.myceliumWispyLines.material as Material).opacity =
                    (getThreadPulseOpacityPort(
                        graphProfile.wispy,
                        Math.sin((engineState.state?.pulsePhase ?? 0) * 0.7),
                        graphProfile.pulse * 0.36,
                        threadRevealProgress
                    ) ?? 0) * semanticDiveThreadScale
            if (webglContext.myceliumBridgeLines)
                (webglContext.myceliumBridgeLines.material as Material).opacity =
                    (getThreadPulseOpacityPort(
                        graphProfile.bridge,
                        Math.sin((engineState.state?.pulsePhase ?? 0) * 0.45),
                        graphProfile.pulse * 0.28,
                        threadRevealProgress
                    ) ?? 0) * semanticDiveThreadScale
        } else {
            if (webglContext.myceliumCoreLines) (webglContext.myceliumCoreLines.material as Material).opacity = 0
            if (webglContext.myceliumWispyLines) (webglContext.myceliumWispyLines.material as Material).opacity = 0
            if (webglContext.myceliumBridgeLines) (webglContext.myceliumBridgeLines.material as Material).opacity = 0
        }

        updatePointsShaderHoverBoost(hoveredNode, engineState.state)

        if (sceneNeedsContinuous) {
            engineState.threeInteractionVisuals?.updateInteractionVisuals(frameNow, hoveredNode, focusedNode)
            engineState.threeSearchAnimations?.updateCorridorNodeGlow(frameNow)
            engineState.threeSearchAnimations?.updateSearchCorridorAnimation(frameNow)

            try {
                engineState.inspectedStrand?.updateInspectedStrandOverlayFrame(frameNow)
                updateRouteTraceOverlayFrame(frameNow)
                updateArrivalHandoffOverlayFrame(frameNow)
            } catch (overlayErr) {
                debugWarn('overlay update threw:', overlayErr)
            }
        }

        // Note: engineState.focusPocket.applyFocusPocketBreathing(...) is already called inside
        // the node-position lerp block above (around L951) where its boolean return
        // drives per-pocket instance-matrix updates. A second invocation here would
        // re-write pocket positions without ever pushing them to the GPU buffers,
        // doubling the per-frame breathing cost (50-200ms in QA). Removed per
        // W15-T1 focus-deadlock diagnosis (tmp/w15-focus-deadlock-diagnosis.md).

        if (sceneNeedsContinuous && shouldRenderThreadsPort()) {
            engineState.myceliumEngine?.updateMyceliumThreads()
        }
        if (sceneNeedsContinuous) {
            engineState.cameraControls?.applySemanticCentroidCamera(frameNow)
            engineState.clusterLabels?.updateClusterLabels()
        }

        const updateEnd = performance.now()
        const renderStart = performance.now()

        if (webglContext.renderer && webglContext.scene && webglContext.camera) {
            // W49-H: conditional render-skip instrumentation. The actual skip
            // is gated on engineState._canSkipRenders (a build-time flag
            // set in three-engine-timers; off by default so a future
            // developer can flip it on once the data justifies it). Until
            // then we COUNT how many ticks the helper says were skippable.
            // That count is what `renderSkipOpportunities` /
            // `consecutiveSkippedFrames` capture — they're the proof that
            // skipping is safe to enable for a given viewport.
            const camera = webglContext.camera
            const posArr = camera.position.toArray() as unknown as [number, number, number]
            const quatArr = camera.quaternion.toArray() as unknown as [number, number, number, number]
            const newSnapshot = {
                pos: [posArr[0], posArr[1], posArr[2]] as const,
                quat: [quatArr[0], quatArr[1], quatArr[2], quatArr[3]] as const
            }
            const skipCheck = shouldSkipNextRenderHelper(
                engineState.lastCameraSnapshot,
                newSnapshot,
                sceneNeedsContinuous
            )

            // Premium mode: render through EffectComposer. When premium mode is off
            // (or composer is not yet initialized), renderPostProcessing() returns
            // false and we fall through to the vanilla renderer.render() path.
            const pp = engineState.ppModule
            const renderedViaComposer = pp ? pp.renderPostProcessing() : false
            if (!renderedViaComposer) {
                webglContext.renderer.render(webglContext.scene, webglContext.camera)
            }

            // Always update the snapshot AFTER the render (so the next
            // frame has a baseline to compare against). Count the skip
            // opportunity regardless of whether the render is actually
            // skipped today — when the developer flips on the gate, the
            // counter is already accurate.
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
        }

        const renderEnd = performance.now()

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

// Wire animate callback into timers module (avoids circular import)
setAnimateFn(animate)
