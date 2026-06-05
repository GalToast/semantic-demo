/**
 * types/state.d.ts
 *
 * Ambient declaration for the global state singleton exported by js/state.js.
 * This provides a typed boundary so TS modules can import state without
 * depending on the runtime Proxy implementation. The types mirror the
 * _rawState shape exactly.
 */

import type { WebGLContextState } from './three-engine';

// ── Cluster / filter types ──────────────────────────────────────────────

export type ClusterName =
    | 'General Business' | 'Professional Services' | 'Food & Hospitality'
    | 'Construction & Trades' | 'Retail & Shops' | 'Beauty & Wellness'
    | 'Real Estate & Property' | 'Industrial & Logistics'
    | 'Agriculture & Ranching' | 'Automotive' | 'Healthcare & Medical'
    | 'Therapy & Counseling' | 'Education & Childcare' | 'Churches'
    | 'Faith Ministries' | 'Community Nonprofits' | 'Foundations'
    | 'Arts & Culture' | 'Economic Development' | 'Public Agencies'
    | 'Enterprise Brands';

export interface ActiveFilters {
    status: string;
    city: string;
    website: boolean;
    email: boolean;
    geocoded: boolean;
}

// ── Navigation state ────────────────────────────────────────────────────

export type ViewName = 'galaxy' | 'map' | 'overview';

export type CompassPhase = 'overview' | 'search' | 'focus' | 'inside' | 'map';

export type ThreadSource = 'geometric-fallback' | string;

export interface NavState {
    mode: string;
    focusedIndex: number | null;
    trailSeedIndex: number | null;
    trailNeighborIndices: number[];
    trailCursor: number;
    walkHistoryIndices: number[];
    lastTraversalReason: string | null;
    threadCandidates: number[];
    threadReasonByIndex: Map<number, string>;
    threadSource: ThreadSource;
    focusPocketIndices: number[];
    focusPocketMeta: unknown;
    focusPocketRoleByIndex: Map<number, string>;
    focusPocketAnimationFrameId: number | null;
    focusFramingMeta: unknown;
    currentPersonality: string | null;
    neighborhoodIndices: number[];
}

// ── Loading phase types ─────────────────────────────────────────────────

export type LoadingPhaseKey = 'records' | 'scene' | 'restore' | 'launch';

export interface LoadingPhaseMeta {
    progress: number;
    note: string;
    foot: string;
}

// ── Diagnostic state ────────────────────────────────────────────────────

export interface ScenePerformanceDiagnostics {
    active: boolean;
    reason: string;
    lastFrameAt: number;
    sampleCount: number;
    avgFrameMs: number;
    maxFrameMs: number;
    avgUpdateMs: number;
    maxUpdateMs: number;
    avgRenderMs: number;
    maxRenderMs: number;
    avgControlsMs: number;
    avgNodeMotionMs: number;
    avgThreadUpdateMs: number;
    avgGlowMs: number;
    avgLensMs: number;
}

export interface FocusFrameDiagnostics {
    lastFrameAt: number;
    sampleCount: number;
    avgFrameMs: number;
    maxFrameMs: number;
}

export interface FocusThreadDiagnostics {
    active: boolean;
    reason: string;
    edgeCount: number;
    directEdgeCount: number;
    supportEdgeCount: number;
    subduedEdgeCount: number;
    segmentCount: number;
    vertexCount: number;
    overlayNodeCount: number;
    nextCueSegments: number;
    denseBundleMode: boolean;
    buildMs: number;
    avgFrameMs: number;
    maxFrameMs: number;
}

export interface RouteTraceDiagnostics {
    active: boolean;
    reason: string;
    phase: string;
    indexCount: number;
    edgeCount: number;
    segmentCount: number;
    anchorIndex: number | null;
    mapPointCount: number;
    mapPathActive: boolean;
}

export interface InspectedStrandDiagnostics {
    active: boolean;
    source: string;
    index: number | null;
    focusedIndex: number | null;
    segmentCount: number;
    braidCount: number;
    endpointCount: number;
}

export interface ArrivalHandoffDiagnostics {
    active: boolean;
    fromIndex: number | null;
    targetIndex: number | null;
    phase: string;
    segmentCount: number;
    endpointCount: number;
    opacity: number;
}

export interface SemanticSearchCacheDiagnostics {
    hits: number;
    misses: number;
    stores: number;
    evictions: number;
    lastKey: string | null;
    lastSource: string | null;
    lastAgeMs: number | null;
}

// ── Terrain / route animation state ─────────────────────────────────────

export interface TerrainHandoffState {
    phase: string;
    from: string;
    to: string;
    routeCount: number;
    startedAt: number;
}

export interface RouteExplorationState {
    phase: string;
    reason: string;
    startedAt: number;
}

