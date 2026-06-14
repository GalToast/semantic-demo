// app.svelte.ts — Svelte 5 rune-class parallel artifact for the state kernel.
// Ticket W11-T1: strangler-fig foundation. The class mirrors all 289 fields
// of js/state.ts's _rawState as $state properties. The legacy file stays untouched.

import type {
  SemanticState,
  NavState,
  ActiveFilters,
  ViewName,
  ClusterName,
  Point,
  NodePosition,
  CompassPhase,
  ThreadSource,
  RouteExplorationState,
  RouteChoreographyState,
  TerrainHandoffState,
  StrandContinuityState,
  FocusOrbitSlackState,
  InspectedStrandDiagnostics,
  ArrivalHandoffDiagnostics,
  RouteTraceDiagnostics,
  ScenePerformanceDiagnostics,
  FocusFrameDiagnostics,
  FocusThreadDiagnostics,
  SemanticSearchCacheDiagnostics,
  CanvasHoverCandidate,
  LoadingPhaseKey,
  CameraLike,
  RendererLike,
  ControlsLike,
  Vector3Like,
  SearchSummary,
  SemanticNode,
} from '../../../js/state';
import { CLUSTER_COLORS } from '../engine/design-tokens';
import { withStateMutation } from './with-state-mutation';

// ── App State class ─────────────────────────────────────────────────────────

class AppState {
  // ==== SCENE / THREE.JS ====
  points = $state<Point[]>([]);
  map = $state<unknown>(null);
  markersLayer = $state<unknown>(null);
  mapRouteLayer = $state<unknown>(null);
  mapInitialized = $state<boolean>(false);
  leafletAssetsPromise = $state<Promise<unknown> | null>(null);
  scene = $state<SemanticState['scene']>(null as unknown as SemanticState['scene']);
  camera = $state<CameraLike>(null as unknown as CameraLike);
  renderer = $state<RendererLike>(null as unknown as RendererLike);
  controls = $state<ControlsLike>(null as unknown as ControlsLike);
  pointsMesh = $state<SemanticState['pointsMesh']>(null as unknown as SemanticState['pointsMesh']);
  pointsMaterial = $state<SemanticState['pointsMaterial']>(null as unknown as SemanticState['pointsMaterial']);
  nodeSporeMesh = $state<SemanticState['nodeSporeMesh']>(null as unknown as SemanticState['nodeSporeMesh']);
  nodeSporeHitMesh = $state<SemanticState['nodeSporeHitMesh']>(null as unknown as SemanticState['nodeSporeHitMesh']);
  nodeSporeMaterial = $state<SemanticState['nodeSporeMaterial']>(null as unknown as SemanticState['nodeSporeMaterial']);
  rawPositionsBuffer = $state<Float32Array | null>(null);
  rawClustersBuffer = $state<Float32Array | null>(null);
  leadEnrichment = $state<Record<string, unknown> | null>(null);
  myceliumLines = $state<SemanticState['myceliumLines']>(null as unknown as SemanticState['myceliumLines']);
  myceliumGroup = $state<SemanticState['myceliumGroup']>(null as unknown as SemanticState['myceliumGroup']);
  myceliumCoreLines = $state<SemanticState['myceliumCoreLines']>(null as unknown as SemanticState['myceliumCoreLines']);
  myceliumWispyLines = $state<SemanticState['myceliumWispyLines']>(null as unknown as SemanticState['myceliumWispyLines']);
  myceliumBridgeLines = $state<SemanticState['myceliumBridgeLines']>(null as unknown as SemanticState['myceliumBridgeLines']);
  focusSemanticLines = $state<SemanticState['focusSemanticLines']>(null as unknown as SemanticState['focusSemanticLines']);
  focusSemanticConnectionPairs = $state<Array<{ a: number; b: number; layer: number }>>([]);
  semanticLensGroup = $state<SemanticState['semanticLensGroup']>(null as unknown as SemanticState['semanticLensGroup']);
  semanticLensGlow = $state<SemanticState['semanticLensGlow']>(null as unknown as SemanticState['semanticLensGlow']);
  semanticLensSpokes = $state<SemanticState['semanticLensSpokes']>(null as unknown as SemanticState['semanticLensSpokes']);
  myceliumConnectionPairs = $state<Array<{ a: number; b: number; layer: number }>>([]);
  myceliumDirty = $state<boolean>(true);
  hemiLight = $state<SemanticState['hemiLight']>(null as unknown as SemanticState['hemiLight']);
  dirLight = $state<SemanticState['dirLight']>(null as unknown as SemanticState['dirLight']);

