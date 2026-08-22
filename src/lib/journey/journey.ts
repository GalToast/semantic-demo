/**
 * src/lib/journey/journey.ts
 *
 * TypeScript port of
 * Facade module for the Semantic Journey / Exploration Trail feature set.
 */

import { get } from 'svelte/store'
import { appState as state } from '@lib/state/app.svelte'

import { engineStatusStore } from '@lib/stores/engine.svelte.ts'

import { subscribeKeyed, publish, EVENTS } from '@lib/orchestration/event-bus'
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
} from '@lib/engine/journey-webgl-lazy'
import {
    normalizeLeadId,
    buildSpatialGrid,
    buildProjectedNeighborGrid,
    getProjectedNeighborCandidates,
    getGeometricThreadCandidates,
    getSemanticThreadCandidates,
    getThreadCandidatesForIndex
} from './thread-model'
import {
    initJourneyTimerAdapter,
    getStrandArrivalNote,
    getInsideRelationshipLabel,
    summarizeNeighborReason,
    walkThreadNeighbor,
    traverseNeighbor,
    previewInsideNextThread
} from './thread-settler'
import {
    getThreadInspectionState,
    inspectThreadNeighbor,
    pinThreadNeighbor,
    unpinThreadInspection,
    scheduleCanvasThreadInspectionClear,
    clearThreadInspection
} from './thread-inspector-state'
import { renderThreadInspection } from './thread-inspector-render'
import { setStrandContinuityState, clearStrandContinuityState } from '@lib/utils/strand-continuity'
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
} from '@lib/journey/neighborhood'
import { updateSelectedBusiness, syncFocusStage } from '@lib/journey/selected-card'
import {
    updateSelectedCardHeading,
    renderSelectedMetaStrip,
    renderSelectedMatchPanel,
    renderSelectedActionRow,
    syncSelectedCardContentVariant
} from '@lib/focus/stage-renderer'
import {
    isCondensedFocusStageViewport,
    hasColdDegradedSemanticFallback,
    updateTraversalUi,
    shouldUseFloatingFocusJourneyOnly
} from '@lib/journey/focus-ui'
import {
    ensureCanvasNodeInteractionBindings as _ensureCanvasNodeInteractionBindings,
    isThreadCandidateVisibleOnCanvas as _isThreadCandidateVisibleOnCanvas,
    initJourneyCanvasInteractionAdapter
} from '@lib/journey/canvas-interaction'

export function isThreadCandidateVisibleOnCanvas(index: number, margin: number = 18): boolean {
    return _isThreadCandidateVisibleOnCanvas(index, margin)
}
export function ensureCanvasNodeInteractionBindings(): void {
    _ensureCanvasNodeInteractionBindings()
}
import { applyLocalNeighborhoodFocus } from '@lib/journey/focus-pocket'
import { describeThreadLensForPoint } from './thread-lens'
// P3-LCP: point-color lazified — see stores/lifecycle pattern. Journey is engine-lazy
// (Canvas) so not boot-critical, but keep the same deferred shape for consistency.
function applyPointFilterColorsLazy(): void { void import('./point-color').then(m=>m.applyPointFilterColors()).catch(()=>{}) }
import {
    scheduleJourneyFocusTimer
} from './journey-focus-timers'
import { truncateMicrocopy, getSharedTrailTopicLabel } from '@lib/journey/text-helpers'
import { setSemanticDiveMode as setSemanticDiveModeImpl } from '@lib/orchestration/lifecycle'

export { disposeJourneyFocusTimers } from './journey-focus-timers'

