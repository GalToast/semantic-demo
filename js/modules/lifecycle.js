// js/modules/lifecycle.js — Semantic Demo Lifecycle & Global State Bridge
import { state } from '../state.js';
import {
    syncRouteDirectorState as adapter_syncRouteDirectorState,
    updateFocusNeighborRail as adapter_updateFocusNeighborRail,
    refreshMapMarkers as adapter_refreshMapMarkers,
    refreshMapRouteEmbodiment as adapter_refreshMapRouteEmbodiment,
    refreshRouteTraceOverlay as adapter_refreshRouteTraceOverlay,
    clearMobileRouteFieldPeek as adapter_clearMobileRouteFieldPeek
} from './composition-adapter.js';
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
    updateUrlState,
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
    applyFilters,
    clearSearchGlow,
    updateSearchStatusMessage,
    setSearchPanelState,
    clearSearch
} from './search-state.js';
import { buildSelectedMatchNarrative, getInterestingBusinessNote, updateSelectedCardHeading } from './ui-renderers.js';
import {
    updateSearchTrailCue
} from './ui-renderers.js';
import {
    focusOnNode
} from './camera-controls.js';
import {
    updateLegendGuideState,
    closeLegendGuide,
    closeLegendPanel,
    openLegendPanel,
    restoreLegendCollapsedPanel
} from './legend-ui.js';
import {
    syncSemanticDiveUi
} from './semantic-dive-ui.js';
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
import {
    dispatchNavTransition as dispatchNavTransitionImpl,
    NAV_TRANSITION_ACTIONS as NAV_TRANSITION_ACTIONS_IMPL
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

import {
    clearClusterFilter,
    updateClusterList,
    getFilteredClusterCounts,
    syncCityFilterUi,
    populateCityFilter,
    syncFilterControls
} from './cluster-filter.js';

// ── Re-exports ───────────────────────────────────────────────────────────────

export {
    getSceneRevealProgress,
    onWindowResize,
    setLoadingPhase,
    hideLoadingOverlay,
    startSceneReveal,
    startDeferredHydration,
    scheduleWeatherHydration,
    updateUrlState,
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

export function setMyceliumMode(mode, options = {}) {
    if (state.myceliumMode === mode) return;
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
        updateUrlState({}, { reason: 'mode' });
    }
    updateExplorationUi();
}

export function setTrailDepth(depth, options = {}) {
    const prevDepth = Number(state.trailDepth || 0);
    const nextDepth = Number.isFinite(Number(depth)) ? Number(depth) : 0;
    if (nextDepth === 2 && prevDepth < 2 && !options.fromUserGesture) {
        return;
    }
    state.trailDepth = nextDepth;
    state.navState.trailDepth = nextDepth;
    if (nextDepth >= 2) state.navState.mode = 'inside';
    else if (nextDepth > 0) state.navState.mode = 'trail';
    if (!options.skipUrlSync) {
        updateUrlState({ depth: nextDepth > 0 ? nextDepth : null }, { mode: 'replace', reason: 'trail-depth' });
    }
    updateExplorationUi();
}

export function getMobileSearchSheetDetail() {
    if (!document.body?.dataset?.mobileSearchSheet) return 'none';
    return document.body.dataset.mobileSearchSheet === 'expanded' ? 'expanded' : 'peek';
}

export function derivePanelSurface({ view, graphContext, mapContext, semanticDive, hasSearchIntent, hasFocus, hasActiveTrailState }) {
    if (view !== 'galaxy') {
        if (mapContext === 'focus-search') return 'map-focus-search';
        if (mapContext === 'focus') return 'map-focus';
        if (mapContext === 'search') return 'map-search';
        if (hasActiveTrailState) return 'map-trail';
        return 'map-idle';
    }
    if (semanticDive === 'active' || semanticDive === 'transitioning') return 'semantic-dive';
    if (graphContext === 'focus-search') return 'focus-search';
    if (graphContext === 'focus') return 'focus';
    if (graphContext === 'search') return 'search';
    if (hasSearchIntent) return hasFocus ? 'focus-search' : 'search';
    return 'idle';
}

function hasFocusedTrailRecord() {
    return Boolean(state.selectedPoint)
        || state.focusedNode !== null && state.focusedNode !== undefined
        || state.navState?.focusedIndex !== null && state.navState?.focusedIndex !== undefined;
}

function hasSearchIntent() {
    const hasSearch = !!state.currentSearchSummary;
    const searchInputValue = String(document.getElementById('search-input')?.value || '').trim();
    return hasSearch
        || searchInputValue.length >= 2
        || Boolean(document.querySelector('.search-container.has-query .search-results.active'));
}

export function refreshCompositionState() {
    if (!document?.body?.dataset) return;

    const activeView = state.currentView || 'galaxy';
    const hasFocusRecord = hasFocusedTrailRecord();
    const searchIntent = hasSearchIntent();
    const hasActiveTrailState = activeView === 'map'
        ? searchIntent || hasFocusRecord
        : hasFocusRecord && (state.navState?.mode === 'trail' || searchIntent);

    document.body.dataset.activeView = activeView;
    document.body.dataset.searchGlow = state.searchGlowActive ? 'active' : 'inactive';
    document.body.dataset.trailState = hasActiveTrailState ? 'active' : 'inactive';
    document.body.dataset.trailDepth = String(state.trailDepth || 0);

    if (state.currentSearchSummary || hasFocusRecord) {
        // Clear transient processing and onboarding feedback once the user is in a live route.
        document.querySelectorAll('.search-result-item.is-processing').forEach((el) => el.classList.remove('is-processing'));

        const hint = document.getElementById('onboarding-hint');
        if (hint) {
            hint.classList.remove('visible');
            hint.setAttribute('aria-hidden', 'true');
            hint._dismissedThisSession = true;
            if (hint._autoHideTimer) clearTimeout(hint._autoHideTimer);
        }

        if (activeView !== 'galaxy') {
            let mapContext = 'idle';
            const hasMapFocus = Boolean(state.selectedPoint)
                || state.focusedNode !== null && state.focusedNode !== undefined;
            if (hasMapFocus && searchIntent) mapContext = 'focus-search';
            else if (hasMapFocus) mapContext = 'focus';
            else if (searchIntent) mapContext = 'search';

            let graphContext = 'idle';
            if (hasFocusRecord && searchIntent) graphContext = 'focus-search';
            else if (hasFocusRecord) graphContext = 'focus';
            else if (searchIntent) graphContext = 'search';

            document.body.dataset.mapContext = mapContext;
            document.body.dataset.graphContext = graphContext;
            document.body.dataset.semanticDive = 'inactive';
            document.body.dataset.panelSurface = derivePanelSurface({
                view: activeView,
                graphContext,
                mapContext,
                semanticDive: 'inactive',
                hasSearchIntent: searchIntent,
                hasFocus: hasMapFocus,
                hasActiveTrailState
            });
            document.body.dataset.panelSurfaceDetail = 'none';

            adapter_syncRouteDirectorState('composition-map');
            updateSelectedCardHeading();
            syncSemanticDiveUi();
            updateJourneyCompass();
            adapter_updateFocusNeighborRail();

            adapter_refreshMapMarkers();
            adapter_refreshMapRouteEmbodiment();
            adapter_refreshRouteTraceOverlay({ reason: 'composition-map' });
            return;
        }
    }

    document.body.dataset.mapContext = 'idle';
    const semanticDive = state.semanticDiveMode && hasFocusRecord
        ? (document.body.dataset.semanticDive === 'transitioning' ? 'transitioning' : 'active')
        : 'inactive';
    document.body.dataset.semanticDive = semanticDive;

    let context = 'idle';
    if (hasFocusRecord && searchIntent) context = 'focus-search';
    else if (hasFocusRecord) context = 'focus';
    else if (searchIntent) context = 'search';
    if (semanticDive === 'active' || semanticDive === 'transitioning') {
        context = hasFocusRecord ? 'focus' : 'idle';
    }

    document.body.dataset.graphContext = context;
    document.body.dataset.panelSurface = derivePanelSurface({
        view: activeView,
        graphContext: context,
        mapContext: 'idle',
        semanticDive,
        hasSearchIntent: searchIntent,
        hasFocus: hasFocusRecord,
        hasActiveTrailState
    });
    document.body.dataset.panelSurfaceDetail = context === 'search' || context === 'focus-search'
        ? getMobileSearchSheetDetail()
        : 'none';
    if (context !== 'idle') {
        adapter_clearMobileRouteFieldPeek();
    }

    adapter_syncRouteDirectorState('composition-galaxy');
    updateSelectedCardHeading();
    if (typeof updateLegendGuideState === 'function') updateLegendGuideState();
    syncSemanticDiveUi();
    updateJourneyCompass();
    adapter_updateFocusNeighborRail();
    adapter_refreshMapMarkers();
    adapter_refreshMapRouteEmbodiment();
    adapter_refreshRouteTraceOverlay({ reason: 'composition-galaxy' });
}

export function setSemanticDiveMode(enabled) {
    const nextActive = !!enabled;
    state.semanticDiveMode = nextActive;
    if (nextActive) {
        setTrailDepth(2, { fromUserGesture: true });
        state.navState.mode = 'trail';
    } else {
        setTrailDepth(1, { allowDiveExit: true, skipUrlSync: true });
    }
    updateExplorationUi();
}

export function returnToOverview() {
    resetExperienceState();
    if (state.currentView !== 'galaxy') {
        switchView('galaxy');
    }
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
    state.navState.trailDepth = 0;
    state.navState.mode = 'overview';
    state.semanticDiveMode = false;
    state.trailDepth = 0;
    clearExplorationFocusSelection();
    state.searchGlowActive = false;
    state.myceliumMode = 'default';
    syncFocusStage(null);

    if (options.preserveSearch === false) {
        state.currentSearchSummary = null;
        clearSearch({ skipResetFocus: true });
    } else {
        clearSearch({ skipResetFocus: true, preserveSearch: true });
    }

    if (!options.skipUrlSync) {
        updateUrlState({ q: null, record: null, anchor: null, depth: null }, { mode: 'push', reason: 'reset' });
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
    state.currentSearchSummary = null;
    state.searchAnchorIndex = null;
    state.searchPreviewIndex = null;
    state.searchGlowActive = false;
    if (state.searchGlowIndices?.clear) state.searchGlowIndices.clear();
    clearExplorationFocusSelection();
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    const searchResults = document.getElementById('search-results');
    if (searchResults) {
        searchResults.classList.remove('active');
        searchResults.hidden = true;
    }
    setSearchPanelState({ searching: false, focusing: false, hasQuery: false, resultsRendered: false, degraded: false });
    clearSearchGlow();
    updateSearchStatusMessage();
    refreshCompositionState();
}

let _trailReviewReturnFocus = null;

export function showExploreTrailReview(summary) {
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
    state.currentSearchSummary = summary;
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
    if (state.searchGlowIndices?.clear) state.searchGlowIndices.clear();
    refreshCompositionState();
}

export function applyStoryPrompt(story, options = {}) {
    state.activeStoryPrompt = story || null;
    state.activeFilters = { status: 'all', city: 'all', website: false, email: false, geocoded: false };
    state.activeClusterFilter = null;
    if (story === 'signal-rich') {
        setMyceliumMode('bloom', options);
        state.activeFilters = { ...state.activeFilters, website: true };
    } else if (story === 'bridge-businesses') {
        setMyceliumMode('bridge', options);
    } else if (story === 'mapped-food') {
        setMyceliumMode('default', options);
        state.activeFilters = { ...state.activeFilters, geocoded: true };
    } else if (story === 'disqualified-ghosts') {
        setMyceliumMode('default', options);
        state.activeFilters = { ...state.activeFilters, status: 'disqualified' };
    }
    syncFilterControls();
    applyFilters();
}

function recomputeBloomIndices() {
    state.bloomIndices = new Set(
        (state.points || [])
            .map((point, index) => ({ point, index }))
            .filter(({ point }) => point.status === 'active' && point.website)
            .map(({ index }) => index)
    );
    return state.bloomIndices;
}

function recomputeBridgeIndices() {
    state.bridgeIndices = new Set(
        (state.points || [])
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

export function initWeather() {
    // Weather hydration is owned by weather.js; retained as a lifecycle compatibility export.
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

export function getRouteLayerOrigin() {
    return 'galaxy';
}

export function exploreInsideToNextStop() {
    if (state.strandContinuityState?.phase === 'exploring') return;
    if (
        state.semanticDiveMode
        && Number.isFinite(state.inspectedThreadIndex)
        && document.body.dataset.threadInspectSurface === 'inside-cue'
    ) {
        if (typeof walkThreadNeighbor === 'function') walkThreadNeighbor(state.inspectedThreadIndex, { surface: 'inside-cue' });
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
    const pointIndex = state.points.indexOf(point);
    state.selectedPoint = point;
    if (pointIndex >= 0) return focusOnNode(pointIndex, options);
    updateSelectedBusiness(point, options);
    if (!options.skipUrlSync) {
        updateUrlState({ record: point.lead_id || null }, { mode: options.historyMode || 'push', reason: 'focus' });
    }
    return true;
}
