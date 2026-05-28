/**
 * composition-adapter.js
 *
 * Injected adapter boundary: decouples lifecycle.js from raw global window
 * calls for map/journey composition functions whose primary owners are
 * map-state.js, journey.js, and search-state.js.
 *
 * Ownership rules:
 *   1. lifecycle.js calls these safe adapter methods.
 *   2. app.js injects the real implementations during initialization.
 */

let _syncRouteDirectorState = null;
let _updateFocusNeighborRail = null;
let _refreshMapMarkers = null;
let _refreshMapRouteEmbodiment = null;
let _refreshRouteTraceOverlay = null;
let _clearMobileRouteFieldPeek = null;

export function initCompositionAdapter(deps = {}) {
    _syncRouteDirectorState = typeof deps.syncRouteDirectorState === 'function' ? deps.syncRouteDirectorState : null;
    _updateFocusNeighborRail = typeof deps.updateFocusNeighborRail === 'function' ? deps.updateFocusNeighborRail : null;
    _refreshMapMarkers = typeof deps.refreshMapMarkers === 'function' ? deps.refreshMapMarkers : null;
    _refreshMapRouteEmbodiment = typeof deps.refreshMapRouteEmbodiment === 'function' ? deps.refreshMapRouteEmbodiment : null;
    _refreshRouteTraceOverlay = typeof deps.refreshRouteTraceOverlay === 'function' ? deps.refreshRouteTraceOverlay : null;
    _clearMobileRouteFieldPeek = typeof deps.clearMobileRouteFieldPeek === 'function' ? deps.clearMobileRouteFieldPeek : null;
}

export function syncRouteDirectorState(reason) {
    if (_syncRouteDirectorState) _syncRouteDirectorState(reason);
}

export function updateFocusNeighborRail() {
    if (_updateFocusNeighborRail) _updateFocusNeighborRail();
}

export function refreshMapMarkers() {
    if (_refreshMapMarkers) _refreshMapMarkers();
}

export function refreshMapRouteEmbodiment() {
    if (_refreshMapRouteEmbodiment) _refreshMapRouteEmbodiment();
}

export function refreshRouteTraceOverlay(options) {
    if (_refreshRouteTraceOverlay) _refreshRouteTraceOverlay(options);
}

export function clearMobileRouteFieldPeek() {
    if (_clearMobileRouteFieldPeek) _clearMobileRouteFieldPeek();
}
