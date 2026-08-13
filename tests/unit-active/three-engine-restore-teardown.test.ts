/**
 * Focused engine lifecycle tests — Semantic Explorer audit 2026-08-12.
 *
 * Covers ONLY the three low-risk engine lifecycle fixes (scoped slice):
 *
 *   Fix 1: a successful WebGL context restore must disarm the bounded
 *          watchdog (engineState.webglRestoreTimer) so it cannot fire ~15s
 *          later and falsely escalate a now-healthy scene to degraded/fallback.
 *
 *   Fix 2: after post-processing disposal, the cached ppModule / ppLoading
 *          must be cleared so a re-init cannot reuse a disposed composer.
 *
 *   Fix 3: an in-flight post-processing import must not repopulate the cache
 *          after teardown advances the engine epoch.
 *
 * This suite deliberately does NOT cover the destroy-during-init generation
 * redesign or perpetual RAF idling. It isolates the two target modules via the
 * same vi.mock seams used by three-engine-core.test.ts. The restore machine is
 * imported for real (its callback-injection seams are the contract under test);
 * only its heavy leaf deps (stores, data-store, fallback glue, debug) are
 * stubbed. three-engine-teardown is imported for real and its port modules are
 * stubbed so cancelAnimate runs against the engineState proxy.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Hoisted mutable stubs (consumed by vi.mock factories) ───────────────────

const _disposeEventListeners = vi.hoisted(() => vi.fn())
const _cancelOverviewCameraAnimation = vi.hoisted(() => vi.fn())
const _disposeCanvasNodeInteractionBindings = vi.hoisted(() => vi.fn())
const _cancelRouteAnimations = vi.hoisted(() => vi.fn())
const _disposeObject3D = vi.hoisted(() => vi.fn())
const _disposeNodeVisuals = vi.hoisted(() => vi.fn())
const _disposeMycelium = vi.hoisted(() => vi.fn())
const _pauseRenderLoopTimers = vi.hoisted(() => vi.fn())
const _clearScheduledFrameTasks = vi.hoisted(() => vi.fn())
const _setEngineStatus = vi.hoisted(() => vi.fn())
const _setGraphicsMode = vi.hoisted(() => vi.fn())
const _removeWebGLFallbackNotice = vi.hoisted(() => vi.fn())
const _debugWarn = vi.hoisted(() => vi.fn())
const _debugInfo = vi.hoisted(() => vi.fn())
const _debugError = vi.hoisted(() => vi.fn())

// ── Trackable engineState proxy (rebuilt by each test) ──────────────────────

const _engineStateProxy = vi.hoisted(() => ({
    renderLoopStartPending: false,
    loaded: false,
    webglContextLost: false,
    webglNeedsRestoreReinit: false,
    circuitBreakerTripped: false,
    webglRestoreTimer: null as number | null,
    lastHoveredNode: null as number | null,
    hoverEmissiveFlash: 0,
    lastCameraSnapshot: null as unknown,
    consecutiveSkippedFrames: 0,
    renderSkipOpportunities: 0,
    mapButtonClickHandler: null as ((e: MouseEvent) => void) | null,
    sceneRegistry: null as null | { disposeAll: () => void },
    state: null as null | Record<string, any>,
    cameraControls: null as null | Record<string, any>,
    focusAnchor: null as null | Record<string, any>,
    uiFeedback: null as null | { showExperienceToast: (title: string, message?: string, id?: string) => void; dismissExperienceToast?: (id: string) => void },
    ppModule: null as null | Record<string, any>,
    ppLoading: null as null | Promise<unknown>,
    ppEpoch: 0
}))

// ── Module mocks ────────────────────────────────────────────────────────────

vi.mock('@lib/engine/three-engine-state', () => ({
    engineState: _engineStateProxy,
    ensureModules: vi.fn()
}))

vi.mock('@lib/utils/debug', () => ({
    debugWarn: _debugWarn,
    debugInfo: _debugInfo,
    debugError: _debugError
}))

vi.mock('@lib/stores/engine.svelte.ts', () => ({
    setEngineStatus: _setEngineStatus,
    getEngineStatus: vi.fn(() => 'ready')
}))

vi.mock('@lib/data-store', () => ({
    setGraphicsMode: _setGraphicsMode
}))

vi.mock('@lib/engine/renderer/webgl-fallback', () => ({
    removeWebGLFallbackNotice: _removeWebGLFallbackNotice
}))

// teardown port modules — stubbed so cancelAnimate runs against the proxy.
vi.mock('@lib/ui/global-bindings', () => ({
    disposeEventListeners: _disposeEventListeners
}))
vi.mock('@lib/demo/camera', () => ({
    cancelOverviewCameraAnimation: _cancelOverviewCameraAnimation
}))
vi.mock('@lib/journey/canvas-interaction', () => ({
    disposeCanvasNodeInteractionBindings: _disposeCanvasNodeInteractionBindings
}))
vi.mock('@lib/engine/camera-choreography/routes', () => ({
    cancelRouteAnimations: _cancelRouteAnimations
}))
vi.mock('@lib/engine/resource-tracker', () => ({
    disposeObject3D: _disposeObject3D
}))
vi.mock('@lib/engine/node-manager', () => ({
    disposeNodeVisuals: _disposeNodeVisuals
}))
vi.mock('@lib/engine/thread-manager', () => ({
    disposeMycelium: _disposeMycelium
}))
vi.mock('@lib/engine/three-engine-timers', () => ({
    pauseRenderLoopTimers: _pauseRenderLoopTimers
}))
vi.mock('@lib/engine/frame-scheduler', () => ({
    clearScheduledFrameTasks: _clearScheduledFrameTasks
}))
vi.mock('@lib/engine/webgl-context', () => ({
    webglContext: { scene: null, camera: null, renderer: null, controls: null, pointsMesh: null, pointsMaterial: null, nodeSporeMesh: null, nodeSporeMaterial: null }
}))

// Mock the heavy postprocessing chunk so the F3 epoch-guard tests can drive
// ensurePostProcessing() without pulling in the real postprocessing library.
vi.mock('@lib/engine/three-postprocessing', () => ({
    initPostProcessing: vi.fn(),
    renderPostProcessing: vi.fn(() => false),
    disposePostProcessing: vi.fn(),
    resizePostProcessing: vi.fn()
}))

// NOTE: @lib/engine/three-engine-restore is intentionally NOT mocked — the
// restore retry/watchdog state machine is the code under test (Fix 1).
// three-engine-teardown imports invalidateRestoreMachine from it; that stays
// real too, which is exactly what we want.

import {
    _restoreReinitWithRetry,
    setRestoreInitFn,
    setRestoreSuccessCb,
    _armRestoreWatchdog,
    resetRestoreMachineForManualInit,
    invalidateRestoreMachine
} from '@lib/engine/three-engine-restore'
import { cancelAnimate } from '@lib/engine/three-engine-teardown'
import { ensurePostProcessing } from '@lib/engine/three-pp-init'

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Resolve pending microtasks (promise .then callbacks) without fake timers. */
const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
    // Reset the proxy to a clean baseline before each test.
    _engineStateProxy.renderLoopStartPending = false
    _engineStateProxy.loaded = false
    _engineStateProxy.webglContextLost = false
    _engineStateProxy.webglNeedsRestoreReinit = false
    _engineStateProxy.circuitBreakerTripped = false
    _engineStateProxy.webglRestoreTimer = null
    _engineStateProxy.lastHoveredNode = null
    _engineStateProxy.hoverEmissiveFlash = 0
    _engineStateProxy.lastCameraSnapshot = null
    _engineStateProxy.consecutiveSkippedFrames = 0
    _engineStateProxy.renderSkipOpportunities = 0
    _engineStateProxy.mapButtonClickHandler = null
    _engineStateProxy.sceneRegistry = null
    _engineStateProxy.state = null
    _engineStateProxy.cameraControls = null
    _engineStateProxy.focusAnchor = null
    _engineStateProxy.uiFeedback = null
    _engineStateProxy.ppModule = null
    _engineStateProxy.ppLoading = null
    _engineStateProxy.ppEpoch = 0

    _pauseRenderLoopTimers.mockClear()
    _disposeObject3D.mockClear()
    _disposeMycelium.mockClear()
    _disposeNodeVisuals.mockClear()
    _disposeEventListeners.mockClear()
    _cancelOverviewCameraAnimation.mockClear()
    _disposeCanvasNodeInteractionBindings.mockClear()
    _cancelRouteAnimations.mockClear()
    _clearScheduledFrameTasks.mockClear()
    _setEngineStatus.mockClear()
    _setGraphicsMode.mockClear()
    _removeWebGLFallbackNotice.mockClear()
    _debugWarn.mockClear()
    _debugInfo.mockClear()
    _debugError.mockClear()
})

