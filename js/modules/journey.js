import { state } from '../state.js';
import * as adapter from './journey-lifecycle-adapter.js';
import {
    isCondensedFocusStageViewport,
    hasColdDegradedSemanticFallback,
    shouldUseFloatingFocusJourneyOnly,
    updateFocusNeighborRail,
    updateTraversalUi,
} from './journey-focus-ui.js';
import { applyPointFilterColors, describeThreadLensForPoint } from './journey-point-color.js';
import {
    normalizeLeadId,
    buildSpatialGrid,
    buildProjectedNeighborGrid,
    getProjectedNeighborCandidates,
    getSemanticThreadCandidates,
    getGeometricThreadCandidates,
    getThreadCandidatesForIndex
} from './journey-thread-model.js';
import { truncateMicrocopy, getSharedTrailTopicLabel } from './journey-text-helpers.js';
import { setStrandContinuityState, clearStrandContinuityState } from './strand-continuity.js';
import {
    initJourneyTimerAdapter,
    getStrandArrivalNote,
    getInsideRelationshipLabel,
    getThreadInspectionState,
    summarizeNeighborReason,
    renderThreadInspection,
    inspectThreadNeighbor,
    pinThreadNeighbor,
    unpinThreadInspection,
    scheduleCanvasThreadInspectionClear,
    clearThreadInspection,
    walkThreadNeighbor,
    traverseNeighbor,
    walkInsideToNextStop,
    previewInsideNextThread
} from './journey-thread-settler.js';
import {
    initJourneyNeighborhoodAdapter,
    getSemanticThreadDisplayLimit,
    getNeighborhoodRouteIndices,
    isBoundedNeighborhoodActive,
    getNeighborhoodCandidateForIndex,
    getSemanticNeighborRecordBetween,
    buildNeighborhoodManifest,
    getBoundedNeighborhoodWalkCandidate,
    getNextWalkCandidateForIndex,
    getCurrentTrailFocusIndex,
    ensureBoundedNeighborhoodFromActivePocket,
    primeBoundedSemanticNeighborhoodForTraversal,
    setTrailFromSeed,
    updateTrailIndices
} from './journey-neighborhood.js';
import { initJourneySelectedCardAdapter, syncFocusStage, updateSelectedBusiness } from './journey-selected-card.js';
import {
    initJourneyCanvasInteractionAdapter,
    isThreadCandidateVisibleOnCanvas,
    ensureCanvasNodeInteractionBindings
} from './journey-canvas-interaction.js';
import { dispatchNavTransition, NAV_TRANSITION_ACTIONS } from './lifecycle.js';
import { applyLocalNeighborhoodFocus } from './focus-pocket.js';
import {
    refreshRouteTraceOverlay,
    updateRouteTraceOverlayPositions,
    syncArrivalHandoffOverlay,
    updateArrivalHandoffOverlay,
    disposeArrivalHandoffOverlay,
    refreshFocusSemanticOverlay,
    updateFocusSemanticOverlayPositions,
    removeFocusSemanticOverlay,
    resetFocusThreadDiagnostics,
    resetRouteTraceDiagnostics,
    setRouteChoreographyPhase
} from './journey-webgl.js';

export {
    normalizeLeadId,
    buildSpatialGrid,
    buildProjectedNeighborGrid,
    getProjectedNeighborCandidates,
    getSemanticThreadCandidates,
    getGeometricThreadCandidates,
    getThreadCandidatesForIndex,
    refreshRouteTraceOverlay,
    updateRouteTraceOverlayPositions,
    syncArrivalHandoffOverlay,
    updateArrivalHandoffOverlay,
    disposeArrivalHandoffOverlay,
    refreshFocusSemanticOverlay,
    updateFocusSemanticOverlayPositions,
    removeFocusSemanticOverlay,
    resetFocusThreadDiagnostics,
    resetRouteTraceDiagnostics,
    setRouteChoreographyPhase
};

export {
    isCondensedFocusStageViewport,
    hasColdDegradedSemanticFallback,
    shouldUseFloatingFocusJourneyOnly,
    updateFocusNeighborRail,
    updateTraversalUi,
    applyPointFilterColors,
    describeThreadLensForPoint,
};

export {
    truncateMicrocopy,
    getSharedTrailTopicLabel,
    setStrandContinuityState,
    clearStrandContinuityState,
    getSemanticThreadDisplayLimit,
    getNeighborhoodRouteIndices,
    isBoundedNeighborhoodActive,
    getNeighborhoodCandidateForIndex,
    getSemanticNeighborRecordBetween,
    buildNeighborhoodManifest,
    getBoundedNeighborhoodWalkCandidate,
    getNextWalkCandidateForIndex,
    getCurrentTrailFocusIndex,
    ensureBoundedNeighborhoodFromActivePocket,
    primeBoundedSemanticNeighborhoodForTraversal,
    setTrailFromSeed,
    updateTrailIndices,
    syncFocusStage,
    updateSelectedBusiness,
    isThreadCandidateVisibleOnCanvas,
    ensureCanvasNodeInteractionBindings,
    initJourneyTimerAdapter,
    getStrandArrivalNote,
    getInsideRelationshipLabel,
    getThreadInspectionState,
    summarizeNeighborReason,
    renderThreadInspection,
    inspectThreadNeighbor,
    pinThreadNeighbor,
    unpinThreadInspection,
    scheduleCanvasThreadInspectionClear,
    clearThreadInspection,
    walkThreadNeighbor,
    traverseNeighbor,
    walkInsideToNextStop,
    previewInsideNextThread
};

