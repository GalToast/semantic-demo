import { describe, it, expect, beforeEach } from 'vitest'
import { startSearch, cancelSearch, isSearchInFlight, resetSearchAbort } from '@lib/search/search-abort'

describe('search-abort', () => {
    beforeEach(() => {
        resetSearchAbort()
    })

    it('creates a fresh controller for a new query', () => {
        const signal = startSearch('coffee')
        expect(signal.aborted).toBe(false)
        expect(isSearchInFlight('coffee')).toBe(true)
    })

    it('aborts the previous controller when a different query starts', () => {
        const s1 = startSearch('coffee')
        const s2 = startSearch('roof')
        expect(s1.aborted).toBe(true)
        expect(s2.aborted).toBe(false)
        expect(isSearchInFlight('roof')).toBe(true)
        expect(isSearchInFlight('coffee')).toBe(false)
    })

    it('returns the same signal for the same in-flight query', () => {
        const s1 = startSearch('coffee')
        const s2 = startSearch('coffee')
        expect(s1).toBe(s2)
        expect(s1.aborted).toBe(false)
    })

    it('cancels the current search and clears ownership', () => {
        const s1 = startSearch('coffee')
        cancelSearch()
        expect(s1.aborted).toBe(true)
        expect(isSearchInFlight()).toBe(false)
    })

    it('creates a new controller after cancellation for the same query', () => {
        const s1 = startSearch('coffee')
        cancelSearch()
        const s2 = startSearch('coffee')
        expect(s1).not.toBe(s2)
        expect(s2.aborted).toBe(false)
    })
})