afterEach(() => {
    // Invalidate any in-flight retry/backoff timer + restore generation so a
    // dangling real setTimeout from a failure-path test cannot leak into the
    // next test (and to leave the machine in a clean state).
    invalidateRestoreMachine()
    vi.useRealTimers()
})

// ── Fix 1: successful restore disarms the watchdog ──────────────────────────

describe('Fix 1 — successful restore disarms the watchdog', () => {
    it('clears webglRestoreTimer on a successful restore so it cannot falsely escalate later', async () => {
        resetRestoreMachineForManualInit()
        // Simulate an armed watchdog (123 is not a real timer handle; the
        // original code only needed webglRestoreTimer to be non-null to fire).
        _engineStateProxy.webglRestoreTimer = 123
        _engineStateProxy.circuitBreakerTripped = false
        setRestoreInitFn(() => Promise.resolve(true))
        setRestoreSuccessCb(() => {})

        _restoreReinitWithRetry()
        await flushMicrotasks()

        // The watchdog must be disarmed — a healthy scene must not be escalated
        // by the 15s timer 15 seconds after the restore already succeeded.
        expect(_engineStateProxy.webglRestoreTimer).toBeNull()
        expect(_engineStateProxy.circuitBreakerTripped).toBe(false)
    })

    it('does NOT clear the watchdog on a failed restore (real failures still escalate)', async () => {
        resetRestoreMachineForManualInit()
        _engineStateProxy.webglRestoreTimer = 123
        _engineStateProxy.circuitBreakerTripped = false
        // Restore re-init fails — the failure path must leave the watchdog
        // armed so the bounded escalation can still fire if all retries fail.
        setRestoreInitFn(() => Promise.reject(new Error('restore failed')))
        setRestoreSuccessCb(() => {})

        _restoreReinitWithRetry()
        await flushMicrotasks()

        // Failure path clears only the retry/backoff timer, NOT the watchdog.
        expect(_engineStateProxy.webglRestoreTimer).not.toBeNull()
        // A single failure must not have escalated yet (retries remain).
        expect(_engineStateProxy.circuitBreakerTripped).toBe(false)
    })

    it('the watchdog still escalates to degraded when a restore never completes', () => {
        vi.useFakeTimers()
        resetRestoreMachineForManualInit()
        _engineStateProxy.circuitBreakerTripped = false
        _engineStateProxy.uiFeedback = { showExperienceToast: vi.fn() }

        // Arm the watchdog exactly as the render loop / retry machine does.
        _armRestoreWatchdog()
        expect(_engineStateProxy.webglRestoreTimer).not.toBeNull()

        // Advance past the 15s bounded window with no successful restore.
        vi.advanceTimersByTime(16000)

        // The watchdog is intact: a stuck restore still escalates.
        expect(_engineStateProxy.circuitBreakerTripped).toBe(true)
        _setEngineStatus.mock.calls.forEach((c) => expect(c[0]).toBe('degraded'))
    })
})

