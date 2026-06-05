let routeTraceOverlayUpdater = null;
let arrivalHandoffOverlayUpdater = null;

export function setRouteArrivalOverlayUpdaters(updaters = {}) {
    routeTraceOverlayUpdater = typeof updaters.updateRouteTraceOverlayPositions === 'function'
        ? updaters.updateRouteTraceOverlayPositions
        : null;
    arrivalHandoffOverlayUpdater = typeof updaters.updateArrivalHandoffOverlay === 'function'
        ? updaters.updateArrivalHandoffOverlay
        : null;
}

export function updateRouteTraceOverlayFrame(now = performance.now()) {
    if (!routeTraceOverlayUpdater) return;
    routeTraceOverlayUpdater(now);
}

export function updateArrivalHandoffOverlayFrame(now = performance.now()) {
    if (!arrivalHandoffOverlayUpdater) return;
    arrivalHandoffOverlayUpdater(now);
}
