/**
 * @lib/state/state-types.ts — Type definitions for the Svelte 5 state class.
 *
 * W13-T5b Wave 1: Extracted from js/state.ts to centralize the shared app
 * state type surface for src/lib/state/app.svelte.ts and its consumers.
 *
 * This file contains ONLY type/interface declarations (no runtime values).
 * The 39 types here are the public type surface of the legacy state kernel.
 * Consumers should import from @lib/state/state-types for types and from
 * @lib/state/app.svelte for the AppState class + appState instance.
 *
 * Source: js/state.ts (lines 41-675, extracted 2026-06-16).
 */

import type { WebGLContextState } from '@lib/engine/webgl-context'

export interface Vector3Like {
    x: number
    y: number
    z: number
    clone?(): Vector3Like
    copy?(v: Vector3Like): Vector3Like
    set?(x: number, y: number, z: number): Vector3Like
    add?(v: Vector3Like): Vector3Like
    sub?(v: Vector3Like): Vector3Like
    multiplyScalar?(s: number): Vector3Like
    normalize?(): Vector3Like
    lerpVectors?(a: Vector3Like, b: Vector3Like, alpha: number): Vector3Like
    distanceTo?(v: Vector3Like): number
    length?(): number
    lengthSq?(): number
    setLength?(l: number): Vector3Like
    toArray?(array?: number[], offset?: number): number[]
    fromArray?(array: number[], offset?: number): Vector3Like
}

export interface NodePosition {
    x: number
    y: number
    z: number
}

export interface CameraLike {
    position: Vector3Like
    fov?: number
    aspect?: number
    updateProjectionMatrix?(): void
    lookAt?(x: number, y: number, z: number): void
}

export interface ControlsLike {
    target: Vector3Like
    update(): void
    enabled: boolean
    autoRotate?: boolean
    autoRotateSpeed?: number
    minDistance?: number
    maxDistance?: number
    rotateSpeed?: number
    panSpeed?: number
    enableDamping?: boolean
    dampingFactor?: number
    zoomSpeed?: number
    enablePan?: boolean
}

export interface RendererInfoMemory {
    geometries?: number
    textures?: number
}

export interface RendererInfo {
    memory: RendererInfoMemory
    programs?: unknown[]
    render?: { calls?: number; triangles?: number }
}

export interface RendererLike {
    domElement: HTMLCanvasElement
    render(scene: unknown, camera: unknown): void
    compile?(scene: unknown, camera: unknown): void
    setSize?(width: number, height: number): void
    setPixelRatio?(ratio: number): void
    dispose?(): void
    info: RendererInfo
}

export type ClusterName =
    | 'General Business'
    | 'Professional Services'
    | 'Food & Hospitality'
    | 'Construction & Trades'
    | 'Retail & Shops'
    | 'Beauty & Wellness'
    | 'Real Estate & Property'
    | 'Industrial & Logistics'
    | 'Agriculture & Ranching'
    | 'Automotive'
    | 'Healthcare & Medical'
    | 'Therapy & Counseling'
    | 'Education & Childcare'
    | 'Churches'
    | 'Faith Ministries'
    | 'Community Nonprofits'
    | 'Foundations'
    | 'Arts & Culture'
    | 'Economic Development'
    | 'Public Agencies'
    | 'Enterprise Brands'

export interface ActiveFilters {
    status: string
    city: string
    website: boolean
    email: boolean
    geocoded: boolean
}

export type ViewName = 'galaxy' | 'map' | 'focus' | 'trail' | 'semantic'

export type CompassPhase = 'overview' | 'search' | 'focus' | 'inside' | 'map'

export type ThreadSource = 'geometric-fallback' | string | null

export interface NavFocusPocketMeta {
    active?: boolean
    viewportProfile?: {
        key?: string
        targetOffsetLimit?: number
        [key: string]: unknown
    }
    [key: string]: unknown
}

