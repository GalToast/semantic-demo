// js/modules/lifecycle.js — Semantic Demo Lifecycle & Global State Bridge
import { state } from '../state.js';
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
    copyCurrentViewLink
} from './url-state.js';
import { switchView, showViewHandoff, hideViewHandoff } from './view-controller.js';
import {
    updateSelectedBusiness,
    setTrailFromSeed,
    syncFocusStage,
    applyPointFilterColors,
    setRouteChoreographyPhase,
    updateTraversalUi,
    clearThreadInspection,
    traverseNeighbor,
    walkThreadNeighbor
} from './journey.js';
import {
    applyFilters,
    getFilteredIndices,
    clearSearchGlow,
    updateSearchStatusMessage,
    clearSearchPreviewHoverTimer,
    setSearchPanelState
} from './search-state.js';
import { buildSelectedMatchNarrative, getInterestingBusinessNote, updateSelectedCardHeading } from './ui-renderers.js';
import {
    updateSearchTrailCue,
    buildLegend
} from './ui-renderers.js';
import {
    focusOnNode,
    animateCameraToNode
} from './camera-controls.js';
import {
    clearFocusPocketIndices,
    clearFocusPocketMeta,
    clearFocusPocketRoleByIndex,
    clearFocusPocketMotionByIndex,
    applyLocalNeighborhoodFocus
} from './focus-pocket.js';
import {
    applyWeatherEffects,
    clearWeatherRefreshTimer,
    clearWeatherEffects
} from './weather.js';
import {
    updateLegendGuideState,
    closeLegendGuide,
    closeLegendPanel,
    openLegendPanel,
    restoreLegendCollapsedPanel
} from './legend-ui.js';
import {
    showSemanticThreadsDetail
} from './connection-analysis.js';
import {
    syncSemanticDiveUi
} from './semantic-dive-ui.js';
import {
    setSemanticGuideButtonState,
    showSummaryCard,
    hideSummaryCard as hideSummaryCardImpl,
    requestSemanticGuide,
    semanticGuideIcon,
    getSemanticGuideTitle
} from './semantic-guide.js';
import {
    fetchSemanticLaneHealth,
    applySemanticLaneHealthPayload,
    shouldWarmSemanticLane,
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
    executeJourneyCompassAction as executeJourneyCompassActionImpl,
    updateJourneyCompass as updateJourneyCompassImpl,
    installSemanticJourneyProbe,
    scheduleMapRouteRefresh,
    getViewHandoffModel,
    getJourneyCompassPresentationState
} from './journey-compass-controller.js';

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
    syncFocusStage,
    fetchSemanticLaneHealth,
    applySemanticLaneHealthPayload,
    shouldWarmSemanticLane,
    recordSemanticLaneSnapshot,
    setSemanticLaneOpsMode,
    refreshSemanticLaneOpsSummary,
    getFocusedJourneyPoint,
    installSemanticJourneyProbe,
    scheduleMapRouteRefresh,
    getViewHandoffModel,
    getJourneyCompassPresentationState,
    updateLegendGuideState,
    closeLegendGuide
};

export { switchView, showViewHandoff, hideViewHandoff };

// ── Local logic ──────────────────────────────────────────────────────────────

export const MODE_DESCRIPTIONS = {
    default: 'County-wide overview across all visible records.',
    bloom: 'Bloom mode emphasizes dense local clusters and nearby opportunities.',
    bridge: 'Bridge mode highlights connectors between business communities.',
    trail: 'Trail mode follows a focused route through related records.'
};
export const STORY_DESCRIPTIONS = {
    'signal-rich': 'Businesses with strong public signals and clear next actions.',
    'bridge-businesses': 'Businesses that connect clusters, categories, or neighborhoods.',
    'mapped-food': 'Food and hospitality records with usable mapped context.',
    'disqualified-ghosts': 'Disqualified or low-confidence records kept visible for QA context.'
};

export function updateExplorationUi() {
    refreshCompositionState();
}

export function recomputeBloomIndices() {
    state.bloomIndices = (state.points || [])
        .map((point, index) => ({ point, index }))
        .filter(({ point }) => Boolean(point?.website) && (Boolean(point?.email) || Boolean(point?.phone)))
        .map(({ index }) => index);
    return state.bloomIndices;
}

export function recomputeBridgeIndices() {
    state.bridgeIndices = (state.points || [])
        .map((point, index) => ({ point, index }))
        .filter(({ point }) => {
            const text = `${point?.what || ''} ${point?.public_note || ''} ${point?.public_detail || ''}`.toLowerCase();
            return text.includes('bridge') || text.includes('network') || text.includes('community');
        })
        .map(({ index }) => index);
    return state.bridgeIndices;
}

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

export function clearExplorationFocusSelection() {
    state.focusedNode = null;
    state.selectedPoint = null;
    state.navState.focusedIndex = null;
    if (state.trailIndices?.clear) state.trailIndices.clear();
}

