// state.js — single source of truth for all global variables in the semantic demo
// All module files should: import { state } from './state.js'
//
// ── State ↔ Svelte store sync contract ──────────────────────────────────────
// The following state fields are mirrored to Svelte stores in modules/stores.js.
// Vanilla JS writers MUST keep state and the store in sync. The canonical
// sync helpers live in filter-state.js (the canonical owner for both).
//
//   state.activeFilters          → activeFiltersStore         (owner: filter-state.js)
//   state.activeClusterFilter    → activeClusterFilterStore   (owner: filter-state.js)
//
// The two panel-toggle stores (isInfoPanelOpenStore, isLegendPanelOpenStore)
// are owned by the Svelte chrome (InfoPanelChrome, LegendPanelChrome) and
// have no state.js counterpart — sync not required.
import { CLUSTER_COLORS } from './modules/design-tokens.js';

const _rawState = {
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
    nodeSporeMesh: null,
    nodeSporeHitMesh: null,
    nodeSporeMaterial: null,
    rawPositionsBuffer: null,
    rawClustersBuffer: null,
    leadEnrichment: null, // Public enrichment keyed by lead_id, fetched from scripts/leadEnrichment.public.json (Bug Sweep 33)
    myceliumLines: null,
    myceliumGroup: null,
    myceliumCoreLines: null,
    myceliumWispyLines: null,
    myceliumBridgeLines: null,
    focusSemanticLines: null,
    focusSemanticConnectionPairs: [],
    semanticLensGroup: null,
    semanticLensGlow: null,
    semanticLensSpokes: null,
    myceliumConnectionPairs: [],
    myceliumDirty: true,
    hemiLight: null,
    dirLight: null,

    // ==== PERFORMANCE DIAGNOSTICS ====
    scenePerformanceDiagnostics: { active: false, reason: 'not-sampled', lastFrameAt: 0, sampleCount: 0, avgFrameMs: 0, maxFrameMs: 0, avgUpdateMs: 0, maxUpdateMs: 0, avgRenderMs: 0, maxRenderMs: 0, avgControlsMs: 0, avgNodeMotionMs: 0, avgThreadUpdateMs: 0, avgGlowMs: 0, avgLensMs: 0 },
    focusFrameDiagnostics: { lastFrameAt: 0, sampleCount: 0, avgFrameMs: 0, maxFrameMs: 0 },
    focusThreadDiagnostics: { active: false, reason: 'not-built', edgeCount: 0, directEdgeCount: 0, supportEdgeCount: 0, subduedEdgeCount: 0, segmentCount: 0, vertexCount: 0, overlayNodeCount: 0, nextCueSegments: 0, denseBundleMode: false, buildMs: 0, avgFrameMs: 0, maxFrameMs: 0 },

    // ==== SEMANTIC THREAD ARTIFACT ====
    semanticThreadBundle: null,
    semanticThreadArtifactName: null,
    semanticSpaceLayoutManifest: null,
    semanticSpaceLayoutStatus: 'idle',
    semanticSpaceLayoutError: null,
    semanticNeighborMapByLeadId: new Map(),
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
    // Default auto-rotate off so first-time visitors aren't disoriented by
    // motion on first load. Users can opt in via the canvas control rail.
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
        focusPocketAnimationFrameId: null,
        focusFramingMeta: null,
        currentPersonality: null,
        neighborhoodIndices: []
    },
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
    registeredEvents: new Set(),
    activeClusterFilter: null,
    activeStoryPrompt: null,
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
    experienceResetToastTimer: null,

    // ==== FOCUS / THREAD / ROUTE DIAGNOSTIC STATE ====
    semanticDiveMode: false,
    focusCameraAnimationToken: 0,
    focusCameraAssistActive: false,
    focusCameraAssistUntil: 0,
    focusCameraAssistReason: 'idle',
    focusCameraOffset: null,
    focusCameraTargetOffset: null,
    focusPocketMotionByIndex: new Map(),
    focusPocketTransitionStartedAt: 0,
    focusLens: null,
    focusHalo: null,
    focusCore: null,
    focusMoteGroup: null,
    focusMotes: [],
    focusPetalGroup: null,
    focusPetals: [],
    focusFilaments: null,
    // Focus anchor indicator (size + ring + pulse) — see
    // js/modules/focus-anchor-indicator.js.  Group holds a static ring
    // mesh and a soft halo sprite that breathes when motion is allowed.
    focusAnchorGroup: null,
    focusAnchorRingMesh: null,
    focusAnchorHaloSprite: null,
    hoverHalo: null,
    focusBeaconTexture: null,
    focusRingTexture: null,
    focusNextCueTexture: null,
    semanticManifold: null,
    routeTraceLines: null,
    arrivalHandoffGroup: null,
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
    inspectedStrandGroup: null,
    inspectedThreadIndex: null,
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
    arrivalTimeoutId: null,
    settleTimeoutId: null
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
    projectedNeighborCache: new Map(),
    pointIndexByLeadId: new Map(),

    deferredHydrationStarted: false
};

