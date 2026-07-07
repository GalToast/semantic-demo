/**
 * @lib/state/state-validation.ts — Runtime validation for appState mutations.
 *
 * Ticket W46-D4 Phase 4: State safeguards. Every guarded property gets a
 * validator that runs on every write (via the appState proxy). Invalid
 * values throw in dev mode and are rejected with a warning in production.
 *
 * Guards are NOT a replacement for TypeScript — they catch runtime values
 * that sneak through from untyped callers, test fixtures, URL params, and
 * legacy bridges.
 */

// ── Valid value sets (mirrored from @lib/types/state) ───────────────────────

export const VALID_VIEWS = new Set<string>(['galaxy', 'map', 'focus', 'trail', 'semantic'])

export const VALID_NAV_MODES = new Set<string>(['overview', 'search', 'trail', 'focus', 'inside', 'map', 'bridge'])

export const VALID_PANEL_SURFACES = new Set<string>([
    'idle',
    'search',
    'trail',
    'focus',
    'focus-search',
    'map',
    'map-trail',
    'map-focus',
    'map-focus-search',
    'inside',
    'thread-inspect',
    'walking',
    'arriving',
    'settling'
])

export const VALID_SEARCH_STATUS = new Set<string>(['idle', 'searching', 'focusing', 'results', 'empty', 'error'])

export const VALID_LOADING_PHASES = new Set<string>(['records', 'scene', 'restore', 'launch'])

export const VALID_SEMANTIC_LANE_STATES = new Set<string>(['checking', 'healthy', 'degraded', 'offline'])

export const VALID_FOCUS_TRANSITION_MODES = new Set<string>(['idle', 'entering', 'settling', 'inside', 'exiting'])

export const VALID_MYCELIUM_MODES = new Set<string>([
    'default',
    'dormant',
    'focused',
    'trail',
    'inside',
    'semantic-dive',
    'bridge'
])

export const VALID_TERRAIN_HANDOFF_PHASES = new Set<string>(['idle', 'prelude', 'transition', 'settle'])

export const VALID_ROUTE_EXPLORATION_PHASES = new Set<string>(['idle', 'searching', 'focusing'])

export const VALID_ROUTE_CHOREOGRAPHY_PHASES = new Set<string>([
    'overview',
    'search',
    'focus',
    'inside',
    'map',
    'trail'
])

export const VALID_STRAND_CONTINUITY_PHASES = new Set<string>([
    'idle',
    'preview',
    'pinned',
    'exploring',
    'arrived',
    'returning'
])

export const VALID_FOCUS_ORBIT_SLACK_PHASES = new Set<string>(['idle', 'active', 'settling'])

export const VALID_ARRIVAL_HANDOFF_PHASES = new Set<string>(['idle', 'prelude', 'flying', 'arriving', 'settling'])

export const VALID_COMPOSITION_PANEL_SURFACES = new Set<string>([
    'idle',
    'peek',
    'open',
    'focus',
    'map',
    'search',
    'trail',
    'inside'
])

export const VALID_COMPOSITION_PANEL_SURFACE_DETAILS = new Set<string>(['peek', 'open', 'full'])

export const VALID_COMPOSITION_TRAIL_STATES = new Set<string>(['inactive', 'active', 'deep', 'exiting'])

export const VALID_COMPOSITION_TRAIL_DEPTHS = new Set<string>(['0', '1', '2'])

export const VALID_COMPOSITION_GRAPH_CONTEXTS = new Set<string>([
    'idle',
    'galaxy',
    'focus',
    'trail',
    'semantic',
    'bridge'
])

export const VALID_COMPOSITION_MAP_CONTEXTS = new Set<string>(['idle', 'map', 'map-trail', 'map-focus'])

export const VALID_COMPOSITION_SEMANTIC_DIVE_STATES = new Set<string>(['inactive', 'active', 'exiting'])

export const VALID_COMPOSITION_SEARCH_GLOW_STATES = new Set<string>(['inactive', 'active', 'fading'])

