import { state } from '../state.js';
import {
    escapeHtml,
    updateTime
} from '../utils.js';
import {
    computeSignalScores,
    computeBloomIndices,
    computeBridgeIndices
} from './exploration-data.js';
import {
    setSemanticGuideButtonState,
    showSummaryCard,
    hideSummaryCard,
    requestSemanticGuide,
    semanticGuideIcon,
    getSemanticGuideTitle
} from './semantic-guide.js';
import { setSearchPanelState } from './search-state.js';
import { initEventListeners as initSemanticDemoEventListeners } from './event-bindings.js';
import { syncSemanticDiveUi } from './semantic-dive-ui.js';
import { closeLegendPanel, isLegendPanelOpen, openLegendPanel, restoreLegendCollapsedPanel, updateLegendGuideState, closeLegendGuide } from './legend-ui.js';
export { updateLegendGuideState, closeLegendGuide };
import { showSemanticThreadsDetail } from './connection-analysis.js';
import { buildSelectedMatchNarrative, getInterestingBusinessNote, updateSelectedCardHeading } from './ui-renderers.js';
import { showExperienceToast, syncSearchStatusForFocus } from './ui-feedback.js';
import { updateUrlState, copyCurrentViewLink } from './url-state.js';
export { updateUrlState, copyCurrentViewLink };
import { switchView, showViewHandoff, hideViewHandoff } from './view-controller.js';
export { switchView, showViewHandoff, hideViewHandoff };
import {
    NAV_TRANSITION_ACTIONS,
    clearNavigationFocusState,
    clearTrailThreadState,
    dispatchNavTransition,
    initNavigationState
} from './navigation-state.js';
export { NAV_TRANSITION_ACTIONS, dispatchNavTransition };


import {
    isKeyboardTextEntryTarget,
    isKeyboardControlTarget,
    initKeyboardShortcutsHint,
    showKeyboardShortcutsHint,
    flashArrowKeyToast,
    handleGalaxyKeydown,
    initKeyboardResetOwnership
} from './keyboard-help.js';
export {
    isKeyboardTextEntryTarget,
    isKeyboardControlTarget,
    initKeyboardShortcutsHint,
    showKeyboardShortcutsHint,
    flashArrowKeyToast,
    handleGalaxyKeydown
};

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
    clearClusterFilter,
    updateClusterList,
    getFilteredClusterCounts,
    syncCityFilterUi,
    populateCityFilter,
    syncFilterControls,
    findClusterByKeyword
} from './cluster-filter.js';
import {
    fetchSemanticLaneHealth,
    applySemanticLaneHealthPayload,
    shouldWarmSemanticLane,
    probeSemanticLane,
    scheduleSemanticLaneMonitor,
    setSemanticLaneUiState,
    recordSemanticLaneSnapshot,
    setSemanticLaneOpsMode,
    refreshSemanticLaneOpsSummary,
} from './semantic-lane.js';
import { getFocusedJourneyPoint, getJourneyCompassState } from './journey-compass-state.js';
import {
    executeJourneyCompassAction,
    updateJourneyCompass,
    installSemanticJourneyProbe,
    invokeClearMobileRouteFieldPeek,
    refreshCompositionState,
    scheduleMapRouteRefresh,
    getViewHandoffModel,
    getJourneyCompassPresentationState
} from './journey-compass-controller.js';

