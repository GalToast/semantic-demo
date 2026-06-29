/**
 * @vitest-environment jsdom
 *
 * Unit tests for the 4 extracted init-concern functions in
 * src/lib/engine/three-engine-init-helpers.ts (Phase 5 quick-pick).
 *
 * Mocks buildThreeScene, showWebGLFallback, webglContext, CONFIG,
 * and appState. Follows the same mock pattern as
 * tests/unit-active/three-engine-frame-updates.test.ts.
 *
 * References:
 *   - docs/three-engine-decomposition-plan.md §5 (C2, C8, C9, C16)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mutable stubs ────────────────────────────────────────────────────

const _buildThreeScene = vi.hoisted(() => vi.fn())
const _showWebGLFallback = vi.hoisted(() => vi.fn())

// ── Trackable webglContext proxy ──────────────────────────────────────────────

const _webglContextProxy = vi.hoisted(() => ({
    renderer: null as any,
    scene: null as any,
    camera: null as any
}))

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@lib/engine/renderer/scene-init', () => ({
    buildThreeScene: _buildThreeScene
}))

vi.mock('@lib/engine/renderer/webgl-fallback', () => ({
    showWebGLFallback: _showWebGLFallback
}))

vi.mock('@lib/engine/webgl-context', () => ({
    webglContext: _webglContextProxy
}))

vi.mock('@lib/engine/config', () => ({
    CONFIG: { AUTO_ROTATE_BASE_SPEED: 0.34 }
}))

// ── Import under test (MUST appear after all vi.mock calls) ───────────────────

import {
    buildThreeSceneOrFallback,
    applyReducedMotionGate,
    applyAutoRotateConfig,
    exposeDevEngineBridge
} from '@lib/engine/three-engine-init-helpers'

// ══════════════════════════════════════════════════════════════════════════════
// 1. buildThreeSceneOrFallback (C2)
// ══════════════════════════════════════════════════════════════════════════════

describe('buildThreeSceneOrFallback (C2)', () => {
    const fakeSetup = {
        scene: { name: 'scene' },
        camera: { name: 'camera' },
        renderer: { name: 'renderer' },
        controls: { name: 'controls' },
        hemiLight: { name: 'hemiLight' },
        dirLight: { name: 'dirLight' },
        glowSphere: null,
        refSphere: null,
        support: { supported: true, reason: 'available' }
    } as any

    const fakeContainer = document.createElement('div')
    const setter = vi.fn()

    const fallbackDeps = {
        state: { scene: null, camera: null, renderer: null, controls: null, scenePerformanceDiagnostics: { active: true, reason: '' } },
        viewController: { switchView: vi.fn() },
        mapState: { initMap: vi.fn() },
        uiFeedback: { showExperienceToast: vi.fn() }
    }

    beforeEach(() => {
        _buildThreeScene.mockReset()
        _showWebGLFallback.mockReset()
        setter.mockReset()
    })

    it('success path → returns { success: true, setup }', async () => {
        _buildThreeScene.mockResolvedValue({ success: true, setup: fakeSetup })

        const result = await buildThreeSceneOrFallback(fakeContainer, 800, 600, setter, fallbackDeps)

        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.setup).toBe(fakeSetup)
        }
        expect(_showWebGLFallback).not.toHaveBeenCalled()
        expect(setter).not.toHaveBeenCalled()
    })

    it('failure path → calls showWebGLFallback with correct args', async () => {
        _buildThreeScene.mockResolvedValue({ success: false, reason: 'context-unavailable' })

        const result = await buildThreeSceneOrFallback(fakeContainer, 800, 600, setter, fallbackDeps)

        expect(result.success).toBe(false)
        expect(_showWebGLFallback).toHaveBeenCalledWith(
            fakeContainer,
            { reason: 'context-unavailable' },
            fallbackDeps
        )
    })

    it('failure path → sets mapButtonClickHandler via setter', async () => {
        const fakeHandler = vi.fn()
        _buildThreeScene.mockResolvedValue({ success: false, reason: 'webgl-unavailable' })
        _showWebGLFallback.mockReturnValue(fakeHandler)

        await buildThreeSceneOrFallback(fakeContainer, 800, 600, setter, fallbackDeps)

        expect(setter).toHaveBeenCalledWith(fakeHandler)
    })

    it('failure path → falls back to "webgl-unavailable" when reason is empty', async () => {
        _buildThreeScene.mockResolvedValue({ success: false, reason: '' })

        await buildThreeSceneOrFallback(fakeContainer, 800, 600, setter, fallbackDeps)

        expect(_showWebGLFallback).toHaveBeenCalledWith(
            fakeContainer,
            { reason: 'webgl-unavailable' },
            fallbackDeps
        )
    })
})

// ══════════════════════════════════════════════════════════════════════════════
// 2. applyReducedMotionGate (C8)
// ══════════════════════════════════════════════════════════════════════════════

describe('applyReducedMotionGate (C8)', () => {
    function makeMockWindow(matches: boolean): { matchMedia: any; document: any } {
        const rotateBtn = document.createElement('button')
        rotateBtn.id = 'btn-rotate'
        return {
            matchMedia: vi.fn().mockImplementation((query: string) => ({
                matches: query === '(prefers-reduced-motion: reduce)' ? matches : false,
                media: query
            })),
            document: {
                getElementById: vi.fn().mockImplementation((id: string) => (id === 'btn-rotate' ? rotateBtn : null))
            }
        } as any
    }

    it('matches=false → no mutation to appState or state', () => {
        const appStateRef = { autoRotate: true }
        const state = { autoRotate: true }
        const win = makeMockWindow(false)

        applyReducedMotionGate(state, appStateRef, win as any)

        expect(appStateRef.autoRotate).toBe(true)
        expect(state.autoRotate).toBe(true)
    })

    it('matches=true, no button in DOM → mutates both autoRotate to false', () => {
        const appStateRef = { autoRotate: true }
        const state = { autoRotate: true }
        const win = makeMockWindow(true)
        // Override getElementById to return null for btn-rotate
        win.document.getElementById = vi.fn().mockReturnValue(null)

        applyReducedMotionGate(state, appStateRef, win as any)

        expect(appStateRef.autoRotate).toBe(false)
        expect(state.autoRotate).toBe(false)
    })

    it('matches=true, button present → also sets aria-pressed="false"', () => {
        const appStateRef = { autoRotate: true }
        const state = { autoRotate: true }
        const win = makeMockWindow(true)

        applyReducedMotionGate(state, appStateRef, win as any)

        expect(appStateRef.autoRotate).toBe(false)
        expect(state.autoRotate).toBe(false)
        const btn = win.document.getElementById('btn-rotate')
        expect(btn.getAttribute('aria-pressed')).toBe('false')
    })

    it('matchMedia is undefined → no crash, no mutation', () => {
        const appStateRef = { autoRotate: true }
        const state = { autoRotate: true }
        const win = { matchMedia: undefined, document: { getElementById: vi.fn() } } as any

        expect(() => applyReducedMotionGate(state, appStateRef, win)).not.toThrow()
        expect(appStateRef.autoRotate).toBe(true)
        expect(state.autoRotate).toBe(true)
    })

    it('state is null → only appState is mutated', () => {
        const appStateRef = { autoRotate: true }
        const win = makeMockWindow(true)

        applyReducedMotionGate(null, appStateRef, win as any)

        expect(appStateRef.autoRotate).toBe(false)
        // No crash from null state access
    })

    it('state is undefined → only appState is mutated', () => {
        const appStateRef = { autoRotate: true }
        const win = makeMockWindow(true)

        applyReducedMotionGate(undefined, appStateRef, win as any)

        expect(appStateRef.autoRotate).toBe(false)
    })
})

// ══════════════════════════════════════════════════════════════════════════════
// 3. applyAutoRotateConfig (C9)
// ══════════════════════════════════════════════════════════════════════════════

describe('applyAutoRotateConfig (C9)', () => {
    it('autoRotate on, suspended off → autoRotate=true, speed=0.34', () => {
        const controls = { autoRotate: false, autoRotateSpeed: 0 }
        const state = { autoRotate: true, autoRotateSuspended: false }
        const appStateRef = { autoRotate: true, autoRotateSuspended: false }

        applyAutoRotateConfig(controls, state, appStateRef)

        expect(controls.autoRotate).toBe(true)
        expect(controls.autoRotateSpeed).toBe(0.34)
    })

    it('autoRotate on, suspended on → autoRotate=false', () => {
        const controls = { autoRotate: false, autoRotateSpeed: 0 }
        const state = { autoRotate: true, autoRotateSuspended: true }
        const appStateRef = { autoRotate: true, autoRotateSuspended: true }

        applyAutoRotateConfig(controls, state, appStateRef)

        expect(controls.autoRotate).toBe(false)
        expect(controls.autoRotateSpeed).toBe(0.34)
    })

    it('autoRotate off → autoRotate=false', () => {
        const controls = { autoRotate: false, autoRotateSpeed: 0 }
        const state = { autoRotate: false, autoRotateSuspended: false }
        const appStateRef = { autoRotate: false, autoRotateSuspended: false }

        applyAutoRotateConfig(controls, state, appStateRef)

        expect(controls.autoRotate).toBe(false)
        expect(controls.autoRotateSpeed).toBe(0.34)
    })

    it('appState.autoRotate on, state null → autoRotate=true', () => {
        const controls = { autoRotate: false, autoRotateSpeed: 0 }
        const appStateRef = { autoRotate: true, autoRotateSuspended: false }

        applyAutoRotateConfig(controls, null, appStateRef)

        expect(controls.autoRotate).toBe(true)
    })

    it('state.autoRotate on (appState off) → autoRotate=true', () => {
        const controls = { autoRotate: false, autoRotateSpeed: 0 }
        const state = { autoRotate: true, autoRotateSuspended: false }
        const appStateRef = { autoRotate: false, autoRotateSuspended: false }

        applyAutoRotateConfig(controls, state, appStateRef)

        expect(controls.autoRotate).toBe(true)
    })

    it('appState.autoRotateSuspended on (state off) → autoRotate=false', () => {
        const controls = { autoRotate: false, autoRotateSpeed: 0 }
        const state = { autoRotate: true, autoRotateSuspended: false }
        const appStateRef = { autoRotate: true, autoRotateSuspended: true }

        applyAutoRotateConfig(controls, state, appStateRef)

        expect(controls.autoRotate).toBe(false)
    })
})

// ══════════════════════════════════════════════════════════════════════════════
// 4. exposeDevEngineBridge (C16)
// ══════════════════════════════════════════════════════════════════════════════

describe('exposeDevEngineBridge (C16)', () => {
    interface WindowWithBridge {
        __semanticEngine?: {
            readonly renderer: unknown
            readonly scene: unknown
            readonly camera: unknown
            readonly canvas: HTMLCanvasElement | null
            renderOnce: () => void
        }
    }

    function makeTestWindow(): WindowWithBridge & { document: any } {
        return {
            __semanticEngine: undefined,
            document: { getElementById: vi.fn() }
        } as any
    }

    it('DEV + window + webglContext set → exposes __semanticEngine with lazy getters', () => {
        const fakeRenderer = { render: vi.fn(), domElement: document.createElement('canvas') }
        const fakeScene = { name: 'scene' }
        const fakeCamera = { name: 'camera' }
        _webglContextProxy.renderer = fakeRenderer
        _webglContextProxy.scene = fakeScene
        _webglContextProxy.camera = fakeCamera

        const win = makeTestWindow()
        exposeDevEngineBridge(true, win as any)

        expect(win.__semanticEngine).toBeDefined()
        expect(win.__semanticEngine!.renderer).toBe(fakeRenderer)
        expect(win.__semanticEngine!.scene).toBe(fakeScene)
        expect(win.__semanticEngine!.camera).toBe(fakeCamera)
        expect(win.__semanticEngine!.canvas).toBe(fakeRenderer.domElement)
    })

    it('DEV + window + webglContext set → renderOnce() calls renderer.render(scene, camera)', () => {
        const fakeRenderer = { render: vi.fn(), domElement: document.createElement('canvas') }
        const fakeScene = { name: 'scene' }
        const fakeCamera = { name: 'camera' }
        _webglContextProxy.renderer = fakeRenderer
        _webglContextProxy.scene = fakeScene
        _webglContextProxy.camera = fakeCamera

        const win = makeTestWindow()
        exposeDevEngineBridge(true, win as any)

        win.__semanticEngine!.renderOnce()
        expect(fakeRenderer.render).toHaveBeenCalledWith(fakeScene, fakeCamera)
    })

    it('DEV + window + some webglContext null → renderOnce() is a no-op', () => {
        _webglContextProxy.renderer = null
        _webglContextProxy.scene = { name: 'scene' }
        _webglContextProxy.camera = { name: 'camera' }

        const win = makeTestWindow()
        exposeDevEngineBridge(true, win as any)

        expect(win.__semanticEngine).toBeDefined()
        expect(() => win.__semanticEngine!.renderOnce()).not.toThrow()
    })

    it('DEV=false → __semanticEngine NOT set on window', () => {
        const win = makeTestWindow()
        exposeDevEngineBridge(false, win as any)

        expect(win.__semanticEngine).toBeUndefined()
    })

    it('typeof window === "undefined" → no crash, no exposure', () => {
        expect(() => exposeDevEngineBridge(true, undefined as any)).not.toThrow()
    })

    it('lazy getters reflect runtime changes to webglContext', () => {
        _webglContextProxy.renderer = { render: vi.fn(), domElement: null }
        _webglContextProxy.scene = { name: 'scene-v1' }
        _webglContextProxy.camera = { name: 'camera-v1' }

        const win = makeTestWindow()
        exposeDevEngineBridge(true, win as any)

        expect(win.__semanticEngine!.scene).toEqual({ name: 'scene-v1' })

        // Mutate the module-scope proxy (simulates real runtime change)
        _webglContextProxy.scene = { name: 'scene-v2' }
        expect(win.__semanticEngine!.scene).toEqual({ name: 'scene-v2' })
    })

    it('canvas getter returns null when renderer is null', () => {
        _webglContextProxy.renderer = null
        _webglContextProxy.scene = { name: 'scene' }
        _webglContextProxy.camera = { name: 'camera' }

        const win = makeTestWindow()
        exposeDevEngineBridge(true, win as any)

        expect(win.__semanticEngine!.canvas).toBeNull()
    })
})
