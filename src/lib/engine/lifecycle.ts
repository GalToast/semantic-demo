/**
 * @lib/engine/lifecycle.ts — Canonical engine lifecycle module
 *
 * Single source of truth for engine init, resize, and destroy.
 * Replaces the lifecycle methods from src/lib/engine/adapters/lifecycle-bridge.ts
 * with a self-contained module that does not depend on BridgeContext.
 *
 * Bug fixes over the bridge:
 *   FIX #1 (resize): Added missing resizePostProcessing() call
 *
 * Public API:
 *   initEngine, resizeEngine, destroyEngine, getEngineStatus
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type { EngineStatus } from '@lib/stores/engine.svelte.ts'

/** Callbacks for engine → Svelte communication. */
export interface EngineCallbacks {
    onNodePicked?: (index: number) => void
    onNodeHovered?: (index: number | null) => void
    onCameraArrived?: () => void
    onLoadingPhase?: (phase: string, progress: number) => void
    onGraphicsStateChange?: (state: 'lost' | 'restored' | 'fallback') => void
    onViewChanged?: (view: string) => void
}

// ── Imports ──────────────────────────────────────────────────────────────────

import { appState } from '@lib/state/app.svelte'
import { setEngineStatus, getEngineStatus as _getEngineStatus } from '@lib/stores/engine.svelte.ts'
import type { EngineStatus } from '@lib/stores/engine.svelte.ts'

// Engine sub-modules
import {
    initThreeJS,
    onWindowResize,
    cancelAnimate,
    updateCameraViewportOffset,
    createPoints,
    disposeInteractionVisuals
} from '@lib/engine/three-engine'
// M2 (W47): disposeHeroAnimation is not re-exported through the three-engine
// barrel, so import it directly. disposeInteractionVisuals() also calls it
// internally, but we call it explicitly to mirror deinit() and cancel the
// corridor-glow timers deterministically.
import { disposeHeroAnimation } from '@lib/engine/three-search-animations'
import { destroyMap } from '@lib/engine/map-state'
import { createMycelium } from '@lib/engine/thread-manager'
// Dynamic import: postprocessing is code-split to save ~150-200 kB
let _ppResize: ((w: number, h: number) => void) | null = null

// Interaction & UI
import {
    ensureCanvasNodeInteractionBindings,
    disposeCanvasNodeInteractionBindings
} from '@lib/journey/canvas-interaction'
import { destroyCanvasHoverPreview } from '@lib/journey/canvas-hover-preview'
import { initTooltipEventBusSubscriptions, disposeTooltipEventBusSubscriptions } from '@lib/ui/tooltip'

// Semantic threads are loaded in the heavy idle path to keep this chunk out of
// the first-paint bundle.

// Event bus
import { subscribe, EVENTS } from '@lib/orchestration/event-bus'

// Data readiness
import { isDataReady } from '@lib/data-store'
import { debugWarn } from '@lib/utils/debug'
import { debugLog, debugError } from '@lib/utils/debug'

// ── Legacy-access helpers ────────────────────────────────────────────────────
// Consolidate `window as unknown as Record<string, unknown>` casts that appear
// at multiple sites for __THREE_APP__ exposure.

function getLegacyWindow(): Record<string, unknown> {
    return window as unknown as Record<string, unknown>
}

// ── Module-scoped State ──────────────────────────────────────────────────────

let _eventUnsubs: Array<() => void> = []
let _canvasInteractionBound = false
let _destroyed = false
let _dataReadyUnsub: (() => void) | null = null
// W53 M5: track the dev-only simulateWebGLContextLoss restore timer so it can
// be cleared on engine teardown before it fires against a disposed context.
let _webglContextLossTimer: ReturnType<typeof setTimeout> | null = null

// ── Data readiness subscription ─────────────────────────────────────────────

/**
 * When data arrives after the engine has already initialized (e.g. user
 * clicked Enter before the data worker finished), create the points and
 * mycelium geometry that were skipped during the earlier init pass.
 */
function _onDataReady(): void {
    if (_getEngineStatus() !== 'ready') return
    if (!appState.renderer) return
    if (appState.pointsMesh) return

    try {
        createPoints()
        if (appState.points?.length && appState.nodePositions?.length) {
            void createMycelium()
        }
    } catch (err) {
        debugWarn('[engine/lifecycle] Late geometry creation failed:', err)
    }
}

