/**
 * @lib/orchestration/adapters.ts — Adapter initialization contracts.
 *
 * W12-T8: removed @ts-nocheck and tightened types. Any remaining `unknown`
 * parameters reflect a real type contract (rest-args, setters accepting
 * arbitrary data, or external bridge layer where the concrete type is
 * not yet available in the Svelte layer).
 */
import {
  initJourneyLifecycleAdapter,
  initClusterFilterAdapter,
  initJourneyCompassAdapter,
  initJourneySelectedCard,
  initSemanticDiveUiSubscriptions,
  initFocusNeighborRailSubscriptions,
  initRouteTraceSubscriptions,
  initThreadInspectorAdapter,
  initMapStateSubscriptions,
  initViewControllerAdapter,
  setupMobileSearchSheetToggle,
} from '@lib/engine/adapters-bridge';
import type { ThreadCandidate, WalkCandidateOptions } from '@lib/journey/thread-model';

/**
 * Loose 3D point — matches the structural shape of the legacy
 * `Point3D` in `js/modules/thread-inspector-adapter.ts` (optional x/y/z).
 * The strict `Point3D` in `@lib/types/webgl` is required x/y/z, which is
 * narrower than the bridge contract. Use this loose form for adapter
 * bridges until the consumer is tightened.
 */
type LoosePoint3D = { x?: number; y?: number; z?: number };

/**
 * Loose neighbor candidate — matches the structural shape of the legacy
 * `NeighborCandidate` in `js/modules/thread-inspector-adapter.ts`. The
 * legacy type allows `reason?: string` and arbitrary extra fields.
 */
type LooseNeighborCandidate = { reason?: string; [key: string]: unknown };

/**
 * Loose business point — used where the legacy `Point` type from
 * `js/state.ts` is consumed. No direct Svelte-5 equivalent exists yet;
 * `BusinessRecord` from `@lib/types/business` is the canonical
 * replacement once the consumer is tightened.
 */
type LoosePoint = Record<string, unknown>;

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Dependencies for the journey lifecycle adapter (14+ functions).
 * These bridge journey, focus, search, and rendering concerns.
 *
 * `unknown` types are kept for:
 * - Rest-args functions (`...args: unknown[]`) — variadic input
 * - Setters (`(val: unknown) => void`) — generic store writers
 * - Boolean-like setters (`(mode: unknown) => void`) — accepts coerced boolean
 * - Bridge layers where the concrete type is not yet available
 */
export interface JourneyLifecycleDeps {
  previewInsideNextThread: (options?: unknown) => void;
  getNextWalkCandidateForIndex: (currentIndex: number, options?: WalkCandidateOptions) => ThreadCandidate | null;
  applyLocalNeighborhoodFocus: (...args: unknown[]) => void;
  setSemanticDiveMode: (mode: unknown) => void;
  getInterestingBusinessNote: (point: LoosePoint) => string | null;
  buildSelectedMatchNarrative: (point: LoosePoint) => string;
  hasColdDegradedSemanticFallback: () => boolean;
  getColdDegradedRouteCopy: () => null;
  getSelectedBusinessRoleLabel: (point: unknown) => string;
  isFieldNodeFocusContext: () => boolean;
  revealSelectedBusinessCard: (...args: unknown[]) => void;
  describeThreadLensForPoint: (point: unknown) => unknown;
  hydrateLeadContext: (point: unknown, options: unknown) => void;
  shouldUseFloatingFocusJourneyOnly: () => boolean;
  setLastCanvasNodePick: (val: unknown) => void;
  setLastCanvasNodeHover: (val: unknown) => void;
  setLastCanvasNodeFocusPick: (val: unknown) => void;
}

/**
 * Dependencies for the cluster filter adapter (4 functions).
 */