subscribeKeyed('journey:CAMERA_NODE_FOCUSED', EVENTS.CAMERA_NODE_FOCUSED, (payload: Record<string, unknown>) => {
    const index = typeof payload.index === 'number' ? payload.index : NaN
    if (Number.isFinite(index)) {
        const strandState = state.strandContinuityState as { phase?: string; targetIndex?: number | null } | null
        if (
            strandState?.phase === 'exploring' &&
            Number.isFinite(strandState.targetIndex) &&
            strandState.targetIndex !== index
        ) {
            return
        }
        // Defer the heavier trail-seed computation to avoid a reactive/effect
        // cascade while the camera focus choreographer is still in the same
        // synchronous publish block (W46 fix). FocusPocket.svelte watches
        // threadCandidates and will rebuild the pocket once the deferred work
        // populates it. When the engine/FocusPocket effect is not active (e.g.
        // headless tests that call __navActions__.focusOnNode without mounting
        // the scene), we still need to populate the pocket here.
        scheduleJourneyFocusTimer(0, () => {
            // M12: liveness guard — a superseding CAMERA_NODE_FOCUSED in the
            // same publish block (or a navigation/mode-switch in this tick)
            // would leave this deferred callback to rebuild the trail seed +
            // focus pocket for a stale index. Re-check focusedIndex matches,
            // mirroring the sibling tryBuild retry at :146.
            if (state.navState.focusedIndex !== index) return
            setTrailFromSeed(index)
            const engineIsReady = get(engineStatusStore) === 'ready'
            if (!engineIsReady) {
                applyLocalNeighborhoodFocus(index)
            }
        })
        updateTrailIndices(index)
        const built = applyLocalNeighborhoodFocus(index)
        // F15 determinism: headless tests may fire focus before the data-worker
        // has populated originalPositions. If the synchronous build fails, retry
        // a bounded number of times so the focus pocket is never left empty.
        if (!built) {
            let attempts = 0
            const tryBuild = (): void => {
                attempts += 1
                if (attempts > 10) return
                if (state.navState.focusedIndex !== index) return
                if ((state.navState.focusPocketIndices || []).length > 0) return
                if (applyLocalNeighborhoodFocus(index)) return
                scheduleJourneyFocusTimer(200, tryBuild)
            }
            scheduleJourneyFocusTimer(200, tryBuild)
        }
    }
})

export function initJourneyState(): void {
    {
        state.trailIndices = state.trailIndices ?? new Set<number>()
        state.focusState.inspectedThreadIndex ??= null
        state.focusState.pinnedThreadIndex ??= null
        state.canvasThreadInspectionClearTimer ??= null
        state.focusState.threadInspectorPointerInside ??= false
        state.focusState.inspectedStrandDiagnostics ??= {
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
        // bloomIndices / bridgeIndices retired 2026-08-07 (semantic-signal component never wired)
        state.projectedNeighborGrid ??= null
        state.projectedNeighborCache ??= new Map()
        state.canvasThreadInspectionClearTimer ??= null
        state.stableCanvasHover ??= null
        // signalScores / bridgeScores retired 2026-08-07 (semantic-signal component never wired)
        state.semanticDiveMode ??= false
        state.focusState.pocketTransitionStartedAt ??= 0
        state.focusState.pocketMotionByIndex ??= new Map()
    }
}

globalThis.queueMicrotask(() => {
    initJourneyState()
    initJourneyNeighborhoodAdapter({
        isThreadCandidateVisibleOnCanvas: _isThreadCandidateVisibleOnCanvas,
        setTrailFromSeed,
        applyLocalNeighborhoodFocus
    })
    initJourneyCanvasInteractionAdapter({
        summarizeNeighborReason: summarizeNeighborReason as unknown as (candidate: unknown) => string,
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

function restoreFocusTrailState(priorFocused: number | null = state.focusedNode): void {
    if (!Number.isFinite(priorFocused) || priorFocused! < 0 || priorFocused! >= state.points.length) return
    setTrailFromSeed(priorFocused!)

    publish(EVENTS.EXPLORATION_FOCUS_SYNC, { index: priorFocused! })

    {
        state.navState.lastTraversalReason = state.navState?.lastTraversalReason || null
    }
    updateTrailIndices(priorFocused!)
    refreshFocusSemanticOverlay()
    applyLocalNeighborhoodFocus(priorFocused!)
    applyPointFilterColorsLazy()
    const priorPoint = state.points[priorFocused!] || null
    syncFocusStage(priorPoint || state.focusState.selectedPoint || null)
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
    updateTraversalUi,
    applyPointFilterColorsLazy as applyPointFilterColors,
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
