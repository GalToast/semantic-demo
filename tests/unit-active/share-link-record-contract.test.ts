/**
 * @vitest-environment jsdom
 *
 * share-link-record-contract.test.ts — BS-B6 regression tests for
 * copyCurrentViewLink() converting opaque ?anchor=<bufferIndex> to
 * stable ?record=<lead_id> in the clipboard URL.
 *
 * The in-app URL uses ?anchor=N (buffer index) for internal routing,
 * but shared links must carry ?record=<lead_id> — the canonical stable
 * identity. A reordered corpus breaks anchor-index links.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

// ── Mutable mock state ────────────────────────────────────────────────────────

const mockState = vi.hoisted(() => ({
    navStore: {
        currentView: 'galaxy',
        myceliumMode: 'default',
        focusedIndex: null,
        urlStateRestoreToken: 0,
        applyingUrlState: false,
        restoringBrowserHistory: false
    } as Record<string, unknown>,
    points: [] as Array<{ lead_id?: string | number | null; name?: string | null }>,
    locationHref: 'https://example.com/',
    clipboardText: null as string | null,
    clipboardReject: false,
    toastCalls: [] as Array<{ title: string; message: string }>
}))

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@lib/stores/navigation.svelte.ts', () => ({
    navStore: {
        subscribe: (fn: (v: unknown) => void) => {
            fn(mockState.navStore)
            return () => {}
        }
    },
    writeNavStateMirror: (_patch: Record<string, unknown>) => {},
    bumpUrlStateRestoreToken: () => 0,
    dispatchNavTransition: () => {},
    NAV_TRANSITION_ACTIONS: {}
}))

vi.mock('@lib/orchestration/toast', () => ({
    showExperienceToast: (title: string, message: string) => {
        mockState.toastCalls.push({ title, message })
    },
    debugWarn: () => {}
}))

vi.mock('@lib/state/app.svelte', () => ({
    appState: {
        get points() {
            return mockState.points
        },
        get viewportState() {
            return {
                viewportWidth: 1920,
                viewportHeight: 1080,
                viewportDpr: 1,
                viewportReducedMotion: false,
                viewportIsCompact: false
            }
        },
        get navState() {
            return { trailDepth: 0 }
        },
        get currentView() {
            return 'galaxy'
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
        }
    }
}))

vi.mock('@lib/orchestration/url-params', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@lib/orchestration/url-params')>()
    return {
        ...actual,
        getSearchParams: () => new URLSearchParams(),
        getLocationHref: () => mockState.locationHref,
        getLocationPathname: () => '/',
        isDomForcedFocusSearchSurface: () => false
    }
})

// Stub stores that the module graph transitively imports but copyCurrentViewLink
// doesn't exercise at runtime.
vi.mock('@lib/stores/journey.svelte', () => ({
    journeyStore: { update: () => {} },
    setJourneyPhase: () => {},
    JOURNEY_COMPASS_PHASE_ORDER: ['overview'],
    JOURNEY_CONFIG: {},
    setTrailDepth: () => {}
}))

vi.mock('@lib/stores/focus.svelte', () => ({
    focusStore: { update: () => {} },
    setSemanticDiveMode: () => {}
}))

vi.mock('@lib/journey/selected-card', () => ({
    updateSelectedBusiness: () => {}
}))

vi.mock('@lib/journey/thread-settler', () => ({
    setFocusedNode: () => {}
}))

vi.mock('@lib/stores/filter.svelte', () => ({
    getFilterState: () => ({ status: 'all', city: '', website: false, email: false, geocoded: false }),
    restoreActiveClusterFilterFromUrl: () => {},
    restoreActiveFiltersFromUrl: () => {}
}))

vi.mock('@lib/stores/search.svelte', () => ({
    searchStore: () => ({ status: 'idle', query: '', results: [] }),
    clearSearch: () => {},
    runSearch: () => Promise.resolve(),
    setSearchError: () => {}
}))

vi.mock('@lib/orchestration/search-filter-core', () => ({
    applyFilters: () => {}
}))

vi.mock('@lib/orchestration/cluster-filter-controller', () => ({
    syncFilterControls: () => {},
    restoreActiveClusterFilterFromUrl: () => {}
}))

vi.mock('@lib/orchestration/event-bus', () => ({
    publish: () => {},
    subscribe: () => () => {},
    subscribeKeyed: () => () => {},
    EVENTS: {}
}))

vi.mock('@lib/data-store', () => ({
    semanticNeighborMap: { subscribe: () => () => {}, get: () => () => new Map() }
}))

vi.mock('@lib/search/search-abort', () => ({
    startSearch: () => ({ isNew: false, release: () => {} })
}))

vi.mock('@lib/search/search-panel-adapter', () => ({
    setMobileSearchSheetMode: () => {}
}))

vi.mock('@lib/utils/ui-presentation', () => ({
    isCompactSearchViewport: () => false
}))

vi.mock('@lib/engine/camera-choreography/focus', () => ({
    animateCameraToNode: () => {}
}))

vi.mock('@lib/journey/semantic-overlay', () => ({
    refreshFocusSemanticOverlay: () => {},
    updateFocusSemanticOverlayPositions: () => {}
}))

vi.mock('@lib/journey/point-color', () => ({
    applyPointFilterColors: () => {}
}))

vi.mock('@lib/utils/disposable-registry', () => ({
    DisposableRegistry: class {
        disposeAll() {}
        schedule(_ms: number, _fn: () => void) {}
    }
}))

vi.mock('@lib/orchestration/lifecycle', () => ({
    resetExplorationFocus: () => {},
    refreshCompositionState: () => {}
}))

// ── Import the function under test ────────────────────────────────────────────

// Since copyCurrentViewLink is exported from url-state.ts (and re-exported
// from lifecycle.ts), import directly from the source. We don't mock the
// imports that are unused by the code path we exercise; they're resolved
// by vitest's module graph but the code under test won't call them.
const { copyCurrentViewLink } = await vi.importActual<typeof import('../../src/lib/orchestration/url-state')>(
    '../../src/lib/orchestration/url-state'
)

// ── Helpers ───────────────────────────────────────────────────────────────────

function setupPoints(count: number): void {
    mockState.points = Array.from({ length: count }, (_, i) => ({
        lead_id: String(i * 10 + 1),
        name: `Biz ${i}`
    }))
}

function setLocation(href: string): void {
    mockState.locationHref = href
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('copyCurrentViewLink anchor→record conversion (BS-B6)', () => {
    beforeEach(() => {
        mockState.clipboardText = null
        mockState.clipboardReject = false
        mockState.toastCalls = []
        mockState.navStore.currentView = 'galaxy'
        mockState.navStore.myceliumMode = 'default'
        mockState.points = []
        setLocation('https://example.com/')

        // Mock clipboard API
        Object.defineProperty(navigator, 'clipboard', {
            value: {
                writeText: vi.fn().mockImplementation(async (text: string) => {
                    if (mockState.clipboardReject) {
                        throw new DOMException('Denied', 'NotAllowedError')
                    }
                    mockState.clipboardText = text
                })
            },
            writable: true,
            configurable: true
        })
    })

    it('converts ?anchor=<index> to ?record=<lead_id> when points have lead_id', async () => {
        setupPoints(100)
        setLocation('https://example.com/?anchor=42&view=galaxy')

        const href = await copyCurrentViewLink()

        expect(href).not.toBeNull()
        // Should NOT contain the opaque anchor param
        expect(href!).not.toContain('anchor=')
        // Should contain the stable record param with the correct lead_id
        // Point index 42 → lead_id = String(42 * 10 + 1) = '421'
        expect(href!).toContain('record=421')

        expect(mockState.clipboardText).toEqual(href)
    })

    it('leaves anchor param in place when lead_id is null for the index', async () => {
        setupPoints(100)
        // Clear lead_id for index 42
        mockState.points[42] = { lead_id: null, name: 'No ID Biz' }
        setLocation('https://example.com/?anchor=42&view=galaxy')

        const href = await copyCurrentViewLink()

        expect(href).not.toBeNull()
        // anchor stays because we couldn't resolve a stable lead_id
        expect(href!).toContain('anchor=42')
        // record must NOT appear
        expect(href!).not.toContain('record=')
    })

    it('shows toast on successful copy', async () => {
        setupPoints(100)
        setLocation('https://example.com/?view=galaxy')

        const href = await copyCurrentViewLink()

        expect(href).not.toBeNull()
        expect(mockState.toastCalls).toHaveLength(1)
        expect(mockState.toastCalls[0].title).toBe('View link copied')
    })

    it('returns null and shows error toast on clipboard failure', async () => {
        mockState.clipboardReject = true
        setLocation('https://example.com/?view=galaxy')

        const href = await copyCurrentViewLink()

        expect(href).toBeNull()
        expect(mockState.toastCalls).toHaveLength(1)
        expect(mockState.toastCalls[0].title).toBe('Copy unavailable')
    })

    it('preserves other URL params (view, mode, q, surface)', async () => {
        setupPoints(100)
        // copyCurrentViewLink sets 'view' from navStore, overriding the URL
        mockState.navStore.currentView = 'map'
        mockState.navStore.myceliumMode = 'thread'
        setLocation('https://example.com/?anchor=7&view=map&q=coffee&surface=search&mode=thread')

        const href = await copyCurrentViewLink()

        expect(href).not.toBeNull()
        expect(href!).toContain('record=71')
        expect(href!).not.toContain('anchor=')
        expect(href!).toContain('view=map')
        expect(href!).toContain('q=coffee')
        expect(href!).toContain('surface=search')
        expect(href!).toContain('mode=thread')
    })

    it('strips cb and lead params from clipboard URL', async () => {
        setupPoints(100)
        setLocation('https://example.com/?cb=123&lead=abc&view=galaxy')

        const href = await copyCurrentViewLink()

        expect(href).not.toBeNull()
        expect(href!).not.toContain('cb=')
        expect(href!).not.toContain('lead=')
    })

    it('handles missing anchor gracefully (no conversion)', async () => {
        setupPoints(100)
        setLocation('https://example.com/?view=galaxy&q=donuts')

        const href = await copyCurrentViewLink()

        expect(href).not.toBeNull()
        expect(href!).not.toContain('record=')
        expect(href!).not.toContain('anchor=')
        expect(href!).toContain('q=donuts')
    })

    it('keeps anchor when points array is empty (defensive)', async () => {
        setLocation('https://example.com/?anchor=5&view=galaxy')
        // points array is empty (default)

        const href = await copyCurrentViewLink()

        expect(href).not.toBeNull()
        // anchor stays because there's no data to resolve
        expect(href!).toContain('anchor=5')
    })

    it('keeps anchor when index is out of range', async () => {
        setupPoints(50)
        setLocation('https://example.com/?anchor=999&view=galaxy')

        const href = await copyCurrentViewLink()

        expect(href).not.toBeNull()
        expect(href!).toContain('anchor=999')
        expect(href!).not.toContain('record=')
    })

    it('keeps anchor when index is not a finite number', async () => {
        setupPoints(100)
        setLocation('https://example.com/?anchor=not-a-number&view=galaxy')

        const href = await copyCurrentViewLink()

        expect(href).not.toBeNull()
        expect(href!).toContain('anchor=not-a-number')
        expect(href!).not.toContain('record=')
    })
})