export interface NavFocusFramingMeta {
    transitionStyle?: string
    distance?: number
    verticalLift?: number
    framingDrop?: number
    targetOffset?: unknown
    duration?: number
    travelVector?: unknown
    [key: string]: unknown
}

export interface NavState {
    mode: string
    surface?: string
    previousSurface?: string
    focusedIndex: number | null
    trailDepth: number
    trailSeedIndex: number | null
    trailNeighborIndices: number[]
    trailCursor: number
    walkHistoryIndices: number[]
    explorationHistoryIndices: number[]
    lastTraversalReason: string | null
    threadCandidates: ThreadCandidateLike[]
    threadReasonByIndex: Map<number, string>
    threadSource: ThreadSource
    focusPocketIndices: number[]
    focusPocketMeta: NavFocusPocketMeta | null
    focusPocketRoleByIndex: Map<number, string>
    focusPocketAnimationFrameId: number | null
    focusFramingMeta: NavFocusFramingMeta | null
    currentPersonality: Record<string, unknown> | null
    neighborhoodIndices: number[]
    currentView?: string
    myceliumMode?: string
    autoRotate?: boolean
    autoRotateSuspended?: boolean
    trailDepthFromExploration?: number
    sceneRevealActive?: boolean
    sceneRevealStartedAt?: number
    loadingPhaseKey?: string
    applyingUrlState?: boolean
    restoringBrowserHistory?: boolean
    urlStateRestoreToken?: number
}

export interface CanvasHoverCandidate {
    index?: number
    screenX?: number
    screenY?: number
    source?: string
    reason?: string
    [key: string]: unknown
}

export interface ThreadCandidateLike {
    index: number
    score: number
    semanticScore: number
    sameCity: boolean
    sameStatus: boolean
    bridgeScore: number
    signalScore: number
    threadType: string
    relationshipRole: string
    relationshipAxis: string
    roleReason: string
    reason: string
    source: string
    [key: string]: unknown
}

export type LoadingPhaseKey = 'records' | 'scene' | 'restore' | 'launch'

export interface LoadingPhaseMeta {
    progress: number
    note: string
    foot: string
}

export interface ScenePerformanceDiagnostics {
    active: boolean
    reason: string
    lastFrameAt: number
    sampleCount: number
    avgFrameMs: number
    maxFrameMs: number
    avgUpdateMs: number
    maxUpdateMs: number
    avgRenderMs: number
    maxRenderMs: number
    avgControlsMs: number
    avgNodeMotionMs: number
    avgThreadUpdateMs: number
    avgGlowMs: number
    avgLensMs: number
    myceliumCoreSegments: number
    myceliumWispySegments: number
    myceliumBridgeSegments: number
    drawCalls?: number
    triangles?: number
}

export interface FocusFrameDiagnostics {
    lastFrameAt: number
    sampleCount: number
    avgFrameMs: number
    maxFrameMs: number
}

export interface FocusThreadDiagnostics {
    active: boolean
    reason: string
    edgeCount: number
    directEdgeCount: number
    supportEdgeCount: number
    subduedEdgeCount: number
    segmentCount: number
    vertexCount: number
    overlayNodeCount: number
    nextCueSegments: number
    denseBundleMode: boolean
    buildMs: number
    avgFrameMs: number
    maxFrameMs: number
}

export interface RouteTraceDiagnostics {
    active: boolean
    reason: string
    phase: string
    indexCount: number
    edgeCount: number
    segmentCount: number
    anchorIndex: number | null
    mapPointCount: number
    mapPathActive: boolean
}

export interface InspectedStrandDiagnostics {
    active: boolean
    source: string
    index: number | null
    focusedIndex: number | null
    segmentCount: number
    braidCount: number
    endpointCount: number
    pinned?: boolean
}

export interface ArrivalHandoffDiagnostics {
    active: boolean
    fromIndex: number | null
    targetIndex: number | null
    phase: string
    segmentCount: number
    endpointCount: number
    opacity: number
}

