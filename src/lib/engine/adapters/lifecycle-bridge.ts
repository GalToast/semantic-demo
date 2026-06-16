/**
 * @lib/engine/adapters/lifecycle-bridge.ts — View handoffs, composition state, reset, and queries
 *
 * The largest adapter — owns engine initialisation, teardown, event-bridge wiring,
 * view switching, filter application, hover, thread inspector, thread presentation
 * profiles, and all read-only diagnostic queries.
 *
 * DESIGN PRINCIPLES
 * ─────────────────
 * 1. ORCHESTRATION HUB.  init() coordinates all other adapters — it loads legacy
 *    modules, calls `syncDataToLegacyState()` from the data-bridge, sets up the
 *    canvas container, wires interaction bindings, and attaches the event-bridge.
 * 2. CLEAN TEARDOWN.  destroy() reverses every step of init() in order:
 *    event-bridge → canvas interaction → mycelium → renderer → module refs → status.
 * 3. STATUS OWNER.  Only this adapter mutates `ctx.status`.  Other adapters read
 *    it via `assertReady` guards.
 * 4. MODULE LOADER.  `loadModules()` is the single place where all dynamic imports
 *    of legacy JS modules happen.  Module references are stored on `ctx` so every
 *    adapter sees the same live instances.
 */

import type {
  BridgeContext,
  EngineBridge,
  LegacyState,
  ActiveFilters,
  FilterOptions,
  SceneDiagnostics,
  ViewControllerModule,
  FilterStateModule,
  EventBusModule,
} from './types';

import { syncDataToLegacyState } from './data-bridge';
import { attachLegacyState, loadSemanticThreads } from '@lib/semantic-threads';
import { appState } from '@lib/state/app.svelte.ts';
import { state as legacyState } from '@lib/engine/state-bridge';
import * as legacyViewControllerModule from '../../../../js/modules/view-controller';
import * as legacyFilterStateModule from '@lib/stores/filter.svelte';
import * as legacyEventBusModule from '@lib/orchestration/event-bus';
import {
  ensureCanvasNodeInteractionBindings,
  disposeCanvasNodeInteractionBindings,
} from '@lib/journey/canvas-interaction';
import { initTooltipEventBusSubscriptions } from '../../../../js/modules/tooltip';

// ── TS Port Imports (canonical implementations) ─────────────────────────────
// These replace the legacy module lazy-loading that previously happened in
// loadModules().  Each port manages its own internal legacy module loading
// via _ensureModules(), so the bridge no longer needs to duplicate that work.

import {
  initThreeJS as _initThreeJS,
  deinit as _deinit,
  animate as _animate,
  getSceneRenderableDiagnostics as _getSceneRenderableDiagnostics,
} from '../three-engine';

import {
  createMycelium as _createMycelium,
  disposeMycelium as _disposeMycelium,
  getGroupLineSegmentCount as _getGroupLineSegmentCount,
} from '../thread-manager';

// ── Module Loader ────────────────────────────────────────────────────────────

/**
 * Load the legacy state singleton for data-sync and bridge-internal reads.
 *
 * TS port functions (initThreeJS, createMycelium, etc.) manage their own
 * legacy module loading via _ensureModules().  This loader only acquires
 * the state reference that the bridge needs for data sync, resize, and
 * diagnostic queries.
 */
async function loadModules(ctx: BridgeContext): Promise<void> {
  ctx._state = legacyState as unknown as LegacyState;
  ctx._viewController =
    legacyViewControllerModule as unknown as ViewControllerModule;
  ctx._filterState = legacyFilterStateModule as unknown as FilterStateModule;

  _acquireWithMutation(ctx);
}

function _acquireWithMutation(ctx: BridgeContext): void {
  const identity = <T>(fn: () => T): T => fn();

  if (
    typeof window !== 'undefined' &&
    (window as unknown as Record<string, unknown>).withStateMutation
  ) {
    ctx._withMutation = (window as unknown as Record<string, unknown>)
      .withStateMutation as <T>(fn: () => T) => T;
    return;
  }

  // Fallback: identity when the legacy module is unavailable
  ctx._withMutation = identity;
}

// ── Event Bridge ─────────────────────────────────────────────────────────────

/**
 * Subscribe to the legacy event-bus and forward events to the EngineCallbacks
 * bag so the Svelte layer can react without coupling to the bus internals.
 *
 * Subscriptions are stored in `ctx._eventUnsubs` for cleanup in `unbindEventBridge`.
 */
