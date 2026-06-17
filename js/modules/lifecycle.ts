/**
 * js/modules/lifecycle.ts
 *
 * TypeScript shadow of lifecycle.js.
 * Semantic Demo Lifecycle & Global State Bridge.
 * Thin facade: re-exports from extracted sub-modules + remaining local logic.
 */
import { state } from '@lib/engine/state-bridge'
import { publish, EVENTS } from '@lib/orchestration/event-bus'
import { switchView, showViewHandoff, hideViewHandoff } from '@lib/orchestration/view-controller'
import { updateSelectedBusiness, syncFocusStage } from '@lib/journey/selected-card'
import { walkThreadNeighbor } from '@lib/journey/thread-settler'
import { traverseNeighbor } from '../../src/lib/journey/thread-settler-adapter'
import { clearSearch } from '@lib/engine/search-state-bridge'
import { getPanelSurfaceDetailFromMobileSheet } from '@lib/search/search-panel-adapter'
import { derivePanelSurface } from '@lib/orchestration/composition-state'
import { focusOnNode } from '@lib/engine/camera-controls'
import { hideSummaryCard as hideSummaryCardImpl } from '../../src/lib/journey/semantic-guide.ts'
import {
    showExperienceToast as showExperienceToastImpl,
    syncSearchStatusForFocus as syncSearchStatusForFocusImpl
} from '@lib/ui/ui-feedback'
import {
    probeSemanticLane as probeSemanticLaneImpl,
    scheduleSemanticLaneMonitor as scheduleSemanticLaneMonitorImpl,
    setSemanticLaneUiState as setSemanticLaneUiStateImpl
} from '@lib/orchestration/semantic-lane'
import {
    dispatchNavTransition as dispatchNavTransitionImpl,
    NAV_TRANSITION_ACTIONS as NAV_TRANSITION_ACTIONS_IMPL,
    type NavTransitionAction
} from '@lib/stores/navigation.svelte'
import { appState } from '@lib/state/app.svelte'
// ── Re-exports from extracted sub-modules ────────────────────────────────────
import {
    MODE_DESCRIPTIONS,
    STORY_DESCRIPTIONS,
    refreshCompositionState,
    setMyceliumMode,
    setTrailDepth,
    resetExplorationFocus as _resetExplorationFocusImpl,
    resetNodePositions,
    resetExperienceState,
    returnToOverview as _returnToOverviewImpl
} from '@lib/stores/lifecycle'

// ── Pass-through re-exports ─────────────────────────────────────────────────

export { syncFocusStage, clearSearch }

export { copyCurrentViewLink } from '@lib/orchestration/url-state'
export { clearExplorationFocusSelection } from '@lib/orchestration/url-state'
export {
    executeJourneyCompassAction,
    updateJourneyCompass
} from '@lib/orchestration/compass-controller'
export { getJourneyCompassState } from '@lib/orchestration/compass-state'

// ── Re-exports from extracted sub-modules ────────────────────────────────────
export {
    MODE_DESCRIPTIONS,
    STORY_DESCRIPTIONS,
    refreshCompositionState,
    setMyceliumMode,
    setTrailDepth,
    _resetExplorationFocusImpl as resetExplorationFocus,
    resetNodePositions,
    resetExperienceState
};

// ── Thin proxy wrappers ─────────────────────────────────────────────────────

export function updateExplorationUi(): void {
    refreshCompositionState()
}

export function setSemanticDiveMode(enabled: boolean): void {
    const nextActive = !!enabled
    state.semanticDiveMode = nextActive
    if (nextActive) {
        if (document.body) document.body.dataset.semanticDive = 'transitioning'
        setTrailDepth(2, { fromUserGesture: true })
        window.setTimeout(() => {
            if (appState.semanticDiveMode && document.body?.dataset.semanticDive === 'transitioning') {
                document.body.dataset.semanticDive = 'active'
            }
        }, 820)
    } else {
        setTrailDepth(1, { allowDiveExit: true, skipUrlSync: true })
    }
    updateExplorationUi()
}

export function dispatchNavTransition(action: NavTransitionAction, payload: any = {}): any {
    if (typeof dispatchNavTransitionImpl === 'function') {
        return dispatchNavTransitionImpl(action as any, payload)
    }
    return { handled: false, noOp: true, reason: 'uninitialized' }
}

export const NAV_TRANSITION_ACTIONS = NAV_TRANSITION_ACTIONS_IMPL

export { switchView, showViewHandoff, hideViewHandoff }

export function getMobileSearchSheetDetail(): any {
    return getPanelSurfaceDetailFromMobileSheet()
}

export { derivePanelSurface }

export function deriveLifecyclePanelSurfaceContext({ hasSearchIntent = false, hasFocus = false } = {}): string {
    let context = 'idle'
    if (hasFocus) context = 'focus'
    if (hasSearchIntent && hasFocus) context = 'focus-search'
    if (hasSearchIntent) return hasFocus ? 'focus-search' : 'search'
    return context
}

export function probeSemanticLane(options: any = {}): Promise<any> {
    if (typeof probeSemanticLaneImpl === 'function') {
        return probeSemanticLaneImpl(options)
    }
    return Promise.resolve(null)
}

export function scheduleSemanticLaneMonitor(): void {
    if (typeof scheduleSemanticLaneMonitorImpl === 'function') {
        scheduleSemanticLaneMonitorImpl()
    }
}

export function setSemanticLaneUiState(laneState: string, options: any = {}): void {
    if (typeof setSemanticLaneUiStateImpl === 'function') {
        setSemanticLaneUiStateImpl(laneState, options)
    }
}

export function syncSearchStatusForFocus(point: any, options: any = {}): void {
    syncSearchStatusForFocusImpl(point, options)
}

export function hideSummaryCard(): void {
    return hideSummaryCardImpl()
}

export function showExperienceToast(message: string, detail: string): void {
    return showExperienceToastImpl(message, detail)
}

export function hydrateLeadContext(point: any): void {
    if (!point) return
    syncFocusStage(point)
    updateSelectedBusiness(point, { revealCard: true })
    publish(EVENTS.COMPOSITION_UPDATED)
}

export function exploreInsideToNextStop(): void {
    if (appState.strandContinuityState?.phase === 'exploring') return
    if (
        appState.semanticDiveMode &&
        Number.isFinite(appState.inspectedThreadIndex) &&
        document.body?.dataset.threadInspectSurface === 'inside-cue'
    ) {
        if (typeof walkThreadNeighbor === 'function')
            walkThreadNeighbor(appState.inspectedThreadIndex!, { surface: 'inside-cue' })
        return
    }
    if (typeof traverseNeighbor === 'function') traverseNeighbor(1)
}

export function focusOnPoint(point: any, options: any = {}): boolean {
    if (!point) return false
    const pointIndex = appState.points.indexOf(point)
    state.selectedPoint = point
    if (pointIndex >= 0) return focusOnNode(pointIndex, options)
    updateSelectedBusiness(point, options)
    if (!options.skipUrlSync) {
        publish(EVENTS.CAMERA_NODE_FOCUSED, { point, options })
    }
    return true
}