export {
    executeJourneyCompassAction,
    updateJourneyCompass,
    installSemanticJourneyProbe,
    refreshCompositionState,
    scheduleMapRouteRefresh,
    getViewHandoffModel,
    getJourneyCompassPresentationState,
    getFocusedJourneyPoint,
    getJourneyCompassState
};
import {
    initMap,
    refreshMapRouteEmbodiment,
    getRouteEmbodimentIndices,
    setTerrainHandoffState
} from './map-state.js';
import {
    applyWeatherEffects,
    clearWeatherRefreshTimer,
    clearWeatherEffects
} from './weather.js';
import {
    applyFilters,
    getFilteredIndices,
    clearSearchGlow,
    updateSearchStatusMessage,
    clearSearchPreviewHoverTimer
} from './search-state.js';
import { updateSearchTrailCue } from './ui-renderers.js';
import { focusOnNode } from './camera-controls.js';
import { clearFocusPocketIndices, clearFocusPocketMeta, clearFocusPocketRoleByIndex, clearFocusPocketMotionByIndex } from './focus-pocket.js';
import {
    updateSelectedBusiness,
    setTrailFromSeed,
    syncFocusStage,
    applyPointFilterColors,
    setRouteChoreographyPhase,
    updateTraversalUi
} from './journey.js';

export { setLoadingPhase, hideLoadingOverlay, startDeferredHydration, scheduleWeatherHydration };
export { startSceneReveal, getSceneRevealProgress, onWindowResize };
export { clearClusterFilter, updateClusterList, getFilteredClusterCounts, applyFilters, syncCityFilterUi, populateCityFilter, syncFilterControls };
export { updateTime };
export {
    fetchSemanticLaneHealth,
    applySemanticLaneHealthPayload,
    shouldWarmSemanticLane,
    probeSemanticLane,
    scheduleSemanticLaneMonitor,
    setSemanticLaneUiState,
    recordSemanticLaneSnapshot,
    setSemanticLaneOpsMode,
    refreshSemanticLaneOpsSummary,
};

// === Constants ===

export const MODE_DESCRIPTIONS = {
    default: 'County View keeps the whole county visible so you can choose where to wander next.',
    bloom: 'Surface signal-rich businesses with a website plus email or phone.',
    bridge: 'Highlight businesses that link different industry and city clusters.',
    trail: 'Trail follows related businesses around one focused record. A trail forms as you move.'
};

export const STORY_DESCRIPTIONS = {
    'signal-rich': 'Signal-rich county opens the records with the richest contact and map context.',
    'bridge-businesses': 'Cross-current businesses finds records sitting between separate neighborhoods.',
    'mapped-food': 'Mapped food web narrows the county to mapped food and hospitality records.',
    'disqualified-ghosts': 'Archive layer brings forward records outside the active public slice.'
};

// === Nav Transition Reducer — Extracted to navigation-state.js ===


// === Exploration UI & Orchestration ===

