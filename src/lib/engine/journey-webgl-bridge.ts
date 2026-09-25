/**
 * @lib/engine/journey-webgl-bridge.ts — Bridge for journey WebGL overlay functions.
 *
 * Re-exports engine-kernel symbols consumed by src/lib/journey/journey.ts
 * so that journey-layer code does not import directly from js/.
 *
 * W12-T2: All js/ imports removed. Now imports from src/lib/journey/.
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
} from '@lib/journey/webgl';

export {
  syncInspectedStrandOverlay,
  updateInspectedStrandOverlay,
  disposeInspectedStrandOverlay,
} from '@lib/journey/thread-inspector-webgl';

export {
  setInspectedStrandOverlayUpdater,
} from '@lib/journey/inspected-strand-overlay-adapter';
