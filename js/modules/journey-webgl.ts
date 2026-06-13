/**
 * js/modules/journey-webgl.ts
 *
 * Re-exports from journey-route-trace, journey-arrival-handoff, and journey-semantic-overlay.
 * Canonical TS module — preserves export/import parity with the prior
 * journey-webgl.js twin.
 */

import { updateRouteTraceOverlayPositions } from './journey-route-trace.ts';
import { updateArrivalHandoffOverlay } from './journey-arrival-handoff.ts';
import { setRouteArrivalOverlayUpdaters } from './route-arrival-overlay-adapter.ts';

export {
    resetRouteTraceDiagnostics,
    removeRouteTraceOverlay,
    setRouteChoreographyPhase,
    refreshRouteTraceOverlay,
    updateRouteTraceOverlayPositions,
    initRouteTraceSubscriptions
} from './journey-route-trace.ts'

export {
    removeArrivalHandoffOverlay,
    buildArrivalHandoffOverlay,
    disposeArrivalHandoffOverlay,
    syncArrivalHandoffOverlay,
    updateArrivalHandoffOverlay
} from './journey-arrival-handoff.ts'

export {
    resetFocusThreadDiagnostics,
    removeFocusSemanticOverlay,
    refreshFocusSemanticOverlay,
    updateFocusSemanticOverlayPositions,
    getSemanticFocusCueProbeSnapshot
} from './journey-semantic-overlay.ts'

setRouteArrivalOverlayUpdaters({
    updateRouteTraceOverlayPositions,
    updateArrivalHandoffOverlay
});