// ── Fix 2: teardown clears the postprocessing cache ─────────────────────────

describe('Fix 2 — cancelAnimate clears postprocessing cache', () => {
    it('disposes postprocessing and nulls ppModule/ppLoading so re-init cannot reuse a disposed composer', () => {
        const disposePostProcessing = vi.fn()
        _engineStateProxy.state = null
        _engineStateProxy.sceneRegistry = null
        _engineStateProxy.mapButtonClickHandler = null
        _engineStateProxy.webglContextLost = false
        _engineStateProxy.cameraControls = null
        _engineStateProxy.focusAnchor = null
        // A cached postprocessing module object + in-flight load promise.
        _engineStateProxy.ppModule = { disposePostProcessing }
        _engineStateProxy.ppLoading = Promise.resolve({ initPostProcessing: vi.fn() })

        cancelAnimate()

        // Disposal actually ran...
        expect(disposePostProcessing).toHaveBeenCalledTimes(1)
        // ...and the cached references were cleared so ensurePostProcessing()
        // on the next re-init re-acquires a fresh composer instead of reusing
        // the disposed one.
        expect(_engineStateProxy.ppModule).toBeNull()
        expect(_engineStateProxy.ppLoading).toBeNull()
    })

    it('is idempotent: a second cancelAnimate does not throw and keeps pp cache cleared', () => {
        const disposePostProcessing = vi.fn()
        _engineStateProxy.state = null
        _engineStateProxy.sceneRegistry = null
        _engineStateProxy.cameraControls = null
        _engineStateProxy.focusAnchor = null
        _engineStateProxy.ppModule = { disposePostProcessing }
        _engineStateProxy.ppLoading = Promise.resolve({ initPostProcessing: vi.fn() })

        cancelAnimate()
        expect(_engineStateProxy.ppModule).toBeNull()
        expect(_engineStateProxy.ppLoading).toBeNull()

        // Second call with no cached module must be a no-op (optional chaining).
        expect(() => cancelAnimate()).not.toThrow()
        expect(_engineStateProxy.ppModule).toBeNull()
        expect(_engineStateProxy.ppLoading).toBeNull()
        // disposePostProcessing is only invoked while a module is cached.
        expect(disposePostProcessing).toHaveBeenCalledTimes(1)
    })
})

// ── Fix 1: a late successful restore retracts the stale escalation toast ────

