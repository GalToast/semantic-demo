/**
 * @lib/engine/journey-webgl-bridge.ts — Bridge for journey WebGL overlay functions.
 *
 * Re-exports engine-kernel symbols consumed by src/lib/journey/journey.ts
 * so that journey-layer code does not import directly from js/.
 *
 * W12-T2: All js/ imports removed. Now imports from src/lib/journey/.
 * W44: Re-exports now come from journey-webgl-lazy.ts to break the static
 * Three.js import chain in the main bundle.
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
} from './journey-webgl-lazy';

export {
  syncInspectedStrandOverlay,
  updateInspectedStrandOverlay,
  disposeInspectedStrandOverlay,
} from './journey-webgl-lazy';

export {
  setInspectedStrandOverlayUpdater,
} from './journey-webgl-lazy';
