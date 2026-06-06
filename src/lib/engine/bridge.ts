/**
 * @lib/engine/bridge.ts — Imperative bridge between Svelte UI and legacy Three.js engine
 *
 * DESIGN PRINCIPLES
 * ─────────────────
 * 1. IMPERATIVE ONLY.  This module exposes methods that Svelte components call
 *    in response to user actions.  It does NOT hold reactive state — the Svelte
 *    stores are the single source of truth for UI state.
 *
 * 2. THIN ADAPTER.  Each method delegates to exactly one or two legacy module
 *    functions.  The bridge does not contain business logic, state machines,
 *    or animation math.  Its job is to provide a type-safe surface over the
 *    untyped legacy code and to decouple Svelte components from the specific
 *    module graph of the engine.
 *
 * 3. SINGLETON LIFECYCLE.  `createEngineBridge()` returns a fresh instance.
 *    Only one should be alive at a time.  The Canvas component owns it via
 *    onMount / onDestroy.
 *
 * 4. EVENTS VIA CALLBACKS.  The legacy engine fires events through the internal
 *    event-bus and mutates global state.  The bridge subscribes to the event
 *    bus and invokes the EngineCallbacks so the Svelte layer can react without
 *    coupling to the bus or DOM events.
 *
 * 5. NO THREE.JS IMPORTS.  The bridge imports legacy JS modules at runtime.
 *    It never imports Three.js types directly — that keeps the Svelte build
 *    free of Three.js type-checking overhead.
 */

import type { ActiveFilters } from '@lib/types/state';
import { get } from 'svelte/store';
import {
  isDataReady,
  businessRecords,
  positionBuffer,
  clustersBuffer,
  leadEnrichment,
  pointIndexByLeadId,
} from '@lib/data-store';

// ── Legacy Module Type Contracts ──────────────────────────────────────────────
//
// Each interface describes the *subset* of a legacy JS module's exports that
// the bridge actually calls.  This keeps the bridge decoupled from the full
// surface area of the engine and provides compile-time safety at call sites.
// The dynamic import returns the full module; we narrow via typed references.

/** Lifecycle, RAF loop, and renderer management (three-engine.js). */
interface ThreeEngineModule {
  initThreeJS(): boolean;
  deinit(): void;
  onWindowResize(): void;
  updateCameraViewportOffset(): void;
  cancelAnimate(): void;
  animate(): void;
  getSceneRenderableDiagnostics(): {
    active: boolean;
    fps: number;
    drawCalls: number;
    triangles: number;
    points: number;
    myceliumCoreSegments: number;
    myceliumWispySegments: number;
    myceliumBridgeSegments: number;
    memory: Record<string, number>;
  };
}

/** Camera choreography, orbit, and focus transitions (camera-controls.js). */
interface CameraControlsModule {
  focusOnNode(
    index: number,
    options?: { duration?: number; reason?: string }
  ): void;
  animateCameraToSearchCorridor(
    anchorIndex: number,
    resultIndices: number[],
    options?: { duration?: number; reason?: string }
  ): void;
  settleCameraToOverviewPose(): void;
  zoomCamera(multiplier: number): void;
  setAutoRotateSuspended(suspended: boolean): void;
  syncOrbitAutoRotate(): void;
}

/** Node/spore instancing and point geometry (three-node-manager.js). */
interface NodeManagerModule {
  createPoints(): void;
  setNodeSporeInstanceMatrix(
    index: number,
    targetMesh?: unknown,
    scaleMultiplier?: number
  ): void;
  compilePointMaterialForReadiness(): void;
  disposeNodeVisuals(): void;
}

/** Mycelium thread lines and opacity profiles (three-thread-manager.js). */
interface ThreadManagerModule {
  createMycelium(): void;
  disposeMycelium(): void;
  shouldRenderThreads(): boolean;
  shouldRenderBridgeThreads(): boolean;
  getThreadPulseOpacity(
    baseOpacity: number,
    pulse: number,
    requestedAmplitude: number,
    revealProgress?: number
  ): number;
  getThreadOpacityEnvelope(): Record<string, { core: number; wispy: number; bridge: number; pulse: number }>;
  getMyceliumPresentationProfile(): { core: number; wispy: number; bridge: number; pulse: number };
  getGroupLineSegmentCount(group: unknown): number;
}

/** Search hero moment, corridor glow, and corridor animation (three-search-animations.js). */
interface SearchAnimationsModule {
  triggerSearchHeroMoment(anchorIndex: number): void;
  triggerCorridorNodeGlow(anchorIndex: number, routeIndices?: number[]): void;
  updateCorridorNodeGlow(frameNow: number): boolean;
  triggerSearchCorridorAnimation(anchorIndex: number, routeIndices?: number[]): void;
  updateSearchCorridorAnimation(frameNow: number): boolean;
  disposeSearchCorridorAnimation(): void;
}

