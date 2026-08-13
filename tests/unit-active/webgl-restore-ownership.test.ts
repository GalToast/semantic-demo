/**
 * @vitest-environment jsdom
 *
 * Focused test for webglcontextrestored ownership between engine DisposableRegistry
 * and app-init fallback. Proves:
 * 1. When both listeners are installed on the same fake canvas, one restore event
 *    cannot trigger two init/reinit paths.
 * 2. Ownership is released on registry disposal so a later fallback can take over.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
    claimRestoreOwnership,
    releaseRestoreOwnership,
    takeRestoreOwnership,
    isRestoreOwned,
    getRestoreOwner,
    _resetRestoreOwnershipForTest
} from '@lib/engine/webgl-restore-ownership'
import { DisposableRegistry } from '@lib/utils/disposable-registry'
import { registerContextListeners } from '@lib/engine/three-listener-registration'
import { setupWebglContextRestore } from '@lib/orchestration/app-init'
import type { WebGLRenderer } from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

// ── Test-only mock renderers/canvases ────────────────────────────────────────

function createMockCanvas(): HTMLCanvasElement {
    return document.createElement('canvas')
}

function createMockRenderer(): WebGLRenderer {
    return { domElement: createMockCanvas() } as unknown as WebGLRenderer
}

function createMockControls(): OrbitControls {
    return new EventTarget() as unknown as OrbitControls
}

function mountCanvas(containerId: string, canvas: HTMLCanvasElement): void {
    let container = document.getElementById(containerId)
    if (!container) {
        container = document.createElement('div')
        container.id = containerId
        document.body.appendChild(container)
    }
    container.appendChild(canvas)
}

function unmountCanvas(containerId: string): void {
    const container = document.getElementById(containerId)
    if (container) {
        container.remove()
    }
}

// ── Test sinks ────────────────────────────────────────────────────────────────

function createTestSinks() {
    const engineState = {
        webglContextLost: false,
        webglNeedsRestoreReinit: false,
        webglRestore: null,
        webglRestoreTimer: null,
        rafId: null,
        idleFrameTimerId: null,
        circuitBreakerTripped: false,
        uiFeedback: { showExperienceToast: vi.fn(), syncSearchStatusForFocus: vi.fn() },
        cameraControls: null
    }
    return {
        engineState,
        webglContext: { renderer: null, scene: null, camera: null },
        document: globalThis.document,
        windowObj: globalThis.window,
        pauseRenderLoopTimers: vi.fn(),
        debugError: vi.fn(),
        cameraAssistMs: 0
    }
}

beforeEach(() => {
    _resetRestoreOwnershipForTest()
    vi.clearAllMocks()
    // Ensure #canvas-container exists
    if (!document.getElementById('canvas-container')) {
        const container = document.createElement('div')
        container.id = 'canvas-container'
        document.body.appendChild(container)
    }
})

afterEach(() => {
    _resetRestoreOwnershipForTest()
    unmountCanvas('canvas-container')
})

describe('webgl-restore-ownership — per-canvas ownership', () => {
    it('claimRestoreOwnership succeeds for first registry on a canvas', () => {
        const canvas = createMockCanvas()
        const registry = new DisposableRegistry()
        expect(claimRestoreOwnership(canvas, registry)).toBe(true)
        expect(isRestoreOwned(canvas)).toBe(true)
        expect(getRestoreOwner(canvas)).toBe(registry)
    })

    it('claimRestoreOwnership fails for second registry on same canvas', () => {
        const canvas = createMockCanvas()
        const registry1 = new DisposableRegistry()
        const registry2 = new DisposableRegistry()
        expect(claimRestoreOwnership(canvas, registry1)).toBe(true)
        expect(claimRestoreOwnership(canvas, registry2)).toBe(false)
        expect(getRestoreOwner(canvas)).toBe(registry1)
    })

    it('claimRestoreOwnership succeeds for different canvases independently', () => {
        const canvas1 = createMockCanvas()
        const canvas2 = createMockCanvas()
        const registry1 = new DisposableRegistry()
        const registry2 = new DisposableRegistry()
        expect(claimRestoreOwnership(canvas1, registry1)).toBe(true)
        expect(claimRestoreOwnership(canvas2, registry2)).toBe(true)
        expect(getRestoreOwner(canvas1)).toBe(registry1)
        expect(getRestoreOwner(canvas2)).toBe(registry2)
    })

    it('releaseRestoreOwnership clears ownership for that canvas', () => {
        const canvas = createMockCanvas()
        const registry = new DisposableRegistry()
        claimRestoreOwnership(canvas, registry)
        releaseRestoreOwnership(canvas, registry)
        expect(isRestoreOwned(canvas)).toBe(false)
        expect(getRestoreOwner(canvas)).toBeNull()
    })

    it('releaseRestoreOwnership is no-op for non-owner registry', () => {
        const canvas = createMockCanvas()
        const registry1 = new DisposableRegistry()
        const registry2 = new DisposableRegistry()
        claimRestoreOwnership(canvas, registry1)
        releaseRestoreOwnership(canvas, registry2) // not the owner
        expect(isRestoreOwned(canvas)).toBe(true)
        expect(getRestoreOwner(canvas)).toBe(registry1)
    })

    it('engine ownership can replace a fallback and run its cleanup', () => {
        const canvas = createMockCanvas()
        const fallbackOwner = {}
        const fallbackCleanup = vi.fn()
        const engineOwner = new DisposableRegistry()

        expect(
            claimRestoreOwnership(canvas, fallbackOwner, {
                kind: 'fallback',
                cleanup: fallbackCleanup
            })
        ).toBe(true)
        expect(takeRestoreOwnership(canvas, engineOwner)).toBe(true)
        expect(fallbackCleanup).toHaveBeenCalledOnce()
        expect(getRestoreOwner(canvas)).toBe(engineOwner)
    })

    it('registry disposal releases ownership via cleanup callback', () => {
        const renderer = createMockRenderer()
        const controls = createMockControls()
        const sinks = createTestSinks()

        // Go through registerContextListeners which adds the cleanup callback
        const registry = registerContextListeners({ renderer, controls, restartLoop: vi.fn() }, sinks)
        expect(isRestoreOwned(renderer.domElement)).toBe(true)

        registry.disposeAll()
        expect(isRestoreOwned(renderer.domElement)).toBe(false)
    })
})

describe('three-listener-registration — ownership integration', () => {
    it('registerContextListeners claims ownership for renderer.domElement', () => {
        const renderer = createMockRenderer()
        const controls = createMockControls()
        const sinks = createTestSinks()

        const registry = registerContextListeners({ renderer, controls, restartLoop: vi.fn() }, sinks)

        expect(isRestoreOwned(renderer.domElement)).toBe(true)
        expect(getRestoreOwner(renderer.domElement)).toBe(registry)
    })

    it('owning registry attaches context handlers and disposal removes them', () => {
        const renderer = createMockRenderer()
        const controls = createMockControls()
        const sinks = createTestSinks()
        const restartLoop = vi.fn()
        const registry = registerContextListeners({ renderer, controls, restartLoop }, sinks)

        renderer.domElement.dispatchEvent(new window.Event('webglcontextlost', { cancelable: true }))
        expect(sinks.engineState.webglContextLost).toBe(true)
        expect(sinks.pauseRenderLoopTimers).toHaveBeenCalledWith({ clearRestoreTimer: true })

        renderer.domElement.dispatchEvent(new window.Event('webglcontextrestored'))
        expect(sinks.engineState.webglNeedsRestoreReinit).toBe(true)
        expect(restartLoop).toHaveBeenCalledOnce()

        registry.disposeAll()
        sinks.engineState.webglNeedsRestoreReinit = false
        renderer.domElement.dispatchEvent(new window.Event('webglcontextrestored'))
        expect(sinks.engineState.webglNeedsRestoreReinit).toBe(false)
    })

    it('registerContextListeners logs when ownership already claimed', () => {
        const renderer = createMockRenderer()
        const controls = createMockControls()
        const sinks = createTestSinks()

        // First registry claims ownership
        const registry1 = registerContextListeners({ renderer, controls, restartLoop: vi.fn() }, sinks)
        expect(isRestoreOwned(renderer.domElement)).toBe(true)

        // Second registry on same canvas should log and skip the duplicate
        // restore listener set while the first registry remains authoritative.
        const secondRestart = vi.fn()
        const secondSinks = createTestSinks()
        const registry2 = registerContextListeners({ renderer, controls, restartLoop: secondRestart }, secondSinks)
        expect(secondSinks.debugError).toHaveBeenCalledWith(
            expect.stringContaining('Restore ownership already claimed')
        )
        // First registry still owns it
        expect(getRestoreOwner(renderer.domElement)).toBe(registry1)

        renderer.domElement.dispatchEvent(new window.Event('webglcontextrestored'))
        expect(sinks.engineState.webglNeedsRestoreReinit).toBe(true)
        expect(secondSinks.engineState.webglNeedsRestoreReinit).toBe(false)
        expect(secondRestart).not.toHaveBeenCalled()

        registry1.disposeAll()
        registry2.disposeAll()
    })

    it('does not attach visibility or control listeners for a duplicate registry', () => {
        const renderer = createMockRenderer()
        const controls1 = createMockControls()
        const controls2 = createMockControls()
        const sinks1 = createTestSinks()
        const sinks2 = createTestSinks()
        const firstRestart = vi.fn()
        const secondRestart = vi.fn()
        const cameraControls = {
            releaseFocusCameraAssist: vi.fn(),
            noteSceneInteraction: vi.fn(),
            scheduleAutoRotateResume: vi.fn()
        }
        sinks2.engineState.cameraControls = cameraControls
        sinks2.webglContext = { renderer: null, scene: null, camera: null }

        const registry1 = registerContextListeners({ renderer, controls: controls1, restartLoop: firstRestart }, sinks1)
        const registry2 = registerContextListeners(
            { renderer, controls: controls2, restartLoop: secondRestart },
            sinks2
        )

        document.dispatchEvent(new window.Event('visibilitychange'))
        controls2.dispatchEvent(new window.Event('start') as any)
        controls2.dispatchEvent(new window.Event('end') as any)

        expect(secondRestart).not.toHaveBeenCalled()
        expect(cameraControls.releaseFocusCameraAssist).not.toHaveBeenCalled()
        expect(cameraControls.noteSceneInteraction).not.toHaveBeenCalled()
        expect(cameraControls.scheduleAutoRotateResume).not.toHaveBeenCalled()

        registry1.disposeAll()
        registry2.disposeAll()
    })

    it('registry disposal releases ownership so new registry can claim', () => {
        const renderer = createMockRenderer()
        const controls = createMockControls()
        const sinks = createTestSinks()

        const registry1 = registerContextListeners({ renderer, controls, restartLoop: vi.fn() }, sinks)
        expect(isRestoreOwned(renderer.domElement)).toBe(true)

        registry1.disposeAll()
        expect(isRestoreOwned(renderer.domElement)).toBe(false)

        // New registry can now claim
        const registry2 = registerContextListeners({ renderer, controls, restartLoop: vi.fn() }, sinks)
        expect(isRestoreOwned(renderer.domElement)).toBe(true)
        expect(getRestoreOwner(renderer.domElement)).toBe(registry2)
    })
})

describe('app-init fallback — ownership check', () => {
    it('setupWebglContextRestore yields when engine registry owns the canvas', async () => {
        const renderer = createMockRenderer()
        const controls = createMockControls()
        const sinks = createTestSinks()

        // Mount the canvas so app-init's DOM query finds it
        mountCanvas('canvas-container', renderer.domElement)

        // Engine registry claims ownership first
        const registry = registerContextListeners({ renderer, controls, restartLoop: vi.fn() }, sinks)
        expect(isRestoreOwned(renderer.domElement)).toBe(true)

        // App-init fallback should detect ownership and return no-op cleanup
        const cleanup = setupWebglContextRestore()
        expect(typeof cleanup).toBe('function')
        expect(getRestoreOwner(renderer.domElement)).toBe(registry)

        // Cleanup
        cleanup()
        unmountCanvas('canvas-container')
    })

    it('setupWebglContextRestore installs listeners when no owner exists', async () => {
        const canvas = createMockCanvas()
        mountCanvas('canvas-container', canvas)

        // No owner - fallback should install listeners
        const cleanup = setupWebglContextRestore()
        expect(typeof cleanup).toBe('function')
        expect(isRestoreOwned(canvas)).toBe(true)

        // Cleanup should remove listeners
        cleanup()
        expect(isRestoreOwned(canvas)).toBe(false)
        unmountCanvas('canvas-container')
    })

    it('engine registration takes over a fallback without stacking restore handlers', () => {
        const renderer = createMockRenderer()
        const controls = createMockControls()
        const sinks = createTestSinks()
        const restartLoop = vi.fn()

        mountCanvas('canvas-container', renderer.domElement)
        const fallbackCleanup = setupWebglContextRestore()
        expect(isRestoreOwned(renderer.domElement)).toBe(true)

        const registry = registerContextListeners({ renderer, controls, restartLoop }, sinks)
        expect(getRestoreOwner(renderer.domElement)).toBe(registry)

        renderer.domElement.dispatchEvent(new window.Event('webglcontextrestored'))
        expect(restartLoop).toHaveBeenCalledOnce()
        expect(sinks.engineState.webglNeedsRestoreReinit).toBe(true)

        registry.disposeAll()
        fallbackCleanup()
        unmountCanvas('canvas-container')
    })
})

describe('full ownership cycle — duplicate restore prevention', () => {
    it('one restore event on a canvas with both registry and fallback only triggers one path', async () => {
        const renderer = createMockRenderer()
        const controls = createMockControls()
        const sinks = createTestSinks()

        // Mount the canvas so app-init's DOM query finds it
        mountCanvas('canvas-container', renderer.domElement)

        // Engine registry owns the canvas (primary path)
        const registry = registerContextListeners({ renderer, controls, restartLoop: vi.fn() }, sinks)

        // App-init fallback sees ownership and yields (returns no-op)
        const fallbackCleanup = setupWebglContextRestore()

        // Verify ownership is claimed by registry
        expect(isRestoreOwned(renderer.domElement)).toBe(true)
        expect(getRestoreOwner(renderer.domElement)).toBe(registry)

        // Verify fallback yielded (ownership check returned early)
        // The fallback cleanup is a no-op function
        expect(typeof fallbackCleanup).toBe('function')

        const restartLoop = vi.fn()
        registry.disposeAll()
        const nextRegistry = registerContextListeners({ renderer, controls, restartLoop }, sinks)
        const secondFallbackCleanup = setupWebglContextRestore()

        // Dispatch the real DOM event. The owning engine registry handles it;
        // the fallback remains a no-op because ownership is already claimed.
        renderer.domElement.dispatchEvent(new window.Event('webglcontextrestored'))

        expect(sinks.engineState.webglNeedsRestoreReinit).toBe(true)
        expect(sinks.engineState.webglContextLost).toBe(false)
        expect(sinks.debugError).toHaveBeenCalledWith(
            '[three-engine] WebGL context restored — full re-initialization required'
        )
        expect(restartLoop).toHaveBeenCalledOnce()

        // Cleanup
        nextRegistry.disposeAll()
        fallbackCleanup()
        secondFallbackCleanup()
        unmountCanvas('canvas-container')
    })

    it('after registry disposal, fallback can take ownership and handle restore', async () => {
        const renderer = createMockRenderer()
        const controls = createMockControls()
        const sinks = createTestSinks()

        // Mount the canvas so app-init's DOM query finds it
        mountCanvas('canvas-container', renderer.domElement)

        // Engine registry owns initially
        const registry = registerContextListeners({ renderer, controls, restartLoop: vi.fn() }, sinks)
        registry.disposeAll() // Registry torn down

        // Now fallback should be able to install listeners
        const fallbackCleanup = setupWebglContextRestore()

        // The fallback owns the canvas until its cleanup runs.
        expect(isRestoreOwned(renderer.domElement)).toBe(true)

        fallbackCleanup()
        expect(isRestoreOwned(renderer.domElement)).toBe(false)
        unmountCanvas('canvas-container')
    })
})
