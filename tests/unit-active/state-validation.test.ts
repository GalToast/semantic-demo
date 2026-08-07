/**
 * @vitest-environment jsdom
 *
 * State validation tests — verifies that invalid appState writes are
 * caught by the proxy guards.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const _appState = vi.hoisted(() => ({
    currentView: 'galaxy',
    navState: {
        mode: 'overview',
        surface: 'idle',
        previousSurface: 'idle',
        focusedIndex: null,
        trailDepth: 0,
        trailSeedIndex: null,
        trailNeighborIndices: [],
        trailCursor: -1,
        walkHistoryIndices: [],
        explorationHistoryIndices: [],
        lastTraversalReason: null,
        threadCandidates: [],
        threadReasonByIndex: new Map(),
        threadSource: 'geometric-fallback',
        focusPocketIndices: [],
        focusPocketMeta: null,
        focusPocketRoleByIndex: new Map(),
        focusFramingMeta: null,
        currentPersonality: null,
        neighborhoodIndices: [],
        currentView: 'galaxy',
        myceliumMode: 'dormant',
        autoRotate: true,
        autoRotateSuspended: false,
        trailDepthFromExploration: 0,
        sceneRevealActive: false,
        sceneRevealStartedAt: 0,
        loadingPhaseKey: 'records',
        applyingUrlState: false,
        restoringBrowserHistory: false,
        urlStateRestoreToken: 0,
        activeStoryPrompt: null
    },
    searchStatus: 'idle',
    loadingPhaseKey: 'records',
    semanticLaneState: 'checking',
    focusTransitionMode: 'idle',
    myceliumMode: 'default',
    trailDepth: 0,
    weatherInitialized: false,
    viewportWidth: 1920,
    viewportHeight: 1080,
    viewportDpr: 1,
    autoRotate: false,
    autoRotateSuspended: false,
    infoPanelOpen: true,
    pocketListVisible: false,
    legendOpen: false,
    sceneRevealActive: false,
    focusCameraAssistActive: false,
    threadInspectorPointerInside: false,
    eventListenersInitialized: false,
    applyingUrlState: false,
    restoringBrowserHistory: false,
    deferredHydrationStarted: false,
    searchResults: [],
    searchVisibleCount: 5,
    searchRequestSequence: 0,
    searchFocusTransitionToken: 0,
    semanticGuideRequestSequence: 0,
    summaryCardTypeToken: 0,
    compactSearchRevealToken: 0,
    mobileRouteFieldPeekToken: 0,
    semanticTrailStoryRequestSequence: 0,
    semanticLaneWarmingCounter: 0,
    filterVersion: 0,
    filterColorVersion: 0,
    focusCameraAnimationToken: 0,
    pocketTransitionStartedAt: 0,
    _semanticDiveTransitionDeadline: 0,
    lastRenderedTypeToken: 0,
    loadingOverlayStartedAt: 0,
    sceneRevealStartedAt: 0,
    routeCameraAnimationToken: 0,
    rippleStartTime: 0,
    bloomPulseStartTime: 0,
    bridgePulseStartTime: 0,
    pulsePhase: 0,
    _settlingMaxDelta: 0,
    pointColorStateVersion: 0,
    hoverHighlightIndex: -1,
    inspectedThreadIndex: null,
    pinnedThreadIndex: null,
    focusedNode: null,
    weather: null,
    weatherState: {
        weather: null,
        lastFetch: null,
        fallback: false,
        stalenessMsg: ''
    },
    focusFrameDiagnostics: {
        lastFrameAt: 0,
        sampleCount: 0,
        avgFrameMs: 0,
        maxFrameMs: 0,
        lastOverlayMs: 0,
        lastOverlayEdgeCount: 0,
        lastOverlayPairs: 0
    },
    focusThreadDiagnostics: {
        active: false,
        reason: 'not-built',
        edgeCount: 0,
        directEdgeCount: 0,
        supportEdgeCount: 0,
        subduedEdgeCount: 0,
        segmentCount: 0,
        vertexCount: 0,
        overlayNodeCount: 0,
        nextCueSegments: 0,
        denseBundleMode: false,
        buildMs: 0,
        avgFrameMs: 0,
        maxFrameMs: 0
    },
    routeTraceDiagnostics: {
        active: false,
        reason: 'not-built',
        phase: 'overview',
        indexCount: 0,
        edgeCount: 0,
        segmentCount: 0,
        anchorIndex: null,
        mapPointCount: 0,
        mapPathActive: false
    },
    scenePerformanceDiagnostics: {
        active: false,
        reason: 'not-sampled',
        lastFrameAt: 0,
        sampleCount: 0,
        avgFrameMs: 0,
        maxFrameMs: 0,
        avgUpdateMs: 0,
        maxUpdateMs: 0,
        avgRenderMs: 0,
        maxRenderMs: 0,
        avgControlsMs: 0,
        avgNodeMotionMs: 0,
        avgThreadUpdateMs: 0,
        avgGlowMs: 0,
        avgLensMs: 0,
        avgOverlayUpdateMs: 0,
        maxOverlayUpdateMs: 0,
        myceliumCoreSegments: 0,
        myceliumWispySegments: 0,
        myceliumBridgeSegments: 0,
        lastThreadUpdateMs: 0,
        lastThreadUpdateDirtyNodes: 0,
        lastThreadUpdateDirtyPairs: 0
    },
    inspectedStrandDiagnostics: {
        active: false,
        source: 'none',
        index: null,
        focusedIndex: null,
        segmentCount: 0,
        braidCount: 0,
        endpointCount: 0
    },
    arrivalHandoffDiagnostics: {
        active: false,
        fromIndex: null,
        targetIndex: null,
        phase: 'idle',
        segmentCount: 0,
        endpointCount: 0,
        opacity: 0
    },
    strandContinuityState: {
        phase: 'idle',
        targetIndex: null,
        fromIndex: null,
        reason: '',
        startedAt: 0,
        arrivalTimeoutId: undefined,
        settleTimeoutId: undefined
    },
    focusOrbitSlackState: {
        phase: 'idle',
        reason: '',
        startedAt: 0,
        targetShift: 0,
        cameraShift: 0,
        distanceBefore: 0,
        distanceAfter: 0,
        maxDistance: 5.5,
        rotateSpeed: 0.6,
        panSpeed: 0.5
    },
    terrainHandoffState: {
        phase: 'idle',
        from: 'overview',
        to: 'galaxy',
        routeCount: 0,
        startedAt: 0
    },
    routeExplorationState: {
        phase: 'idle',
        reason: '',
        startedAt: 0
    },
    routeChoreographyState: {
        phase: 'overview',
        reason: 'initial',
        startedAt: 0,
        anchorIndex: null,
        indexCount: 0,
        lastCameraMove: null
    },
    semanticGuideState: {
        isVisible: false,
        isSynthesizing: false,
        config: null,
        typeToken: 0,
        buttonMode: 'ready'
    },
    activeFilters: {
        status: 'all',
        city: 'all',
        website: false,
        email: false,
        geocoded: false
    },
    // W11-T4 partition sub-records — Proxy below passes them through.
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
    withMutation(fn: () => void) {
        return fn()
    }
}))

vi.mock('@lib/state/app.svelte.ts', () => ({
    appState: new Proxy({} as any, {
        get(_target, prop) {
            return (_appState as any)[prop]
        },
        set(_target, prop, value) {
            ;(_appState as any)[prop] = value
            return true
        }
    })
}))

// Now import the validation module directly (it doesn't depend on appState)
import {
    validateStateProperty,
    STATE_VALIDATORS,
    VALID_VIEWS,
    VALID_NAV_MODES,
    VALID_PANEL_SURFACES,
    VALID_SEARCH_STATUS,
    VALID_LOADING_PHASES,
    VALID_MYCELIUM_MODES
} from '@lib/state/state-validation'

describe('state validation — allowed value sets', () => {
    it('VALID_VIEWS contains the canonical views', () => {
        expect(VALID_VIEWS.has('galaxy')).toBe(true)
        expect(VALID_VIEWS.has('map')).toBe(true)
        expect(VALID_VIEWS.has('bogus')).toBe(false)
    })

    it('VALID_NAV_MODES contains all navigation modes', () => {
        expect(VALID_NAV_MODES.has('overview')).toBe(true)
        expect(VALID_NAV_MODES.has('search')).toBe(true)
        expect(VALID_NAV_MODES.has('focus')).toBe(true)
        expect(VALID_NAV_MODES.has('inside')).toBe(true)
        expect(VALID_NAV_MODES.has('map')).toBe(true)
        expect(VALID_NAV_MODES.has('trail')).toBe(true)
        expect(VALID_NAV_MODES.has('bridge')).toBe(true)
    })

    it('VALID_PANEL_SURFACES contains all panel surfaces', () => {
        expect(VALID_PANEL_SURFACES.has('idle')).toBe(true)
        expect(VALID_PANEL_SURFACES.has('search')).toBe(true)
        expect(VALID_PANEL_SURFACES.has('focus')).toBe(true)
        expect(VALID_PANEL_SURFACES.has('inside')).toBe(true)
        expect(VALID_PANEL_SURFACES.has('map')).toBe(true)
    })

    it('VALID_SEARCH_STATUS contains all search statuses', () => {
        expect(VALID_SEARCH_STATUS.has('idle')).toBe(true)
        expect(VALID_SEARCH_STATUS.has('searching')).toBe(true)
        expect(VALID_SEARCH_STATUS.has('results')).toBe(true)
        expect(VALID_SEARCH_STATUS.has('error')).toBe(true)
    })

    it('VALID_LOADING_PHASES contains all loading phases', () => {
        expect(VALID_LOADING_PHASES.has('records')).toBe(true)
        expect(VALID_LOADING_PHASES.has('scene')).toBe(true)
    })

    it('VALID_MYCELIUM_MODES contains all mycelium modes', () => {
        expect(VALID_MYCELIUM_MODES.has('default')).toBe(true)
        expect(VALID_MYCELIUM_MODES.has('dormant')).toBe(true)
        expect(VALID_MYCELIUM_MODES.has('focused')).toBe(true)
    })
})

describe('state validation — validateStateProperty', () => {
    it('allows valid currentView values', () => {
        expect(validateStateProperty('currentView', 'galaxy')).toBeNull()
        expect(validateStateProperty('currentView', 'map')).toBeNull()
    })

    it('rejects invalid currentView values', () => {
        const error = validateStateProperty('currentView', 'bogus')
        expect(error).toContain('currentView')
        expect(error).toContain('bogus')
    })

    it('rejects non-string currentView values', () => {
        expect(validateStateProperty('currentView', 123)).toContain('must be a string')
        expect(validateStateProperty('currentView', null)).toContain('must be a string')
    })

    it('allows valid navState.mode values', () => {
        expect(validateStateProperty('navState.mode', 'overview')).toBeNull()
        expect(validateStateProperty('navState.mode', 'search')).toBeNull()
        expect(validateStateProperty('navState.mode', 'focus')).toBeNull()
    })

    it('rejects invalid navState.mode values', () => {
        const error = validateStateProperty('navState.mode', 'bogus')
        expect(error).toContain('navState.mode')
    })

    it('allows valid navState.surface values', () => {
        expect(validateStateProperty('navState.surface', 'idle')).toBeNull()
        expect(validateStateProperty('navState.surface', 'search')).toBeNull()
        expect(validateStateProperty('navState.surface', 'focus')).toBeNull()
    })

    it('rejects invalid navState.surface values', () => {
        const error = validateStateProperty('navState.surface', 'bogus')
        expect(error).toContain('navState.surface')
    })

    it('allows valid loadingPhaseKey values', () => {
        expect(validateStateProperty('loadingPhaseKey', 'records')).toBeNull()
        expect(validateStateProperty('loadingPhaseKey', 'scene')).toBeNull()
    })

    it('rejects invalid loadingPhaseKey values', () => {
        const error = validateStateProperty('loadingPhaseKey', 'bogus')
        expect(error).toContain('loadingPhaseKey')
    })

    it('allows valid semanticLaneState values', () => {
        expect(validateStateProperty('semanticLaneState', 'checking')).toBeNull()
        expect(validateStateProperty('semanticLaneState', 'healthy')).toBeNull()
        expect(validateStateProperty('semanticLaneState', 'stuck')).toBeNull()
        expect(validateStateProperty('semanticLaneState', 'reconnecting')).toBeNull()
        expect(validateStateProperty('semanticLaneState', 'unavailable')).toBeNull()
        expect(validateStateProperty('semanticLaneState', 'degraded')).toBeNull()
        expect(validateStateProperty('semanticLaneState', 'offline')).toBeNull()
    })

    it('rejects invalid semanticLaneState values', () => {
        const error = validateStateProperty('semanticLaneState', 'bogus')
        expect(error).toContain('semanticLaneState')
        expect(error).toContain('bogus')
    })

    it('allows runtime-only semanticLaneState values that semantic-lane.ts writes', () => {
        expect(validateStateProperty('semanticLaneState', 'stuck')).toBeNull()
        expect(validateStateProperty('semanticLaneState', 'reconnecting')).toBeNull()
        expect(validateStateProperty('semanticLaneState', 'unavailable')).toBeNull()
    })

    // searchStatus, focusTransitionMode, searchVisibleCount, viewportWidth/Height
    // moved into searchState / focusState / viewportState sub-aggregates after
    // W50 cleanup. Top-level STATE_VALIDATORS entries were removed; nested-path
    // validation is now handled by `validateAppStateEnumFields` (startup enum
    // safety net) and initial-value factories. `validateStateProperty` for
    // those legacy flat paths returns null (write passes through).
    it('legacy flat paths return null (no validator entry exists post-W50)', () => {
        expect(validateStateProperty('searchStatus', 'bogus')).toBeNull()
        expect(validateStateProperty('focusTransitionMode', 'bogus')).toBeNull()
        expect(validateStateProperty('searchVisibleCount', -1)).toBeNull()
        expect(validateStateProperty('viewportWidth', -100)).toBeNull()
        expect(STATE_VALIDATORS['searchStatus']).toBeUndefined()
        expect(STATE_VALIDATORS['focusTransitionMode']).toBeUndefined()
        expect(STATE_VALIDATORS['viewportWidth']).toBeUndefined()
    })

    it('allows valid myceliumMode values', () => {
        expect(validateStateProperty('myceliumMode', 'default')).toBeNull()
        expect(validateStateProperty('myceliumMode', 'dormant')).toBeNull()
    })

    it('rejects invalid myceliumMode values', () => {
        const error = validateStateProperty('myceliumMode', 'bogus')
        expect(error).toContain('myceliumMode')
    })

    it('allows valid trailDepth values', () => {
        expect(validateStateProperty('trailDepth', 0)).toBeNull()
        expect(validateStateProperty('trailDepth', 1)).toBeNull()
        expect(validateStateProperty('trailDepth', 2)).toBeNull()
    })

    it('rejects invalid trailDepth values', () => {
        expect(validateStateProperty('trailDepth', -1)).toContain('>= 0')
        expect(validateStateProperty('trailDepth', 1.5)).toContain('integer')
    })

    it('allows valid boolean properties', () => {
        expect(validateStateProperty('weatherInitialized', true)).toBeNull()
        expect(validateStateProperty('weatherInitialized', false)).toBeNull()
        expect(validateStateProperty('autoRotate', true)).toBeNull()
    })

    it('rejects non-boolean boolean properties', () => {
        expect(validateStateProperty('weatherInitialized', 'yes')).toContain('boolean')
        expect(validateStateProperty('autoRotate', 1)).toContain('boolean')
    })

    it('allows valid nullable number properties', () => {
        expect(validateStateProperty('focusedNode', null)).toBeNull()
        expect(validateStateProperty('focusedNode', 42)).toBeNull()
    })

    it('rejects invalid nullable number properties', () => {
        expect(validateStateProperty('focusedNode', '42')).toContain('number | null')
    })

    // composition property tests removed (W48-F): appState.composition deleted
    // and the composition.* oneOf validators were removed from state-validation.ts.

    it('allows passthrough for unguarded properties', () => {
        expect(validateStateProperty('points', [])).toBeNull()
        expect(validateStateProperty('scene', null)).toBeNull()
        expect(validateStateProperty('camera', {})).toBeNull()
    })

    it('allows valid demoPhase values', () => {
        expect(validateStateProperty('demoPhase', 'IDLE')).toBeNull()
        expect(validateStateProperty('demoPhase', 'COMPLETE')).toBeNull()
    })

    it('rejects invalid demoPhase values', () => {
        expect(validateStateProperty('demoPhase', 'bogus')).toContain('demoPhase')
    })
})
