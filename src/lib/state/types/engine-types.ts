/**
 * @lib/state/types/engine-types.ts — Engine and performance diagnostic types.
 *
 * Extracted from state-types.ts (W13-T5b) to reduce file size.
 * Contains scene performance diagnostics, focus/thread diagnostics,
 * route/strand state, and the SemanticState interface.
 */

import type { WebGLContextState } from '@lib/engine/webgl-context'
import type { SemanticNeighborEntry, SemanticThreadBundle } from '@lib/types/business'
import type { WeatherData } from '@lib/utils/weather'
import type { SpatialGrid } from '@lib/journey/thread-model'
import type { PocketMotionWithFrame } from '@lib/types/state'
import type { NavState, ActiveFilters } from '@lib/types/state'
import type { Vector3Like, NodePosition, Point, StateConfig, LoadingPhaseKey } from './core-types'
import type { SearchSummary, SearchErrorData } from './search-types'

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
    renderables?: ReturnType<typeof import('@lib/engine/renderer/renderer-diagnostics').getSceneRenderableDiagnostics>
    /** W49-H: total frames where the conditional-skip helper returned true. */
    renderSkipOpportunities?: number
    /** W49-H: consecutive frames skipped at the current run. Resets when a render fires. */
    consecutiveSkippedFrames?: number
}
/** A single segment in the focus-stage semantic thread rendering.
 *  Each parent edge (a → b) is subdivided into many segments so the
 *  GLSL shader can vary `progress` / `cue` per segment without rebuilding
 *  the geometry. The runtime pushes these directly via semantic-overlay.ts
 *  and reads them back in updateFocusSemanticOverlayPositions. */