  // ==== PERFORMANCE DIAGNOSTICS ====
  scenePerformanceDiagnostics = $state<ScenePerformanceDiagnostics>({
    active: false, reason: 'not-sampled', lastFrameAt: 0, sampleCount: 0, avgFrameMs: 0, maxFrameMs: 0, avgUpdateMs: 0, maxUpdateMs: 0, avgRenderMs: 0, maxRenderMs: 0, avgControlsMs: 0, avgNodeMotionMs: 0, avgThreadUpdateMs: 0, avgGlowMs: 0, avgLensMs: 0, myceliumCoreSegments: 0, myceliumWispySegments: 0, myceliumBridgeSegments: 0,
  });
  focusFrameDiagnostics = $state<FocusFrameDiagnostics>({
    lastFrameAt: 0, sampleCount: 0, avgFrameMs: 0, maxFrameMs: 0,
  });
  focusThreadDiagnostics = $state<FocusThreadDiagnostics>({
    active: false, reason: 'not-built', edgeCount: 0, directEdgeCount: 0, supportEdgeCount: 0, subduedEdgeCount: 0, segmentCount: 0, vertexCount: 0, overlayNodeCount: 0, nextCueSegments: 0, denseBundleMode: false, buildMs: 0, avgFrameMs: 0, maxFrameMs: 0,
  });

  // ==== SEMANTIC THREAD ARTIFACT ====
  semanticThreadBundle = $state<unknown>(null);
  semanticThreadArtifactName = $state<string | null>(null);
  semanticSpaceLayoutManifest = $state<unknown>(null);
  semanticSpaceLayoutStatus = $state<string>('idle');
  semanticSpaceLayoutError = $state<string | null>(null);
  semanticNeighborMapByLeadId = $state<Map<string, SemanticNode>>(new Map());
  semanticThreadsLoadPromise = $state<Promise<unknown> | null>(null);
  semanticThreadsStatus = $state<string>('idle');
  semanticThreadsRetryAttempt = $state<number>(0);
  semanticThreadsRetryTimer = $state<ReturnType<typeof setTimeout> | null>(null);
  dataLoadAttempt = $state<number>(0);

