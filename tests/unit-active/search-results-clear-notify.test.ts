/**
 * @vitest-environment jsdom
 *
 * Regression guard for BUG-2 (bugsweep ds4): `clearSearchState()` in
 * results-ui.ts mutates appState directly, bypassing the canonical
 * `withSearchNotify` wrapper that rebuilds the search store snapshot and
 * calls `searchMirror.set()`. Without that, Svelte subscribers to
 * `searchStore` never re-render and stale result rows linger after a
 * clear.
 *
 * This test imports the real modules and uses `resetSearchForTests()` to
 * isolate state between cases.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { clearSearchState } from '../../src/lib/search/results-ui.ts'
import { searchStore, resetSearchForTests } from '@lib/stores/search.svelte.ts'

describe('clearSearchState notifies search store subscribers (BUG-2)', () => {
    beforeEach(() => {
        resetSearchForTests()
    })

    it('subscriber callback fires when clearSearchState is called', () => {
        const fn = vi.fn()
        const unsub = searchStore.subscribe(fn)

        // subscribe itself fires once with the initial value
        expect(fn).toHaveBeenCalledTimes(1)
        
        clearSearchState(null, null)

        // After clearSearchState, the subscriber must fire again (proving notify)
        expect(fn).toHaveBeenCalledTimes(2)
        unsub()
    })

    it('snapshot reflects cleared state after clearSearchState', () => {
        const snapshots: unknown[] = []
        const unsub = searchStore.subscribe((s) => {
            snapshots.push(s)
            void s
        })

        expect(snapshots.length).toBe(1) // initial subscription value
        clearSearchState(null, null)
        expect(snapshots.length).toBe(2) // one more after clear

        const latest = snapshots[1] as Record<string, unknown>
        expect(latest.results).toEqual([])
        expect(latest.summary).toBeNull()
        expect(latest.query).toBe('')
        expect(latest.hasQuery).toBe(false)
        expect(latest.resultsRendered).toBe(false)

        unsub()
    })

    it('calling clearSearchState twice does not throw', () => {
        const fn = vi.fn()
        const unsub = searchStore.subscribe(fn)

        expect(() => clearSearchState(null, null)).not.toThrow()
        expect(() => clearSearchState(null, null)).not.toThrow()

        unsub()
    })

    it('passing null elements is safe', () => {
        const fn = vi.fn()
        const unsub = searchStore.subscribe(fn)

        expect(() => clearSearchState(null, null)).not.toThrow()

        unsub()
    })
})