async function bindEventBridge(ctx: BridgeContext): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const bus = legacyEventBusModule as unknown as EventBusModule;

    const evtCameraFocused = bus.EVENTS['CAMERA_NODE_FOCUSED']!;
    const evtTransitionPhase = bus.EVENTS['TRANSITION_PHASE_CHANGED']!;
    const evtViewChanged = bus.EVENTS['VIEW_CHANGED']!;

    ctx._eventUnsubs.push(
      bus.subscribe(evtCameraFocused, (payload: Record<string, unknown>) => {
        let index = payload['index'] as number | undefined;
        if (!Number.isFinite(index)) {
          const point = payload['point'] as
            | { x: number; y: number; z: number }
            | undefined;
          if (point && ctx._state?.points) {
            index = ctx._state.points.findIndex(
              (p) => p.x === point.x && p.y === point.y && p.z === point.z
            );
          }
        }
        if (Number.isFinite(index) && index! >= 0) {
          ctx.callbacks.onNodePicked?.(index!);
        }
      })
    );

    ctx._eventUnsubs.push(
      bus.subscribe(evtTransitionPhase, (payload: Record<string, unknown>) => {
        const phase = payload['phase'] as string | undefined;
        if (phase === 'arrived' || phase === 'idle') {
          ctx.callbacks.onCameraArrived?.();
        }
      })
    );

    ctx._eventUnsubs.push(
      bus.subscribe(evtViewChanged, (payload: Record<string, unknown>) => {
        const view = payload['view'] as string | undefined;
        if (view) {
          ctx.callbacks.onViewChanged?.(view);
        }
      })
    );
  } catch (busErr) {
    console.warn('[EngineBridge] Event bus subscription failed:', busErr);
  }

  // scene-ready is a DOM CustomEvent (from loading-ui.js)
  const sceneReadyHandler = (): void => {
    ctx.callbacks.onLoadingPhase?.('launch', 1);
  };
  window.addEventListener('scene-ready', sceneReadyHandler as EventListener);
  ctx._sceneReadyHandler = sceneReadyHandler;
}

/** Tear down all event-bus and DOM event subscriptions. */
function unbindEventBridge(ctx: BridgeContext): void {
  for (const unsub of ctx._eventUnsubs) {
    try {
      unsub();
    } catch (_) {
      /* best-effort */
    }
  }
  ctx._eventUnsubs = [];

  if (ctx._sceneReadyHandler) {
    window.removeEventListener(
      'scene-ready',
      ctx._sceneReadyHandler as EventListener
    );
    ctx._sceneReadyHandler = null;
  }
}

// ── Public Factory ───────────────────────────────────────────────────────────

/**
 * Create the lifecycle slice of the EngineBridge.
 *
 * This is the largest adapter — it owns init/destroy, view switching, filter
 * application, node hover, thread inspector, thread presentation profiles,
 * and all read-only diagnostic queries.
 */
export function createLifecycleMethods(
  ctx: BridgeContext
): Pick<
  EngineBridge,
  | 'init'
  | 'destroy'
  | 'switchView'
  | 'applyFilters'
  | 'hoverNode'
  | 'inspectThread'
  | 'clearThreadInspector'
  | 'setThreadPresentationProfile'
  | 'getThreadSegmentCount'
  | 'getNodeCount'
  | 'getDiagnostics'
  | 'isReady'
  | 'isFocused'
  | 'getFocusedIndex'
