/**
 * @vitest-environment jsdom
 *
 * url-anchor-valid-focus.test.ts — Verify that valid ?anchor=42 focuses the correct node
 *
 * Converted from source-inspection (readFileSync regex on url-state.ts) to runtime tests.
 * Drives applyUrlState with mocked URL params and checks observable effects:
 *  1. numericId validated against appState.points.length (out-of-range → toast + overview)
 *  2. SEARCH_FOCUS_REQUESTED dispatched for valid anchor (with index payload)
 *  3. applyLocalNeighborhoodFocus called for valid anchor
 *  4. Anchor restoration runs independently of search (ordering: anchor before search)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { writable } from 'svelte/store'

// ── Mutable mock state ────────────────────────────────────────────────────────

const mockState = vi.hoisted(() => ({
    navStore: {
        urlStateRestoreToken: 0,
        applyingUrlState: false,
        restoringBrowserHistory: false,
        focusedIndex: null as number | null,
        mode: 'overview' as string,
        surface: 'idle' as string,
        currentView: 'galaxy' as string,
        previousSurface: null as string | null
    } as Record<string, unknown>,
    neighborMap: new Map<string, unknown>(),
    publishCalls: [] as Array<{ type: string; payload: unknown }>,
    applyLocalNeighborhoodFocusCalls: [] as Array<number>,
    showExperienceToastCalls: [] as Array<{ title: string; message: string }>,
    writeNavStateMirrorCalls: [] as Array<Record<string, unknown>>,
    urlSearch: ''
}))

const { subscribe, set } = writable(new Map<string, unknown>())
function semanticNeighborMapSet(next: Map<string, unknown>): void {
    mockState.neighborMap = next
    set(next)
}

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@lib/stores/navigation.svelte.ts', () => ({
    navStore: {
        subscribe: (fn: (v: unknown) => void) => {
            fn(mockState.navStore)
            return () => {}
        }
    },
    writeNavStateMirror: (patch: Record<string, unknown>) => {
        mockState.writeNavStateMirrorCalls.push(patch)
        Object.assign(mockState.navStore, patch)
    },
    bumpUrlStateRestoreToken: () => {
        const next = (mockState.navStore.urlStateRestoreToken as number) + 1
        mockState.navStore.urlStateRestoreToken = next
        return next
    }
}))

vi.mock('@lib/state/app.svelte', () => ({
    appState: {
        points: Array.from({ length: 100 }, (_, i) => ({ lead_id: String(i), name: `Biz ${i}` })),
        get navState() {
            return { focusedIndex: mockState.navStore.focusedIndex }
        },
        get camera() {
            return {}
        },
        get controls() {
            return {}
        },
        get semanticDiveMode() {
            return false
        },
        get myceliumMode() {
            return 'default'
        },
        set semanticDiveMode(_v: unknown) {},
        set myceliumMode(_v: unknown) {},
        get filterVersion() {
            return 0
        },
        get trailIndices() {
            return null
        },
        get focusedNode() {
            return null
        },
        set focusedNode(_v: unknown) {},
        withMutation: (fn: () => unknown) => fn()
    }
}))

vi.mock('@lib/stores/search.svelte', () => ({
    runSearch: () => Promise.resolve(),
    clearSearch: () => {},
    searchStore: () => ({ query: '', summary: null, results: [] }),
    setSearchError: () => {}
}))

vi.mock('@lib/stores/focus.svelte', () => ({
    focusStore: { update: () => {} }
}))

vi.mock('@lib/stores/journey.svelte', () => ({
    journeyStore: { update: () => {} },
    setJourneyPhase: () => {}
}))

vi.mock('@lib/journey/selected-card', () => ({ updateSelectedBusiness: () => {} }))
vi.mock('@lib/orchestration/search-filter-core', () => ({ applyFilters: () => {} }))
vi.mock('@lib/orchestration/cluster-filter-controller', () => ({
    syncFilterControls: () => {},
    restoreActiveClusterFilterFromUrl: () => {}
}))
vi.mock('@lib/stores/filter.svelte', () => ({ restoreActiveFiltersFromUrl: () => {} }))

vi.mock('@lib/orchestration/toast', () => ({
    showExperienceToast: (title: string, message: string) => {
        mockState.showExperienceToastCalls.push({ title, message })
    }
}))

vi.mock('@lib/engine/camera-choreography/focus', () => ({ animateCameraToNode: () => {} }))
vi.mock('@lib/journey/semantic-overlay', () => ({
    refreshFocusSemanticOverlay: () => {},
    updateFocusSemanticOverlayPositions: () => {}
}))
vi.mock('@lib/journey/point-color', () => ({ applyPointFilterColors: () => {} }))
vi.mock('@lib/utils/debug', () => ({ debugWarn: () => {} }))

vi.mock('@lib/focus/pocket', () => ({
    applyLocalNeighborhoodFocus: (index: number) => {
        mockState.applyLocalNeighborhoodFocusCalls.push(index)
        return true
    },
    getFocusPocketIndices: () => [],
    setFocusPocketIndices: () => {},
    getFocusPocketRoleByIndex: () => 'partner',
    setFocusPocketRoleByIndex: () => {},
    setFocusPocketRoleForIndex: () => {},
    clearFocusPocketRoleByIndex: () => {},
    getFocusPocketMotionByIndex: () => 'idle',
    setFocusPocketMotionByIndex: () => {},
    setFocusPocketMotionForIndex: () => {},
    clearFocusPocketMotionByIndex: () => {},
    clearFocusPocketIndices: () => {},
    getFocusPocketMeta: () => null,
    setFocusPocketMeta: () => {},
    clearFocusPocketMeta: () => {},
    syncPocketNodesToStore: () => {},
    applyFocusPocketBreathing: () => {},
    getRuntimeStateSnapshot: () => ({})
}))

vi.mock('@lib/orchestration/event-bus', () => ({
    publish: (type: string, payload: unknown) => {
        mockState.publishCalls.push({ type, payload })
    },
    subscribe: () => () => {},
    EVENTS: {
        SEARCH_FOCUS_REQUESTED: 'SEARCH_FOCUS_REQUESTED',
        SEARCH_SUCCESS: 'SEARCH_SUCCESS',
        SEARCH_EMPTY: 'SEARCH_EMPTY',
        SEARCH_CLEARED: 'SEARCH_CLEARED',
        URL_SYNC_REQUESTED: 'URL_SYNC_REQUESTED'
    }
}))

vi.mock('@lib/orchestration/url-params', () => ({
    getSearchParams: () => new URLSearchParams(mockState.urlSearch),
    getLocationHref: () => `http://localhost/${mockState.urlSearch}`,
    getLocationPathname: () => '/',
    isDomForcedFocusSearchSurface: () => false
}))

vi.mock('@lib/data-store', () => ({
    semanticNeighborMap: { subscribe }
}))

vi.mock('@lib/search/search-panel-adapter', () => ({ setMobileSearchSheetMode: () => {} }))
vi.mock('@lib/utils/ui-presentation', () => ({ isCompactSearchViewport: () => false }))
vi.mock('@lib/search/search-abort', () => ({ startSearch: () => ({ isNew: false, release: () => {} }) }))

// ── Tests ────────────────────────────────────────────────────────────────────

describe('URL anchor valid focus (?anchor=42)', () => {
    beforeEach(() => {
        // Reset all mutable state
        mockState.navStore = {
            urlStateRestoreToken: 0,
            applyingUrlState: false,
            restoringBrowserHistory: false,
            focusedIndex: null,
            mode: 'overview',
            surface: 'idle',
            currentView: 'galaxy',
            previousSurface: null
        }
        mockState.neighborMap = new Map()
        mockState.publishCalls = []
        mockState.applyLocalNeighborhoodFocusCalls = []
        mockState.showExperienceToastCalls = []
        mockState.writeNavStateMirrorCalls = []
        mockState.urlSearch = ''
        semanticNeighborMapSet(new Map())

        if (typeof window !== 'undefined') {
            window.history.replaceState({}, '', '/')
        }
    })

    // ═══ Test 1: numericId validated against appState.points.length ═══

    it('validates numericId against appState.points.length (out-of-range → toast + overview fallback)', async () => {
        mockState.urlSearch = '?anchor=9999'
        window.history.replaceState({}, '', '/?anchor=9999')

        const { applyUrlState } = await import('@lib/orchestration/url-state')
        await applyUrlState({})

        // Toast for unavailable anchor
        expect(mockState.showExperienceToastCalls.length).toBeGreaterThanOrEqual(1)
        expect(mockState.showExperienceToastCalls[0]!.title).toContain('Anchor')

        // No focus event dispatched
        const focusPublishes = mockState.publishCalls.filter((c) => c.type === 'SEARCH_FOCUS_REQUESTED')
        expect(focusPublishes.length).toBe(0)

        // Fallback to overview mode
        expect(mockState.navStore.mode).toBe('overview')
        expect(mockState.navStore.focusedIndex).toBe(null)
    })

    it('validates numericId against appState.points.length (negative → toast + overview fallback)', async () => {
        mockState.urlSearch = '?anchor=-1'
        window.history.replaceState({}, '', '/?anchor=-1')

        const { applyUrlState } = await import('@lib/orchestration/url-state')
        await applyUrlState({})

        // Toast for unavailable anchor
        expect(mockState.showExperienceToastCalls.length).toBeGreaterThanOrEqual(1)

        // No focus event dispatched
        const focusPublishes = mockState.publishCalls.filter((c) => c.type === 'SEARCH_FOCUS_REQUESTED')
        expect(focusPublishes.length).toBe(0)

        // Fallback to overview
        expect(mockState.navStore.focusedIndex).toBe(null)
        expect(mockState.navStore.mode).toBe('overview')
    })

    // ═══ Test 2: SEARCH_FOCUS_REQUESTED dispatched for valid anchor ═══

    it('dispatches SEARCH_FOCUS_REQUESTED with { index: numericId } for a valid anchor', async () => {
        mockState.urlSearch = '?anchor=42'
        window.history.replaceState({}, '', '/?anchor=42')

        const { applyUrlState } = await import('@lib/orchestration/url-state')
        await applyUrlState({})

        const focusPublishes = mockState.publishCalls.filter((c) => c.type === 'SEARCH_FOCUS_REQUESTED')
        expect(focusPublishes.length).toBeGreaterThanOrEqual(1)
        expect(focusPublishes[0]!.payload).toEqual({ index: 42 })
    })

    it('dispatches SEARCH_FOCUS_REQUESTED with the correct index for a different valid anchor', async () => {
        mockState.urlSearch = '?anchor=7'
        window.history.replaceState({}, '', '/?anchor=7')

        const { applyUrlState } = await import('@lib/orchestration/url-state')
        await applyUrlState({})

        const focusPublishes = mockState.publishCalls.filter((c) => c.type === 'SEARCH_FOCUS_REQUESTED')
        expect(focusPublishes.length).toBeGreaterThanOrEqual(1)
        expect(focusPublishes[0]!.payload).toEqual({ index: 7 })
    })

    // ═══ Test 3: applyLocalNeighborhoodFocus called for valid anchor ═══

    it('calls applyLocalNeighborhoodFocus for a valid numeric anchor', async () => {
        mockState.urlSearch = '?anchor=42'
        window.history.replaceState({}, '', '/?anchor=42')

        const { applyUrlState } = await import('@lib/orchestration/url-state')
        await applyUrlState({})

        expect(mockState.applyLocalNeighborhoodFocusCalls).toContain(42)
    })

    it('does NOT call applyLocalNeighborhoodFocus for an out-of-range anchor', async () => {
        mockState.urlSearch = '?anchor=9999'
        window.history.replaceState({}, '', '/?anchor=9999')

        const { applyUrlState } = await import('@lib/orchestration/url-state')
        await applyUrlState({})

        expect(mockState.applyLocalNeighborhoodFocusCalls.length).toBe(0)
    })

    // ═══ Test 4: Anchor restores before search (independent anchor path) ═══

    it('restores anchor independently of search (bare ?anchor= without ?q=)', async () => {
        mockState.urlSearch = '?anchor=7'
        window.history.replaceState({}, '', '/?anchor=7')

        const { applyUrlState } = await import('@lib/orchestration/url-state')
        await applyUrlState({})

        // Anchor restore must set focusedIndex and mode even without a query
        expect(mockState.navStore.focusedIndex).toBe(7)
        expect(mockState.navStore.mode).toBe('focus')
        expect(mockState.publishCalls.some((c) => c.type === 'SEARCH_FOCUS_REQUESTED')).toBe(true)
        expect(mockState.applyLocalNeighborhoodFocusCalls).toContain(7)
    })

    it('restores anchor when both anchor and query are present (anchor settles before search)', async () => {
        mockState.urlSearch = '?anchor=15&q=coffee'
        window.history.replaceState({}, '', '/?anchor=15&q=coffee')

        const { applyUrlState } = await import('@lib/orchestration/url-state')
        await applyUrlState({})

        // Anchor must be restored: focusedIndex set, event published
        expect(mockState.navStore.focusedIndex).toBe(15)
        expect(mockState.navStore.mode).toBe('focus')
        expect(mockState.publishCalls.some((c) => c.type === 'SEARCH_FOCUS_REQUESTED')).toBe(true)
        expect(mockState.applyLocalNeighborhoodFocusCalls).toContain(15)
    })
})
