/**
 * S-GLOW: search-glows.ts contract test
 *
 * Pins the 4 exported setters by asserting their observable side-effects
 * on `appState.searchState`. Because these are setters-only, the contract
 * is read-back through the mocked `appState` surface.
 *
 * Mock discipline:
 *   - `@lib/state/app.svelte.ts` is mocked because search-glows.ts imports it.
 *   - `src/lib/stores/search.svelte.ts` is mocked to provide a passthrough
 *     `withSearchNotify` so we don't pull the full search-core machinery.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Hoisted mock state ──────────────────────────────────────────────────────

const mockState = vi.hoisted(() => ({
    searchGlowIndices: new Set<number>(),
    searchGlowTopIndex: null as number | null,
    searchGlowActive: false,
    searchVisibleCount: 5
}))

const mockSearchState = vi.hoisted(() => {
    const tracked = ['searchGlowIndices', 'searchGlowTopIndex', 'searchGlowActive', 'searchVisibleCount'] as const
    const obj: Record<string, unknown> = {}
    for (const field of tracked) {
        Object.defineProperty(obj, field, {
            get() {
                return (mockState as unknown as Record<string, unknown>)[field]
            },
            set(v: unknown) {
                ;(mockState as unknown as Record<string, unknown>)[field] = v
            },
            enumerable: true,
            configurable: true
        })
    }
    return obj
})

const mockViewportState = vi.hoisted(() => ({
    viewportWidth: 1280,
    viewportHeight: 800,
    isCompactViewport: false
}))

const mockFocusState = vi.hoisted(() => ({
    selectedPoint: null,
    pocketMotionByIndex: new Map()
}))

const mockNavState = vi.hoisted(() => ({
    mode: 'overview',
    focusedIndex: null
}))

// ── Module mocks ────────────────────────────────────────────────────────────

vi.mock('@lib/state/app.svelte.ts', () => ({
    appState: {
        get searchState() {
            return mockSearchState
        },
        get viewportState() {
            return mockViewportState
        },
        get focusState() {
            return mockFocusState
        },
        get navState() {
            return mockNavState
        },
        withMutation: <T>(_fn: () => T): T => {
            // no-op bridge for tests
            return _fn()
        }
    }
}))

vi.mock('src/lib/stores/search.svelte.ts', () => ({
    withSearchNotify: <T>(fn: () => T): T => fn()
}))

// ── Import under test (after mocks) ────────────────────────────────────────

import { setGlowIndices, setGlowActive, setSearchGlow, clearSearchGlow } from '@lib/stores/search-glows'

// ── Tests ──────────────────────────────────────────────────────────────────

describe('S-GLOW: search-glows contract', () => {
    beforeEach(() => {
        mockState.searchGlowIndices = new Set<number>()
        mockState.searchGlowTopIndex = null
        mockState.searchGlowActive = false
        mockState.searchVisibleCount = 5
    })

    it('exports four functions', () => {
        expect(typeof setGlowIndices).toBe('function')
        expect(typeof setGlowActive).toBe('function')
        expect(typeof setSearchGlow).toBe('function')
        expect(typeof clearSearchGlow).toBe('function')
    })

    it('setGlowIndices updates appState.searchState.searchGlowIndices', () => {
        const indices = new Set([3, 7])
        setGlowIndices(indices)
        expect(mockState.searchGlowIndices).toBe(indices)
        expect(mockState.searchGlowActive).toBe(false)
        expect(mockState.searchGlowTopIndex).toBeNull()
    })

    it('setGlowActive flips the active flag', () => {
        setGlowActive(true)
        expect(mockState.searchGlowActive).toBe(true)

        setGlowActive(false)
        expect(mockState.searchGlowActive).toBe(false)
    })

    it('setSearchGlow writes indices, topIndex, and derived active flag', () => {
        setSearchGlow([3, 7], 3)
        expect(mockState.searchGlowIndices).toEqual(new Set([3, 7]))
        expect(mockState.searchGlowTopIndex).toBe(3)
        expect(mockState.searchGlowActive).toBe(true)

        // default topIndex = first element
        setSearchGlow([11, 13])
        expect(mockState.searchGlowIndices).toEqual(new Set([11, 13]))
        expect(mockState.searchGlowTopIndex).toBe(11)
        expect(mockState.searchGlowActive).toBe(true)
    })

    it('clearSearchGlow resets glow state to empty/off', () => {
        // seed some state first
        setSearchGlow([3, 7], 3)
        clearSearchGlow()
        expect(mockState.searchGlowIndices).toEqual(new Set())
        expect(mockState.searchGlowTopIndex).toBeNull()
        expect(mockState.searchGlowActive).toBe(false)
    })

    it('repeated calls are idempotent (no throw)', () => {
        setGlowIndices(new Set([1]))
        setGlowIndices(new Set([1]))
        setGlowActive(true)
        setGlowActive(true)
        setSearchGlow([5])
        setSearchGlow([5])
        clearSearchGlow()
        clearSearchGlow()

        expect(mockState.searchGlowIndices).toEqual(new Set())
        expect(mockState.searchGlowTopIndex).toBeNull()
        expect(mockState.searchGlowActive).toBe(false)
    })

    it('plural set/clear roundtrip leaves clean empty state', () => {
        setSearchGlow([1, 2, 3], 1)
        clearSearchGlow()
        setGlowIndices(new Set([9]))
        clearSearchGlow()

        expect(mockState.searchGlowIndices.size).toBe(0)
        expect(mockState.searchGlowActive).toBe(false)
        expect(mockState.searchGlowTopIndex).toBeNull()
    })
})
