/**
 * @lib/engine/journey-webgl-bridge.ts — Bridge for journey WebGL overlay functions.
 *
 * Re-exports engine-kernel symbols consumed by src/lib/journey/journey.ts
 * so that journey-layer code does not import directly from js/.
 */

export {
  resetRouteTraceDiagnostics,
  removeRouteTraceOverlay,
  setRouteChoreographyPhase,
  refreshRouteTraceOverlay,
  updateRouteTraceOverlayPositions,
  refreshFocusSemanticOverlay,
  updateFocusSemanticOverlayPositions,
  removeFocusSemanticOverlay,
  resetFocusThreadDiagnostics,
  syncArrivalHandoffOverlay,
  updateArrivalHandoffOverlay,
  disposeArrivalHandoffOverlay,
} from '../../../js/modules/journey-webgl';
