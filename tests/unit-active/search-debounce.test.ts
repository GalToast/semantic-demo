/**
 * @vitest-environment node
 *
 * search-debounce.ts unit tests — Phase W47 (2026-07-14)
 *
 * Tests the SearchDebounce timer wrapper extracted from SearchInput.svelte.
 * Behavior-preserving: schedule() clears any pending timer before setting
 * a new one; cancel() clears and nulls the timer; isPending reflects timer
 * state.
 *
 * Uses fake timers to keep the test deterministic (no real delays).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SearchDebounce } from '@lib/search/search-debounce'

describe('SearchDebounce', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.useRealTimers()
    })

    it('schedule() fires the callback after the delay', () => {
        const debounce = new SearchDebounce()
        const cb = vi.fn()
        debounce.schedule(cb, 300)

        expect(cb).not.toHaveBeenCalled()
        expect(debounce.isPending).toBe(true)

        vi.advanceTimersByTime(299)
        expect(cb).not.toHaveBeenCalled()

        vi.advanceTimersByTime(1)
        expect(cb).toHaveBeenCalledTimes(1)
        expect(debounce.isPending).toBe(false)
    })

    it('cancel() stops a pending timer from firing', () => {
        const debounce = new SearchDebounce()
        const cb = vi.fn()
        debounce.schedule(cb, 300)

        debounce.cancel()

        vi.advanceTimersByTime(500)
        expect(cb).not.toHaveBeenCalled()
        expect(debounce.isPending).toBe(false)
    })

    it('schedule() replaces a pending timer with a new one', () => {
        const debounce = new SearchDebounce()
        const cb1 = vi.fn()
        const cb2 = vi.fn()

        debounce.schedule(cb1, 300)
        vi.advanceTimersByTime(200)
        debounce.schedule(cb2, 300)

        vi.advanceTimersByTime(300)
        expect(cb1).not.toHaveBeenCalled()
        expect(cb2).toHaveBeenCalledTimes(1)
    })

    it('cancel() is idempotent when no timer is active', () => {
        const debounce = new SearchDebounce()
        expect(() => debounce.cancel()).not.toThrow()
        expect(debounce.isPending).toBe(false)
    })

    it('isPending is false on a fresh instance', () => {
        const debounce = new SearchDebounce()
        expect(debounce.isPending).toBe(false)
    })

    it('isPending is true after schedule, false after cancel', () => {
        const debounce = new SearchDebounce()
        debounce.schedule(vi.fn(), 300)
        expect(debounce.isPending).toBe(true)
        debounce.cancel()
        expect(debounce.isPending).toBe(false)
    })

    it('isPending becomes false after the callback fires', () => {
        const debounce = new SearchDebounce()
        debounce.schedule(vi.fn(), 100)
        vi.advanceTimersByTime(100)
        expect(debounce.isPending).toBe(false)
    })

    it('can be rescheduled after the previous timer fires', () => {
        const debounce = new SearchDebounce()
        const cb1 = vi.fn()
        const cb2 = vi.fn()
        debounce.schedule(cb1, 100)
        vi.advanceTimersByTime(100)
        expect(cb1).toHaveBeenCalledTimes(1)
        debounce.schedule(cb2, 100)
        vi.advanceTimersByTime(100)
        expect(cb2).toHaveBeenCalledTimes(1)
    })
})