export const VALID_DEMO_PHASES = new Set<string>([
    'IDLE',
    'OVERVIEW',
    'SEARCH',
    'FOCUS',
    'THREADS',
    'NEIGHBORS',
    'TRAIL',
    'DIVE',
    'FILTER',
    'MAP',
    'RETURN',
    'COMPLETE',
    'CANCELLED'
])

export const VALID_WEATHER_SOURCE_STRINGS = new Set<string>([
    'open-meteo',
    'open-meteo-client',
    'backend',
    'fallback',
    'render-contract'
])

// ── Validator registry ───────────────────────────────────────────────────────

export interface StateValidator {
    (value: unknown): string | null
}

/** Returns a Set membership validator. */
function oneOf(set: Set<string>, label: string): StateValidator {
    return (value: unknown): string | null => {
        if (typeof value !== 'string') return `${label} must be a string, got ${typeof value}`
        if (!set.has(value)) return `${label} must be one of ${[...set].join(', ')}, got "${value}"`
        return null
    }
}

/** Returns a non-negative integer validator. */
function nonNegativeInt(label: string): StateValidator {
    return (value: unknown): string | null => {
        if (typeof value !== 'number') return `${label} must be a number, got ${typeof value}`
        if (!Number.isFinite(value)) return `${label} must be finite, got ${value}`
        if (value < 0) return `${label} must be >= 0, got ${value}`
        if (!Number.isInteger(value)) return `${label} must be an integer, got ${value}`
        return null
    }
}

/** Returns a non-negative number validator (allows floats). */
function nonNegativeNumber(label: string): StateValidator {
    return (value: unknown): string | null => {
        if (typeof value !== 'number') return `${label} must be a number, got ${typeof value}`
        if (!Number.isFinite(value)) return `${label} must be finite, got ${value}`
        if (value < 0) return `${label} must be >= 0, got ${value}`
        return null
    }
}

/** Returns a boolean validator. */
function boolean(label: string): StateValidator {
    return (value: unknown): string | null => {
        if (typeof value !== 'boolean') return `${label} must be boolean, got ${typeof value}`
        return null
    }
}

/** Returns a nullable number validator. */
function nullableNumber(label: string): StateValidator {
    return (value: unknown): string | null => {
        if (value === null) return null
        if (typeof value !== 'number') return `${label} must be number | null, got ${typeof value}`
        if (!Number.isFinite(value)) return `${label} must be finite, got ${value}`
        return null
    }
}

/** Validates that the value is a plain object (for nested state). */
function plainObject(label: string): StateValidator {
    return (value: unknown): string | null => {
        if (value === null || typeof value !== 'object') return `${label} must be an object, got ${typeof value}`
        if (Array.isArray(value)) return `${label} must be a plain object, got array`
        return null
    }
}

/** No validation — always passes. */
export const passthrough: StateValidator = () => null

// ── Guarded property map ─────────────────────────────────────────────────────

/**
 * STATE_VALIDATORS — runtime validation for appState mutations.
 *
 * Top-level entries below validate direct writes via `appState.X = Y`
 * (caught by the Proxy `set` trap). Nested entries like
 * `'navState.mode'` validate writes through the Svelte 5 reactive
 * Proxy at `appState.navState.X` (caught when the outer Proxy receives
 * a `navState` assignment that triggers `Reflect.set` on the inner).
 *
 * Sub-aggregate writes (`appState.searchState.X`, `appState.focusState.X`,
 * `appState.viewportState.X`) are NOT validated by these entries
 * because the outer Proxy's `set` trap only sees the top-level key
 * (`searchState`, not `searchState.searchStatus`). Validation for those
 * paths happens in `validateAppStateEnumFields` at startup.
 *
 * Removed in W50 cleanup (these fields now live in sub-aggregates):
 *   - searchStatus, searchVisibleCount, searchRequestSequence,
 *     searchFocusTransitionToken, semanticGuideRequestSequence,
 *     summaryCardTypeToken  → searchState
 *   - focusTransitionMode, focusTransitionStartedAt, nodesAreSettling,
 *     infoPanelOpen, pocketListVisible, threadInspectorPointerInside,
 *     pocketTransitionStartedAt, inspectedThreadIndex, pinnedThreadIndex
 *     → focusState
 *   - viewportWidth, viewportHeight, viewportDpr, viewportReducedMotion,
 *     viewportIsCompact  → viewportState
 */