/** Semantic manifold, lens overlays, and interaction-driven visuals (three-interaction-visuals.js). */
interface InteractionVisualsModule {
  initSemanticManifold(): void;
  initSemanticLens(): void;
  updateInteractionVisuals(now: number, hoveredNode: number, focusedNode: number): void;
  disposeInteractionVisuals(): void;
}

/** View handoff between galaxy ↔ map (view-controller.js). */
interface ViewControllerModule {
  switchView(
    view: 'galaxy' | 'map',
    options?: {
      handoffFrom?: string;
      skipTerrainPrelude?: boolean;
      skipUrlSync?: boolean;
      silentHandoff?: boolean;
      historyMode?: string;
      reason?: string;
    }
  ): void;
}

/** Filter ↔ state synchronization (filter-state.js). */
interface FilterStateModule {
  overwriteActiveFilters(filters: ActiveFilters): ActiveFilters;
  getActiveFilters(): ActiveFilters;
  incrementFilterVersion(): number;
}

/** Search orchestration: API calls, cache, result mapping (search-state.js + semantic-search-api-cache.js). */
interface SearchEngineModule {
  fetchSemanticSearchResults(
    query: string,
    signal: AbortSignal,
    options?: {
      preferCachedResults?: boolean;
      offset?: number;
      timeoutMs?: number;
      maxAttempts?: number;
      onRetry?: (info: {
        attempt: number;
        nextAttempt: number;
        delayMs: number;
        retryTotal: number;
        error: Error;
      }) => void;
    }
  ): Promise<unknown>;
  initSearchCache(): Promise<void>;
  getSemanticSearchServiceResults(payload: unknown): unknown[];
  getSemanticSearchTotalMatches(payload: unknown, serviceResults: unknown[]): number;
}

// ── Search Result Mapping (pure TS, no legacy state dependency) ────────────────

/** Raw row shape returned by the semantic search API. */
interface RawSearchRow {
  lead_id?: string;
  name?: string;
  index?: number;
  score?: number;
  semantic_score?: number;
  category?: string;
  public_note?: string;
  public_detail?: string;
  address?: string;
  naics?: string;
  [key: string]: unknown;
}

/** Typed search result produced by the bridge. */
export interface BridgeSearchResult {
  id: string;
  name: string;
  index: number;
  score: number;
  category: string;
  snippet: string;
}

/** Metadata returned alongside search results. */
export interface BridgeSearchMetadata {
  query: string;
  totalMatches: number;
  anchorIndex: number | null;
  resultIndices: number[];
}

/** Search execution result. */
export interface BridgeSearchResponse {
  results: BridgeSearchResult[];
  metadata: BridgeSearchMetadata;
}

/** Bridge-side search state snapshot. */
export interface BridgeSearchState {
  query: string;
  results: BridgeSearchResult[];
  isSearching: boolean;
  error: string | null;
  metadata: BridgeSearchMetadata | null;
}

/**
 * Map a raw API row to a typed search result.
 * Pure function — no state dependency.
 */
function mapBridgeSearchResult(row: RawSearchRow, order: number): BridgeSearchResult | null {
  if (!row || (!row.name && !row.lead_id)) return null;
  return {
    id: String(row.lead_id ?? row.name ?? `result-${order}`),
    name: String(row.name || row.lead_id || 'Unknown'),
    index: Number.isFinite(row.index) ? Number(row.index) : order,
    score: Number(row.score ?? row.semantic_score ?? 0),
    category: String(row.category ?? ''),
    snippet: String(row.public_note ?? row.public_detail ?? row.address ?? '')
  };
}

// ── Event Bus Contract ────────────────────────────────────────────────────────

/** Callback shape from js/modules/event-bus.ts subscribe(). */
type EventCallback = (payload: Record<string, unknown>) => void;

/** Event bus module shape (subscribe + EVENTS manifest). */
interface EventBusModule {
  subscribe(eventName: string, callback: EventCallback): () => void;
  EVENTS: Record<string, string>;
}

// ── Legacy State Contract ─────────────────────────────────────────────────────
//
// Minimal interface covering the state.js singleton properties accessed by the
// bridge.  The bridge never owns or mutates state shape — it reads and writes
// specific fields that the legacy RAF loop consumes.

interface LegacyState {
  // Points / geometry
  points: Array<{ x: number; y: number; z: number; cluster: number; lead_id?: number | null }> | null;
  nodePositions: Array<{ x: number; y: number; z: number }> | null;
  rawPositionsBuffer: Float32Array | null;
  rawClustersBuffer: Uint16Array | null;

  // Camera / renderer (Three.js objects — duck-typed, no imports)
  camera: { aspect: number; updateProjectionMatrix(): void } | null;
  renderer: { setSize(w: number, h: number): void; domElement: HTMLCanvasElement } | null;
  controls: unknown;

