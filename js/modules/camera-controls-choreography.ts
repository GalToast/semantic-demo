// camera-controls-choreography.ts
// TypeScript shadow of camera-controls-choreography.js
// Facade re-exporting from decomposed sub-modules.

export { animateCameraToNode } from './camera-controls-choreography-focus.js';
export { focusOnNode } from './camera-controls-choreography-cursor.js';
export {
  animateCameraToSearchCorridor,
  animateCameraToTerrainPrelude,
  applySemanticCentroidCamera,
  zoomCamera,
  clearInsideCentroid
} from './camera-controls-choreography-routes.js';
