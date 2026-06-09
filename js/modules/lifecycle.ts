// @ts-nocheck
/**
 * js/modules/lifecycle.ts
 *
 * TypeScript shadow of lifecycle.js.
 * Semantic Demo Lifecycle & Global State Bridge.
 * Thin facade: re-exports from extracted sub-modules + remaining local logic.
 */
import { state, withStateMutation } from '../state.ts';
import { publish, subscribe, EVENTS } from './event-bus.ts';
import {
    setLoadingPhase,
    hideLoadingOverlay,
    startDeferredHydration,
    scheduleWeatherHydration
} from './loading-ui.ts';
import {
    startSceneReveal,
    getSceneRevealProgress,
    onWindowResize
} from './scene-reveal.ts';
import {
    copyCurrentViewLink,
    resetStateBeforeUrlRestore,
    clearExplorationFocusSelection
} from './url-state.ts';
import { switchView, showViewHandoff, hideViewHandoff } from './view-controller.ts';
import {
    updateSelectedBusiness,
    syncFocusStage,
    traverseNeighbor,
    walkThreadNeighbor
} from './journey.ts';
import { clearSearch } from './search-state.ts';
import { getPanelSurfaceDetailFromMobileSheet } from './search-panel-adapter.ts';
import { applyCompositionState, derivePanelSurface } from './composition-state.ts';
import {
    focusOnNode
} from './camera-controls.ts';
import {
    updateLegendGuideState,
    closeLegendGuide,
    closeLegendPanel,
    openLegendPanel,
    restoreLegendCollapsedPanel
} from './legend-ui.ts';
import {
    hideSummaryCard as hideSummaryCardImpl
} from './semantic-guide.ts';
import {
    showExperienceToast as showExperienceToastImpl,
    syncSearchStatusForFocus as syncSearchStatusForFocusImpl
} from './ui-feedback.ts';
import {
    fetchSemanticLaneHealth,
    applySemanticLaneHealthPayload,
    shouldWarmSemanticLane,
    initSemanticLaneAdapter,
    probeSemanticLane as probeSemanticLaneImpl,
    scheduleSemanticLaneMonitor as scheduleSemanticLaneMonitorImpl,
    setSemanticLaneUiState as setSemanticLaneUiStateImpl,
    recordSemanticLaneSnapshot,
    setSemanticLaneOpsMode,
    refreshSemanticLaneOpsSummary
} from './semantic-lane.ts';
import {
    dispatchNavTransition as dispatchNavTransitionImpl,
    NAV_TRANSITION_ACTIONS as NAV_TRANSITION_ACTIONS_IMPL
} from './navigation-state.ts';
import { getFocusedJourneyPoint, getJourneyCompassState } from './journey-compass-state.ts';
import {
    executeJourneyCompassAction,
    updateJourneyCompass,
    installSemanticJourneyProbe,
    scheduleMapRouteRefresh,
    getViewHandoffModel,
    getJourneyCompassPresentationState,
    invokeClearMobileRouteFieldPeek
} from './journey-compass-controller.ts';
import {
    getStrandContinuityState,
    getInspectedThreadIndex,
    getSemanticDiveMode,
    getPoints
} from '../state/selectors/index.ts';
import {
    clearClusterFilter,
    updateClusterList,
    getFilteredClusterCounts,
    syncCityFilterUi,
    populateCityFilter,
    syncFilterControls,
    applyStoryPrompt as applyStoryPromptImpl
} from './cluster-filter.ts';

// ── Re-exports from extracted sub-modules ────────────────────────────────────
import {
    MODE_DESCRIPTIONS,
    STORY_DESCRIPTIONS,
    refreshCompositionState,
    updateExplorationUi as _updateExplorationUiImpl,
    setMyceliumMode,
    setTrailDepth,
    setSemanticDiveMode as _setSemanticDiveModeImpl
} from './lifecycle-modes.ts';
import {
    resetExplorationFocus as _resetExplorationFocusImpl,
    resetNodePositions,
    resetExperienceState,
    returnToOverview as _returnToOverviewImpl
} from './lifecycle-reset.ts';
import {
    activateSearchGlow,
    recordEmptySearch,
    showExploreTrailReview,
    hideExploreTrailReview
} from './lifecycle-search-sync.ts';

// ── Pass-through re-exports ─────────────────────────────────────────────────
export { applyCompositionState };
export {
    getSceneRevealProgress,
    onWindowResize,
    setLoadingPhase,
    hideLoadingOverlay,
    startSceneReveal,
    startDeferredHydration,
    scheduleWeatherHydration,
    copyCurrentViewLink,
    resetStateBeforeUrlRestore,
    clearExplorationFocusSelection,
    syncFocusStage,
    fetchSemanticLaneHealth,
    applySemanticLaneHealthPayload,
    shouldWarmSemanticLane,
    initSemanticLaneAdapter,
    recordSemanticLaneSnapshot,
    setSemanticLaneOpsMode,
    refreshSemanticLaneOpsSummary,
    getFocusedJourneyPoint,
    installSemanticJourneyProbe,
    scheduleMapRouteRefresh,
    getViewHandoffModel,
    getJourneyCompassPresentationState,
    invokeClearMobileRouteFieldPeek,
    updateLegendGuideState,
    closeLegendGuide,
    closeLegendPanel,
    openLegendPanel,
    restoreLegendCollapsedPanel,
    clearSearch,
    clearClusterFilter,
    updateClusterList,
    getFilteredClusterCounts,
    syncCityFilterUi,
    populateCityFilter,
    syncFilterControls,
    executeJourneyCompassAction,
    updateJourneyCompass,
    getJourneyCompassState
};

