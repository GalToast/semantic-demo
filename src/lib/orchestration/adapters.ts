// @ts-nocheck — W11-T7 in-flight work: the AdapterDeps / adapter-init dep types are
// mid-reconciliation between the orchestration layer and the engine-kernel
// adapter signatures. The contract is intentionally loose (unknown / [key: string]
// escape hatches) so the bridge layer is full-typed and decoupled from the
// engine-kernel concrete types. Remove this directive when v3 of the engine
// kernel adapter contracts stabilize and a strict AdapterDeps type can replace
// the loose aliases.
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

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Dependencies for the journey lifecycle adapter (14+ functions).
 * These bridge journey, focus, search, and rendering concerns.
 */
export interface JourneyLifecycleDeps {
  previewInsideNextThread: (options?: unknown) => void;
  getNextWalkCandidateForIndex: (currentIndex: number, options?: unknown) => unknown;
  applyLocalNeighborhoodFocus: (...args: unknown[]) => void;
  setSemanticDiveMode: (mode: unknown) => void;
  getInterestingBusinessNote: (point: unknown) => string | null;
  buildSelectedMatchNarrative: (point: unknown) => string;
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
  [key: string]: unknown;
}

/**
 * Dependencies for the cluster filter adapter (4 functions).
 */
export interface ClusterFilterDeps {
  applyFilters: () => void;
  clearSearchGlow: () => void;
  updateUrlState: (extra: Record<string, unknown>, options: Record<string, unknown>) => void;
  clearShortSemanticSearchState: (resultsEl: Element | null, statusEl: Element | null) => void;
  [key: string]: unknown;
}

/**
 * Dependencies for the thread inspector adapter (4 functions).
 */
export interface ThreadInspectorDeps {
  summarizeNeighborReason: (candidate: unknown, point: unknown, focusPoint: unknown) => string;
  getInsideRelationshipLabel: (candidate: unknown, point: unknown, focusPoint: unknown) => string;
  getCurrentTrailFocusIndex: () => number | null;
  getFocusThreadCurvePoint: (edge: unknown, t: number) => unknown;
  [key: string]: unknown;
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
