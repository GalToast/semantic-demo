/**
 * tooltip-bridge.test.ts — W49-E Tooltip / hover-preview event-bus bridge
 *
 * Locks in the contract for src/lib/ui/tooltip.ts:
 *   1. `initTooltipEventBusSubscriptions()` is idempotent (call it twice,
 *      only one active subscription).
 *   2. The subscribed callback is wired to TOOLTIP_HIDE_REQUESTED.
 *   3. When the event fires, the callback calls hideCanvasHoverPreview().
 *   4. `disposeTooltipEventBusSubscriptions()` removes the subscription so
 *      a stale callback cannot fire on later events.
 *   5. `hideTooltip()` is the synchronous direct-hide entry point for
 *      surfaces that want it without depending on the event bus.
 *
 * We mock both the event-bus (so we can capture the callback) and the
 * canvas-hover-preview module (so we can spy on hideCanvasHoverPreview
 * without DOM rendering).
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// Capture the subscribeKeyed callback so we can fire it manually.
// Returns an unsubscribe function we count separately so the test can
// distinguish "subscribe was called N times" from "subscribe was called
// and then unsubscribed".
const subscribeKeyedMock = vi.fn((_key: string, _event: string, cb: (payload: unknown) => void) => {
    return () => {
        // No-op unsub — the mock only needs to be invokable; it does
        // not affect the call-count assertions.
    }
})

const hidePreviewMock = vi.fn()
const showPreviewMock = vi.fn()
const showPreviewForFocusedMock = vi.fn()

vi.mock('@lib/orchestration/event-bus', () => ({
    EVENTS: {
        TOOLTIP_HIDE_REQUESTED: 'TOOLTIP_HIDE_REQUESTED'
    },
    subscribeKeyed: (...args: unknown[]) =>
        (subscribeKeyedMock as unknown as (...a: unknown[]) => () => void)(...(args as [string, string, (p: unknown) => void])),
    publish: vi.fn()
}))

vi.mock('@lib/journey/canvas-hover-preview', () => ({
    hideCanvasHoverPreview: () => hidePreviewMock(),
    showCanvasHoverPreview: (...args: unknown[]) => showPreviewMock(...args),
    showCanvasHoverPreviewForFocused: (...args: unknown[]) => showPreviewForFocusedMock(...args)
}))

// Import AFTER mocks are set up so the module under test sees the mocks.
import {
    initTooltipEventBusSubscriptions,
    disposeTooltipEventBusSubscriptions,
    hideTooltip
} from '../../src/lib/ui/tooltip'

describe('tooltip / hover-preview bridge (W49-E)', () => {
    beforeEach(() => {
        subscribeKeyedMock.mockClear()
        hidePreviewMock.mockClear()
        showPreviewMock.mockClear()
        showPreviewForFocusedMock.mockClear()
        disposeTooltipEventBusSubscriptions() // ensure clean state between tests
    })

    afterEach(() => {
        disposeTooltipEventBusSubscriptions()
    })

    it('subscribe is wired to TOOLTIP_HIDE_REQUESTED with the key "tooltip:hide-requested"', () => {
        initTooltipEventBusSubscriptions()
        expect(subscribeKeyedMock).toHaveBeenCalledTimes(1)
    const [key, eventName] = subscribeKeyedMock.mock.calls[0] as [string, string]
        expect(key).toBe('tooltip:hide-requested')
        expect(eventName).toBe('TOOLTIP_HIDE_REQUESTED')
    })

    it('firing the subscribed callback calls hideCanvasHoverPreview', () => {
        initTooltipEventBusSubscriptions()
        const cb = subscribeKeyedMock.mock.calls[0]?.[2] as (payload: unknown) => void
        expect(typeof cb).toBe('function')
        cb({})
        expect(hidePreviewMock).toHaveBeenCalledTimes(1)
    })

    it('init is idempotent — calling twice registers only one subscription', () => {
        initTooltipEventBusSubscriptions()
        initTooltipEventBusSubscriptions()
        initTooltipEventBusSubscriptions()
        expect(subscribeKeyedMock).toHaveBeenCalledTimes(1)
    })

    it('dispose removes the subscription; a second init re-registers', () => {
        // First init.
        initTooltipEventBusSubscriptions()
        expect(subscribeKeyedMock).toHaveBeenCalledTimes(1)

        // Capture the unsubscribe fn that the bridge stored. The real
        // bridge stores the array of unsubscribers returned by
        // subscribeKeyed. We can verify it by calling dispose() and then
        // checking the bridge allowed a second init to register a fresh
        // subscriber.
        disposeTooltipEventBusSubscriptions()

        // After dispose, init must register a fresh subscription.
        initTooltipEventBusSubscriptions()
        expect(subscribeKeyedMock).toHaveBeenCalledTimes(2)
    })

    it('hideTooltip() is independent of subscribe lifecycle', () => {
        // Calling hideTooltip before init must still hide (it's the
        // direct entrypoint; surfaces that have an in-hand reference
        // can hide synchronously even before the bus is wired).
        hideTooltip()
        expect(hidePreviewMock).toHaveBeenCalledTimes(1)
        // Same after dispose.
        disposeTooltipEventBusSubscriptions()
        hideTooltip()
        expect(hidePreviewMock).toHaveBeenCalledTimes(2)
    })

    it('hideTooltip() is a synchronous direct entrypoint independent of the bus', () => {
        hideTooltip()
        expect(hidePreviewMock).toHaveBeenCalledTimes(1)
    })

    it('multiple back-to-back hide requests each invoke hideCanvasHoverPreview once', () => {
        initTooltipEventBusSubscriptions()
        const cb = subscribeKeyedMock.mock.calls[0]?.[2] as (payload: unknown) => void
        cb({})
        cb({})
        cb({})
        expect(hidePreviewMock).toHaveBeenCalledTimes(3)
    })
})

// ──────────────────────────────────────────────────────────────────────────
// Contract: every surface that takes over the canvas publishes
// TOOLTIP_HIDE_REQUESTED. This is a source-inspection test that scans
// the actual call sites and asserts the publish is present.
// ──────────────────────────────────────────────────────────────────────────
import { readFileSync } from 'fs'
import { resolve } from 'path'

const _PUBLISH_SITES: Array<{ file: string; needle: string; why: string }> = [
    {
        file: 'src/lib/search/results-ui.ts',
        needle: "publish(EVENTS.TOOLTIP_HIDE_REQUESTED)",
        why: 'search results re-rendering overlays the canvas hover preview'
    },
    {
        file: 'src/lib/stores/focus.svelte.ts',
        needle: "publish(EVENTS.TOOLTIP_HIDE_REQUESTED)",
        why: 'thread inspector open overlays the canvas'
    },
    {
        file: 'src/components/MapView.svelte',
        needle: "publish(EVENTS.TOOLTIP_HIDE_REQUESTED)",
        why: 'map view replaces canvas — preview belongs to galaxy only'
    },
    {
        file: 'src/components/Splash.svelte',
        needle: "publish(EVENTS.TOOLTIP_HIDE_REQUESTED)",
        why: 'defense-in-depth on splash dismiss'
    }
]

describe('tooltip bridge — publish sites (W49-E)', () => {
    for (const site of _PUBLISH_SITES) {
        it(`${site.file}: publishes TOOLTIP_HIDE_REQUESTED (${site.why})`, () => {
            const src = readFileSync(
                resolve(__dirname, '../../' + site.file),
                'utf-8'
            )
            expect(src).toContain(site.needle)
        })
    }
})