export interface ClusterFilterDeps {
  applyFilters: () => void;
  clearSearchGlow: () => void;
  updateUrlState: (extra: Record<string, unknown>, options: Record<string, unknown>) => void;
  clearShortSemanticSearchState: (resultsEl: Element | null, statusEl: Element | null) => void;
}

/**
 * Dependencies for the thread inspector adapter (4 functions).
 *
 * `edge: unknown` is kept because the thread edge type is heterogeneous
 * across the legacy adapter layer (sometimes Edge, sometimes Record).
 */
export interface ThreadInspectorDeps {
  summarizeNeighborReason: (candidate: LooseNeighborCandidate, point: LoosePoint3D, focusPoint: LoosePoint3D) => string;
  getInsideRelationshipLabel: (candidate: LooseNeighborCandidate, point: LoosePoint3D, focusPoint: LoosePoint3D) => string;
  getCurrentTrailFocusIndex: () => number | null;
  getFocusThreadCurvePoint: (edge: unknown, t: number) => LoosePoint3D | null;
}

/**
 * Top-level deps object for initAdapters().
 * Mirrors the dependency surface of the legacy initAdapters() in app.ts.
 */
export interface AdapterDeps {
  /** 14-function deps bag for journey lifecycle */
  journeyLifecycle: JourneyLifecycleDeps;
  /** 4-function deps bag for cluster filter */
  clusterFilter: ClusterFilterDeps;
  /** View-switch function for compass adapter */
  switchView: (view: string) => void;
  /** Journey selected card deps */
  journeySelectedCard: {
    getStrandArrivalNote: (...args: unknown[]) => unknown;
    updateTraversalUi: (...args: unknown[]) => void;
  };
  /** 4-function deps bag for thread inspector */
  threadInspector: ThreadInspectorDeps;
  /** Composition refresh for view controller */
  refreshCompositionState: () => void;
  /** Compact-viewport predicate for mobile search */
  isCompactSearchViewport: () => boolean;
}

// ── Module-level State ───────────────────────────────────────────────────────

let _adaptersInitialized = false;

/**
 * Returns true if initAdapters() has been called in this session.
 */
export function areAdaptersInitialized(): boolean {
  return _adaptersInitialized;
}

// ── Initialization ───────────────────────────────────────────────────────────

/**
 * Initialize all 11 engine-kernel adapter modules.
 *
 * Must be called once during app startup (from app-init.ts or App.svelte).
 * Subsequent calls are no-ops — adapters are wired once and stay wired
 * for the session lifetime.
 *
 * @param deps — Cross-module function references needed by the adapters.
 */
export function initAdapters(deps: AdapterDeps): void {
  if (_adaptersInitialized) return;

  // 1. Journey lifecycle adapter (14 deps)
  initJourneyLifecycleAdapter(deps.journeyLifecycle);

  // 2. Cluster filter adapter (4 deps)
  initClusterFilterAdapter(deps.clusterFilter);

  // 3. Journey compass adapter (view-switch)
  initJourneyCompassAdapter({ switchView: deps.switchView });

  // 4. Journey selected card adapter (2 deps)
  initJourneySelectedCard(deps.journeySelectedCard);

  // 5. Semantic dive UI subscriptions (no deps)
  initSemanticDiveUiSubscriptions();

  // 6. Focus neighbor rail subscriptions (no deps)
  initFocusNeighborRailSubscriptions();

  // 7. Route trace subscriptions (no deps)
  initRouteTraceSubscriptions();

  // 8. Thread inspector adapter (4 deps)
  initThreadInspectorAdapter(deps.threadInspector);

  // 9. Map state subscriptions (no deps)
  initMapStateSubscriptions();

  // 10. View controller adapter (1 dep)
  initViewControllerAdapter({ refreshCompositionState: deps.refreshCompositionState });

  // 11. Mobile search sheet toggle (1 dep)
  setupMobileSearchSheetToggle({ isCompactSearchViewport: deps.isCompactSearchViewport });

  _adaptersInitialized = true;
}