let _isMutating = false;
let _devWarned = null;
let _devProxyCache = null;
let _prodProxyCache = null;
let _devTrackingActive = false;

export function withStateMutation(fn) {
    const prev = _isMutating;
    _isMutating = true;
    try {
        return fn();
    } finally {
        _isMutating = prev;
    }
}
if (typeof window !== 'undefined') {
    window.withStateMutation = withStateMutation;
}

const CRITICAL_KEYS = new Set([
    'currentView',
    'navState',
    'semanticLaneState',
    'loadingPhaseKey',
    'semanticThreadsStatus',
    'rawPositionsBuffer',
    'rawClustersBuffer'
]);

const TRACKED_SUB_KEYS = new Set([
  'navState', 'strandContinuityState', 'focusOrbitSlackState',
  'terrainHandoffState', 'routeExplorationState', 'routeChoreographyState',
  'inspectedStrandDiagnostics', 'arrivalHandoffDiagnostics', 'routeTraceDiagnostics',
  'scenePerformanceDiagnostics', 'semanticSearchCacheDiagnostics', 'activeFilters'
]);

// Helper: derive the top-level key from a dotted path (e.g., "state.navState" -> "navState",
// "state.navState.focusPocketMeta" -> "navState") so the nested Proxy can check CRITICAL_KEYS.
function _getTopKey(path) {
  if (!path || typeof path !== 'string') return '';
  // path starts with "state." — strip it, then take the first component
  const stripped = path.startsWith('state.') ? path.slice(6) : path;
  const dot = stripped.indexOf('.');
  return dot === -1 ? stripped : stripped.slice(0, dot);
}

// Production nested Proxy factory: returns a nested Proxy for TRACKED_SUB_KEYS
// that enforces the same CRITICAL_KEYS guard as the top-level set trap.
// Sub-objects whose parent key is in CRITICAL_KEYS block mutations outside
// withStateMutation(). Non-critical sub-objects warn (if _devWarned is active)
// but allow the write — matching the top-level set trap's permissive behavior
// for non-critical top-level keys.
// Skips Set/Map/Date/RegExp (mutations on those are not observable through
// plain-object Proxies).
function _makeProdProxy(obj, path) {
  if (!obj || typeof obj !== 'object' || obj instanceof Set || obj instanceof Map
      || obj instanceof Date || obj instanceof RegExp) return obj;
  if (_prodProxyCache?.has(obj)) return _prodProxyCache.get(obj);
  const topKey = _getTopKey(path);
  const isCritical = CRITICAL_KEYS.has(topKey);
  const proxy = new Proxy(obj, {
    set(t, p, v, r) {
      if (!_isMutating) {
        const k = path + '.' + String(p);
        if (isCritical) {
          // Critical parent: block non-mutating writes to prevent accidental
          // bypass of the CRITICAL_KEYS guard.
          if (_devWarned) {
            if (!_devWarned.has(k)) {
              console.warn('[State Bypass] ' + k + ' — use withStateMutation() to modify critical sub-state');
              _devWarned.add(k);
            }
          }
          throw new Error(`[State Error] Illegal direct mutation of critical sub-property '${k}'. You must use withStateMutation() to modify core state.`);
        }
        // Non-critical parent: warn in dev mode but allow the write.
        if (_devWarned) {
          if (!_devWarned.has(k)) {
            console.warn('[State Bypass] ' + k + ' — sub-object mutation detected; consider withStateMutation() for batch writes');
            _devWarned.add(k);
          }
        }
      }
      return Reflect.set(t, p, v, r);
    },
    get(t, p) {
      const v = t[p];
      if (v && typeof v === 'object' && !(v instanceof Set) && !(v instanceof Map)
          && !(v instanceof Date) && !(v instanceof RegExp)) {
        return _makeProdProxy(v, path + '.' + String(p));
      }
      return v;
    }
  });
  _prodProxyCache?.set(obj, proxy);
  return proxy;
}

