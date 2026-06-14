// state.ts — canonical runtime state implementation (TypeScript-owned)
// All types previously in types/state.d.ts are now declared and exported here.
// src/lib/state/with-state-mutation.ts provides the mutation guard.

import { CLUSTER_COLORS } from '@lib/utils/design-tokens';
import {
  _isMutatingRef,
  withStateMutation,
  CRITICAL_KEYS_SET,
  TRACKED_SUB_KEYS_SET,
} from '../src/lib/state/with-state-mutation.ts';
import type { WebGLContextState } from '../types/three-engine';

export {
  withStateMutation,
  CRITICAL_KEYS_SET as CRITICAL_KEYS,
  TRACKED_SUB_KEYS_SET as TRACKED_SUB_KEYS,
};

declare global {
  interface Window {
    withStateMutation?: typeof withStateMutation;
    __semanticDevTools?: { deepTrack?: boolean };
    /** Leaflet global loaded at runtime by map-state.ts */
    L?: Record<string, Function>;
    /** Semantic lane cooldown probe scheduler */
    scheduleSemanticLaneCooldownProbe?: (payload: Record<string, unknown>) => void;
    /** Semantic lane assist UI updater */
    updateSemanticLaneAssistUi?: () => void;
    /** Semantic lane cooldown probe timer clearer */
    clearSemanticLaneCooldownProbeTimer?: () => void;
    /** Semantic lane ops summary fetcher */
    fetchSemanticLaneOpsSummary?: () => Promise<unknown>;
    /** Semantic lane ops summary renderer */
    renderSemanticLaneOpsSummary?: (summary: unknown) => void;
  }
}

// ── Type declarations (consolidated from types/state.d.ts) ──────────────

export interface Vector3Like {
    x: number;
    y: number;
    z: number;
    clone?(): Vector3Like;
    copy?(v: Vector3Like): Vector3Like;
    set?(x: number, y: number, z: number): Vector3Like;
    add?(v: Vector3Like): Vector3Like;
    sub?(v: Vector3Like): Vector3Like;
    multiplyScalar?(s: number): Vector3Like;
    normalize?(): Vector3Like;
    lerpVectors?(a: Vector3Like, b: Vector3Like, alpha: number): Vector3Like;
    distanceTo?(v: Vector3Like): number;
    length?(): number;
    lengthSq?(): number;
    setLength?(l: number): Vector3Like;
    toArray?(array?: number[], offset?: number): number[];
    fromArray?(array: number[], offset?: number): Vector3Like;
}

export interface NodePosition {
    x: number;
    y: number;
    z: number;
}

export interface CameraLike {
    position: Vector3Like;
    fov?: number;
    aspect?: number;
    updateProjectionMatrix?(): void;
    lookAt?(x: number, y: number, z: number): void;
}

export interface ControlsLike {
    target: Vector3Like;
    update(): void;
    enabled: boolean;
    autoRotate?: boolean;
    autoRotateSpeed?: number;
    minDistance?: number;
    maxDistance?: number;
    rotateSpeed?: number;
    panSpeed?: number;
    enableDamping?: boolean;
    dampingFactor?: number;
    zoomSpeed?: number;
    enablePan?: boolean;
}

export interface RendererInfoMemory {
    geometries?: number;
    textures?: number;
}

export interface RendererInfo {
    memory: RendererInfoMemory;
    programs?: unknown[];
    render?: { calls?: number; triangles?: number };
}

export interface RendererLike {
    domElement: HTMLCanvasElement;
    render(scene: unknown, camera: unknown): void;
    compile?(scene: unknown, camera: unknown): void;
    setSize?(width: number, height: number): void;
    setPixelRatio?(ratio: number): void;
    dispose?(): void;
    info: RendererInfo;
}

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

export type ViewName = 'galaxy' | 'map' | 'overview';

export type CompassPhase = 'overview' | 'search' | 'focus' | 'inside' | 'map';

export type ThreadSource = 'geometric-fallback' | string | null;

