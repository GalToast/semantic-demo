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
import { sceneNeedsContinuousFrame, sceneVisualsNeedRender } from './three-engine-helpers'
import { cameraControlsRestore } from '@lib/engine/camera-controls-restore.svelte.ts'
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
    clearScheduledFrameTasks,
    hasScheduledFrameTasks,
    runFrameTasks,
    setFrameSchedulerWake
} from './frame-scheduler'
import {
    shouldSkipNextRender as shouldSkipNextRenderHelper,
    type SceneStaticSnapshot
} from './renderer/scene-static-tracker'
import { ensurePostProcessing } from './three-pp-init'
import { syncSceneHandles, syncPointsHandles, syncMyceliumHandles } from './three-store-sync'
import { debugWarn, debugInfo, debugError } from '@lib/utils/debug'
import { isMobileViewport, prefersReducedMotion } from '@lib/utils/environment'
import { appState } from '@lib/state/app.svelte'
import { setEngineStatus } from '@lib/stores/engine.svelte.ts'
import { setGraphicsMode } from '@lib/data-store'
import {
    updateRouteTraceOverlayFrame,
    updateArrivalHandoffOverlayFrame,
    updateFocusSemanticOverlayFrame,
    syncFocusSemanticOverlayResolutionPort,
    updateFocusSemanticOverlayPositions
} from '@lib/engine/journey-webgl-lazy'
import { syncFocusPocketSizeMesh } from './focus-pocket-size-mesh'
import { removeWebGLFallbackNotice } from './renderer/webgl-fallback'

// ── WebGL restore retry escalation (render sweep 2026-08-07) ─────────────────

/** Retry counter for bounded context-restore re-init attempts. */
let _restoreRetryCount = 0
let _restoreRetryTimer: number | null = null
const _RESTORE_MAX_RETRIES = 2
const _RESTORE_BACKOFF_MS = [1000, 3000]
const _RESTORE_WATCHDOG_MS = 15000

/**
 * Generation token for the restore state machine (renderer-wave audit
 * 2026-08-07). Bumped by a manual re-init and by teardown so stale async
 * settles, backoff timers, and watchdog callbacks from a superseded cycle
 * become no-ops (they can no longer resurrect the loop or corrupt a scene
 * the manual init just built). Escalation deliberately does NOT bump it: a
 * late success from the in-flight attempt must still be able to reconcile
 * the breaker/status it tripped.
 */
let _restoreGeneration = 0
/** Per-cycle escalation guard — the toast + degraded transition fire once. */
let _restoreEscalated = false

function _armRestoreWatchdog() {
    if (typeof window === 'undefined') return
    const generation = _restoreGeneration
    if (engineState.webglRestoreTimer !== null) {
        window.clearTimeout(engineState.webglRestoreTimer)
    }
    engineState.webglRestoreTimer = window.setTimeout(() => {
        engineState.webglRestoreTimer = null
        // Stale watchdog (manual init / teardown superseded this cycle): no-op.
        if (generation !== _restoreGeneration) return
        debugError('[three-engine] WebGL restore watchdog expired — escalating to fallback')
        _escalateRestoreFailure()
    }, _RESTORE_WATCHDOG_MS)
}

function _clearRetryTimer() {
    if (_restoreRetryTimer !== null) {
        window.clearTimeout(_restoreRetryTimer)
        _restoreRetryTimer = null
    }
}

/**
 * Invalidate the entire restore retry machine — clears timers/watchdog, resets
 * counters, bumps the generation token. Idempotent; safe to call multiple times
 * across teardown paths (deinit → cancelAnimate + destroyEngine).
 */
function _resetRestoreMachine() {
    _clearRetryTimer()
    _restoreRetryCount = 0
    _restoreEscalated = false
    _restoreGeneration++
    if (engineState.webglRestoreTimer) {
        window.clearTimeout(engineState.webglRestoreTimer)
        engineState.webglRestoreTimer = null
    }
}

/**
 * Public teardown hook for lifecycle.ts → destroyEngine().
 * A pending retry timer must not fire 1-3s after the engine is destroyed
 * (P1-1: production teardown never invalidated the retry machine).
 */
export function invalidateRestoreMachine() {
    _resetRestoreMachine()
}