export const STATE_VALIDATORS: Readonly<Record<string, StateValidator>> = {
    // Views
    currentView: oneOf(VALID_VIEWS, 'currentView'),
    'navState.currentView': oneOf(VALID_VIEWS, 'navState.currentView'),

    // Navigation mode
    'navState.mode': oneOf(VALID_NAV_MODES, 'navState.mode'),

    // Navigation surface
    'navState.surface': oneOf(VALID_PANEL_SURFACES, 'navState.surface'),
    'navState.previousSurface': oneOf(VALID_PANEL_SURFACES, 'navState.previousSurface'),

    // Loading
    loadingPhaseKey: oneOf(VALID_LOADING_PHASES, 'loadingPhaseKey'),
    'navState.loadingPhaseKey': oneOf(VALID_LOADING_PHASES, 'navState.loadingPhaseKey'),

    // Semantic lane
    semanticLaneState: oneOf(VALID_SEMANTIC_LANE_STATES, 'semanticLaneState'),

    // Focus (transition/trail are dual-located: top-level + navState)
    trailDepth: nonNegativeInt('trailDepth'),
    'navState.trailDepth': nonNegativeInt('navState.trailDepth'),

    // Mycelium
    myceliumMode: oneOf(VALID_MYCELIUM_MODES, 'myceliumMode'),
    'navState.myceliumMode': oneOf(VALID_MYCELIUM_MODES, 'navState.myceliumMode'),

    // Handoff / choreography
    'terrainHandoffState.phase': oneOf(VALID_TERRAIN_HANDOFF_PHASES, 'terrainHandoffState.phase'),
    'routeExplorationState.phase': oneOf(VALID_ROUTE_EXPLORATION_PHASES, 'routeExplorationState.phase'),
    'routeChoreographyState.phase': oneOf(VALID_ROUTE_CHOREOGRAPHY_PHASES, 'routeChoreographyState.phase'),
    'strandContinuityState.phase': oneOf(VALID_STRAND_CONTINUITY_PHASES, 'strandContinuityState.phase'),
    'focusOrbitSlackState.phase': oneOf(VALID_FOCUS_ORBIT_SLACK_PHASES, 'focusOrbitSlackState.phase'),
    'arrivalHandoffDiagnostics.phase': oneOf(VALID_ARRIVAL_HANDOFF_PHASES, 'arrivalHandoffDiagnostics.phase'),

    // Composition
    'composition.activeView': oneOf(VALID_VIEWS, 'composition.activeView'),
    'composition.trailState': oneOf(VALID_COMPOSITION_TRAIL_STATES, 'composition.trailState'),
    'composition.trailDepth': oneOf(VALID_COMPOSITION_TRAIL_DEPTHS, 'composition.trailDepth'),
    'composition.graphContext': oneOf(VALID_COMPOSITION_GRAPH_CONTEXTS, 'composition.graphContext'),
    'composition.mapContext': oneOf(VALID_COMPOSITION_MAP_CONTEXTS, 'composition.mapContext'),
    'composition.semanticDive': oneOf(VALID_COMPOSITION_SEMANTIC_DIVE_STATES, 'composition.semanticDive'),
    'composition.panelSurface': oneOf(VALID_COMPOSITION_PANEL_SURFACES, 'composition.panelSurface'),
    'composition.panelSurfaceDetail': oneOf(VALID_COMPOSITION_PANEL_SURFACE_DETAILS, 'composition.panelSurfaceDetail'),
    'composition.searchGlow': oneOf(VALID_COMPOSITION_SEARCH_GLOW_STATES, 'composition.searchGlow'),
    'composition.isActive': boolean('composition.isActive'),

    // Demo
    demoPhase: oneOf(VALID_DEMO_PHASES, 'demoPhase'),

    // Booleans
    autoRotate: boolean('autoRotate'),
    autoRotateSuspended: boolean('autoRotateSuspended'),
    weatherInitialized: boolean('weatherInitialized'),
    mapInitialized: boolean('mapInitialized'),
    rippleActive: boolean('rippleActive'),
    legendOpen: boolean('legendOpen'),
    sceneRevealActive: boolean('sceneRevealActive'),
    focusCameraAssistActive: boolean('focusCameraAssistActive'),
    eventListenersInitialized: boolean('eventListenersInitialized'),
    deferredHydrationStarted: boolean('deferredHydrationStarted'),
    applyingUrlState: boolean('applyingUrlState'),
    restoringBrowserHistory: boolean('restoringBrowserHistory'),

    // Numbers
    rippleStartTime: nonNegativeNumber('rippleStartTime'),
    bloomPulseStartTime: nonNegativeNumber('bloomPulseStartTime'),
    bridgePulseStartTime: nonNegativeNumber('bridgePulseStartTime'),
    pulsePhase: nonNegativeNumber('pulsePhase'),
    _settlingMaxDelta: nonNegativeNumber('_settlingMaxDelta'),
    pointColorStateVersion: nonNegativeInt('pointColorStateVersion'),
    compactSearchRevealToken: nonNegativeInt('compactSearchRevealToken'),
    mobileRouteFieldPeekToken: nonNegativeInt('mobileRouteFieldPeekToken'),
    semanticTrailStoryRequestSequence: nonNegativeInt('semanticTrailStoryRequestSequence'),
    semanticLaneWarmingCounter: nonNegativeInt('semanticLaneWarmingCounter'),
    filterVersion: nonNegativeInt('filterVersion'),
    filterColorVersion: nonNegativeInt('filterColorVersion'),
    focusCameraAnimationToken: nonNegativeInt('focusCameraAnimationToken'),
    _semanticDiveTransitionDeadline: nonNegativeNumber('_semanticDiveTransitionDeadline'),
    lastRenderedTypeToken: nonNegativeInt('lastRenderedTypeToken'),
    loadingOverlayStartedAt: nonNegativeNumber('loadingOverlayStartedAt'),
    autoRotateResumeDueAt: nonNegativeNumber('autoRotateResumeDueAt'),
    autoRotateSoftResumeStartedAt: nonNegativeNumber('autoRotateSoftResumeStartedAt'),
    sceneRevealStartedAt: nonNegativeNumber('sceneRevealStartedAt'),
    routeCameraAnimationToken: nonNegativeInt('routeCameraAnimationToken'),

    // Nullable numbers
    focusedNode: nullableNumber('focusedNode'),
    'navState.focusedIndex': nullableNumber('navState.focusedIndex'),
    'navState.trailSeedIndex': nullableNumber('navState.trailSeedIndex'),
    'navState.trailCursor': nullableNumber('navState.trailCursor'),
    hoverHighlightIndex: (value: unknown): string | null => {
        if (value === -1) return null
        return nonNegativeInt('hoverHighlightIndex')(value)
    },
    // (inspectedThreadIndex + pinnedThreadIndex moved to focusState)

    // NavState (object-level validation when assigning the whole object)
    navState: plainObject('navState'),

    // Weather
    weather: (value: unknown): string | null => {
        if (value === null) return null
        if (typeof value !== 'object') return 'weather must be null or an object, got ' + typeof value
        return null
    },

    // Arrays
    searchResults: (value: unknown): string | null => {
        if (!Array.isArray(value)) return 'searchResults must be an array, got ' + typeof value
        return null
    },

    // Passthrough for frequently-written but low-risk properties
    points: passthrough,
    map: passthrough,
    scene: passthrough,
    camera: passthrough,
    renderer: passthrough,
    controls: passthrough,
    pointsMesh: passthrough,
    nodeSporeMesh: passthrough,
    rawPositionsBuffer: passthrough,
    rawClustersBuffer: passthrough,
    myceliumGroup: passthrough,
    leadEnrichment: passthrough,
    selectedPoint: passthrough,
    focusTargetVector: passthrough,
    desiredCameraVector: passthrough,
    weatherState: passthrough,
    activeFilters: passthrough,
    semanticGuideState: passthrough,
    composition: passthrough,
    semanticSearchCacheDiagnostics: passthrough,
    focusFrameDiagnostics: passthrough,
    focusThreadDiagnostics: passthrough,
    routeTraceDiagnostics: passthrough,
    scenePerformanceDiagnostics: passthrough,
    inspectedStrandDiagnostics: passthrough,
    arrivalHandoffDiagnostics: passthrough,
    strandContinuityState: passthrough,
    focusOrbitSlackState: passthrough,
    terrainHandoffState: passthrough,
    routeExplorationState: passthrough,
    routeChoreographyState: passthrough,
    searchSummary: passthrough,
    searchError: passthrough,
    currentSearchSummary: passthrough,
    searchTimeout: passthrough,
    searchAbortController: passthrough,
    searchPreviewHoverTimer: passthrough,
    searchVectorScrambleInterval: passthrough,
    searchVectorScrambleTimer: passthrough,
    compactSearchRevealTimers: passthrough,
    semanticLaneMonitorTimer: passthrough,
    semanticLaneProbePromise: passthrough,
    semanticLaneOpsFetchPromise: passthrough,
    semanticLaneOpsRefreshTimer: passthrough,
    semanticGuideAbortController: passthrough,
    semanticTrailStoryAbortController: passthrough,
    clockTimer: passthrough,
    hoverHighlightTimer: passthrough,
    canvasThreadInspectionClearTimer: passthrough,
    autoRotateResumeTimer: passthrough,
    viewHandoffTimer: passthrough,
    viewSwitchPreludeTimer: passthrough,
    terrainHandoffTimer: passthrough,
    focusTransitionSettleTimer: passthrough,
    experienceResetToastTimer: passthrough,
    pointBaseColors: passthrough,
    stableCanvasHover: passthrough,
    lastCanvasNodeHover: passthrough,
    lastCanvasNodePick: passthrough,
    lastCanvasNodeFocusPick: passthrough,
    focusCameraOffset: passthrough,
    focusCameraTargetOffset: passthrough,
    recentArrangements: passthrough,
    signalScores: passthrough,
    bridgeScores: passthrough,
    bloomIndices: passthrough,
    bridgeIndices: passthrough,
    trailIndices: passthrough,
    projectedNeighborGrid: passthrough,
    projectedNeighborCache: passthrough,
    pointIndexByLeadId: passthrough,
    pocketMotionByIndex: passthrough,
    semanticNeighborMapByLeadId: passthrough,
    semanticThreadBundle: passthrough,
    semanticThreadArtifactName: passthrough,
    nodePositions: passthrough,
    targetPositions: passthrough,
    originalPositions: passthrough,
    myceliumLines: passthrough,
    myceliumCoreLines: passthrough,
    myceliumWispyLines: passthrough,
    myceliumBridgeLines: passthrough,
    focusSemanticLines: passthrough,
    focusAnchorGroup: passthrough,
    focusAnchorRingMesh: passthrough,
    focusAnchorHaloSprite: passthrough,
    semanticLensGroup: passthrough,
    semanticLensGlow: passthrough,
    semanticLensSpokes: passthrough,
    hemiLight: passthrough,
    dirLight: passthrough,
    pointsMaterial: passthrough,
    nodeSporeMaterial: passthrough,
    myceliumConnectionPairs: passthrough,
    focusSemanticConnectionPairs: passthrough,
    myceliumDirty: passthrough,
    _showAllClusters: passthrough,
    MODE_DESCRIPTIONS: passthrough,
    STORY_DESCRIPTIONS: passthrough,
    pointMarkers: passthrough,
    COLORS: passthrough,
    CLUSTER_NAMES: passthrough,
    JOURNEY_COMPASS_PHASE_ORDER: passthrough,
    registeredEvents: passthrough,
    activeClusterFilter: passthrough,
    leafletAssetsPromise: passthrough,
    markersLayer: passthrough,
    mapRouteLayer: passthrough,
    lastSuccessfulFetch: passthrough,
    _deferredUrlState: passthrough,
    _deferredUrlStateHandler: passthrough,
    currentEmptyQuery: passthrough,
    semanticTrailCue: passthrough,
    searchGlowRenderStateKey: passthrough,
    semanticLanePendingWarm: passthrough,
    semanticLaneOpsMode: passthrough,
    searchGlowTopIndex: passthrough,
    searchGlowIndices: passthrough,
    searchGlowActive: passthrough,
    searchAnchorIndex: passthrough,
    searchPreviewIndex: passthrough,
    semanticResultContextByLeadId: passthrough,
    semanticSearchResultCache: passthrough,
    searchUseRerank: passthrough,
    isCompactViewport: passthrough,
    isSearching: passthrough,
    searchQuery: passthrough,
    _settlingWatchdogStartedAt: passthrough,
    _settlingLowFrames: passthrough
}

