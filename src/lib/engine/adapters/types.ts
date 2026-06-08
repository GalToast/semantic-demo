import type { ActiveFilters } from '@lib/types/state';
export type { ActiveFilters } from '@lib/types/state';

// ── Legacy Module Type Contracts ──────────────────────────────────────────────

/** Lifecycle, RAF loop, and renderer management (three-engine.js). */
export interface ThreeEngineModule {
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
export interface CameraControlsModule {
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
export interface NodeManagerModule {
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
export interface ThreadManagerModule {
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
export interface SearchAnimationsModule {
  triggerSearchHeroMoment(anchorIndex: number): void;
  triggerCorridorNodeGlow(anchorIndex: number, routeIndices?: number[]): void;
  updateCorridorNodeGlow(frameNow: number): boolean;
  triggerSearchCorridorAnimation(anchorIndex: number, routeIndices?: number[]): void;
  updateSearchCorridorAnimation(frameNow: number): boolean;
  disposeSearchCorridorAnimation(): void;
}

/** Semantic manifold, lens overlays, and interaction-driven visuals (three-interaction-visuals.js). */
export interface InteractionVisualsModule {
  initSemanticManifold(): void;
  initSemanticLens(): void;
  updateInteractionVisuals(now: number, hoveredNode: number, focusedNode: number): void;
  disposeInteractionVisuals(): void;
}

/** View handoff between galaxy ↔ map (view-controller.js). */
export interface ViewControllerModule {
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
export interface FilterStateModule {
  overwriteActiveFilters(filters: ActiveFilters): ActiveFilters;
  getActiveFilters(): ActiveFilters;
  incrementFilterVersion(): number;
}

/** Search orchestration: API calls, cache, result mapping (search-state.js + semantic-search-api-cache.js). */
export interface SearchEngineModule {
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

// ── Search Result Mapping ────────────────────────────────────────────────────

/** Raw row shape returned by the semantic search API. */
export interface RawSearchRow {
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

// ── Event Bus Contract ────────────────────────────────────────────────────────

/** Callback shape from js/modules/event-bus.ts subscribe(). */
export type EventCallback = (payload: Record<string, unknown>) => void;

/** Event bus module shape (subscribe + EVENTS manifest). */
export interface EventBusModule {
  subscribe(eventName: string, callback: EventCallback): () => void;
  EVENTS: Record<string, string>;
}

// ── Legacy State Contract ─────────────────────────────────────────────────────

export interface LegacyState {
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
  durationMs?: number;
  suppressPocket?: boolean;
  reason?: string;
}

export interface SearchCorridorOptions {
  durationMs?: number;
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
  skipCameraSettle?: boolean;
}

export interface EngineCallbacks {
  onNodePicked?: (index: number) => void;
  onNodeHovered?: (index: number | null) => void;
  onCameraArrived?: () => void;
  onLoadingPhase?: (phase: string, progress: number) => void;
  onGraphicsStateChange?: (state: 'lost' | 'restored' | 'fallback') => void;
  onViewChanged?: (view: string) => void;
}

// ── Engine Diagnostics ───────────────────────────────────────────────────────

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
  | 'idle'
  | 'loading'
  | 'ready'
  | 'degraded'
  | 'destroyed';

// ── Bridge Interface ─────────────────────────────────────────────────────────

export interface EngineBridge {
  readonly status: EngineStatus;
  init(canvas: HTMLCanvasElement): Promise<void>;
  destroy(): void;
  focusNode(index: number, options?: FocusNodeOptions): void;
  clearFocus(): void;
  hoverNode(index: number | null): void;
  setSearchResults(indices: number[]): void;
  focusSearchCorridor(
    anchorIndex: number,
    resultIndices: number[],
    options?: SearchCorridorOptions
  ): void;
  clearSearchResults(): void;
  resize(width: number, height: number): void;
  setAutoRotate(enabled: boolean): void;
  zoomCamera(multiplier: number): void;
  settleToOverview(): void;
  applyFilters(filters: ActiveFilters, options?: FilterOptions): void;
  switchView(view: 'galaxy' | 'map'): void;
  getNodeCount(): number;
  getDiagnostics(): SceneDiagnostics;
  isReady(): boolean;
  isFocused(): boolean;
  getFocusedIndex(): number | null;
  inspectThread(index: number): void;
  clearThreadInspector(): void;
  setThreadPresentationProfile(
    profile: { core: number; wispy: number; bridge: number; pulse: number } | null
  ): void;
  getThreadSegmentCount(): number;
}

// ── Bridge Internal Context ───────────────────────────────────────────────────
//
// Shared mutable context object passed to all adapter factories.
// The core factory creates this, mutates it during init/destroy, and the
// adapter methods read from it at call time.
//
// Properties prefixed with `_` are internal module references that should
// only be set by the lifecycle adapter during init/loadModules.

export interface BridgeContext {
  /** Consumer-facing callbacks for engine → Svelte events. */
  callbacks: EngineCallbacks;

  /** Current lifecycle status. Mutated by init() and destroy(). */
  status: EngineStatus;

  /** Placeholder canvas element passed to init(). */
  _canvas: HTMLCanvasElement | null;

  /** Legacy state singleton (from js/state.js). Populated by loadModules. */
  _state: LegacyState | null;

  /** Three.js engine module reference. */
  _threeEngine: ThreeEngineModule | null;

  /** Camera controls module reference. */
  _cameraControls: CameraControlsModule | null;

  /** Node/spore geometry manager module reference. */
  _nodeManager: NodeManagerModule | null;

  /** Mycelium thread line manager module reference. */
  _threadManager: ThreadManagerModule | null;

  /** View handoff controller module reference. */
  _viewController: ViewControllerModule | null;

  /** Filter state sync module reference. */
  _filterState: FilterStateModule | null;

  /** True after canvas click/hover bindings are wired. */
  _canvasInteractionBound: boolean;

  /** Remove-function for canvas interaction bindings, or null. */
  _removeCanvasInteraction: (() => void) | null;

  /** Optional thread presentation override. Set by setThreadPresentationProfile. */
  _threadProfileOverride: Record<string, number> | null;

  /** Event bus unsubscribe handles (accumulated during bindEventBridge). */
  _eventUnsubs: Array<() => void>;

  /** Stored handler reference for DOM scene-ready event cleanup. */
  _sceneReadyHandler: (() => void) | null;

  /**
   * withStateMutation wrapper from legacy state.js.
   * Falls back to identity function when legacy module is unavailable.
   */
  _withMutation: <T>(fn: () => T) => T;
}
