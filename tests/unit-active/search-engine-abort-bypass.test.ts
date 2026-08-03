/**
 * search-engine-abort-bypass.test.ts — Caller AbortSignal must not poison api_unreachable
 *
 * Confirmed defect (2026-08-02): the inner fetch catch in
 * fetchSemanticSearchResultsDirect unconditionally called markApiUnreachable
 * before distinguishing a caller-initiated cancellation from a real API failure.
 * This caused a user-aborted/superseded request to set the sticky bypass flag,
 * making later (legitimate) searches skip the live API and return mock data.
 *
 * Surface coverage:
 *   1. A caller abort (AbortSignal triggered, NOT timedOut) does NOT set
 *      api_unreachable in sessionStorage.
 *   2. A genuine fetch failure (network error, non-caller) DOES set
 *      api_unreachable (preserving existing fallback behavior).
 *   3. A timeout abort (internal timer fires, timedOut=true, caller signal
 *      NOT aborted) DOES set api_unreachable (timeout = genuine API failure).
 *
 * Mocks fetch + sessionStorage directly; does not depend on live PHP.
 * Uses existing test patterns from mock-search-fallback-bypass.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readApiUnreachable, clearApiUnreachable } from '@lib/search/mock-search-fallback'
import { performSearch } from '@lib/search-engine'

function setUrlSearch(search: string): void {
    const url = new URL(window.location.href)
    url.search = search
    window.history.replaceState({}, '', url.toString())
}

describe('caller abort must not mark API unreachable', () => {
    beforeEach(() => {
        window.sessionStorage.removeItem('api_unreachable')
        clearApiUnreachable()
        setUrlSearch('')
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-08-02T12:00:00Z'))
    })

    afterEach(() => {
        window.sessionStorage.removeItem('api_unreachable')
        clearApiUnreachable()
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('does NOT set api_unreachable when the caller aborts (AbortSignal fires, not timedOut)', async () => {
        // Arrange: create a mock fetch that sits pending until the caller
        // aborts. Fetch implementations do not all use the same rejection
        // class for an externally aborted request.
        const abortController = new AbortController()
        let pendingFetchReject: (reason: unknown) => void = () => void 0
        const pendingFetch = new Promise<Response>((_resolve, reject) => {
            pendingFetchReject = reject
        })
        vi.spyOn(window, 'fetch').mockReturnValue(pendingFetch)

        // Act: start a search — it will enter retryWithBackoff and call fetch
        const searchPromise = performSearch('coffee', abortController.signal, 0, 0)

        // Give microtasks time to set up the fetch inside the retry loop
        await vi.advanceTimersByTimeAsync(50)

        // Abort the caller's signal — the onAbort callback calls controller.abort()
        abortController.abort()

        // Use a non-AbortError rejection to ensure the signal, not the error
        // class, controls bypass classification.
        pendingFetchReject(new TypeError('The operation was aborted'))

        // Let the search settle — it should propagate the AbortError (the
        // catch re-throws it, and retryWithBackoff also handles AbortError)
        await expect(searchPromise).rejects.toThrow(/abort/i)

        // Assert: api_unreachable must NOT be set for a caller-initiated abort
        const flag = readApiUnreachable()
        expect(flag).toBeNull()
    })

    it('DOES set api_unreachable on a genuine network failure, even when search falls back to local index', async () => {
        // Mock fetch to reject immediately with a network error (TypeError,
        // not AbortError, so isCallerAbort is false).
        vi.spyOn(window, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))

        const controller = new AbortController()
        const searchPromise = performSearch('coffee', controller.signal, 0, 0)

        // Advance timers past all retry attempts. The search may fall back
        // to the local index and return results — that's fine, we're
        // testing that the flag was set during the retry catch.
        await vi.advanceTimersByTimeAsync(30000)

        // The search may resolve to local-index results (static dev fallback)
        // OR reject — either is acceptable for this test; we only care
        // about the bypass flag.
        await expect(searchPromise).resolves.toBeDefined().catch(() => {})

        // Assert: api_unreachable must be set for a genuine network failure
        const flag = readApiUnreachable()
        expect(flag).not.toBeNull()
        expect(flag!.reason).toMatch(/failed to fetch/i)
    })

    it('DOES set api_unreachable on a timeout (timedOut=true, caller not aborting)', async () => {
        // Mock fetch to never resolve — only the internal timeout can
        // trigger rejection. The mock returns a promise that rejects
        // when the init.signal aborts (the internal timeout's abort).
        vi.spyOn(window, 'fetch').mockImplementation(
            (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
                const signal = init?.signal
                return new Promise<Response>((_resolve, reject) => {
                    if (!signal) {
                        reject(new Error('No signal'))
                        return
                    }
                    const onAbort = (): void => {
                        signal.removeEventListener('abort', onAbort)
                        reject(new DOMException('The operation was aborted', 'AbortError'))
                    }
                    if (signal.aborted) {
                        reject(new DOMException('The operation was aborted', 'AbortError'))
                        return
                    }
                    signal.addEventListener('abort', onAbort, { once: true })
                })
            }
        )

        const controller = new AbortController()
        const searchPromise = performSearch('coffee', controller.signal, 0, 0)

        // Advance timers past the internal timeout (uses 500ms because
        // canUseStaticDevFallback returns true) + retry window.
        await vi.advanceTimersByTimeAsync(60000)

        // The search may resolve to local-index results or reject
        await expect(searchPromise).resolves.toBeDefined().catch(() => {})

        // Assert: a timeout is a genuine API failure and must set the flag
        const flag = readApiUnreachable()
        expect(flag).not.toBeNull()
        // The reason should mention timeout
        expect(flag!.reason).toMatch(/timed out|aborted|timeout/i)
    })
})