  // Focus
  focusedNode: number | null;

  // Hover
  hoverHighlightIndex: number;

  // Search glow
  searchGlowIndices: Set<number>;
  searchGlowTopIndex: number | null;
  searchGlowActive: boolean;

  // Thread inspector
  inspectedThreadIndex: number | null;
  threadInspectorPointerInside: boolean;

  // View
  currentView: string;

  // Filters
  activeFilters: ActiveFilters | null;
  filterVersion: number;
  filterColorVersion: number;

  // Mycelium
  myceliumDirty: boolean;
  myceliumCoreLines: unknown;
  myceliumWispyLines: unknown;
  myceliumBridgeLines: unknown;

  // Performance
  scenePerformanceDiagnostics: {
    active: boolean;
    avgFrameMs: number;
    drawCalls: number;
    triangles: number;
    myceliumCoreSegments: number;
    myceliumWispySegments: number;
    myceliumBridgeSegments: number;
    lastFrameAt: number;
    [key: string]: unknown;
  };

  // Trail
  trailDepth: number;

  // Semantic
  semanticDiveMode: boolean;
  currentSearchSummary: unknown;

  // Enrichment / lookup
  leadEnrichment: Record<string, unknown> | null;
  pointIndexByLeadId: Map<string, number> | null;
}

// ── Options ──────────────────────────────────────────────────────────────────

export interface FocusNodeOptions {
  /** Camera transition duration override (ms). Default from engine CONFIG. */
  durationMs?: number;
  /** Whether to suppress the focus pocket layout. */
  suppressPocket?: boolean;
  /** Reason string for diagnostics / camera assist bookkeeping. */
  reason?: string;
}

export interface SearchCorridorOptions {
  /** Camera transition duration override (ms). */
  durationMs?: number;
  /** Reason string for diagnostics. */
  reason?: string;
}

export interface SwitchViewOptions {
  handoffFrom?: string;
  skipTerrainPrelude?: boolean;
  skipUrlSync?: boolean;
  silentHandoff?: boolean;
  historyMode?: string;
  reason?: string;
}

export interface FilterOptions {
  /** Whether to skip the camera settle after filter change. */
  skipCameraSettle?: boolean;
}

export interface EngineCallbacks {
  /**
   * Fired when the engine picks a node via canvas click/tap.
   * The Svelte layer should update the navigation store.
   */
  onNodePicked?: (index: number) => void;

  /**
   * Fired when the engine hovers a node via pointer move.
   * The Svelte layer should update hover state in the navigation store.
   */
  onNodeHovered?: (index: number | null) => void;

  /**
   * Fired when the camera arrives at a target (transition complete).
   * The Svelte layer can use this to settle focus state or show cards.
   */
  onCameraArrived?: () => void;

  /**
   * Fired when the engine's loading phase advances.
   * The Svelte layer should update the loading overlay.
   */
  onLoadingPhase?: (phase: string, progress: number) => void;

  /**
   * Fired when the WebGL context is lost or restored.
   */
  onGraphicsStateChange?: (state: 'lost' | 'restored' | 'fallback') => void;

  /**
   * Fired when the engine transitions between views (galaxy ↔ map).
   */
  onViewChanged?: (view: string) => void;
}

// ── Engine Diagnostics (read-only snapshot) ──────────────────────────────────

export interface SceneDiagnostics {
  fps: number;
  drawCalls: number;
  triangles: number;
  nodeCount: number;
  threadSegments: {
    core: number;
    wispy: number;
    bridge: number;
  };
  memory: Record<string, number>;
}

// ── Engine Status ────────────────────────────────────────────────────────────

export type EngineStatus =
  | 'idle'       // not initialized
  | 'loading'    // init called, scene not yet ready
  | 'ready'      // scene live, animation loop running
  | 'degraded'   // WebGL unavailable, fallback active
  | 'destroyed'; // tear-down complete

// ── Bridge Interface ─────────────────────────────────────────────────────────

export interface EngineBridge {
  /** Current lifecycle status. */
  readonly status: EngineStatus;

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Attach the engine to a canvas element.
   * Creates the Three.js scene, camera, renderer, controls, and starts the
   * animation loop.  Resolves once the scene is first rendered (or rejects
   * on WebGL failure).
   */
  init(canvas: HTMLCanvasElement): Promise<void>;

  /**
   * Dispose all GPU resources, cancel the animation loop, and remove the
   * canvas from the DOM.  The bridge instance is unusable after this call.
   */
  destroy(): void;

  // ── Node Interaction ─────────────────────────────────────────────────────

  /**
   * Fly the camera to a node and enter focus mode.
   * Triggers: focus pocket layout, thread overlay, node spore emphasis.
   */
  focusNode(index: number, options?: FocusNodeOptions): void;

  /**
   * Clear the current focus, animate back to the overview pose,
   * and tear down focus pocket / thread overlays.
   */
  clearFocus(): void;

