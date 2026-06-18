/**
 * @lib/engine/lifecycle.ts — Canonical engine lifecycle module
 *
 * Single source of truth for engine init, resize, and destroy.
 * Replaces the lifecycle methods from src/lib/engine/adapters/lifecycle-bridge.ts
 * with a self-contained module that does not depend on BridgeContext.
 *
 * Bug fixes over the bridge:
 *   FIX #1 (resize): Added missing resizePostProcessing() call
 *   FIX #2 (destroy): Added missing disposeTooltipEventBusSubscriptions() call
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

import { get } from 'svelte/store'
import {
    isDataReady,
    businessRecords,
    positionBuffer,
    clustersBuffer,
    leadEnrichment,
    pointIndexByLeadId
} from '@lib/data-store'
import { appState } from '@lib/state/app.svelte'
import { setEngineStatus, getEngineStatus as _getEngineStatus } from '@lib/stores/engine.svelte.ts'
import type { EngineStatus } from '@lib/stores/engine.svelte.ts'

// Engine sub-modules
import { initThreeJS, onWindowResize, cancelAnimate, updateCameraViewportOffset } from '@lib/engine/three-engine'
import { createMycelium } from '@lib/engine/thread-manager'
// Dynamic import: postprocessing is code-split to save ~150-200 kB
let _ppResize: ((w: number, h: number) => void) | null = null

// Interaction & UI
import {
    ensureCanvasNodeInteractionBindings,
    disposeCanvasNodeInteractionBindings
} from '@lib/journey/canvas-interaction'
import { initTooltipEventBusSubscriptions, disposeTooltipEventBusSubscriptions } from '@lib/ui/tooltip'

// Semantic threads
import { attachLegacyState, loadSemanticThreads } from '@lib/semantic-threads'

// Event bus
import { subscribe, EVENTS } from '@lib/orchestration/event-bus'

// ── Module-scoped State ──────────────────────────────────────────────────────

let _eventUnsubs: Array<() => void> = []
let _sceneReadyHandler: (() => void) | null = null
let _canvasInteractionBound = false
let _destroyed = false

// ── Data Sync (temporary — mirrors adapters/data-bridge.ts) ──────────────────

/**
 * Sync Svelte data stores into the legacy state singleton so the Three.js
 * engine can consume them during init.
 *
 * Polls for data readiness with a 15-second ceiling.
 * Temporarily retained as a bridge call during migration.
 */
async function syncDataToLegacyState(): Promise<void> {
    if (get(isDataReady)) {
        _syncDataFields()
        return
    }

    const start = Date.now()
    while (!get(isDataReady) && Date.now() - start < 15_000) {
        await new Promise((r) => setTimeout(r, 200))
    }

    if (!get(isDataReady)) {
        console.warn('[engine/lifecycle] syncDataToLegacyState: data not ready after 15s, proceeding anyway')
    }

    _syncDataFields()
}

function _syncDataFields(): void {
    const records = get(businessRecords)
    const posBuf = get(positionBuffer)
    const clustBuf = get(clustersBuffer)
    const enrichment = get(leadEnrichment)
    const indexMap = get(pointIndexByLeadId)

    appState.withMutation(() => {
        if (records.length > 0) {
            appState.points = records as unknown as typeof appState.points
        }
        if (posBuf) {
            appState.rawPositionsBuffer = posBuf
        }
        if (clustBuf) {
            appState.rawClustersBuffer = clustBuf as unknown as typeof appState.rawClustersBuffer
        }
    })

    if (enrichment) {
        ;(appState as unknown as Record<string, unknown>).leadEnrichment = enrichment
    }
    if (indexMap) {
        ;(appState as unknown as Record<string, unknown>).pointIndexByLeadId = indexMap
    }
}

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
        console.warn('[engine/lifecycle] Event bus subscription failed:', busErr)
    }

    _sceneReadyHandler = (): void => {
        callbacks.onLoadingPhase?.('launch', 1)
    }
    window.addEventListener('scene-ready', _sceneReadyHandler as EventListener)
}