// Ensure all state variables used are initialized if they weren't in state.js
export function initJourneyState() {
    state.trailIndices = state.trailIndices || new Set();
    state.inspectedThreadIndex ??= null;
    state.pinnedThreadIndex ??= null;
    state.canvasThreadInspectionClearTimer ??= null;
    state.threadInspectorPointerInside ??= false;
    state.inspectedStrandDiagnostics ??= { active: false };
    state.arrivalHandoffDiagnostics ??= { active: false, fromIndex: null, targetIndex: null, phase: 'idle', segmentCount: 0, endpointCount: 0, opacity: 0 };
    state.strandContinuityState ??= { phase: 'idle', targetIndex: null, fromIndex: null, reason: '', startedAt: 0 };
    state.myceliumMode ??= 'default';
    state.bloomIndices ??= new Set();
    state.bridgeIndices ??= new Set();
    state.projectedNeighborGrid ??= null;
    state.projectedNeighborCache ??= new Map();
    state.canvasFieldHoverClearTimer ??= null;
    state.stableCanvasHover ??= null;
    state.pointIndexByLeadId ??= new Map();
    state.signalScores ??= [];
    state.bridgeScores ??= [];
    state.semanticDiveMode ??= false;
    state.focusPocketTransitionStartedAt ??= 0;
    state.focusPocketMotionByIndex ??= new Map();
}

// Auto-init on first import — set up state defaults immediately
initJourneyState();
initJourneyNeighborhoodAdapter({
    isThreadCandidateVisibleOnCanvas,
    setTrailFromSeed,
    applyLocalNeighborhoodFocus: adapter.applyLocalNeighborhoodFocus
});
initJourneySelectedCardAdapter({
    getStrandArrivalNote,
    updateTraversalUi
});
initJourneyCanvasInteractionAdapter({
    summarizeNeighborReason,
    walkThreadNeighbor,
    inspectThreadNeighbor,
    scheduleCanvasThreadInspectionClear
});

// --- Helper Functions ---

// --- Bounded Neighborhood Explored ---

/**
 * Backward-compatible delegating alias for semantic-dive mode.
 * The authoritative implementation lives in lifecycle.js as setSemanticDiveMode().
 * This export exists so any legacy code that imports journey.setSemanticDiveMode
 * directly still routes through the authoritative lifecycle owner.
 *
 * Additional side effects not covered by lifecycle:
 * - previewInsideNextThread (enter): pre-loads next candidate for inside-cue UI
 * - clearThreadInspection  (exit):  clears stale thread overlays
 * These are safe to call redundantly (idempotent checks inside each function).
 */
export function setSemanticDiveMode(enabled) {
    const active = Boolean(enabled);

    // Delegate to lifecycle's authoritative window wrapper — all canonical state
    // management (semanticDiveMode, navState.mode, trailDepth, camera, URL) lives there.
    if (typeof adapter.setSemanticDiveMode === 'function') {
        adapter.setSemanticDiveMode(enabled);
    } else {
        return false;
    }

    // Additional side effects that lifecycle's window wrapper handles via
    // window.previewInsideNextThread / window.clearThreadInspection.
    // Calling them here too is safe (each has idempotent guards) and ensures
    // they run even when the window bridge is absent.
    if (active) {
        previewInsideNextThread({ force: true });
    } else {
        if (document.body.dataset.threadInspectSurface === 'inside-cue') {
            clearThreadInspection({ force: true, preserveJourney: true });
        } else {
            clearThreadInspection({ force: true, preserveJourney: false });
        }
    }
    return true;
}

// --- Original Functions Continued ---

export function restoreFocusTrailState(priorFocused = state.focusedNode) {
    if (!Number.isFinite(priorFocused) || priorFocused < 0 || priorFocused >= state.points.length) return;

    const priorHistory = [...(state.navState.explorationHistoryIndices || [priorFocused])];

    setTrailFromSeed(priorFocused);
    // explorationHistoryIndices is owned by the FOCUS_NODE reducer in navigation-state.js.
    // Route the restore through the canonical dispatch to keep the ownership boundary
    // auditable at the reducer level, matching how RESET_FOCUS clears it explicitly.
    dispatchNavTransition(NAV_TRANSITION_ACTIONS.RESTORE_EXPLORATION_HISTORY, { history: priorHistory });
    state.navState.lastTraversalReason = state.navState.lastTraversalReason || null;

    updateTrailIndices(priorFocused);
    refreshFocusSemanticOverlay();
    applyLocalNeighborhoodFocus(priorFocused);
    applyPointFilterColors();

    const priorPoint = state.points[priorFocused] || null;
    syncFocusStage(priorPoint || state.selectedPoint || null);
    updateTraversalUi();
}
// Window shim for inline script backward compat:
if (typeof window !== 'undefined') {
    window.updateTrailIndices = updateTrailIndices;
    window.updateSelectedBusiness = updateSelectedBusiness;
    window.applyPointFilterColors = applyPointFilterColors;
    window.walkThreadNeighbor = walkThreadNeighbor;
    window.traverseNeighbor = traverseNeighbor;
    window.getCurrentTrailFocusIndex = getCurrentTrailFocusIndex;
    window.getSemanticThreadCandidates = getSemanticThreadCandidates;
    window.getGeometricThreadCandidates = getGeometricThreadCandidates;
    window.getThreadCandidatesForIndex = getThreadCandidatesForIndex;
    window.summarizeNeighborReason = summarizeNeighborReason;
    window.setStrandContinuityState = setStrandContinuityState;
    window.clearStrandContinuityState = clearStrandContinuityState;
    window.renderThreadInspection = renderThreadInspection;
    window.inspectThreadNeighbor = inspectThreadNeighbor;
    window.pinThreadNeighbor = pinThreadNeighbor;
    window.unpinThreadInspection = unpinThreadInspection;
    window.clearThreadInspection = clearThreadInspection;
}
