// =============================================================================
// camera-controls-choreography.js (Facade)
// -----------------------------------------------------------------------------
// This module has been decomposed into:
// - camera-controls-choreography-focus.js   (Focus camera animation — animateCameraToNode)
// - camera-controls-choreography-cursor.js  (Focus node orchestrator — focusOnNode)
// - camera-controls-choreography-routes.js  (Search corridor, terrain, centroid, zoom)
// =============================================================================

export { animateCameraToNode } from './camera-controls-choreography-focus.js'
export { focusOnNode } from './camera-controls-choreography-cursor.js'
export {
  animateCameraToSearchCorridor,
  animateCameraToTerrainPrelude,
  applySemanticCentroidCamera,
  zoomCamera,
  clearInsideCentroid
} from './camera-controls-choreography-routes.js'