// ── Re-exports from extracted sub-modules ────────────────────────────────────
export {
    MODE_DESCRIPTIONS,
    STORY_DESCRIPTIONS,
    refreshCompositionState,
    setMyceliumMode,
    setTrailDepth,
    resetNodePositions,
    resetExperienceState,
    activateSearchGlow,
    recordEmptySearch,
    showExploreTrailReview,
    hideExploreTrailReview
};

// ── Thin proxy wrappers ─────────────────────────────────────────────────────

export function updateExplorationUi(): void {
    refreshCompositionState();
}

export function setSemanticDiveMode(enabled: boolean): void {
    const nextActive = !!enabled;
    state.semanticDiveMode = nextActive;
    if (nextActive) {
        if (document.body) document.body.dataset.semanticDive = 'transitioning';
        setTrailDepth(2, { fromUserGesture: true });
        window.setTimeout(() => {
            if (getSemanticDiveMode() && document.body?.dataset.semanticDive === 'transitioning') {
                document.body.dataset.semanticDive = 'active';
            }
        }, 820);
    } else {
        setTrailDepth(1, { allowDiveExit: true, skipUrlSync: true });
    }
    updateExplorationUi();
}

export function returnToOverview(): void {
    _returnToOverviewImpl();
}

export function resetExplorationFocus(options: any = { preserveSearch: true }): void {
    _resetExplorationFocusImpl(options);
}

export function dispatchNavTransition(action: string, payload: any = {}): any {
    if (typeof dispatchNavTransitionImpl === 'function') {
        return dispatchNavTransitionImpl(action, payload);
    }
    return { handled: false, noOp: true, reason: 'uninitialized' };
}

export const NAV_TRANSITION_ACTIONS = NAV_TRANSITION_ACTIONS_IMPL;

export { switchView, showViewHandoff, hideViewHandoff };

export function getMobileSearchSheetDetail(): any {
    return getPanelSurfaceDetailFromMobileSheet();
}

export { derivePanelSurface };

export function deriveLifecyclePanelSurfaceContext({ hasSearchIntent = false, hasFocus = false } = {}): string {
    let context = 'idle';
    if (hasFocus) context = 'focus';
    if (hasSearchIntent && hasFocus) context = 'focus-search';
    if (hasSearchIntent) return hasFocus ? 'focus-search' : 'search';
    return context;
}

export function probeSemanticLane(options: any = {}): Promise<any> {
    if (typeof probeSemanticLaneImpl === 'function') {
        return probeSemanticLaneImpl(options);
    }
    return Promise.resolve(null);
}

export function scheduleSemanticLaneMonitor(): void {
    if (typeof scheduleSemanticLaneMonitorImpl === 'function') {
        scheduleSemanticLaneMonitorImpl();
    }
}

export function setSemanticLaneUiState(laneState: string, options: any = {}): void {
    if (typeof setSemanticLaneUiStateImpl === 'function') {
        setSemanticLaneUiStateImpl(laneState, options);
    }
}

export function syncSearchStatusForFocus(point: any, options: any = {}): void {
    syncSearchStatusForFocusImpl(point, options);
}

export function hideSummaryCard(): void {
    return hideSummaryCardImpl();
}

export function showExperienceToast(message: string, detail: string): void {
    return showExperienceToastImpl(message, detail);
}

export function hydrateLeadContext(point: any): void {
    if (!point) return;
    syncFocusStage(point);
    updateSelectedBusiness(point, { revealCard: true });
    publish(EVENTS.COMPOSITION_UPDATED);
}

export function exploreInsideToNextStop(): void {
    if (getStrandContinuityState()?.phase === 'exploring') return;
    if (
        getSemanticDiveMode()
        && Number.isFinite(getInspectedThreadIndex())
        && document.body?.dataset.threadInspectSurface === 'inside-cue'
    ) {
        if (typeof walkThreadNeighbor === 'function') walkThreadNeighbor(getInspectedThreadIndex()!, { surface: 'inside-cue' });
        return;
    }
    if (typeof traverseNeighbor === 'function') traverseNeighbor(1);
}

export function focusOnPoint(point: any, options: any = {}): boolean {
    if (!point) return false;
    const pointIndex = getPoints().indexOf(point);
    state.selectedPoint = point;
    if (pointIndex >= 0) return focusOnNode(pointIndex, options);
    updateSelectedBusiness(point, options);
    if (!options.skipUrlSync) {
        publish(EVENTS.CAMERA_NODE_FOCUSED, { point, options });
    }
    return true;
}

export { applyStoryPromptImpl as applyStoryPrompt };