export const state = new Proxy(_rawState, {
  set(target, prop, value, receiver) {
    if (CRITICAL_KEYS.has(prop) && !_isMutating) {
      throw new Error(`[State Error] Illegal direct mutation of critical property '${prop}'. You must use withStateMutation() to modify core state.`);
    }
    if (TRACKED_SUB_KEYS.has(prop) && !_isMutating && _devWarned) {
      const k = 'state.' + String(prop);
      if (!_devWarned.has(k)) {
        console.warn('[State Bypass] ' + k + ' — wholesale reassignment detected; use store .update()');
        _devWarned.add(k);
      }
    }
    // Derived properties: route writes through the canonical raw state
    // properties so all mutations flow through this Proxy trap.
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
  get(target, prop) {
    // Derived property reads: compute from canonical raw state.
    if (prop === 'semanticDiveMode') {
      return target.trailDepth === 2;
    }
    if (prop === 'focusedNode') {
      return target.navState?.focusedIndex ?? null;
    }
    const value = target[prop];
    // Production nested Proxy for TRACKED_SUB_KEYS: catches sub-object property
    // bypass mutations (e.g., state.navState.mode = 'focus' without withStateMutation).
    // Skipped when dev-mode deep tracking is active (it replaces _rawState entries
    // with recursive Proxies at init time, avoiding double-Proxying).
    if (!_devTrackingActive && TRACKED_SUB_KEYS.has(prop) && value && typeof value === 'object') {
      return _makeProdProxy(value, 'state.' + String(prop));
    }
    return value;
  }
});

if (typeof window !== 'undefined') {
  // Production nested Proxy requires _devWarned for bypass logging.
  _devWarned = new Set();
  _prodProxyCache = new WeakMap();
  // Deep tracking activates on localhost by default, or via runtime flag for
  // canary sessions in production: window.__semanticDevTools = { deepTrack: true }.
const _hostname = window.location?.hostname;
    const isDev = (_hostname === 'localhost' || _hostname === '127.0.0.1')
    || window.__semanticDevTools?.deepTrack;
  if (isDev) {
    _devTrackingActive = true;
    _devProxyCache = new WeakMap();
    let _mapSetWarned = false;
    const _track = (obj, path) => {
      if (!obj || typeof obj !== 'object') return obj;
      // Map/Set: mutations (.set/.delete/.add) are not observable through
      // plain-object Proxies. Log once per session so devs know the limit.
      if (obj instanceof Set || obj instanceof Map) {
        if (!_mapSetWarned) {
          console.warn('[State] Map/Set instances in TRACKED_SUB_KEYS are not deep-tracked. '
            + 'Mutations to .set/.delete/.add bypass the Proxy.');
          _mapSetWarned = true;
        }
        return obj;
      }
      if (_devProxyCache.has(obj)) return _devProxyCache.get(obj);
      const proxy = new Proxy(obj, {
        set(t, p, v) {
          const k = path + '.' + String(p);
          if (!_devWarned.has(k)) { console.warn('[State Bypass] ' + k + ' — use store .update()'); _devWarned.add(k); }
          t[p] = v; return true;
        },
        get(t, p) {
          if (p === '__target__') return t;
          const v = t[p];
          if (v && typeof v === 'object' && !(v instanceof Set) && !(v instanceof Map)) return _track(v, path + '.' + String(p));
          return v;
        }
      });
      _devProxyCache.set(obj, proxy);
      return proxy;
    };
    const _trackSub = (key) => {
      if (_rawState[key] !== null && _rawState[key] !== undefined) _rawState[key] = _track(_rawState[key], 'state.' + key);
    };
    TRACKED_SUB_KEYS.forEach(_trackSub);
  }
}