// ── Deep-path validator (for nested properties like navState.mode) ───────────

/** Validates a nested property path. Returns the error message or null. */
export function validateStateProperty(path: string, value: unknown): string | null {
    const validator = STATE_VALIDATORS[path]
    if (validator) return validator(value)

    // For top-level properties without explicit validators, allow passthrough
    // unless the value is obviously wrong (null for non-nullable, wrong type).
    return null
}

/** Dev-mode flag — when true, invalid state throws instead of warning. */
export const STATE_VALIDATION_STRICT = import.meta.env?.DEV === true

// ── Phase 6a — runtime safety net for partition refactors ────────────────────

/**
 * Throws if `value` isn't in `validSet`. Used at write-path boundaries
 * (sub-aggregate setters, factory mirrorToAppState hooks, mutation
 * entrypoints) to catch invalid enum values before they propagate.
 *
 * Unlike `oneOf()` (which returns an error string for STATE_VALIDATORS
 * consumers), `assertValidEnum` throws synchronously — call it when you
 * want a hard failure rather than a deferred warning.
 */
export function assertValidEnum<T extends string>(name: string, value: T, validSet: ReadonlySet<string>): void {
    if (typeof value !== 'string' || !validSet.has(value)) {
        const validList = [...validSet].sort().join(', ')
        throw new Error(`Invalid ${name}: ${JSON.stringify(value)} (valid: ${validList})`)
    }
}