/** Tear down all event-bus and DOM event subscriptions. */
function unbindEventBridge(): void {
    for (const unsub of _eventUnsubs) {
        try {
            unsub()
        } catch (_) {
            /* best-effort */
        }
    }
    _eventUnsubs = []

    if (_sceneReadyHandler) {
        window.removeEventListener('scene-ready', _sceneReadyHandler as EventListener)
        _sceneReadyHandler = null
    }
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
        console.warn('[engine/lifecycle] initEngine: already initialized, ignoring')
        return
    }

    _destroyed = false
    setEngineStatus('loading')

    try {
        // 1. Sync Svelte data stores into the legacy state singleton
        await syncDataToLegacyState()

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

        // 3. Initialise the Three.js scene
        const success = initThreeJS()
        if (!success) {
            setEngineStatus('degraded')
            callbacks.onGraphicsStateChange?.('fallback')
            return
        }

        // 4. Sync geometry from legacy state to Svelte appState
        const legacyState = appState as unknown as Record<string, unknown>
        const nodePositions = legacyState.nodePositions
        const targetPositions = legacyState.targetPositions
        const originalPositions = legacyState.originalPositions
        if (Array.isArray(nodePositions)) appState.nodePositions = nodePositions as typeof appState.nodePositions
        if (Array.isArray(targetPositions))
            appState.targetPositions = targetPositions as typeof appState.targetPositions
        if (Array.isArray(originalPositions))
            appState.originalPositions = originalPositions as typeof appState.originalPositions

        // 5. Set canvas CSS sizing
        if (appState.renderer?.domElement) {
            const liveCanvas = appState.renderer.domElement
            liveCanvas.style.width = '100%'
            liveCanvas.style.height = '100%'
            liveCanvas.style.display = 'block'
        }

        // 6. Create mycelium thread geometry
        if (appState.points?.length && appState.nodePositions?.length) {
            try {
                createMycelium()
            } catch (threadErr) {
                console.warn('[engine/lifecycle] mycelium creation failed:', threadErr)
            }
        }

        // 7. Wire canvas click/hover interaction bindings
        try {
            ensureCanvasNodeInteractionBindings()
            _canvasInteractionBound = true
        } catch (interactionErr) {
            console.warn('[engine/lifecycle] Canvas interaction binding failed:', interactionErr)
            setEngineStatus('degraded')
            callbacks.onGraphicsStateChange?.('fallback')
            return
        }

        // 8. Expose engine handle for tests and visual audit tools
        if (typeof window !== 'undefined') {
            const w = window as unknown as Record<string, unknown>
            w.__THREE_APP__ = {
                renderer: appState.renderer,
                scene: appState.scene,
                camera: (appState as unknown as Record<string, unknown>).camera
            }
            w.__LEGACY_APP_STATE__ = appState
            if (typeof w.__refreshTestCompatState__ === 'function') {
                ;(w.__refreshTestCompatState__ as () => void)()
            }
        }

        // 9. Attach legacy state to semantic threads + kick off background load
        attachLegacyState(appState as unknown as Record<string, unknown>)
        loadSemanticThreads({ reason: 'lifecycle-init' }).catch((err: unknown) => {
            console.warn('[engine/lifecycle] Semantic threads background load failed:', err)
        })

        // 10. Subscribe to the legacy event bus
        bindEventBridge(callbacks)

        // 11. Wire tooltip event-bus subscriptions
        initTooltipEventBusSubscriptions()

        // 12. Start the animation loop
        // _animate() is started internally by initThreeJS on success

        // 13. Mark ready
        setEngineStatus('ready')

        // 14. Notify Canvas.svelte and other consumers that the scene is ready.
        //     bindEventBridge wires a listener for 'scene-ready', but nothing
        //     on the new path dispatches it. We fire both the direct callback
        //     and the window event so both in-process callers and legacy
        //     listeners receive the signal.
        callbacks.onLoadingPhase?.('launch', 1)
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('scene-ready'))
        }
    } catch (err) {
        console.error('[engine/lifecycle] initEngine: initialization failed', err)
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
 *
 * FIX #2: Calls disposeTooltipEventBusSubscriptions() which was missing
 * in the bridge destroy.
 */
export function destroyEngine(): void {
    if (_destroyed) return
    _destroyed = true

    // 1. Cancel the animation loop
    cancelAnimate()

    // 2. Unbind event bridge
    unbindEventBridge()

    // 3. Remove canvas interaction bindings
    if (_canvasInteractionBound) {
        try {
            disposeCanvasNodeInteractionBindings()
        } catch (_) {
            /* best-effort */
        }
        _canvasInteractionBound = false
    }

    // FIX #2: Dispose tooltip event-bus subscriptions (was missing in bridge)
    try {
        disposeTooltipEventBusSubscriptions()
    } catch (_) {
        /* best-effort */
    }

    // 4. Clear engine handle from window
    if (typeof window !== 'undefined') {
        const w = window as unknown as Record<string, unknown>
        w.__THREE_APP__ = null
    }

    // 5. Null out scene references
    appState.scene = null as unknown as typeof appState.scene

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