export interface FocusConnectionSegment {
    a: number
    b: number
    layer?: number
    t0?: number
    t1?: number
    cue?: number
    side?: number
    rise?: number
    depth?: number
    curveLift?: number
    motifBraid?: number
    anchorPull?: number
    role?: string
    priority?: number
    motif?: string
    label?: string
    directLift?: number
    supportLift?: number
    directPriority?: number
    supportPriority?: number
    braid?: number
    boundedLoop?: boolean
    motifLabel?: { name?: string; description?: string }
    [key: string]: unknown
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
    parentKind?: 'mycelium' | 'scene'
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

// W53 follow-up to 9f2c326c: previously only a re-export (`export type { X } from 'm'`),
// which does NOT create a local binding — so the local usage at `strandContinuityState:
// StrandContinuityState` below errored with `Cannot find name 'StrandContinuityState'`.
// Split into a local `import type` + plain re-export so the name binds locally.
import type { StrandContinuityState } from '@lib/types/state'
export type { StrandContinuityState }

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

// ── Canonical type re-exports ────────────────────────────────────────────────
// `NavState` and `ActiveFilters` are defined ONCE in `@lib/types/state` (the
// canonical app-state type surface). This module previously carried divergent
// duplicate interfaces; they are now re-exported so existing importers
// (legacy-state.ts, mutators.ts, engine/map-state.ts) resolve to the single
// source of truth without edits. See tmp/bugsweep-2026-07-07 fix plan.
export type { NavState, ActiveFilters } from '@lib/types/state'

/**
 * @lib/state/types/engine-types.ts — SemanticState interface
 *
 * The full application state surface including engine scene graph,
 * search state, focus state, trail state, and all rendering state.
 */
export interface SemanticState extends StateConfig {
    /** Allow legacy string-indexed access for Proxy compatibility */
    [key: string]: unknown
    points: Point[]
    map: LeafletLayer
    markersLayer: LeafletLayer
    mapRouteLayer: LeafletLayer
    mapInitialized: boolean
    leafletAssetsPromise: Promise<unknown> | null
    scene: WebGLContextState['scene']
    camera: CameraLike
    renderer: RendererLike
    controls: ControlsLike
    pointsMesh: WebGLContextState['pointsMesh']
    pointsMaterial: WebGLContextState['pointsMaterial']
    nodeSporeMesh: WebGLContextState['nodeSporeMesh']
    nodeSporeMaterial: WebGLContextState['nodeSporeMaterial']
    rawPositionsBuffer: Float32Array | null
    rawClustersBuffer: Uint16Array | null
    leadEnrichment: Record<string, unknown> | null
    myceliumGroup: WebGLContextState['myceliumGroup']
    myceliumCoreLines: WebGLContextState['myceliumCoreLines']
    myceliumWispyLines: WebGLContextState['myceliumWispyLines']
    myceliumBridgeLines: WebGLContextState['myceliumBridgeLines']
    focusSemanticLines: WebGLContextState['focusSemanticLines']
    focusSemanticConnectionPairs: Array<FocusConnectionSegment>
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
    semanticThreadBundle: SemanticThreadBundle | null
    semanticThreadArtifactName: string | null
    semanticSpaceLayoutManifest: unknown
    semanticSpaceLayoutStatus: string
    semanticSpaceLayoutError: string | null
    semanticNeighborMapByLeadId: Map<string, SemanticNeighborEntry>
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
    weather: WeatherData | null
    weatherInitialized: boolean
    clockTimer: ReturnType<typeof setTimeout> | null
    selectedPoint: Point | null
    rippleActive: boolean
    rippleStartTime: number
    bloomPulseStartTime: number
    bridgePulseStartTime: number
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
    searchState: {
        currentSearchSummary: SearchSummary | null
        currentEmptyQuery: string | null
        semanticTrailCue: string
        searchGlowActive: boolean
        searchGlowRenderStateKey: string
        searchGlowTopIndex: number | null
        searchGlowIndices: Set<number>
        isSearching: boolean
        searchError: SearchErrorData | null
        searchVisibleCount: number
    }
    applyingUrlState: boolean
    restoringBrowserHistory: boolean
    urlStateRestoreToken: number
    eventListenersInitialized: boolean
    loadingOverlayStartedAt: number
    loadingPhaseKey: LoadingPhaseKey
    navState: NavState
    activeFilters: ActiveFilters
    filterVersion: number
    filterColorVersion: number
    filterColorStateKey: string
    registeredEvents: Set<string>
    activeClusterFilter: number | null
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
    mobileRoutePeekActive: boolean
    mobileRoutePeekReason: string
    semanticLaneMonitorTimer: ReturnType<typeof setTimeout> | null
    semanticLaneProbePromise: Promise<unknown> | null
    semanticLaneOpsMode: boolean
    semanticLaneOpsFetchPromise: Promise<unknown> | null
    semanticLaneOpsRefreshTimer: ReturnType<typeof setTimeout> | null
    semanticLanePendingWarm: boolean
    semanticLaneState: string
    semanticLaneSnapshot: unknown
    semanticResultContextByLeadId: Map<string, unknown>
    semanticGuideAbortController: AbortController | null
    semanticGuideRequestSequence: number
    semanticTrailStoryAbortController: AbortController | null
    semanticTrailStoryRequestSequence: number
    /**
     * Plain-text semantic guide payload. Distinct from GuideConfig (object shape
     * with .title/.text/.suggestions) — this field is the source of truth for
     * the simple text-only guide state set by setSemanticGuide(text).
     *
     * GuideConfig objects belong in appState.semanticGuideState.config — see
     * showSummaryCard() in semantic-guide.ts. Mixing the two shapes here caused
     * a latent dual-write bug (W48 fix in currentSemanticGuide-locked-test
     * shipped the reconciliation).
     */
    currentSemanticGuide: string | null
    summaryCardTypeToken: number
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
    pocketMotionByIndex: Map<number, PocketMotionWithFrame>
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
    semanticManifold: WebGLContextState['semanticManifold']
    routeTraceLines: WebGLContextState['routeTraceLines']
    arrivalHandoffGroup: WebGLContextState['arrivalHandoffGroup']
    routeTraceConnectionPairs: Array<{ a: number; b: number; side: number }>
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
    projectedNeighborGrid: SpatialGrid | null
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

/**
 * Structural type for Leaflet map layer objects (L.Map, L.LayerGroup).
 * Leaflet is loaded via CDN (not npm-imported), so we can't reference
 * its types directly. This type documents the shape consumers expect
 * and matches the local cast in engine/map-state.ts.
 */
type LeafletLayer = Record<string, unknown> | null

// Re-import local types used by SemanticState (not exported, just used inline)
import type { CameraLike, ControlsLike, RendererLike, CanvasHoverCandidate } from './core-types'
import type { ViewName } from './core-types'
