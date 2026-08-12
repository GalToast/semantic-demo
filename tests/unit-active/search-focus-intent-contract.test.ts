/**
 * search-focus-intent-contract.test.ts — pin the focus-intent bridge
 * (requestSearchInputFocus / consumeSearchInputFocusIntent) + getSearchSummary
 * fallback in src/lib/stores/search-react-selectors.ts (coverage gap: zero test
 * refs before this file; swarm-4 W2 minimax exited-0-without-deliverable —
 * re-executed main-lane 2026-08-12).
 */
import { describe, expect, it, beforeEach, vi } from 'vitest'

// Module-level mock: appState with a searchState carrying an optional summary.
// vi.hoisted factories cannot reference imported defaults (observed trap) —
// inline literals only, re-exported as `mockAppState` for reset.
const mockAppStateHolder = vi.hoisted(() => ({
    appState: {
        searchState: {
            searchStatus: 'idle',
            currentSearchSummary: null as null | {
                query: string
                resultIndices: number[]
            },
        },
        navState: { focusedIndex: null as number | null },
    },
}))

vi.mock('@lib/state/app.svelte.ts', () => ({
    appState: mockAppStateHolder.appState,
}))

// test-compat.svelte may or may not be importable in this env; if the import
// throws it is caught inside getSearchSummary, so the module itself must load.
vi.mock('@lib/stores/test-compat.svelte', () => ({
    testCompatStore: () => ({ searchState: undefined }),
}))

import {
    requestSearchInputFocus,
    consumeSearchInputFocusIntent,
    getSearchSummary,
} from '@lib/stores/search-react-selectors'

beforeEach(() => {
    mockAppStateHolder.appState.searchState.currentSearchSummary = null
    mockAppStateHolder.appState.searchState.searchStatus = 'idle'
    mockAppStateHolder.appState.navState.focusedIndex = null
})

describe('search focus-intent bridge (request/consume)', () => {
    it('(a) requestSearchInputFocus is a function', () => {
        expect(typeof requestSearchInputFocus).toBe('function')
    })

    it('(b) request then consume returns true (one-shot roundtrip)', () => {
        requestSearchInputFocus()
        expect(consumeSearchInputFocusIntent()).toBe(true)
    })

    it('(c) second consume returns false (clear-on-consume)', () => {
        requestSearchInputFocus()
        expect(consumeSearchInputFocusIntent()).toBe(true)
        expect(consumeSearchInputFocusIntent()).toBe(false)
    })

    it('(d) consume without request returns false', () => {
        expect(consumeSearchInputFocusIntent()).toBe(false)
    })

    it('(e) repeated requests are idempotent (no throw, still one-shot)', () => {
        requestSearchInputFocus()
        requestSearchInputFocus()
        expect(consumeSearchInputFocusIntent()).toBe(true)
        expect(consumeSearchInputFocusIntent()).toBe(false)
    })
})

describe('getSearchSummary (fallback contract)', () => {
    it('(f) returns null when no summary and no test-compat fallback', () => {
        expect(getSearchSummary()).toBeNull()
    })

    it('(g) returns the appState summary when set', () => {
        mockAppStateHolder.appState.searchState.currentSearchSummary = {
            id: 's1',
            query: 'coffee',
            resultIndices: [1, 2],
        }
        expect(getSearchSummary()?.query).toBe('coffee')
    })
})