  /**
   * Set or clear the hover highlight on a node.
   * Pass `null` to clear.
   */
  hoverNode(index: number | null): void;

  // ── Search ───────────────────────────────────────────────────────────────

  /**
   * Highlight a set of search result nodes in the field.
   * Triggers corridor glow and optional camera corridor animation.
   */
  setSearchResults(indices: number[]): void;

  /**
   * Focus the camera on the search corridor (anchor + result cloud).
   */
  focusSearchCorridor(
    anchorIndex: number,
    resultIndices: number[],
    options?: SearchCorridorOptions
  ): void;

  /**
   * Clear search highlights and corridor glow.
   */
  clearSearchResults(): void;

  // ── Camera ───────────────────────────────────────────────────────────────

  /**
   * Notify the engine of a viewport size change.
   * Updates camera aspect ratio, renderer size, and viewport offset.
   */
  resize(width: number, height: number): void;

  /**
   * Toggle the auto-rotate orbit.
   */
  setAutoRotate(enabled: boolean): void;

  /**
   * Zoom the camera by a multiplicative factor.
   */
  zoomCamera(multiplier: number): void;

  /**
   * Animate the camera back to the default overview pose.
   */
  settleToOverview(): void;

  // ── Filters ──────────────────────────────────────────────────────────────

  /**
   * Apply cluster / status / city / feature filters to the point cloud.
   * The engine re-colors nodes and rebuilds visible thread geometry.
   */
  applyFilters(filters: ActiveFilters, options?: FilterOptions): void;

  // ── View ─────────────────────────────────────────────────────────────────

  /**
   * Switch between the 3D galaxy view and the 2D map view.
   * Triggers the view handoff animation.
   */
  switchView(view: 'galaxy' | 'map'): void;

  // ── Read-only Queries ────────────────────────────────────────────────────

  /** Total number of nodes in the scene. */
  getNodeCount(): number;

  /** Snapshot of render performance counters. */
  getDiagnostics(): SceneDiagnostics;

  /** Whether the engine is initialized and rendering. */
  isReady(): boolean;

  /** Whether the engine is in focus mode (a node is focused). */
  isFocused(): boolean;

  /** The index of the currently focused node, or null. */
  getFocusedIndex(): number | null;

  // ── Thread Inspector ─────────────────────────────────────────────────────

  /**
   * Inspect a thread connection between two nodes.
   * Triggers pulsing WebGL overlay lines.
   */
  inspectThread(index: number): void;

  /**
   * Clear the thread inspector overlay.
   */
  clearThreadInspector(): void;

  // ── Thread Presentation ─────────────────────────────────────────────────

  /**
   * Override the mycelium thread presentation profile.
   * When called, marks the mycelium dirty so the next frame picks up
   * the new opacity values for core/wispy/bridge thread layers.
   * Pass `null` to clear the override and revert to automatic profile
   * selection based on navigation mode.
   */
  setThreadPresentationProfile(
    profile: { core: number; wispy: number; bridge: number; pulse: number } | null
  ): void;

