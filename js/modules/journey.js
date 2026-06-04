import { state } from '../state.js'
import { subscribe, publish, EVENTS } from './event-bus.js'
import {
    resetRouteTraceDiagnostics,
    removeRouteTraceOverlay,
    setRouteChoreographyPhase,
    refreshRouteTraceOverlay,
    updateRouteTraceOverlayPositions,
    refreshFocusSemanticOverlay,
    updateFocusSemanticOverlayPositions,
    removeFocusSemanticOverlay,
    resetFocusThreadDiagnostics,
    syncArrivalHandoffOverlay,
    updateArrivalHandoffOverlay,
    disposeArrivalHandoffOverlay
} from './journey-webgl.js'
import {
    normalizeLeadId,
    buildSpatialGrid,
    buildProjectedNeighborGrid,
    getProjectedNeighborCandidates,
    getGeometricThreadCandidates,
    getSemanticThreadCandidates,
    getThreadCandidatesForIndex
} from './journey-thread-model.js'
import {
    initJourneyTimerAdapter,
    getStrandArrivalNote,
    getInsideRelationshipLabel,
    summarizeNeighborReason,
    walkThreadNeighbor,
    traverseNeighbor,
    walkInsideToNextStop,
    previewInsideNextThread
} from './journey-thread-settler.js'
import {
    getThreadInspectionState,
    renderThreadInspection,
    inspectThreadNeighbor,
    pinThreadNeighbor,
    unpinThreadInspection,
    scheduleCanvasThreadInspectionClear,
    clearThreadInspection
} from './thread-inspector.js'
import { setStrandContinuityState, clearStrandContinuityState } from './strand-continuity.js'
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
} from './journey-neighborhood.js'
import { initJourneySelectedCardAdapter, updateSelectedBusiness, syncFocusStage } from './journey-selected-card.js'
import {
    updateSelectedCardHeading,
    renderSelectedMetaStrip,
    renderSelectedMatchPanel,
    renderSelectedActionRow,
    syncSelectedCardContentVariant
} from './ui-renderers.js'
import {
    isCondensedFocusStageViewport,
    hasColdDegradedSemanticFallback,
    updateFocusNeighborRail,
    updateTraversalUi,
    initFocusNeighborRailSubscriptions,
    shouldUseFloatingFocusJourneyOnly
} from './journey-focus-ui.js'
import {
    initJourneyCanvasInteractionAdapter,
    isThreadCandidateVisibleOnCanvas,
    ensureCanvasNodeInteractionBindings
} from './journey-canvas-interaction.js'
import { applyLocalNeighborhoodFocus } from './focus-pocket.js'
import { applyPointFilterColors, describeThreadLensForPoint } from './journey-point-color.js';
import { truncateMicrocopy, getSharedTrailTopicLabel } from './journey-text-helpers.js'

/**
 * js/modules/journey.js
 *
 * Facade module for the "Semantic Journey" / "Exploration Trail" feature set.
 * Aggregates model, selection, UI, and animation logic for business-to-business
 * transitions.
 */

// Phase 3: Declarative synchronization
subscribe(EVENTS.CAMERA_NODE_FOCUSED, (payload) => {
    const index = payload.index
    if (Number.isFinite(index)) {
        setTrailFromSeed(index)
        updateTrailIndices(index)
    }
})

export function initJourneyState() {
    state.trailIndices = state.trailIndices || new Set()
    state.inspectedThreadIndex ??= null
    state.pinnedThreadIndex ??= null
    state.canvasThreadInspectionClearTimer ??= null
    state.threadInspectorPointerInside ??= false
    state.inspectedStrandDiagnostics ??= { active: false }
    state.arrivalHandoffDiagnostics ??= {
        active: false,
        fromIndex: null,
        targetIndex: null,
        phase: 'idle',
        segmentCount: 0,
        endpointCount: 0,
        opacity: 0
    }
    state.strandContinuityState ??= { phase: 'idle', targetIndex: null, fromIndex: null, reason: '', startedAt: 0 }
    state.myceliumMode ??= 'default'
    state.bloomIndices ??= new Set()
    state.bridgeIndices ??= new Set()
    state.projectedNeighborGrid ??= null
    state.projectedNeighborCache ??= new Map()
    state.canvasFieldHoverClearTimer ??= null
    state.stableCanvasHover ??= null
    state.pointIndexByLeadId ??= new Map()
    state.signalScores ??= []
    state.bridgeScores ??= []
    state.semanticDiveMode ??= false
    state.focusPocketTransitionStartedAt ??= 0
    state.focusPocketMotionByIndex ??= new Map()
}

