import { describe, it, expect, vi } from 'vitest'
import { ResourceTracker } from '@lib/engine/resource-tracker'

describe('ResourceTracker', () => {
    it('disposes tracked resources and clears the set', () => {
        const tracker = new ResourceTracker()
        const disposable = { dispose: vi.fn() }
        tracker.track(disposable)
        tracker.dispose()
        expect(disposable.dispose).toHaveBeenCalledOnce()
        expect(tracker.size).toBe(0)
    })

    it('does not throw when a dispose callback throws', () => {
        const tracker = new ResourceTracker()
        const good = { dispose: vi.fn() }
        const bad = {
            dispose: vi.fn(() => {
                throw new Error('boom')
            })
        }
        tracker.track(good)
        tracker.track(bad)
        expect(() => tracker.dispose()).not.toThrow()
        expect(good.dispose).toHaveBeenCalledOnce()
        expect(bad.dispose).toHaveBeenCalledOnce()
    })

    it('is safe to dispose twice', () => {
        const tracker = new ResourceTracker()
        const disposable = { dispose: vi.fn() }
        tracker.track(disposable)
        tracker.dispose()
        tracker.dispose()
        expect(disposable.dispose).toHaveBeenCalledOnce()
    })

    it('does not double-dispose a resource re-added during dispose', () => {
        const tracker = new ResourceTracker()
        const child = { dispose: vi.fn() }
        const parent: { dispose: () => void; children: unknown[] } = {
            dispose: () => {
                /* parent disposal */
            },
            children: [child]
        }
        tracker.track(parent)
        tracker.dispose()
        // Parent and child are both disposed once; child is not disposed again
        // because the set is cleared before any dispose callback runs.
        expect(child.dispose).toHaveBeenCalledOnce()
    })
})
