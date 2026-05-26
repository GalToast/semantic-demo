let _updateRouteTraceOverlayPositions = null;
let _updateArrivalHandoffOverlay = null;

export function setRouteArrivalOverlayUpdaters(deps = {}) {
    _updateRouteTraceOverlayPositions =
        typeof deps.updateRouteTraceOverlayPositions === 'function'
            ? deps.updateRouteTraceOverlayPositions
            : null;
    _updateArrivalHandoffOverlay =
        typeof deps.updateArrivalHandoffOverlay === 'function'
            ? deps.updateArrivalHandoffOverlay
            : null;
}

export function updateRouteTraceOverlayFrame(now) {
    if (_updateRouteTraceOverlayPositions) _updateRouteTraceOverlayPositions(now);
}

export function updateArrivalHandoffOverlayFrame(now) {
    if (_updateArrivalHandoffOverlay) _updateArrivalHandoffOverlay(now);
}
