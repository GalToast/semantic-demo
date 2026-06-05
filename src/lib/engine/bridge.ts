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

  // Lazy-loaded legacy modules (imported at runtime to avoid top-level side effects)
  let _threeEngine: any = null;
  let _cameraControls: any = null;
  let _nodeManager: any = null;
  let _threadManager: any = null;
  let _viewController: any = null;
  let _filterState: any = null;

  // The legacy state singleton (from js/state.js)
  let _state: any = null;

  // Event bus unsubscribe handles for cleanup
  let _eventUnsubs: Array<() => void> = [];

  // ── Legacy Module Loader ───────────────────────────────────────────────

  async function loadModules() {
    // Dynamic imports keep the bridge free of side effects at module-evaluation
    // time.  Each legacy module self-registers on the global `state` object.
    const [
      threeEngine,
      cameraControls,
      nodeManager,
      threadManager,
      viewController,
      filterState,
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

    _threeEngine = threeEngine;
    _cameraControls = cameraControls;
    _nodeManager = nodeManager;
    _threadManager = threadManager;
    _viewController = viewController;
    _filterState = filterState;
    _state = stateModule.state;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  function assertReady(method: string) {
    if (status !== 'ready') {
      throw new Error(`EngineBridge.${method}: engine status is "${status}", expected "ready"`);
    }
  }

  function assertModules(method: string) {
    if (!_threeEngine || !_cameraControls || !_nodeManager || !_threadManager) {
      throw new Error(`EngineBridge.${method}: legacy modules not loaded`);
    }
  }

  // ── Event Bridge: Wire Legacy Event Bus → Callbacks ─────────────────────
  //
  // The legacy engine uses an internal pub/sub event-bus (event-bus.ts) rather
  // than DOM CustomEvents.  We subscribe to the relevant events and forward
  // them to the EngineCallbacks bag so the Svelte layer reacts without
  // coupling to the bus internals.

  function bindEventBridge() {
    if (typeof window === 'undefined') return;

    // Lazy-import the event bus at bind time (already loaded via loadModules)
    // We subscribe synchronously since the event-bus module is already in the
    // module cache after loadModules().
    import('../../../js/modules/event-bus.js').then(({ subscribe, EVENTS }) => {
      _eventUnsubs.push(
        subscribe(EVENTS.CAMERA_NODE_FOCUSED, (_payload: Record<string, unknown>) => {
          // The legacy bus fires CAMERA_NODE_FOCUSED with { point, options }.
          // We extract the index from the point's position in the points array.
          const point = _payload.point as any;
          if (point && _state?.points) {
            const index = _state.points.indexOf(point);
            if (index >= 0) {
              callbacks.onNodePicked?.(index);
            }
          }
        })
      );

      _eventUnsubs.push(
        subscribe(EVENTS.TRANSITION_PHASE_CHANGED, (payload: Record<string, unknown>) => {
          const phase = payload.phase as string;
          if (phase === 'arrived' || phase === 'idle') {
            callbacks.onCameraArrived?.();
          }
        })
      );

      _eventUnsubs.push(
        subscribe(EVENTS.VIEW_CHANGED, (payload: Record<string, unknown>) => {
          const view = payload.view as string;
          if (view) {
            callbacks.onViewChanged?.(view);
          }
        })
      );
    });

    // scene-ready is a DOM CustomEvent (from loading-ui.js), not on the bus
    window.addEventListener('scene-ready', (() => {
      callbacks.onLoadingPhase?.('launch', 1);
    }) as EventListener);
  }

  function unbindEventBridge() {
    // Unsubscribe from event bus
    for (const unsub of _eventUnsubs) {
      try { unsub(); } catch (_) { /* best-effort */ }
    }
    _eventUnsubs = [];

    // Remove DOM event listeners
    window.removeEventListener('scene-ready', (() => {}) as EventListener);
  }

  // ── Bridge Implementation ───────────────────────────────────────────────

  const bridge: EngineBridge = {
    get status() {
      return status;
    },

    // ── Lifecycle ────────────────────────────────────────────────────────

    async init(canvas: HTMLCanvasElement) {
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
          const liveCanvas = _state.renderer.domElement as HTMLCanvasElement;
          liveCanvas.style.width = '100%';
          liveCanvas.style.height = '100%';
          liveCanvas.style.display = 'block';
        }

        bindEventBridge();

        status = 'ready';
      } catch (err) {
        console.error('EngineBridge.init: initialization failed', err);
        status = 'degraded';
        callbacks.onGraphicsStateChange?.('fallback');
      }
    },

    destroy() {
      if (status === 'destroyed') return;

      unbindEventBridge();

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

    focusNode(index: number, options: FocusNodeOptions = {}) {
      assertReady('focusNode');
      assertModules('focusNode');

      _cameraControls!.focusOnNode(index, {
        duration: options.durationMs,
        reason: options.reason ?? 'svelte-focus',
      });
    },

    clearFocus() {
      assertReady('clearFocus');
      assertModules('clearFocus');

      _cameraControls!.settleCameraToOverviewPose();
    },

    hoverNode(index: number | null) {
      assertReady('hoverNode');

      // Hover is driven by setting state.hoverHighlightIndex in the legacy state.
      // The RAF loop in three-engine.js reads this value each frame.
      if (_state) {
        _state.hoverHighlightIndex = index ?? -1;
      }
    },

    // ── Search ───────────────────────────────────────────────────────────

    setSearchResults(indices: number[]) {
      assertReady('setSearchResults');

      if (!_state) return;

      // Clear previous glow set and populate with new results
      _state.searchGlowIndices.clear();
      indices.forEach((i) => _state.searchGlowIndices.add(i));
      _state.searchGlowTopIndex = indices[0] ?? null;
      _state.searchGlowActive = indices.length > 0;
    },

    focusSearchCorridor(
      anchorIndex: number,
      resultIndices: number[],
      options: SearchCorridorOptions = {}
    ) {
      assertReady('focusSearchCorridor');
      assertModules('focusSearchCorridor');

      // Set the results first so corridor glow is visible during camera move
      bridge.setSearchResults([anchorIndex, ...resultIndices]);

      _cameraControls!.animateCameraToSearchCorridor(anchorIndex, resultIndices, {
        duration: options.durationMs,
        reason: options.reason ?? 'svelte-search',
      });
    },

    clearSearchResults() {
      assertReady('clearSearchResults');

      if (!_state) return;

      _state.searchGlowIndices.clear();
      _state.searchGlowTopIndex = null;
      _state.searchGlowActive = false;
    },

    // ── Camera ───────────────────────────────────────────────────────────

    resize(width: number, height: number) {
      assertReady('resize');

      if (!_state?.camera || !_state?.renderer) return;

      _state.camera.aspect = width / height;
      _state.camera.updateProjectionMatrix();
      _state.renderer.setSize(width, height);
      _threeEngine?.updateCameraViewportOffset();
    },

    setAutoRotate(enabled: boolean) {
      assertReady('setAutoRotate');
      assertModules('setAutoRotate');

      _cameraControls!.setAutoRotateSuspended(!enabled);
      _cameraControls!.syncOrbitAutoRotate();
    },

    zoomCamera(multiplier: number) {
      assertReady('zoomCamera');
      assertModules('zoomCamera');

      _cameraControls!.zoomCamera(multiplier);
    },

    settleToOverview() {
      assertReady('settleToOverview');
      assertModules('settleToOverview');

      _cameraControls!.settleCameraToOverviewPose();
    },

    // ── Filters ──────────────────────────────────────────────────────────

    applyFilters(filters: ActiveFilters, options: FilterOptions = {}) {
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

    switchView(view: 'galaxy' | 'map') {
      assertReady('switchView');

      if (!_state) return;

      // The legacy switchView handles the full handoff animation
      if (_viewController) {
        (_viewController as {
          switchView: (view: 'galaxy' | 'map', options?: SwitchViewOptions) => void;
        }).switchView(view, { reason: 'svelte-switch' });
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

      const perf = _state.scenePerformanceDiagnostics ?? {};
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
        memory: _threeEngine?.getSceneRenderableDiagnostics?.().memory ?? {},
      };
    },

    isReady(): boolean {
      return status === 'ready';
    },

    isFocused(): boolean {
      return Number.isFinite(_state?.focusedNode);
    },

    getFocusedIndex(): number | null {
      return Number.isFinite(_state?.focusedNode) ? _state.focusedNode : null;
    },

    // ── Thread Inspector ─────────────────────────────────────────────────

    inspectThread(index: number) {
      assertReady('inspectThread');

      if (!_state) return;

      _state.inspectedThreadIndex = index;
      _state.threadInspectorPointerInside = true;
    },

    clearThreadInspector() {
      assertReady('clearThreadInspector');

      if (!_state) return;

      _state.inspectedThreadIndex = null;
      _state.threadInspectorPointerInside = false;
    },
  };

  return bridge;
}
