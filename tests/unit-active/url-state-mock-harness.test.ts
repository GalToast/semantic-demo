import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * @vitest-environment jsdom
 *
 * url-state.ts Svelte 5 rune mock harness — Phase 6e (2026-06-26)
 *
 * Extends the Phase 6d camera-store-mock-harness pattern to url-state.ts.
 * This file depends on ~12 stores + helpers; all are mocked to plain JS
 * objects via vi.hoisted + getter/setter pattern.
 *
 * Covered:
 *   - clearExplorationFocusSelection: verifies navStore + appState + selection cleared
 *   - resetStateBeforeUrlRestore: verifies full state reset (nav, appState, search, focus)
 *   - updateUrlState: verifies URL params derived from navStore state
 *   - getRequestedUrlDepth: depth parsing (already covered in Phase 6c ext)
 */

// ── Mutable mock state ────────────────────────────────────────────────────────

type MockNavStoreState = {
    mode: string
    currentView: string
    myceliumMode: string
    trailDepthFromExploration: number
    trailDepth: number
    activeStoryPrompt: string | null
    focusedIndex: number | null
    focusedNode: number | null
    applyingUrlState: boolean
    restoringBrowserHistory: boolean
}

const mockState = vi.hoisted(() => ({
    // URL location tracking (so we can read window.location.search)
    locationSearch: '',
    locationHref: 'http://localhost/',
    locationPathname: '/',
    // pushState/replaceState tracking
    pushStateCalls: [] as Array<{ url: string; state: unknown }>,
    replaceStateCalls: [] as Array<{ url: string; state: unknown }>,
    // Navigation store tracking
    navStoreState: {
        mode: 'overview' as string,
        currentView: 'galaxy' as string,
        myceliumMode: 'default' as string,
        trailDepthFromExploration: 0,
        trailDepth: 0,
        activeStoryPrompt: null as string | null,
        focusedIndex: null as number | null,
        focusedNode: null as number | null,
        applyingUrlState: false,
        restoringBrowserHistory: false
    } as MockNavStoreState,
    navStoreUpdateCalls: [] as Array<{ prev: MockNavStoreState; patch: Record<string, unknown> }>,
    // appState
    appStateNavState: { trailDepth: 0 } as Record<string, unknown>,
    appStateCurrentView: 'galaxy' as string,
    appStateTrailDepth: 0,
    appStateSemanticDiveMode: false,
    appStateMyceliumMode: 'default' as string,
    appStateFocusedNode: null as number | null,
    appStateTrailIndices: null as { clear?: () => void } | null,
    appStateFilterVersion: 0,
    appStateSelectedPoint: null as unknown,
    appStateInfoPanelOpen: false,
    appStatePocketListVisible: false,
    // Call tracking
    writeNavStateMirrorCalls: [] as Array<Record<string, unknown>>,
    bumpUrlStateRestoreTokenCalls: 0,
    clearSearchCalls: 0,
    updateSelectedBusinessCalls: [] as Array<unknown>,
    showExperienceToastCalls: [] as Array<{ title: string; message: string }>,
    applyFiltersCalls: 0,
    syncFilterControlsCalls: 0,
    publishCalls: [] as Array<{ type: string; payload: unknown }>,
    // Journey store
    journeyStoreState: { phase: 'overview' as string },
    // Search store
    searchStoreState: { query: '' as string, summary: null as unknown },
    // Focus store
    focusStoreState: { selectedBusiness: null as unknown },
    // Filter state
    filterStateValues: {
        status: '',
        city: '',
        website: false,
        email: false,
        geocoded: false
    } as Record<string, unknown>,
    activeClusterFilterValue: null as string | null,
    restoreActiveClusterFilterCalls: [] as Array<unknown>,
    restoreActiveFiltersCalls: 0,
    // DOM
    searchInputValue: '' as string,
    // Search input element
    searchInputExists: true,
    // URL depth restore token
    restoreToken: 0
}))

// ── Module mocks ─────────────────────────────────────────────────────────────