export interface SemanticSearchCacheDiagnostics {
    hits: number
    misses: number
    stores: number
    evictions: number
    lastKey: string | null
    lastSource: string | null
    lastAgeMs: number | null
}

export interface TerrainHandoffState {
    phase: string
    from: string
    to: string
    routeCount: number
    startedAt: number
}

export interface RouteExplorationState {
    phase: string
    reason: string
    startedAt: number
}

export interface RouteChoreographyState {
    phase: string
    reason: string
    startedAt: number
    anchorIndex: number | null
    indexCount: number
    lastCameraMove: number | null
}

export interface StrandContinuityState {
    phase: string
    targetIndex: number | null
    fromIndex: number | null
    reason: string
    startedAt: number
    arrivalTimeoutId: ReturnType<typeof setTimeout> | undefined
    settleTimeoutId: ReturnType<typeof setTimeout> | undefined
}

export interface FocusOrbitSlackState {
    phase: string
    reason: string
    startedAt: number
    targetShift: number
    cameraShift: number
    distanceBefore: number
    distanceAfter: number
    maxDistance: number
    rotateSpeed: number
    panSpeed: number
}

export interface ConstellationMotif {
    label: string
    directLift: number
    supportLift: number
    directPriority: number
    supportPriority: number
    braid: number
}

export type ConstellationMotifName = 'rosette' | 'lattice' | 'delta' | 'market' | 'civic'

export interface Point {
    name?: string
    what?: string
    trivia?: string
    public_note?: string
    public_detail?: string
    city?: string
    cluster?: number
    status?: string
    phone?: string
    email?: string
    website?: string
    lat?: number
    lng?: number
    lead_id?: string | number
    x?: number
    y?: number
    z?: number
    [key: string]: unknown
}

export interface SemanticNeighbor {
    leadId: string | number
    semanticScore?: number
    score?: number
    bridgeScore?: number
    sameCity?: boolean
    threadType?: string
}

export interface SemanticNode {
    leadId: string
    neighbors: SemanticNeighbor[]
}

export interface StateConfig {
    MAP_HANDOFF_PRELUDE_MS: number
    VIEW_HANDOFF_OUT_MS: number
    TERRAIN_LANDING_SETTLE_MS: number
    TERRAIN_LANDING_SETTLE_LONG_MS: number
    SHOW_VIEW_HANDOFF_DISMISS_MS: number
    MAP_TRAIL_REFRESH_LATE_DELAY_MS: number
    AUTO_ROTATE_IDLE_MS: number
    AUTO_ROTATE_MANUAL_IDLE_MS: number
    AUTO_ROTATE_SOFT_RESUME_MS: number
    AUTO_ROTATE_BASE_SPEED: number
    MOBILE_ROUTE_FIELD_PEEK_MS: number
    SELECTED_CARD_FADE_MS: number
    ORBIT_MIN_DISTANCE_DEFAULT: number
    ORBIT_MIN_DISTANCE_INSIDE: number
    ORBIT_MAX_DISTANCE_DEFAULT: number
    ORBIT_MAX_DISTANCE_FREE: number
    ORBIT_ROTATE_SPEED_DEFAULT: number
    ORBIT_ROTATE_SPEED_FREE: number
    ORBIT_PAN_SPEED_DEFAULT: number
    ORBIT_PAN_SPEED_FREE: number
    SEARCH_TRAIL_CUE_MIN_DWELL_MS: number
    JOURNEY_COMPASS_PHASE_ORDER: readonly CompassPhase[]
    FOCUS_CONSTELLATION_MOTIFS: Record<ConstellationMotifName, ConstellationMotif>
    SCENE_REVEAL_DURATION_MS: number
    LOADING_MIN_VISIBLE_MS: number
    POINTS_MATERIAL_BASE_SIZE: number
    POINTS_MATERIAL_BASE_OPACITY: number
    FOCUS_THREAD_SEGMENTS: number
    HOVER_LOCK_CONFIRM_MS: number
    HOVER_SAMPLE_MS: number
    LEAFLET_CSS_URL: string
    LEAFLET_JS_URL: string
    COLORS: readonly string[]
    CLUSTER_NAMES: readonly ClusterName[]
    LOADING_PHASE_META: Record<LoadingPhaseKey, LoadingPhaseMeta>
}