export function updateExplorationUi() {
    document.body.dataset.myceliumMode = state.myceliumMode;
    document.body.dataset.trailDepth = state.trailDepth;
    document.body.dataset.trailReady =
        state.trailDepth >= 1 && state.focusedNode === null ? 'waiting' : 'ready';
    document.querySelectorAll('[data-mode]').forEach((button) => {
        const active = button.dataset.mode === state.myceliumMode;
        const waitingTrail = button.dataset.mode === 'trail' && state.focusedNode === null;
        button.classList.toggle('active', active);
        button.classList.toggle('is-waiting', waitingTrail);
        // Locked trail state: trailDepth >= 1 means the Trail chip is in its locked/enabled phase
        const isLockedTrail = button.dataset.mode === 'trail' && state.trailDepth >= 1;
        button.classList.toggle('is-locked', isLockedTrail);
        button.setAttribute('aria-pressed', String(active && !waitingTrail));
        button.setAttribute(
            'aria-label',
            waitingTrail
                ? 'Select a business first to step inside its neighborhood'
                : button.textContent.trim().replace(/\s+/g, ' ')
        );
    });

    document.querySelectorAll('[data-story]').forEach((button) => {
        const storyActive = button.dataset.story === state.activeStoryPrompt;
        const modeCompatible = !button.dataset.mode || button.dataset.mode === state.myceliumMode;
        const active = storyActive && modeCompatible;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    });

    const note = document.getElementById('exploration-note');
    const result = document.getElementById('exploration-mode-result');
    if (!note) return;
    if (!state.points || !Array.isArray(state.points)) {
        if (result) result.textContent = 'Loading...';
        return;
    }

    if (state.activeStoryPrompt && STORY_DESCRIPTIONS[state.activeStoryPrompt]) {
        note.textContent = STORY_DESCRIPTIONS[state.activeStoryPrompt];
    } else if (state.trailDepth >= 1 && state.focusedNode === null) {
        note.textContent =
            'Search or select a business first; then Step Inside follows its nearest semantic neighbors.';
    } else {
        note.textContent = MODE_DESCRIPTIONS[state.myceliumMode] || MODE_DESCRIPTIONS.default;
    }

    if (result) {
        result.classList.toggle('has-breakdown', state.myceliumMode === 'bloom');
        let resultText = `Showing all ${state.points.length.toLocaleString()} county records. Click or tap any record to explore its neighborhood.`;
        if (state.myceliumMode === 'bloom') {
            const dimmedCount = Math.max(0, state.points.length - state.bloomIndices.size);
            result.innerHTML = `
                <span class="mode-result-copy">Why the graph changed</span>
                <span class="mode-result-breakdown" aria-label="Website and contact highlight breakdown">
                    <span><strong>${state.bloomIndices.size.toLocaleString()}</strong> brighter: website + email or phone</span>
                    <span><strong>${dimmedCount.toLocaleString()}</strong> dimmed: still included for county context</span>
                    <span>Map/status fields can boost brightness</span>
                </span>
            `;
            result.dataset.resultMode = state.myceliumMode;
            return;
        } else if (state.myceliumMode === 'bridge') {
            resultText = `${state.bridgeIndices.size.toLocaleString()} bridge records highlighted; use them to jump between business clusters.`;
        } else if (state.trailDepth >= 1 && state.focusedNode === null) {
            resultText = 'Trail locked: search or select one business to unlock the neighborhood explorer.';
        } else if (state.trailDepth >= 1) {
            resultText = `Search opens a trail: ${Math.max(0, state.trailIndices.size - 1).toLocaleString()} nearby stops around this business.`;
        }
        result.textContent = resultText;
        result.dataset.resultMode = state.myceliumMode;
    }
}

export function setMyceliumMode(mode, options = {}) {
    state.myceliumMode = mode;

    // Map myceliumMode to trailDepth (trailDepth is the canonical state, myceliumMode is kept for display compat)
    // 'trail' mode delegates to setTrailDepth to properly gate depth=2 from side effects
    if (mode === 'trail') {
        setTrailDepth(1, { skipUrlSync: options.skipUrlSync, keepStoryPrompt: options.keepStoryPrompt });
    } else if (mode === 'inside') {
        setTrailDepth(2, { fromUserGesture: true, skipUrlSync: options.skipUrlSync });
        state.navState.mode = 'inside';
    } else {
        // 10/10 Polish: Fix for 'broken feedback loop'
        // Clear trail indices when leaving trail mode, but DO NOT reset trailDepth to 0 here
        // as it is established by setTrailDepth() and managed as the primary state.
        clearExplorationFocusSelection({ preserveSearch: true });
        state.navState.mode = 'overview';
        state.navState.walkHistoryIndices = [];
        clearTrailThreadState();
    }

    if (!options.keepStoryPrompt) {
        state.activeStoryPrompt = null;
    }

    // Show brief computing state on mode chips during heavy recomputation
    const modeGrid = document.getElementById('mode-grid');
    if (modeGrid) modeGrid.classList.add('computing');

    // Recompute bloom/bridge indices when entering those modes
    const doRecompute = () => {
        if (mode === 'bloom') {
            recomputeBloomIndices();
        } else if (mode === 'bridge') {
            recomputeBridgeIndices();
        }
        if (modeGrid) modeGrid.classList.remove('computing');
    };

    if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(doRecompute, { timeout: 2000 });
    } else {
        setTimeout(doRecompute, 0);
    }

    // Apply color changes and refresh UI
    applyPointFilterColors();
    updateExplorationUi();
    if (!options.skipUrlSync) {
        updateUrlState({}, { reason: 'mode' });
    }
}

