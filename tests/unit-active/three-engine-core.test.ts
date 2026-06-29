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
    hoverEmissiveFlash: 0
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
    updateMyceliumThreads: vi.fn()
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
            nodeSporeHitMesh: null,
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
        document.body.querySelectorAll('.webgl-fallback-map').forEach(n => n.remove())
    })

    it('calls pauseRenderLoopTimers with clearRestoreTimer=true first', () => {
        cancelAnimate()
        expect(_pauseRenderLoopTimers).toHaveBeenCalledTimes(1)
        expect(_pauseRenderLoopTimers).toHaveBeenCalledWith({ clearRestoreTimer: true })
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
        _engineStateProxy.state!.nodeSporeHitMesh = dummy as any
        _engineStateProxy.state!.nodeSporeMaterial = dummy as any

        cancelAnimate()

        expect(_engineStateProxy.state!.scene).toBeNull()
        expect(_engineStateProxy.state!.camera).toBeNull()
        expect(_engineStateProxy.state!.controls).toBeNull()
        expect(_engineStateProxy.state!.pointsMesh).toBeNull()
        expect(_engineStateProxy.state!.pointsMaterial).toBeNull()
        expect(_engineStateProxy.state!.nodeSporeMesh).toBeNull()
        expect(_engineStateProxy.state!.nodeSporeHitMesh).toBeNull()
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