globalThis.queueMicrotask(() => {
    initJourneyState()
    initJourneyNeighborhoodAdapter({
        isThreadCandidateVisibleOnCanvas,
        setTrailFromSeed,
        applyLocalNeighborhoodFocus
    })
    initJourneySelectedCardAdapter({
        getStrandArrivalNote,
        updateTraversalUi
    })
    initJourneyCanvasInteractionAdapter({
        summarizeNeighborReason,
        walkThreadNeighbor,
        inspectThreadNeighbor,
        scheduleCanvasThreadInspectionClear
    })
})

export function setSemanticDiveMode(enabled) {
    const active = Boolean(enabled)
    publish(EVENTS.DIVE_MODE_REQUESTED, { enabled: active })
    if (active) {
        previewInsideNextThread({ force: true })
    } else if (document.body.dataset.threadInspectSurface === 'inside-cue') {
        clearThreadInspection({ force: true, preserveJourney: true })
    } else {
        clearThreadInspection({ force: true, preserveJourney: false })
    }
    return true
}

export function returnToOverview() {
    publish(EVENTS.OVERVIEW_REQUESTED)
}

export function resetExplorationFocus() {
    publish(EVENTS.EXPLORATION_RESET_REQUESTED)
}

export function setTrailDepth(depth, options = {}) {
    publish(EVENTS.TRAIL_DEPTH_UPDATE_REQUESTED, { depth, options })
}

function restoreFocusTrailState(priorFocused = state.focusedNode) {
    if (!Number.isFinite(priorFocused) || priorFocused < 0 || priorFocused >= state.points.length) return
    setTrailFromSeed(priorFocused)

    // Using global adapter for dispatchNavTransition for now as it is correctly mapped in lifecycle
    publish(EVENTS.EXPLORATION_FOCUS_SYNC, { index: priorFocused, point: state.points[priorFocused] })

    state.navState.lastTraversalReason = state.navState.lastTraversalReason || null
    updateTrailIndices(priorFocused)
    refreshFocusSemanticOverlay()
    applyLocalNeighborhoodFocus(priorFocused)
    applyPointFilterColors()
    const priorPoint = state.points[priorFocused] || null
    syncFocusStage(priorPoint || state.selectedPoint || null)
    updateTraversalUi()
}

export {
    normalizeLeadId,
    buildSpatialGrid,
    buildProjectedNeighborGrid,
    getProjectedNeighborCandidates,
    getGeometricThreadCandidates,
    getSemanticThreadCandidates,
    getThreadCandidatesForIndex,
    resetRouteTraceDiagnostics,
    removeRouteTraceOverlay,
    setRouteChoreographyPhase,
    refreshRouteTraceOverlay,
    updateRouteTraceOverlayPositions,
    syncArrivalHandoffOverlay,
    updateArrivalHandoffOverlay,
    disposeArrivalHandoffOverlay,
    refreshFocusSemanticOverlay,
    updateFocusSemanticOverlayPositions,
    removeFocusSemanticOverlay,
    resetFocusThreadDiagnostics,
    isCondensedFocusStageViewport,
    hasColdDegradedSemanticFallback,
    shouldUseFloatingFocusJourneyOnly,
    initFocusNeighborRailSubscriptions,
    updateFocusNeighborRail,
    updateTraversalUi,
    applyPointFilterColors,
    describeThreadLensForPoint,
    truncateMicrocopy,
    getSharedTrailTopicLabel,
    setStrandContinuityState,
    clearStrandContinuityState,
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
    updateTrailIndices,
    updateSelectedBusiness,
    syncFocusStage,
    updateSelectedCardHeading,
    renderSelectedMetaStrip,
    renderSelectedMatchPanel,
    renderSelectedActionRow,
    syncSelectedCardContentVariant,
    restoreFocusTrailState,
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
    previewInsideNextThread,
    isThreadCandidateVisibleOnCanvas,
    ensureCanvasNodeInteractionBindings
};
