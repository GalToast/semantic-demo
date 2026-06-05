// js/modules/lifecycle.js — Semantic Demo Lifecycle & Global State Bridge
import { state } from '../state.js';
import { publish, subscribe, EVENTS } from './event-bus.js';
import {
    setLoadingPhase,
    hideLoadingOverlay,
    startDeferredHydration,
    scheduleWeatherHydration
} from './loading-ui.js';
import {
    startSceneReveal,
    getSceneRevealProgress,
    onWindowResize
} from './scene-reveal.js';
import {
    copyCurrentViewLink,
    resetStateBeforeUrlRestore,
    clearExplorationFocusSelection
} from './url-state.js';
import { switchView, showViewHandoff, hideViewHandoff } from './view-controller.js';
import {
    updateSelectedBusiness,
    syncFocusStage,
    traverseNeighbor,
    walkThreadNeighbor,
    applyPointFilterColors
} from './journey.js';
import {
    clearSearchGlow,
    updateSearchStatusMessage,
    setSearchPanelState,
    clearSearch
} from './search-state.js';
import { getPanelSurfaceDetailFromMobileSheet } from './search-panel-adapter.js';
import { applyCompositionState, derivePanelSurface } from './composition-state.js';
import {
    focusOnNode,
    settleCameraToOverviewPose
} from './camera-controls.js';
import {
    updateLegendGuideState,
    closeLegendGuide,
    closeLegendPanel,
    openLegendPanel,
    restoreLegendCollapsedPanel
} from './legend-ui.js';
import {
    hideSummaryCard as hideSummaryCardImpl
} from './semantic-guide.js';
import {
    showExperienceToast as showExperienceToastImpl,
    syncSearchStatusForFocus as syncSearchStatusForFocusImpl
} from './ui-feedback.js';
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
} from './semantic-lane.js';
import { clearAllTimers } from './utils/timer-utils.js';
import {
    dispatchNavTransition as dispatchNavTransitionImpl,
    NAV_TRANSITION_ACTIONS as NAV_TRANSITION_ACTIONS_IMPL,
    clearNavigationFocusState,
    clearTrailThreadState
} from './navigation-state.js';
import { getFocusedJourneyPoint, getJourneyCompassState } from './journey-compass-state.js';
import {
    executeJourneyCompassAction,
    updateJourneyCompass,
    installSemanticJourneyProbe,
    scheduleMapRouteRefresh,
    getViewHandoffModel,
    getJourneyCompassPresentationState,
    invokeClearMobileRouteFieldPeek
} from './journey-compass-controller.js';
import { getMyceliumMode, getTrailDepth, getNavState, getSemanticDiveMode, getCurrentView, getCurrentSearchSummary, getSearchGlowIndices, getStrandContinuityState, getInspectedThreadIndex, getPoints } from '../state/selectors/index.js';

import {
    clearClusterFilter,
    updateClusterList,
    getFilteredClusterCounts,
    syncCityFilterUi,
    populateCityFilter,
    syncFilterControls,
    applyStoryPrompt as applyStoryPromptImpl
} from './cluster-filter.js';
// ── Re-exports ───────────────────────────────────────────────────────────────

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

export function dispatchNavTransition(action, payload = {}) {
    if (typeof dispatchNavTransitionImpl === 'function') {
        return dispatchNavTransitionImpl(action, payload);
    }
    return { handled: false, noOp: true, reason: 'uninitialized' };
}

export const NAV_TRANSITION_ACTIONS = NAV_TRANSITION_ACTIONS_IMPL;

export { switchView, showViewHandoff, hideViewHandoff };

// ── Local logic ──────────────────────────────────────────────────────────────

export const MODE_DESCRIPTIONS = {
    default: 'County-wide overview across all visible records.',
    bloom: 'Living records with high relationship potential.',
    bridge: 'Connective nodes linking disparate county themes.',
    trail: 'Focused path of related business entities.',
    inside: 'Immersive exploration of local neighborhoods.'
};

