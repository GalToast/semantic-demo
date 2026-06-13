/**
 * src/lib/journey/journey.ts
 *
 * TypeScript port of js/modules/journey.ts.
 * Facade module for the Semantic Journey / Exploration Trail feature set.
 */
import { state, withStateMutation } from '@legacy/state'
import { getFocusedNode, getPoints, getNavState, getSelectedPoint } from '@legacy/state/selectors'
import { subscribe, publish, EVENTS } from '@legacy/modules/event-bus'
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
} from '@legacy/modules/journey-webgl'
import {
    normalizeLeadId,
    buildSpatialGrid,
    buildProjectedNeighborGrid,
    getProjectedNeighborCandidates,
    getGeometricThreadCandidates,
    getSemanticThreadCandidates,
    getThreadCandidatesForIndex
} from '@legacy/modules/journey-thread-model'
import {
    initJourneyTimerAdapter,
    getStrandArrivalNote,
    getInsideRelationshipLabel,
    summarizeNeighborReason,
    walkThreadNeighbor
} from '@legacy/modules/journey-thread-settler'
import { traverseNeighbor, previewInsideNextThread } from './thread-settler-adapter'
import {
    getThreadInspectionState,
    renderThreadInspection,
    inspectThreadNeighbor,
    pinThreadNeighbor,
    unpinThreadInspection,
    scheduleCanvasThreadInspectionClear,
    clearThreadInspection
} from '@legacy/modules/thread-inspector'
import { setStrandContinuityState, clearStrandContinuityState } from '@legacy/modules/strand-continuity'
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
} from '@legacy/modules/journey-neighborhood'
import { updateSelectedBusiness, syncFocusStage } from '@legacy/modules/journey-selected-card'
import {
    updateSelectedCardHeading,
    renderSelectedMetaStrip,
    renderSelectedMatchPanel,
    renderSelectedActionRow,
    syncSelectedCardContentVariant
} from '@legacy/modules/ui-renderers'
import {
    isCondensedFocusStageViewport,
    hasColdDegradedSemanticFallback,
    updateFocusNeighborRail,
    updateTraversalUi,
    initFocusNeighborRailSubscriptions,
    shouldUseFloatingFocusJourneyOnly
} from '@legacy/modules/journey-focus-ui'
import {
    ensureCanvasNodeInteractionBindings as _ensureCanvasNodeInteractionBindings,
    isThreadCandidateVisibleOnCanvas as _isThreadCandidateVisibleOnCanvas,
    initJourneyCanvasInteractionAdapter
} from '@legacy/modules/journey-canvas-interaction'

export function isThreadCandidateVisibleOnCanvas(index: number, margin: number = 18): boolean {
    return _isThreadCandidateVisibleOnCanvas(index, margin)
}
export function ensureCanvasNodeInteractionBindings(): void {
    _ensureCanvasNodeInteractionBindings()
}
import { applyLocalNeighborhoodFocus } from '@legacy/modules/focus-pocket'
import { applyPointFilterColors, describeThreadLensForPoint } from '@legacy/modules/journey-point-color'
import { truncateMicrocopy, getSharedTrailTopicLabel } from '@legacy/modules/journey-text-helpers'
import { setSemanticDiveMode as setSemanticDiveModeImpl } from '@legacy/modules/lifecycle'

subscribe(EVENTS.CAMERA_NODE_FOCUSED, (payload: Record<string, unknown>) => {
    const index = typeof payload.index === 'number' ? payload.index : NaN
    if (Number.isFinite(index)) {
        setTrailFromSeed(index)
        updateTrailIndices(index)
    }
})

export function initJourneyState(): void {
    withStateMutation(() => {
        state.trailIndices = state.trailIndices ?? new Set<number>()
        state.inspectedThreadIndex ??= null
        state.pinnedThreadIndex ??= null
        state.canvasThreadInspectionClearTimer ??= null
        state.threadInspectorPointerInside ??= false
        state.inspectedStrandDiagnostics ??= {
            active: false,
            source: 'idle',
            index: null,
            focusedIndex: null,
            segmentCount: 0,
            endpointCount: 0,
            braidCount: 0
        }
        state.arrivalHandoffDiagnostics ??= {
            active: false,
            fromIndex: null,
            targetIndex: null,
            phase: 'idle',
            segmentCount: 0,
            endpointCount: 0,
            opacity: 0
        }
        state.strandContinuityState ??= {
            phase: 'idle',
            targetIndex: null,
            fromIndex: null,
            reason: '',
            startedAt: 0,
            arrivalTimeoutId: undefined,
            settleTimeoutId: undefined
        }
        state.myceliumMode ??= 'default'
        state.bloomIndices ??= new Set<number>()
        state.bridgeIndices ??= new Set<number>()
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
    })
}

globalThis.queueMicrotask(() => {
    initJourneyState()
    initJourneyNeighborhoodAdapter({
        isThreadCandidateVisibleOnCanvas: _isThreadCandidateVisibleOnCanvas,
        setTrailFromSeed,
        applyLocalNeighborhoodFocus
    })
    initJourneyCanvasInteractionAdapter({
        summarizeNeighborReason: summarizeNeighborReason as unknown as (
            candidate: Record<string, unknown> | null,
            candidatePoint: Record<string, unknown> | null,
            focusPoint: Record<string, unknown> | null
        ) => string,
        walkThreadNeighbor: (index: number, options?: Record<string, unknown>) => !!walkThreadNeighbor(index, options),
        inspectThreadNeighbor,
        scheduleCanvasThreadInspectionClear
    })
})

export function setSemanticDiveMode(enabled: boolean): boolean {
    setSemanticDiveModeImpl(enabled)
    const active = Boolean(enabled)
    if (active) {
        previewInsideNextThread()
    } else if (document.body?.dataset.threadInspectSurface === 'inside-cue') {
        clearThreadInspection({ force: true, preserveJourney: true })
    } else {
        clearThreadInspection({ force: true, preserveJourney: false })
    }
    return true
}

export function setTrailDepth(depth: number, options: Record<string, unknown> = {}): void {
    publish(EVENTS.TRAIL_DEPTH_UPDATE_REQUESTED, { depth, options })
}

function restoreFocusTrailState(priorFocused: number | null = getFocusedNode()): void {
    if (!Number.isFinite(priorFocused) || priorFocused! < 0 || priorFocused! >= getPoints().length) return
    setTrailFromSeed(priorFocused!)

    publish(EVENTS.EXPLORATION_FOCUS_SYNC, { index: priorFocused! } as never)

    withStateMutation(() => {
        state.navState.lastTraversalReason = getNavState()?.lastTraversalReason || null
    })
    updateTrailIndices(priorFocused!)
    refreshFocusSemanticOverlay()
    applyLocalNeighborhoodFocus(priorFocused!)
    applyPointFilterColors()
    const priorPoint = getPoints()[priorFocused!] || null
    syncFocusStage((priorPoint || getSelectedPoint() || null) as never)
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
}
