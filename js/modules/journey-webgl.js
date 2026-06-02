export {
    resetRouteTraceDiagnostics,
    removeRouteTraceOverlay,
    setRouteChoreographyPhase,
    refreshRouteTraceOverlay,
    updateRouteTraceOverlayPositions,
    initRouteTraceSubscriptions
} from './journey-route-trace.js';

export {
    removeArrivalHandoffOverlay,
    buildArrivalHandoffOverlay,
    disposeArrivalHandoffOverlay,
    syncArrivalHandoffOverlay,
    updateArrivalHandoffOverlay
} from './journey-arrival-handoff.js';

export {
    resetFocusThreadDiagnostics,
    removeFocusSemanticOverlay,
    refreshFocusSemanticOverlay,
    updateFocusSemanticOverlayPositions,
    getSemanticFocusCueProbeSnapshot
} from './journey-semantic-overlay.js';

import {
    updateRouteTraceOverlayPositions
} from './journey-route-trace.js';

import {
    disposeArrivalHandoffOverlay,
    syncArrivalHandoffOverlay,
    updateArrivalHandoffOverlay
} from './journey-arrival-handoff.js';

import { setRouteArrivalOverlayUpdaters } from './route-arrival-overlay-adapter.js';

setRouteArrivalOverlayUpdaters({
    updateRouteTraceOverlayPositions,
    updateArrivalHandoffOverlay
});

// Window exposures for inline scripts and compatibility
if (typeof window !== 'undefined') {
    window.syncArrivalHandoffOverlay = syncArrivalHandoffOverlay;
    window.disposeArrivalHandoffOverlay = disposeArrivalHandoffOverlay;
}