export interface RouteChoreographyState {
    phase: string;
    reason: string;
    startedAt: number;
    anchorIndex: number | null;
    indexCount: number;
    lastCameraMove: number | null;
}

// ── Strand continuity state ─────────────────────────────────────────────

export interface StrandContinuityState {
    phase: string;
    targetIndex: number | null;
    fromIndex: number | null;
    reason: string;
    startedAt: number;
    arrivalTimeoutId: ReturnType<typeof setTimeout> | undefined;
    settleTimeoutId: ReturnType<typeof setTimeout> | undefined;
}

export interface FocusOrbitSlackState {
    phase: string;
    reason: string;
    startedAt: number;
    targetShift: number;
    cameraShift: number;
    distanceBefore: number;
    distanceAfter: number;
    maxDistance: number;
    rotateSpeed: number;
    panSpeed: number;
}

// ── Constellation motif types ───────────────────────────────────────────

export interface ConstellationMotif {
    label: string;
    directLift: number;
    supportLift: number;
    directPriority: number;
    supportPriority: number;
    braid: number;
}

export type ConstellationMotifName = 'rosette' | 'lattice' | 'delta' | 'market' | 'civic';

// ── Business point data ─────────────────────────────────────────────────

export interface Point {
    name?: string;
    what?: string;
    trivia?: string;
    public_note?: string;
    public_detail?: string;
    city?: string;
    cluster?: number;
    status?: string;
    phone?: string;
    email?: string;
    website?: string;
    lat?: number;
    lng?: number;
    lead_id?: string | number;
    x?: number;
    y?: number;
    z?: number;
    [key: string]: unknown;
}

// ── Semantic neighbor types ─────────────────────────────────────────────

export interface SemanticNeighbor {
    leadId: string | number;
    semanticScore?: number;
    score?: number;
    bridgeScore?: number;
    sameCity?: boolean;
    threadType?: string;
}

export interface SemanticNode {
    neighbors: SemanticNeighbor[];
}

// ── Configuration constants (subset used by state) ──────────────────────

export interface StateConfig {
    MAP_HANDOFF_PRELUDE_MS: number;
    VIEW_HANDOFF_OUT_MS: number;
    TERRAIN_LANDING_SETTLE_MS: number;
    TERRAIN_LANDING_SETTLE_LONG_MS: number;
    SHOW_VIEW_HANDOFF_DISMISS_MS: number;
    MAP_TRAIL_REFRESH_LATE_DELAY_MS: number;
    AUTO_ROTATE_IDLE_MS: number;
    AUTO_ROTATE_MANUAL_IDLE_MS: number;
    AUTO_ROTATE_SOFT_RESUME_MS: number;
    AUTO_ROTATE_BASE_SPEED: number;
    MOBILE_ROUTE_FIELD_PEEK_MS: number;
    SELECTED_CARD_FADE_MS: number;
    ORBIT_MIN_DISTANCE_DEFAULT: number;
    ORBIT_MIN_DISTANCE_INSIDE: number;
    ORBIT_MAX_DISTANCE_DEFAULT: number;
    ORBIT_MAX_DISTANCE_FREE: number;
    ORBIT_ROTATE_SPEED_DEFAULT: number;
    ORBIT_ROTATE_SPEED_FREE: number;
    ORBIT_PAN_SPEED_DEFAULT: number;
    ORBIT_PAN_SPEED_FREE: number;
    SEARCH_TRAIL_CUE_MIN_DWELL_MS: number;
    JOURNEY_COMPASS_PHASE_ORDER: readonly CompassPhase[];
    FOCUS_CONSTELLATION_MOTIFS: Record<ConstellationMotifName, ConstellationMotif>;
    SCENE_REVEAL_DURATION_MS: number;
    LOADING_MIN_VISIBLE_MS: number;
    POINTS_MATERIAL_BASE_SIZE: number;
    POINTS_MATERIAL_BASE_OPACITY: number;
    FOCUS_THREAD_SEGMENTS: number;
    HOVER_LOCK_CONFIRM_MS: number;
    HOVER_SAMPLE_MS: number;
    LEAFLET_CSS_URL: string;
    LEAFLET_JS_URL: string;
    COLORS: readonly string[];
    CLUSTER_NAMES: readonly ClusterName[];
    LOADING_PHASE_META: Record<LoadingPhaseKey, LoadingPhaseMeta>;
}

// ── Main state interface ────────────────────────────────────────────────

