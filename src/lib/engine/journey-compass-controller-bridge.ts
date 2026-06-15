/**
 * @lib/engine/journey-compass-controller-bridge.ts — Bridge for journey-compass-controller
 *
 * Re-exports the Svelte 5 port of journey-compass-controller from
 * @lib/orchestration/compass-controller so that journey-layer code
 * does not import directly from js/.
 *
 * The Svelte 5 port was created in W11-T8 Wave 2C (commit 5b8348e).
 */
export {
  initJourneyCompassAdapter,
  getJourneyCompassPresentationState,
  syncJourneyCompassActions,
  syncMapTrailStrip,
  executeJourneyCompassAction,
  updateJourneyCompass,
  getViewHandoffModel,
  installSemanticJourneyProbe,
  invokeClearMobileRouteFieldPeek,
  scheduleMapRouteRefresh,
  type CompassPresentationState,
  type ViewHandoffModel,
} from '@lib/orchestration/compass-controller';
