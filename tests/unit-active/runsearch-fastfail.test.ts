/**
 * Focused deterministic coverage for the bounded fast-fail local-index fallback
 * added to `runSearch` in src/lib/stores/search-core.ts.
 *
 * These cases exercise ONLY the store-path search orchestration (runSearch):
 * slow API → local fallback, fast API wins, late API cannot clobber, abort
 * stays clean, ?staticDev=0 surfaces the API error instead of local results,
 * and a genuinely null local index is not confused with an empty success.
 *
 * No PHP/server required — every collaborator (performSearch, the local index,
 * shouldSurfaceApiFailures, and publish) is mocked. Fast-fail timing uses
 * fake timers so the 7000ms window is exercised without real waits.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mocks = vi.hoisted(() => ({
    performSearch: vi.fn(),
    performLocalIndexSearch: vi.fn(),
    localHitsToResults: vi.fn(),
    shouldSurfaceApiFailures: vi.fn(() => false),
    publish: vi.fn()
}))

vi.mock('@lib/search-engine', () => ({ performSearch: mocks.performSearch }))
vi.mock('@lib/search/local-search-index', () => ({
    performLocalIndexSearch: mocks.performLocalIndexSearch,
    localHitsToResults: mocks.localHitsToResults
}))
vi.mock('@lib/search/mock-search-fallback', () => ({
    shouldSurfaceApiFailures: mocks.shouldSurfaceApiFailures
}))
vi.mock('@lib/orchestration/event-bus', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@lib/orchestration/event-bus')>()
    return { ...actual, publish: mocks.publish }
})

import { runSearch, clearSearch, searchStatus } from '@lib/stores/search.svelte.ts'
import { appState } from '@lib/state/app.svelte.ts'
import { EVENTS } from '@lib/orchestration/event-bus'

// Mirror the 7000ms window used by runSearch (FAST_FAIL_MS convention).
const FAST_FAIL_MS = 7000

function mkResult(id: string, index = 0) {
    return { id, name: id, index, score: 0.5, category: '', snippet: '' }
}

beforeEach(() => {
    vi.useFakeTimers()
    mocks.publish.mockClear()
    mocks.performSearch.mockReset()
    mocks.performLocalIndexSearch.mockReset()
    mocks.localHitsToResults.mockReset()
    mocks.shouldSurfaceApiFailures.mockReturnValue(false)
    mocks.localHitsToResults.mockImplementation((hits: Array<{ recordIndex: number }>) =>
        (hits ?? []).map((h, i) => mkResult(`local-${i}`, h.recordIndex))
    )
    clearSearch()
})

afterEach(() => {
    vi.useRealTimers()
})

describe('runSearch: fast API wins', () => {
    it('commits API results and never invokes the local index (no timer leak)', async () => {
        mocks.performSearch.mockResolvedValue([mkResult('api-0')])

        await runSearch('pizza', new AbortController().signal)

        expect(mocks.performLocalIndexSearch).not.toHaveBeenCalled()
        expect(appState.searchResults.map((r) => r.id)).toEqual(['api-0'])
        expect(mocks.publish).toHaveBeenCalledWith(EVENTS.SEARCH_SUCCESS, expect.objectContaining({ count: 1 }))
    })
})

describe('runSearch: slow API falls back to local index within the window', () => {
    it('resolves local results only after the fast-fail window, not immediately', async () => {
        let hold: (v: unknown) => void = () => {}
        mocks.performSearch.mockReturnValue(new Promise((res) => { hold = res }))
        mocks.performLocalIndexSearch.mockReturnValue([{ recordIndex: 0, score: 1, field: 'name' as const }])

        const p = runSearch('pizza', new AbortController().signal)

        // Before the window elapses, nothing has been committed.
        expect(appState.searchResults).toHaveLength(0)
        expect(mocks.performLocalIndexSearch).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(FAST_FAIL_MS)

        // After the window, the local index was consulted and committed.
        expect(mocks.performLocalIndexSearch).toHaveBeenCalledTimes(1)
        expect(appState.searchResults.map((r) => r.id)).toEqual(['local-0'])
        expect(mocks.publish).toHaveBeenCalledWith(EVENTS.SEARCH_SUCCESS, expect.objectContaining({ count: 1 }))

        // A genuinely late API resolution must not change the committed set.
        hold([mkResult('api-0')])
        await p
        expect(appState.searchResults.map((r) => r.id)).toEqual(['local-0'])
        // Exactly one outcome was published (local), not a second from the API.
        expect(mocks.publish).toHaveBeenCalledTimes(1)
    })
})

describe('runSearch: late API after local fallback cannot write a stale set', () => {
    it('ignores a slow API that eventually succeeds with different results', async () => {
        let hold: (v: unknown) => void = () => {}
        mocks.performSearch.mockReturnValue(new Promise((res) => { hold = res }))
        mocks.performLocalIndexSearch.mockReturnValue([{ recordIndex: 3, score: 1, field: 'name' as const }])

        const p = runSearch('pizza', new AbortController().signal)
        await vi.advanceTimersByTimeAsync(FAST_FAIL_MS)

        expect(appState.searchResults.map((r) => r.id)).toEqual(['local-0'])

        // The API finally responds with a distinct, higher-count result set.
        hold([mkResult('api-0'), mkResult('api-1'), mkResult('api-2')])
        await p

        // Store still reflects the local result; the late API was suppressed.
        expect(appState.searchResults.map((r) => r.id)).toEqual(['local-0'])
        expect(mocks.publish).toHaveBeenCalledTimes(1)
        expect(mocks.publish).toHaveBeenCalledWith(EVENTS.SEARCH_SUCCESS, expect.objectContaining({ count: 1 }))
    })
})

describe('runSearch: fast API rejection still surfaces the error (no local)', () => {
    it('sets the error state and does not consult the local index', async () => {
        mocks.performSearch.mockRejectedValue(new Error('API down'))

        await runSearch('pizza', new AbortController().signal)

        expect(mocks.performLocalIndexSearch).not.toHaveBeenCalled()
        expect(searchStatus()).toBe('error')
        expect(mocks.publish).not.toHaveBeenCalledWith(EVENTS.SEARCH_SUCCESS, expect.anything())
        expect(mocks.publish).not.toHaveBeenCalledWith(EVENTS.SEARCH_EMPTY, expect.anything())
    })
})

describe('runSearch: caller abort stays clean', () => {
    it('does not publish success/empty/error for an aborted request', async () => {
        const controller = new AbortController()
        mocks.performSearch.mockImplementation((_q: string, signal: AbortSignal) =>
            signal.aborted
                ? Promise.reject(new DOMException('aborted', 'AbortError'))
                : new Promise(() => {})
        )

        controller.abort()
        await runSearch('pizza', controller.signal)

        expect(mocks.performLocalIndexSearch).not.toHaveBeenCalled()
        expect(searchStatus()).toBe('searching')
        expect(mocks.publish).not.toHaveBeenCalled()
    })
})

describe('runSearch: ?staticDev=0 surfaces API failure, no silent local replacement', () => {
    it('does not consult the local index and preserves the error state', async () => {
        mocks.shouldSurfaceApiFailures.mockReturnValue(true)
        mocks.performSearch.mockRejectedValue(new Error('API 503'))

        await runSearch('pizza', new AbortController().signal)

        expect(mocks.performLocalIndexSearch).not.toHaveBeenCalled()
        expect(searchStatus()).toBe('error')
        expect(mocks.publish).not.toHaveBeenCalled()
    })
})

describe('runSearch: null local index is not confused with an empty success', () => {
    it('falls through to the API when the local index throws inside the fallback timer', async () => {
        let hold: (v: unknown) => void = () => {}
        mocks.performSearch.mockReturnValue(new Promise((res) => { hold = res }))
        mocks.performLocalIndexSearch.mockImplementation(() => {
            throw new Error('local index unavailable')
        })

        const p = runSearch('pizza', new AbortController().signal)
        await vi.advanceTimersByTimeAsync(FAST_FAIL_MS)

        expect(mocks.performLocalIndexSearch).toHaveBeenCalledTimes(1)
        hold([mkResult('api-0')])
        await p

        expect(appState.searchResults.map((r) => r.id)).toEqual(['api-0'])
        expect(searchStatus()).toBe('results')
    })

    it('falls through to the API when the index is genuinely unavailable (null)', async () => {
        mocks.performLocalIndexSearch.mockReturnValue(null) // index unavailable
        mocks.performSearch.mockResolvedValue([mkResult('api-0')])

        await runSearch('pizza', new AbortController().signal)

        // null was treated as "no local data" and we used the API result set.
        expect(appState.searchResults.map((r) => r.id)).toEqual(['api-0'])
        expect(mocks.publish).toHaveBeenCalledWith(EVENTS.SEARCH_SUCCESS, expect.objectContaining({ count: 1 }))
    })

    it('still reports an empty success (SEARCH_EMPTY) when null index + empty API', async () => {
        mocks.performLocalIndexSearch.mockReturnValue(null)
        mocks.performSearch.mockResolvedValue([])

        await runSearch('pizza', new AbortController().signal)

        expect(appState.searchResults).toHaveLength(0)
        expect(searchStatus()).toBe('results')
        expect(mocks.publish).toHaveBeenCalledWith(EVENTS.SEARCH_EMPTY, expect.objectContaining({ query: 'pizza' }))
    })

    it('treats an available-but-empty local index ([]) as a real empty success', async () => {
        let hold: (v: unknown) => void = () => {}
        mocks.performSearch.mockReturnValue(new Promise((res) => { hold = res }))
        mocks.performLocalIndexSearch.mockReturnValue([]) // available, zero hits
        mocks.localHitsToResults.mockReturnValue([])

        const p = runSearch('zzzzz', new AbortController().signal)
        await vi.advanceTimersByTimeAsync(FAST_FAIL_MS)

        expect(appState.searchResults).toHaveLength(0)
        expect(searchStatus()).toBe('results')
        expect(mocks.publish).toHaveBeenCalledWith(EVENTS.SEARCH_EMPTY, expect.objectContaining({ query: 'zzzzz' }))

        hold([mkResult('api-0')])
        await p
        // Empty committed set is retained; late API did not overwrite.
        expect(appState.searchResults).toHaveLength(0)
        expect(mocks.publish).toHaveBeenCalledTimes(1)
    })
})
