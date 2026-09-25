/**
 * @lib/journey/route-arrival-overlay-adapter.ts
 *
 * Ported from: js/modules/route-arrival-overlay-adapter.ts
 * Manages the route-trace and arrival-handoff overlay update callbacks.
 */

type RouteTraceOverlayUpdater = (now?: number) => void;
type ArrivalHandoffOverlayUpdater = (now?: number) => void;

type RouteArrivalOverlayUpdaters = {
    updateRouteTraceOverlayPositions?: RouteTraceOverlayUpdater;
    updateArrivalHandoffOverlay?: ArrivalHandoffOverlayUpdater;
};

let routeTraceOverlayUpdater: RouteTraceOverlayUpdater | null = null;
let arrivalHandoffOverlayUpdater: ArrivalHandoffOverlayUpdater | null = null;

export function setRouteArrivalOverlayUpdaters(updaters: RouteArrivalOverlayUpdaters = {}): void {
    routeTraceOverlayUpdater = typeof updaters.updateRouteTraceOverlayPositions === 'function'
        ? updaters.updateRouteTraceOverlayPositions
        : null;
    arrivalHandoffOverlayUpdater = typeof updaters.updateArrivalHandoffOverlay === 'function'
        ? updaters.updateArrivalHandoffOverlay
        : null;
}

export function updateRouteTraceOverlayFrame(now: number = performance.now()): void {
    if (!routeTraceOverlayUpdater) return;
    routeTraceOverlayUpdater(now);
}

export function updateArrivalHandoffOverlayFrame(now: number = performance.now()): void {
    if (!arrivalHandoffOverlayUpdater) return;
    arrivalHandoffOverlayUpdater(now);
}
