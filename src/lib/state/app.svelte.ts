// app.svelte.ts — Svelte 5 rune-class parallel artifact for the state kernel.
// Ticket W11-T1: strangler-fig foundation. The class mirrors all 289 fields
// of js/state.ts's _rawState as $state properties. The legacy file stays untouched.

import type {
    ViewName,
    Point,
    NodePosition,
    RouteExplorationState,
    FocusConnectionSegment,
    RouteChoreographyState,
    TerrainHandoffState,
    StrandContinuityState,
    FocusOrbitSlackState,
    ArrivalHandoffDiagnostics,
    RouteTraceDiagnostics,
    ScenePerformanceDiagnostics,
    FocusFrameDiagnostics,
    FocusThreadDiagnostics,
    CanvasHoverCandidate,
    LoadingPhaseKey,
    Vector3Like,
    SearchResult,
    LaneHealthPayload,
    SemanticGuideState
    // SemanticNode — unused import; removed to satisfy lint
} from './state-types'
import type { NavState, ActiveFilters } from '@lib/types/state'
import type { SearchAppState } from './state-types'
import type { FocusAppState } from './state-types'
import type { ViewportAppState } from './state-types'
import type { SemanticNeighborEntry, SemanticThreadBundle } from '@lib/types/business'
import type { WeatherData } from '@lib/utils/weather'
import type { SpatialGrid } from '@lib/journey/thread-model'
import { CLUSTER_COLORS } from '@lib/utils/design-tokens'

/**
 * Structural type for Leaflet map layer objects (L.Map, L.LayerGroup).
 * Leaflet is loaded via CDN (not npm-imported), so we can't reference
 * its types directly. This type documents the shape consumers expect
 * and matches the local cast in engine/map-state.ts.
 */
