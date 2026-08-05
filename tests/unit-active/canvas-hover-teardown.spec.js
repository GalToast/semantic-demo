import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('canvas-hover-preview teardown', () => {
    let unsubscribeCallCount = 0
    let mockUnsubscribe

    beforeEach(() => {
        unsubscribeCallCount = 0
        mockUnsubscribe = vi.fn(() => {
            unsubscribeCallCount++
        })
    })

    afterEach(() => {
        vi.resetModules()
    })

    it('registers a subscription on init and unsubscribes on destroy', async () => {
        // Mock the event bus so we can observe the subscribe call and returned unsub.
        vi.doMock('@lib/orchestration/event-bus', () => ({
            subscribeKeyed: vi.fn((_id, _event, _handler) => mockUnsubscribe),
            EVENTS: { CAMERA_NODE_FOCUSED: 'camera-node-focused' }
        }))

        const { initCanvasHoverPreviewSubscription, destroyCanvasHoverPreview } =
            await import('@lib/journey/canvas-hover-preview')

        // Init should register exactly one subscription.
        initCanvasHoverPreviewSubscription()

        const { subscribeKeyed } = await import('@lib/orchestration/event-bus')
        expect(subscribeKeyed).toHaveBeenCalledTimes(1)

        // Destroy should call the returned unsubscribe.
        destroyCanvasHoverPreview()
        expect(mockUnsubscribe).toHaveBeenCalledTimes(1)
        expect(unsubscribeCallCount).toBe(1)

        // Calling destroy again should be safe (idempotent).
        expect(() => destroyCanvasHoverPreview()).not.toThrow()
        expect(mockUnsubscribe).toHaveBeenCalledTimes(1) // still only once
    }, 60000)

    it('removes the preview DOM element on destroy', async () => {
        const { initCanvasHoverPreviewSubscription, destroyCanvasHoverPreview, showCanvasHoverPreview } =
            await import('@lib/journey/canvas-hover-preview')

        initCanvasHoverPreviewSubscription()

        // Show preview to create the DOM element.
        showCanvasHoverPreview(0, 100, 100)
        expect(document.getElementById('canvas-hover-preview')).not.toBeNull()

        // Destroy should remove it.
        destroyCanvasHoverPreview()
        expect(document.getElementById('canvas-hover-preview')).toBeNull()
    })
})
