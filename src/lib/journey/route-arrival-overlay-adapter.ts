/**
 * @lib/journey/route-arrival-overlay-adapter.ts
 *
 * Ported from:
 * Manages the route-trace and arrival-handoff overlay update callbacks.
 */

import { updateArrivalHandoffOverlay } from '@lib/journey/arrival-handoff'
import { updateRouteTraceOverlayPositions } from '@lib/journey/route-trace'

type RouteTraceOverlayUpdater = (now?: number) => void
type ArrivalHandoffOverlayUpdater = (now?: number) => void

type RouteArrivalOverlayUpdaters = {
    updateRouteTraceOverlayPositions?: RouteTraceOverlayUpdater
    updateArrivalHandoffOverlay?: ArrivalHandoffOverlayUpdater
}

let routeTraceOverlayUpdater: RouteTraceOverlayUpdater | null = null
let arrivalHandoffOverlayUpdater: ArrivalHandoffOverlayUpdater | null = null

export function setRouteArrivalOverlayUpdaters(updaters: RouteArrivalOverlayUpdaters = {}): void {
    routeTraceOverlayUpdater =
        typeof updaters.updateRouteTraceOverlayPositions === 'function'
            ? updaters.updateRouteTraceOverlayPositions
            : null
    arrivalHandoffOverlayUpdater =
        typeof updaters.updateArrivalHandoffOverlay === 'function' ? updaters.updateArrivalHandoffOverlay : null
}

export function updateRouteTraceOverlayFrame(now: number = performance.now()): void {
    const update = routeTraceOverlayUpdater || updateRouteTraceOverlayPositions
    update(now)
}

export function updateArrivalHandoffOverlayFrame(now: number = performance.now()): void {
    const update = arrivalHandoffOverlayUpdater || updateArrivalHandoffOverlay
    update(now)
}

// ── Re-export bridge (W53 follow-up to 01c671e) ──────────────────────────────
// Pre-lazy-load, webgl.ts re-exported these overlay-management functions directly
// from route-trace + arrival-handoff. The lazy-load refactor rerouted ALL webgl.ts
// forwarders through this adapter's `typeof import(...)`, yet only the 3 names above
// (`setRouteArrivalOverlayUpdaters`, `updateRouteTraceOverlayFrame`,
// `updateArrivalHandoffOverlayFrame`) were exposed as `export`s — so the 14 webgl
// forwarders that reached for `mod.removeRouteTraceOverlay()` / `mod.setRoute-
// ChoreographyPhase()` / etc. produced 13 `Property 'X' does not exist on typeof
// import(route-arrival-overlay-adapter)` errors AND functionally no-op'd via optional
// chaining. Re-export the overlay-management surface required by the webgl lazy
// tier so typeof-import resolves them again.
//
// `updateArrivalHandoffOverlay` + `updateRouteTraceOverlayPositions` are already
// imported above (used by the Frame-function fallback paths); re-export those local
// bindings. The other 9 names are first pulled in here purely for the public surface.
export {
    updateArrivalHandoffOverlay,
    removeArrivalHandoffOverlay,
    buildArrivalHandoffOverlay,
    disposeArrivalHandoffOverlay,
    syncArrivalHandoffOverlay
} from '@lib/journey/arrival-handoff'
export {
    updateRouteTraceOverlayPositions,
    resetRouteTraceDiagnostics,
    removeRouteTraceOverlay,
    setRouteChoreographyPhase,
    refreshRouteTraceOverlay,
    initRouteTraceSubscriptions
} from '@lib/journey/route-trace'
