import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    clearSearchCache,
    getCachedSearch,
    qHash,
    setCachedSearch,
    setSearchCacheTTL
} from '../../src/lib/search-cache'

describe('search-cache keying', () => {
    beforeEach(() => {
        vi.useRealTimers()
        clearSearchCache()
        setSearchCacheTTL(5 * 60 * 1000)
    })

    it('isolates cached results by page and offset', () => {
        const page0 = [{ id: 'p0', name: 'First page', index: 0, score: 1, category: '', snippet: '' }]
        const page1 = [{ id: 'p1', name: 'Second page', index: 18, score: 0.9, category: '', snippet: '' }]

        setCachedSearch('coffee', 0, 0, page0)
        setCachedSearch('coffee', 1, 18, page1)

        expect(getCachedSearch('coffee', 0, 0)).toEqual(page0)
        expect(getCachedSearch('coffee', 1, 18)).toEqual(page1)
    })

    it('returns null for cache misses and expired entries', () => {
        expect(getCachedSearch('missing', 0, 0)).toBeNull()

        vi.useFakeTimers()
        setSearchCacheTTL(1)
        setCachedSearch('ttl', 0, 0, [{ id: 'ttl', name: 'TTL', index: 0, score: 1, category: '', snippet: '' }])
        expect(getCachedSearch('ttl', 0, 0)).not.toBeNull()

        vi.advanceTimersByTime(10)
        expect(getCachedSearch('ttl', 0, 0)).toBeNull()
        vi.useRealTimers()
    })

    it('clears cached and pending search state', () => {
        setCachedSearch('test', 0, 0, [{ id: '1', name: 'A', index: 0, score: 1, category: '', snippet: '' }])
        clearSearchCache()
        expect(getCachedSearch('test', 0, 0)).toBeNull()
    })

    it('produces deterministic filename-safe query hashes', () => {
        expect(qHash('coffee shop')).toBe(qHash('coffee shop'))
        expect(qHash('coffee shop')).not.toBe(qHash('Coffee Shop'))
        expect(qHash('café')).toMatch(/^[a-z0-9]+$/)
    })
})