// Subscribe once at module load; the guard inside _onDataReady makes it safe
// to fire before or after initEngine() runs.
_dataReadyUnsub = isDataReady.subscribe((ready) => {
    if (ready) _onDataReady()
})

// ── Event Bridge ─────────────────────────────────────────────────────────────

/**
 * Subscribe to the legacy event bus and forward events to EngineCallbacks.
 */
function bindEventBridge(callbacks: EngineCallbacks): void {
    if (typeof window === 'undefined') return

    try {
        _eventUnsubs.push(
            subscribe(EVENTS.CAMERA_NODE_FOCUSED, (payload: Record<string, unknown>) => {
                let index = payload.index as number | undefined
                if (!Number.isFinite(index)) {
                    const point = payload.point as { x: number; y: number; z: number } | undefined
                    if (point && appState.points) {
                        index = appState.points.findIndex((p) => p.x === point.x && p.y === point.y && p.z === point.z)
                    }
                }
                if (Number.isFinite(index) && index! >= 0) {
                    callbacks.onNodePicked?.(index!)
                }
            })
        )

        _eventUnsubs.push(
            subscribe(EVENTS.TRANSITION_PHASE_CHANGED, (payload: Record<string, unknown>) => {
                const phase = payload.phase as string | undefined
                if (phase === 'arrived' || phase === 'idle') {
                    callbacks.onCameraArrived?.()
                }
            })
        )

        _eventUnsubs.push(
            subscribe(EVENTS.VIEW_CHANGED, (payload: Record<string, unknown>) => {
                const view = payload.view as string | undefined
                if (view) {
                    callbacks.onViewChanged?.(view)
                }
            })
        )
    } catch (busErr) {
        debugWarn('[engine/lifecycle] Event bus subscription failed:', busErr)
    }

    // lifecycle no longer self-listens for the 'scene-ready' window event. The
    // direct `callbacks.onLoadingPhase?.('launch', 1)` call at the end of
    // initEngineHeavy is the single in-process scene-ready signal (Canvas.svelte
    // reads it via the callbacks object, not the window event). The window event
    // is still dispatched for legacy/external window-level listeners only;
    // converting it back into onLoadingPhase here caused a duplicate 'launch'
    // fire (two "Canvas: Scene ready" logs at the same ms) and a double
    // signalSceneReady() — which re-triggers DemoChoreography attemptStart.
}

/** Tear down all event-bus and DOM event subscriptions. */
function unbindEventBridge(): void {
    for (const unsub of _eventUnsubs) {
        try {
            unsub()
        } catch (error) {
            debugWarn('[engine/lifecycle] Best-effort event unsubscribe failed:', error)
        }
    }
    _eventUnsubs = []
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialize the Three.js engine.
 *
 * Coordinates all engine startup: data sync, WebGL init, geometry creation,
 * interaction bindings, event wiring, semantic thread loading, and animation.
 *
 * @param canvas - The canvas element to render into (must be in the DOM).
 * @param callbacks - Optional callbacks for engine → Svelte events.
 */
export async function initEngine(canvas: HTMLCanvasElement, callbacks: EngineCallbacks = {}): Promise<void> {
    const currentStatus = _getEngineStatus()
    if (currentStatus === 'ready' || currentStatus === 'loading') {
        debugWarn('[engine/lifecycle] initEngine: already initialized, ignoring')
        return
    }

    _destroyed = false
    setEngineStatus('loading')

    // T3-9: Clear any stale event-bus subscriptions from a previous init
    // so that calling initEngine() twice (without destroy in between) does
    // not register duplicate 'scene-ready' listeners.
    unbindEventBridge()

    try {
        const _perf = typeof performance?.mark === 'function'
        if (_perf) performance.mark('engine-init-start')

        if (_perf) performance.mark('engine-init-sync-done')

        // 2. Ensure #canvas-container exists for initThreeJS()
        const parentEl = canvas.parentElement
        let container = document.getElementById('canvas-container')
        if (!container && parentEl) {
            container = document.createElement('div')
            container.id = 'canvas-container'
            container.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;'
            parentEl.insertBefore(container, canvas)
            container.appendChild(canvas)
        }

        // 3. Schedule heavy GPU init after first paint (off critical path)
        const heavyInit = new Promise<void>((resolve) => {
            const run = (): void => {
                initEngineHeavy(callbacks).finally(resolve)
            }
            if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
                window.requestIdleCallback(run, { timeout: 5000 })
            } else {
                // Fallback for Node/SSR or browsers without requestIdleCallback
                Promise.resolve().then(run)
            }
        })
        await heavyInit
    } catch (err) {
        if (typeof performance?.mark === 'function') performance.mark('engine-init-failed')
        debugError('[engine/lifecycle] initEngine: setup failed', err)
        unbindEventBridge()
        setEngineStatus('degraded')
        callbacks.onGraphicsStateChange?.('fallback')
    }
}