// F1 (engine lifecycle audit 2026-08-12): when the bounded watchdog fires a
// false escalation (degraded + "Graphics unavailable — reload" toast) but the
// in-flight restore then succeeds, the reconcile path must dismiss THAT toast
// by its stable id — without disturbing unrelated queued toasts.
describe('Fix 1 — late successful restore retracts the stale escalation toast', () => {
    it('dismisses the escalation toast by id when a late restore succeeds (F1)', async () => {
        vi.useFakeTimers()
        resetRestoreMachineForManualInit()
        _engineStateProxy.circuitBreakerTripped = false
        const showToast = vi.fn()
        const dismissToast = vi.fn()
        _engineStateProxy.uiFeedback = { showExperienceToast: showToast, dismissExperienceToast: dismissToast }

        // 1) Bounded watchdog escalates: escalation toast shown, breaker tripped.
        _armRestoreWatchdog()
        vi.advanceTimersByTime(16000)
        expect(showToast).toHaveBeenCalledTimes(1)
        expect(showToast.mock.calls[0][0]).toBe('Graphics unavailable')
        expect(dismissToast).not.toHaveBeenCalled()
        expect(_engineStateProxy.circuitBreakerTripped).toBe(true)

        // 2) Late successful restore reconciles and retracts the stale toast.
        setRestoreInitFn(() => Promise.resolve(true))
        setRestoreSuccessCb(() => {})
        _restoreReinitWithRetry()
        // Flush the async .then reconcile (microtask) under fake timers.
        await Promise.resolve()
        await Promise.resolve()

        expect(dismissToast).toHaveBeenCalledTimes(1)
        expect(dismissToast).toHaveBeenCalledWith('webgl-restore-failed')
        expect(_engineStateProxy.circuitBreakerTripped).toBe(false)
    })

    it('does NOT dismiss anything when no escalation ever occurred', async () => {
        resetRestoreMachineForManualInit()
        _engineStateProxy.webglRestoreTimer = 123
        _engineStateProxy.circuitBreakerTripped = false
        const showToast = vi.fn()
        const dismissToast = vi.fn()
        _engineStateProxy.uiFeedback = { showExperienceToast: showToast, dismissExperienceToast: dismissToast }
        setRestoreInitFn(() => Promise.resolve(true))
        setRestoreSuccessCb(() => {})

        _restoreReinitWithRetry()
        await Promise.resolve()
        await Promise.resolve()

        // Success path with no prior escalation must not dismiss any toast.
        expect(dismissToast).not.toHaveBeenCalled()
        expect(_engineStateProxy.webglRestoreTimer).toBeNull()
    })
})

// ── Fix 3: postprocessing dynamic-import epoch guard ────────────────────────

// F3 (engine lifecycle audit 2026-08-12): cancelAnimate() nulls ppModule/
// ppLoading AND bumps ppEpoch. An import that is still in flight when teardown
// runs must not resurrect engineState.ppModule — the cache must stay cleared.
describe('Fix 3 — postprocessing import epoch guard (F3)', () => {
    it('drops an in-flight import result when teardown bumps ppEpoch (F3)', async () => {
        _engineStateProxy.ppModule = null
        _engineStateProxy.ppLoading = null
        _engineStateProxy.ppEpoch = 0

        const inflight = ensurePostProcessing(_engineStateProxy as unknown as never)
        // Simulate teardown landing between import start and resolution.
        _engineStateProxy.ppEpoch = 1
        _engineStateProxy.ppModule = null
        _engineStateProxy.ppLoading = null

        const result = await inflight
        // Caller still receives a usable wrapper, but the cache stays cleared.
        expect(result).not.toBeNull()
        expect(_engineStateProxy.ppModule).toBeNull()
        expect(_engineStateProxy.ppLoading).toBeNull()
    })

    it('caches the wrapper when ppEpoch is unchanged', async () => {
        _engineStateProxy.ppModule = null
        _engineStateProxy.ppLoading = null
        _engineStateProxy.ppEpoch = 0

        const result = await ensurePostProcessing(_engineStateProxy as unknown as never)
        expect(result).not.toBeNull()
        expect(_engineStateProxy.ppModule).toBe(result)
    })

    it('cancelAnimate bumps ppEpoch so a prior in-flight import is invalidated', async () => {
        _engineStateProxy.ppModule = null
        _engineStateProxy.ppLoading = null
        _engineStateProxy.ppEpoch = 0
        _engineStateProxy.state = null
        _engineStateProxy.sceneRegistry = null
        _engineStateProxy.cameraControls = null
        _engineStateProxy.focusAnchor = null

        const inflight = ensurePostProcessing(_engineStateProxy as unknown as never)
        // Teardown path that nulls the cache + bumps the epoch.
        cancelAnimate()

        const result = await inflight
        expect(result).not.toBeNull()
        expect(_engineStateProxy.ppModule).toBeNull()
        expect(_engineStateProxy.ppEpoch).toBe(1)
    })
})
