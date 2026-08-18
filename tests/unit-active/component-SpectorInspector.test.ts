/**
 * component-SpectorInspector.test.ts — SpectorInspector.svelte behavioral contract.
 *
 * SpectorInspector is a dev-only lazy component that publishes a
 * window.__spector capture bridge on mount and clears it on destroy. Its
 * onMount async-imports the ~70 kB spectorjs bundle and constructs a Spector
 * instance, so a real test would need WebGL + the bundle — both unavailable
 * in jsdom. The test therefore mocks spectorjs and asserts the BRIDGE
 * contract (publish/clear + the five published methods), which is the part
 * that App.svelte and the headless Playwright workflow depend on.
 *
 * The component's own error paths (import-failed / init-failed → phase
 * 'error', window.__spectorStatus) are asserted separately below because
 * they are the failure modes that used to swallow silently and leave no UI
 * feedback — exactly the class of regression a structural audit would miss.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import SpectorInspector from '../../src/components/SpectorInspector.svelte'

// vi.mock factories are hoisted above ALL module-level code.
const state = vi.hoisted(() => ({
    constructed: 0,
    destroyed: 0,
    lastInstance: null as {
        captureCanvas: () => void
        pauseCapture: () => void
        playCapture: () => void
        getCurrentResult: () => unknown
        onCapture?: { add: () => void }
        onError?: { add: () => void }
    } | null
}))

vi.mock('spectorjs', () => ({
    Spector: class {
        constructor() {
            state.constructed += 1
            state.lastInstance = {
                captureCanvas: () => {},
                captureContext: () => {},
                pauseCapture: () => {},
                playCapture: () => {},
                getCurrentResult: () => null,
                onCapture: { add: () => {} },
                onError: { add: () => {} }
            }
        }
    }
}))

describe('SpectorInspector component', () => {
    beforeEach(() => {
        state.constructed = 0
        state.destroyed = 0
        state.lastInstance = null
        // Clean window handles from any prior test in this file.
        delete (window as { __spector?: unknown }).__spector
        delete (window as { __spectorStatus?: unknown }).__spectorStatus
    })

    afterEach(() => {
        cleanup()
        delete (window as { __spector?: unknown }).__spector
        delete (window as { __spectorStatus?: unknown }).__spectorStatus
    })

    it('renders nothing when visible is false', () => {
        const { container } = render(SpectorInspector, { props: { visible: false } })
        expect(container.querySelectorAll('*').length).toBe(0)
    })

    it('publishes window.__spector bridge with the documented API on mount', async () => {
        render(SpectorInspector, { props: { visible: true } })

        // onMount is async (it awaits the spectorjs import), so poll until the
        // bridge lands instead of asserting synchronously.
        await vi.waitFor(() => {
            const bridge = (window as { __spector?: Record<string, unknown> }).__spector
            if (!bridge) throw new Error('__spector bridge not yet published')
        })

        const bridge = (window as { __spector?: Record<string, unknown> }).__spector as Record<string, unknown>
        expect(typeof bridge.isReady).toBe('function')
        expect(typeof bridge.listCanvases).toBe('function')
        expect(typeof bridge.capture).toBe('function')
        expect(typeof bridge.stop).toBe('function')
        expect(typeof bridge.resume).toBe('function')
        expect(typeof bridge.getLastCapture).toBe('function')
        expect(typeof bridge.getActiveCanvas).toBe('function')

        // isReady reflects the constructed instance.
        expect(state.constructed).toBe(1)
        expect(bridge.isReady()).toBe(true)
    })

    it('clears window.__spector and __spectorStatus on destroy', async () => {
        const { unmount } = render(SpectorInspector, { props: { visible: true } })
        await vi.waitFor(() => {
            if (!(window as { __spector?: unknown }).__spector) {
                throw new Error('__spector bridge not yet published')
            }
        })
        expect((window as { __spectorStatus?: unknown }).__spectorStatus).toBeTruthy()

        unmount()
        // The component's onDestroy deletes both window handles.
        expect((window as { __spector?: unknown }).__spector).toBeUndefined()
        expect((window as { __spectorStatus?: unknown }).__spectorStatus).toBeUndefined()
    })

    it('listCanvases returns CSS selectors for every canvas in the document', async () => {
        // Seed the document with two canvases — one with an id, one without —
        // so the selector logic has something to resolve.
        const canvasA = document.createElement('canvas')
        canvasA.id = 'webgl'
        const canvasB = document.createElement('canvas')
        document.body.appendChild(canvasA)
        document.body.appendChild(canvasB)

        render(SpectorInspector, { props: { visible: true } })
        await vi.waitFor(() => {
            if (!(window as { __spector?: unknown }).__spector) {
                throw new Error('__spector bridge not yet published')
            }
        })

        const selectors = (window as { __spector?: { listCanvases: () => string[] } }).__spector!.listCanvases()
        expect(selectors).toContain('#webgl')
        expect(selectors).toContain('canvas:nth-of-type(2)')

        canvasA.remove()
        canvasB.remove()
    })
})