/**
 * Validates ALL enum-typed fields on the provided appState-shaped object.
 * Returns counts + collected error messages (one per field, so a single
 * invalid field doesn't mask others). Called once at appState init in
 * app.svelte.ts and again opportunistically by tests.
 *
 * The validator takes `state` as an argument rather than importing
 * appState directly — state-validation is a leaf module (appState
 * imports from it), so the reverse import would be circular.
 *
 * For dev/strict mode, callers wrap in try/catch and surface via
 * console.warn. Production callers may choose to ignore the result.
 */
export function validateAppStateEnumFields(state: {
    currentView: string
    navState: {
        mode: string
        surface: string
        currentView: string
        myceliumMode: string
    }
    searchState: {
        searchStatus: string
    }
    loadingPhaseKey: string
    semanticLaneState: string
}): { checked: number; errors: string[] } {
    const errors: string[] = []
    let checked = 0
    const checks: Array<readonly [string, () => unknown, ReadonlySet<string>]> = [
        ['appState.currentView', () => state.currentView, VALID_VIEWS],
        ['appState.navState.mode', () => state.navState.mode, VALID_NAV_MODES],
        ['appState.navState.surface', () => state.navState.surface, VALID_PANEL_SURFACES],
        ['appState.navState.currentView', () => state.navState.currentView, VALID_VIEWS],
        ['appState.navState.myceliumMode', () => state.navState.myceliumMode, VALID_MYCELIUM_MODES],
        ['appState.searchState.searchStatus', () => state.searchState.searchStatus, VALID_SEARCH_STATUS],
        ['appState.loadingPhaseKey', () => state.loadingPhaseKey, VALID_LOADING_PHASES],
        ['appState.semanticLaneState', () => state.semanticLaneState, VALID_SEMANTIC_LANE_STATES]
    ]
    for (const [name, getter, validSet] of checks) {
        try {
            const value = getter()
            if (typeof value === 'string') {
                assertValidEnum(name, value, validSet)
            }
            checked++
        } catch (err) {
            errors.push((err as Error).message)
        }
    }
    return { checked, errors }
}
