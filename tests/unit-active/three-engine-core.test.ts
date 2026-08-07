/**
 * @vitest-environment jsdom
 *
 * Direct unit coverage for src/lib/engine/three-engine-core.ts (757-LOC
 * WebGL lifecycle/render-loop file). The file wraps nearly everything in
 * the `engineState` singleton, so the natural seam is to mock that
 * singleton and stub the port modules it calls.
 *
 * Three test layers:
 *   1. Compile-time surface — type-import every exported symbol so tsc
 *      fails if the public API drifts. Mirrors state-types.test.ts.
 *
 *   2. applyMapFlatteningLayout(enabled: boolean) — the simplest export:
 *      delegates through engineState.mapFlattening. We verify the delegate
 *      is called with the exact boolean, and that a no-map-flattening-
 *      module install is tolerated (optional chaining).
 *
 *   3. cancelAnimate() — lifecycle state-machine correctness. We verify
 *      that:
 *        a) it clears the render-loop timers first,
 *        b) it disposes the scene registry,
 *        c) it nulls the scene-state fields,
 *      and that calling it twice is idempotent (guard case).
 *
 * References:
 *   - tests/unit-active/parity-attrs-derivation.test.ts (vi.mock pattern)
 *   - tests/unit-active/state-types.test.ts (compile-time surface)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mutable stubs (consumed by vi.mock factories) ───────────────────

const _applyMapFlatteningLayout = vi.hoisted(() => vi.fn())
const _pauseRenderLoopTimers = vi.hoisted(() => vi.fn())
const _disposeObject3D = vi.hoisted(() => vi.fn())
const _disposePostProcessing = vi.hoisted(() => vi.fn())
const _disposeFocusAnchorIndicator = vi.hoisted(() => vi.fn())
const _buildThreeSceneOrFallback = vi.hoisted(() => vi.fn())

// ── Trackable engineState proxy (rebuilt by each test) ──────────────────────

const _engineStateProxy = vi.hoisted(() => ({
    mapFlattening: { applyMapFlatteningLayout: _applyMapFlatteningLayout },
    sceneRegistry: null as null | { disposeAll: () => void },
    mapButtonClickHandler: null as ((e: MouseEvent) => void) | null,
    webglContextLost: false,
    state: null as null | Record<string, any>,
    ppModule: null as null | Record<string, any>,
    focusAnchor: null as null | Record<string, any>,
    rafId: null as number | null,
    loaded: false,
    lastHoveredNode: null as number | null,
    hoverEmissiveFlash: 0,
    webglNeedsRestoreReinit: false,
    webglRestoreTimer: null as number | null,
    circuitBreakerTripped: false,
    uiFeedback: null as null | { showExperienceToast: (title: string, message?: string) => void }
}))

// ── Module mocks ────────────────────────────────────────────────────────────
// NOTE: mock paths MUST match what three-engine-core.ts resolves. The core
// file imports './three-engine-state' (relative), which resolves to
// @lib/engine/three-engine-state under the vitest alias config. Mocking
// './three-engine-state' from this test file would resolve to a non-existent
// path and silently no-op.

vi.mock('@lib/engine/three-engine-state', () => ({
    engineState: _engineStateProxy,
    ensureModules: vi.fn()
}))

vi.mock('@lib/engine/three-engine-timers', () => ({
    pauseRenderLoopTimers: _pauseRenderLoopTimers,
    scheduleNextAnimationFrame: vi.fn(),
    yieldToBrowser: vi.fn().mockResolvedValue(undefined),
    setAnimateFn: vi.fn()
}))

vi.mock('@lib/engine/resource-tracker', () => ({
    disposeObject3D: _disposeObject3D
}))

vi.mock('@lib/engine/node-manager', () => ({
    compilePointMaterialForReadiness: vi.fn(),
    createPoints: vi.fn(),
    disposeNodeVisuals: vi.fn(),
    SCENE_ATMOSPHERE: { fogColor: 0x000000, fogDensity: 0.01 },
    setNodeSporeInstanceMatrix: vi.fn(),
    MYCELIUM_FIELD_SCALE: Object.freeze({ x: 1, y: 1, z: 1 }),
    disposeTextures: vi.fn(),
    getClusterSizeFactor: vi.fn().mockReturnValue(1),
    computeClusterSizes: vi.fn().mockReturnValue(new Map()),
    getNodeSporeScale: vi.fn().mockReturnValue(1),
    getNodeSporeColor: vi.fn().mockReturnValue(0xffffff),
    getPointBoundsCenter: vi.fn().mockReturnValue({ x: 0, y: 0 }),
    createNodeSporeLayer: vi.fn()
}))

vi.mock('@lib/engine/thread-manager', () => ({
    createMycelium: vi.fn(),
    disposeMycelium: vi.fn(),
    getMyceliumPresentationProfile: vi.fn(),
    getThreadPulseOpacity: vi.fn(),
    shouldRenderThreads: vi.fn(),
    shouldRenderBridgeThreads: vi.fn(),
    getGroupLineSegmentCount: vi.fn().mockReturnValue(0),
    updateMyceliumThreads: vi.fn(),
    drainMyceliumDirtyState: vi.fn(),
    syncMyceliumLineResolution: vi.fn()
}))

// initThreeJS-adjacent modules (restore-retry suite drives the real
// initThreeJS through the machine, so its helpers/stores must be stubbed).
vi.mock('@lib/engine/three-engine-init-helpers', () => ({
    buildThreeSceneOrFallback: _buildThreeSceneOrFallback,
    applyReducedMotionGate: vi.fn(),
    applyAutoRotateConfig: vi.fn(),
    exposeDevEngineBridge: vi.fn()
}))

vi.mock('@lib/engine/three-listener-registration', () => ({
    registerContextListeners: vi.fn(() => ({ disposeAll: vi.fn() }))
}))

vi.mock('@lib/engine/three-store-sync', () => ({
    syncSceneHandles: vi.fn(),
    syncPointsHandles: vi.fn(),
    syncMyceliumHandles: vi.fn()
}))

vi.mock('@lib/engine/three-pp-init', () => ({
    ensurePostProcessing: vi.fn(() => Promise.resolve({ initPostProcessing: vi.fn() }))
}))

// ── Import under test (MUST appear after all vi.mock calls) ──────────────────

import {
    updateCameraViewportOffset,
    initThreeJS,
    onWindowResize,
    cancelAnimate,
    deinit,
    applyMapFlatteningLayout,
    animate
} from '@lib/engine/three-engine-core'
import { getEngineStatus, setEngineStatus } from '@lib/stores/engine.svelte'

// ── 1. Compile-time surface contract ────────────────────────────────────────

describe('three-engine-core — compile-time surface contract', () => {
    it('exports the 7 public surface symbols', () => {
        // The type-imported names ARE the contract — if any disappears
        // from three-engine-core.ts, tsc fails this test before vitest
        // runs. We also bind them so unused-import lints don't trip.
        const surface: Array<unknown> = [
            updateCameraViewportOffset,
            initThreeJS,
            onWindowResize,
            cancelAnimate,
            deinit,
            applyMapFlatteningLayout,
            animate
        ]
        expect(surface).toHaveLength(7)
    })

    it('applyMapFlatteningLayout accepts a single boolean signature', () => {
        // Signature guard: the export must still be (enabled: boolean) => void.
        const fn: (enabled: boolean) => void = applyMapFlatteningLayout
        expect(typeof fn).toBe('function')
    })

    it('cancelAnimate takes no arguments', () => {
        // cancelAnimate is designed as a zero-arg teardown guard.
        expect(cancelAnimate.length).toBe(0)
    })

    it('deinit takes no arguments', () => {
        expect(deinit.length).toBe(0)
    })

    it('onWindowResize takes no arguments', () => {
        expect(onWindowResize.length).toBe(0)
    })

    it('animate takes no arguments', () => {
        expect(animate.length).toBe(0)
    })

    it('updateCameraViewportOffset takes no arguments', () => {
        expect(updateCameraViewportOffset.length).toBe(0)
    })

    it('initThreeJS is an async function', () => {
        // initThreeJS is declared `async`, so calling it returns a Promise.
        // We don't invoke it (it touches many globals and may attempt
        // WebGL initialization); we only verify the surface contract.
        expect(typeof initThreeJS).toBe('function')
        // Async functions have a named `.name` and length we can sanity-check.
        // The body is heavy (touches canvas, scene init), so we don't
        // invoke it under jsdom — instead we verify that the function
        // reference is callable and well-formed.
        expect(initThreeJS.name).toBe('initThreeJS')
    })
})

// ── 2. applyMapFlatteningLayout — happy path and guards ──────────────────────

describe('applyMapFlatteningLayout', () => {
    beforeEach(() => {
        _applyMapFlatteningLayout.mockClear()
        _engineStateProxy.mapFlattening = {
            applyMapFlatteningLayout: _applyMapFlatteningLayout
        }
    })

    it('delegates to engineState.mapFlattening.applyMapFlatteningLayout with enabled=true', () => {
        applyMapFlatteningLayout(true)
        expect(_applyMapFlatteningLayout).toHaveBeenCalledTimes(1)
        expect(_applyMapFlatteningLayout).toHaveBeenCalledWith(true)
    })

    it('delegates to engineState.mapFlattening.applyMapFlatteningLayout with enabled=false', () => {
        applyMapFlatteningLayout(false)
        expect(_applyMapFlatteningLayout).toHaveBeenCalledTimes(1)
        expect(_applyMapFlatteningLayout).toHaveBeenCalledWith(false)
    })

    it('tolerates missing mapFlattening module (optional chaining guard)', () => {
        // Defensive: engineState.mapFlattening can be null in headless or
        // minimal configurations. The function must not throw.
        _engineStateProxy.mapFlattening = null as any
        expect(() => applyMapFlatteningLayout(true)).not.toThrow()
        expect(_applyMapFlatteningLayout).not.toHaveBeenCalled()
    })

    it('idempotent: calling twice with same value delegates twice', () => {
        applyMapFlatteningLayout(true)
        applyMapFlatteningLayout(true)
        expect(_applyMapFlatteningLayout).toHaveBeenCalledTimes(2)
    })
})

// ── 3. cancelAnimate — lifecycle state-machine correctness ──────────────────

describe('cancelAnimate', () => {
    beforeEach(() => {
        // Reset all stubs and state-tracker proxy before each test.
        _pauseRenderLoopTimers.mockClear()
        _disposeObject3D.mockClear()
        _disposePostProcessing.mockClear()
        _disposeFocusAnchorIndicator.mockClear()

        // Fresh scene registry stub per test
        const mockDisposeAll = vi.fn()
        _engineStateProxy.sceneRegistry = { disposeAll: mockDisposeAll }
        _engineStateProxy.mapButtonClickHandler = null
        _engineStateProxy.webglContextLost = false
        _engineStateProxy.state = {
            renderer: null,
            scene: null,
            camera: null,
            controls: null,
            pointsMesh: null,
            pointsMaterial: null,
            nodeSporeMesh: null,
            nodeSporeMaterial: null,
            sceneRevealActive: false,
            sceneRevealCameraStart: null,
            sceneRevealCameraEnd: null
        }

        // Fresh ppModule stub
        _engineStateProxy.ppModule = {
            resizePostProcessing: vi.fn(),
            disposePostProcessing: _disposePostProcessing
        }

        // focusAnchor stub
        _engineStateProxy.focusAnchor = {
            disposeFocusAnchorIndicator: _disposeFocusAnchorIndicator
        }

        // jsdom: clean up any previous .webgl-fallback-map from prior tests
        document.body.querySelectorAll('.webgl-fallback-map').forEach((n) => n.remove())
    })

    it('calls pauseRenderLoopTimers WITHOUT clearing the restore timer (F2 watchdog)', () => {
        // F2 (2026-08-07): cancelAnimate must NOT pass { clearRestoreTimer: true }
        // — that would kill the bounded webglRestoreTimer watchdog before
        // initThreeJS() gets a chance to succeed on the restore path.
        cancelAnimate()
        expect(_pauseRenderLoopTimers).toHaveBeenCalledTimes(1)
        const arg = _pauseRenderLoopTimers.mock.calls[0]?.[0]
        expect(arg?.clearRestoreTimer).toBeUndefined()
    })

    it('disposes the scene registry', () => {
        expect(_engineStateProxy.sceneRegistry).not.toBeNull()
        const registry = _engineStateProxy.sceneRegistry!
        const disposeSpy = vi.spyOn(registry, 'disposeAll')
        cancelAnimate()
        expect(disposeSpy).toHaveBeenCalledTimes(1)
    })

    it('nulls the sceneRegistry after disposal (defensive cleanup)', () => {
        cancelAnimate()
        expect(_engineStateProxy.sceneRegistry).toBeNull()
    })

    it('nulls state points / spore fields after cleanup', () => {
        // Inject non-null dummy values so we can verify they get cleared.
        // Renderer needs a real-ish `dispose()` so cancelAnimate's
        // cleanup path doesn't throw before reaching the field nulling.
        const disposeFn = vi.fn()
        const dummy = { __dummy: true, dispose: disposeFn } as any
        _engineStateProxy.state!.renderer = dummy as any
        _engineStateProxy.state!.pointsMesh = dummy as any
        _engineStateProxy.state!.pointsMaterial = dummy as any
        _engineStateProxy.state!.nodeSporeMesh = dummy as any
        _engineStateProxy.state!.nodeSporeMaterial = dummy as any

        cancelAnimate()

        expect(_engineStateProxy.state!.scene).toBeNull()
        expect(_engineStateProxy.state!.camera).toBeNull()
        expect(_engineStateProxy.state!.controls).toBeNull()
        expect(_engineStateProxy.state!.pointsMesh).toBeNull()
        expect(_engineStateProxy.state!.pointsMaterial).toBeNull()
        expect(_engineStateProxy.state!.nodeSporeMesh).toBeNull()
        expect(_engineStateProxy.state!.nodeSporeMaterial).toBeNull()
    })

    it('clears hover bookkeeping state', () => {
        _engineStateProxy.lastHoveredNode = 5
        _engineStateProxy.hoverEmissiveFlash = 42
        cancelAnimate()
        expect(_engineStateProxy.lastHoveredNode).toBeNull()
        expect(_engineStateProxy.hoverEmissiveFlash).toBe(0)
    })

    it('guard: null state does not throw', () => {
        _engineStateProxy.state = null as any
        expect(() => cancelAnimate()).not.toThrow()
    })

    it('guard: called twice — second call still completes without error', () => {
        // First call: sets registry to null, state fields to null
        cancelAnimate()
        // Second call: registry is already null, state is also null-fields
        expect(() => cancelAnimate()).not.toThrow()
        // pauseRenderLoopTimers is called on each invocation regardless
        expect(_pauseRenderLoopTimers).toHaveBeenCalledTimes(2)
    })

    it('guard: mapButtonClickHandler removal + cleanup when button exists', () => {
        // Inject a mapButtonClickHandler and a matching DOM element
        const handlerFn = vi.fn()
        _engineStateProxy.mapButtonClickHandler = handlerFn
        const fakeBtn = document.createElement('div')
        fakeBtn.classList.add('webgl-fallback-map')
        document.body.appendChild(fakeBtn)
        const removeSpy = vi.spyOn(fakeBtn, 'removeEventListener')

        cancelAnimate()

        expect(removeSpy).toHaveBeenCalledWith('click', handlerFn)
        expect(_engineStateProxy.mapButtonClickHandler).toBeNull()

        // Cleanup
        fakeBtn.remove()
    })

    it('guard: missing map button DOM element does not throw (defensive)', () => {
        // No .webgl-fallback-map in the DOM, but handler is set. The
        // implementation queries the DOM; if not found, it skips removal.
        _engineStateProxy.mapButtonClickHandler = vi.fn()
        expect(() => cancelAnimate()).not.toThrow()
    })
})

// ── 4. WebGL restore retry state machine (renderer-wave audit 2026-08-07) ────
//
// Drives the real initThreeJS() through the machine's entry points
// (animate() restore branch, direct initThreeJS(), deinit()) with fake
// timers. buildThreeSceneOrFallback is the controllable seam for
// success/failure/deferred outcomes.

describe('webgl-restore retry state machine', () => {
    let container: HTMLDivElement
    const SUCCESS_SETUP = {
        scene: {},
        camera: {},
        renderer: { dispose: vi.fn(), forceContextLoss: vi.fn(), domElement: null },
        controls: { dispose: vi.fn() },
        hemiLight: {},
        dirLight: {}
    } as any

    const toast = () => (_engineStateProxy.uiFeedback!.showExperienceToast as ReturnType<typeof vi.fn>)

    beforeEach(() => {
        vi.useFakeTimers()
        setEngineStatus('idle')
        _buildThreeSceneOrFallback.mockReset()
        _buildThreeSceneOrFallback.mockResolvedValue({ success: false })
        _engineStateProxy.webglNeedsRestoreReinit = false
        _engineStateProxy.webglRestoreTimer = null
        _engineStateProxy.circuitBreakerTripped = false
        _engineStateProxy.uiFeedback = { showExperienceToast: vi.fn() }
        container = document.createElement('div')
        container.id = 'canvas-container'
        document.body.appendChild(container)
    })

    afterEach(() => {
        container?.remove()
        vi.useRealTimers()
        setEngineStatus('idle')
        _engineStateProxy.webglNeedsRestoreReinit = false
        _engineStateProxy.webglRestoreTimer = null
        _engineStateProxy.circuitBreakerTripped = false
        _engineStateProxy.uiFeedback = null
    })

    it('restore failure schedules the 1s and 3s backoffs and stops after the retry budget', async () => {
        _engineStateProxy.webglNeedsRestoreReinit = true
        animate()
        await vi.advanceTimersByTimeAsync(0)
        // attempt 1 fails → count=1 → 1s backoff
        expect(_buildThreeSceneOrFallback).toHaveBeenCalledTimes(1)

        await vi.advanceTimersByTimeAsync(1000)
        // attempt 2 fails → count=2 → 3s backoff (NOT 1s — the restore-attempt
        // init must not have reset the count mid-cycle)
        expect(_buildThreeSceneOrFallback).toHaveBeenCalledTimes(2)

        await vi.advanceTimersByTimeAsync(1000)
        // t=2000: 3s backoff not yet due
        expect(_buildThreeSceneOrFallback).toHaveBeenCalledTimes(2)

        await vi.advanceTimersByTimeAsync(2000)
        // t=4000: attempt 3 fails → count=3 > 2 → escalate
        expect(_buildThreeSceneOrFallback).toHaveBeenCalledTimes(3)

        await vi.advanceTimersByTimeAsync(0)
        expect(toast()).toHaveBeenCalledTimes(1)
        expect(getEngineStatus()).toBe('degraded')
        expect(_engineStateProxy.circuitBreakerTripped).toBe(true)
        expect(_engineStateProxy.webglRestoreTimer).toBeNull()

        // Budget exhausted — no further retries, no duplicate toast
        await vi.advanceTimersByTimeAsync(60000)
        expect(_buildThreeSceneOrFallback).toHaveBeenCalledTimes(3)
        expect(toast()).toHaveBeenCalledTimes(1)
        expect(vi.getTimerCount()).toBe(0)
    })

    it('manual init resets a prior failed-cycle retry count without resetting retries within the current restore cycle', async () => {
        // Cycle 1: first attempt fails → count=1 → 1s backoff armed
        _engineStateProxy.webglNeedsRestoreReinit = true
        animate()
        await vi.advanceTimersByTimeAsync(0)
        expect(_buildThreeSceneOrFallback).toHaveBeenCalledTimes(1)

        // Manual re-init (direct call, not via the machine) supersedes the
        // cycle: retry timer cleared, retry budget reset for a future cycle.
        await initThreeJS()
        expect(_buildThreeSceneOrFallback).toHaveBeenCalledTimes(2)
        expect(vi.getTimerCount()).toBe(0)

        // No stale backoff can resurrect the interrupted cycle
        await vi.advanceTimersByTimeAsync(60000)
        expect(_buildThreeSceneOrFallback).toHaveBeenCalledTimes(2)

        // Cycle 2 starts with a fresh budget: first failure schedules the 1s
        // backoff (not 3s — the old cycle's count must not leak in)
        _engineStateProxy.webglNeedsRestoreReinit = true
        animate()
        await vi.advanceTimersByTimeAsync(0)
        expect(_buildThreeSceneOrFallback).toHaveBeenCalledTimes(3)
        await vi.advanceTimersByTimeAsync(1000)
        expect(_buildThreeSceneOrFallback).toHaveBeenCalledTimes(4)
    })

    it('success after a watchdog race reconciles state — no permanent breaker/degraded status', async () => {
        let resolveBuild!: (v: { success: boolean; setup?: any }) => void
        _buildThreeSceneOrFallback.mockImplementation(
            () => new Promise((res) => { resolveBuild = res })
        )
        _engineStateProxy.webglNeedsRestoreReinit = true
        animate()
        await vi.advanceTimersByTimeAsync(0)
        expect(_buildThreeSceneOrFallback).toHaveBeenCalledTimes(1)

        // Watchdog fires while the async restore init is still in flight
        await vi.advanceTimersByTimeAsync(15000)
        expect(toast()).toHaveBeenCalledTimes(1)
        expect(getEngineStatus()).toBe('degraded')
        expect(_engineStateProxy.circuitBreakerTripped).toBe(true)

        // Late success must reconcile — not leave the engine permanently degraded
        resolveBuild({ success: true, setup: SUCCESS_SETUP })
        await vi.advanceTimersByTimeAsync(0)
        expect(getEngineStatus()).toBe('ready')
        expect(_engineStateProxy.circuitBreakerTripped).toBe(false)
        expect(toast()).toHaveBeenCalledTimes(1)
        expect(_engineStateProxy.webglRestoreTimer).toBeNull()
        expect(vi.getTimerCount()).toBe(0)
    })

    it('late failure after escalation does not schedule a new retry or duplicate the toast', async () => {
        let rejectBuild!: (v: unknown) => void
        _buildThreeSceneOrFallback.mockImplementation(
            () => new Promise((_, rej) => { rejectBuild = rej })
        )
        _engineStateProxy.webglNeedsRestoreReinit = true
        animate()
        await vi.advanceTimersByTimeAsync(0)
        expect(_buildThreeSceneOrFallback).toHaveBeenCalledTimes(1)

        await vi.advanceTimersByTimeAsync(15000)
        expect(toast()).toHaveBeenCalledTimes(1)
        expect(getEngineStatus()).toBe('degraded')

        // Late rejection after escalation: no re-arm, no duplicate toast
        rejectBuild(new Error('late GPU failure'))
        await vi.advanceTimersByTimeAsync(0)
        expect(_buildThreeSceneOrFallback).toHaveBeenCalledTimes(1)
        expect(toast()).toHaveBeenCalledTimes(1)
        expect(vi.getTimerCount()).toBe(0)
        // Status stays degraded — truthful, the attempt really did fail
        expect(getEngineStatus()).toBe('degraded')
    })

    it('deinit clears watchdog/retry timers and invalidates in-flight restore work', async () => {
        let rejectBuild!: (v: unknown) => void
        _buildThreeSceneOrFallback.mockImplementation(
            () => new Promise((_, rej) => { rejectBuild = rej })
        )
        _engineStateProxy.webglNeedsRestoreReinit = true
        animate()
        await vi.advanceTimersByTimeAsync(0)
        expect(_buildThreeSceneOrFallback).toHaveBeenCalledTimes(1)
        expect(_engineStateProxy.webglRestoreTimer).not.toBeNull()

        deinit()
        expect(_engineStateProxy.webglRestoreTimer).toBeNull()
        expect(vi.getTimerCount()).toBe(0)

        // Late failure of the invalidated attempt must not resurrect the loop
        rejectBuild(new Error('teardown'))
        await vi.advanceTimersByTimeAsync(0)
        expect(_buildThreeSceneOrFallback).toHaveBeenCalledTimes(1)
        expect(toast()).not.toHaveBeenCalled()
        expect(getEngineStatus()).toBe('idle')

        await vi.advanceTimersByTimeAsync(60000)
        expect(_buildThreeSceneOrFallback).toHaveBeenCalledTimes(1)
        expect(toast()).not.toHaveBeenCalled()
    })

    it('manual init while a restore attempt is pending is treated as manual (invalidates the pending attempt)', async () => {
        // Per-call deferreds: index 0 = restore-owned attempt, 1 = public init
        const resolvers: Array<(v: { success: boolean; setup?: any }) => void> = []
        const rejectors: Array<(v: unknown) => void> = []
        _buildThreeSceneOrFallback.mockImplementation(
            () => new Promise((res, rej) => { resolvers.push(res); rejectors.push(rej) })
        )
        _engineStateProxy.webglNeedsRestoreReinit = true
        animate()
        await vi.advanceTimersByTimeAsync(0)
        expect(_buildThreeSceneOrFallback).toHaveBeenCalledTimes(1)
        // Restore-owned init is awaiting; its watchdog is armed
        expect(_engineStateProxy.webglRestoreTimer).not.toBeNull()

        // Public initThreeJS() called while the restore-owned init is in flight
        const manualInitPromise = initThreeJS()
        await vi.advanceTimersByTimeAsync(0)
        expect(_buildThreeSceneOrFallback).toHaveBeenCalledTimes(2)

        // Manual init succeeds first and must have invalidated the pending
        // restore attempt (cleared watchdog, bumped generation)
        resolvers[1]({ success: true, setup: SUCCESS_SETUP })
        await vi.advanceTimersByTimeAsync(0)
        await expect(manualInitPromise).resolves.toBe(true)
        expect(_engineStateProxy.webglRestoreTimer).toBeNull()

        // Late rejection of the superseded restore-owned init must not
        // resurrect the loop or degrade anything
        rejectors[0](new Error('restore attempt superseded'))
        await vi.advanceTimersByTimeAsync(0)
        expect(_buildThreeSceneOrFallback).toHaveBeenCalledTimes(2)
        expect(toast()).not.toHaveBeenCalled()
        expect(getEngineStatus()).toBe('idle')

        await vi.advanceTimersByTimeAsync(60000)
        expect(_buildThreeSceneOrFallback).toHaveBeenCalledTimes(2)
        expect(toast()).not.toHaveBeenCalled()
        expect(vi.getTimerCount()).toBe(0)
    })
})