// Explicit trailDepth transition — each level requires deliberate user action
export function setTrailDepth(n, options = {}) {
    const nextDepth = Math.max(0, Math.min(2, Number(n)));
    const prevDepth = state.trailDepth;

    // Explicit gate: trailDepth 2 may only be entered via user click, never as a side effect of entering trailDepth 1
    if (nextDepth === 2 && prevDepth < 2 && !options.fromUserGesture) {
        // Silently ignore silent escalation attempts (e.g. side effects from search-centering)
        return;
    }
    if (prevDepth === 2 && nextDepth === 1 && state.semanticDiveMode && !options.allowDiveExit) {
        return;
    }

    state.trailDepth = nextDepth;

    // Keep myceliumMode in sync for display compat
    if (nextDepth >= 1) {
        state.myceliumMode = 'trail';
    } else {
        state.myceliumMode = 'default';
    }

    updateExplorationUi();
    syncSemanticDiveUi();
    refreshCompositionState();
    updateJourneyCompass();
    if (!options.skipUrlSync) {
        updateUrlState({}, { reason: 'depth' });
    }
}

// Semantic dive mode — authoritative owner for Step Inside / Escape behavior.
// Sets semanticDiveMode state, navState.mode, trailDepth(2), syncSemanticDiveUi,
// camera/focus-pocket refresh, and URL sync. Exposed as named export and
// window bridge for compatibility.
export function setSemanticDiveMode(enabled) {
    const nextActive = Boolean(enabled);
    state.semanticDiveMode = nextActive;

    // Sync navState.mode so refreshCompositionState() derives the correct graphContext
    // without requiring a separate focus action to set mode='trail'.
    if (nextActive) {
        state.navState.mode = 'trail';
    }

    syncSemanticDiveUi();

    // Sync with trailDepth state machine (Step Inside is depth 2)
    const trailDepthOptions = { fromUserGesture: true };
    if (!nextActive) trailDepthOptions.allowDiveExit = true;
    setTrailDepth(nextActive ? 2 : 1, trailDepthOptions);

    if (state.semanticDiveMode) {
        if (document.body) {
            document.body.dataset.semanticDive = 'transitioning';
            window.setTimeout(() => {
                if (state.semanticDiveMode && document.body.dataset.semanticDive === 'transitioning') {
                    document.body.dataset.semanticDive = 'active';
                }
            }, 820);
        }
        if (Number.isFinite(state.focusedNode) && typeof window._fp?.applyLocalNeighborhoodFocus === 'function') {
            window._fp.applyLocalNeighborhoodFocus(state.focusedNode);
        }
        if (Number.isFinite(state.focusedNode) && typeof window.animateCameraToNode === 'function') {
            window.animateCameraToNode(state.focusedNode, { transitionStyle: 'dive' });
        }
        if (typeof window.previewInsideNextThread === 'function') window.previewInsideNextThread({ force: true });
    } else {
        if (Number.isFinite(state.focusedNode) && typeof window.animateCameraToNode === 'function') {
            window.animateCameraToNode(state.focusedNode, { transitionStyle: 'focus' });
        }
        if (Number.isFinite(state.focusedNode) && typeof window._fp?.applyLocalNeighborhoodFocus === 'function') {
            window._fp.applyLocalNeighborhoodFocus(state.focusedNode);
        }
        if (document.body.dataset.threadInspectSurface === 'inside-cue') {
            if (typeof window.clearThreadInspection === 'function') window.clearThreadInspection({ force: true, preserveJourney: true });
        }
    }
    refreshCompositionState();
    updateUrlState({}, { reason: 'semantic-dive' });
}

function recomputeBloomIndices() {
    if (!state.points || state.points.length === 0) return;
    state.signalScores = computeSignalScores(state.points);
    state.bloomIndices = computeBloomIndices(state.points, state.signalScores);
}