/**
 * Yield to the browser between heavy init phases so Total Blocking Time
 * stays under 200 ms. Each initThreeJS sub-step (initThreeJS itself, mycelium
 * geometry, interaction bindings, semantic-thread attach) can spend 200-600 ms
 * on a cold load; without yields they fuse into a single 1-2 s long task that
 * Lighthouse flags as TBT. We use `requestIdleCallback` with a small timeout
 * (50 ms) so the yield returns quickly on busy frames and waits for an idle
 * slot when available. A `setTimeout(0)` fallback covers environments without
 * requestIdleCallback (tests, SSR).
 *
 * Why per-phase, not one big yield: the W44 baseline showed that the
 * `lifecycle-*.js` chunk is dominated by the *combined* time of initThreeJS +
 * createPoints + createMycelium + initSemanticLens + initSemanticManifold.
 * Splitting into 4 yields (init, geometry, interaction, semantic) cuts the
 * longest-task contribution in half on a typical machine.
 */
function yieldToBrowser(): Promise<void> {
    if (typeof window === 'undefined') return Promise.resolve()
    if ('requestIdleCallback' in window) {
        return new Promise<void>((resolve) => {
            window.requestIdleCallback(() => resolve(), { timeout: 50 })
        })
    }
    // eslint-disable-next-line no-restricted-syntax -- one-shot timer scoped to local promise / effect cleanup
    return new Promise<void>((resolve) => setTimeout(resolve, 0))
}

function engineInitStillActive(phase: string): boolean {
    const status = _getEngineStatus()
    if (!_destroyed && (status === 'loading' || status === 'ready')) return true
    debugWarn(`[engine/lifecycle] initEngineHeavy: aborted after ${phase}`)
    return false
}