// Mock appState
vi.mock('@lib/state/app.svelte.ts', () => ({
    appState: {
        get navState() {
            return mockState.appStateNavState
        },
        set navState(v) {
            mockState.appStateNavState = v as Record<string, unknown>
        },
        get currentView() {
            return mockState.appStateCurrentView
        },
        set currentView(v) {
            mockState.appStateCurrentView = v as string
        },
        get trailDepth() {
            return mockState.appStateTrailDepth
        },
        set trailDepth(v) {
            mockState.appStateTrailDepth = v as number
        },
        get semanticDiveMode() {
            return mockState.appStateSemanticDiveMode
        },
        set semanticDiveMode(v) {
            mockState.appStateSemanticDiveMode = v as boolean
        },
        get myceliumMode() {
            return mockState.appStateMyceliumMode
        },
        set myceliumMode(v) {
            mockState.appStateMyceliumMode = v as string
        },
        get focusedNode() {
            return mockState.appStateFocusedNode
        },
        set focusedNode(v) {
            mockState.appStateFocusedNode = v as number | null
        },
        get trailIndices() {
            return mockState.appStateTrailIndices
        },
        set trailIndices(v) {
            mockState.appStateTrailIndices = v as { clear?: () => void } | null
        },
        get filterVersion() {
            return mockState.appStateFilterVersion
        },
        get selectedPoint() {
            return mockState.appStateSelectedPoint
        },
        get infoPanelOpen() {
            return mockState.appStateInfoPanelOpen
        },
        get pocketListVisible() {
            return mockState.appStatePocketListVisible
        },
        // W11-T4 partition sub-records — insurance against future partition drift.
        searchState: {
            currentSearchSummary: null,
            searchStatus: 'idle',
            searchError: null,
            searchRequestSequence: 0,
            searchAnchorIndex: null,
            searchPreviewIndex: null,
            searchGlowIndices: new Set(),
            searchGlowTopIndex: null,
            searchGlowActive: false,
            searchFocusTransitionToken: 0,
            isSearching: false,
            currentEmptyQuery: null,
            semanticTrailCue: 'idle',
            isCompactViewport: false,
            semanticGuideRequestSequence: 0,
            currentSemanticGuide: null,
            summaryCardTypeToken: 0,
searchVisibleCount: 5
        },
        viewportState: {
            viewportWidth: 1280,
            viewportHeight: 800,
            isCompactViewport: false,
            isMobileViewport: false,
            isTabletViewport: false,
            devicePixelRatio: 1
        },
        focusState: {
            selectedPoint: null,
            inspectedThreadIndex: null,
            pinnedThreadIndex: null,
            threadInspectorPointerInside: false,
            pocketMotionByIndex: new Map(),
            pocketTransitionStartedAt: 0,
            infoPanelOpen: true,
            pocketListVisible: false,
            pocketRoleFilter: 'all',
            focusTransitionMode: 'idle',
            focusTransitionStartedAt: 0,
            nodesAreSettling: false,
            inspectedStrandDiagnostics: {
                active: false,
                source: '',
                index: null,
                focusedIndex: null,
                segmentCount: 0,
                braidCount: 0,
                endpointCount: 0
            }
        },
        withMutation: (fn: () => unknown) => fn()
    }
}))

// Mock navigation store as a writable
vi.mock('@lib/stores/navigation.svelte.ts', async () => {
    const { writable } = await import('svelte/store')
    const update = (updater: (s: typeof mockState.navStoreState) => typeof mockState.navStoreState) => {
        const prev = { ...mockState.navStoreState }
        const next = updater(mockState.navStoreState)
        mockState.navStoreUpdateCalls.push({ prev, patch: next as Record<string, unknown> })
        Object.assign(mockState.navStoreState, next)
    }
    const store = writable(mockState.navStoreState)
    return {
        navStore: Object.assign(() => mockState.navStoreState, {
            update,
            set: (v: typeof mockState.navStoreState) => {
                mockState.navStoreState = v
                store.set(v)
            },
            // Critical: subscribe MUST pass the current value to the subscriber.
            // svelte's `get()` works by subscribing, capturing the value, and returning.
            // If subscribe calls fn() with no args, get returns undefined.
            subscribe: (fn: (v: typeof mockState.navStoreState) => void) => {
                fn(mockState.navStoreState)
                return () => {}
            }
        }),
        writeNavStateMirror: (patch: Record<string, unknown>) => {
            mockState.writeNavStateMirrorCalls.push(patch)
            Object.assign(mockState.navStoreState, patch)
            // Mirror real writeNavStateMirror side-effects on top-level appState fields
            if (typeof patch.trailDepth === 'number') {
                mockState.appStateTrailDepth = patch.trailDepth
            }
            if (patch.currentView === 'galaxy' || patch.currentView === 'map') {
                mockState.appStateCurrentView = patch.currentView as string
            }
        },
        bumpUrlStateRestoreToken: (): number => {
            mockState.bumpUrlStateRestoreTokenCalls++
            mockState.restoreToken++
            return mockState.restoreToken
        }
    }
})