export const STORY_DESCRIPTIONS = {
    standard: 'A semantic journey through Montgomery County.',
    market: 'Market exploration through business relationships.',
    civic: 'Civic connectivity across community anchors.',
    growth: 'Economic growth and development pathways.',
    'signal-rich': 'Explore the densest local business clusters with high relationship potential.',
    'bridge-businesses': 'Explore connectors between business communities.',
    'mapped-food': 'Follow food trails across the county map.',
    'disqualified-ghosts': 'View records that are disqualified but still present in the corpus.'
};

// Phase 3: Declarative synchronization
subscribe(EVENTS.DIVE_MODE_REQUESTED, ({ enabled }) => {
    setSemanticDiveMode(enabled);
});

subscribe(EVENTS.EXPLORATION_RESET_REQUESTED, (options) => {
    resetExplorationFocus(options);
});

subscribe(EVENTS.OVERVIEW_REQUESTED, () => {
    returnToOverview();
});

subscribe(EVENTS.TRAIL_DEPTH_UPDATE_REQUESTED, ({ depth, options }) => {
    setTrailDepth(depth, options);
});

export function setMyceliumMode(mode, options = {}) {
    if (getMyceliumMode() === mode) return;
    state.myceliumMode = mode;
    if (mode === 'bloom') {
        recomputeBloomIndices();
    }
    if (mode === 'bridge') {
        recomputeBridgeIndices();
    }
    if (mode === 'trail') {
        setTrailDepth(1, { ...options, skipUrlSync: true });
    }
    if (mode === 'inside') {
        setTrailDepth(2, { ...options, fromUserGesture: true, skipUrlSync: true });
    }
    applyPointFilterColors();
    if (!options.skipUrlSync) {
        publish(EVENTS.VIEW_CHANGED, { myceliumMode: mode });
    }
    updateExplorationUi();
}

export function setTrailDepth(depth, options = {}) {
    const prevDepth = Number(getTrailDepth() || 0);
    const nextDepth = Number.isFinite(Number(depth)) ? Number(depth) : 0;
    const enteringSemanticDive = nextDepth === 2 && prevDepth < 2;
    const leavingSemanticDive = prevDepth >= 2 && nextDepth < 2;
    if (enteringSemanticDive && !options.fromUserGesture) {
        return;
    }
    if (leavingSemanticDive && !options.fromUserGesture && !options.allowDiveExit) {
        return;
    }
    state.trailDepth = nextDepth;
    state.navState.trailDepth = nextDepth;
    if (nextDepth >= 2) state.navState.mode = 'inside';
    else if (nextDepth > 0 && getNavState()?.mode !== 'focus') state.navState.mode = 'trail';
    if (!options.skipUrlSync) {
        publish(EVENTS.EXPLORATION_DEPTH_CHANGED, { depth: nextDepth });
    }
    updateExplorationUi();
}

export function getMobileSearchSheetDetail() {
    return getPanelSurfaceDetailFromMobileSheet();
}

export { derivePanelSurface };

export function deriveLifecyclePanelSurfaceContext({ hasSearchIntent = false, hasFocus = false } = {}) {
    let context = 'idle';
    if (hasFocus) context = 'focus';
    if (hasSearchIntent && hasFocus) context = 'focus-search';
    if (hasSearchIntent) return hasFocus ? 'focus-search' : 'search';
    return context;
}

export function refreshCompositionState() {
    // Thin wrapper preserved for existing callers; the real work is split into
    // single-responsibility composers in composition-state.js.
    applyCompositionState({ state, root: document.body });
    publish(EVENTS.COMPOSITION_UPDATED);
}

