/**
 * engine-lifecycle.test.ts — Unit tests for the new engine lifecycle module
 *
 * Coverage (W23 Canvas Engine Bridge Elimination):
 *  1. Module exports — initEngine, resizeEngine, destroyEngine, getEngineStatus, engineStatusStore
 *  2. initEngine behavior — accepts canvas + callbacks, returns Promise, sets status to 'ready', updates store
 *  3. resizeEngine behavior — accepts width/height, calls updateCameraViewportOffset, calls resizePostProcessing
 *  4. destroyEngine behavior — sets status to 'idle', calls disposeTooltipEventBusSubscriptions, updates store
 *  5. Callback wiring — initEngine forwards onNodePicked, onCameraArrived, etc. to event bus
 *
 * Mock strategy: all heavy GPU/engine modules are mocked. Tests verify contracts
 * and call ordering, not actual Three.js/WebGL behavior.
 *
 * NOTE: src/lib/engine/lifecycle.ts does not exist yet (test-first). Tests will
 * fail at import time until the module is scaffolded. That's expected.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { EngineCallbacks, EngineStatus } from '@lib/engine/lifecycle'

// ── Mock the heavy engine modules ────────────────────────────────────────────

// Mock three-engine: initThreeJS returns true on success
vi.mock('@lib/engine/three-engine', () => ({
    initThreeJS: vi.fn(() => true),
    startRenderLoop: vi.fn(),
    deinit: vi.fn(),
    onWindowResize: vi.fn(),
    updateCameraViewportOffset: vi.fn(),
    invalidateRestoreMachine: vi.fn(),
    invalidateInitGeneration: vi.fn(),
    animate: vi.fn(),
    cancelAnimate: vi.fn(),
    disposeInteractionVisuals: vi.fn(),
    getSceneRenderableDiagnostics: vi.fn(() => ({
        active: true,
        fps: 60,
        drawCalls: 10,
        triangles: 1000,
        points: 8406,
        myceliumCoreSegments: 100,
        myceliumWispySegments: 50,
        myceliumBridgeSegments: 25,
        memory: { geometries: 10, textures: 5 }
    }))
}))

// Mock postprocessing resize owner
vi.mock('@lib/engine/three-postprocessing', () => ({
    resizePostProcessing: vi.fn()
}))

// Mock thread-manager: createMycelium / disposeMycelium
vi.mock('@lib/engine/thread-manager', () => ({
    createMycelium: vi.fn(),
    disposeMycelium: vi.fn(),
    shouldRenderThreads: vi.fn(() => true),
    shouldRenderBridgeThreads: vi.fn(() => false),
    getThreadPulseOpacity: vi.fn(() => 0.8),
    getMyceliumPresentationProfile: vi.fn(() => ({ core: 1, wispy: 0.5, bridge: 0.3, pulse: 0.1 })),
    getGroupLineSegmentCount: vi.fn(() => 100)
}))

// Mock canvas-interaction bindings
vi.mock('@lib/journey/canvas-interaction', () => ({
    ensureCanvasNodeInteractionBindings: vi.fn(() => vi.fn()), // returns cleanup
    disposeCanvasNodeInteractionBindings: vi.fn()
}))

// Mock semantic-threads loader
vi.mock('@lib/engine/semantic-threads', () => ({
    loadSemanticThreads: vi.fn(async () => {}),
    attachLegacyState: vi.fn(),
    resetSemanticThreadWorker: vi.fn()
}))

// Mock data stores so initEngine does not wait for the 15s readiness ceiling.
vi.mock('@lib/data-store', async () => {
    const { writable } = await import('svelte/store')
    const records = [{ id: 'test-1', x: 0, y: 0, z: 0 }]
    return {
        isDataReady: writable(true),
        businessRecords: writable(records),
        getBusinessRecords: vi.fn(() => records),
        positionBuffer: writable(new Float32Array([0, 0, 0])),
        clustersBuffer: writable(new Float32Array([0])),
        leadEnrichment: writable({}),
        pointIndexByLeadId: writable(new Map([['test-1', 0]])),
        setDataLoadError: vi.fn()
    }
})

// Mock tooltip event bus subscriptions
vi.mock('@lib/ui/tooltip', () => ({
    initTooltipEventBusSubscriptions: vi.fn(),
    disposeTooltipEventBusSubscriptions: vi.fn()
}))

// Mock event bus
vi.mock('@lib/orchestration/event-bus', () => ({
    publish: vi.fn(),
    subscribe: vi.fn(() => vi.fn()), // returns unsubscribe
    subscribeKeyed: vi.fn(() => vi.fn()),
    unsubscribeKeyed: vi.fn(),
    getSubscriberCount: vi.fn(() => 0),
    clearAllSubscribers: vi.fn(),
    EVENTS: {
        CAMERA_NODE_FOCUSED: 'CAMERA_NODE_FOCUSED',
        TRANSITION_PHASE_CHANGED: 'TRANSITION_PHASE_CHANGED',
        VIEW_CHANGED: 'VIEW_CHANGED'
    }
}))

// Mock the engine status store (will be created as @lib/stores/engine.svelte.ts)
vi.mock('@lib/stores/engine.svelte', () => {
    let _value: EngineStatus = 'idle'
    const subscribers: Array<(v: EngineStatus) => void> = []
    return {
        engineStatusStore: {
            subscribe(fn: (v: EngineStatus) => void) {
                subscribers.push(fn)
                fn(_value)
                return () => {
                    const idx = subscribers.indexOf(fn)
                    if (idx >= 0) subscribers.splice(idx, 1)
                }
            },
            set(v: EngineStatus) {
                _value = v
                subscribers.forEach((fn) => fn(v))
            },
            update(fn: (v: EngineStatus) => EngineStatus) {
                _value = fn(_value)
                subscribers.forEach((s) => s(_value))
            }
        },
        setEngineStatus: (v: EngineStatus) => {
            _value = v
            subscribers.forEach((fn) => fn(v))
        },
        getEngineStatus: () => _value
    }
})

// Mock app state (used by lifecycle for withMutation)
vi.mock('@lib/state/app.svelte', () => ({
    appState: {
        withMutation: <T>(fn: () => T) => fn(),
        navState: {
            mode: 'overview',
            surface: 'idle',
            previousSurface: 'idle',
            currentView: 'galaxy',
            panelSurface: 'idle',
            panelSurfaceDetail: '',
            focusPanelMode: 'idle',
            focusedIndex: null,
            focusPocketIndices: [],
            focusPocketRoleByIndex: new Map(),
            focusPocketMeta: null,
            walkHistoryIndices: [],
            trailCursor: -1,
            trailDepth: 0,
            trailSeedIndex: null,
            threadCandidates: [],
            threadReasonByIndex: new Map(),
            threadSource: 'geometric-fallback',
            lastTraversalReason: null
        },
        points: [{ id: 'test-1', x: 0, y: 0, z: 0 }],
        nodePositions: [{ x: 0, y: 0, z: 0 }],
        targetPositions: [{ x: 0, y: 0, z: 0 }],
        originalPositions: [{ x: 0, y: 0, z: 0 }],
        rawPositionsBuffer: new Float32Array([0, 0, 0]),
        rawClustersBuffer: new Float32Array([0]),
        selectedPoint: null,
        focusedNode: null,
        inspectedThreadIndex: null,
        pinnedThreadIndex: null,
        nodesAreSettling: false,
        pocketMotionByIndex: new Map(),
        pocketTransitionStartedAt: 0,
        infoPanelOpen: true,
        pocketListVisible: false,
        focusTransitionMode: 'idle',
        focusTransitionStartedAt: 0,
        focusOrbitSlackState: {
            phase: 'idle',
            reason: '',
            startedAt: 0,
            targetShift: 0,
            cameraShift: 0,
            distanceBefore: 0,
            distanceAfter: 0,
            maxDistance: 5.5,
            rotateSpeed: 0.6,
            panSpeed: 0.5
        },
        inspectedStrandDiagnostics: {
            active: false,
            source: 'none',
            inspectedIndex: null,
            pinnedIndex: null,
            pointerInside: false,
            segmentCount: 0,
            braidCount: 0,
            endpointCount: 0
        },
        threadInspectorPointerInside: false,
        renderer: null,
        scene: null,
        registeredEvents: new Set(),
        eventListenersInitialized: false,
        // W11-T4 partition sub-records — production reads these at module-init.
        searchState: {
            currentSearchSummary: null,
            searchStatus: 'idle',
            searchError: null,
            searchRequestSequence: 0,
            searchAnchorIndex: null,
            searchPreviewIndex: null,
            searchGlowIndices: new Set(),
            searchGlowTopIndex: null,
            searchGlowActive: false,
            searchFocusTransitionToken: 0,
            isSearching: false,
            currentEmptyQuery: null,
            semanticTrailCue: 'idle',
            isCompactViewport: false,
            semanticGuideRequestSequence: 0,
            currentSemanticGuide: null,
            summaryCardTypeToken: 0,
            searchVisibleCount: 5
        },
        viewportState: {
            viewportWidth: 1280,
            viewportHeight: 800,
            isCompactViewport: false,
            isMobileViewport: false,
            isTabletViewport: false,
            devicePixelRatio: 1
        },
        focusState: {
            selectedPoint: null,
            inspectedThreadIndex: null,
            pinnedThreadIndex: null,
            threadInspectorPointerInside: false,
            pocketMotionByIndex: new Map(),
            pocketTransitionStartedAt: 0,
            infoPanelOpen: true,
            pocketListVisible: false,
            pocketRoleFilter: 'all',
            focusTransitionMode: 'idle',
            focusTransitionStartedAt: 0,
            nodesAreSettling: false,
            inspectedStrandDiagnostics: {
                active: false,
                source: '',
                index: null,
                focusedIndex: null,
                segmentCount: 0,
                braidCount: 0,
                endpointCount: 0
            }
        }
    }
}))

// Mock camera-controls for updateCameraViewportOffset
vi.mock('@lib/engine/camera-controls', () => ({
    focusOnNode: vi.fn(),
    settleCameraToOverviewPose: vi.fn(),
    zoomCamera: vi.fn(),
    updateCameraViewportOffset: vi.fn()
}))

// Mock view-controller
vi.mock('@lib/orchestration/view-controller', () => ({
    switchView: vi.fn()
}))

// ── Import the module under test ─────────────────────────────────────────────
// This import will fail until src/lib/engine/lifecycle.ts is scaffolded.
// That's expected for test-first development.

import { initEngine, resizeEngine, destroyEngine, getEngineStatus } from '../../src/lib/engine/lifecycle'

import { engineStatusStore, setEngineStatus } from '@lib/stores/engine.svelte'

// Also import mocked modules to verify call behavior
import { initThreeJS, startRenderLoop, updateCameraViewportOffset } from '@lib/engine/three-engine'
import { resizePostProcessing } from '@lib/engine/three-postprocessing'
import { createMycelium } from '@lib/engine/thread-manager'
import {
    ensureCanvasNodeInteractionBindings,
    disposeCanvasNodeInteractionBindings
} from '@lib/journey/canvas-interaction'
import { loadSemanticThreads } from '@lib/engine/semantic-threads'
import { initTooltipEventBusSubscriptions, disposeTooltipEventBusSubscriptions } from '@lib/ui/tooltip'

// ── Test Helpers ─────────────────────────────────────────────────────────────

function createMockCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = 1920
    canvas.height = 1080
    return canvas
}

function createMockCallbacks(): EngineCallbacks {
    return {
        onNodePicked: vi.fn(),
        onCameraArrived: vi.fn(),
        onNodeHovered: vi.fn(),
        onViewChanged: vi.fn(),
        onLoadingPhase: vi.fn(),
        onGraphicsStateChange: vi.fn()
    }
}

beforeEach(() => {
    destroyEngine()
    setEngineStatus('idle')
    vi.clearAllMocks()
})

afterEach(() => {
    destroyEngine()
    setEngineStatus('idle')
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('engine-lifecycle — module exports', () => {
    it('exports initEngine as a function', () => {
        expect(typeof initEngine).toBe('function')
    })

    it('exports resizeEngine as a function', () => {
        expect(typeof resizeEngine).toBe('function')
    })

    it('exports destroyEngine as a function', () => {
        expect(typeof destroyEngine).toBe('function')
    })

    it('exports getEngineStatus as a function', () => {
        expect(typeof getEngineStatus).toBe('function')
    })

    it('exports engineStatusStore from @lib/stores/engine.svelte', () => {
        expect(engineStatusStore).toBeDefined()
        expect(typeof engineStatusStore.subscribe).toBe('function')
    })
})

describe('engine-lifecycle — initEngine behavior', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('accepts an HTMLCanvasElement and EngineCallbacks', async () => {
        const canvas = createMockCanvas()
        const callbacks = createMockCallbacks()

        // Should not throw
        await expect(initEngine(canvas, callbacks)).resolves.toBeUndefined()
    })

    it('returns a Promise', () => {
        const canvas = createMockCanvas()
        const callbacks = createMockCallbacks()
        const result = initEngine(canvas, callbacks)

        expect(result).toBeInstanceOf(Promise)
    })

    it('calls initThreeJS from three-engine', async () => {
        const canvas = createMockCanvas()
        await initEngine(canvas, createMockCallbacks())

        expect(initThreeJS).toHaveBeenCalledOnce()
    })

    it('starts the first render only after publishing scene readiness', async () => {
        const canvas = createMockCanvas()
        const callbacks = createMockCallbacks()
        await initEngine(canvas, callbacks)

        expect(startRenderLoop).toHaveBeenCalledOnce()
        expect(callbacks.onLoadingPhase).toHaveBeenCalledWith('launch', 1)
        expect(startRenderLoop.mock.invocationCallOrder[0]).toBeGreaterThan(
            callbacks.onLoadingPhase.mock.invocationCallOrder[0]
        )
    })

    it('calls loadSemanticThreads', async () => {
        const canvas = createMockCanvas()
        await initEngine(canvas, createMockCallbacks())

        expect(loadSemanticThreads).toHaveBeenCalledOnce()
    })

    it('does not call createMycelium directly from lifecycle', async () => {
        // The cold-path mycelium build now lives inside initThreeJS().
        // lifecycle.ts only calls createMycelium() on the late-data path.
        const canvas = createMockCanvas()
        await initEngine(canvas, createMockCallbacks())

        expect(createMycelium).not.toHaveBeenCalled()
    })

    it('calls ensureCanvasNodeInteractionBindings', async () => {
        const canvas = createMockCanvas()
        await initEngine(canvas, createMockCallbacks())

        expect(ensureCanvasNodeInteractionBindings).toHaveBeenCalledOnce()
    })

    it('calls initTooltipEventBusSubscriptions', async () => {
        const canvas = createMockCanvas()
        await initEngine(canvas, createMockCallbacks())

        expect(initTooltipEventBusSubscriptions).toHaveBeenCalledOnce()
    })

    it('sets getEngineStatus() to "ready" after successful init', async () => {
        const canvas = createMockCanvas()
        await initEngine(canvas, createMockCallbacks())

        expect(getEngineStatus()).toBe('ready')
    })

    it('updates engineStatusStore to "ready" after successful init', async () => {
        const canvas = createMockCanvas()
        let storeValue: EngineStatus = 'idle'

        engineStatusStore.subscribe((v: EngineStatus) => {
            storeValue = v
        })

        await initEngine(canvas, createMockCallbacks())

        expect(storeValue).toBe('ready')
    })
})

describe('engine-lifecycle — resizeEngine behavior', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        // Initialize engine first so resize has something to work with
        const canvas = createMockCanvas()
        await initEngine(canvas, createMockCallbacks())
        vi.clearAllMocks() // clear init mocks so resize assertions are clean
    })

    it('accepts width and height parameters', () => {
        // Should not throw
        expect(() => resizeEngine(1920, 1080)).not.toThrow()
    })

    it('calls updateCameraViewportOffset from camera-controls', () => {
        resizeEngine(1920, 1080)

        expect(updateCameraViewportOffset).toHaveBeenCalledOnce()
    })

    it('calls resizePostProcessing from three-postprocessing (BUG FIX)', async () => {
        resizeEngine(1920, 1080)
        // The postprocessing composer is lazy-loaded (dynamic import) — allow
        // the .then to land before asserting (was order-dependent before the
        // M-4 _ppResize cache-clear on destroy).
        // INP deferral (2026-08-24): the import now sits behind a
        // requestIdleCallback (setTimeout-120 fallback in jsdom), so flush
        // 0ms → 250ms to let the idle callback + .then chain land.
        await new Promise((resolve) => setTimeout(resolve, 250))

        expect(resizePostProcessing).toHaveBeenCalledOnce()
    })

    it('passes width and height to resizePostProcessing', async () => {
        resizeEngine(800, 600)
        // Lazy-loaded composer — await the dynamic-import .then (M-4 cache-clear
        // makes this genuinely async per test). Same 250ms idle-deferral flush
        // as above; first test in this describe typically primed _ppResize,
        // but each beforeEach re-init must not assume that.
        await new Promise((resolve) => setTimeout(resolve, 250))

        expect(resizePostProcessing).toHaveBeenCalledWith(800, 600)
    })
})

describe('engine-lifecycle — destroyEngine behavior', () => {
    beforeEach(async () => {
        vi.clearAllMocks()
        // Initialize engine first so destroy has something to tear down
        const canvas = createMockCanvas()
        await initEngine(canvas, createMockCallbacks())
        vi.clearAllMocks()
    })

    it('sets getEngineStatus() to "idle" after destroy', () => {
        destroyEngine()

        expect(getEngineStatus()).toBe('idle')
    })

    it('updates engineStatusStore to "idle" after destroy', () => {
        let storeValue: EngineStatus = 'ready'

        engineStatusStore.subscribe((v: EngineStatus) => {
            storeValue = v
        })

        destroyEngine()

        expect(storeValue).toBe('idle')
    })

    it('calls disposeTooltipEventBusSubscriptions (BUG FIX)', () => {
        destroyEngine()

        expect(disposeTooltipEventBusSubscriptions).toHaveBeenCalledOnce()
    })

    it('calls disposeCanvasNodeInteractionBindings', () => {
        destroyEngine()

        expect(disposeCanvasNodeInteractionBindings).toHaveBeenCalledOnce()
    })
})

describe('engine-lifecycle — callback wiring', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('forwards onNodePicked callback to event bus wiring', async () => {
        const callbacks = createMockCallbacks()
        const canvas = createMockCanvas()

        await initEngine(canvas, callbacks)

        // The event bus subscribe should have been called with CAMERA_NODE_FOCUSED
        // which wires the onNodePicked callback. We verify through the mock that
        // the event bus subscription was established.
        const eventBus = await import('@lib/orchestration/event-bus')
        expect(eventBus.subscribe).toHaveBeenCalled()
    })

    it('forwards onCameraArrived callback via TRANSITION_PHASE_CHANGED', async () => {
        const callbacks = createMockCallbacks()
        const canvas = createMockCanvas()

        await initEngine(canvas, callbacks)

        const eventBus = await import('@lib/orchestration/event-bus')
        const subscribeCalls = (eventBus.subscribe as ReturnType<typeof vi.fn>).mock.calls

        // Should have a subscription for TRANSITION_PHASE_CHANGED
        const transitionSub = subscribeCalls.find((call: unknown[]) => call[0] === 'TRANSITION_PHASE_CHANGED')
        expect(transitionSub).toBeDefined()
    })

    it('forwards onViewChanged callback via VIEW_CHANGED event', async () => {
        const callbacks = createMockCallbacks()
        const canvas = createMockCanvas()

        await initEngine(canvas, callbacks)

        const eventBus = await import('@lib/orchestration/event-bus')
        const subscribeCalls = (eventBus.subscribe as ReturnType<typeof vi.fn>).mock.calls

        // Should have a subscription for VIEW_CHANGED
        const viewSub = subscribeCalls.find((call: unknown[]) => call[0] === 'VIEW_CHANGED')
        expect(viewSub).toBeDefined()
    })

    it('works with empty callbacks object', async () => {
        const canvas = createMockCanvas()
        // Empty callbacks — should not throw
        await expect(initEngine(canvas, {})).resolves.toBeUndefined()
    })

    it('works with undefined callbacks', async () => {
        const canvas = createMockCanvas()
        // No callbacks at all — should not throw
        await expect(initEngine(canvas)).resolves.toBeUndefined()
    })
})

describe('engine-lifecycle — status transitions', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('starts at "idle" before init', () => {
        expect(getEngineStatus()).toBe('idle')
    })

    it('transitions idle → ready via initEngine', async () => {
        const canvas = createMockCanvas()
        await initEngine(canvas, createMockCallbacks())

        expect(getEngineStatus()).toBe('ready')
    })

    it('transitions ready → idle via destroyEngine', async () => {
        const canvas = createMockCanvas()
        await initEngine(canvas, createMockCallbacks())
        destroyEngine()

        expect(getEngineStatus()).toBe('idle')
    })

    it('full lifecycle: idle → ready → idle', async () => {
        const canvas = createMockCanvas()

        expect(getEngineStatus()).toBe('idle')

        await initEngine(canvas, createMockCallbacks())
        expect(getEngineStatus()).toBe('ready')

        destroyEngine()
        expect(getEngineStatus()).toBe('idle')
    })
})