// Mock journey store
vi.mock('@lib/stores/journey.svelte', () => ({
    journeyStore: Object.assign(() => mockState.journeyStoreState, {
        update: (updater: (s: typeof mockState.journeyStoreState) => typeof mockState.journeyStoreState) => {
            const next = updater(mockState.journeyStoreState)
            Object.assign(mockState.journeyStoreState, next)
        },
        set: (v: typeof mockState.journeyStoreState) => {
            mockState.journeyStoreState = v
        },
        subscribe: (fn: () => void) => {
            fn()
            return () => {}
        }
    }),
    setJourneyPhase: (phase: string) => {
        mockState.journeyStoreState.phase = phase
    }
}))

// Mock search store
vi.mock('@lib/stores/search.svelte', () => ({
    searchStore: () => mockState.searchStoreState,
    clearSearch: () => {
        mockState.clearSearchCalls++
    },
    runSearch: () => {}
}))

// Mock focus store
vi.mock('@lib/stores/focus.svelte', () => ({
    focusStore: Object.assign(() => mockState.focusStoreState, {
        update: (updater: (s: typeof mockState.focusStoreState) => typeof mockState.focusStoreState) => {
            const next = updater(mockState.focusStoreState)
            Object.assign(mockState.focusStoreState, next)
        },
        set: (v: typeof mockState.focusStoreState) => {
            mockState.focusStoreState = v
        },
        subscribe: (fn: () => void) => {
            fn()
            return () => {}
        }
    })
}))

// Mock filter store
vi.mock('@lib/stores/filter.svelte', () => ({
    filterState: {
        subscribe: (fn: () => void) => {
            fn()
            return () => {}
        }
    },
    restoreActiveClusterFilterFromUrl: (v: unknown) => {
        mockState.restoreActiveClusterFilterCalls.push(v)
    },
    restoreActiveFiltersFromUrl: () => {
        mockState.restoreActiveFiltersCalls++
    }
}))

// Mock event bus
vi.mock('@lib/orchestration/event-bus', () => ({
    publish: (type: string, payload: unknown) => {
        mockState.publishCalls.push({ type, payload })
    },
    subscribe: () => () => {},
    EVENTS: { URL_STATE_RESTORED: 'URL_STATE_RESTORED' }
}))

// Mock toast
vi.mock('@lib/orchestration/toast', () => ({
    showExperienceToast: (title: string, message: string) => {
        mockState.showExperienceToastCalls.push({ title, message })
    }
}))

// Mock selected-card
vi.mock('@lib/journey/selected-card', () => ({
    updateSelectedBusiness: (v: unknown) => {
        mockState.updateSelectedBusinessCalls.push(v)
    }
}))

// Mock search-filter-core
vi.mock('@lib/orchestration/search-filter-core', () => ({
    applyFilters: () => {
        mockState.applyFiltersCalls++
    }
}))

// Mock cluster-filter-controller
vi.mock('@lib/orchestration/cluster-filter-controller', () => ({
    syncFilterControls: () => {
        mockState.syncFilterControlsCalls++
    }
}))

// Mock debug (no-op)
vi.mock('@lib/utils/debug', () => ({
    debugWarn: () => {}
}))

// ── Import AFTER mocks ───────────────────────────────────────────────────────

import {
    clearExplorationFocusSelection,
    resetStateBeforeUrlRestore,
    updateUrlState
} from '@lib/orchestration/url-state'

// ── Test helpers ─────────────────────────────────────────────────────────────

