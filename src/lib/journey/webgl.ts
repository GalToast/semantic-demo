/**
 * @lib/journey/webgl.ts
 *
 * Ported from: js/modules/journey-webgl.ts
 * Barrel re-exports from route-trace, arrival-handoff, and semantic-overlay.
 * Side effect at module scope wires the route-trace and arrival-handoff updaters
 * into the overlay system.
 */

import { updateRouteTraceOverlayPositions } from './route-trace';
import { updateArrivalHandoffOverlay } from './arrival-handoff';
import { setRouteArrivalOverlayUpdaters } from '../../../js/modules/route-arrival-overlay-adapter';

export {
    resetRouteTraceDiagnostics,
    removeRouteTraceOverlay,
    setRouteChoreographyPhase,
    refreshRouteTraceOverlay,
    updateRouteTraceOverlayPositions,
    initRouteTraceSubscriptions
} from './route-trace';

export {
    removeArrivalHandoffOverlay,
    buildArrivalHandoffOverlay,
    disposeArrivalHandoffOverlay,
    syncArrivalHandoffOverlay,
    updateArrivalHandoffOverlay
} from './arrival-handoff';

export {
    resetFocusThreadDiagnostics,
    removeFocusSemanticOverlay,
    refreshFocusSemanticOverlay,
    updateFocusSemanticOverlayPositions,
    getSemanticFocusCueProbeSnapshot
} from '../../../js/modules/journey-semantic-overlay';

setRouteArrivalOverlayUpdaters({
    updateRouteTraceOverlayPositions,
    updateArrivalHandoffOverlay
});
