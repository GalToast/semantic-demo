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
import { appState } from '@lib/state/app.svelte'

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

// ── Regression: searchStore.update bridges bare query when summary is null ──
// When searchStore.update sets a query while no search summary exists, the
// syncSearchUpdateToAppState bridge must auto-create a minimal summary so the
// query is persisted to appState. Without this, the parity-attrs layer sees
// an empty query and derives graphContext=focus instead of focus-search.
// (lifecycle-composition-contract, 2026-08-07)

describe('searchStore.update bridges query when summary is null (regression)', () => {
    beforeEach(() => {
        resetSearchForTests()
        // Reset appState search to a clean idle state
        appState.searchState.currentSearchSummary = null
        appState.searchState.searchStatus = 'idle'
    })

    it('persists a bare query update to appState.currentSearchSummary', () => {
        expect(appState.searchState.currentSearchSummary).toBeNull()

        searchStore.update((s) => ({ ...s, query: 'roof repair' }))

        // After update, appState must carry the query in a minimal summary
        expect(appState.searchState.currentSearchSummary).not.toBeNull()
        expect(appState.searchState.currentSearchSummary!.query).toBe('roof repair')
    })

    it('persists a query update that differs from current (default empty)', () => {
        // Snapshot from idle state has query = ''
        const snapBefore = searchStore()
        expect(snapBefore.query).toBe('')

        searchStore.update((s) => ({ ...s, query: 'plumbing' }))

        const snapAfter = searchStore()
        expect(snapAfter.query).toBe('plumbing')
        expect(appState.searchState.currentSearchSummary?.query).toBe('plumbing')
    })

    it('does not create a spurious summary for empty query update', () => {
        expect(appState.searchState.currentSearchSummary).toBeNull()

        searchStore.update((s) => ({ ...s, query: '' }))

        // Empty query should NOT create a summary (no change from default)
        expect(appState.searchState.currentSearchSummary).toBeNull()
    })
})