export function resetStateBeforeUrlRestore(options = {}) {
    clearExplorationFocusSelection();
    state.navState.mode = 'overview';
    state.navState.trailDepth = 0;
    state.currentSearchSummary = null;
    state.currentView = 'galaxy';
    state.trailDepth = 0;
    state.myceliumMode = 'default';

    if (options.clearSearchInput) {
        const input = document.getElementById('search-input');
        if (input) {
            input.value = '';
            if (typeof input.dispatchEvent === 'function') {
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
    }

    setSearchPanelState({ searching: false, focusing: false, hasQuery: false, resultsRendered: false, degraded: false });
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

function invokeWindowFunction(name, ...args) {
    if (typeof window === 'undefined' || typeof window[name] !== 'function') return undefined;
    if (name === 'updateJourneyCompass' && window[name] === updateJourneyCompass) return undefined;
    if (name === 'executeJourneyCompassAction' && window[name] === executeJourneyCompassAction) return undefined;
    return window[name](...args);
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

            document.body.dataset.mapContext = mapContext;
            document.body.dataset.graphContext = 'idle';
            document.body.dataset.semanticDive = 'inactive';
            document.body.dataset.panelSurface = derivePanelSurface({
                view: activeView,
                graphContext: 'idle',
                mapContext,
                semanticDive: 'inactive',
                hasSearchIntent: searchIntent,
                hasFocus: hasMapFocus,
                hasActiveTrailState
            });
            document.body.dataset.panelSurfaceDetail = 'none';
            invokeWindowFunction('syncRouteDirectorState', 'composition-map');
            updateSelectedCardHeading();
            syncSemanticDiveUi();
            invokeWindowFunction('updateJourneyCompass');
            invokeWindowFunction('updateFocusNeighborRail');
            invokeWindowFunction('refreshMapMarkers');
            invokeWindowFunction('refreshMapRouteEmbodiment');
            invokeWindowFunction('refreshRouteTraceOverlay', { reason: 'composition-map' });
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
        invokeWindowFunction('clearMobileRouteFieldPeek');
    }
    invokeWindowFunction('syncRouteDirectorState', 'composition-galaxy');
    updateSelectedCardHeading();
    if (typeof updateLegendGuideState === 'function') updateLegendGuideState();
    syncSemanticDiveUi();
    invokeWindowFunction('updateJourneyCompass');
    invokeWindowFunction('updateFocusNeighborRail');
    invokeWindowFunction('refreshMapMarkers');
    invokeWindowFunction('refreshMapRouteEmbodiment');
    invokeWindowFunction('refreshRouteTraceOverlay', { reason: 'composition-galaxy' });
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
}

export function resetExplorationFocus(options = {}) {
    state.navState.trailDepth = 0;
    state.navState.mode = 'overview';
    state.semanticDiveMode = false;
    state.trailDepth = 0;
    clearExplorationFocusSelection();
    state.searchGlowActive = false;
    state.myceliumMode = 'default';
    syncFocusStage(null);

    if (!options.preserveSearch) {
        if (typeof window.clearSearch === 'function') window.clearSearch();
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

export function _openTrailReview() {
    const overlay = document.getElementById('trail-review-overlay');
    if (!overlay) return false;
    _trailReviewReturnFocus = document.activeElement;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    overlay.classList.add('visible');
    const closeBtn = overlay.querySelector('.trail-review-close');
    if (closeBtn && typeof closeBtn.focus === 'function') closeBtn.focus();
    return true;
}

export function _closeTrailReview() {
    const overlay = document.getElementById('trail-review-overlay');
    if (overlay) {
        overlay.setAttribute('aria-hidden', 'true');
        overlay.classList.remove('visible');
    }
    if (_trailReviewReturnFocus && typeof _trailReviewReturnFocus.focus === 'function') {
        _trailReviewReturnFocus.focus();
    }
    _trailReviewReturnFocus = null;
    return true;
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

function executeJourneyCompassAction(action) {
    return executeJourneyCompassActionImpl(action);
}

function updateJourneyCompass() {
    return updateJourneyCompassImpl();
}

export { executeJourneyCompassAction, updateJourneyCompass, getJourneyCompassState };

export function initWeather() {
    // Intentional no-op stub
}

export function syncSearchStatusForFocus() {
    // Intentional no-op stub
}

export function hideSummaryCard() {
    return hideSummaryCardImpl();
}

export function showExperienceToast(message, options = {}) {
    // Intentional no-op stub
}

export function hydrateLeadContext(point, options = {}) {
    // Intentional no-op stub
}

export function dispatchNavTransition(type, payload = {}) {
    return dispatchNavTransitionImpl(type, payload);
}

export const NAV_TRANSITION_ACTIONS = NAV_TRANSITION_ACTIONS_IMPL;

export function setSemanticLaneUiState(laneState, options = {}) {
    setSemanticLaneUiStateImpl(laneState, options);
    const laneStatusEl = document.getElementById('summary-lane-status');
    if (laneStatusEl) laneStatusEl.textContent = options.label || laneState;
}

export function probeSemanticLane(options = {}) {
    return probeSemanticLaneImpl(options);
}

export function scheduleSemanticLaneMonitor() {
    return scheduleSemanticLaneMonitorImpl();
}

function syncFilterControls() {
}

function populateCityFilter() {
}

function syncCityFilterUi() {
}

function getFilteredClusterCounts() {
    return [];
}

function updateClusterList() {
}

function clearClusterFilter() {
    state.activeClusterFilter = null;
    applyFilters();
}

export { clearClusterFilter, updateClusterList, getFilteredClusterCounts, applyFilters, syncCityFilterUi, populateCityFilter, syncFilterControls };

/**
 * Global bridge function to resolve the current route origin ('galaxy', 'map', 'inside').
 */
export function getRouteLayerOrigin() {
    return 'galaxy';
}

/**
 * Explores the neighborhood of the currently focused node.
 */
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
 * Proxy for focusOnNode that handles selection state.
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

// ── Global exposure for legacy compatibility ──────────────────────────────────

if (typeof window !== 'undefined') {
    window.recenterFocusedNode = function () {
        const index = state.focusedNode;
        if (!Number.isFinite(index)) return;
        if (typeof animateCameraToNode === 'function') {
            animateCameraToNode(index, { reason: 'recenter' });
        }
    };
}