function recomputeBridgeIndices() {
    if (!state.points || state.points.length === 0 || !state.originalPositions) return;
    const result = computeBridgeIndices(state.points, state.originalPositions, state.signalScores);
    state.bridgeIndices = result.indices;
    state.bridgeScores = result.scores;
}

export function applyStoryPrompt(story, options = {}) {
    state.activeStoryPrompt = story;
    state.activeClusterFilter = null;
    state.activeFilters = {
        status: 'all',
        city: 'all',
        website: false,
        email: false,
        geocoded: false
    };

    if (story === 'signal-rich') {
        setMyceliumMode('bloom', { keepStoryPrompt: true, skipUrlSync: true });
    } else if (story === 'bridge-businesses') {
        setMyceliumMode('bridge', { keepStoryPrompt: true, skipUrlSync: true });
    } else if (story === 'mapped-food') {
        const foodCluster = findClusterByKeyword('restaurant');
        if (foodCluster !== null) state.activeClusterFilter = foodCluster;
        state.activeFilters.geocoded = true;
        setMyceliumMode('default', { keepStoryPrompt: true, skipUrlSync: true });
    } else if (story === 'disqualified-ghosts') {
        state.activeFilters.status = 'disqualified';
        setMyceliumMode('bloom', { keepStoryPrompt: true, skipUrlSync: true });
    } else {
        setMyceliumMode('default', { keepStoryPrompt: true, skipUrlSync: true });
    }

    if (typeof syncFilterControls === 'function') syncFilterControls();
    clearSearchGlow();
    applyFilters();
    updateExplorationUi();
    if (!options.skipUrlSync) {
        updateUrlState({ story }, { reason: 'story' });
    }
}

// === Navigation & URL State ===
// updateUrlState and copyCurrentViewLink have been extracted to url-state.js


export function resetExperienceState() {
    resetStateBeforeUrlRestore({ clearSearchInput: true });
    if (typeof window.switchView === 'function') {
        window.switchView('galaxy', { skipUrlSync: true, silentHandoff: true });
    }
    if (typeof window.updateUrlState === 'function') {
        updateUrlState(
            {
                q: null,
                anchor: null,
                record: null,
                offset: null,
                status: null,
                city: null,
                website: null,
                email: null,
                geocoded: null,
                mode: null,
                story: null,
                cluster: null
            },
            { reason: 'reset', mode: 'replace' }
        );
    }
    showExperienceToast('Scene restored', 'Search, connection path, filters, and map handoff cleared.');
}

/**
 * Official focus/selection clear API — clears focusedNode, selectedPoint, navState
 * focus fields, and trailIndices in one canonical call. All other functions in
 * lifecycle.js must route through this helper instead of writing those fields
 * directly.
 *
 * @param {object} [options]
 * @param {boolean} [options.preserveSearch] - preserves search UI context; focus selection is still cleared
 * @returns {{ hadFocusedNode: boolean, hadSelectedPoint: boolean }}
 */
export function clearExplorationFocusSelection(_options = {}) {
    const hadFocusedNode = state.focusedNode !== null;
    const hadSelectedPoint = state.selectedPoint !== null;

    state.focusedNode = null;
    state.selectedPoint = null;
    clearNavigationFocusState();
    state.trailIndices.clear();

    return { hadFocusedNode, hadSelectedPoint };
}

/**
 * Official exploration-focus reset: clears focusedNode, trail depth, mycelium mode,
 * and focus-stage while preserving the current search so the user retains context.
 * Use this when returning to overview without a full scene wipe.
 */
export function resetExplorationFocus() {
    // Reset mycelium mode and trail depth — this also clears trailIndices
    // and resets navState.mode to 'overview'
    setMyceliumMode('default', { skipUrlSync: true });
    setTrailDepth(0, { skipUrlSync: true });

    // Clear node focus state while preserving search
    resetNodePositions({ preserveSearch: true });

    // Explicitly clear search glow (resetNodePositions skips it when preserveSearch=true)
    clearSearchGlow();

    // Ensure focus stage DOM element is hidden
    syncFocusStage(null);

    // Sync UI state to reflect the reset
    refreshCompositionState();
    updateExplorationUi();
}