export function setSemanticDiveMode(enabled) {
    const nextActive = !!enabled;
    state.semanticDiveMode = nextActive;
    if (nextActive) {
        if (document.body) document.body.dataset.semanticDive = 'transitioning';
        setTrailDepth(2, { fromUserGesture: true });
        state.navState.mode = 'trail';
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

export function returnToOverview() {
    resetExperienceState();
    if (getCurrentView() !== 'galaxy') {
        switchView('galaxy');
    }
    settleCameraToOverviewPose();
    updateExplorationUi();
}

export function updateExplorationUi() {
    // applyFilters is owned by search-state; calling it from here caused a
    // recursion loop:
    //   focusNode -> updateExplorationUi -> applyFilters -> refreshCompositionState
    //   -> updateExplorationUi -> applyFilters -> ... (Maximum call stack exceeded)
    // applyFilters is already called directly from camera-controls:focusOnNode,
    // so no product behavior is lost by removing it from here.
    refreshCompositionState();
}

export function resetExplorationFocus(options = { preserveSearch: true }) {
    const preservedSearchSummary = options.preserveSearch === false
        ? null
        : getCurrentSearchSummary();

    state.navState.trailDepth = 0;
    state.navState.mode = 'overview';
    state.semanticDiveMode = false;
    state.trailDepth = 0;
    clearExplorationFocusSelection();
    clearNavigationFocusState();
    clearTrailThreadState();
    state.searchGlowActive = false;
    state.myceliumMode = 'default';
    syncFocusStage(null);

    const nestedClearOptions = {
        skipResetFocus: true,
        suppressEvent: !!options.skipSearchClearEvent
    };

    if (options.preserveSearch === false) {
        state.currentSearchSummary = null;
        clearSearch(nestedClearOptions);
    } else {
        clearSearch({ ...nestedClearOptions, preserveSearch: true });
        state.currentSearchSummary = preservedSearchSummary;
    }

    if (!options.skipUrlSync) {
        publish(EVENTS.STATE_RESET, { reason: 'manual-reset', options });
    }

    updateExplorationUi();
}

export function resetNodePositions(options = {}) {
    // Legacy proxy for resetExplorationFocus
    clearExplorationFocusSelection();
    resetExplorationFocus(options);
}

export function resetExperienceState(options = {}) {
    resetExplorationFocus(options);
    clearAllTimers();
    state.currentSearchSummary = null;
    state.currentEmptyQuery = null;
    state.searchAnchorIndex = null;
    state.searchPreviewIndex = null;
    state.searchGlowActive = false;
    if (getSearchGlowIndices()?.clear) getSearchGlowIndices().clear();
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    const searchResults = document.getElementById('search-results');
    if (searchResults) {
        searchResults.classList.remove('active');
        // 10/10 Polish: Defer hidden until transition finishes
        setTimeout(() => {
            if (!searchResults.classList.contains('active')) {
                searchResults.hidden = true;
            }
        }, 450);
    }
    setSearchPanelState({ searching: false, focusing: false, hasQuery: false, resultsRendered: false, degraded: false });
    clearSearchGlow();
    updateSearchStatusMessage();
    refreshCompositionState();
    publish(EVENTS.STATE_RESET, { reason: 'manual-reset' });
}

let _trailReviewReturnFocus = null;
export function showExploreTrailReview(_summary) {
    const overlay = document.getElementById('trail-review-overlay');
    if (overlay) {
        overlay.setAttribute('aria-hidden', 'false');
        overlay.hidden = false;
        overlay.classList.add('visible');
        const closeBtn = overlay.querySelector('.trail-review-close');
        if (closeBtn) {
            _trailReviewReturnFocus = document.activeElement;
            closeBtn.focus();
        }
    }
}

// Event Bus Subscriptions
subscribe(EVENTS.SEARCH_SUCCESS, () => {
    refreshCompositionState();
    updateJourneyCompass();
});

subscribe(EVENTS.SEARCH_EMPTY, ({ query }) => {
    refreshCompositionState();
    updateJourneyCompass();
    recordEmptySearch(query);
});

export function recordEmptySearch(query) {
    state.currentEmptyQuery = query;
    state.currentSearchSummary = null;
}

subscribe(EVENTS.SEARCH_STARTED, () => {
    refreshCompositionState();
});

subscribe(EVENTS.SEARCH_CLEARED, () => {
    refreshCompositionState();
    updateJourneyCompass();
});

subscribe(EVENTS.SEARCH_FOCUS_TRANSITION_STARTED, () => {
    refreshCompositionState();
    updateJourneyCompass();
});

subscribe(EVENTS.SEARCH_FOCUS_TRANSITION_SETTLED, () => {
    refreshCompositionState();
    updateJourneyCompass();
});

export function activateSearchGlow(summary) {
    state.currentSearchSummary = summary;
    state.currentEmptyQuery = null;
    state.searchGlowActive = true;
    if (summary.resultIndices) {
        state.searchGlowIndices = new Set(summary.resultIndices);
    }
    refreshCompositionState();
}

export function hideExploreTrailReview() {
    const overlay = document.getElementById('trail-review-overlay');
    if (overlay) {
        overlay.setAttribute('aria-hidden', 'true');
        overlay.hidden = true;
        overlay.classList.remove('visible');
        if (_trailReviewReturnFocus && typeof _trailReviewReturnFocus.focus === 'function') {
            _trailReviewReturnFocus.focus();
        }
    }
    state.currentSearchSummary = null;
    state.searchGlowActive = false;
    if (getSearchGlowIndices()?.clear) getSearchGlowIndices().clear();
    refreshCompositionState();
}

export { applyStoryPromptImpl as applyStoryPrompt };

function recomputeBloomIndices() {
    state.bloomIndices = new Set(
        (getPoints() || [])
            .map((point, index) => ({ point, index }))
            .filter(({ point }) => point.status === 'active' && point.website)
            .map(({ index }) => index)
    );
    return state.bloomIndices;
}

function recomputeBridgeIndices() {
    state.bridgeIndices = new Set(
        (getPoints() || [])
            .map((point, index) => ({ point, index }))
            .filter(({ point }) => {
                const text = `${point?.what || ''} ${point?.public_note || ''} ${point?.public_detail || ''}`.toLowerCase();
                return text.includes('bridge') || text.includes('network') || text.includes('community');
            })
            .map(({ index }) => index)
    );
    return state.bridgeIndices;
}

export function probeSemanticLane(options = {}) {
    if (typeof probeSemanticLaneImpl === 'function') {
        return probeSemanticLaneImpl(options);
    }
    return Promise.resolve(null);
}

export function scheduleSemanticLaneMonitor() {
    if (typeof scheduleSemanticLaneMonitorImpl === 'function') {
        scheduleSemanticLaneMonitorImpl();
    }
}

export function setSemanticLaneUiState(laneState, options = {}) {
    if (typeof setSemanticLaneUiStateImpl === 'function') {
        setSemanticLaneUiStateImpl(laneState, options);
    }
}

export function syncSearchStatusForFocus(point, options = {}) {
    syncSearchStatusForFocusImpl(point, options);
}

export function hideSummaryCard() {
    return hideSummaryCardImpl();
}

export function showExperienceToast(message, detail) {
    return showExperienceToastImpl(message, detail);
}

export function hydrateLeadContext(point) {
    if (!point) return;
    syncFocusStage(point);
    updateSelectedBusiness(point, { revealCard: true });
}

export function exploreInsideToNextStop() {
    if (getStrandContinuityState()?.phase === 'exploring') return;
    if (
        getSemanticDiveMode()
        && Number.isFinite(getInspectedThreadIndex())
        && document.body.dataset.threadInspectSurface === 'inside-cue'
    ) {
        if (typeof walkThreadNeighbor === 'function') walkThreadNeighbor(getInspectedThreadIndex(), { surface: 'inside-cue' });
        return;
    }
    if (typeof traverseNeighbor === 'function') traverseNeighbor(1);
}

/**
 * Focus a business record and delegate camera movement to the index-based
 * camera owner. Public callers pass records, not point indices.
 */
export function focusOnPoint(point, options = {}) {
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
