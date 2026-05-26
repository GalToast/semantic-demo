/**
 * camera-controls-adapter.js
 *
 * Injected adapter boundary: decouples camera-controls.js from raw global window
 * calls to break circular dependencies with journey.js, focus-pocket.js, and map-state.js.
 */

let _showTerrainPreludeOverlay = null;
let _hideTerrainPreludeOverlay = null;
let _setRouteChoreographyPhase = null;
let _hideTooltip = null;
let _clearThreadInspection = null;
let _setTrailFromSeed = null;
let _updateTrailIndices = null;
let _refreshFocusSemanticOverlay = null;
let _applyLocalNeighborhoodFocus = null;
let _updateSelectedBusiness = null;
let _updateTraversalUi = null;
let _updateFocusNeighborRail = null;

export function initCameraControlsAdapter(deps = {}) {
    _showTerrainPreludeOverlay = typeof deps.showTerrainPreludeOverlay === 'function' ? deps.showTerrainPreludeOverlay : null;
    _hideTerrainPreludeOverlay = typeof deps.hideTerrainPreludeOverlay === 'function' ? deps.hideTerrainPreludeOverlay : null;
    _setRouteChoreographyPhase = typeof deps.setRouteChoreographyPhase === 'function' ? deps.setRouteChoreographyPhase : null;
    _hideTooltip = typeof deps.hideTooltip === 'function' ? deps.hideTooltip : null;
    _clearThreadInspection = typeof deps.clearThreadInspection === 'function' ? deps.clearThreadInspection : null;
    _setTrailFromSeed = typeof deps.setTrailFromSeed === 'function' ? deps.setTrailFromSeed : null;
    _updateTrailIndices = typeof deps.updateTrailIndices === 'function' ? deps.updateTrailIndices : null;
    _refreshFocusSemanticOverlay = typeof deps.refreshFocusSemanticOverlay === 'function' ? deps.refreshFocusSemanticOverlay : null;
    _applyLocalNeighborhoodFocus = typeof deps.applyLocalNeighborhoodFocus === 'function' ? deps.applyLocalNeighborhoodFocus : null;
    _updateSelectedBusiness = typeof deps.updateSelectedBusiness === 'function' ? deps.updateSelectedBusiness : null;
    _updateTraversalUi = typeof deps.updateTraversalUi === 'function' ? deps.updateTraversalUi : null;
    _updateFocusNeighborRail = typeof deps.updateFocusNeighborRail === 'function' ? deps.updateFocusNeighborRail : null;
}

export function adapter_showTerrainPreludeOverlay() { if (_showTerrainPreludeOverlay) _showTerrainPreludeOverlay(); }
export function adapter_hideTerrainPreludeOverlay() { if (_hideTerrainPreludeOverlay) _hideTerrainPreludeOverlay(); }
export function adapter_setRouteChoreographyPhase(p, m) { if (_setRouteChoreographyPhase) _setRouteChoreographyPhase(p, m); }
export function adapter_hideTooltip() { if (_hideTooltip) _hideTooltip(); }
export function adapter_clearThreadInspection(opts) { if (_clearThreadInspection) _clearThreadInspection(opts); }
export function adapter_setTrailFromSeed(idx) { if (_setTrailFromSeed) _setTrailFromSeed(idx); }
export function adapter_updateTrailIndices(idx) { if (_updateTrailIndices) _updateTrailIndices(idx); }
export function adapter_refreshFocusSemanticOverlay() { if (_refreshFocusSemanticOverlay) _refreshFocusSemanticOverlay(); }
export function adapter_applyLocalNeighborhoodFocus(idx) { if (_applyLocalNeighborhoodFocus) _applyLocalNeighborhoodFocus(idx); }
export function adapter_updateSelectedBusiness(pt, r, c) { if (_updateSelectedBusiness) _updateSelectedBusiness(pt, r, c); }
export function adapter_updateTraversalUi() { if (_updateTraversalUi) _updateTraversalUi(); }
export function adapter_updateFocusNeighborRail() { if (_updateFocusNeighborRail) _updateFocusNeighborRail(); }
