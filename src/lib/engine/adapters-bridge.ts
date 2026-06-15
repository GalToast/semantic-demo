/**
 * @lib/engine/adapters-bridge.ts — Re-exports the 11 engine-kernel adapter
 * init functions so Svelte orchestration can call them without importing js/.
 *
 * This is a thin re-export layer — no logic, no state. The canonical
 * implementations live in the engine kernel (js/modules/). The bridge
 * exists so the Svelte orchestration layer (`src/lib/orchestration/adapters.ts`)
 * has a single import target for all adapter init functions.
 *
 * Strangler-fig invariant: while the legacy `initAdapters()` in
 * js/modules/app.ts:141-186 is still live, both the legacy and Svelte
 * orchestration paths call the same engine-kernel functions. Once the
 * Svelte path is the sole caller, the legacy `initAdapters()` can be
 * retired.
 */

// ── Engine-kernel adapter re-exports (js/modules/) ───────────────────────────

export { initJourneyLifecycleAdapter } from '../../../js/modules/journey-lifecycle-adapter';
export { initClusterFilterAdapter } from '../../../js/modules/cluster-filter-adapter';
export { initJourneyCompassAdapter } from '@lib/engine/journey-compass-controller-bridge';
export { initJourneySelectedCard } from '../../../js/modules/journey-selected-card';
export { initFocusNeighborRailSubscriptions } from '../../../js/modules/journey-focus-ui';
export { initRouteTraceSubscriptions } from '../../../js/modules/journey-route-trace';
export { initThreadInspectorAdapter } from '../../../js/modules/thread-inspector-adapter';
export { initMapStateSubscriptions } from '../../../js/modules/map-state';
export { initViewControllerAdapter } from '../../../js/modules/view-controller';
export { setupMobileSearchSheetToggle } from '../../../js/modules/search-panel-adapter';

// ── Svelte-track adapter re-export ───────────────────────────────────────────
// initSemanticDiveUiSubscriptions already lives in src/lib/; re-exported
// here for a unified import target from the orchestration layer.

export { initSemanticDiveUiSubscriptions } from '../journey/semantic-dive';
