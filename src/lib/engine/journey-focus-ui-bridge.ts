/**
 * @lib/engine/journey-focus-ui-bridge.ts - Legacy focus UI bridge.
 *
 * Keep direct legacy imports behind the engine boundary while the Svelte
 * journey layer is still being ported.
 */

export {
  isCondensedFocusStageViewport,
  hasColdDegradedSemanticFallback,
  updateFocusNeighborRail,
  updateTraversalUi,
  initFocusNeighborRailSubscriptions,
  shouldUseFloatingFocusJourneyOnly,
} from '@lib/journey/focus-ui';