function _escalateRestoreFailure() {
    // Idempotent per cycle: the watchdog and the retry-exhaustion path can
    // both call this; the first one wins and the second becomes a no-op
    // (no duplicate toast / status transition).
    if (_restoreEscalated) return
    _restoreEscalated = true
    _restoreRetryCount = 0
    _clearRetryTimer()
    if (engineState.webglRestoreTimer) {
        window.clearTimeout(engineState.webglRestoreTimer)
        engineState.webglRestoreTimer = null
    }
    engineState.circuitBreakerTripped = true
    debugError('[three-engine] WebGL restore failed after all retries — falling back to degraded state')
    setEngineStatus('degraded')
    setGraphicsMode('fallback')
    // Honest wording: this module does not perform any map/fallback route
    // switch — it only degrades engine state. Reload is the real recovery.
    engineState.uiFeedback?.showExperienceToast(
        'Graphics unavailable',
        'The 3D view could not be restored. Reload the page to retry.'
    )
}

function _restoreReinitWithRetry() {
    const attemptGeneration = _restoreGeneration
    // Route through the internal init with an explicit restore marker — never
    // infer ownership from a mutable global, so a concurrent public
    // initThreeJS() while this awaits is always classified as a manual init.
    void initThreeJSInternal(true)
        .then((result) => {
            // Superseded by a manual re-init / teardown while we were building.
            if (attemptGeneration !== _restoreGeneration) return
            // initThreeJS returns false when buildThreeSceneOrFallback fails
            // (no GPU path available); treat as failure for retry purposes.
            if (result === false) {
                throw new Error('initThreeJS returned false (buildThreeSceneOrFallback failed)')
            }
            // Success — cycle complete. If the watchdog escalated while the
            // async restore was still building, the breaker was raised only by
            // that watchdog and the scene is now live, so clear it and restore
            // a truthful engine status (the earlier 'degraded' is stale).
            const wasEscalated = _restoreEscalated
            _restoreEscalated = false
            _restoreRetryCount = 0
            _clearRetryTimer()
            // P2-3: clear stale fallback notice from a prior failed attempt
            // whose N+1 retry succeeded (notice over a live 3D scene).
            removeWebGLFallbackNotice()
            if (wasEscalated) {
                engineState.circuitBreakerTripped = false
                setEngineStatus('ready')
                debugInfo('[three-engine] WebGL restore succeeded after watchdog escalation — reconciled state')
            }
        })
        .catch((err) => {
            debugError('[three-engine] WebGL restore re-init failed:', err)
            // Superseded by a manual re-init / teardown: never resurrect the loop.
            if (attemptGeneration !== _restoreGeneration) return
            // Already escalated (the watchdog gave up): do not re-arm retries
            // or emit a duplicate fallback toast.
            if (_restoreEscalated) return
            _restoreRetryCount++
            if (_restoreRetryCount <= _RESTORE_MAX_RETRIES) {
                const delay = _RESTORE_BACKOFF_MS[_restoreRetryCount - 1] ?? 3000
                debugWarn(`[three-engine] WebGL restore retry ${_restoreRetryCount}/${_RESTORE_MAX_RETRIES} in ${delay}ms`)
                _clearRetryTimer()
                const backoffGeneration = _restoreGeneration
                _restoreRetryTimer = window.setTimeout(() => {
                    _restoreRetryTimer = null
                    // Backoff was pending while a manual init / teardown
                    // superseded us — the re-arm must not fire.
                    if (backoffGeneration !== _restoreGeneration) return
                    // Re-arm the restore flag + watchdog for this retry attempt
                    engineState.webglNeedsRestoreReinit = true
                    _armRestoreWatchdog()
                    animate()
                }, delay)
            } else {
                _escalateRestoreFailure()
            }
        })
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

/**
 * Public entry — always a manual init. Restore-owned re-inits are routed
 * through {@link initThreeJSInternal} with an explicit restore marker, so the
 * machine never relies on a mutable global to prove ownership: a concurrent
 * public call while a restore-owned init is awaiting still invalidates the
 * pending generation and resets the retry budget.
 */
export async function initThreeJS(): Promise<boolean> {
    return initThreeJSInternal(false)
}

/**
 * @internal — shared init body. `isRestoreAttempt` is an explicit ownership
 * marker passed by the restore retry machine (`_restoreReinitWithRetry`).
 * A manual init (public API) always invalidates the prior restore generation,
 * clears the restore watchdog + backoff timer, and resets the retry budget
 * and escalation guard. Restore-owned attempts skip that invalidation so
 * retry progress survives across attempts within one cycle.
 */
async function initThreeJSInternal(isRestoreAttempt: boolean): Promise<boolean> {
    ensureModules()
    // T3-1: If the WebGL context was lost and restored, a full GPU resource
    // re-creation is needed. The C6 handler sets this flag; we log and
    // proceed with the full re-init (cancelAnimate disposes stale refs,
    // buildThreeScene creates a fresh renderer/context).
    if (engineState.webglNeedsRestoreReinit) {
        engineState.webglNeedsRestoreReinit = false
        debugWarn('[three-engine] WebGL context restored — triggering full re-init')
    }
    // Manual re-init supersedes any in-flight restore cycle: give a future
    // cycle a fresh retry budget, and invalidate stale attempt work (watchdog,
    // backoff timer, late settles) so it cannot resurrect the loop or degrade
    // a scene this init just built. Restore-attempt inits skip this — their
    // retry counter belongs to the machine and must survive across attempts.
    if (!isRestoreAttempt) {
        _restoreGeneration++
        _restoreEscalated = false
        _restoreRetryCount = 0
        _clearRetryTimer()
        if (engineState.webglRestoreTimer) {
            window.clearTimeout(engineState.webglRestoreTimer)
            engineState.webglRestoreTimer = null
        }
    }
    // P1-2: capture the generation token at init entry so the async body can
    // bail when teardown or a newer manual init superseded this attempt while
    // we were awaiting (yieldToBrowser gives the browser macrotask trampolines).
    // Only restore attempts need this — manual init already bumped generation
    // above, so its own gen is always current.
    const restoreGen = isRestoreAttempt ? _restoreGeneration : undefined
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
    // P1-2: teardown/manual-init may have fired while we awaited the scene build.
    if (restoreGen !== undefined && restoreGen !== _restoreGeneration) return false

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
    // P1-2: generation guard — bail before mutating handles with stale syncs.
    if (restoreGen !== undefined && restoreGen !== _restoreGeneration) return false

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
    // P1-2: generation guard — bail before stale mycelium creation.
    if (restoreGen !== undefined && restoreGen !== _restoreGeneration) return false

    // Await createMyceliumPort() so the 5 mycelium handles are populated in
    // webglContext BEFORE syncMyceliumHandles mirrors them into appState. This
    // was fire-and-forget; syncMyceliumHandles then read NULL, permanently
    // staling appState.myceliumGroup / Core/Wispy/BridgeLines even though the
    // lines rendered (the scene got them; the state mirror did not). createMycelium
    // is async (thread-manager.ts) and yields during buildSemanticMyceliumEdges —
    // a one-time init cost for a correct handle mirror at scene-ready.
    await createMyceliumPort()

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
    // P1-2: generation guard — bail before stale material compilation.
    if (restoreGen !== undefined && restoreGen !== _restoreGeneration) return false

    compilePointMaterialForReadinessPort()
    engineState.threeInteractionVisuals?.initSemanticLens()
    engineState.threeInteractionVisuals?.initSemanticManifold()
    updateCameraViewportOffset()

    // W8: yield before starting the render loop. The first frame() call
    // triggers shader compilation and uniform binding which can block.
    await yieldToBrowser()
    // P1-2: generation guard — teardown or a newer manual init may have fired
    // while we yielded; bail before starting the render loop (zombie-loop guard).
    if (restoreGen !== undefined && restoreGen !== _restoreGeneration) return false

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
            // W58-F3 liveness guard: the dynamic import (~150-200 kB) can
            // resolve across a context-loss/teardown/re-init window. The
            // `renderer`/`scene`/`camera` captured here are the locals for THIS
            // init; if a re-init has swapped them out, `engineState.state.renderer`
            // points at the new (live) renderer and the captured one is disposed
            // or about to be. Wrapping a disposed renderer in an EffectComposer
            // corrupts the next render, so bail and fall through to vanilla
            // renderer.render(). Each buildThreeScene creates a distinct
            // renderer object, so identity compare is a valid liveness signal.
            if (engineState.state?.renderer !== renderer) return
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

    // F2: restore succeeded — clear the watchdog
    if (engineState.webglRestoreTimer) {
        window.clearTimeout(engineState.webglRestoreTimer)
        engineState.webglRestoreTimer = null
    }

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

export function cancelAnimate() {
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
}

export function deinit() {
    cancelAnimate()
    // P1-1 / F2: invalidate restore retry machine on teardown — pending
    // retry timers, the watchdog, and in-flight init body settles become
    // no-ops against a torn-down engine.
    _resetRestoreMachine()
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

export function applyMapFlatteningLayout(enabled: boolean): void {
    engineState.mapFlattening?.applyMapFlatteningLayout(enabled)
}

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