/** Heavy GPU + geometry init — runs in requestIdleCallback after first paint. */
async function initEngineHeavy(callbacks: EngineCallbacks): Promise<void> {
    // Guard: if engine was destroyed or degraded before we ran, abort
    const currentStatus = _getEngineStatus()
    if (_destroyed || currentStatus === 'degraded') {
        debugWarn('[engine/lifecycle] initEngineHeavy: engine not in valid init state, aborting')
        return
    }

    try {
        const _perf = typeof performance?.mark === 'function'
        if (_perf) performance.mark('engine-init-gpu-start')
        // 3b. Initialise the Three.js scene (renderer + scene + camera + lights)
        // This is the largest single CPU+GPU step on cold load (~300-500 ms).
        // W8: initThreeJS() is now async and yields internally to break the
        // long task into sub-200ms chunks.
        const success = await initThreeJS()
        if (!success) {
            setEngineStatus('degraded')
            callbacks.onGraphicsStateChange?.('fallback')
            return
        }

        // W5-T1b: yield between initThreeJS and the geometry / data sync steps
        // so the long task breaks into multiple sub-200 ms chunks.
        await yieldToBrowser()
        if (!engineInitStillActive('three-init-yield')) return

        // 4. Set canvas CSS sizing
        if (appState.renderer?.domElement) {
            const liveCanvas = appState.renderer.domElement
            liveCanvas.style.width = '100%'
            liveCanvas.style.height = '100%'
            liveCanvas.style.display = 'block'
        }

        // W5-T1b: yield between canvas CSS sizing and interaction bindings
        // so the long task breaks into multiple sub-200 ms chunks.
        await yieldToBrowser()
        if (!engineInitStillActive('geometry-yield')) return

        // 5. Wire canvas click/hover interaction bindings
        try {
            ensureCanvasNodeInteractionBindings()
            _canvasInteractionBound = true
        } catch (interactionErr) {
            debugWarn('[engine/lifecycle] Canvas interaction binding failed:', interactionErr)
            setEngineStatus('degraded')
            callbacks.onGraphicsStateChange?.('fallback')
            return
        }

        // 7. Expose engine handle for tests and visual audit tools
        if (typeof window !== 'undefined') {
            const w = getLegacyWindow()
            w.__THREE_APP__ = {
                renderer: appState.renderer,
                scene: appState.scene,
                camera: appState.camera,
                simulateWebGLContextLoss: () => {
                    const canvas = document.querySelector('canvas')
                    if (!canvas) {
                        debugWarn('[simulateWebGLContextLoss] No canvas found')
                        return false
                    }
                    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
                    if (!gl) {
                        debugWarn('[simulateWebGLContextLoss] WebGL context not found')
                        return false
                    }
                    const ext = gl.getExtension('WEBGL_lose_context')
                    if (!ext) {
                        debugWarn('[simulateWebGLContextLoss] WEBGL_lose_context extension not available')
                        return false
                    }
                    debugLog('[simulateWebGLContextLoss] Triggering artificial context loss')
                    ext.loseContext()
                    // eslint-disable-next-line no-restricted-syntax -- one-shot timer scoped to local promise / effect cleanup
                    _webglContextLossTimer = setTimeout(() => {
                        debugLog('[simulateWebGLContextLoss] Triggering artificial context restoration')
                        ext.restoreContext()
                        _webglContextLossTimer = null
                    }, 500)
                    return true
                }
            }
            w.__LEGACY_APP_STATE__ = appState
            if (typeof w.__refreshTestCompatState__ === 'function') {
                ;(w.__refreshTestCompatState__ as () => void)()
            }
        }

        // W5-T1b: yield before semantic-thread dynamic import (the import itself
        // resolves the semantic-threads module + its .dat worker; we want this
        // off the main task even though it's already a separate chunk).
        await yieldToBrowser()
        if (!engineInitStillActive('semantic-thread-yield')) return

        // 8. Attach legacy state to semantic threads (thread loading is deferred to
        // the deferred-hydration phase in ui/loading.ts to avoid blocking startup).
        const semanticThreads = await import('@lib/engine/semantic-threads')
        semanticThreads.attachLegacyState(appState)
        semanticThreads.loadSemanticThreads({ reason: 'lifecycle-init' }).catch((err: unknown) => {
            debugWarn('[engine/lifecycle] semantic-thread load failed:', err)
        })

        // 9. Subscribe to the legacy event bus
        bindEventBridge(callbacks)

        // 9a. Subscribe to tooltip hide requests
        initTooltipEventBusSubscriptions()

        // 10. Start the animation loop
        // _animate() is started internally by initThreeJS on success

        // 12. Mark ready
        setEngineStatus('ready')

        // 13. Notify Canvas.svelte (and other consumers) that the scene is ready.
        //     The direct onLoadingPhase('launch') call below is the SINGLE source
        //     of the in-process signal — lifecycle no longer self-listens for the
        //     'scene-ready' window event (that caused a duplicate 'launch' fire
        //     and double signalSceneReady()). The window event dispatched just
        //     below is retained for any legacy/external window-level listeners only.
        if (typeof performance?.mark === 'function') {
            performance.mark('engine-init-ready')
            try {
                performance.measure('engine-init-total', 'engine-init-start', 'engine-init-ready')
                performance.measure('engine-init-gpu', 'engine-init-gpu-start', 'engine-init-ready')
            } catch (error) {
                debugWarn('[engine/lifecycle] performance marks absent (SSR or pre-init):', error)
            }
        }
        callbacks.onLoadingPhase?.('launch', 1)
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('scene-ready'))
        }
    } catch (err) {
        if (typeof performance?.mark === 'function') performance.mark('engine-init-failed')
        debugError('[engine/lifecycle] initEngineHeavy: initialization failed', err)
        unbindEventBridge()
        setEngineStatus('degraded')
        callbacks.onGraphicsStateChange?.('fallback')
    }
}
/**
 * Resize the engine to match new dimensions.
 *
 * FIX #1: Calls resizePostProcessing() which was missing in the bridge.
 *
 * @param width - New viewport width in CSS pixels.
 * @param height - New viewport height in CSS pixels.
 */