/** Shape of state.currentSearchSummary — set by search-state.ts, consumed by map-state, semantic-guide-ui, etc. */
export interface SearchSummary {
    query: string
    totalMatches: number
    totalSemanticMatches: number
    visibleMatches: number
    resultCount: number
    topScore: number
    anchorIndex: number | null
    topIndex: number | null
    resultIndices: number[]
    summaryType: 'semantic' | 'text' | 'mixed'
    reason?: string
}

export interface SemanticState extends StateConfig {
    /** Allow legacy string-indexed access for Proxy compatibility */
    [key: string]: unknown
    points: Point[]
    map: unknown
    markersLayer: unknown
    mapRouteLayer: unknown
    mapInitialized: boolean
    leafletAssetsPromise: Promise<unknown> | null
    scene: WebGLContextState['scene']
    camera: CameraLike
    renderer: RendererLike
    controls: ControlsLike
    pointsMesh: WebGLContextState['pointsMesh']
    pointsMaterial: WebGLContextState['pointsMaterial']
    nodeSporeMesh: WebGLContextState['nodeSporeMesh']
    nodeSporeHitMesh: WebGLContextState['nodeSporeHitMesh']
    nodeSporeMaterial: WebGLContextState['nodeSporeMaterial']
    rawPositionsBuffer: Float32Array | null
    rawClustersBuffer: Float32Array | null
    leadEnrichment: Record<string, unknown> | null
    myceliumLines: WebGLContextState['myceliumLines']
    myceliumGroup: WebGLContextState['myceliumGroup']
    myceliumCoreLines: WebGLContextState['myceliumCoreLines']
    myceliumWispyLines: WebGLContextState['myceliumWispyLines']
    myceliumBridgeLines: WebGLContextState['myceliumBridgeLines']
    focusSemanticLines: WebGLContextState['focusSemanticLines']
    focusSemanticConnectionPairs: Array<{ a: number; b: number; layer: number }>
    semanticLensGroup: WebGLContextState['semanticLensGroup']
    semanticLensGlow: WebGLContextState['semanticLensGlow']
    semanticLensSpokes: WebGLContextState['semanticLensSpokes']
    myceliumConnectionPairs: Array<{ a: number; b: number; layer: number }>
    myceliumDirty: boolean
    hemiLight: WebGLContextState['hemiLight']
    dirLight: WebGLContextState['dirLight']
    scenePerformanceDiagnostics: ScenePerformanceDiagnostics
    focusFrameDiagnostics: FocusFrameDiagnostics
    focusThreadDiagnostics: FocusThreadDiagnostics
    semanticThreadBundle: unknown
    semanticThreadArtifactName: string | null
    semanticSpaceLayoutManifest: unknown
    semanticSpaceLayoutStatus: string
    semanticSpaceLayoutError: string | null
    semanticNeighborMapByLeadId: Map<string, SemanticNode>
    semanticThreadsLoadPromise: Promise<unknown> | null
    semanticThreadsStatus: string
    semanticThreadsRetryAttempt: number
    semanticThreadsRetryTimer: ReturnType<typeof setTimeout> | null
    dataLoadAttempt: number
    nodePositions: NodePosition[]
    targetPositions: NodePosition[]
    originalPositions: NodePosition[]
    currentView: ViewName
    autoRotate: boolean
    autoRotateSuspended: boolean
    weather: unknown
    weatherInitialized: boolean
    clockTimer: ReturnType<typeof setTimeout> | null
    selectedPoint: Point | null
    rippleActive: boolean
    rippleStartTime: number
    bloomPulseStartTime: number
    bridgePulseStartTime: number
    rippleCenter: unknown
    pointColorStateVersion: number
    pulsePhase: number
    nodesAreSettling: boolean
    _settlingMaxDelta: number
    _settlingWatchdogStartedAt: number | null
    _settlingLowFrames: number
    pointBaseColors: Float32Array | number[] | null
    hoverHighlightIndex: number
    hoveredCluster: number | null
    stableCanvasHover: CanvasHoverCandidate | null
    lastCanvasNodeHover: CanvasHoverCandidate | null
    lastCanvasNodePick: CanvasHoverCandidate | null
    lastCanvasNodeFocusPick: CanvasHoverCandidate | null
    focusTargetVector: unknown
    desiredCameraVector: unknown
    searchTimeout: ReturnType<typeof setTimeout> | null
    searchAbortController: AbortController | null
    currentSearchSummary: SearchSummary | null
    currentEmptyQuery: string | null
    semanticTrailCue: string
    applyingUrlState: boolean
    restoringBrowserHistory: boolean
    urlStateRestoreToken: number
    eventListenersInitialized: boolean
    searchGlowActive: boolean
    searchGlowRenderStateKey: string
    searchGlowTopIndex: number | null
    loadingOverlayStartedAt: number
    loadingPhaseKey: LoadingPhaseKey
    navState: NavState
    activeFilters: ActiveFilters
    filterVersion: number
    filterColorVersion: number
    filterColorStateKey: string
    registeredEvents: Set<string>
    activeClusterFilter: number | null
    activeStoryPrompt: unknown
    _showAllClusters: boolean
    myceliumMode: string
    trailDepth: number
    MODE_DESCRIPTIONS: Record<string, string>
    STORY_DESCRIPTIONS: Record<string, string>
    pointMarkers: unknown[]
    searchRequestSequence: number
    searchAnchorIndex: number | null
    searchPreviewIndex: number | null
    searchGlowIndices: Set<number>
    searchFocusTransitionToken: number
    searchPreviewHoverTimer: ReturnType<typeof setTimeout> | null
    searchVectorScrambleInterval: ReturnType<typeof setInterval> | null
    searchVectorScrambleTimer: ReturnType<typeof setTimeout> | null
    compactSearchRevealToken: number
    compactSearchRevealTimers: Array<ReturnType<typeof setTimeout>>
    mobileRouteFieldPeekTimer: ReturnType<typeof setTimeout> | null
    mobileRouteFieldPeekToken: number
    semanticLaneMonitorTimer: ReturnType<typeof setTimeout> | null
    semanticLaneProbePromise: Promise<unknown> | null
    semanticLaneOpsMode: boolean
    semanticLaneOpsFetchPromise: Promise<unknown> | null
    semanticLaneOpsRefreshTimer: ReturnType<typeof setTimeout> | null
    semanticLanePendingWarm: boolean
    semanticLaneState: string
    semanticLaneSnapshot: unknown
    semanticSearchResultCache: Map<string, unknown>
    semanticSearchCacheDiagnostics: SemanticSearchCacheDiagnostics
    semanticResultContextByLeadId: Map<string, unknown>
    semanticGuideAbortController: AbortController | null
    semanticGuideRequestSequence: number
    semanticTrailStoryAbortController: AbortController | null
    semanticTrailStoryRequestSequence: number
    currentSemanticGuide: unknown
    summaryCardTypeToken: number
    autoRotateResumeTimer: ReturnType<typeof setTimeout> | null
    autoRotateResumeDueAt: number
    autoRotateSoftResumeStartedAt: number
    sceneRevealActive: boolean
    sceneRevealStartedAt: number
    sceneRevealCameraStart: unknown
    sceneRevealCameraEnd: unknown
    routeCameraAnimationToken: number
    viewHandoffTimer: ReturnType<typeof setTimeout> | null
    viewSwitchPreludeTimer: ReturnType<typeof setTimeout> | null
    terrainHandoffTimer: ReturnType<typeof setTimeout> | null
    terrainHandoffState: TerrainHandoffState
    routeExplorationState: RouteExplorationState
    routeChoreographyState: RouteChoreographyState
    experienceResetToastTimer: ReturnType<typeof setTimeout> | null
    semanticDiveMode: boolean
    focusCameraAnimationToken: number
    focusCameraAssistActive: boolean
    focusCameraAssistUntil: number
    focusCameraAssistReason: string
    focusCameraOffset: Vector3Like | null
    focusCameraTargetOffset: Vector3Like | null
    focusPocketMotionByIndex: Map<number, unknown>
    focusPocketTransitionStartedAt: number
    focusLens: WebGLContextState['focusLens']
    focusHalo: WebGLContextState['focusHalo']
    focusCore: WebGLContextState['focusCore']
    focusMoteGroup: WebGLContextState['focusMoteGroup']
    focusMotes: WebGLContextState['focusMotes']
    focusPetalGroup: WebGLContextState['focusPetalGroup']
    focusPetals: WebGLContextState['focusPetals']
    focusFilaments: WebGLContextState['focusFilaments']
    focusAnchorGroup: WebGLContextState['focusAnchorGroup']
    focusAnchorRingMesh: WebGLContextState['focusAnchorRingMesh']
    focusAnchorHaloSprite: WebGLContextState['focusAnchorHaloSprite']
    hoverHalo: WebGLContextState['hoverHalo']
    focusBeaconTexture: WebGLContextState['focusBeaconTexture']
    focusRingTexture: WebGLContextState['focusRingTexture']
    focusNextCueTexture: WebGLContextState['focusNextCueTexture']
    semanticManifold: WebGLContextState['semanticManifold']
    routeTraceLines: WebGLContextState['routeTraceLines']
    arrivalHandoffGroup: WebGLContextState['arrivalHandoffGroup']
    routeTraceConnectionPairs: Array<{ a: number; b: number; layer: number }>
    routeTraceRenderStateKey: string
    routeTraceDiagnostics: RouteTraceDiagnostics
    inspectedStrandGroup: WebGLContextState['inspectedStrandGroup']
    anchorBloomLight: WebGLContextState['anchorBloomLight']
    inspectedThreadIndex: number | null
    pinnedThreadIndex: number | null
    canvasThreadInspectionClearTimer: ReturnType<typeof setTimeout> | null
    threadInspectorPointerInside: boolean
    inspectedStrandDiagnostics: InspectedStrandDiagnostics
    arrivalHandoffDiagnostics: ArrivalHandoffDiagnostics
    strandContinuityState: StrandContinuityState
    focusOrbitSlackState: FocusOrbitSlackState
    focusTransitionMode: string
    focusTransitionStartedAt: number
    focusTransitionSettleTimer: ReturnType<typeof setTimeout> | null
    recentArrangements: unknown[]
    signalScores: number[]
    bridgeScores: number[]
    bloomIndices: Set<number>
    bridgeIndices: Set<number>
    trailIndices: Set<number>
    projectedNeighborGrid: unknown
    projectedNeighborCache: Map<number, unknown>
    pointIndexByLeadId: Map<string | number, number>
    deferredHydrationStarted: boolean
    _deferredUrlState: { params: Record<string, string>; timestamp: number } | null
    _deferredUrlStateHandler: EventListener | null
    focusedNode: number | null
    /** Deadline timestamp (ms) for the semantic-dive entry transition animation */
    _semanticDiveTransitionDeadline: number
    /** Consecutive warming-probe count for stuck-detection in semantic-lane */
    semanticLaneWarmingCounter: number
    /** Type-token of the last rendered summary card, used to avoid redundant re-renders */
    lastRenderedTypeToken: number
}