/**
 * Official full-reset API. Clears search, filters, focus, and trail state,
 * and returns the scene to galaxy overview.
 * Alias for the existing resetExperienceState() — preserves backward compat.
 */
export function returnToOverview() {
    resetExperienceState();
}

export function resetStateBeforeUrlRestore(options = {}) {
    if (state.searchTimeout) {
        window.clearTimeout(state.searchTimeout);
        state.searchTimeout = null;
    }
    if (state.searchAbortController) {
        state.searchAbortController.abort();
        state.searchAbortController = null;
    }
    state.searchRequestSequence = (state.searchRequestSequence || 0) + 1;
    state.searchFocusTransitionToken = (state.searchFocusTransitionToken || 0) + 1;

    const input = document.getElementById('search-input');
    const resultsEl = document.getElementById('search-results');
    // Only clear search input when explicitly requested (e.g., user clicked "Clear" or full reset).
    // When restoring from URL without a `q` param, preserve the current input value.
    if (options.clearSearchInput && input) input.value = '';
    if (resultsEl) {
        resultsEl.innerHTML = '';
        resultsEl.classList.remove('active', 'searching', 'focusing');
    }

    state.currentSearchSummary = null;
    state.activeClusterFilter = null;
    state.activeStoryPrompt = null;
    setMyceliumMode('default', { skipUrlSync: true });
    state.activeFilters = {
        status: 'all',
        city: 'all',
        website: false,
        email: false,
        geocoded: false
    };
    clearExplorationFocusSelection();
    setTrailDepth(0, { skipUrlSync: true, allowDiveExit: true });
    setSearchPanelState({ searching: false, focusing: false, resultsRendered: false });
    if (typeof window.hideTooltip === 'function') window.hideTooltip();
    clearSearchPreviewHoverTimer();
    if (typeof window.clearSearchPreviewOverlay === 'function') window.clearSearchPreviewOverlay();
    clearSearchGlow();
    updateSearchTrailCue({ beat: 'idle' });
    document.querySelectorAll('.cluster-item').forEach((el) => el.classList.remove('active'));
    if (typeof syncFilterControls === 'function') syncFilterControls();
    if (state.pointsMesh && state.originalPositions?.length) {
        if (typeof window.resetNodePositions === 'function') window.resetNodePositions({ skipUrlSync: true });
    } else {
        updateSelectedBusiness(null);
    }
    applyFilters();
    updateExplorationUi();
    updateSearchStatusMessage(getFilteredIndices().length);
    syncFocusStage(null);
    refreshCompositionState();
    clearExplorationFocusSelection();
    state.navState.mode = 'overview';
    clearTrailThreadState();
    state.nodesAreSettling = false;
}

// === View Management ===

// View management functions extracted to view-controller.js

// showExperienceToast and syncSearchStatusForFocus extracted to ui-feedback.js
export { showExperienceToast, syncSearchStatusForFocus };

// === Semantic Guide Summary Card ===
export {
    setSemanticGuideButtonState,
    showSummaryCard,
    hideSummaryCard,
    requestSemanticGuide
} from './semantic-guide.js';
export { focusOnNode } from './camera-controls.js';

export function focusOnPoint(point, options = {}) {
    if (!point) return false;
    const pointIndex = state.points.indexOf(point);
    state.selectedPoint = point;
    if (pointIndex >= 0) return focusOnNode(pointIndex, options);
    updateSelectedBusiness(point, options);
    if (!options.skipUrlSync) {
        updateUrlState({ record: point.lead_id || null }, { mode: options.historyMode || 'push', reason: 'focus' });
    }
    updateJourneyCompass();
    return true;
}

