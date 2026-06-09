/**
 * js/modules/journey-webgl.ts
 *
 * Re-exports from journey-route-trace, journey-arrival-handoff, and journey-semantic-overlay.
 * Canonical TS module — preserves export/import parity with the prior
 * journey-webgl.js twin.
 */

import { updateRouteTraceOverlayPositions } from './journey-route-trace.js';
import { updateArrivalHandoffOverlay } from './journey-arrival-handoff.js';
import { setRouteArrivalOverlayUpdaters } from './route-arrival-overlay-adapter.js';

export {
    resetRouteTraceDiagnostics,
    removeRouteTraceOverlay,
    setRouteChoreographyPhase,
    refreshRouteTraceOverlay,
    updateRouteTraceOverlayPositions,
    initRouteTraceSubscriptions
} from './journey-route-trace.js'

export {
    removeArrivalHandoffOverlay,
    buildArrivalHandoffOverlay,
    disposeArrivalHandoffOverlay,
    syncArrivalHandoffOverlay,
    updateArrivalHandoffOverlay
} from './journey-arrival-handoff.js'

export {
    resetFocusThreadDiagnostics,
    removeFocusSemanticOverlay,
    refreshFocusSemanticOverlay,
    updateFocusSemanticOverlayPositions,
    getSemanticFocusCueProbeSnapshot
} from './journey-semantic-overlay.js'

setRouteArrivalOverlayUpdaters({
    updateRouteTraceOverlayPositions,
    updateArrivalHandoffOverlay
});