export function resizeEngine(width: number, height: number): void {
    if (_getEngineStatus() !== 'ready') return

    // Update camera viewport offset for panel-aware framing
    updateCameraViewportOffset()

    // Resize camera aspect ratio + renderer
    onWindowResize()

    // FIX #1: Resize postprocessing composer (was missing in bridge resize)
    // Lazy-load to keep postprocessing out of the main chunk.
    if (!_ppResize) {
        import('@lib/engine/three-postprocessing').then((m) => {
            _ppResize = m.resizePostProcessing
            _ppResize?.(width, height)
        })
    } else {
        _ppResize(width, height)
    }
}

/**
 * Destroy the engine and release all resources.
 */
export function destroyEngine(): void {
    if (_destroyed) return
    _destroyed = true

    // 0. Clear any pending dev-only WebGL context-loss restore timer so its
    //    callback cannot run against a disposed context (W53 M5).
    if (_webglContextLossTimer !== null) {
        clearTimeout(_webglContextLossTimer)
        _webglContextLossTimer = null
    }

    // 1. Cancel the animation loop
    cancelAnimate()

    // 2. Unbind event bridge
    unbindEventBridge()

    // 2a. Dispose tooltip event bus subscriptions
    disposeTooltipEventBusSubscriptions()

    // 2b. Unsubscribe from data readiness
    _dataReadyUnsub?.()
    _dataReadyUnsub = null

    // 3. Remove canvas interaction bindings
    if (_canvasInteractionBound) {
        try {
            disposeCanvasNodeInteractionBindings()
        } catch (error) {
            debugWarn('[engine/lifecycle] Best-effort canvas interaction dispose failed:', error)
        }
        _canvasInteractionBound = false
    }

    // 3a. Tear down canvas hover preview (fixes listener leak HIGH-1)
    try {
        destroyCanvasHoverPreview()
    } catch (error) {
        debugWarn('[engine/lifecycle] Best-effort canvas hover preview dispose failed:', error)
    }

    // FIX #3: Dispose Leaflet Map state recursively (was missing in bridge)
    try {
        destroyMap()
    } catch (error) {
        debugWarn('[engine/lifecycle] Best-effort Leaflet map dispose failed:', error)
    }

    // 4. Clear engine handle from window
    if (typeof window !== 'undefined') {
        const w = getLegacyWindow()
        w.__THREE_APP__ = null
    }

    // 4b. Dispose interaction visuals + search hero animation (mirrors the
    //     now-dead three-engine-core deinit() teardown, W47 M2). Called BEFORE
    //     the appState null-out below so the THREE objects are still referenced
    //     while being disposed.
    try {
        disposeInteractionVisuals()
    } catch (error) {
        debugWarn('[engine/lifecycle] interaction visuals dispose failed:', error)
    }
    try {
        disposeHeroAnimation()
    } catch (error) {
        debugWarn('[engine/lifecycle] hero animation dispose failed:', error)
    }

    // 5. Null out engine THREE-object references so a hot remount never sees
    //    disposed refs (W47 M1). Mirrors three-engine-core deinit() cleanup but
    //    targets appState (the Svelte 5 state source of truth). disposeInteractionVisuals()
    //    already nulled the focus/semantic lens refs; the remainder are asserted
    //    here for determinism so reinit starts clean.
    appState.scene = null
    appState.renderer = null
    appState.camera = null
    appState.controls = null
    appState.pointsMesh = null
    appState.pointsMaterial = null
    appState.nodeSporeMesh = null
    appState.nodeSporeMaterial = null
    appState.myceliumGroup = null
    appState.myceliumCoreLines = null
    appState.myceliumWispyLines = null
    appState.myceliumBridgeLines = null
    appState.searchCorridorGroup = null
    appState.focusSemanticLines = null
    appState.focusAnchorGroup = null
    appState.focusAnchorRingMesh = null
    appState.focusAnchorHaloSprite = null
    appState.focusLens = null
    appState.focusHalo = null
    appState.focusCore = null
    appState.focusMoteGroup = null
    appState.focusMotes = []
    appState.focusPetalGroup = null
    appState.focusPetals = []
    appState.focusFilaments = null
    appState.hoverHalo = null
    appState.anchorBloomLight = null
    appState.semanticManifold = null

    // 6. Set status to idle
    setEngineStatus('idle')
}

/**
 * Get the current engine status (non-reactive).
 *
 * @returns The current lifecycle status.
 */
export function getEngineStatus(): EngineStatus {
    return _getEngineStatus()
}
