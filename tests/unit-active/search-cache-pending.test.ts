import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    acquireSearchLock,
    clearPendingSearch,
    clearSearchCache,
    getPendingSearch,
    getSearchCacheDiagnostics,
    setPendingSearch,
    setSearchCacheTTL
} from '../../src/lib/search/cache'

describe('search-cache pending-request dedup', () => {
    beforeEach(() => {
        vi.useRealTimers()
        clearSearchCache()
        setSearchCacheTTL(5 * 60 * 1000)
    })

    afterEach(() => {
        clearSearchCache()
        vi.restoreAllMocks()
    })

    it('returns null before a request is registered', () => {
        expect(getPendingSearch('coffee', 0, 0)).toBeNull()
        expect(getSearchCacheDiagnostics().pending).toBe(0)
    })

    it('returns the same in-flight promise for identical query/page/offset keys', () => {
        const pending = Promise.resolve([{ id: 'p1', name: 'Coffee', index: 0, score: 1, category: '', snippet: '' }])

        setPendingSearch('coffee', 0, 0, pending)

        expect(getPendingSearch('coffee', 0, 0)).toBe(pending)
        expect(getPendingSearch('coffee', 0, 0)).toBe(getPendingSearch('coffee', 0, 0))
        expect(getSearchCacheDiagnostics().pending).toBe(1)
    })

    it('returns the same in-flight promise when callers share the same AbortSignal', () => {
        const controller = new AbortController()
        const pending = Promise.resolve([{ id: 'p1', name: 'Coffee', index: 0, score: 1, category: '', snippet: '' }])

        setPendingSearch('coffee', 0, 0, pending, controller.signal)

        expect(getPendingSearch('coffee', 0, 0, controller.signal)).toBe(pending)
        expect(getSearchCacheDiagnostics().pending).toBe(1)
    })

    it('returns null for a different AbortSignal on the same key', () => {
        const controllerA = new AbortController()
        const controllerB = new AbortController()
        const pending = Promise.resolve([])

        setPendingSearch('coffee', 0, 0, pending, controllerA.signal)

        expect(getPendingSearch('coffee', 0, 0, controllerB.signal)).toBeNull()
        expect(getSearchCacheDiagnostics().pending).toBe(1)
    })

    it('isolates pending requests by AbortSignal identity (no-signal lookup does not share a signal-bound promise)', () => {
        const controller = new AbortController()
        const pending = Promise.resolve([])

        setPendingSearch('coffee', 0, 0, pending, controller.signal)

        // A no-signal lookup must NOT reuse a promise tied to a specific
        // AbortSignal, otherwise the caller would lose abort propagation.
        expect(getPendingSearch('coffee', 0, 0)).toBeNull()
        // Re-using the exact same signal is still allowed.
        expect(getPendingSearch('coffee', 0, 0, controller.signal)).toBe(pending)
        expect(getSearchCacheDiagnostics().pending).toBe(1)
    })

    it('isolates pending requests by query, page, and offset', () => {
        const coffeePage0 = Promise.resolve([])
        const coffeePage1 = Promise.resolve([])
        const teaPage0 = Promise.resolve([])

        setPendingSearch('coffee', 0, 0, coffeePage0)
        setPendingSearch('coffee', 1, 18, coffeePage1)
        setPendingSearch('tea', 0, 0, teaPage0)

        expect(getPendingSearch('coffee', 0, 0)).toBe(coffeePage0)
        expect(getPendingSearch('coffee', 1, 18)).toBe(coffeePage1)
        expect(getPendingSearch('tea', 0, 0)).toBe(teaPage0)
        expect(getSearchCacheDiagnostics().pending).toBe(3)
    })

    it('auto-removes resolved pending requests after settlement', async () => {
        const pending = Promise.resolve([])
        setPendingSearch('coffee', 0, 0, pending)

        await pending
        await Promise.resolve()

        expect(getPendingSearch('coffee', 0, 0)).toBeNull()
        expect(getSearchCacheDiagnostics().pending).toBe(0)
    })

    it('auto-removes rejected pending requests without leaking an unhandled rejection', async () => {
        const expected = new Error('network failed')
        const pending = Promise.reject(expected)

        setPendingSearch('coffee', 0, 0, pending)

        await expect(pending).rejects.toBe(expected)
        await Promise.resolve()

        expect(getPendingSearch('coffee', 0, 0)).toBeNull()
        expect(getSearchCacheDiagnostics().pending).toBe(0)
    })

    it('allows callers to clear one pending request without clearing other keys', () => {
        const coffee = Promise.resolve([])
        const tea = Promise.resolve([])

        setPendingSearch('coffee', 0, 0, coffee)
        setPendingSearch('tea', 0, 0, tea)

        clearPendingSearch('coffee', 0, 0)

        expect(getPendingSearch('coffee', 0, 0)).toBeNull()
        expect(getPendingSearch('tea', 0, 0)).toBe(tea)
        expect(getSearchCacheDiagnostics().pending).toBe(1)
    })

    it('clears cached and pending state together', () => {
        setPendingSearch('coffee', 0, 0, Promise.resolve([]))

        clearSearchCache()

        expect(getPendingSearch('coffee', 0, 0)).toBeNull()
        expect(getSearchCacheDiagnostics().pending).toBe(0)
    })
})

describe('search-cache advisory lock graceful behavior', () => {
    it('returns a safe release function in jsdom/browser-like environments', async () => {
        const release = await acquireSearchLock('coffee', 0, 1)

        expect(typeof release).toBe('function')
        expect(() => release()).not.toThrow()
    })
})