export function resetNodePositions(options = {}) {
    if (!options.preserveSearch) clearSearchGlow();
    clearExplorationFocusSelection();
    state.navState.mode = 'overview';
    clearFocusPocketIndices();
    clearFocusPocketRoleByIndex();
    clearFocusPocketMotionByIndex();
    clearFocusPocketMeta();
    setTrailDepth(0, { skipUrlSync: true, allowDiveExit: true });
    document.body.dataset.focusOrigin = 'overview';
    document.body.dataset.focusPanelMode = 'overview';
    if (Array.isArray(state.originalPositions) && state.originalPositions.length) {
        state.targetPositions = state.originalPositions.map((position) => ({ ...position }));
    }
    updateSelectedBusiness(null);
    applyPointFilterColors();
    updateTraversalUi();
    refreshMapRouteEmbodiment();
    refreshCompositionState();
    if (!options.skipUrlSync) {
        updateUrlState({ record: null }, { reason: 'reset' });
    }
}

// === Legend guide functions extracted to legend-ui.js ===




// === Event Listeners ===

export function initEventListeners() {
    // Inject authoritative reset APIs into keyboard-help.js so it never
    // needs to import lifecycle.js (breaking the lifecycle <-> keyboard-help cycle).
    initKeyboardResetOwnership({
        returnToOverview,
        resetExplorationFocus
    });

    // Inject authoritative APIs into navigation-state.js to prevent circular imports
    initNavigationState({
        resetExplorationFocus,
        resetExperienceState,
        setTrailDepth,
        setSemanticDiveMode
    });

    return initSemanticDemoEventListeners({
        onWindowResize,
        recordSemanticLaneSnapshot,
        resetExperienceState,
        resetNodePositions,
        setMyceliumMode,
        setSemanticLaneUiState
    });
}