> {
  return {
    // ── Init ──────────────────────────────────────────────────────────────

    async init(canvas: HTMLCanvasElement): Promise<void> {
      if (ctx.status === 'ready' || ctx.status === 'loading') {
        console.warn('EngineBridge.init: already initialized, ignoring');
        return;
      }

      ctx.status = 'loading';
      ctx._canvas = canvas;

      try {
        // 1. Load all legacy modules
        await loadModules(ctx);

        // 2. Ensure #canvas-container exists for initThreeJS()
        const parentEl = canvas.parentElement;
        let container = document.getElementById('canvas-container');
        if (!container && parentEl) {
          container = document.createElement('div');
          container.id = 'canvas-container';
          container.style.cssText =
            'position:absolute;top:0;left:0;width:100%;height:100%;';
          parentEl.insertBefore(container, canvas);
          container.appendChild(canvas);
        }

        // 3. Sync Svelte data stores into the legacy state singleton
        await syncDataToLegacyState(ctx);

        // 4. Initialise the Three.js scene (delegates to TS port three-engine.ts)
        const success = _initThreeJS();
        if (!success) {
          ctx.status = 'degraded';
          ctx.callbacks.onGraphicsStateChange?.('fallback');
          return;
        }

        // 4a. Sync geometry from legacy state to Svelte appState
        if (ctx._state) {
          const legacyGeometryState = ctx._state as typeof ctx._state & {
            targetPositions?: unknown;
            originalPositions?: unknown;
          };
          if (Array.isArray(legacyGeometryState.nodePositions)) appState.nodePositions = legacyGeometryState.nodePositions;
          if (Array.isArray(legacyGeometryState.targetPositions)) appState.targetPositions = legacyGeometryState.targetPositions;
          if (Array.isArray(legacyGeometryState.originalPositions)) appState.originalPositions = legacyGeometryState.originalPositions;
        }

        // 5. Ensure the live renderer canvas fills its container
        if (ctx._state?.renderer?.domElement) {
          const liveCanvas = ctx._state.renderer.domElement;
          liveCanvas.style.width = '100%';
          liveCanvas.style.height = '100%';
          liveCanvas.style.display = 'block';
        }

        // 6. Retry mycelium thread creation if data-timing prevented it
        //    (delegates to TS port thread-manager.ts)
        if (
          ctx._state?.points?.length &&
          ctx._state?.nodePositions?.length
        ) {
          try {
            _createMycelium();
          } catch (threadErr) {
            console.warn('[EngineBridge] thread init retry failed:', threadErr);
          }
        }

        // 7. Wire canvas click/hover handlers for node picking
        try {
          ensureCanvasNodeInteractionBindings();
          ctx._canvasInteractionBound = true;
          ctx._removeCanvasInteraction =
            disposeCanvasNodeInteractionBindings;
        } catch (interactionErr) {
          console.warn(
            '[EngineBridge] Canvas interaction binding failed:',
            interactionErr
          );
          ctx.status = 'degraded';
          ctx.callbacks.onGraphicsStateChange?.('fallback');
          return;
        }

        // 8. Expose legacy state for visual audit / test tools
        if (ctx._state) {
          const testWindow = window as unknown as Record<string, unknown>;
          testWindow.__LEGACY_APP_STATE__ = ctx._state;
          if (typeof testWindow.__refreshTestCompatState__ === 'function') {
            (testWindow.__refreshTestCompatState__ as () => void)();
          }
        }

        // 8a. Wire the TS semantic-threads port into the legacy state.
        // Gives the typed port a reference to the same state object the
        // Three.js engine reads from, then kicks off background loading
        // of the 41 MB semantic thread artifact (non-blocking).
        if (ctx._state) {
          attachLegacyState(ctx._state);
          loadSemanticThreads({ reason: 'svelte-bridge-init' }).catch(
            (err: unknown) => {
              console.warn(
                '[EngineBridge] TS semantic-threads background load failed:',
                err
              );
            }
          );
        }

        // 9. Subscribe to the legacy event bus
        await bindEventBridge(ctx);

        // 9b. Wire tooltip event-bus subscriptions (DOM #hover-tooltip is ready)
        initTooltipEventBusSubscriptions();

        // 10. Mark ready and start the animation loop (delegates to TS port)
        ctx.status = 'ready';
        _animate();
      } catch (err) {
        console.error('EngineBridge.init: initialization failed', err);
        unbindEventBridge(ctx);
        ctx.status = 'degraded';
        ctx.callbacks.onGraphicsStateChange?.('fallback');
      }
    },

    // ── Destroy ───────────────────────────────────────────────────────────

    destroy(): void {
      if (ctx.status === 'destroyed') return;

      // 1. Tear down event bridge (reverse of step 9 in init)
      unbindEventBridge(ctx);

      // 2. Remove canvas interaction bindings
      if (ctx._removeCanvasInteraction) {
        try {
          ctx._removeCanvasInteraction();
        } catch (_) {
          /* best-effort */
        }
        ctx._removeCanvasInteraction = null;
      }
      ctx._canvasInteractionBound = false;

      // 3. Release mycelium GPU resources (delegates to TS port thread-manager.ts)
      try {
        _disposeMycelium();
      } catch (disposalErr) {
        console.warn('[EngineBridge] thread disposal failed:', disposalErr);
      }

      // 4. Tear down the Three.js renderer and scene (delegates to TS port three-engine.ts)
      _deinit();

      // 5. Clear module references
      ctx._threeEngine = null;
      ctx._cameraControls = null;
      ctx._nodeManager = null;
      ctx._threadManager = null;
      ctx._viewController = null;
      ctx._filterState = null;
      ctx._state = null;
      ctx._canvas = null;

      ctx.status = 'destroyed';
    },

    // ── View ──────────────────────────────────────────────────────────────

    switchView(view: 'galaxy' | 'map'): void {
      if (ctx.status !== 'ready') return;
      if (!ctx._state) return;

      // currentView is in CRITICAL_KEYS — route through withStateMutation
      ctx._withMutation(() => {
        ctx._state!.currentView = view;
      });

      if (ctx._viewController) {
        ctx._viewController.switchView(view, { reason: 'svelte-switch' });
      } else {
        ctx.callbacks.onViewChanged?.(view);
      }
    },

    // ── Filters ───────────────────────────────────────────────────────────

    applyFilters(filters: ActiveFilters, _options: FilterOptions = {}): void {
      if (ctx.status !== 'ready' || !ctx._state) return;

      if (ctx._filterState) {
        ctx._filterState.overwriteActiveFilters(filters);
      } else {
        // activeFilters is a TRACKED_SUB_KEY — route through withStateMutation
        ctx._withMutation(() => {
          ctx._state!.activeFilters = { ...filters };
        });
        ctx._state.filterVersion = (ctx._state.filterVersion ?? 0) + 1;
        ctx._state.filterColorVersion =
          (ctx._state.filterColorVersion ?? 0) + 1;
      }

      ctx._state.myceliumDirty = true;
    },

    // ── Node Hover ────────────────────────────────────────────────────────

    hoverNode(index: number | null): void {
      if (ctx.status !== 'ready' || !ctx._state) return;
      ctx._state.hoverHighlightIndex = index ?? -1;
    },

    // ── Thread Inspector ──────────────────────────────────────────────────

    inspectThread(index: number): void {
      if (ctx.status !== 'ready' || !ctx._state) return;
      ctx._state.inspectedThreadIndex = index;
      ctx._state.threadInspectorPointerInside = true;
    },

    clearThreadInspector(): void {
      if (ctx.status !== 'ready' || !ctx._state) return;
      ctx._state.inspectedThreadIndex = null;
      ctx._state.threadInspectorPointerInside = false;
    },

    // ── Thread Presentation ───────────────────────────────────────────────

    setThreadPresentationProfile(
      profile: {
        core: number;
        wispy: number;
        bridge: number;
        pulse: number;
      } | null
    ): void {
      ctx._threadProfileOverride = profile;
      if (ctx._state) {
        ctx._state.myceliumDirty = true;
      }
    },

    // ── Thread Segment Count ──────────────────────────────────────────────

    getThreadSegmentCount(): number {
      if (!ctx._state) return 0;

      let total = 0;
      try {
        if (ctx._state.myceliumCoreLines) {
          total += _getGroupLineSegmentCount(ctx._state.myceliumCoreLines);
        }
        if (ctx._state.myceliumWispyLines) {
          total += _getGroupLineSegmentCount(ctx._state.myceliumWispyLines);
        }
        if (ctx._state.myceliumBridgeLines) {
          total += _getGroupLineSegmentCount(ctx._state.myceliumBridgeLines);
        }
      } catch (_) {
        // best-effort: thread group references may be null after disposal
      }
      return total;
    },

    // ── Read-only Queries ─────────────────────────────────────────────────

    getNodeCount(): number {
      return ctx._state?.points?.length ?? 0;
    },

    getDiagnostics(): SceneDiagnostics {
      if (!ctx._state) {
        return {
          fps: 0,
          drawCalls: 0,
          triangles: 0,
          nodeCount: 0,
          threadSegments: { core: 0, wispy: 0, bridge: 0 },
          memory: {},
        };
      }

      const perf = ctx._state.scenePerformanceDiagnostics;
      return {
        fps: Math.round(1000 / Math.max(1, perf.avgFrameMs || 0)),
        drawCalls: perf.drawCalls ?? 0,
        triangles: perf.triangles ?? 0,
        nodeCount: ctx._state.points?.length ?? 0,
        threadSegments: {
          core: perf.myceliumCoreSegments ?? 0,
          wispy: perf.myceliumWispySegments ?? 0,
          bridge: perf.myceliumBridgeSegments ?? 0,
        },
        memory: _getSceneRenderableDiagnostics().memory,
      };
    },

    isReady(): boolean {
      return ctx.status === 'ready';
    },

    isFocused(): boolean {
      return Number.isFinite(ctx._state?.focusedNode);
    },

    getFocusedIndex(): number | null {
      return Number.isFinite(ctx._state?.focusedNode)
        ? ctx._state?.focusedNode ?? null
        : null;
    },
  };
}
