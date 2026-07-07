/**
 * @file tests/helpers/app-state-mock.ts
 *
 * Minimal-but-valid `appState` mock factory for vitest tests that need to
 * replace `@lib/state/app.svelte.ts`. The defaults mirror the canonical
 * `$state` initializers in `src/lib/state/app.svelte.ts` after the W11-T4
 * state partition (Phases 6a–6c) so lazy imports at module-init time resolve
 * cleanly.
 *
 * Why a factory instead of inline `vi.mock(..., () => ({ ...literal... }))`:
 *   - Keeps each test's mock in sync with the canonical `appState` shape.
 *     Today 17 vitest files mock `@lib/state/app.svelte.ts`; every time a
 *     phase of the partition rolls a new sub-aggregate, those literal mocks
 *     rot. A factory centralizes the default shape so a single edit covers
 *     all 17.
 *   - Exposes `DEFAULT_NAV_STATE`, `DEFAULT_SEARCH_STATE`,
 *     `DEFAULT_FOCUS_STATE` so tests that mutate `mockAppState.navState =
 *     {...DEFAULT_NAV_STATE, ...}` per-test (see `navigation-store.test.ts`)
 *     can spread from the canonical defaults instead of handwriting them.
 *
 * Usage — frozen module replacement:
 *
 *   vi.mock('@lib/state/app.svelte.ts', () => ({
 *     appState: buildAppStateMock({ navState: { mode: 'focus' } })
 *   }))
 *
 * Usage — mutable reference for per-test mutation:
 *
 *   const mockAppState = buildAppStateMock()
 *   vi.mock('@lib/state/app.svelte.ts', () => ({ appState: mockAppState }))
 *   beforeEach(() => {
 *     mockAppState.navState = { ...DEFAULT_NAV_STATE, surface: 'focus' }
 *   })
 */

import type { SearchAppState, FocusAppState } from '@lib/state/state-types'
import type { NavState, SearchStatus } from '@lib/types/state'

const searchCacheDiagnostics = {
    hits: 0,
    misses: 0,
    stores: 0,
    evictions: 0,
    lastKey: null,
    lastSource: null,
    lastAgeMs: null
}

export const DEFAULT_SEARCH_STATE: SearchAppState = {
    currentSearchSummary: null,
    searchStatus: 'idle' as SearchStatus,
    searchError: null,
    searchRequestSequence: 0,
    searchAnchorIndex: null,
    searchPreviewIndex: null,
    searchGlowIndices: new Set<number>(),
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
    semanticSearchCacheDiagnostics: searchCacheDiagnostics,
    semanticSearchResultCache: new Map(),
    searchVisibleCount: 5
}

export const DEFAULT_FOCUS_STATE: FocusAppState = {
    selectedPoint: null,
    inspectedThreadIndex: null,
    pinnedThreadIndex: null,
    inspectedStrandDiagnostics: {
        active: false,
        source: '',
        index: null,
        focusedIndex: null,
        segmentCount: 0,
        braidCount: 0,
        endpointCount: 0
    },
    threadInspectorPointerInside: false,
    pocketMotionByIndex: new Map(),
    pocketTransitionStartedAt: 0,
    infoPanelOpen: true,
    pocketListVisible: false,
    pocketRoleFilter: 'all',
    focusTransitionMode: 'idle',
    focusTransitionStartedAt: 0,
    nodesAreSettling: false
}

export const DEFAULT_NAV_STATE: NavState = {
    mode: 'overview',
    surface: 'idle',
    previousSurface: 'idle',
    focusedIndex: null,
    trailSeedIndex: null,
    trailNeighborIndices: [],
    trailCursor: 0,
    trailDepth: 0,
    walkHistoryIndices: [],
    lastTraversalReason: null,
    threadCandidates: [],
    threadReasonByIndex: new Map(),
    threadSource: '',
    focusPocketIndices: [],
    focusPocketMeta: null,
    focusPocketRoleByIndex: new Map(),
    focusFramingMeta: null,
    currentPersonality: null,
    neighborhoodIndices: [],
    explorationHistoryIndices: [],
    neighborhoodReasonByIndex: new Map(),
    // neighbourhoodManifest / neighborhoodSource / neighborhoodAnchorIndex
    // live on the canonical NavState but are populated lazily by
    // `neighborhood.ts`; tests can spread them in if they need them.
    currentView: 'galaxy',
    myceliumMode: '',
    autoRotate: false,
    autoRotateSuspended: false,
    trailDepthFromExploration: 0,
    sceneRevealActive: false,
    sceneRevealStartedAt: 0,
    loadingPhaseKey: '',
    applyingUrlState: false,
    restoringBrowserHistory: false,
    urlStateRestoreToken: 0,
    activeStoryPrompt: null
}

export interface AppStateMockOverrides {
    searchState?: Partial<SearchAppState>
    focusState?: Partial<FocusAppState>
    navState?: Partial<NavState>
    /**
     * Allow tests to override or supply other top-level `appState` fields
     * (e.g. `semanticGuideState`, `searchResults`, `isCompactViewport`).
     * Anything not matching a known sub-record flows through as a top-level
     * override applied last.
     */
    [key: string]: unknown
}

export function buildAppStateMock(overrides: AppStateMockOverrides = {}) {
    const {
        searchState: searchOverride,
        focusState: focusOverride,
        navState: navOverride,
        semanticGuideState: semanticGuideOverride,
        ...rest
    } = overrides

    return {
        searchState: { ...DEFAULT_SEARCH_STATE, ...searchOverride },
        focusState: { ...DEFAULT_FOCUS_STATE, ...focusOverride },
        navState: { ...DEFAULT_NAV_STATE, ...navOverride },
        semanticGuideState: {
            isVisible: false,
            isSynthesizing: false,
            config: {},
            storyText: '',
            storySource: '',
            showStory: false,
            ...(semanticGuideOverride as object | undefined)
        },
        semanticLaneState: 'checking',
        semanticLaneSnapshot: null,
        searchResults: [],
        searchSummary: null,
        searchTrailCueLastRenderedAt: 0,
        isCompactViewport: false,
        searchTimeout: null,
        searchAbortController: null,
        ...rest
    }
}