// Global exposure for compatibility
if (typeof window !== 'undefined') {
    window.setLoadingPhase = setLoadingPhase;
    window.hideLoadingOverlay = hideLoadingOverlay;
    window.startSceneReveal = startSceneReveal;
    window.startDeferredHydration = startDeferredHydration;
    window.scheduleWeatherHydration = scheduleWeatherHydration;
    window.setSemanticLaneUiState = setSemanticLaneUiState;
    window.probeSemanticLane = probeSemanticLane;
    window.scheduleSemanticLaneMonitor = scheduleSemanticLaneMonitor;
    window.onWindowResize = onWindowResize;

    // Extracted functions (de-windowed: use named imports instead)
    window.syncClusterSectionState = function () {
        const clusterSection = document.getElementById('cluster-section');
        if (clusterSection && window.innerWidth <= 768) {
            clusterSection.open = false;
        }
    };
    window.updateExplorationUi = updateExplorationUi;
    window.setMyceliumMode = setMyceliumMode;
    window.setTrailDepth = setTrailDepth;
    window.dispatchNavTransition = dispatchNavTransition;
    window.applyStoryPrompt = applyStoryPrompt;
    window.copyCurrentViewLink = copyCurrentViewLink;
    window.returnToOverview = returnToOverview;
    window.resetExplorationFocus = resetExplorationFocus;
    window.resetStateBeforeUrlRestore = resetStateBeforeUrlRestore;
    window.refreshCompositionState = refreshCompositionState;
    window.syncSemanticDiveUi = syncSemanticDiveUi;
    window.showViewHandoff = showViewHandoff;
    window.hideViewHandoff = hideViewHandoff;
    window.showExperienceToast = showExperienceToast;

    window.setSemanticDiveMode = setSemanticDiveMode;

    window.getInterestingBusinessNote = getInterestingBusinessNote;
    window.buildSelectedMatchNarrative = buildSelectedMatchNarrative;

    window.exploreInsideToNextStop = function () {
        if (state.strandContinuityState?.phase === 'exploring') return;
        if (
            state.semanticDiveMode
            && Number.isFinite(state.inspectedThreadIndex)
            && document.body.dataset.threadInspectSurface === 'inside-cue'
        ) {
            if (typeof window.walkThreadNeighbor === 'function') window.walkThreadNeighbor(state.inspectedThreadIndex, { surface: 'inside-cue' });
            return;
        }
        if (typeof window.traverseNeighbor === 'function') window.traverseNeighbor(1);
    };

    window.recenterFocusedNode = function () {
        const index = state.focusedNode;
        if (!Number.isFinite(index)) return;
        if (typeof window.animateCameraToNode === 'function') {
            window.animateCameraToNode(index, { transitionStyle: 'focus' });
        }
    };

    window.returnToCountyView = function () {
        resetExplorationFocus();
    };

    // Expose btn-surprise handler
    // 10/10 Polish: Removed redundant legacy __handleSurpriseClick. Handled in event-bindings.js

    window.setSemanticGuideButtonState = setSemanticGuideButtonState;
    window.showSummaryCard = showSummaryCard;
    window.hideSummaryCard = hideSummaryCard;
    window.requestSemanticGuide = requestSemanticGuide;
    window.focusOnPoint = focusOnPoint;
    window.resetNodePositions = resetNodePositions;
    window.syncSearchStatusForFocus = syncSearchStatusForFocus;
    window.recordSemanticLaneSnapshot = recordSemanticLaneSnapshot;
    window.setSemanticLaneOpsMode = setSemanticLaneOpsMode;
    window.refreshSemanticLaneOpsSummary = refreshSemanticLaneOpsSummary;
    installSemanticJourneyProbe();

    // Trail story detail — triggers on "Full report" button in summary suggestions row
    window.showSemanticThreadsDetail = showSemanticThreadsDetail;

    let _trailReviewReturnFocus = null;

    window._openTrailReview = function() {
        const overlay = document.getElementById('trail-review-overlay');
        const list = document.getElementById('trail-review-list');
        if (!overlay || !list) return;

        _trailReviewReturnFocus = document.activeElement;

        const path = Array.isArray(state.navState?.activeRoutePath) ? state.navState.activeRoutePath : [];
        if (!path.length) {
            list.innerHTML = '<p class="trail-review-empty">No reviewed trail is active yet.</p>';
        } else {
            list.innerHTML = path.map((leadId, index) => {
                const pointIndex = state.pointIndexByLeadId?.get(String(leadId));
                const point = Number.isFinite(pointIndex) ? state.points?.[pointIndex] : null;
                const name = point?.name || `Trail stop ${index + 1}`;
                const arrow = index < path.length - 1 ? '<div class="step-arrow" aria-hidden="true">↓</div>' : '';
                return `
                    <div class="trail-step">
                        <span class="step-num">${index + 1}</span>
                        <span class="step-name">${escapeHtml(name)}</span>
                    </div>
                    ${arrow}
                `;
            }).join('');
        }

        overlay.hidden = false;
        overlay.classList.add('visible');
        overlay.setAttribute('aria-hidden', 'false');

        const closeBtn = overlay.querySelector('.trail-review-close');
        if (closeBtn) {
            closeBtn.focus();
        }
    };

    window._closeTrailReview = function() {
        const overlay = document.getElementById('trail-review-overlay');
        if (!overlay) return;
        overlay.classList.remove('visible');
        overlay.setAttribute('aria-hidden', 'true');
        overlay.hidden = true;

        if (_trailReviewReturnFocus && typeof _trailReviewReturnFocus.focus === 'function') {
            _trailReviewReturnFocus.focus();
            _trailReviewReturnFocus = null;
        }
    };

    // Keyboard & Legend
    window.isKeyboardTextEntryTarget = isKeyboardTextEntryTarget;
    window.isKeyboardControlTarget = isKeyboardControlTarget;
    window.closeLegendGuide = closeLegendGuide;
    window.updateLegendGuideState = updateLegendGuideState;
    window.handleGalaxyKeydown = handleGalaxyKeydown;
    window.updateSelectedCardHeading = updateSelectedCardHeading;
    window.hydrateLeadContext = function (point, options = {}) {
        if (!point || !point.lead_id) return;
        updateSelectedBusiness(point, { revealCard: !!options.revealCard, skipUrlSync: true });
    };
}