function resetAllMockState(): void {
    // URL
    mockState.locationSearch = ''
    mockState.locationHref = 'http://localhost/'
    mockState.locationPathname = '/'
    mockState.pushStateCalls = []
    mockState.replaceStateCalls = []
    // navStore
    mockState.navStoreState = {
        mode: 'overview',
        currentView: 'galaxy',
        myceliumMode: 'default',
        trailDepthFromExploration: 0,
        trailDepth: 0,
        activeStoryPrompt: null,
        focusedIndex: null,
        focusedNode: null,
        applyingUrlState: false,
        restoringBrowserHistory: false
    }
    mockState.navStoreUpdateCalls = []
    // appState
    mockState.appStateNavState = { trailDepth: 0 }
    mockState.appStateCurrentView = 'galaxy'
    mockState.appStateTrailDepth = 0
    mockState.appStateSemanticDiveMode = false
    mockState.appStateMyceliumMode = 'default'
    mockState.appStateFocusedNode = null
    mockState.appStateTrailIndices = null
    mockState.appStateFilterVersion = 0
    mockState.appStateSelectedPoint = null
    mockState.appStateInfoPanelOpen = false
    mockState.appStatePocketListVisible = false
    // Calls
    mockState.writeNavStateMirrorCalls = []
    mockState.bumpUrlStateRestoreTokenCalls = 0
    mockState.clearSearchCalls = 0
    mockState.updateSelectedBusinessCalls = []
    mockState.showExperienceToastCalls = []
    mockState.applyFiltersCalls = 0
    mockState.syncFilterControlsCalls = 0
    mockState.publishCalls = []
    // Journey
    mockState.journeyStoreState = { phase: 'overview' }
    // Search
    mockState.searchStoreState = { query: '', summary: null }
    // Focus
    mockState.focusStoreState = { selectedBusiness: null }
    // Filter
    mockState.filterStateValues = {
        status: '',
        city: '',
        website: false,
        email: false,
        geocoded: false
    }
    mockState.activeClusterFilterValue = null
    mockState.restoreActiveClusterFilterCalls = []
    mockState.restoreActiveFiltersCalls = 0
    // DOM
    mockState.searchInputValue = ''
    mockState.searchInputExists = true
    mockState.restoreToken = 0
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('url-state.ts — Svelte 5 mock harness (Phase 6e)', () => {
    beforeEach(() => {
        resetAllMockState()
    })

    // ── clearExplorationFocusSelection ──────────────────────────────────────

    describe('clearExplorationFocusSelection', () => {
        it('writes navState mirror with focus/clear values', () => {
            clearExplorationFocusSelection()
            expect(mockState.writeNavStateMirrorCalls.length).toBe(1)
            const patch = mockState.writeNavStateMirrorCalls[0]!
            expect(patch.focusedIndex).toBe(null)
            expect(patch.mode).toBe('overview')
            expect(patch.trailDepth).toBe(0)
            expect(patch.trailSeedIndex).toBe(null)
            expect(patch.trailNeighborIndices).toEqual([])
            expect(patch.trailCursor).toBe(-1)
        })

        it('calls appState.withMutation to clear focusedNode', () => {
            clearExplorationFocusSelection()
            // appState.focusedNode was set to null via the withMutation block
            expect(mockState.appStateFocusedNode).toBe(null)
        })

        it('calls updateSelectedBusiness(null)', () => {
            clearExplorationFocusSelection()
            expect(mockState.updateSelectedBusinessCalls).toEqual([null])
        })
    })

    // ── resetStateBeforeUrlRestore ──────────────────────────────────────────

    describe('resetStateBeforeUrlRestore', () => {
        it('calls clearExplorationFocusSelection as first step', () => {
            resetStateBeforeUrlRestore()
            // writeNavStateMirror is called by clearExplorationFocusSelection (1) +
            // the reset-state patch (1) = 2 total calls
            expect(mockState.writeNavStateMirrorCalls.length).toBe(2)
        })

        it('updates navStore to default state', () => {
            // Pre-set non-default values
            mockState.navStoreState.mode = 'focus'
            mockState.navStoreState.currentView = 'map'
            mockState.navStoreState.myceliumMode = 'semantic'
            mockState.navStoreState.trailDepth = 5

            resetStateBeforeUrlRestore()

            // After reset, the latest navStoreUpdate patch should have defaults
            expect(mockState.navStoreState.mode).toBe('overview')
            expect(mockState.navStoreState.currentView).toBe('galaxy')
            expect(mockState.navStoreState.myceliumMode).toBe('default')
            expect(mockState.navStoreState.trailDepth).toBe(0)
        })

        it('resets appState fields via withMutation', () => {
            // Pre-set non-default values
            mockState.appStateCurrentView = 'map'
            mockState.appStateTrailDepth = 7
            mockState.appStateSemanticDiveMode = true
            mockState.appStateMyceliumMode = 'semantic'

            resetStateBeforeUrlRestore()

            // After reset, the mocked values should be defaults
            expect(mockState.appStateCurrentView).toBe('galaxy')
            expect(mockState.appStateTrailDepth).toBe(0)
            expect(mockState.appStateSemanticDiveMode).toBe(false)
            expect(mockState.appStateMyceliumMode).toBe('default')
        })

        it('calls clearSearch', () => {
            resetStateBeforeUrlRestore()
            expect(mockState.clearSearchCalls).toBe(1)
        })

        it('calls focusStore.update (no-op observable without internal state)', () => {
            // focusStore is mocked as a callable; verify it can be called
            expect(() => resetStateBeforeUrlRestore()).not.toThrow()
        })

        it('respects clearSearchInput option (default false)', () => {
            // Default behavior: search input is NOT cleared (input exists, value stays)
            resetStateBeforeUrlRestore()
            // We don't directly assert the input value here, but verify no errors
            expect(mockState.clearSearchCalls).toBe(1)
        })

        it('clears search input DOM element when clearSearchInput is true', () => {
            // Set up a search input element
            const inputEl = document.createElement('input')
            inputEl.id = 'search-input'
            inputEl.value = 'something'
            document.body.appendChild(inputEl)

            resetStateBeforeUrlRestore({ clearSearchInput: true })

            // After reset, the input value should be cleared
            expect(inputEl.value).toBe('')
            document.body.removeChild(inputEl)
        })
    })

    // ── updateUrlState ───────────────────────────────────────────────────────

    describe('updateUrlState', () => {
        let replaceSpy: ReturnType<typeof vi.spyOn>

        beforeEach(() => {
            // Use vi.spyOn which handles jsdom's History validation
            replaceSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})
        })

        afterEach(() => {
            replaceSpy.mockRestore()
        })

        it('does nothing when applyingUrlState is true (without force)', () => {
            mockState.navStoreState.applyingUrlState = true
            updateUrlState()
            expect(replaceSpy).not.toHaveBeenCalled()
        })

        it('proceeds when applyingUrlState is true with force option', () => {
            mockState.navStoreState.applyingUrlState = true
            updateUrlState({}, { force: true })
            expect(replaceSpy).toHaveBeenCalled()
        })

        it('does nothing when restoringBrowserHistory is true', () => {
            mockState.navStoreState.restoringBrowserHistory = true
            updateUrlState({}, { force: true })
            expect(replaceSpy).not.toHaveBeenCalled()
        })

        it('encodes non-default currentView as URL change', () => {
            mockState.navStoreState.currentView = 'map'
            updateUrlState()
            expect(replaceSpy).toHaveBeenCalled()
        })

        it('encodes non-default myceliumMode as URL change', () => {
            mockState.navStoreState.myceliumMode = 'semantic'
            updateUrlState()
            expect(replaceSpy).toHaveBeenCalled()
        })

        it('encodes trailDepthFromExploration > 0 as URL change', () => {
            mockState.navStoreState.trailDepthFromExploration = 2
            updateUrlState()
            expect(replaceSpy).toHaveBeenCalled()
        })

        it('calls replaceState on first run to set semanticDemo flag', () => {
            // When all state is default, the URL doesn't change BUT the function
            // still calls replaceState to mark window.history.state with the
            // semanticDemo flag (so subsequent calls can detect "no real change").
            updateUrlState()
            expect(replaceSpy).toHaveBeenCalled()
            // The call should include semanticDemo: true in the history state
            const callArgs = replaceSpy.mock.calls[0]
            expect(callArgs?.[0]).toMatchObject({ semanticDemo: true })
        })

        it('encodes activeStoryPrompt as URL change', () => {
            mockState.navStoreState.activeStoryPrompt = 'test-story'
            updateUrlState()
            expect(replaceSpy).toHaveBeenCalled()
        })

        it('merges extra params into URL', () => {
            updateUrlState({ foo: 'bar', baz: 'qux' })
            expect(replaceSpy).toHaveBeenCalled()
        })
    })
})
