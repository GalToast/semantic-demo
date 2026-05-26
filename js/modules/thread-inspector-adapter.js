/**
 * thread-inspector-adapter.js
 *
 * Injected adapter boundary: decouples thread-inspector.js from raw global window
 * calls to break circular dependencies with journey.js and focus-pocket.js.
 */

let _summarizeNeighborReason = null;
let _getInsideRelationshipLabel = null;
let _getCurrentTrailFocusIndex = null;
let _getFocusThreadCurvePoint = null;

export function initThreadInspectorAdapter(deps = {}) {
    _summarizeNeighborReason = typeof deps.summarizeNeighborReason === 'function' ? deps.summarizeNeighborReason : null;
    _getInsideRelationshipLabel = typeof deps.getInsideRelationshipLabel === 'function' ? deps.getInsideRelationshipLabel : null;
    _getCurrentTrailFocusIndex = typeof deps.getCurrentTrailFocusIndex === 'function' ? deps.getCurrentTrailFocusIndex : null;
    _getFocusThreadCurvePoint = typeof deps.getFocusThreadCurvePoint === 'function' ? deps.getFocusThreadCurvePoint : null;
}

export function adapter_summarizeNeighborReason(candidate, point, focusPoint) {
    if (_summarizeNeighborReason) return _summarizeNeighborReason(candidate, point, focusPoint);
    return candidate?.reason || 'Semantic relationship';
}

export function adapter_getInsideRelationshipLabel(candidate, point, focusPoint) {
    if (_getInsideRelationshipLabel) return _getInsideRelationshipLabel(candidate, point, focusPoint);
    return 'Related connection';
}

export function adapter_getCurrentTrailFocusIndex() {
    if (_getCurrentTrailFocusIndex) return _getCurrentTrailFocusIndex();
    return null;
}

export function adapter_getFocusThreadCurvePoint(edge, t) {
    if (_getFocusThreadCurvePoint) return _getFocusThreadCurvePoint(edge, t);
    return null;
}
