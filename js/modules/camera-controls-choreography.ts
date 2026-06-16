// camera-controls-choreography.ts
// TypeScript shadow of camera-controls-choreography.js
// Facade re-exporting from decomposed sub-modules.

export { animateCameraToNode, cancelFocusCameraAnimation } from '../../src/lib/engine/camera-choreography/focus.ts';
export { focusOnNode } from '../../src/lib/engine/camera-choreography/cursor.ts';
export {
  animateCameraToSearchCorridor,
  animateCameraToTerrainPrelude,
  applySemanticCentroidCamera,
  zoomCamera,
  clearInsideCentroid
} from './camera-controls-choreography-routes.ts';