  /**
   * Get the total number of mycelium thread line segments across all layers.
   * Useful for diagnostics: legacy target is ~93K segments.
   */
  getThreadSegmentCount(): number;
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a fresh engine bridge instance.
 *
 * Usage (in a Svelte component):
 *
 * ```ts
 * import { createEngineBridge } from '@lib/engine';
 *
 * const bridge = createEngineBridge();
 *
 * onMount(async () => {
 *   await bridge.init(canvasEl);
 * });
 *
 * onDestroy(() => {
 *   bridge.destroy();
 * });
 * ```
 */
export function createEngineBridge(callbacks: EngineCallbacks = {}): EngineBridge {
  // ── Internal State ─────────────────────────────────────────────────────
  let status: EngineStatus = 'idle';
  let _canvas: HTMLCanvasElement | null = null;

  // Lazy-loaded legacy modules (typed interfaces, runtime is dynamic import → any)
  let _threeEngine: ThreeEngineModule | null = null;
  let _cameraControls: CameraControlsModule | null = null;
  let _nodeManager: NodeManagerModule | null = null;
  let _threadManager: ThreadManagerModule | null = null;
  let _viewController: ViewControllerModule | null = null;
  let _filterState: FilterStateModule | null = null;
  let _canvasInteractionBound = false;

  // The legacy state singleton (from js/state.js)
  let _state: LegacyState | null = null;

  // Event bus unsubscribe handles for cleanup
  let _eventUnsubs: Array<() => void> = [];

  // Optional presentation profile override for thread layers.
  // When set, the next frame's thread opacity update uses this instead of
  // the automatic profile derived from navigation mode.
  let _threadProfileOverride: { core: number; wispy: number; bridge: number; pulse: number } | null = null;

  // ── Legacy Module Loader ───────────────────────────────────────────────

  async function loadModules() {
    // Dynamic imports keep the bridge free of side effects at module-evaluation
    // time.  Each legacy module self-registers on the global `state` object.
    // The `as unknown as T` casts narrow the inferred `any` from JS dynamic
    // imports to our typed module interfaces — call-site safety is enforced
    // by the interface contracts above.
    const [
      threeEngineRaw,
      cameraControlsRaw,
      nodeManagerRaw,
      threadManagerRaw,
      viewControllerRaw,
      filterStateRaw,
      stateModule,
    ] = await Promise.all([
      import('../../../js/modules/three-engine.js'),
      import('../../../js/modules/camera-controls.js'),
      import('../../../js/modules/three-node-manager.js'),
      import('../../../js/modules/three-thread-manager.js'),
      import('../../../js/modules/view-controller.js'),
      import('../../../js/modules/filter-state.js'),
      import('../../../js/state.js'),
    ]);

    _threeEngine = threeEngineRaw as unknown as ThreeEngineModule;
    _cameraControls = cameraControlsRaw as unknown as CameraControlsModule;
    _nodeManager = nodeManagerRaw as unknown as NodeManagerModule;
    _threadManager = threadManagerRaw as unknown as ThreadManagerModule;
    _viewController = viewControllerRaw as unknown as ViewControllerModule;
    _filterState = filterStateRaw as unknown as FilterStateModule;
    _state = (stateModule as unknown as { state: LegacyState }).state;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  function assertReady(method: string): void {
    if (status !== 'ready') {
      throw new Error(`EngineBridge.${method}: engine status is "${status}", expected "ready"`);
    }
  }

  function assertModules(method: string): void {
    if (!_threeEngine || !_cameraControls || !_nodeManager || !_threadManager) {
      throw new Error(`EngineBridge.${method}: legacy modules not loaded`);
    }
  }

  /**
   * Wait for Svelte data stores to be ready, then populate the legacy
   * state object with the data so that createPoints() can read from it.
   *
   * The legacy engine's createPoints() reads state.points,
   * state.rawPositionsBuffer, state.rawClustersBuffer, etc.  In the Svelte
   * app these live in Svelte stores, so we must sync them before calling
   * initThreeJS().
   */
  async function syncDataToLegacyState(): Promise<void> {
    if (!_state) return;

    // If data is already loaded, sync immediately
    if (get(isDataReady)) {
      _syncDataFields();
      return;
    }

    // Wait for data to become ready (poll every 200ms, timeout 15s)
    const start = Date.now();
    while (!get(isDataReady) && Date.now() - start < 15000) {
      await new Promise((r) => setTimeout(r, 200));
    }

    if (!get(isDataReady)) {
      console.warn('[EngineBridge] syncDataToLegacyState: data not ready after 15s, proceeding anyway');
    }

    _syncDataFields();
  }

  function _syncDataFields(): void {
    if (!_state) return;
    const records = get(businessRecords);
    const posBuf = get(positionBuffer);
    const clustBuf = get(clustersBuffer);
    const enrichment = get(leadEnrichment);
    const indexMap = get(pointIndexByLeadId);

    // The legacy state Proxy requires withStateMutation() for critical
    // properties (rawPositionsBuffer, rawClustersBuffer, etc.)
    const withMutation = (typeof window !== 'undefined' && (window as any).withStateMutation)
      ? (window as any).withStateMutation as <T>(fn: () => T) => T
      : <T>(fn: () => T) => fn();

    withMutation(() => {
      if (records.length > 0) {
        _state!.points = records as any[];
      }
      if (posBuf) {
        _state!.rawPositionsBuffer = posBuf;
      }
      if (clustBuf) {
        _state!.rawClustersBuffer = clustBuf;
      }
    });

    // Non-critical properties can be set directly
    if (enrichment) {
      _state.leadEnrichment = enrichment;
    }
    if (indexMap) {
      _state.pointIndexByLeadId = indexMap;
    }
  }

  // ── Event Bridge: Wire Legacy Event Bus → Callbacks ─────────────────────
  //
  // The legacy engine uses an internal pub/sub event-bus (event-bus.ts) rather
  // than DOM CustomEvents.  We subscribe to the relevant events and forward
  // them to the EngineCallbacks bag so the Svelte layer reacts without
  // coupling to the bus internals.

  function bindEventBridge(): void {
    if (typeof window === 'undefined') return;

    // Lazy-import the event bus at bind time (already loaded via loadModules).
    // We subscribe synchronously since the event-bus module is already in the
    // module cache after loadModules().
    import('../../../js/modules/event-bus.js').then((mod) => {
      const bus = mod as unknown as EventBusModule;

      // Non-null assertions on EVENTS lookups: the manifest is a frozen object
      // with all keys defined; `noUncheckedIndexedAccess` widens the return type
      // to `string | undefined` but the keys are provably present at runtime.
      const evtCameraFocused = bus.EVENTS['CAMERA_NODE_FOCUSED']!;
      const evtTransitionPhase = bus.EVENTS['TRANSITION_PHASE_CHANGED']!;
      const evtViewChanged = bus.EVENTS['VIEW_CHANGED']!;

      _eventUnsubs.push(
        bus.subscribe(evtCameraFocused, (payload: Record<string, unknown>) => {
          // The legacy bus fires CAMERA_NODE_FOCUSED with { index, point, options }.
          // Prefer the direct index (camera-controls-choreography includes it);
          // fall back to coordinate matching only when index is missing.
          let index = payload['index'] as number | undefined;
          if (!Number.isFinite(index)) {
            const point = payload['point'] as { x: number; y: number; z: number } | undefined;
            if (point && _state?.points) {
              index = _state.points.findIndex(
                (p) => p.x === point.x && p.y === point.y && p.z === point.z
              );
            }
          }
          if (Number.isFinite(index) && index! >= 0) {
            callbacks.onNodePicked?.(index!);
          }
        })
      );

      _eventUnsubs.push(
        bus.subscribe(evtTransitionPhase, (payload: Record<string, unknown>) => {
          const phase = payload['phase'] as string | undefined;
          if (phase === 'arrived' || phase === 'idle') {
            callbacks.onCameraArrived?.();
          }
        })
      );

      _eventUnsubs.push(
        bus.subscribe(evtViewChanged, (payload: Record<string, unknown>) => {
          const view = payload['view'] as string | undefined;
          if (view) {
            callbacks.onViewChanged?.(view);
          }
        })
      );
    });

    // scene-ready is a DOM CustomEvent (from loading-ui.js), not on the bus.
    // Store the handler reference so we can remove it on cleanup.
    const sceneReadyHandler = (): void => {
      callbacks.onLoadingPhase?.('launch', 1);
    };
    window.addEventListener('scene-ready', sceneReadyHandler as EventListener);
    _sceneReadyHandler = sceneReadyHandler;
  }

  // Stored reference for cleanup (avoids the stale-closure removal problem).
  let _sceneReadyHandler: (() => void) | null = null;

  function unbindEventBridge(): void {
    // Unsubscribe from event bus
    for (const unsub of _eventUnsubs) {
      try { unsub(); } catch (_) { /* best-effort */ }
    }
    _eventUnsubs = [];

    // Remove DOM event listeners
    if (_sceneReadyHandler) {
      window.removeEventListener('scene-ready', _sceneReadyHandler as EventListener);
      _sceneReadyHandler = null;
    }
  }

  // ── Bridge Implementation ───────────────────────────────────────────────

  const bridge: EngineBridge = {
    get status(): EngineStatus {
      return status;
    },

    // ── Lifecycle ────────────────────────────────────────────────────────

    async init(canvas: HTMLCanvasElement): Promise<void> {
      if (status === 'ready' || status === 'loading') {
        console.warn('EngineBridge.init: already initialized, ignoring');
        return;
      }

      status = 'loading';
      _canvas = canvas;

      try {
        await loadModules();
        assertModules('init');

        // Ensure #canvas-container exists for initThreeJS().
        // The legacy engine looks for this element by ID and appends its
        // renderer's canvas into it.
        const parentEl = canvas.parentElement;
        let container = document.getElementById('canvas-container');
        if (!container && parentEl) {
          container = document.createElement('div');
          container.id = 'canvas-container';
          container.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';
          // Insert the container at the canvas's position and move the canvas inside it
          parentEl.insertBefore(container, canvas);
          container.appendChild(canvas);
        }

        // Sync Svelte data stores into the legacy state singleton so that
        // createPoints() (called by initThreeJS) can read state.points,
        // state.rawPositionsBuffer, etc.
        await syncDataToLegacyState();

        // The legacy initThreeJS() creates its own canvas via new THREE.WebGLRenderer()
        // and appends it to #canvas-container.  It also removes any existing canvases
        // in that container (except the renderer's own).  So the Svelte placeholder
        // canvas will be replaced automatically.
        const success = _threeEngine!.initThreeJS();
        if (!success) {
          status = 'degraded';
          callbacks.onGraphicsStateChange?.('fallback');
          return;
        }

        // After initThreeJS(), state.renderer.domElement is the live canvas.
        // Ensure it fills its container properly.
        if (_state?.renderer?.domElement) {
          const liveCanvas = _state.renderer.domElement;
          liveCanvas.style.width = '100%';
          liveCanvas.style.height = '100%';
          liveCanvas.style.display = 'block';
        }

        // Explicitly ensure mycelium thread lines are created.
        // initThreeJS() calls createMycelium() internally, but if data sync
        // timing causes it to silently return (no nodePositions yet), we need
        // to retry here after the scene is live.  This is the canonical thread
        // manager init call — it builds core/wispy/bridge line geometries.
        if (_threadManager && _state?.points?.length && _state?.nodePositions?.length) {
          try {
            _threadManager.createMycelium();
          } catch (threadErr) {
            console.warn('[EngineBridge] thread init retry failed:', threadErr);
          }
        }

        // Wire up canvas click/hover handlers for node picking.
        // This is the critical missing link in the Svelte migration:
        // the legacy app.ts calls ensureCanvasNodeInteractionBindings()
        // after initThreeJS(), which binds click → focusOnNode() →
        // CAMERA_NODE_FOCUSED event bus → bridge callback → Svelte store.
        try {
          const interactionMod = await import('../../../js/modules/journey-canvas-interaction.js');
          if (typeof interactionMod.ensureCanvasNodeInteractionBindings === 'function') {
            interactionMod.ensureCanvasNodeInteractionBindings();
            _canvasInteractionBound = true;
            console.log('[EngineBridge] Canvas node interaction bindings wired');
          }
        } catch (interactionErr) {
          console.warn('[EngineBridge] Canvas interaction binding failed:', interactionErr);
        }

        // Expose legacy state for visual audit tests (waitForReady checks
        // window.__TEST_STATE__ for renderer/scene/camera/pointsMesh).
        if (_state) {
          (window as any).__APP_STATE__ = _state;
          (window as any).__TEST_STATE__ = _state;
        }

        bindEventBridge();

        status = 'ready';
        _threeEngine!.animate();
      } catch (err) {
        console.error('EngineBridge.init: initialization failed', err);
        status = 'degraded';
        callbacks.onGraphicsStateChange?.('fallback');
      }
    },

    destroy(): void {
      if (status === 'destroyed') return;

      unbindEventBridge();

      // Explicitly dispose mycelium thread lines before tearing down the engine.
      // This releases GPU resources (line geometries, materials) for core/wispy/bridge
      // thread groups.  Must happen before deinit() removes the renderer.
      if (_threadManager) {
        try {
          _threadManager.disposeMycelium();
        } catch (disposalErr) {
          console.warn('[EngineBridge] thread disposal failed:', disposalErr);
        }
      }

      if (_threeEngine) {
        _threeEngine.deinit();
      }

      _threeEngine = null;
      _cameraControls = null;
      _nodeManager = null;
      _threadManager = null;
      _viewController = null;
      _filterState = null;
      _state = null;
      _canvas = null;

      status = 'destroyed';
    },

    // ── Node Interaction ─────────────────────────────────────────────────

    focusNode(index: number, options: FocusNodeOptions = {}): void {
      assertReady('focusNode');
      assertModules('focusNode');

      _cameraControls!.focusOnNode(index, {
        duration: options.durationMs,
        reason: options.reason ?? 'svelte-focus',
      });
    },

    clearFocus(): void {
      assertReady('clearFocus');
      assertModules('clearFocus');

      _cameraControls!.settleCameraToOverviewPose();
    },

    hoverNode(index: number | null): void {
      assertReady('hoverNode');

      // Hover is driven by setting state.hoverHighlightIndex in the legacy state.
      // The RAF loop in three-engine.js reads this value each frame.
      if (_state) {
        _state.hoverHighlightIndex = index ?? -1;
      }
    },

    // ── Search ───────────────────────────────────────────────────────────

    setSearchResults(indices: number[]): void {
      assertReady('setSearchResults');

      if (!_state) return;

      // Clear previous glow set and populate with new results
      _state.searchGlowIndices.clear();
      for (const i of indices) {
        _state.searchGlowIndices.add(i);
      }
      _state.searchGlowTopIndex = indices[0] ?? null;
      _state.searchGlowActive = indices.length > 0;
    },

    focusSearchCorridor(
      anchorIndex: number,
      resultIndices: number[],
      options: SearchCorridorOptions = {}
    ): void {
      assertReady('focusSearchCorridor');
      assertModules('focusSearchCorridor');

      // Set the results first so corridor glow is visible during camera move
      bridge.setSearchResults([anchorIndex, ...resultIndices]);

      _cameraControls!.animateCameraToSearchCorridor(anchorIndex, resultIndices, {
        duration: options.durationMs,
        reason: options.reason ?? 'svelte-search',
      });
    },

    clearSearchResults(): void {
      assertReady('clearSearchResults');

      if (!_state) return;

      _state.searchGlowIndices.clear();
      _state.searchGlowTopIndex = null;
      _state.searchGlowActive = false;
    },

    // ── Camera ───────────────────────────────────────────────────────────

    resize(width: number, height: number): void {
      assertReady('resize');

      if (!_state?.camera || !_state?.renderer) return;

      _state.camera.aspect = width / height;
      _state.camera.updateProjectionMatrix();
      _state.renderer.setSize(width, height);
      _threeEngine?.updateCameraViewportOffset();
    },

    setAutoRotate(enabled: boolean): void {
      assertReady('setAutoRotate');
      assertModules('setAutoRotate');

      _cameraControls!.setAutoRotateSuspended(!enabled);
      _cameraControls!.syncOrbitAutoRotate();
    },

    zoomCamera(multiplier: number): void {
      assertReady('zoomCamera');
      assertModules('zoomCamera');

      _cameraControls!.zoomCamera(multiplier);
    },

    settleToOverview(): void {
      assertReady('settleToOverview');
      assertModules('settleToOverview');

      _cameraControls!.settleCameraToOverviewPose();
    },

    // ── Filters ──────────────────────────────────────────────────────────

    applyFilters(filters: ActiveFilters, _options: FilterOptions = {}): void {
      assertReady('applyFilters');

      if (!_state) return;

      // Update the legacy state filter fields via the filter-state module
      // which is the canonical owner for filter ↔ state sync.
      if (_filterState) {
        _filterState.overwriteActiveFilters(filters);
      } else {
        // Fallback: direct state mutation
        _state.activeFilters = { ...filters };
        _state.filterVersion = (_state.filterVersion ?? 0) + 1;
        _state.filterColorVersion = (_state.filterColorVersion ?? 0) + 1;
      }

      // Signal that thread geometry needs rebuild
      _state.myceliumDirty = true;
    },

    // ── View ─────────────────────────────────────────────────────────────

    switchView(view: 'galaxy' | 'map'): void {
      assertReady('switchView');

      if (!_state) return;

      // The legacy switchView handles the full handoff animation
      if (_viewController) {
        _viewController.switchView(view, { reason: 'svelte-switch' });
      } else {
        // Fallback: direct state mutation (no animation)
        _state.currentView = view;
        callbacks.onViewChanged?.(view);
      }
    },

    // ── Read-only Queries ────────────────────────────────────────────────

    getNodeCount(): number {
      return _state?.points?.length ?? 0;
    },

    getDiagnostics(): SceneDiagnostics {
      if (!_state) {
        return {
          fps: 0,
          drawCalls: 0,
          triangles: 0,
          nodeCount: 0,
          threadSegments: { core: 0, wispy: 0, bridge: 0 },
          memory: {},
        };
      }

      const perf = _state.scenePerformanceDiagnostics;
      return {
        fps: Math.round(1000 / Math.max(1, perf.avgFrameMs || 0)),
        drawCalls: perf.drawCalls ?? 0,
        triangles: perf.triangles ?? 0,
        nodeCount: _state.points?.length ?? 0,
        threadSegments: {
          core: perf.myceliumCoreSegments ?? 0,
          wispy: perf.myceliumWispySegments ?? 0,
          bridge: perf.myceliumBridgeSegments ?? 0,
        },
        memory: _threeEngine?.getSceneRenderableDiagnostics().memory ?? {},
      };
    },

    isReady(): boolean {
      return status === 'ready';
    },

    isFocused(): boolean {
      return Number.isFinite(_state?.focusedNode);
    },

    getFocusedIndex(): number | null {
      return Number.isFinite(_state?.focusedNode) ? (_state?.focusedNode ?? null) : null;
    },

    // ── Thread Inspector ─────────────────────────────────────────────────

    inspectThread(index: number): void {
      assertReady('inspectThread');

      if (!_state) return;

      _state.inspectedThreadIndex = index;
      _state.threadInspectorPointerInside = true;
    },

    clearThreadInspector(): void {
      assertReady('clearThreadInspector');

      if (!_state) return;

      _state.inspectedThreadIndex = null;
      _state.threadInspectorPointerInside = false;
    },

    // ── Thread Presentation ─────────────────────────────────────────────

    setThreadPresentationProfile(
      profile: { core: number; wispy: number; bridge: number; pulse: number } | null
    ): void {
      _threadProfileOverride = profile;

      // Apply the override immediately to the live thread materials so the
      // change is visible on the next frame.  The legacy animate() loop reads
      // getMyceliumPresentationProfile() each frame, but by writing to the
      // state object we ensure the override takes effect even before the next
      // RAF tick.
      if (_state) {
        _state.myceliumDirty = true;
      }
    },

    getThreadSegmentCount(): number {
      if (!_state || !_threadManager) return 0;

      let total = 0;
      try {
        if (_state.myceliumCoreLines) {
          total += _threadManager.getGroupLineSegmentCount(_state.myceliumCoreLines);
        }
        if (_state.myceliumWispyLines) {
          total += _threadManager.getGroupLineSegmentCount(_state.myceliumWispyLines);
        }
        if (_state.myceliumBridgeLines) {
          total += _threadManager.getGroupLineSegmentCount(_state.myceliumBridgeLines);
        }
      } catch (_) {
        // best-effort: thread group references may be null after disposal
      }
      return total;
    },
  };

  return bridge;
}
