/**
 *
 *
 * Re-exports from journey-route-trace, journey-arrival-handoff, and journey-semantic-overlay.
 * Canonical TS module — preserves export/import parity with the prior
 * journey-webgl.js twin.
 */

import { updateRouteTraceOverlayPositions } from '@lib/journey/route-trace';
import { updateArrivalHandoffOverlay } from '@lib/journey/arrival-handoff';
import { setRouteArrivalOverlayUpdaters } from '@lib/journey/route-arrival-overlay-adapter';

export {
    resetRouteTraceDiagnostics,
    removeRouteTraceOverlay,
    setRouteChoreographyPhase,
    refreshRouteTraceOverlay,
    updateRouteTraceOverlayPositions,
    initRouteTraceSubscriptions
} from '@lib/journey/route-trace'

export {
    removeArrivalHandoffOverlay,
    buildArrivalHandoffOverlay,
    disposeArrivalHandoffOverlay,
    syncArrivalHandoffOverlay,
    updateArrivalHandoffOverlay
} from '@lib/journey/arrival-handoff'

export {
    resetFocusThreadDiagnostics,
    removeFocusSemanticOverlay,
    refreshFocusSemanticOverlay,
    updateFocusSemanticOverlayPositions,
    getSemanticFocusCueProbeSnapshot
} from '@lib/journey/semantic-overlay'

setRouteArrivalOverlayUpdaters({
    updateRouteTraceOverlayPositions,
    updateArrivalHandoffOverlay
});
