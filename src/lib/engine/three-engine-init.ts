/**
 * @lib/engine/three-engine-init.ts — Engine initialization orchestration
 *
 * Extracted from three-engine-core.ts. Owns the scene build → points →
 * mycelium → materials → postprocessing init sequence.
 */

import { engineState, ensureModules } from './three-engine-state'
import {
    buildThreeSceneOrFallback,
    applyReducedMotionGate,
    applyAutoRotateConfig,
    exposeDevEngineBridge
} from './three-engine-init-helpers'
import {
    compilePointMaterialForReadiness as compilePointMaterialForReadinessPort,
    createPoints as createPointsPort
} from '@lib/engine/node-manager'
import { createMycelium as createMyceliumPort } from '@lib/engine/thread-manager'
import { cancelAnimate } from './three-engine-teardown'
import { syncSceneHandles, syncPointsHandles, syncMyceliumHandles } from './three-store-sync'
import { registerContextListeners } from './three-listener-registration'
import { yieldToBrowser } from './three-engine-timers'
import { ensurePostProcessing } from './three-pp-init'
import { debugInfo, debugWarn } from '@lib/utils/debug'
import { isMobileViewport } from '@lib/utils/environment'
import { appState } from '@lib/state/app.svelte'
import { updateCameraViewportOffset, requestRenderLoopStart, markEngineInitPhase, animate } from './three-engine-core'
import { webglContext } from '@lib/engine/webgl-context'
import {
    setRestoreInitFn,
    resetRestoreMachineForManualInit,
    snapshotRestoreGeneration,
    isStaleRestoreGeneration
} from './three-engine-restore'

/**
 * Public entry — always a manual init. Restore-owned re-inits are routed
 * through {@link initThreeJSInternal} with an explicit restore marker, so the
 * machine never relies on a mutable global to prove ownership: a concurrent
 * public call while a restore-owned init is awaiting still invalidates the
 * pending generation and resets the retry budget.
 */
export async function initThreeJS(): Promise<boolean> {
    // Inject our init body into the restore retry machine once so restore-owned
    // re-inits drive the same scene rebuild (split-fidelity fix: the g101 split
    // dropped the setRestoreInitFn wiring; retries were silent no-ops).
    setRestoreInitFn(initThreeJSInternal)
    return initThreeJSInternal(false)
}

/**
 * @internal — shared init body. `isRestoreAttempt` is an explicit ownership
 * marker passed by the restore retry machine. A manual init (public API)
 * always invalidates the prior restore generation, clears the restore
 * watchdog + backoff timer, and resets the retry budget and escalation
 * guard. Restore-owned attempts skip that invalidation so retry progress
 * survives across attempts within one cycle.
 */
export async function initThreeJSInternal(isRestoreAttempt: boolean): Promise<boolean> {
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
        resetRestoreMachineForManualInit()
    }
    // P1-2: capture the generation token at init entry so the async body can
    // bail when teardown or a newer manual init superseded this attempt while
    // we were awaiting (yieldToBrowser gives the browser macrotask trampolines).
    // Only restore attempts need this — manual init already bumped generation
    // above, so its own gen is always current.
    const restoreGen = isRestoreAttempt ? snapshotRestoreGeneration() : undefined
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
    markEngineInitPhase('scene-ready')
    // P1-2: teardown/manual-init may have fired while we awaited the scene build.
    if (restoreGen !== undefined && isStaleRestoreGeneration(restoreGen)) return false

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
    if (restoreGen !== undefined && isStaleRestoreGeneration(restoreGen)) return false

    // Inline createPoints logic (was engineDelegates.createPoints) to avoid
    // circular dependency with three-engine-mycelium.
    createPointsPort()
    markEngineInitPhase('points-ready')

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
    if (restoreGen !== undefined && isStaleRestoreGeneration(restoreGen)) return false

    // Await createMyceliumPort() so the 5 mycelium handles are populated in
    // webglContext BEFORE syncMyceliumHandles mirrors them into appState. This
    // was fire-and-forget; syncMyceliumHandles then read NULL, permanently
    // staling appState.myceliumGroup / Core/Wispy/BridgeLines even though the
    // lines rendered (the scene got them; the state mirror did not). createMycelium
    // is async (thread-manager.ts) and yields during buildSemanticMyceliumEdges —
    // a one-time init cost for a correct handle mirror at scene-ready.
    markEngineInitPhase('mycelium-start')
    await createMyceliumPort()
    markEngineInitPhase('mycelium-ready')

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
    if (restoreGen !== undefined && isStaleRestoreGeneration(restoreGen)) return false

    compilePointMaterialForReadinessPort()
    markEngineInitPhase('material-ready')
    engineState.threeInteractionVisuals?.initSemanticLens()
    engineState.threeInteractionVisuals?.initSemanticManifold()
    updateCameraViewportOffset()

    // W8: yield before starting the render loop. The first frame() call
    // triggers shader compilation and uniform binding which can block.
    await yieldToBrowser()
    // P1-2: generation guard — teardown or a newer manual init may have fired
    // while we yielded; bail before starting the render loop (zombie-loop guard).
    if (restoreGen !== undefined && isStaleRestoreGeneration(restoreGen)) return false

    // Defer the first render until the lifecycle publishes readiness. A cold
    // shader compile can block the browser thread in headless/software WebGL;
    // running it inline here can trip the engine safety valve before lifecycle
    // readiness is published and leave the Svelte chrome permanently hidden.
    markEngineInitPhase('animate-pending')
    requestRenderLoopStart()

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

// Register the restore callback at module load as well as at the public entry
// point. A context-restore wake can reach `animate()` before the first manual
// init call, and the retry machine must not silently no-op in that window.
setRestoreInitFn(initThreeJSInternal)