export interface NavFocusPocketMeta {
    active?: boolean;
    viewportProfile?: {
        key?: string;
        targetOffsetLimit?: number;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

export interface NavFocusFramingMeta {
    transitionStyle?: string;
    distance?: number;
    verticalLift?: number;
    framingDrop?: number;
    targetOffset?: unknown;
    duration?: number;
    travelVector?: unknown;
    [key: string]: unknown;
}

export interface NavState {
    mode: string;
    focusedIndex: number | null;
    trailDepth: number;
    trailSeedIndex: number | null;
    trailNeighborIndices: number[];
    trailCursor: number;
    walkHistoryIndices: number[];
    explorationHistoryIndices: number[];
    lastTraversalReason: string | null;
    threadCandidates: ThreadCandidateLike[];
    threadReasonByIndex: Map<number, string>;
    threadSource: ThreadSource;
    focusPocketIndices: number[];
    focusPocketMeta: NavFocusPocketMeta | null;
    focusPocketRoleByIndex: Map<number, string>;
    focusPocketAnimationFrameId: number | null;
    focusFramingMeta: NavFocusFramingMeta | null;
    currentPersonality: Record<string, unknown> | null;
    neighborhoodIndices: number[];
}

export interface CanvasHoverCandidate {
    index?: number;
    screenX?: number;
    screenY?: number;
    source?: string;
    reason?: string;
    [key: string]: unknown;
}

export interface ThreadCandidateLike {
    index: number;
    score: number;
    semanticScore: number;
    sameCity: boolean;
    sameStatus: boolean;
    bridgeScore: number;
    signalScore: number;
    threadType: string;
    relationshipRole: string;
    relationshipAxis: string;
    roleReason: string;
    reason: string;
    source: string;
    [key: string]: unknown;
}

export type LoadingPhaseKey = 'records' | 'scene' | 'restore' | 'launch';

export interface LoadingPhaseMeta {
    progress: number;
    note: string;
    foot: string;
}

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
    myceliumCoreSegments: number;
    myceliumWispySegments: number;
    myceliumBridgeSegments: number;
    drawCalls?: number;
    triangles?: number;
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
    pinned?: boolean;
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

export interface ConstellationMotif {
    label: string;
    directLift: number;
    supportLift: number;
    directPriority: number;
    supportPriority: number;
    braid: number;
}

export type ConstellationMotifName = 'rosette' | 'lattice' | 'delta' | 'market' | 'civic';

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

export interface SemanticNeighbor {
    leadId: string | number;
    semanticScore?: number;
    score?: number;
    bridgeScore?: number;
    sameCity?: boolean;
    threadType?: string;
}

export interface SemanticNode {
    leadId: string;
    neighbors: SemanticNeighbor[];
}

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

/** Shape of state.currentSearchSummary — set by search-state.ts, consumed by map-state, semantic-guide-ui, etc. */
export interface SearchSummary {
    query: string;
    totalMatches: number;
    totalSemanticMatches: number;
    visibleMatches: number;
    anchorIndex: number | null;
    topIndex: number | null;
    resultIndices: number[];
}

export interface SemanticState extends StateConfig {
    /** Allow legacy string-indexed access for Proxy compatibility */
    [key: string]: unknown;
    points: Point[];
    map: unknown;
    markersLayer: unknown;
    mapRouteLayer: unknown;
    mapInitialized: boolean;
    leafletAssetsPromise: Promise<unknown> | null;
    scene: WebGLContextState['scene'];
    camera: CameraLike;
    renderer: RendererLike;
    controls: ControlsLike;
    pointsMesh: WebGLContextState['pointsMesh'];
    pointsMaterial: WebGLContextState['pointsMaterial'];
    nodeSporeMesh: WebGLContextState['nodeSporeMesh'];
    nodeSporeHitMesh: WebGLContextState['nodeSporeHitMesh'];
    nodeSporeMaterial: WebGLContextState['nodeSporeMaterial'];
    rawPositionsBuffer: Float32Array | null;
    rawClustersBuffer: Float32Array | null;
    leadEnrichment: Record<string, unknown> | null;
    myceliumLines: WebGLContextState['myceliumLines'];
    myceliumGroup: WebGLContextState['myceliumGroup'];
    myceliumCoreLines: WebGLContextState['myceliumCoreLines'];
    myceliumWispyLines: WebGLContextState['myceliumWispyLines'];
    myceliumBridgeLines: WebGLContextState['myceliumBridgeLines'];
    focusSemanticLines: WebGLContextState['focusSemanticLines'];
    focusSemanticConnectionPairs: Array<{ a: number; b: number; layer: number }>;
    semanticLensGroup: WebGLContextState['semanticLensGroup'];
    semanticLensGlow: WebGLContextState['semanticLensGlow'];
    semanticLensSpokes: WebGLContextState['semanticLensSpokes'];
    myceliumConnectionPairs: Array<{ a: number; b: number; layer: number }>;
    myceliumDirty: boolean;
    hemiLight: WebGLContextState['hemiLight'];
    dirLight: WebGLContextState['dirLight'];
    scenePerformanceDiagnostics: ScenePerformanceDiagnostics;
    focusFrameDiagnostics: FocusFrameDiagnostics;
    focusThreadDiagnostics: FocusThreadDiagnostics;
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
    nodePositions: NodePosition[];
    targetPositions: NodePosition[];
    originalPositions: NodePosition[];
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
    pointBaseColors: Float32Array | number[] | null;
    hoverHighlightIndex: number;
    hoveredCluster: number | null;
    stableCanvasHover: CanvasHoverCandidate | null;
    lastCanvasNodeHover: CanvasHoverCandidate | null;
    lastCanvasNodePick: CanvasHoverCandidate | null;
    lastCanvasNodeFocusPick: CanvasHoverCandidate | null;
    focusTargetVector: unknown;
    desiredCameraVector: unknown;
    searchTimeout: ReturnType<typeof setTimeout> | null;
    searchAbortController: AbortController | null;
    currentSearchSummary: SearchSummary | null;
    currentEmptyQuery: string | null;
    semanticTrailCue: string;
    applyingUrlState: boolean;
    restoringBrowserHistory: boolean;
    urlStateRestoreToken: number;
    eventListenersInitialized: boolean;
    searchGlowActive: boolean;
    searchGlowRenderStateKey: string;
    searchGlowTopIndex: number | null;
    loadingOverlayStartedAt: number;
    loadingPhaseKey: LoadingPhaseKey;
    navState: NavState;
    activeFilters: ActiveFilters;
    filterVersion: number;
    filterColorVersion: number;
    filterColorStateKey: string;
    registeredEvents: Set<string>;
    activeClusterFilter: number | null;
    activeStoryPrompt: unknown;
    _showAllClusters: boolean;
    myceliumMode: string;
    trailDepth: number;
    MODE_DESCRIPTIONS: Record<string, string>;
    STORY_DESCRIPTIONS: Record<string, string>;
    pointMarkers: unknown[];
    searchRequestSequence: number;
    searchAnchorIndex: number | null;
    searchPreviewIndex: number | null;
    searchGlowIndices: Set<number>;
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
    semanticDiveMode: boolean;
    focusCameraAnimationToken: number;
    focusCameraAssistActive: boolean;
    focusCameraAssistUntil: number;
    focusCameraAssistReason: string;
    focusCameraOffset: Vector3Like | null;
    focusCameraTargetOffset: Vector3Like | null;
    focusPocketMotionByIndex: Map<number, unknown>;
    focusPocketTransitionStartedAt: number;
    focusLens: WebGLContextState['focusLens'];
    focusHalo: WebGLContextState['focusHalo'];
    focusCore: WebGLContextState['focusCore'];
    focusMoteGroup: WebGLContextState['focusMoteGroup'];
    focusMotes: WebGLContextState['focusMotes'];
    focusPetalGroup: WebGLContextState['focusPetalGroup'];
    focusPetals: WebGLContextState['focusPetals'];
    focusFilaments: WebGLContextState['focusFilaments'];
    focusAnchorGroup: WebGLContextState['focusAnchorGroup'];
    focusAnchorRingMesh: WebGLContextState['focusAnchorRingMesh'];
    focusAnchorHaloSprite: WebGLContextState['focusAnchorHaloSprite'];
    hoverHalo: WebGLContextState['hoverHalo'];
    focusBeaconTexture: WebGLContextState['focusBeaconTexture'];
    focusRingTexture: WebGLContextState['focusRingTexture'];
    focusNextCueTexture: WebGLContextState['focusNextCueTexture'];
    semanticManifold: WebGLContextState['semanticManifold'];
    routeTraceLines: WebGLContextState['routeTraceLines'];
    arrivalHandoffGroup: WebGLContextState['arrivalHandoffGroup'];
    routeTraceConnectionPairs: Array<{ a: number; b: number; layer: number }>;
    routeTraceRenderStateKey: string;
    routeTraceDiagnostics: RouteTraceDiagnostics;
    inspectedStrandGroup: WebGLContextState['inspectedStrandGroup'];
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
    _deferredUrlState: { params: Record<string, string>; timestamp: number } | null;
    _deferredUrlStateHandler: EventListener | null;
    focusedNode: number | null;
    /** Deadline timestamp (ms) for the semantic-dive entry transition animation */
    _semanticDiveTransitionDeadline: number;
    /** Consecutive warming-probe count for stuck-detection in semantic-lane */
    semanticLaneWarmingCounter: number;
    /** Type-token of the last rendered summary card, used to avoid redundant re-renders */
    lastRenderedTypeToken: number;
}

export const _rawState: SemanticState = {
    // ==== SCENE / THREE.JS ====
    points: [],
    map: null,
    markersLayer: null,
    mapRouteLayer: null,
    mapInitialized: false,
    leafletAssetsPromise: null,
    scene: null as unknown as SemanticState['scene'],
    camera: null as unknown as CameraLike,
    renderer: null as unknown as RendererLike,
    controls: null as unknown as ControlsLike,
    pointsMesh: null as unknown as SemanticState['pointsMesh'],
    pointsMaterial: null as unknown as SemanticState['pointsMaterial'],
    nodeSporeMesh: null as unknown as SemanticState['nodeSporeMesh'],
    nodeSporeHitMesh: null as unknown as SemanticState['nodeSporeHitMesh'],
    nodeSporeMaterial: null as unknown as SemanticState['nodeSporeMaterial'],
    rawPositionsBuffer: null,
    rawClustersBuffer: null,
    leadEnrichment: null,
    myceliumLines: null as unknown as SemanticState['myceliumLines'],
    myceliumGroup: null as unknown as SemanticState['myceliumGroup'],
    myceliumCoreLines: null as unknown as SemanticState['myceliumCoreLines'],
    myceliumWispyLines: null as unknown as SemanticState['myceliumWispyLines'],
    myceliumBridgeLines: null as unknown as SemanticState['myceliumBridgeLines'],
    focusSemanticLines: null as unknown as SemanticState['focusSemanticLines'],
    focusSemanticConnectionPairs: [],
    semanticLensGroup: null as unknown as SemanticState['semanticLensGroup'],
    semanticLensGlow: null as unknown as SemanticState['semanticLensGlow'],
    semanticLensSpokes: null as unknown as SemanticState['semanticLensSpokes'],
    myceliumConnectionPairs: [],
    myceliumDirty: true,
    hemiLight: null as unknown as SemanticState['hemiLight'],
    dirLight: null as unknown as SemanticState['dirLight'],

    // ==== PERFORMANCE DIAGNOSTICS ====
    scenePerformanceDiagnostics: { active: false, reason: 'not-sampled', lastFrameAt: 0, sampleCount: 0, avgFrameMs: 0, maxFrameMs: 0, avgUpdateMs: 0, maxUpdateMs: 0, avgRenderMs: 0, maxRenderMs: 0, avgControlsMs: 0, avgNodeMotionMs: 0, avgThreadUpdateMs: 0, avgGlowMs: 0, avgLensMs: 0, myceliumCoreSegments: 0, myceliumWispySegments: 0, myceliumBridgeSegments: 0 },
    focusFrameDiagnostics: { lastFrameAt: 0, sampleCount: 0, avgFrameMs: 0, maxFrameMs: 0 },
    focusThreadDiagnostics: { active: false, reason: 'not-built', edgeCount: 0, directEdgeCount: 0, supportEdgeCount: 0, subduedEdgeCount: 0, segmentCount: 0, vertexCount: 0, overlayNodeCount: 0, nextCueSegments: 0, denseBundleMode: false, buildMs: 0, avgFrameMs: 0, maxFrameMs: 0 },

    // ==== SEMANTIC THREAD ARTIFACT ====
    semanticThreadBundle: null,
    semanticThreadArtifactName: null,
    semanticSpaceLayoutManifest: null,
    semanticSpaceLayoutStatus: 'idle',
    semanticSpaceLayoutError: null,
    semanticNeighborMapByLeadId: new Map<string, SemanticNode>(),
    semanticThreadsLoadPromise: null,
    semanticThreadsStatus: 'idle',
    semanticThreadsRetryAttempt: 0,
    semanticThreadsRetryTimer: null,
    dataLoadAttempt: 0,

    // ==== CONFIGURATION CONSTANTS ====
    MAP_HANDOFF_PRELUDE_MS: 430,
    VIEW_HANDOFF_OUT_MS: 1200,
    TERRAIN_LANDING_SETTLE_MS: 1200,
    TERRAIN_LANDING_SETTLE_LONG_MS: 1800,
    SHOW_VIEW_HANDOFF_DISMISS_MS: 2200,
    MAP_TRAIL_REFRESH_LATE_DELAY_MS: 100,
    AUTO_ROTATE_IDLE_MS: 3600,
    AUTO_ROTATE_MANUAL_IDLE_MS: 5200,
    AUTO_ROTATE_SOFT_RESUME_MS: 1800,
    AUTO_ROTATE_BASE_SPEED: 0.34,
    MOBILE_ROUTE_FIELD_PEEK_MS: 1550,
    SELECTED_CARD_FADE_MS: 180,
    ORBIT_MIN_DISTANCE_DEFAULT: 0.5,
    ORBIT_MIN_DISTANCE_INSIDE: 0.24,
    ORBIT_MAX_DISTANCE_DEFAULT: 5.5,
    ORBIT_MAX_DISTANCE_FREE: 6.8,
    ORBIT_ROTATE_SPEED_DEFAULT: 0.6,
    ORBIT_ROTATE_SPEED_FREE: 0.82,
    ORBIT_PAN_SPEED_DEFAULT: 0.5,
    ORBIT_PAN_SPEED_FREE: 0.68,
    SEARCH_TRAIL_CUE_MIN_DWELL_MS: 920,
    JOURNEY_COMPASS_PHASE_ORDER: ['overview', 'search', 'focus', 'inside', 'map'],
    FOCUS_CONSTELLATION_MOTIFS: {
        rosette: {
            label: 'semantic rosette',
            directLift: 0.82,
            supportLift: 0.46,
            directPriority: 0.78,
            supportPriority: 0.36,
            braid: 0.72
        },
        lattice: {
            label: 'trade lattice',
            directLift: 0.58,
            supportLift: 0.3,
            directPriority: 0.72,
            supportPriority: 0.42,
            braid: 0.5
        },
        delta: {
            label: 'county delta',
            directLift: 0.7,
            supportLift: 0.38,
            directPriority: 0.74,
            supportPriority: 0.34,
            braid: 0.62
        },
        market: {
            label: 'market ring',
            directLift: 0.64,
            supportLift: 0.36,
            directPriority: 0.7,
            supportPriority: 0.32,
            braid: 0.58
        },
        civic: {
            label: 'civic orbit',
            directLift: 0.62,
            supportLift: 0.34,
            directPriority: 0.68,
            supportPriority: 0.3,
            braid: 0.54
        }
    },
    SCENE_REVEAL_DURATION_MS: 1650,
    LOADING_MIN_VISIBLE_MS: 1320,
    POINTS_MATERIAL_BASE_SIZE: 0.03,
    POINTS_MATERIAL_BASE_OPACITY: 1.0,
    FOCUS_THREAD_SEGMENTS: 16,
    HOVER_LOCK_CONFIRM_MS: 80,
    HOVER_SAMPLE_MS: 24,
    LEAFLET_CSS_URL: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    LEAFLET_JS_URL: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',

    // ==== COLORS / CLUSTER NAMES ====
    COLORS: CLUSTER_COLORS,
    CLUSTER_NAMES: [
        'General Business', 'Professional Services', 'Food & Hospitality', 'Construction & Trades',
        'Retail & Shops', 'Beauty & Wellness', 'Real Estate & Property', 'Industrial & Logistics',
        'Agriculture & Ranching', 'Automotive', 'Healthcare & Medical', 'Therapy & Counseling',
        'Education & Childcare', 'Churches', 'Faith Ministries', 'Community Nonprofits',
        'Foundations', 'Arts & Culture', 'Economic Development', 'Public Agencies', 'Enterprise Brands'
    ],

    // ==== LOADING PHASE META ====
    LOADING_PHASE_META: {
        records: { progress: 0.2, note: 'Gathering records...', foot: 'County records are arriving first.' },
        scene: { progress: 0.48, note: 'Raising the cloud...', foot: 'Shaping the scene.' },
        restore: { progress: 0.76, note: 'Restoring view...', foot: 'Restoring last known path.' },
        launch: { progress: 1, note: 'Awake.', foot: 'Threads are live.' }
    },

    // ==== POSITION / GEOMETRY STATE ====
    nodePositions: [],
    targetPositions: [],
    originalPositions: [],
    currentView: 'galaxy',
    autoRotate: false,
    autoRotateSuspended: false,
    weather: null,
    weatherInitialized: false,
    clockTimer: null,
    selectedPoint: null,
    rippleActive: false,
    rippleStartTime: 0,
    bloomPulseStartTime: 0,
    bridgePulseStartTime: 0,
    rippleCenter: null,
    pointColorStateVersion: 0,
    pulsePhase: 0,
    nodesAreSettling: false,
    _settlingMaxDelta: 0,
    _settlingWatchdogStartedAt: null,
    _settlingLowFrames: 0,
    pointBaseColors: null,
    hoverHighlightIndex: -1,
    hoveredCluster: null,
    stableCanvasHover: null,
    lastCanvasNodeHover: null,
    lastCanvasNodePick: null,
    lastCanvasNodeFocusPick: null,
    focusTargetVector: null,
    desiredCameraVector: null,
    searchTimeout: null,
    searchAbortController: null,
    currentSearchSummary: null,
    currentEmptyQuery: null,
    semanticTrailCue: 'idle',
    applyingUrlState: false,
    restoringBrowserHistory: false,
    urlStateRestoreToken: 0,
    eventListenersInitialized: false,
    searchGlowActive: false,
    searchGlowRenderStateKey: '',
    loadingOverlayStartedAt: 0,
    loadingPhaseKey: 'records',
    navState: {
        mode: 'overview',
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
        focusPocketAnimationFrameId: null,
        focusFramingMeta: null,
        currentPersonality: null,
        neighborhoodIndices: []
    } satisfies NavState,
    activeFilters: {
        status: 'all',
        city: 'all',
        website: false,
        email: false,
        geocoded: false
    },

    // ==== FILTER / MODE STATE ====
    filterVersion: 0,
    filterColorVersion: 0,
    filterColorStateKey: '',
    registeredEvents: new Set<string>(),
    activeClusterFilter: null,
    activeStoryPrompt: null,
    _showAllClusters: true,
    myceliumMode: 'default',
    trailDepth: 0,
    MODE_DESCRIPTIONS: {},
    STORY_DESCRIPTIONS: {},
    pointMarkers: [],

    // ==== SEARCH / SEMANTIC LANE STATE ====
    searchRequestSequence: 0,
    searchAnchorIndex: null,
    searchPreviewIndex: null,
    searchGlowIndices: new Set(),
    searchGlowTopIndex: null,
    searchFocusTransitionToken: 0,
    searchPreviewHoverTimer: null,
    searchVectorScrambleInterval: null,
    searchVectorScrambleTimer: null,
    compactSearchRevealToken: 0,
    compactSearchRevealTimers: [],
    mobileRouteFieldPeekTimer: null,
    mobileRouteFieldPeekToken: 0,
    semanticLaneMonitorTimer: null,
    semanticLaneProbePromise: null,
    semanticLaneOpsMode: false,
    semanticLaneOpsFetchPromise: null,
    semanticLaneOpsRefreshTimer: null,
    semanticLanePendingWarm: false,
    semanticLaneState: 'checking',
    semanticLaneSnapshot: null,
    semanticSearchResultCache: new Map<string, unknown>(),
    semanticSearchCacheDiagnostics: {
        hits: 0, misses: 0, stores: 0, evictions: 0,
        lastKey: null, lastSource: null, lastAgeMs: null
    },
    semanticResultContextByLeadId: new Map<string, unknown>(),
    semanticGuideAbortController: null,
    semanticGuideRequestSequence: 0,
    semanticTrailStoryAbortController: null,
    semanticTrailStoryRequestSequence: 0,
    currentSemanticGuide: null,
    summaryCardTypeToken: 0,

    // ==== ANIMATION / ROUTE STATE ====
    autoRotateResumeTimer: null,
    autoRotateResumeDueAt: 0,
    autoRotateSoftResumeStartedAt: 0,
    sceneRevealActive: false,
    sceneRevealStartedAt: 0,
    sceneRevealCameraStart: null,
    sceneRevealCameraEnd: null,
    routeCameraAnimationToken: 0,
    viewHandoffTimer: null,
    viewSwitchPreludeTimer: null,
    terrainHandoffTimer: null,
    terrainHandoffState: {
        phase: 'idle', from: 'overview', to: 'galaxy', routeCount: 0, startedAt: 0
    },
    routeExplorationState: { phase: 'idle', reason: '', startedAt: 0 },
    routeChoreographyState: {
        phase: 'overview', reason: 'initial', startedAt: 0,
        anchorIndex: null, indexCount: 0, lastCameraMove: null
    },
    experienceResetToastTimer: null,

    // ==== FOCUS / THREAD / ROUTE DIAGNOSTIC STATE ====
    semanticDiveMode: false,
    focusCameraAnimationToken: 0,
    focusCameraAssistActive: false,
    focusCameraAssistUntil: 0,
    focusCameraAssistReason: 'idle',
    focusCameraOffset: null,
    focusCameraTargetOffset: null,
    focusPocketMotionByIndex: new Map<number, unknown>(),
    focusPocketTransitionStartedAt: 0,
    focusLens: null as unknown as SemanticState['focusLens'],
    focusHalo: null as unknown as SemanticState['focusHalo'],
    focusCore: null as unknown as SemanticState['focusCore'],
    focusMoteGroup: null as unknown as SemanticState['focusMoteGroup'],
    focusMotes: [],
    focusPetalGroup: null as unknown as SemanticState['focusPetalGroup'],
    focusPetals: [],
    focusFilaments: null as unknown as SemanticState['focusFilaments'],
    focusAnchorGroup: null as unknown as SemanticState['focusAnchorGroup'],
    focusAnchorRingMesh: null as unknown as SemanticState['focusAnchorRingMesh'],
    focusAnchorHaloSprite: null as unknown as SemanticState['focusAnchorHaloSprite'],
    hoverHalo: null as unknown as SemanticState['hoverHalo'],
    focusBeaconTexture: null as unknown as SemanticState['focusBeaconTexture'],
    focusRingTexture: null as unknown as SemanticState['focusRingTexture'],
    focusNextCueTexture: null as unknown as SemanticState['focusNextCueTexture'],
    semanticManifold: null as unknown as SemanticState['semanticManifold'],
    routeTraceLines: null as unknown as SemanticState['routeTraceLines'],
    arrivalHandoffGroup: null as unknown as SemanticState['arrivalHandoffGroup'],
    routeTraceConnectionPairs: [],
    routeTraceRenderStateKey: '',
    routeTraceDiagnostics: {
        active: false, reason: 'not-built', phase: 'overview',
        indexCount: 0, edgeCount: 0, segmentCount: 0,
        anchorIndex: null, mapPointCount: 0, mapPathActive: false
    },
    inspectedStrandGroup: null as unknown as SemanticState['inspectedStrandGroup'],
    inspectedThreadIndex: null,
    pinnedThreadIndex: null,
    canvasThreadInspectionClearTimer: null,
    threadInspectorPointerInside: false,
    inspectedStrandDiagnostics: {
        active: false, source: 'none', index: null, focusedIndex: null,
        segmentCount: 0, braidCount: 0, endpointCount: 0
    },
    arrivalHandoffDiagnostics: {
        active: false, fromIndex: null, targetIndex: null, phase: 'idle',
        segmentCount: 0, endpointCount: 0, opacity: 0
    },
    strandContinuityState: {
        phase: 'idle', targetIndex: null, fromIndex: null, reason: '',
        startedAt: 0, arrivalTimeoutId: undefined, settleTimeoutId: undefined
    },
    focusOrbitSlackState: {
        phase: 'idle', reason: '', startedAt: 0,
        targetShift: 0, cameraShift: 0, distanceBefore: 0, distanceAfter: 0,
        maxDistance: 5.5, rotateSpeed: 0.6, panSpeed: 0.5
    },
    focusTransitionMode: 'idle',
    focusTransitionStartedAt: 0,
    focusTransitionSettleTimer: null,
    recentArrangements: [],
    signalScores: [],
    bridgeScores: [],
    bloomIndices: new Set(),
    bridgeIndices: new Set(),
    trailIndices: new Set(),
    projectedNeighborGrid: null,
    projectedNeighborCache: new Map<number, unknown>(),
    pointIndexByLeadId: new Map<string | number, number>(),
    deferredHydrationStarted: false,
    _deferredUrlState: null,
    _deferredUrlStateHandler: null,
    focusedNode: null,
    _semanticDiveTransitionDeadline: 0,
    semanticLaneWarmingCounter: 0,
    lastRenderedTypeToken: 0,
    lastSuccessfulFetch: null
};

let _devWarned: Set<string> | null = null;
let _devProxyCache: WeakMap<object, unknown> | null = null;
let _prodProxyCache: WeakMap<object, unknown> | null = null;
let _devTrackingActive = false;

if (typeof window !== 'undefined') {
    window.withStateMutation = withStateMutation;
}

// Helper: derive the top-level key from a dotted path (e.g., "state.navState" -> "navState",
// "state.navState.focusPocketMeta" -> "navState") so the nested Proxy can check CRITICAL_KEYS.
function _getTopKey(path: string): string {
  if (!path || typeof path !== 'string') return '';
  const stripped = path.startsWith('state.') ? path.slice(6) : path;
  const dot = stripped.indexOf('.');
  return dot === -1 ? stripped : stripped.slice(0, dot);
}

// Production nested Proxy factory: returns a nested Proxy for TRACKED_SUB_KEYS
// that enforces the same CRITICAL_KEYS guard as the top-level set trap.
function _makeProdProxy(obj: Record<string, unknown>, path: string): unknown {
  if (!obj || typeof obj !== 'object' || obj instanceof Set || obj instanceof Map
      || obj instanceof Date || obj instanceof RegExp) return obj;
  if (_prodProxyCache?.has(obj)) return _prodProxyCache.get(obj);
  const topKey = _getTopKey(path);
  const isCritical = CRITICAL_KEYS_SET.has(topKey);
  const proxy = new Proxy(obj, {
    set(t, p, v, r) {
      if (!_isMutatingRef.value) {
        const k = path + '.' + String(p);
        if (isCritical) {
          throw new Error(`[State Error] Illegal direct mutation of critical sub-property '${k}'. You must use withStateMutation() to modify core state.`);
        }
        // Soft warning silenced 2026-06-12: the throw-error path above already
        // protects CRITICAL_KEYS, and legacy paths (e.g. journey-thread-settler
        // writing to strandContinuityState.arrivalTimeoutId) intentionally write
        // sub-properties outside withStateMutation. The top-level wholesale
        // reassignment warning (line ~1096) catches real "should use store.update()"
        // cases; this soft warning was dev-only noise. See commits 636d9f2+ for context.
      }
      return Reflect.set(t, p, v, r);
    },
    get(t, p) {
      const key = String(p);
      const v = t[key];
      if (v && typeof v === 'object' && !(v instanceof Set) && !(v instanceof Map)
          && !(v instanceof Date) && !(v instanceof RegExp)) {
        return _makeProdProxy(v as Record<string, unknown>, path + '.' + key);
      }
      return v;
    }
  });
  _prodProxyCache!.set(obj, proxy);
  return proxy;
}

// Proxy uses dynamic property access incompatible with strict SemanticState indexing;
// handler body is intentionally untyped at the parameter level.
export const state: SemanticState = new Proxy(_rawState, {
    set(target: any, prop: any, value: any, receiver: any) {
    if (CRITICAL_KEYS_SET.has(String(prop)) && !_isMutatingRef.value) {
      throw new Error(`[State Error] Illegal direct mutation of critical property '${String(prop)}'. You must use withStateMutation() to modify core state.`);
    }
    if (TRACKED_SUB_KEYS_SET.has(String(prop)) && !_isMutatingRef.value && _devWarned) {
      const k = 'state.' + String(prop);
      if (_devWarned && !_devWarned.has(k)) {
        console.warn('[State Bypass] ' + k + ' — wholesale reassignment detected; use store .update()');
        _devWarned!.add(k);
      }
    }
    if (prop === 'semanticDiveMode') {
      target.trailDepth = value === true ? 2 : 0;
      return true;
    }
    if (prop === 'focusedNode') {
      if (target.navState) {
        target.navState.focusedIndex = value;
      }
      return true;
    }
    return Reflect.set(target, prop, value, receiver);
  },
    get(target: any, prop: any) {
    if (prop === 'semanticDiveMode') {
      return target.trailDepth === 2;
    }
    if (prop === 'focusedNode') {
      return target.navState?.focusedIndex ?? null;
    }
    const value = target[String(prop)];
    if (!_devTrackingActive && TRACKED_SUB_KEYS_SET.has(String(prop)) && value && typeof value === 'object') {
      return _makeProdProxy(value as Record<string, unknown>, 'state.' + String(prop));
    }
    return value;
  }
});

if (typeof window !== 'undefined') {
  _devWarned = new Set();
  _prodProxyCache = new WeakMap();
  const _hostname = window.location?.hostname;
  const isDev = (_hostname === 'localhost' || _hostname === '127.0.0.1')
    || window.__semanticDevTools?.deepTrack;
  if (isDev) {
    _devTrackingActive = true;
    _devProxyCache = new WeakMap();
    let _mapSetWarned = false;
    const _track = (obj: unknown, path: string): unknown => {
      if (!obj || typeof obj !== 'object') return obj;
      if (obj instanceof Set || obj instanceof Map) {
        if (!_mapSetWarned) {
          console.warn('[State] Map/Set instances in TRACKED_SUB_KEYS are not deep-tracked. '
            + 'Mutations to .set/.delete/.add bypass the Proxy.');
          _mapSetWarned = true;
        }
        return obj;
      }
      if (_devProxyCache?.has(obj)) return _devProxyCache.get(obj);
      const proxy = new Proxy(obj as Record<string, unknown>, {
        set(t: any, p: any, v: any) {
          // Deep-track dev proxy — sub-property warning silenced 2026-06-12.
          // This proxy only exists on localhost / __semanticDevTools.deepTrack
          // and emitted a [State Bypass] warning for EVERY sub-property write,
          // including correct ones from legacy code paths. The prod proxy
          // (above) and the top-level wholesale-reassignment warning catch
          // real bypasses; this dev-only noise was redundant.
          t[String(p)] = v; return true;
        },
        get(t: any, p: any) {
          if (p === '__target__') return t;
          const key = String(p);
          const v = t[key];
          if (v && typeof v === 'object' && !(v instanceof Set) && !(v instanceof Map)) return _track(v, path + '.' + key);
          return v;
        }
      });
      _devProxyCache!.set(obj, proxy);
      return proxy;
    };
    const _trackSub = (key: string) => {
      const raw = _rawState as unknown as Record<string, unknown>;
      if (raw[key] !== null && raw[key] !== undefined) raw[key] = _track(raw[key], 'state.' + key);
    };
    TRACKED_SUB_KEYS_SET.forEach(_trackSub);
  }
}