  // ==== CONFIGURATION CONSTANTS ====
  MAP_HANDOFF_PRELUDE_MS = $state(430);
  VIEW_HANDOFF_OUT_MS = $state(1200);
  TERRAIN_LANDING_SETTLE_MS = $state(1200);
  TERRAIN_LANDING_SETTLE_LONG_MS = $state(1800);
  SHOW_VIEW_HANDOFF_DISMISS_MS = $state(2200);
  MAP_TRAIL_REFRESH_LATE_DELAY_MS = $state(100);
  AUTO_ROTATE_IDLE_MS = $state(3600);
  AUTO_ROTATE_MANUAL_IDLE_MS = $state(5200);
  AUTO_ROTATE_SOFT_RESUME_MS = $state(1800);
  AUTO_ROTATE_BASE_SPEED = $state(0.34);
  MOBILE_ROUTE_FIELD_PEEK_MS = $state(1550);
  SELECTED_CARD_FADE_MS = $state(180);
  ORBIT_MIN_DISTANCE_DEFAULT = $state(0.5);
  ORBIT_MIN_DISTANCE_INSIDE = $state(0.24);
  ORBIT_MAX_DISTANCE_DEFAULT = $state(5.5);
  ORBIT_MAX_DISTANCE_FREE = $state(6.8);
  ORBIT_ROTATE_SPEED_DEFAULT = $state(0.6);
  ORBIT_ROTATE_SPEED_FREE = $state(0.82);
  ORBIT_PAN_SPEED_DEFAULT = $state(0.5);
  ORBIT_PAN_SPEED_FREE = $state(0.68);
  SEARCH_TRAIL_CUE_MIN_DWELL_MS = $state(920);
  JOURNEY_COMPASS_PHASE_ORDER = $state<string[]>(['overview', 'search', 'focus', 'inside', 'map']);
  FOCUS_CONSTELLATION_MOTIFS = $state({
    rosette: {
      label: 'semantic rosette',
      directLift: 0.82,
      supportLift: 0.46,
      directPriority: 0.78,
      supportPriority: 0.36,
      braid: 0.72,
    },
    lattice: {
      label: 'trade lattice',
      directLift: 0.58,
      supportLift: 0.3,
      directPriority: 0.72,
      supportPriority: 0.42,
      braid: 0.5,
    },
    delta: {
      label: 'county delta',
      directLift: 0.7,
      supportLift: 0.38,
      directPriority: 0.74,
      supportPriority: 0.34,
      braid: 0.62,
    },
    market: {
      label: 'market ring',
      directLift: 0.64,
      supportLift: 0.36,
      directPriority: 0.7,
      supportPriority: 0.32,
      braid: 0.58,
    },
    civic: {
      label: 'civic orbit',
      directLift: 0.62,
      supportLift: 0.34,
      directPriority: 0.68,
      supportPriority: 0.3,
      braid: 0.54,
    },
  });
  SCENE_REVEAL_DURATION_MS = $state(1650);
  LOADING_MIN_VISIBLE_MS = $state(1320);
  POINTS_MATERIAL_BASE_SIZE = $state(0.03);
  POINTS_MATERIAL_BASE_OPACITY = $state(1.0);
  FOCUS_THREAD_SEGMENTS = $state(16);
  HOVER_LOCK_CONFIRM_MS = $state(80);
  HOVER_SAMPLE_MS = $state(24);
  LEAFLET_CSS_URL = $state('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
  LEAFLET_JS_URL = $state('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js');

  // ==== COLORS / CLUSTER NAMES ====
  COLORS = $state(CLUSTER_COLORS);
  CLUSTER_NAMES = $state<string[]>([
    'General Business', 'Professional Services', 'Food & Hospitality', 'Construction & Trades',
    'Retail & Shops', 'Beauty & Wellness', 'Real Estate & Property', 'Industrial & Logistics',
    'Agriculture & Ranching', 'Automotive', 'Healthcare & Medical', 'Therapy & Counseling',
    'Education & Childcare', 'Churches', 'Faith Ministries', 'Community Nonprofits',
    'Foundations', 'Arts & Culture', 'Economic Development', 'Public Agencies', 'Enterprise Brands',
  ]);

  // ==== LOADING PHASE META ====
  LOADING_PHASE_META = $state({
    records: { progress: 0.2, note: 'Gathering records...', foot: 'County records are arriving first.' },
    scene: { progress: 0.48, note: 'Raising the cloud...', foot: 'Shaping the scene.' },
    restore: { progress: 0.76, note: 'Restoring view...', foot: 'Restoring last known path.' },
    launch: { progress: 1, note: 'Awake.', foot: 'Threads are live.' },
  });

  // ==== POSITION / GEOMETRY STATE ====
  nodePositions = $state<NodePosition[]>([]);
  targetPositions = $state<NodePosition[]>([]);
  originalPositions = $state<NodePosition[]>([]);
  currentView = $state<ViewName>('galaxy');
  autoRotate = $state<boolean>(false);
  autoRotateSuspended = $state<boolean>(false);
  weather = $state<unknown>(null);
  weatherInitialized = $state<boolean>(false);
  clockTimer = $state<ReturnType<typeof setTimeout> | null>(null);
  selectedPoint = $state<Point | null>(null);
  rippleActive = $state<boolean>(false);
  rippleStartTime = $state<number>(0);
  bloomPulseStartTime = $state<number>(0);
  bridgePulseStartTime = $state<number>(0);
  rippleCenter = $state<unknown>(null);
  pointColorStateVersion = $state<number>(0);
  pulsePhase = $state<number>(0);
  nodesAreSettling = $state<boolean>(false);
  _settlingMaxDelta = $state<number>(0);
  _settlingWatchdogStartedAt = $state<number | null>(null);
  _settlingLowFrames = $state<number>(0);
  pointBaseColors = $state<Float32Array | number[] | null>(null);
  hoverHighlightIndex = $state<number>(-1);
  hoveredCluster = $state<number | null>(null);
  stableCanvasHover = $state<CanvasHoverCandidate | null>(null);
  lastCanvasNodeHover = $state<CanvasHoverCandidate | null>(null);
  lastCanvasNodePick = $state<CanvasHoverCandidate | null>(null);
  lastCanvasNodeFocusPick = $state<CanvasHoverCandidate | null>(null);
  focusTargetVector = $state<Vector3Like | null>(null);
  desiredCameraVector = $state<Vector3Like | null>(null);
  searchTimeout = $state<ReturnType<typeof setTimeout> | null>(null);
  searchAbortController = $state<AbortController | null>(null);
  currentSearchSummary = $state<SearchSummary | null>(null);
  currentEmptyQuery = $state<string | null>(null);
  semanticTrailCue = $state<string>('idle');
  applyingUrlState = $state<boolean>(false);
  restoringBrowserHistory = $state<boolean>(false);
  urlStateRestoreToken = $state<number>(0);
  eventListenersInitialized = $state<boolean>(false);
  searchGlowActive = $state<boolean>(false);
  searchGlowRenderStateKey = $state<string>('');
  searchGlowTopIndex = $state<number | null>(null);
  loadingOverlayStartedAt = $state<number>(0);
  loadingPhaseKey = $state<LoadingPhaseKey>('records');

  // ==== NAV STATE (nested substate) ====
  navState = $state<NavState>({
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
    neighborhoodIndices: [],
  });

  // ==== ACTIVE FILTERS (nested substate) ====
  activeFilters = $state<ActiveFilters>({
    status: 'all',
    city: 'all',
    website: false,
    email: false,
    geocoded: false,
  });

  // ==== FILTER / MODE STATE ====
  filterVersion = $state<number>(0);
  filterColorVersion = $state<number>(0);
  filterColorStateKey = $state<string>('');
  registeredEvents = $state<Set<string>>(new Set());
  activeClusterFilter = $state<number | null>(null);
  activeStoryPrompt = $state<unknown>(null);
  _showAllClusters = $state<boolean>(true);
  myceliumMode = $state<string>('default');
  trailDepth = $state<number>(0);
  MODE_DESCRIPTIONS = $state<Record<string, string>>({});
  STORY_DESCRIPTIONS = $state<Record<string, string>>({});
  pointMarkers = $state<unknown[]>([]);

  // ==== SEARCH / SEMANTIC LANE STATE ====
  searchRequestSequence = $state<number>(0);
  searchAnchorIndex = $state<number | null>(null);
  searchPreviewIndex = $state<number | null>(null);
  searchGlowIndices = $state<Set<number>>(new Set());
  searchFocusTransitionToken = $state<number>(0);
  searchPreviewHoverTimer = $state<ReturnType<typeof setTimeout> | null>(null);
  searchVectorScrambleInterval = $state<ReturnType<typeof setInterval> | null>(null);
  searchVectorScrambleTimer = $state<ReturnType<typeof setTimeout> | null>(null);
  compactSearchRevealToken = $state<number>(0);
  compactSearchRevealTimers = $state<Array<ReturnType<typeof setTimeout>>>([]);
  mobileRouteFieldPeekTimer = $state<ReturnType<typeof setTimeout> | null>(null);
  mobileRouteFieldPeekToken = $state<number>(0);
  semanticLaneMonitorTimer = $state<ReturnType<typeof setTimeout> | null>(null);
  semanticLaneProbePromise = $state<Promise<unknown> | null>(null);
  semanticLaneOpsMode = $state<boolean>(false);
  semanticLaneOpsFetchPromise = $state<Promise<unknown> | null>(null);
  semanticLaneOpsRefreshTimer = $state<ReturnType<typeof setTimeout> | null>(null);
  semanticLanePendingWarm = $state<boolean>(false);
  semanticLaneState = $state<string>('checking');
  semanticLaneSnapshot = $state<unknown>(null);
  semanticSearchResultCache = $state<Map<string, unknown>>(new Map());
  semanticSearchCacheDiagnostics = $state<SemanticSearchCacheDiagnostics>({
    hits: 0, misses: 0, stores: 0, evictions: 0,
    lastKey: null, lastSource: null, lastAgeMs: null,
  });
  semanticResultContextByLeadId = $state<Map<string, unknown>>(new Map());
  semanticGuideAbortController = $state<AbortController | null>(null);
  semanticGuideRequestSequence = $state<number>(0);
  semanticTrailStoryAbortController = $state<AbortController | null>(null);
  semanticTrailStoryRequestSequence = $state<number>(0);
  currentSemanticGuide = $state<unknown>(null);
  summaryCardTypeToken = $state<number>(0);

  // ==== ANIMATION / ROUTE STATE ====
  autoRotateResumeTimer = $state<ReturnType<typeof setTimeout> | null>(null);
  autoRotateResumeDueAt = $state<number>(0);
  autoRotateSoftResumeStartedAt = $state<number>(0);
  sceneRevealActive = $state<boolean>(false);
  sceneRevealStartedAt = $state<number>(0);
  sceneRevealCameraStart = $state<Vector3Like | null>(null);
  sceneRevealCameraEnd = $state<Vector3Like | null>(null);
  routeCameraAnimationToken = $state<number>(0);
  viewHandoffTimer = $state<ReturnType<typeof setTimeout> | null>(null);
  viewSwitchPreludeTimer = $state<ReturnType<typeof setTimeout> | null>(null);
  terrainHandoffTimer = $state<ReturnType<typeof setTimeout> | null>(null);
  terrainHandoffState = $state<TerrainHandoffState>({
    phase: 'idle', from: 'overview', to: 'galaxy', routeCount: 0, startedAt: 0,
  });
  routeExplorationState = $state<RouteExplorationState>({
    phase: 'idle', reason: '', startedAt: 0,
  });
  routeChoreographyState = $state<RouteChoreographyState>({
    phase: 'overview', reason: 'initial', startedAt: 0,
    anchorIndex: null, indexCount: 0, lastCameraMove: null,
  });
  experienceResetToastTimer = $state<ReturnType<typeof setTimeout> | null>(null);

  // ==== FOCUS / THREAD / ROUTE DIAGNOSTIC STATE ====
  focusCameraAnimationToken = $state<number>(0);
  focusCameraAssistActive = $state<boolean>(false);
  focusCameraAssistUntil = $state<number>(0);
  focusCameraAssistReason = $state<string>('idle');
  focusCameraOffset = $state<Vector3Like | null>(null);
  focusCameraTargetOffset = $state<Vector3Like | null>(null);
  focusPocketMotionByIndex = $state<Map<number, unknown>>(new Map());
  focusPocketTransitionStartedAt = $state<number>(0);
  focusLens = $state<SemanticState['focusLens']>(null as unknown as SemanticState['focusLens']);
  focusHalo = $state<SemanticState['focusHalo']>(null as unknown as SemanticState['focusHalo']);
  focusCore = $state<SemanticState['focusCore']>(null as unknown as SemanticState['focusCore']);
  focusMoteGroup = $state<SemanticState['focusMoteGroup']>(null as unknown as SemanticState['focusMoteGroup']);
  focusMotes = $state<SemanticState['focusMotes']>([]);
  focusPetalGroup = $state<SemanticState['focusPetalGroup']>(null as unknown as SemanticState['focusPetalGroup']);
  focusPetals = $state<SemanticState['focusPetals']>([]);
  focusFilaments = $state<SemanticState['focusFilaments']>(null as unknown as SemanticState['focusFilaments']);
  focusAnchorGroup = $state<SemanticState['focusAnchorGroup']>(null as unknown as SemanticState['focusAnchorGroup']);
  focusAnchorRingMesh = $state<SemanticState['focusAnchorRingMesh']>(null as unknown as SemanticState['focusAnchorRingMesh']);
  focusAnchorHaloSprite = $state<SemanticState['focusAnchorHaloSprite']>(null as unknown as SemanticState['focusAnchorHaloSprite']);
  hoverHalo = $state<SemanticState['hoverHalo']>(null as unknown as SemanticState['hoverHalo']);
  focusBeaconTexture = $state<SemanticState['focusBeaconTexture']>(null as unknown as SemanticState['focusBeaconTexture']);
  focusRingTexture = $state<SemanticState['focusRingTexture']>(null as unknown as SemanticState['focusRingTexture']);
  focusNextCueTexture = $state<SemanticState['focusNextCueTexture']>(null as unknown as SemanticState['focusNextCueTexture']);
  semanticManifold = $state<SemanticState['semanticManifold']>(null as unknown as SemanticState['semanticManifold']);
  routeTraceLines = $state<SemanticState['routeTraceLines']>(null as unknown as SemanticState['routeTraceLines']);
  arrivalHandoffGroup = $state<SemanticState['arrivalHandoffGroup']>(null as unknown as SemanticState['arrivalHandoffGroup']);
  routeTraceConnectionPairs = $state<Array<{ a: number; b: number; layer: number }>>([]);
  routeTraceRenderStateKey = $state<string>('');
  routeTraceDiagnostics = $state<RouteTraceDiagnostics>({
    active: false, reason: 'not-built', phase: 'overview',
    indexCount: 0, edgeCount: 0, segmentCount: 0,
    anchorIndex: null, mapPointCount: 0, mapPathActive: false,
  });
  inspectedStrandGroup = $state<SemanticState['inspectedStrandGroup']>(null as unknown as SemanticState['inspectedStrandGroup']);
  inspectedThreadIndex = $state<number | null>(null);
  pinnedThreadIndex = $state<number | null>(null);
  canvasThreadInspectionClearTimer = $state<ReturnType<typeof setTimeout> | null>(null);
  threadInspectorPointerInside = $state<boolean>(false);
  inspectedStrandDiagnostics = $state<InspectedStrandDiagnostics>({
    active: false, source: 'none', index: null, focusedIndex: null,
    segmentCount: 0, braidCount: 0, endpointCount: 0,
  });
  arrivalHandoffDiagnostics = $state<ArrivalHandoffDiagnostics>({
    active: false, fromIndex: null, targetIndex: null, phase: 'idle',
    segmentCount: 0, endpointCount: 0, opacity: 0,
  });
  strandContinuityState = $state<StrandContinuityState>({
    phase: 'idle', targetIndex: null, fromIndex: null, reason: '',
    startedAt: 0, arrivalTimeoutId: undefined, settleTimeoutId: undefined,
  } as StrandContinuityState);
  focusOrbitSlackState = $state<FocusOrbitSlackState>({
    phase: 'idle', reason: '', startedAt: 0,
    targetShift: 0, cameraShift: 0, distanceBefore: 0, distanceAfter: 0,
    maxDistance: 5.5, rotateSpeed: 0.6, panSpeed: 0.5,
  });
  focusTransitionMode = $state<string>('idle');
  focusTransitionStartedAt = $state<number>(0);
  focusTransitionSettleTimer = $state<ReturnType<typeof setTimeout> | null>(null);
  recentArrangements = $state<unknown[]>([]);
  signalScores = $state<number[]>([]);
  bridgeScores = $state<number[]>([]);
  bloomIndices = $state<Set<number>>(new Set());
  bridgeIndices = $state<Set<number>>(new Set());
  trailIndices = $state<Set<number>>(new Set());
  projectedNeighborGrid = $state<unknown>(null);
  projectedNeighborCache = $state<Map<number, unknown>>(new Map());
  pointIndexByLeadId = $state<Map<string | number, number>>(new Map());
  deferredHydrationStarted = $state<boolean>(false);
  _deferredUrlState = $state<{ params: Record<string, string>; timestamp: number } | null>(null);
  _deferredUrlStateHandler = $state<EventListener | null>(null);
  _semanticDiveTransitionDeadline = $state<number>(0);
  semanticLaneWarmingCounter = $state<number>(0);
  lastRenderedTypeToken = $state<number>(0);
  lastSuccessfulFetch = $state<string | null>(null);

  // ==== DERIVED STATE (replaces Proxy getters from legacy state) ====

  /** Derived from navState.focusedIndex — read-only. Use navState.focusedIndex to set. */
  focusedNode = $derived(this.navState.focusedIndex);

  /** Derived from navState.trailDepth === 2 — read-only. Use navState.trailDepth to set. */
  semanticDiveMode = $derived(this.navState.trailDepth === 2);

  // ==== MUTATION GUARD ====

  /** Batched mutation: sets _isMutatingRef, runs fn, restores. */
  withMutation<T>(fn: () => T): T {
    return withStateMutation(fn);
  }
}

// Singleton opt-in instance — consumers can import and use this instead of the legacy state.
export const appState = new AppState();