export interface SemanticState extends StateConfig {
    // ==== SCENE / THREE.JS ====
    points: Point[];
    map: unknown;
    markersLayer: unknown;
    mapRouteLayer: unknown;
    mapInitialized: boolean;
    leafletAssetsPromise: Promise<unknown> | null;
    scene: unknown;
    camera: unknown;
    renderer: unknown;
    controls: unknown;
    pointsMesh: unknown;
    pointsMaterial: unknown;
    nodeSporeMesh: unknown;
    nodeSporeHitMesh: unknown;
    nodeSporeMaterial: unknown;
    rawPositionsBuffer: Float32Array | null;
    rawClustersBuffer: Float32Array | null;
    leadEnrichment: Record<string, unknown> | null;
    myceliumLines: unknown;
    myceliumGroup: unknown;
    myceliumCoreLines: unknown;
    myceliumWispyLines: unknown;
    myceliumBridgeLines: unknown;
    focusSemanticLines: unknown;
    focusSemanticConnectionPairs: Array<{ a: number; b: number; layer: number }>;
    semanticLensGroup: unknown;
    semanticLensGlow: unknown;
    semanticLensSpokes: unknown;
    myceliumConnectionPairs: Array<{ a: number; b: number; layer: number }>;
    myceliumDirty: boolean;
    hemiLight: unknown;
    dirLight: unknown;

    // ==== PERFORMANCE DIAGNOSTICS ====
    scenePerformanceDiagnostics: ScenePerformanceDiagnostics;
    focusFrameDiagnostics: FocusFrameDiagnostics;
    focusThreadDiagnostics: FocusThreadDiagnostics;

    // ==== SEMANTIC THREAD ARTIFACT ====
    semanticThreadBundle: unknown;
    semanticThreadArtifactName: string | null;
    semanticSpaceLayoutManifest: unknown;
    semanticSpaceLayoutStatus: string;
    semanticSpaceLayoutError: string | null;
    semanticNeighborMapByLeadId: Map<string, SemanticNode>;
    semanticThreadsLoadPromise: Promise<unknown> | null;
    semanticThreadsStatus: string;
    semanticThreadsRetryAttempt: number;
    semanticThreadsRetryTimer: ReturnType<typeof setTimeout> | null;
    dataLoadAttempt: number;

    // ==== POSITION / GEOMETRY STATE ====
    nodePositions: number[];
    targetPositions: number[];
    originalPositions: number[];
    currentView: ViewName;
    autoRotate: boolean;
    autoRotateSuspended: boolean;
    weather: unknown;
    weatherInitialized: boolean;
    clockTimer: ReturnType<typeof setTimeout> | null;
    selectedPoint: Point | null;
    rippleActive: boolean;
    rippleStartTime: number;
    bloomPulseStartTime: number;
    bridgePulseStartTime: number;
    rippleCenter: unknown;
    pointColorStateVersion: number;
    pulsePhase: number;
    nodesAreSettling: boolean;
    _settlingMaxDelta: number;
    _settlingWatchdogStartedAt: number | null;
    _settlingLowFrames: number;
    pointBaseColors: unknown;
    hoverHighlightIndex: number;
    hoveredCluster: number | null;
    stableCanvasHover: unknown;
    lastCanvasNodeHover: unknown;
    lastCanvasNodePick: unknown;
    lastCanvasNodeFocusPick: unknown;
    focusTargetVector: unknown;
    desiredCameraVector: unknown;
    searchTimeout: ReturnType<typeof setTimeout> | null;
    searchAbortController: AbortController | null;
    currentSearchSummary: unknown;
    currentEmptyQuery: string | null;
    semanticTrailCue: string;
    applyingUrlState: boolean;
    restoringBrowserHistory: boolean;
    urlStateRestoreToken: number;
    eventListenersInitialized: boolean;
    searchGlowActive: boolean;
    searchGlowRenderStateKey: string;
    loadingOverlayStartedAt: number;
    loadingPhaseKey: LoadingPhaseKey;
    navState: NavState;
    activeFilters: ActiveFilters;

    // ==== FILTER / MODE STATE ====
    filterVersion: number;
    filterColorVersion: number;
    registeredEvents: Set<string>;
    activeClusterFilter: number | null;
    activeStoryPrompt: unknown;
    myceliumMode: string;
    trailDepth: number;
    MODE_DESCRIPTIONS: Record<string, string>;
    STORY_DESCRIPTIONS: Record<string, string>;
    pointMarkers: unknown[];

