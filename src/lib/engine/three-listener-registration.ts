/**
 * @lib/engine/three-listener-registration.ts — Context/DOM/Three.js event listener registration
 *
 * Extracted from `three-engine-core.ts` during W50 Phase 5b
 * (initThreeJS listener-registration blocks C4, C5, C6, C7, C10).
 *
 * Centralises registration of all DOM/Three.js event listeners into a
 * single `DisposableRegistry` lifetime, making leaks structurally
 * impossible.
 *
 * References:
 *   - docs/three-engine-decomposition-plan.md §5 (Phase 5b — C4/C5/C6/C7/C10)
 */

import { DisposableRegistry } from '@lib/utils/disposable-registry'
import { CONFIG } from '@lib/engine/config'
import { engineState, type ThreeEngineState } from './three-engine-state'
import { webglContext, type WebGLContextState } from '@lib/engine/webgl-context'
import { pauseRenderLoopTimers } from './three-engine-timers'
import { cancelRouteAnimations } from '@lib/engine/camera-choreography/routes'
import { debugError } from '@lib/utils/debug'
import { releaseRestoreOwnership, takeRestoreOwnership } from './webgl-restore-ownership'
import type { WebGLRenderer } from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

// ── Contracts ────────────────────────────────────────────────────────────────

export interface RegisterContextListenersInput {
    renderer: WebGLRenderer
    controls: OrbitControls
    restartLoop: () => void
    registry?: DisposableRegistry
}

export interface RegisterContextListenersSinks {
    engineState: Pick<
        ThreeEngineState,
        | 'webglContextLost'
        | 'webglNeedsRestoreReinit'
        | 'webglRestoreTimer'
        | 'webglRestore'
        | 'rafId'
        | 'idleFrameTimerId'
        | 'circuitBreakerTripped'
        | 'uiFeedback'
        | 'cameraControls'
    >
    webglContext: Pick<WebGLContextState, 'renderer' | 'scene' | 'camera'>
    document: Document
    windowObj: Window & typeof globalThis
    pauseRenderLoopTimers: (options?: { clearRestoreTimer?: boolean }) => void
    debugError: (msg: string, err?: unknown) => void
    cameraAssistMs: number
}

// ── Default sink factory ─────────────────────────────────────────────────────

function defaultSinks(): RegisterContextListenersSinks {
    return {
        engineState,
        webglContext,
        document: globalThis.document,
        windowObj: globalThis.window,
        pauseRenderLoopTimers,
        debugError,
        cameraAssistMs: CONFIG.AUTO_ROTATE_MANUAL_IDLE_MS
    }
}

// ── Main entry ───────────────────────────────────────────────────────────────

/**
 * Register all DOM and Three.js event listeners for the engine in a
 * single `DisposableRegistry`.
 *
 * Creates a fresh `DisposableRegistry` with label `'three-engine'` and
 * registers the C5/C6/C7/C10 listeners on it.  Returns the registry so
 * the caller can store it (previously `engineState.sceneRegistry`).
 *
 * @param input — renderer, controls, and the `restartLoop` callback (animate)
 * @param sinks — injectable bundle for tests; defaults to project singletons
 * @returns the registry that owns every registered listener
 *
 * Plan reference: docs/three-engine-decomposition-plan.md §5 (Phase 5b)
 */
export function registerContextListeners(
    input: RegisterContextListenersInput,
    sinks: RegisterContextListenersSinks = defaultSinks()
): DisposableRegistry {
    const { renderer, controls, restartLoop } = input
    const registry = input.registry ?? new DisposableRegistry({ label: 'three-engine' })
    const canvas = renderer.domElement

    // Claim ownership of the paired context lost/restored listeners. A fresh
    // engine registry may replace an app-init fallback, but it must not stack
    // another engine listener set on a canvas already owned by a live registry.
    const owned = takeRestoreOwnership(canvas, registry)
    if (!owned) {
        sinks.debugError('[three-engine] Restore ownership already claimed for this canvas')
        // Restore, visibility, and control listeners are one engine-owned set.
        // A duplicate registry must not retain a partial listener set while the
        // original registry remains authoritative for this canvas.
        return registry
    }

    const listen = (
        target: EventTarget,
        type: string,
        handler: EventListener,
        options?: EventListenerOptions | boolean
    ): void => {
        target.addEventListener(type, handler, options)
        registry.listener(target, type, handler, options)
    }

    // C5 — WebGL context lost
    listen(canvas, 'webglcontextlost', (event: Event) => {
        event.preventDefault()
        sinks.engineState.webglContextLost = true
        sinks.pauseRenderLoopTimers({ clearRestoreTimer: true })
        sinks.engineState.uiFeedback?.showExperienceToast('Graphics connection lost', 'Re-establishing 3D scene...')
    })

    // C6 — WebGL context restored (moved from app-init.ts H1 fix Jul-10)
    // H1 root cause: app-init queried #engine-canvas (removed by scene-init)
    // and attached restored there, so real context restores on renderer.domElement
    // never fired. The owning registry handles BOTH C5+C6 on this canvas.
    listen(canvas, 'webglcontextrestored', () => {
        sinks.engineState.webglContextLost = false
        // T3-1: Signal that a full GPU resource re-creation is needed.
        // WebGL context loss invalidates ALL GPU resources (buffers,
        // textures, shader programs). Resetting the flag alone leaves the
        // scene blank. The orchestration layer (initThreeJS) checks this
        // flag and triggers a full re-init.
        sinks.engineState.webglNeedsRestoreReinit = true
        sinks.debugError('[three-engine] WebGL context restored — full re-initialization required')
        // T3-1: Wake the render loop so animate() can check the flag
        // and call initThreeJS() for the full re-init. The C5 handler
        // paused the loop via pauseRenderLoopTimers(); restartLoop() (which
        // is animate) runs once and checks webglNeedsRestoreReinit BEFORE
        // _shouldSkipFrame(), so the re-init fires even though the loop was
        // paused.
        restartLoop()
    })

    // Release ownership when this registry is disposed.
    registry.add(() => releaseRestoreOwnership(canvas, registry))

    // C7 — document visibility change
    listen(sinks.document, 'visibilitychange', () => {
        if (
            !sinks.document.hidden &&
            sinks.engineState.rafId === null &&
            sinks.engineState.idleFrameTimerId === null &&
            !sinks.engineState.webglContextLost &&
            !sinks.engineState.circuitBreakerTripped &&
            sinks.webglContext.renderer &&
            sinks.webglContext.scene &&
            sinks.webglContext.camera
        ) {
            restartLoop()
        }
    })

    // C10 — OrbitControls start/end
    listen(controls as unknown as EventTarget, 'start', () => {
        // P1-3 (fleet 0731 sweep 2026-08-07): a user drag/zoom must cancel an
        // in-flight route tween (search-corridor / centroid), otherwise the tween's
        // per-frame writes fight the gesture for its full 1.6s duration.
        cancelRouteAnimations()
        sinks.engineState.cameraControls?.releaseFocusCameraAssist('user-control')
        sinks.engineState.cameraControls?.noteSceneInteraction(sinks.cameraAssistMs)
    })
    listen(controls as unknown as EventTarget, 'end', () => {
        sinks.engineState.cameraControls?.scheduleAutoRotateResume(sinks.cameraAssistMs)
    })

    return registry
}
