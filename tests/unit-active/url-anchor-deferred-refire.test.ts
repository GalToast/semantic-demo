/**
 * @vitest-environment jsdom
 *
 * url-anchor-deferred-refire.test.ts — regression test for the deep-link
 * constellation race fix (PR-B5).
 *
 * Bug: `?record=N` / `?anchor=N` deep-links run `_restoreAnchorFromParams`
 * immediately after `initData()` resolves, but `initData()` explicitly does
 * NOT wait for the 40 MB semantic-thread artifact (data-store.ts:initData()).
 * Threads load later via `requestIdleCallback → loadSemanticThreads`,
 * populating `semanticNeighborMap`. At restore time the map is empty, so the
 * `SEARCH_FOCUS_REQUESTED` subscriber's `buildNeighborhoodManifest` resolves
 * 0 semantic neighbors and writes empty `threadCandidates`. The FocusPocket
 * `$effect` builds an empty/geom-fallback constellation, and nothing re-fires
 * focus when threads arrive → "0 visible neighbors".
 *
 * Fix: `_restoreAnchorFromParams` subscribes to `semanticNeighborMap` and, if
 * it was empty at restore time, re-fires `SEARCH_FOCUS_REQUESTED` +
 * `applyLocalNeighborhoodFocus` exactly once when it becomes non-empty.
 *
 * This test verifies the re-fire wiring behaviorally: with the map empty at
 * restore time, populating it later triggers a second focus dispatch.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { writable } from 'svelte/store'

// ── Mutable mock state ────────────────────────────────────────────────────────

const mockState = vi.hoisted(() => ({
    navStore: {
        urlStateRestoreToken: 0,
        applyingUrlState: false,
        restoringBrowserHistory: false,
        focusedIndex: null as number | null
        // setTrailFromSeed in triggers.ts and the FocusPocket effect read these,
        // but url-state itself only writes focusedIndex via writeNavStateMirror.
    } as Record<string, unknown>,
    // Controllable semanticNeighborMap — tests call semanticNeighborMapSet()
    // to simulate threads finishing load.
    neighborMap: new Map<string, unknown>(),
    publishCalls: [] as Array<{ type: string; payload: unknown }>,
    applyLocalNeighborhoodFocusCalls: [] as Array<number>,
    animateCameraCalls: [] as Array<number>,
    cameraReady: false,
    urlSearch: ''
}))

// A real writable store we control so the subscribe-and-refire logic fires.
const { subscribe, set } = writable(mockState.neighborMap)
function semanticNeighborMapSet(next: Map<string, unknown>): void {
    mockState.neighborMap = next
    set(next)
}

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@lib/stores/focus.svelte', () => ({
    focusStore: { update: (_fn: (s: Record<string, unknown>) => Record<string, unknown>) => {} },
    setSemanticDiveMode: (_v: unknown) => {}
}))

vi.mock('@lib/stores/journey.svelte', () => ({
    journeyStore: { update: (_fn: (s: Record<string, unknown>) => Record<string, unknown>) => {} },
    setJourneyPhase: (_v: unknown) => {},
    JOURNEY_COMPASS_PHASE_ORDER: ['overview'],
    JOURNEY_CONFIG: {},
    setTrailDepth: (_v: unknown) => {}
}))

vi.mock('@lib/orchestration/lifecycle', () => ({
    resetExplorationFocus: () => {},
    refreshCompositionState: () => {}
}))

vi.mock('@lib/stores/navigation.svelte.ts', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@lib/stores/navigation.svelte.ts')>()
    return {
        ...actual,
        navStore: {
            subscribe: (fn: (v: unknown) => void) => {
                fn(mockState.navStore)
                return () => {}
            }
        },
        writeNavStateMirror: (patch: Record<string, unknown>) => {
            Object.assign(mockState.navStore, patch)
        },
        bumpUrlStateRestoreToken: () => {
            const next = (mockState.navStore.urlStateRestoreToken as number) + 1
            mockState.navStore.urlStateRestoreToken = next
            return next
        }
    }
})
vi.mock('@lib/state/app.svelte', () => ({
    appState: {
        // _restoreAnchorFromParams reads appState.points (for the record→index
        // lookup in applyUrlState and the range check in _restoreAnchorFromParams)
        // and appState.navState.focusedIndex (for the staleness guard).
        points: Array.from({ length: 100 }, (_, i) => ({ lead_id: String(i), name: `Biz ${i}` })),
        get camera() {
            return mockState.cameraReady ? {} : null
        },
        get controls() {
            return mockState.cameraReady ? {} : null
        },
        get navState() {
            return { focusedIndex: mockState.navStore.focusedIndex }
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
        get viewportState() {
            return {
                viewportWidth: 1920,
                viewportHeight: 1080,
                viewportDpr: 1,
                viewportReducedMotion: false,
                viewportIsCompact: false
            }
        }
    }
}))

vi.mock('@lib/stores/search.svelte', () => ({
    runSearch: (_q: string, _signal: AbortSignal) => Promise.resolve(),
    clearSearch: () => {},
    searchStore: () => ({ query: '', summary: null, results: [] })
}))

vi.mock('@lib/journey/selected-card', () => ({ updateSelectedBusiness: (_v: unknown) => {} }))
vi.mock('@lib/orchestration/search-filter-core', () => ({ applyFilters: (_v: unknown) => {} }))
vi.mock('@lib/orchestration/cluster-filter-controller', () => ({
    syncFilterControls: () => {},
    restoreActiveClusterFilterFromUrl: (_v: unknown) => {}
}))
vi.mock('@lib/stores/filter.svelte', () => ({
    restoreActiveFiltersFromUrl: (_v: unknown) => {},
    getFilterState: () => ({ status: 'all', city: '', website: false, email: false, geocoded: false })
}))
vi.mock('@lib/orchestration/toast', () => ({ showExperienceToast: (_t: string, _m: string) => {} }))

// Mock the dynamic import target so applyLocalNeighborhoodFocus is observable.
vi.mock('@lib/focus/pocket', () => ({
    applyLocalNeighborhoodFocus: (index: number) => {
        mockState.applyLocalNeighborhoodFocusCalls.push(index)
        return true
    }
}))
vi.mock('@lib/engine/camera-choreography/focus', () => ({
    animateCameraToNode: (index: number) => {
        mockState.animateCameraCalls.push(index)
    }
}))
vi.mock('@lib/journey/webgl', () => ({
    refreshFocusSemanticOverlay: () => {},
    updateFocusSemanticOverlayPositions: () => {}
}))
vi.mock('@lib/journey/point-color', () => ({
    applyPointFilterColors: () => {}
}))

// Capture publish calls so we can assert the deferred re-fire.
vi.mock('@lib/orchestration/event-bus', () => ({
    publish: (type: string, payload: unknown) => {
        mockState.publishCalls.push({ type, payload })
    },
    EVENTS: {
        SEARCH_FOCUS_REQUESTED: 'search:search-focus-requested',
        SEARCH_SUCCESS: 'SEARCH_SUCCESS',
        SEARCH_EMPTY: 'SEARCH_EMPTY',
        SEARCH_CLEARED: 'SEARCH_CLEARED',
        STATE_RESET: 'STATE_RESET',
        URL_SYNC_REQUESTED: 'URL_SYNC_REQUESTED'
    },
    subscribe: (_type: string, _cb: (...args: unknown[]) => void) => () => {},
    subscribeKeyed: (_key: string, _event: string, _cb: (...args: unknown[]) => void) => () => {}
}))

vi.mock('@lib/orchestration/url-params', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@lib/orchestration/url-params')>()
    return {
        ...actual,
        getSearchParams: () => new URLSearchParams(mockState.urlSearch),
        getLocationHref: () => `http://localhost/${mockState.urlSearch}`,
        getLocationPathname: () => '/',
        isDomForcedFocusSearchSurface: () => false,
        // Phase 8 split: ensure new url-params exports flow through mock
        hasRestorableUrlState: actual.hasRestorableUrlState,
        getRequestedUrlDepth: actual.getRequestedUrlDepth
    }
})

// Mock data-store so semanticNeighborMap is the controllable writable above.
// Only export the symbols url-state.ts imports; other consumers in the import
// graph load their own mocks or the real module.
vi.mock('@lib/data-store', () => ({
    semanticNeighborMap: { subscribe }
}))

// ── Tests ────────────────────────────────────────────────────────────────────

describe('url-anchor deferred constellation re-fire (PR-B5)', () => {
    beforeEach(() => {
        vi.resetModules()
        mockState.navStore.urlStateRestoreToken = 0
        mockState.navStore.applyingUrlState = false
        mockState.navStore.restoringBrowserHistory = false
        mockState.navStore.focusedIndex = null
        mockState.neighborMap = new Map()
        mockState.publishCalls = []
        mockState.applyLocalNeighborhoodFocusCalls = []
        mockState.animateCameraCalls = []
        mockState.cameraReady = false
        mockState.urlSearch = ''
        // Reset the writable to an empty map.
        semanticNeighborMapSet(new Map())
        if (typeof window !== 'undefined') {
            window.history.replaceState({}, '', '/')
        }
    })

    it('re-fires SEARCH_FOCUS_REQUESTED + applyLocalNeighborhoodFocus when threads load after a deep-link anchor restore', async () => {
        // ?anchor=42 with NO ?q= → _restoreAnchorFromParams runs (numeric anchor)
        mockState.urlSearch = '?anchor=42'
        window.history.replaceState({}, '', '/?anchor=42')

        const { applyUrlState } = await import('@lib/orchestration/url-state')
        await applyUrlState({})

        // Initial restore fires one SEARCH_FOCUS_REQUESTED + one applyLocalNeighborhoodFocus.
        const initialPublish = mockState.publishCalls.filter((c) => c.type === 'search:search-focus-requested')
        const initialFocus = [...mockState.applyLocalNeighborhoodFocusCalls]
        expect(initialPublish.length).toBeGreaterThanOrEqual(1)
        expect(initialFocus).toContain(42)

        // Simulate semantic threads finishing load (the map was empty at restore
        // time; now it becomes non-empty). This should trigger the deferred
        // re-fire: a SECOND SEARCH_FOCUS_REQUESTED + a SECOND applyLocalNeighborhoodFocus.
        semanticNeighborMapSet(new Map([['42', { neighbors: [{ leadId: '7', semanticScore: 0.9 }] }]]))

        // The deferred re-fire is async (await import + microtasks). Poll
        // for BOTH signals instead of a fixed 10ms to avoid timer-queue drift
        // under suite load. applyLocalNeighborhoodFocus fires asynchronously
        // after the publish call, so we wait for both before proceeding.
        await vi.waitFor(
            () => {
                const calls = mockState.publishCalls.filter((c) => c.type === 'search:search-focus-requested')
                expect(calls.length).toBeGreaterThanOrEqual(2)
                const focusCalls = mockState.applyLocalNeighborhoodFocusCalls.filter((i) => i === 42)
                expect(focusCalls.length).toBeGreaterThanOrEqual(2)
            },
            { timeout: 2000, interval: 5 }
        )

        const allPublish = mockState.publishCalls.filter((c) => c.type === 'search:search-focus-requested')
        const allFocus = [...mockState.applyLocalNeighborhoodFocusCalls]

        // The re-fire must have published a second SEARCH_FOCUS_REQUESTED for index 42.
        expect(allPublish[allPublish.length - 1].payload).toEqual({ index: 42 })

        // The re-fire must have called applyLocalNeighborhoodFocus a second time.
        const focusCallsFor42 = allFocus.filter((i) => i === 42)
        expect(focusCallsFor42.length).toBeGreaterThanOrEqual(2)
    }, 60000)

    it('does NOT re-fire when threads are already loaded at restore time (no double dispatch)', async () => {
        // Pre-populate the map BEFORE applyUrlState — simulate threads already loaded.
        semanticNeighborMapSet(new Map([['42', { neighbors: [{ leadId: '7', semanticScore: 0.9 }] }]]))
        mockState.urlSearch = '?anchor=42'
        window.history.replaceState({}, '', '/?anchor=42')

        const { applyUrlState } = await import('@lib/orchestration/url-state')
        await applyUrlState({})

        // Only the initial fire should have happened (no deferred re-fire needed).
        const publishCount = mockState.publishCalls.filter((c) => c.type === 'search:search-focus-requested').length
        const focusCount = mockState.applyLocalNeighborhoodFocusCalls.filter((i) => i === 42).length

        // Wait to confirm no deferred re-fire arrives. Use a deadline poll
        // loop to isolate from timer-queue drift while keeping tests fast on
        // a quiet loop (~100ms total). 10ms was tight under heavy suite load.
        const absenceDeadline = Date.now() + 100
        while (Date.now() < absenceDeadline) {
            await new Promise((r) => setTimeout(r, 5))
        }

        const publishCountAfter = mockState.publishCalls.filter(
            (c) => c.type === 'search:search-focus-requested'
        ).length
        const focusCountAfter = mockState.applyLocalNeighborhoodFocusCalls.filter((i) => i === 42).length

        expect(publishCount).toBe(1)
        expect(publishCountAfter).toBe(1)
        expect(focusCount).toBe(1)
        expect(focusCountAfter).toBe(1)
    }, 60000)

    it('does not frame a stale anchor when focus changes before the delayed camera settle', async () => {
        vi.useFakeTimers()
        try {
            mockState.cameraReady = true
            mockState.urlSearch = '?anchor=42'
            window.history.replaceState({}, '', '/?anchor=42')

            const { applyUrlState } = await import('@lib/orchestration/url-state')
            await applyUrlState({})

            expect(mockState.navStore.focusedIndex).toBe(42)
            // The camera is ready, so _frameCameraOnAnchor has scheduled its
            // 500ms settle callback. A normal in-app focus change does not bump
            // the URL restore token; the focused-index guard must stop it.
            mockState.navStore.focusedIndex = 99
            await vi.advanceTimersByTimeAsync(500)

            expect(mockState.animateCameraCalls).toEqual([])
        } finally {
            vi.useRealTimers()
        }
    })

    it('supersedes stale camera settle when a newer applyUrlState replaces the anchor', async () => {
        vi.useFakeTimers()
        try {
            mockState.cameraReady = true

            // Restore anchor 42; its 500ms camera settle is pending.
            mockState.urlSearch = '?anchor=42'
            window.history.replaceState({}, '', '/?anchor=42')

            const { applyUrlState } = await import('@lib/orchestration/url-state')
            await applyUrlState({})

            expect(mockState.animateCameraCalls).toEqual([])

            // Supersede with anchor 99 before the 500ms settle fires.
            mockState.urlSearch = '?anchor=99'
            window.history.replaceState({}, '', '/?anchor=99')
            await applyUrlState({})

            // Advance past both 500ms settle callbacks.
            await vi.advanceTimersByTimeAsync(1000)

            // Stale anchor 42 must never animate.
            expect(mockState.animateCameraCalls).not.toContain(42)
            // Current anchor 99 must animate exactly once.
            expect(mockState.animateCameraCalls).toEqual([99])
        } finally {
            vi.useRealTimers()
        }
    })

    it('cancels the deferred re-fire if the user navigates away before threads load', async () => {
        mockState.urlSearch = '?anchor=42'
        window.history.replaceState({}, '', '/?anchor=42')

        const { applyUrlState } = await import('@lib/orchestration/url-state')
        await applyUrlState({})

        const initialPublishCount = mockState.publishCalls.filter(
            (c) => c.type === 'search:search-focus-requested'
        ).length

        // User navigates away — focusedIndex no longer matches the deep-linked index.
        mockState.navStore.focusedIndex = 99

        // Now threads load — the deferred re-fire should bail (focusedIndex !== 42).
        semanticNeighborMapSet(new Map([['42', { neighbors: [{ leadId: '7', semanticScore: 0.9 }] }]]))
        // Poll briefly to confirm no re-fire fires. 10ms was tight under load.
        const noReFireDeadline = Date.now() + 100
        while (Date.now() < noReFireDeadline) {
            await new Promise((r) => setTimeout(r, 5))
        }

        const finalPublishCount = mockState.publishCalls.filter(
            (c) => c.type === 'search:search-focus-requested'
        ).length

        // No additional SEARCH_FOCUS_REQUESTED should have fired for 42.
        expect(finalPublishCount).toBe(initialPublishCount)
    }, 60000)

    it('unsubscribes from semanticNeighborMap when a newer applyUrlState supersedes the restore', async () => {
        mockState.urlSearch = '?anchor=42'
        window.history.replaceState({}, '', '/?anchor=42')

        const { applyUrlState } = await import('@lib/orchestration/url-state')
        const p1 = applyUrlState({})
        await new Promise((r) => setTimeout(r, 0))

        // Supersede with a second restore — this must abort the first restore's signal
        // and tear down its deferred subscription.
        mockState.urlSearch = '?anchor=99'
        window.history.replaceState({}, '', '/?anchor=99')
        const p2 = applyUrlState({})
        await new Promise((r) => setTimeout(r, 0))

        // Both promises settle cleanly.
        await p1.catch(() => {})
        await p2.catch(() => {})

        // Track publishes specifically for anchor 42. The initial restore
        // should have published once; after supersession, the deferred
        // subscription must be gone, so loading threads for 42 must not
        // produce a second publish.
        const initialCountFor42 = mockState.publishCalls.filter(
            (c) => c.type === 'search:search-focus-requested' && (c.payload as { index?: number })?.index === 42
        ).length
        expect(initialCountFor42).toBe(1)

        semanticNeighborMapSet(new Map([['42', { neighbors: [{ leadId: '7', semanticScore: 0.9 }] }]]))

        const deadline = Date.now() + 100
        while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 5))
        }

        expect(
            mockState.publishCalls.filter(
                (c) => c.type === 'search:search-focus-requested' && (c.payload as { index?: number })?.index === 42
            ).length
        ).toBe(initialCountFor42)
    }, 60000)

    it('unsubscribes from semanticNeighborMap when threads never load (bounded timeout cleanup)', async () => {
        const timeoutCtrl = new AbortController()
        vi.spyOn(AbortSignal, 'timeout').mockImplementation((_ms: number) => timeoutCtrl.signal)

        mockState.urlSearch = '?anchor=42'
        window.history.replaceState({}, '', '/?anchor=42')

        const { applyUrlState } = await import('@lib/orchestration/url-state')
        const p = applyUrlState({})
        await new Promise((r) => setTimeout(r, 0))

        // Fire the never-load timeout — the subscription must be torn down.
        timeoutCtrl.abort()
        await new Promise((r) => setTimeout(r, 0))

        await p.catch(() => {})

        // Track publishes specifically for anchor 42. The initial restore
        // should have published once; after the never-load timeout cleanup,
        // loading threads for 42 must not produce a second publish.
        const initialCountFor42 = mockState.publishCalls.filter(
            (c) => c.type === 'search:search-focus-requested' && (c.payload as { index?: number })?.index === 42
        ).length
        expect(initialCountFor42).toBe(1)

        semanticNeighborMapSet(new Map([['42', { neighbors: [{ leadId: '7', semanticScore: 0.9 }] }]]))

        const deadline = Date.now() + 100
        while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 5))
        }

        expect(
            mockState.publishCalls.filter(
                (c) => c.type === 'search:search-focus-requested' && (c.payload as { index?: number })?.index === 42
            ).length
        ).toBe(initialCountFor42)

        vi.restoreAllMocks()
    }, 60000)
})
