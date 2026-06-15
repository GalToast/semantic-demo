/**
 * @lib/journey/compass-controller.ts — Canonical re-export for journey compass
 *
 * The Svelte-native implementation lives in @lib/orchestration/compass-controller
 * (ported in W11-T9 by the parallel session). This thin re-export provides the
 * canonical @lib/journey/compass-controller import path.
 */

export {
  initJourneyCompassAdapter,
  getJourneyCompassPresentationState,
  syncJourneyCompassActions,
  syncMapTrailStrip,
  executeJourneyCompassAction,
  updateJourneyCompass,
  installSemanticJourneyProbe,
  invokeClearMobileRouteFieldPeek,
  scheduleMapRouteRefresh,
  getViewHandoffModel,
} from '@lib/orchestration/compass-controller';
