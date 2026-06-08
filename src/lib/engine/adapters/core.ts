/**
 * @lib/engine/adapters/core.ts — EngineBridge factory and composition root
 *
 * Creates the shared BridgeContext, instantiates each domain adapter, and
 * composes them into a single EngineBridge object.
 *
 * DESIGN PRINCIPLES
 * ─────────────────
 * 1. COMPOSITION ROOT.  This is where the bridge comes together.  Each adapter
 *    factory receives the same live `BridgeContext` so they share module refs,
 *    status, and callbacks without coupling to each other.
 * 2. SINGLE GETTER.  The `status` property is the only method defined directly
 *    on the bridge object — it reads from the mutable context that lifecycle
 *    methods update.
 * 3. BONE-THIN.  No business logic here.  Just wiring.
 * 4. RE-EXPORT CONVENIENCE.  `mapBridgeSearchResult` is re-exported so
 *    consumers can import it directly from the adapters package.
 */

import type { EngineBridge, EngineCallbacks, BridgeContext, EngineStatus } from './types';
import { createCameraMethods } from './camera-bridge';
import { createSearchMethods, mapBridgeSearchResult } from './search-bridge';
import { createLifecycleMethods } from './lifecycle-bridge';

// ── Re-exports ───────────────────────────────────────────────────────────────

export { mapBridgeSearchResult } from './search-bridge';

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
  // ── Shared Mutable Context ─────────────────────────────────────────────
  //
  // Created once per bridge instance.  Adapter factories receive this and
  // read/write through it.  The lifecycle adapter mutates `status` and
  // module references during init/destroy; camera and search adapters read
  // them when their methods are called.

  const ctx: BridgeContext = {
    callbacks,
    status: 'idle' as EngineStatus,
    _canvas: null,
    _state: null,
    _threeEngine: null,
    _cameraControls: null,
    _nodeManager: null,
    _threadManager: null,
    _viewController: null,
    _filterState: null,
    _canvasInteractionBound: false,
    _removeCanvasInteraction: null,
    _threadProfileOverride: null,
    _eventUnsubs: [],
    _sceneReadyHandler: null,
    _withMutation: ((fn: () => unknown) => fn()) as <T>(fn: () => T) => T,
  };

  // ── Instantiate Domain Adapters ────────────────────────────────────────

  const cameraMethods = createCameraMethods(ctx);
  const searchMethods = createSearchMethods(ctx);
  const lifecycleMethods = createLifecycleMethods(ctx);

  // ── Compose Bridge ────────────────────────────────────────────────────

  const bridge: EngineBridge = {
    // status is the only property defined directly on the bridge because it
    // must be a live getter reading from the mutable context.  All other
    // methods come from the adapters.
    get status(): EngineStatus {
      return ctx.status;
    },

    // Camera domain
    ...cameraMethods,

    // Search domain
    ...searchMethods,

    // Lifecycle domain (init, destroy, view, filters, diagnostics, etc.)
    ...lifecycleMethods,
  };

  return bridge;
}
