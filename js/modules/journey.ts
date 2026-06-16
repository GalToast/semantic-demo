/**
 * js/modules/journey.ts
 *
 * TypeScript shadow of journey.js.
 * Facade module for the Semantic Journey / Exploration Trail feature set.
 */
import { state, withStateMutation } from '../state.ts'

import { subscribe, publish, EVENTS } from '@lib/orchestration/event-bus'
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
} from './journey-webgl.ts'
import {
    normalizeLeadId,
    buildSpatialGrid,
    buildProjectedNeighborGrid,
    getProjectedNeighborCandidates,
    getGeometricThreadCandidates,
    getSemanticThreadCandidates,
    getThreadCandidatesForIndex
} from './journey-thread-model.ts'
import {
    initJourneyTimerAdapter,
    getStrandArrivalNote,
    getInsideRelationshipLabel,
    summarizeNeighborReason,
    walkThreadNeighbor
} from './journey-thread-settler.ts'
import { traverseNeighbor, previewInsideNextThread } from '../../src/lib/journey/thread-settler-adapter'
import {
    getThreadInspectionState,
    renderThreadInspection,
    inspectThreadNeighbor,
    pinThreadNeighbor,
    unpinThreadInspection,
    scheduleCanvasThreadInspectionClear,
    clearThreadInspection
} from './thread-inspector.ts'
import { setStrandContinuityState, clearStrandContinuityState } from './strand-continuity.ts'
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
} from './journey-neighborhood.ts'
import { initJourneySelectedCardAdapter, updateSelectedBusiness, syncFocusStage } from './journey-selected-card.ts'
import {
    updateSelectedCardHeading,
    renderSelectedMetaStrip,
    renderSelectedMatchPanel,
    renderSelectedActionRow,
    syncSelectedCardContentVariant
} from './ui-renderers.ts'
import {
    isCondensedFocusStageViewport,
    hasColdDegradedSemanticFallback,
    updateFocusNeighborRail,
    updateTraversalUi,
    initFocusNeighborRailSubscriptions,
    shouldUseFloatingFocusJourneyOnly
} from './journey-focus-ui.ts'
import {
    initJourneyCanvasInteractionAdapter,
    isThreadCandidateVisibleOnCanvas as isCanvasThreadCandidateVisibleOnCanvas,
    ensureCanvasNodeInteractionBindings as ensureCanvasNodeInteractionBindingsImpl
} from './journey-canvas-interaction.ts'

export function isThreadCandidateVisibleOnCanvas(index: number, margin: number = 18): boolean {
    return isCanvasThreadCandidateVisibleOnCanvas(index, margin);
}
export function ensureCanvasNodeInteractionBindings(): void {
    ensureCanvasNodeInteractionBindingsImpl();
}
import { applyLocalNeighborhoodFocus } from '@lib/journey/focus-pocket'
import { applyPointFilterColors, describeThreadLensForPoint } from './journey-point-color.ts';
import { truncateMicrocopy, getSharedTrailTopicLabel } from './journey-text-helpers.ts'
import { setSemanticDiveMode as setSemanticDiveModeImpl } from './lifecycle.ts'
import { appState } from '@lib/state/app.svelte';

subscribe(EVENTS.CAMERA_NODE_FOCUSED, (payload: any) => {
    const index = payload.index
    if (Number.isFinite(index)) {
        const strandState = state.strandContinuityState as { phase?: string; targetIndex?: number | null } | null
        if (
            strandState?.phase === 'exploring' &&
            Number.isFinite(strandState.targetIndex) &&
            strandState.targetIndex !== index
        ) {
            return
        }
        setTrailFromSeed(index)
        updateTrailIndices(index)
    }
})

export function initJourneyState(): void {
    state.trailIndices = state.trailIndices || new Set()
    ;(state as any).inspectedThreadIndex ??= null
    ;(state as any).pinnedThreadIndex ??= null
    ;(state as any).canvasThreadInspectionClearTimer ??= null
    ;(state as any).threadInspectorPointerInside ??= false
    ;(state as any).inspectedStrandDiagnostics ??= { active: false }
    ;(state as any).arrivalHandoffDiagnostics ??= {
        active: false,
        fromIndex: null,
        targetIndex: null,
        phase: 'idle',
        segmentCount: 0,
        endpointCount: 0,
        opacity: 0
    }
    ;(state as any).strandContinuityState ??= { phase: 'idle', targetIndex: null, fromIndex: null, reason: '', startedAt: 0 }
    state.myceliumMode ??= 'default'
    ;(state as any).bloomIndices ??= new Set()
    ;(state as any).bridgeIndices ??= new Set()
    state.projectedNeighborGrid ??= null
    state.projectedNeighborCache ??= new Map()
    ;(state as any).canvasFieldHoverClearTimer ??= null
    ;(state as any).stableCanvasHover ??= null
    state.pointIndexByLeadId ??= new Map()
    ;(state as any).signalScores ??= []
    ;(state as any).bridgeScores ??= []
    state.semanticDiveMode ??= false
    state.focusPocketTransitionStartedAt ??= 0
    state.focusPocketMotionByIndex ??= new Map()
}

globalThis.queueMicrotask(() => {
    initJourneyState()
    initJourneyNeighborhoodAdapter({
        isThreadCandidateVisibleOnCanvas: isCanvasThreadCandidateVisibleOnCanvas,
        setTrailFromSeed,
        applyLocalNeighborhoodFocus
    })
    initJourneySelectedCardAdapter({
        getStrandArrivalNote,
        updateTraversalUi
    })
    initJourneyCanvasInteractionAdapter({
        summarizeNeighborReason,
        walkThreadNeighbor: (index, options) => !!walkThreadNeighbor(index, options),
        inspectThreadNeighbor,
        scheduleCanvasThreadInspectionClear
    })
})

export function setSemanticDiveMode(enabled: boolean): boolean {
    setSemanticDiveModeImpl(enabled)
    const active = Boolean(enabled)
    if (active) {
        previewInsideNextThread({ force: true })
    } else if (document.body?.dataset.threadInspectSurface === 'inside-cue') {
        clearThreadInspection({ force: true, preserveJourney: true })
    } else {
        clearThreadInspection({ force: true, preserveJourney: false })
    }
    return true
}

export function setTrailDepth(depth: number, options: any = {}): void {
    publish(EVENTS.TRAIL_DEPTH_UPDATE_REQUESTED, { depth, options })
}

function restoreFocusTrailState(priorFocused: number | null = appState.focusedNode): void {
    if (!Number.isFinite(priorFocused) || priorFocused! < 0 || priorFocused! >= appState.points.length) return
    setTrailFromSeed(priorFocused!)

    publish(EVENTS.EXPLORATION_FOCUS_SYNC, { index: priorFocused, point: appState.points[priorFocused!] })

    withStateMutation(() => {
        state.navState.lastTraversalReason = appState.navState?.lastTraversalReason || null
    })
    updateTrailIndices(priorFocused!)
    refreshFocusSemanticOverlay()
    applyLocalNeighborhoodFocus(priorFocused!)
    applyPointFilterColors()
    const priorPoint = appState.points[priorFocused!] || null
    syncFocusStage(priorPoint || appState.selectedPoint || null)
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
    previewInsideNextThread
};
