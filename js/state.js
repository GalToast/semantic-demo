// state.js — single source of truth for all global variables in the semantic demo
// All module files should: import { state } from './state.js'

export const state = {
    // ==== SCENE / THREE.JS ====
    points: [],
    map: null,
    markersLayer: null,
    mapRouteLayer: null,
    mapInitialized: false,
    leafletAssetsPromise: null,
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    pointsMesh: null,
    pointsMaterial: null,
    myceliumLines: null,
    myceliumGroup: null,
    myceliumCoreLines: null,
    myceliumWispyLines: null,
    myceliumBridgeLines: null,
    semanticLensGroup: null,
    semanticLensGlow: null,
    semanticLensSpokes: null,
    myceliumConnectionPairs: [],

    // ==== CONFIGURATION CONSTANTS ====
    MAP_HANDOFF_PRELUDE_MS: 430,
    AUTO_ROTATE_IDLE_MS: 3600,
    AUTO_ROTATE_MANUAL_IDLE_MS: 5200,
    AUTO_ROTATE_SOFT_RESUME_MS: 1800,
    AUTO_ROTATE_BASE_SPEED: 0.34,
    MOBILE_ROUTE_FIELD_PEEK_MS: 1550,
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
    SCENE_REVEAL_DURATION_MS: 1650,
    LOADING_MIN_VISIBLE_MS: 1320,
    POINTS_MATERIAL_BASE_SIZE: 0.031,
    POINTS_MATERIAL_BASE_OPACITY: 0.94,
    FOCUS_THREAD_SEGMENTS: 9,
    HOVER_LOCK_CONFIRM_MS: 80,
    HOVER_SAMPLE_MS: 24,
    RESIDENT_ROTATION_MS: 28000,
    LEAFLET_CSS_URL: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    LEAFLET_JS_URL: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',

    // ==== COLORS / CLUSTER NAMES ====
    COLORS: [
        '#4ecdc4',
        '#ff6b6b',
        '#ffd93d',
        '#6bcb77',
        '#4d96ff',
        '#ff8c42',
        '#a66cff',
        '#ff6b9d',
        '#45b7d1',
        '#96ceb4',
        '#ffeaa7',
        '#74b9ff',
        '#fd79a8',
        '#00b894',
        '#e17055',
        '#a29bfe',
        '#fdcb6e',
        '#e84393',
        '#00cec9',
        '#6c5ce7',
        '#fab1a0',
        '#81ecec',
        '#55efc4',
        '#ffeaa7',
        '#dfe6e9',
        '#ff7675',
        '#fd79a8',
        '#00b894',
        '#e17055'
    ],
    CLUSTER_NAMES: [
        'General Business',
        'Professional Services',
        'Food & Hospitality',
        'Construction & Trades',
        'Retail & Shops',
        'Beauty & Wellness',
        'Real Estate & Property',
        'Industrial & Logistics',
        'Agriculture & Ranching',
        'Automotive',
        'Healthcare & Medical',
        'Therapy & Counseling',
        'Education & Childcare',
        'Churches',
        'Faith Ministries',
        'Community Nonprofits',
        'Foundations',
        'Arts & Culture',
        'Economic Development',
        'Public Agencies',
        'Enterprise Brands'
    ],

    // ==== LOADING PHASE META ====
    LOADING_PHASE_META: {
        records: {
            progress: 0.2,
            note: 'Gathering county records, active weather, and the first signals from the field.',
            foot: 'County records are arriving first.'
        },
        scene: {
            progress: 0.48,
            note: 'Raising the live cloud, map stage, and the first luminous threads.',
            foot: 'Shaping the scene and calibrating the field.'
        },
        restore: {
            progress: 0.76,
            note: 'Restoring your view, anchor, and trail so the field opens in the right place.',
            foot: 'Restoring the last known path through the mycelium.'
        },
        launch: {
            progress: 1,
            note: 'The field is awake. Opening the living map now.',
            foot: 'Threads are live. Step in.'
        }
    },

    // ==== FOCUS CONSTELLATION MOTIFS ====
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

    // ==== MODE / STORY DESCRIPTIONS ====
    MODE_DESCRIPTIONS: {
        default: 'County View keeps the whole county visible so you can choose where to wander next.',
        bloom: 'Bloom surfaces records with stronger contact, map, and business detail.',
        bridge: 'Bridge highlights records that sit between otherwise separate neighborhoods.',
        trail: 'Trail walks outward through the nearest semantic neighbors around one selected record.'
    },
    STORY_DESCRIPTIONS: {
        'signal-rich': 'Signal-rich county opens the records with the richest contact and map context.',
        'bridge-businesses':
            'Cross-current businesses focuses on records most likely to connect separate neighborhoods.',
        'mapped-food': 'Mapped food web narrows the county to mapped food and hospitality records.',
        'disqualified-ghosts': 'Archive layer brings forward records outside the active public slice.'
    },

    // ==== VIEW / INTERACTION STATE ====
    currentView: 'galaxy',
    autoRotate: true,
    autoRotateSuspended: false,
    weather: null,
    weatherInitialized: false,
    weatherRefreshTimer: null,
    selectedPoint: null,
    rippleActive: false,
    rippleStartTime: 0,
    rippleCenter: null, // THREE.Vector3 — set at runtime
    pointColorStateVersion: 0,
    pulsePhase: 0,
    nodesAreSettling: false,
    pointBaseColors: null,
    hoverHighlightIndex: -1,
    focusTargetVector: null, // THREE.Vector3 — set at runtime
    desiredCameraVector: null, // THREE.Vector3 — set at runtime
    pointMarkers: [],
    activeClusterFilter: null,
    activeStoryPrompt: null,
    myceliumMode: 'default',

    // ==== SEARCH STATE ====
    searchTimeout: null,
    searchAbortController: null,
    searchRequestSequence: 0,
    searchAnchorIndex: null,
    searchPreviewIndex: null,
    currentSearchSummary: null,
    applyingUrlState: false,
    restoringBrowserHistory: false,
    urlStateRestoreToken: 0,
    searchGlowActive: false,
    searchGlowRenderStateKey: '',
    searchGlowIndices: new Set(),
    searchGlowContextIndices: new Set(),
    searchGlowTopIndex: null,
    searchPreviewHoverTimer: null,
    searchFocusTransitionToken: 0,
    compactSearchRevealToken: 0,
    compactSearchRevealTimers: [],

    // ==== SEMANTIC LANE STATE ====
    semanticGuideAbortController: null,
    semanticGuideRequestSequence: 0,
    currentSemanticGuide: null,
    semanticGemmaStoryAbortController: null,
    semanticGemmaStoryRequestSequence: 0,
    summaryCardTypeToken: 0,
    semanticSearchRetryDelaysMs: [900, 1800],
    semanticLaneMonitorTimer: null,
    semanticLaneProbePromise: null,
    semanticLaneCooldownProbeTimer: null,
    semanticLaneCooldownProbeDueAt: null,
    semanticLaneOpsMode: false,
    semanticLaneOpsFetchPromise: null,
    semanticLaneOpsRefreshTimer: null,
    semanticLaneOpsSummary: null,
    semanticLaneAssistMetaTimer: null,
    semanticLanePendingWarm: false,
    semanticLaneState: 'checking',
    semanticLaneSnapshot: null,
    semanticSearchCacheMaxEntries: 8,
    semanticSearchCacheTtlMs: 10 * 60 * 1000,
    semanticSearchResultCache: new Map(),
    semanticSearchCacheDiagnostics: {
        hits: 0,
        misses: 0,
        stores: 0,
        evictions: 0,
        lastKey: null,
        lastSource: null,
        lastAgeMs: null
    },
    semanticResultContextByLeadId: new Map(),
    publicLeadContextCache: new Map(),
    publicLeadContextRequestToken: 0,
    publicLeadContextUnavailableUntil: 0,

    // ==== ANIMATION / CAMERA STATE ====
    autoRotateResumeTimer: null,
    autoRotateResumeDueAt: 0,
    autoRotateSoftResumeStartedAt: 0,
    sceneRevealActive: false,
    sceneRevealStartedAt: 0,
    sceneRevealCameraStart: null,
    sceneRevealCameraEnd: null,
    routeCameraAnimationToken: 0,
    loadingOverlayStartedAt: performance.now(),
    loadingPhaseKey: 'records',
    tooltipRevealFrame: null,
    tooltipHideTimer: null,

    // ==== POSITION / GEOMETRY STATE ====
    nodePositions: [],
    targetPositions: [],
    originalPositions: [],
    focusedNode: null,
    semanticDiveMode: false,
    semanticDiveAutoCollapsedPanel: false,
    insideWalkState: 'idle',
    insideWalkStateChangedAt: 0,
    focusHalo: null,
    focusCore: null,
    hoverHalo: null,
    hoverHaloTargetIndex: -1,
    hoverHaloEnteredAt: 0,
    focusBeaconGroup: null,
    focusSemanticLines: null,
    focusSemanticConnectionPairs: [],
    routeTraceLines: null,
    routeTraceConnectionPairs: [],
    routeTraceRenderStateKey: '',
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
    focusFrameDiagnostics: {
        lastFrameAt: 0,
        sampleCount: 0,
        avgFrameMs: 0,
        maxFrameMs: 0
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
        avgLensMs: 0
    },

    // ==== FOCUS / THREAD STATE ====
    focusPocketMotionByIndex: new Map(),
    focusPocketTransitionStartedAt: 0,
    focusLens: null,
    focusNextCue: null,
    semanticManifold: null,
    hoverSemanticLines: null,
    hoverSemanticConnectionPairs: [],
    inspectedStrandGroup: null,
    pinnedThreadIndex: null,
    canvasThreadInspectionClearTimer: null,
    threadInspectorPointerInside: false,
    inspectedStrandDiagnostics: {
        active: false,
        source: 'none',
        index: null,
        focusedIndex: null,
        segmentCount: 0,
        braidCount: 0,
        endpointCount: 0
    },
    arrivalHandoffGroup: null,
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
        startedAt: 0
    },
    focusBeaconTexture: null,
    focusRingTexture: null,
    focusNextCueTexture: null,
    focusCameraOffset: null,
    focusCameraTargetOffset: null, // THREE.Vector3 — set at runtime
    focusCameraAnimationToken: 0,
    focusCameraAssistActive: false,
    focusCameraAssistUntil: 0,
    focusCameraAssistReason: 'idle',
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
    focusTransitionMode: 'idle',
    focusTransitionStartedAt: 0,
    focusTransitionSettleTimer: null,
    routeExplorationState: {
        phase: 'idle',
        reason: '',
        startedAt: 0
    },
    routeChoreographyState: {
        phase: 'overview',
        reason: 'initial',
        startedAt: performance.now(),
        anchorIndex: null,
        indexCount: 0,
        lastCameraMove: null
    },
    terrainHandoffTimer: null,
    terrainHandoffState: {
        phase: 'idle',
        from: 'overview',
        to: 'galaxy',
        routeCount: 0,
        startedAt: performance.now()
    },
    experienceResetToastTimer: null,
    viewHandoffTimer: null,
    viewSwitchPreludeTimer: null,
    fieldStepSyncStartedAt: 0,
    fieldStepSyncTimer: null,
    pendingPointerPick: null,
    hoverLock: { index: null, clientX: 0, clientY: 0, at: 0 },
    confirmedHoverLock: { index: null, clientX: 0, clientY: 0, at: 0 },

    // ==== SIGNAL / SCORE STATE ====
    signalScores: [],
    bridgeScores: [],
    bloomIndices: new Set(),
    bridgeIndices: new Set(),
    trailIndices: new Set(),
    projectedNeighborGrid: null,
    projectedNeighborCache: new Map(),
    pointIndexByLeadId: new Map(),

    // ==== SEMANTIC THREADS STATE ====
    semanticThreadBundle: null,
    semanticThreadArtifactName: null,
    semanticNeighborMapByLeadId: new Map(),
    semanticThreadsLoadPromise: null,
    semanticThreadsStatus: 'idle',
    semanticThreadsRetryTimer: null,
    semanticThreadsRetryAttempt: 0,
    semanticThreadRetryDelaysMs: [2500, 8000, 15000],

    // ==== RESIDENT INSIGHT STATE ====
    residentInsight: null,
    residentInsights: [],
    residentInsightIndex: 0,
    residentRotationTimer: null,
    selectedCardRevealTimer: null,
    deferredHydrationStarted: false,

    // ==== NAV STATE ====
    recentArrangements: [],
    navState: {
        mode: 'overview',
        focusedIndex: null,
        trailSeedIndex: null,
        trailNeighborIndices: [],
        trailCursor: -1,
        walkHistoryIndices: [],
        lastTraversalReason: null,
        threadCandidates: [],
        threadReasonByIndex: new Map(),
        threadSource: 'geometric-fallback',
        focusPocketIndices: [],
        focusPocketMeta: null,
        focusPocketRoleByIndex: new Map(),
        focusFramingMeta: null,
        currentPersonality: null
    },

    inspectedThreadIndex: null,

    // ==== FILTERS ====
    activeFilters: {
        status: 'all',
        city: 'all',
        website: false,
        email: false,
        geocoded: false
    },

    // ==== SEARCH TRAIL CUE STATE ====
    searchTrailCueTimer: null,
    searchTrailCuePending: null,
    searchTrailCueLastRenderedAt: 0,
    mobileRouteFieldPeekTimer: null,
    mobileRouteFieldPeekToken: 0
};