    // ==== SEARCH / SEMANTIC LANE STATE ====
    searchRequestSequence: number;
    searchAnchorIndex: number | null;
    searchPreviewIndex: number | null;
    searchGlowIndices: Set<number>;
    searchGlowTopIndex: number | null;
    searchFocusTransitionToken: number;
    searchPreviewHoverTimer: ReturnType<typeof setTimeout> | null;
    searchVectorScrambleInterval: ReturnType<typeof setInterval> | null;
    searchVectorScrambleTimer: ReturnType<typeof setTimeout> | null;
    compactSearchRevealToken: number;
    compactSearchRevealTimers: Array<ReturnType<typeof setTimeout>>;
    mobileRouteFieldPeekTimer: ReturnType<typeof setTimeout> | null;
    mobileRouteFieldPeekToken: number;
    semanticLaneMonitorTimer: ReturnType<typeof setTimeout> | null;
    semanticLaneProbePromise: Promise<unknown> | null;
    semanticLaneOpsMode: boolean;
    semanticLaneOpsFetchPromise: Promise<unknown> | null;
    semanticLaneOpsRefreshTimer: ReturnType<typeof setTimeout> | null;
    semanticLanePendingWarm: boolean;
    semanticLaneState: string;
    semanticLaneSnapshot: unknown;
    semanticSearchResultCache: Map<string, unknown>;
    semanticSearchCacheDiagnostics: SemanticSearchCacheDiagnostics;
    semanticResultContextByLeadId: Map<string, unknown>;
    semanticGuideAbortController: AbortController | null;
    semanticGuideRequestSequence: number;
    semanticTrailStoryAbortController: AbortController | null;
    semanticTrailStoryRequestSequence: number;
    currentSemanticGuide: unknown;
    summaryCardTypeToken: number;

    // ==== ANIMATION / ROUTE STATE ====
    autoRotateResumeTimer: ReturnType<typeof setTimeout> | null;
    autoRotateResumeDueAt: number;
    autoRotateSoftResumeStartedAt: number;
    sceneRevealActive: boolean;
    sceneRevealStartedAt: number;
    sceneRevealCameraStart: unknown;
    sceneRevealCameraEnd: unknown;
    routeCameraAnimationToken: number;
    viewHandoffTimer: ReturnType<typeof setTimeout> | null;
    viewSwitchPreludeTimer: ReturnType<typeof setTimeout> | null;
    terrainHandoffTimer: ReturnType<typeof setTimeout> | null;
    terrainHandoffState: TerrainHandoffState;
    routeExplorationState: RouteExplorationState;
    routeChoreographyState: RouteChoreographyState;
    experienceResetToastTimer: ReturnType<typeof setTimeout> | null;

    // ==== FOCUS / THREAD / ROUTE DIAGNOSTIC STATE ====
    semanticDiveMode: boolean;
    focusCameraAnimationToken: number;
    focusCameraAssistActive: boolean;
    focusCameraAssistUntil: number;
    focusCameraAssistReason: string;
    focusCameraOffset: unknown;
    focusCameraTargetOffset: unknown;
    focusPocketMotionByIndex: Map<number, unknown>;
    focusPocketTransitionStartedAt: number;
    focusLens: unknown;
    focusHalo: unknown;
    focusCore: unknown;
    focusMoteGroup: unknown;
    focusMotes: unknown[];
    focusPetalGroup: unknown;
    focusPetals: unknown[];
    focusFilaments: unknown;
    focusAnchorGroup: unknown;
    focusAnchorRingMesh: unknown;
    focusAnchorHaloSprite: unknown;
    hoverHalo: unknown;
    focusBeaconTexture: unknown;
    focusRingTexture: unknown;
    focusNextCueTexture: unknown;
    semanticManifold: unknown;
    routeTraceLines: unknown;
    arrivalHandoffGroup: unknown;
    routeTraceConnectionPairs: Array<{ a: number; b: number; layer: number }>;
    routeTraceRenderStateKey: string;
    routeTraceDiagnostics: RouteTraceDiagnostics;
    inspectedStrandGroup: unknown;
    inspectedThreadIndex: number | null;
    pinnedThreadIndex: number | null;
    canvasThreadInspectionClearTimer: ReturnType<typeof setTimeout> | null;
    threadInspectorPointerInside: boolean;
    inspectedStrandDiagnostics: InspectedStrandDiagnostics;
    arrivalHandoffDiagnostics: ArrivalHandoffDiagnostics;
    strandContinuityState: StrandContinuityState;
    focusOrbitSlackState: FocusOrbitSlackState;
    focusTransitionMode: string;
    focusTransitionStartedAt: number;
    focusTransitionSettleTimer: ReturnType<typeof setTimeout> | null;
    recentArrangements: unknown[];
    signalScores: number[];
    bridgeScores: number[];
    bloomIndices: Set<number>;
    bridgeIndices: Set<number>;
    trailIndices: Set<number>;
    projectedNeighborGrid: unknown;
    projectedNeighborCache: Map<number, unknown>;
    pointIndexByLeadId: Map<string | number, number>;

    deferredHydrationStarted: boolean;

    // Derived properties (defined via Object.defineProperties)
    focusedNode: number | null;
}

// ── Module augmentation for js/state.js ─────────────────────────────────

declare module '../state.js' {
    export const _rawState: SemanticState;
    export const state: SemanticState;
    export function withStateMutation<T>(fn: () => T): T;
}

declare module '../../state.js' {
    export const _rawState: SemanticState;
    export const state: SemanticState;
    export function withStateMutation<T>(fn: () => T): T;
}