type LeafletLayer = Record<string, unknown> | null
import type {
    Scene,
    PerspectiveCamera,
    Points,
    PointsMaterial,
    InstancedMesh,
    Material,
    LineSegments,
    Group,
    Mesh,
    Object3D,
    PointLight,
    Sprite,
    HemisphereLight,
    DirectionalLight,
    WebGLRenderer
} from 'three'
import type { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import type { Line2 } from 'three/examples/jsm/lines/Line2.js'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { validateStateProperty, STATE_VALIDATION_STRICT, validateAppStateEnumFields } from './state-validation'
import { DisposableRegistry } from '@lib/utils/disposable-registry'
import { publish, EVENTS } from '@lib/orchestration/event-bus'

// ── App State class ─────────────────────────────────────────────────────────

export class AppState {
    // ==== SEARCH SUB-AGGREGATE (Phase 6b) ====
    // All 20 persistent search-domain fields grouped here. The factory
    // migration's `computeFromAppState` reads from appState, so the
    // search mirror continues to work — it just reads from appState.searchState.
    searchState = $state<SearchAppState>({
        searchRequestSequence: 0,
        searchAnchorIndex: null,
        searchPreviewIndex: null,
        searchGlowIndices: new Set<number>(),
        searchGlowTopIndex: null,
        searchGlowActive: false,
        searchFocusTransitionToken: 0,
        searchStatus: 'idle',
        currentEmptyQuery: null,
        isCompactViewport: false,
        semanticGuideRequestSequence: 0,
        currentSemanticGuide: null,
        summaryCardTypeToken: 0,
        currentSearchSummary: null,
        semanticTrailCue: 'idle',
        searchError: null,
        searchVisibleCount: 5
    })

    // ==== FOCUS SUB-AGGREGATE (Phase 6c) ====
    // The 13 persistent focus-domain fields that the focus mirror reads.
    // Three.js mesh references, ripples, settling watchdogs stay flat
    // (transient engine state, not domain state).
    focusState = $state<FocusAppState>({
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
    })

    // ==== VIEWPORT SUB-AGGREGATE (Phase 6d) ====
    // The 5 viewport-domain fields. The viewport mirror's factory
    // bindings can only target flat appState keys, so this sub-aggregate
    // is read by viewport.svelte.ts's computeFromAppState.
    viewportState = $state<ViewportAppState>({
        viewportWidth: 1920,
        viewportHeight: 1080,
        viewportDpr: 1,
        viewportReducedMotion: false,
        viewportIsCompact: false
    })
    semanticGuideState = $state<SemanticGuideState>({
        isVisible: false,
        isSynthesizing: false,
        config: {},
        storyText: '',
        storySource: '',
        showStory: false
    })
    searchTimeout = $state<ReturnType<typeof setTimeout> | null>(null)
    searchGlowRenderStateKey = $state<string>('')
    searchPreviewHoverTimer = $state<ReturnType<typeof setTimeout> | null>(null)
    compactSearchRevealToken = $state<number>(0)
    compactSearchRevealTimers = $state<Array<ReturnType<typeof setTimeout>>>([])
    // Migrated from legacy stores (searchResultsStore, searchSummaryStore, isSearchingStore, searchErrorStore, searchVisibleCountStore)
    searchResults = $state<SearchResult[]>([])
    searchSummary = $state<Record<string, unknown> | null>(null)
    searchTrailCueLastRenderedAt = $state<number>(0)
    semanticLaneMonitorTimer = $state<ReturnType<typeof setTimeout> | null>(null)
    semanticLaneProbePromise = $state<Promise<unknown> | null>(null)
    semanticLaneOpsMode = $state<boolean>(false)
    semanticLaneOpsFetchPromise = $state<Promise<unknown> | null>(null)
    semanticLaneOpsRefreshTimer = $state<ReturnType<typeof setTimeout> | null>(null)
    semanticLanePendingWarm = $state<boolean>(false)
    semanticLaneState = $state<string>('checking')
    semanticLaneSnapshot = $state<LaneHealthPayload | null>(null)
    semanticResultContextByLeadId = $state<Map<string, unknown>>(new Map())
    semanticGuideAbortController = $state<AbortController | null>(null)
    semanticLaneWarmingCounter = $state<number>(0)

    // ==== POSITION / GEOMETRY STATE ====
    points = $state<Point[]>([])
    map = $state<LeafletLayer>(null)
    markersLayer = $state<LeafletLayer>(null)
    mapRouteLayer = $state<LeafletLayer>(null)
    mapInitialized = $state<boolean>(false)
    leafletAssetsPromise = $state<Promise<unknown> | null>(null)
    scene = $state<Scene | null>(null)
    camera = $state<PerspectiveCamera | null>(null)
    renderer = $state<WebGLRenderer | null>(null)
    controls = $state<OrbitControls | null>(null)
    pointsMesh = $state<Points | null>(null)
    pointsMaterial = $state<PointsMaterial | null>(null)
    nodeSporeMesh = $state<InstancedMesh | null>(null)
    nodeSporeMaterial = $state<Material | null>(null)
    rawPositionsBuffer = $state<Float32Array | null>(null)
    rawClustersBuffer = $state<Uint16Array | null>(null)
    overviewBounds = $state<Record<string, unknown> | null>(null)
    leadEnrichment = $state<Record<string, unknown> | null>(null)
    myceliumGroup = $state<Group | null>(null)
    searchCorridorGroup = $state<Group | null>(null)
    myceliumCoreLines = $state<LineSegments2 | null>(null)
    myceliumWispyLines = $state<LineSegments2 | null>(null)
    myceliumBridgeLines = $state<LineSegments2 | null>(null)
    focusSemanticLines = $state<Line2 | null>(null)
    focusPocketSizeMesh = $state<Points | null>(null)
    focusAnchorGroup = $state<Group | null>(null)
    focusAnchorRingMesh = $state<Mesh | null>(null)
    focusAnchorHaloSprite = $state<Sprite | null>(null)
    focusLens = $state<Mesh | null>(null)
    focusHalo = $state<Mesh | null>(null)
    focusCore = $state<Mesh | null>(null)
    focusMoteGroup = $state<Group | null>(null)
    focusMotes = $state<Mesh[]>([])
    focusPetalGroup = $state<Group | null>(null)
    focusPetals = $state<Mesh[]>([])
    focusFilaments = $state<LineSegments | null>(null)
    hoverHalo = $state<Mesh | null>(null)
    anchorBloomLight = $state<PointLight | null>(null)
    semanticManifold = $state<Object3D | null>(null)
    focusSemanticConnectionPairs = $state<Array<FocusConnectionSegment>>([])
    semanticLensGroup = $state<Group | null>(null)
    semanticLensGlow = $state<Mesh | null>(null)
    semanticLensSpokes = $state<LineSegments | null>(null)
    myceliumConnectionPairs = $state<Array<{ a: number; b: number; layer: number }>>([])
    myceliumDirty = $state<boolean>(true)
    hemiLight = $state<HemisphereLight | null>(null)
    dirLight = $state<DirectionalLight | null>(null)
    nodePositions = $state<NodePosition[]>([])
    targetPositions = $state<NodePosition[]>([])
    originalPositions = $state<NodePosition[]>([])
    // Single source of truth: autoRotate / autoRotateSuspended are direct
    // aliases over navState (canonical), mirroring the focusedNode / trailDepth /
    // currentView aliases below. They were previously parallel $state mirrors that
    // could drift from navState.autoRotate — which writeNavStateMirror() writes —
    // while focus-pocket / camera.svelte wrote the flat field. Now every writer
    // converges on navState.
    get autoRotate(): boolean {
        return this.navState.autoRotate
    }

    set autoRotate(value: boolean) {
        this.navState.autoRotate = value
    }

    get autoRotateSuspended(): boolean {
        return this.navState.autoRotateSuspended
    }

    set autoRotateSuspended(value: boolean) {
        this.navState.autoRotateSuspended = value
    }
    weather = $state<WeatherData | null>(null)
    weatherInitialized = $state<boolean>(false)
    rippleActive = $state<boolean>(false)
    rippleStartTime = $state<number>(0)
    pointColorStateVersion = $state<number>(0)
    pulsePhase = $state<number>(0)
    pointBaseColors = $state<Float32Array | number[] | null>(null)
    hoverHighlightIndex = $state<number>(-1)
    stableCanvasHover = $state<CanvasHoverCandidate | null>(null)
    lastCanvasNodeHover = $state<CanvasHoverCandidate | null>(null)
    lastCanvasNodePick = $state<CanvasHoverCandidate | null>(null)
    lastCanvasNodeFocusPick = $state<CanvasHoverCandidate | null>(null)
    loadingOverlayStartedAt = $state<number>(0)
    loadingPhaseKey = $state<LoadingPhaseKey>('records')
    eventListenersInitialized = $state<boolean>(false)

    // ==== NAV STATE (nested substate) ====
    navState = $state<NavState>({
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
        threadReasonByIndex: new Map<number, string>(),
        threadSource: 'geometric-fallback',
        focusPocketIndices: [],
        focusPocketMeta: null,
        focusPocketRoleByIndex: new Map<number, string>(),
        focusFramingMeta: null,
        currentPersonality: null,
        neighborhoodIndices: [],
        currentView: 'galaxy',
        myceliumMode: 'dormant',
        autoRotate: false,
        autoRotateSuspended: false,
        trailDepthFromExploration: 0,
        sceneRevealActive: false,
        sceneRevealStartedAt: 0,
        loadingPhaseKey: 'records',
        // navState is the canonical source for URL-state fields; the flat
        // appState $state duplicates (urlStateRestoreToken / applyingUrlState /
        // restoringBrowserHistory) were removed as orphans with zero consumers.
        applyingUrlState: false,
        restoringBrowserHistory: false,
        urlStateRestoreToken: 0,
        activeStoryPrompt: null
    })

    // ==== ACTIVE FILTERS (nested substate) ====
    activeFilters = $state<ActiveFilters>({
        status: 'all',
        city: 'all',
        website: false,
        email: false,
        geocoded: false
    })

    // ==== PERFORMANCE DIAGNOSTICS ====
    scenePerformanceDiagnostics = $state<ScenePerformanceDiagnostics>({
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
    })
    focusFrameDiagnostics = $state<FocusFrameDiagnostics>({
        lastFrameAt: 0,
        sampleCount: 0,
        avgFrameMs: 0,
        maxFrameMs: 0,
        lastOverlayMs: 0,
        lastOverlayEdgeCount: 0,
        lastOverlayPairs: 0
    })
    focusThreadDiagnostics = $state<FocusThreadDiagnostics>({
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
    })
    routeTraceDiagnostics = $state<RouteTraceDiagnostics>({
        active: false,
        reason: 'not-built',
        phase: 'overview',
        indexCount: 0,
        edgeCount: 0,
        segmentCount: 0,
        anchorIndex: null,
        mapPointCount: 0,
        mapPathActive: false
    })
    routeTraceLines = $state<import('three').LineSegments | null>(null)
    routeTraceConnectionPairs = $state<Array<{ a: number; b: number; side: number }>>([])
    arrivalHandoffGroup = $state<import('three').Group | null>(null)
    semanticThreadsStatus = $state<string>('idle')
    semanticThreadsLoadPromise = $state<Promise<unknown> | null>(null)
    semanticThreadsRetryTimer = $state<ReturnType<typeof setTimeout> | null>(null)
    semanticThreadsRetryAttempt = $state<number>(0)

    // ==== CONFIGURATION CONSTANTS ====
    readonly MAP_HANDOFF_PRELUDE_MS = 430
    readonly VIEW_HANDOFF_OUT_MS = 1200
    readonly TERRAIN_LANDING_SETTLE_MS = 1200
    readonly TERRAIN_LANDING_SETTLE_LONG_MS = 1800
    readonly SHOW_VIEW_HANDOFF_DISMISS_MS = 2200
    readonly MAP_TRAIL_REFRESH_LATE_DELAY_MS = 100
    readonly AUTO_ROTATE_IDLE_MS = 3600
    readonly AUTO_ROTATE_MANUAL_IDLE_MS = 5200
    readonly AUTO_ROTATE_SOFT_RESUME_MS = 1800
    readonly AUTO_ROTATE_BASE_SPEED = 0.34
    readonly MOBILE_ROUTE_FIELD_PEEK_MS = 1550
    readonly SELECTED_CARD_FADE_MS = 180
    readonly ORBIT_MIN_DISTANCE_DEFAULT = 0.5
    readonly ORBIT_MIN_DISTANCE_INSIDE = 0.24
    readonly ORBIT_MAX_DISTANCE_DEFAULT = 5.5
    readonly ORBIT_MAX_DISTANCE_FREE = 6.8
    readonly ORBIT_ROTATE_SPEED_DEFAULT = 0.6
    readonly ORBIT_ROTATE_SPEED_FREE = 0.82
    readonly ORBIT_PAN_SPEED_DEFAULT = 0.5
    readonly ORBIT_PAN_SPEED_FREE = 0.68
    readonly SEARCH_TRAIL_CUE_MIN_DWELL_MS = 920
    JOURNEY_COMPASS_PHASE_ORDER = $state<string[]>(['overview', 'search', 'focus', 'trail', 'inside', 'map'])
    readonly SCENE_REVEAL_DURATION_MS = 1650
    readonly LOADING_MIN_VISIBLE_MS = 1320
    readonly POINTS_MATERIAL_BASE_SIZE = 0.03
    readonly POINTS_MATERIAL_BASE_OPACITY = 1.0
    readonly FOCUS_THREAD_SEGMENTS = 16
    readonly HOVER_LOCK_CONFIRM_MS = 80
    readonly HOVER_SAMPLE_MS = 24
    // ==== COLORS / CLUSTER NAMES ====
    COLORS = $state(CLUSTER_COLORS)

    // ==== FILTER / MODE STATE ====
    filterVersion = $state<number>(0)
    filterColorVersion = $state<number>(0)
    filterColorStateKey = $state<string>('')
    registeredEvents = $state<Set<string>>(new Set())
    activeClusterFilter = $state<number | null>(null)
    _showAllClusters = $state<boolean>(true)
    myceliumMode = $state<string>('default')
    MODE_DESCRIPTIONS = $state<Record<string, string>>({})
    STORY_DESCRIPTIONS = $state<Record<string, string>>({})
    pointMarkers = $state<unknown[]>([])

    // ==== FOCUS / THREAD STATE ====
    canvasThreadInspectionClearTimer = $state<ReturnType<typeof setTimeout> | null>(null)
    suppressCanvasFocusUntil = $state<number>(0)
    dataLoadAttempt = $state<number>(0)
    semanticSpaceLayoutManifest = $state<unknown>(null)
    semanticSpaceLayoutStatus = $state<string>('')
    semanticSpaceLayoutError = $state<string | null>(null)
    // ==== INSPECTOR / TEXTURE STATE ====
    inspectedStrandGroup = $state<Group | null>(null)
    // focusRingTexture / focusNextCueTexture / focusBeaconTexture runes were
    // retired in PR-Item1. The textures live on `webglContext` and are
    // populated by node-manager.ts:428-430; the prior appState fields had
    // zero writers, so the getters always returned null. See
    // tmp/texture-routing-audit-2026-06-29.md Section 1.

    arrivalHandoffDiagnostics = $state<ArrivalHandoffDiagnostics>({
        active: false,
        fromIndex: null,
        targetIndex: null,
        phase: 'idle',
        segmentCount: 0,
        endpointCount: 0,
        opacity: 0
    })
    strandContinuityState = $state<StrandContinuityState>({
        phase: 'idle',
        targetIndex: null,
        fromIndex: null,
        reason: '',
        startedAt: 0,
        arrivalTimeoutId: undefined,
        settleTimeoutId: undefined
    })
    focusOrbitSlackState = $state<FocusOrbitSlackState>({
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
    })
    focusTransitionSettleTimer = $state<ReturnType<typeof setTimeout> | null>(null)
    focusCameraAnimationToken = $state<number>(0)
    focusCameraAssistActive = $state<boolean>(false)
    focusCameraAssistUntil = $state<number>(0)
    focusCameraAssistReason = $state<string>('idle')
    focusCameraOffset = $state<Vector3Like | null>(null)
    focusCameraTargetOffset = $state<Vector3Like | null>(null)
    recentArrangements = $state<unknown[]>([])
    // signalScores / bloomIndices / bridgeIndices / bridgeScores retired 2026-08-07:
    // the semantic-signal scoring component was declared but never wired to a producer
    // (no search/scoring pipeline ever populated these fields). See commit for audit.
    trailIndices = $state<Set<number>>(new Set())
    projectedNeighborGrid = $state<SpatialGrid | null>(null)
    projectedNeighborCache = $state<Map<number, unknown>>(new Map())
    pointIndexByLeadId = $state<Map<string | number, number>>(new Map())
    deferredHydrationStarted = $state<boolean>(false)
    _semanticDiveTransitionDeadline = $state<number>(0)
    /**
     * Test-only: set by `window.__forceSemanticDiveContractSurface`
     * (src/components/AppBoot.svelte). The hook forces the semantic-dive
     * surface without a real selection flow, so parity's focus-context
     * resolver finds nothing to anchor the dive surface to. parity-attrs
     * reads this flag to treat the forced contract surface as a focus
     * context; never set on any production code path.
     */
    _semanticDiveContractForced = $state<boolean>(false)
    lastSuccessfulFetch = $state<string | null>(null)

    // ==== VIEWPORT / ENVIRONMENT STATE ====
    // Phase 6d: viewport fields moved into appState.viewportState sub-aggregate
    // ==== UI COMPONENT STATE ====
    // W51-UX-5: legend defaults to OPEN on desktop viewports (≥769px wide),
    // closed on compact/mobile. The audit found that hiding the category
    // legend behind a header toggle on desktop meant users never saw the
    // 21-cluster color key without explicitly opening it — a critical
    // mycelium-exploration affordance that was effectively invisible.
    // SSR-safe: typeof window guard + matchMedia feature-detect.
    legendOpen = $state<boolean>(
        typeof window !== 'undefined' &&
            typeof window.matchMedia === 'function' &&
            !window.matchMedia('(max-width: 768px)').matches
    )
    demoPhase = $state<string>('IDLE')

    // ==== WEATHER STATE (MIGRATED FROM weatherStateStore) ====
    weatherState = $state<{
        weather: WeatherData | null
        lastFetch: number | null
        fallback: boolean
        stalenessMsg: string
    }>({
        weather: null,
        lastFetch: null,
        fallback: false,
        stalenessMsg: ''
    })

    // ==== COMPOSITION STATE removed (W48-F): appState.composition was a dead
    // mirror — initialized to defaults, never written by any module. parity-attrs
    // owns the canonical surface (parityMap + body.dataset.*); former consumers
    // (weather-ui, SearchResults) now read canonical sources directly. ====

    // ==== newly consolidated state (MIGRATED FROM INDIVIDUAL STORES) ====
    semanticNeighborMapByLeadId = $state<Map<string, SemanticNeighborEntry>>(new Map())
    semanticThreadBundle = $state<SemanticThreadBundle | null>(null)
    semanticThreadArtifactName = $state<string | null>(null)

    // ==== CAMERA / ANIMATION STATE ====
    sceneRevealActive = $state<boolean>(false)
    sceneRevealStartedAt = $state<number>(0)
    sceneRevealCameraStart = $state<Vector3Like | null>(null)
    sceneRevealCameraEnd = $state<Vector3Like | null>(null)
    routeCameraAnimationToken = $state<number>(0)
    viewSwitchPreludeTimer = $state<ReturnType<typeof setTimeout> | null>(null)
    terrainHandoffTimer = $state<ReturnType<typeof setTimeout> | null>(null)
    terrainHandoffState = $state<TerrainHandoffState>({
        phase: 'idle',
        from: 'overview',
        to: 'galaxy',
        routeCount: 0,
        startedAt: 0
    })
    routeExplorationState = $state<RouteExplorationState>({
        phase: 'idle',
        reason: '',
        startedAt: 0
    })
    routeChoreographyState = $state<RouteChoreographyState>({
        phase: 'overview',
        reason: 'initial',
        startedAt: 0,
        anchorIndex: null,
        indexCount: 0,
        lastCameraMove: null
    })
    experienceResetToastTimer = $state<ReturnType<typeof setTimeout> | null>(null)

    // ==== DERIVED STATE (replaces Proxy getters from legacy state) ====

    /** Compatibility alias for navState.focusedIndex. */
    get focusedNode(): number | null {
        return this.navState.focusedIndex
    }

    set focusedNode(index: number | null) {
        const nextIndex = Number.isFinite(index) ? Number(index) : null
        this.navState.focusedIndex = nextIndex
    }

    /** Single source of truth: trailDepth is a direct alias over
     * navState.trailDepth (canonical). Previously it was a parallel $state
     * mirror that could drift from navState.trailDepth — the semanticDiveMode
     * setter wrote only the canonical copy and relied on callers to re-sync the
     * flat field. Now both reads and writes proxy to navState.trailDepth, so the
     * two can never disagree. Mirrors the focusedNode alias just above. */
    get trailDepth(): number {
        return this.navState.trailDepth
    }

    set trailDepth(value: number) {
        this.navState.trailDepth = value
    }

    /** Compatibility view over navState.trailDepth (now a single source of
     * truth — see the trailDepth alias above). */
    get semanticDiveMode(): boolean {
        return this.navState.trailDepth === 2
    }

    set semanticDiveMode(active: boolean) {
        this.navState.trailDepth = active ? 2 : 0
    }

    /** Single source of truth: currentView is a direct alias over
     * navState.currentView (canonical). Previously it was a parallel $state
     * mirror with the same flat-vs-nested drift as trailDepth — the flat
     * setter wrote only itself and the navigation bridge only synced for
     * 'galaxy'/'map' via an explicit conditional. Now both reads and writes
     * proxy to navState.currentView, so the two can never disagree.
     * Mirrors the trailDepth and focusedNode aliases above. */
    get currentView(): ViewName {
        return this.navState.currentView
    }

    set currentView(value: ViewName) {
        this.navState.currentView = value
    }
}

// Singleton opt-in instance — consumers can import and use this instead of the legacy state.
const GLOBAL_APP_STATE_KEY = '__SEMANTIC_EXPLORER_APP_STATE_V1__'
// Cross-chunk direct key: used by getAppState() to detect an instance already
// created by another Vite chunk.  MUST be a plain data property (not a getter);
// the getter on GLOBAL_APP_STATE_KEY calls getAppState() itself, so reading it
// inside getAppState() would create infinite recursion.
//
// We store the validation Proxy wrapper (`appState`) here, NOT the raw
// AppState instance.  This ensures that any chunk which reads the shared
// singleton receives the Proxy and its validateStateProperty guards, not an
// unvalidated raw object.
const APP_STATE_DIRECT_KEY = '__SEMANTIC_EXPLORER_APP_STATE_DIRECT__'

let _appStateInstance: AppState | null = null

function getAppState(): AppState {
    if (_appStateInstance === null) {
        // Cross-chunk singleton synchronisation.
        // When Vite code-splits, the `app.svelte.ts` module can be duplicated
        // into multiple chunks.  Each chunk has its own module-level
        // `_appStateInstance`.  If engine/lifecycle.ts (chunk A) creates and
        // populates the instance, then main.ts (chunk B) must reuse that same
        // object rather than lazily creating a new empty one.
        //
        // We use a plain *data* property on `window` for this, NOT the getter
        // `window[GLOBAL_APP_STATE_KEY]`.  The getter is defined below as
        // `Object.defineProperty(window, GLOBAL_APP_STATE_KEY, { get: getAppState })`,
        // so reading it triggers `getAppState()` again — infinite recursion.
        const directInstance =
            typeof window !== 'undefined'
                ? ((window as unknown as Record<string, unknown>)[APP_STATE_DIRECT_KEY] as AppState | undefined)
                : undefined
        if (directInstance) {
            _appStateInstance = directInstance
        } else {
            _appStateInstance = new AppState()
            if (typeof window !== 'undefined') {
                // Store the validation Proxy wrapper so other chunks receive
                // the same guarded object.  The Proxy delegates to the raw
                // instance held in this module's _appStateInstance, so no
                // recursion occurs when a foreign chunk reads the stored Proxy.
                ;(window as unknown as Record<string, unknown>)[APP_STATE_DIRECT_KEY] = appState
            }

            // ── Phase 6a — startup enum safety net ─────────────────────────────
            // Run once per appState initialization to surface invalid enum values
            // that would otherwise propagate silently. This catches partition
            // mistakes (Phase 6b) where field paths get misaligned with their
            // VALID_* sets. We console.warn instead of throwing so production
            // doesn't crash on the first violation — only the dev/strict path
            // (validateStateProperty at the proxy setter) is fatal.
            try {
                const result = validateAppStateEnumFields(_appStateInstance)
                const IS_DEV = typeof import.meta.env !== 'undefined' && import.meta.env.DEV
                if (result.errors.length > 0 && typeof console !== 'undefined' && IS_DEV) {
                    console.warn(
                        `[appState] Phase 6a enum validation found ${result.errors.length} invalid value(s) (${result.checked} checked): ${result.errors.join('; ')}`
                    )
                }
            } catch {
                // Defensive: validation must never block appState init.
            }
        }
    }
    return _appStateInstance
}

/** Lazy AppState singleton — defers instantiation (and 191 $state proxy creations)
 * until first property access, shaving ~300–800 ms off the critical path. */
export const appState: AppState = new Proxy({} as AppState, {
    get(_target, prop, _receiver) {
        const instance = getAppState()
        const value = Reflect.get(instance, prop, instance)
        return typeof value === 'function' ? (value as Function).bind(instance) : value
    },
    set(_target, prop, value, _receiver) {
        // ── State validation (Phase 4) ─────────────────────────────────────
        // Guards catch invalid runtime values before they propagate downstream.
        // In dev mode: throw. In prod: silently reject the write (with a
        // dev-gated debugWarn so we can still trace rejections during local
        // development, but production users don't get console spam from
        // benign validation failures).
        if (typeof prop === 'string') {
            const error = validateStateProperty(prop, value)
            if (error) {
                if (STATE_VALIDATION_STRICT) {
                    throw new Error(`[appState] ${error}`)
                } else {
                    // W-audit-F: rejections must be observable in production.
                    // debugWarn is DEV-gated (silent in prod), so instead
                    // publish an APP_ERROR_CAUGHT event that the error-boundary
                    // subscribers surface. Keeps the no-ungated-console contract
                    // and remains non-throwing.
                    publish(EVENTS.APP_ERROR_CAUGHT, {
                        source: `appState.proxy.set.${String(prop)}`,
                        message: `Invalid value rejected: ${error}`,
                        kind: 'rejection'
                    })
                    // Return true so the trap does not throw a strict-mode
                    // TypeError. The rejection is already surfaced via the
                    // APP_ERROR_CAUGHT event; the invalid value is not set.
                    return true
                }
            }
        }
        return Reflect.set(getAppState(), prop, value)
    },
    has(_target, prop) {
        return Reflect.has(getAppState(), prop)
    },
    ownKeys(_target) {
        return Reflect.ownKeys(getAppState())
    },
    getOwnPropertyDescriptor(_target, prop) {
        return Reflect.getOwnPropertyDescriptor(getAppState(), prop)
    },
    defineProperty(_target, prop, attributes) {
        return Reflect.defineProperty(getAppState(), prop, attributes)
    },
    deleteProperty(_target, prop) {
        return Reflect.deleteProperty(getAppState(), prop)
    }
})

// Dev-only nested-state audit: catches mutations that bypass the outer
// Proxy `set` trap (e.g. `appState.navState.mode = 'bogus'`). The outer
// trap only sees top-level keys, so nested assignments never reach
// `validateStateProperty()` without an explicit audit pass.
async function _runNestedAudit() {
    try {
        const { auditNestedStateMutations } = await import('./state-validation')
        const errors = auditNestedStateMutations(getAppState() as unknown as Record<string, unknown>)
        const IS_DEV = typeof import.meta.env !== 'undefined' && import.meta.env.DEV
        if (errors.length > 0 && IS_DEV) {
            console.warn('[appState] nested mutation audit:', errors.join('; '))
        }
    } catch {
        // Defensive: audit must never block appState init.
    }
}
const IS_DEV = typeof import.meta.env !== 'undefined' && import.meta.env.DEV
if (IS_DEV && typeof window !== 'undefined') {
    // Use DisposableRegistry.scheduleInterval to satisfy the no-restricted-syntax
    // lint rule and ensure the timer is cleared on teardown.
    const _nestedAuditReg = new DisposableRegistry({ label: 'appState-nested-audit', warnAfterDispose: false })
    _nestedAuditReg.scheduleInterval(5000, _runNestedAudit)
    window.addEventListener('beforeunload', () => _nestedAuditReg.disposeAll())
}

// Also expose on window for devtools / legacy bridge access (triggers instantiation if not yet done)
if (typeof window !== 'undefined') {
    Object.defineProperty(window, GLOBAL_APP_STATE_KEY, {
        get: getAppState,
        enumerable: false,
        configurable: true
    })
}

// ── legacyState runtime alias (historical) ───────────────────────────────────
// Replaces legacy-state-adapter.ts. A few subsystems still read appState
// through this alias. It is the same object as appState, typed as AppState.
// The unsafe `as unknown as LegacyState` cast was removed in the P1-F cleanup so
// every access is now type-checked.
export const legacyState = appState
