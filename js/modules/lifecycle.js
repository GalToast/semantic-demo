import { state } from '../state.js';
import {
    isCompactMapViewport,
    isCompactSearchViewport,
    formatBusinessName,
    escapeHtml,
    updateTime
} from '../utils.js';
import {
    setSemanticGuideButtonState,
    showSummaryCard,
    hideSummaryCard,
    requestSemanticGuide,
    semanticGuideIcon,
    getSemanticGuideTitle
} from './semantic-guide.js';
import { initEventListeners as initSemanticDemoEventListeners } from './event-bindings.js';
import { syncSemanticDiveUi } from './semantic-dive-ui.js';
import { showSemanticThreadsDetail } from './connection-analysis.js';
import { setActiveSearchResultRow, updateSelectedCardHeading } from './ui-renderers.js';

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
    syncFilterControls
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
    updateSearchTrailCue,
    clearSearchPreviewHoverTimer
} from './search-state.js';
import { focusOnNode } from './camera-controls.js';
import { clearFocusPocketIndices, clearFocusPocketMeta, clearFocusPocketRoleByIndex, clearFocusPocketMotionByIndex } from './focus-pocket.js';
import {
    updateSelectedBusiness,
    setTrailFromSeed,
    syncFocusStage,
    applyPointFilterColors
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

// === Nav Transition Reducer — Phase 1 Shell ===
// Central dispatch for exploration-phase navigation transitions.
// Phase 1: routes to existing setters/reset functions without changing behavior.
// Existing callers are NOT yet migrated — this shell provides the API surface.

/**
 * Nav transition action types.
 * @readonly
 * @enum {string}
 */
export const NAV_TRANSITION_ACTIONS = Object.freeze({
    FOCUS_NODE: 'FOCUS_NODE',
    SET_DEPTH: 'SET_DEPTH',
    WALK_TO: 'WALK_TO',
    BACKTRACK: 'BACKTRACK',
    RESET_FOCUS: 'RESET_FOCUS',
    RESET_EXPERIENCE: 'RESET_EXPERIENCE',
    ENTER_INSIDE: 'ENTER_INSIDE',
    EXIT_INSIDE: 'EXIT_INSIDE',
});

/**
 * Internal reducer for nav transition state machine.
 * Phase 1: No-op or delegation only — does not change live behavior.
 *
 * @param {string} action - One of NAV_TRANSITION_ACTIONS
 * @param {object} [payload={}] - Action-specific payload
 * @returns {{ action: string, handled: boolean, mode: string|null, noOp: boolean, reason: string }}
 */
function navTransitionReducer(action, payload = {}) {
    switch (action) {
        case NAV_TRANSITION_ACTIONS.RESET_FOCUS: {
            // Delegates to existing resetExplorationFocus for parity.
            // Avoids recursive loops by not calling setTrailDepth/setMyceliumMode here —
            // resetExplorationFocus handles those internally.
            resetExplorationFocus();
            return {
                action,
                handled: true,
                mode: state.navState.mode,
                noOp: false,
                reason: 'resetExplorationFocus called',
            };
        }

        case NAV_TRANSITION_ACTIONS.RESET_EXPERIENCE: {
            // Delegates to existing resetExperienceState for parity.
            resetExperienceState();
            return {
                action,
                handled: true,
                mode: state.navState.mode,
                noOp: false,
                reason: 'resetExperienceState called',
            };
        }

        case NAV_TRANSITION_ACTIONS.SET_DEPTH: {
            // Delegates to existing setTrailDepth for parity.
            // Guard: depth=2 requires fromUserGesture; silent attempts are silently ignored
            // by setTrailDepth's own gate (lifecycle.js setTrailDepth line 296).
            const { depth = 0, fromUserGesture = false, allowDiveExit = false, skipUrlSync = false } = payload;
            setTrailDepth(depth, { fromUserGesture, allowDiveExit, skipUrlSync });
            return {
                action,
                handled: true,
                mode: state.navState.mode,
                noOp: false,
                reason: `setTrailDepth(${depth}) called`,
            };
        }

        case NAV_TRANSITION_ACTIONS.ENTER_INSIDE: {
            // Delegates to existing setSemanticDiveMode(true) for parity.
            // setSemanticDiveMode internally sets navState.mode='trail' and calls setTrailDepth(2).
            setSemanticDiveMode(true);
            return {
                action,
                handled: true,
                mode: state.navState.mode,
                noOp: false,
                reason: 'setSemanticDiveMode(true) called',
            };
        }

        case NAV_TRANSITION_ACTIONS.EXIT_INSIDE: {
            // Delegates to existing setSemanticDiveMode(false) for parity.
            setSemanticDiveMode(false);
            return {
                action,
                handled: true,
                mode: state.navState.mode,
                noOp: false,
                reason: 'setSemanticDiveMode(false) called',
            };
        }

        case NAV_TRANSITION_ACTIONS.FOCUS_NODE: {
            // Phase 2: Migrated — focusOnNode delegates navState writes here.
            // focusOnNode retains ownership of focusedNode, selectedPoint, trailDepth,
            // myceliumMode, and all side-effect calls.
            const {
                index,
                preserveMode,
                fromTraversal,
                fromCanvasNode,
                appendHistory,
                restoreHistory
            } = payload;

            // Compute resulting mode
            let nextMode = 'focus';
            if (preserveMode && state.navState.mode) {
                nextMode = state.navState.mode;
            } else if (fromTraversal) {
                nextMode = 'trail';
            }

            state.navState.mode = nextMode;
            state.navState.focusedIndex = index;

            // activeStoryPrompt clearing: mirrors focusOnNode behavior
            if (nextMode === 'trail' || fromCanvasNode) {
                state.activeStoryPrompt = null;
            }

            // explorationHistoryIndices: owned by FOCUS_NODE reducer
            if (restoreHistory) {
                // preserve existing
            } else if (appendHistory) {
                const history = [...(state.navState.explorationHistoryIndices || [])];
                if (history[history.length - 1] !== index) history.push(index);
                state.navState.explorationHistoryIndices = history;
            } else {
                state.navState.explorationHistoryIndices = [index];
            }

            return {
                action,
                handled: true,
                mode: nextMode,
                noOp: false,
                reason: 'FOCUS_NODE reducer owns navState.mode, focusedIndex, explorationHistoryIndices',
            };
        }

        case NAV_TRANSITION_ACTIONS.WALK_TO: {
            // Phase 2: navTransitionReducer owns walkHistoryIndices; journey.walkThreadNeighbor
            // is the traversal engine (camera, focus pocket, strand continuity).
            // Journey traversal side effects remain intact, but history writes route here.
            const { index, fromIndex, appendHistory, restoreHistoryIndices } = payload;
            if (Array.isArray(restoreHistoryIndices)) {
                state.navState.walkHistoryIndices = restoreHistoryIndices
                    .filter((value) => Number.isFinite(value));
            } else if (appendHistory !== false) {
                // Owner of walkHistoryIndices — canonical push
                const history = [...(state.navState.walkHistoryIndices || [])];
                if (Number.isFinite(fromIndex) && history[history.length - 1] !== fromIndex) history.push(fromIndex);
                if (history[history.length - 1] !== index) history.push(index);
                state.navState.walkHistoryIndices = history;
            }
            state.navState.mode = 'trail';
            // Delegate all traversal side effects (camera animation, focus pocket rebuild,
            // strand continuity, URL sync) to the existing walkThreadNeighbor engine.
            // Journey.js is responsible for calling this reducer first; this branch
            // handles the history write and traversal delegate.
            return {
                action,
                handled: true,
                mode: state.navState.mode,
                noOp: false,
                reason: 'WALK_TO reducer owns walkHistoryIndices; delegates traversal to journey.walkThreadNeighbor',
            };
        }

        case NAV_TRANSITION_ACTIONS.BACKTRACK: {
            // Phase 2: navTransitionReducer owns walkHistoryIndices pop; journey.traverseNeighbor
            // is the traversal engine for the backtrack sub-path.
            // Note: the bounded-neighborhood loop path (getBoundedNeighborhoodWalkCandidate)
            // does NOT write walkHistoryIndices — only the history-based backtrack path does.
            const { step, restoreHistory } = payload;
            if (step < 0 && restoreHistory) {
                // Owner of walkHistoryIndices — canonical pop
                const history = [...(state.navState.walkHistoryIndices || [])];
                if (history.length > 0) {
                    history.pop(); // remove the current position, leaving prior position
                }
                state.navState.walkHistoryIndices = history;
            }
            // Delegate traversal side effects to journey.traverseNeighbor.
            // journey.traverseNeighbor will call walkThreadNeighbor for the actual step.
            return {
                action,
                handled: true,
                mode: state.navState.mode,
                noOp: false,
                reason: 'BACKTRACK reducer owns walkHistoryIndices pop; delegates traversal to journey.traverseNeighbor',
            };
        }

        default: {
            return {
                action,
                handled: false,
                mode: state.navState.mode,
                noOp: true,
                reason: `Unknown action: ${action}`,
            };
        }
    }
}

/**
 * Central dispatch for nav transition actions.
 * Exported as public API — mirrors the window-bridge pattern used by other lifecycle APIs.
 *
 * @param {string} action - One of NAV_TRANSITION_ACTIONS
 * @param {object} [payload={}] - Action-specific payload
 * @returns {{ action: string, handled: boolean, mode: (string|null), noOp: boolean, reason: string }}
 */
export function dispatchNavTransition(action, payload = {}) {
    return navTransitionReducer(action, payload);
}

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
        state.navState.threadCandidates = [];
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
    state.bloomIndices.clear();

    // Calculate signal scores for all points
    if (state.signalScores.length !== state.points.length) {
        state.signalScores = new Array(state.points.length).fill(0);
    }
    for (let i = 0; i < state.points.length; i++) {
        const p = state.points[i];
        let score = 0;
        if (p.website) score += 1.35;
        if (p.email) score += 1.0;
        if (p.phone) score += 0.45;
        if (p.lat && p.lng) score += 1.25;
        if (p.status === 'active') score += 0.55;
        if (p.trivia) score += 0.35;
        state.signalScores[i] = score;
    }

    // Keep Bloom mode selective so it reads as a signal layer, not a full-canvas flash.
    const sorted = [...state.signalScores].sort((a, b) => b - a);
    const threshold = sorted[Math.min(Math.floor(sorted.length * 0.12), sorted.length - 1)] || 0;
    const bloomThreshold = Math.max(threshold, 2.95);

    for (let i = 0; i < state.signalScores.length; i++) {
        if (state.signalScores[i] >= bloomThreshold) {
            state.bloomIndices.add(i);
        }
    }
}

function recomputeBridgeIndices() {
    if (!state.points || state.points.length === 0 || !state.originalPositions) return;
    state.bridgeIndices.clear();
    if (state.bridgeScores.length !== state.points.length) {
        state.bridgeScores = new Array(state.points.length).fill(0);
    }

    const cellSize = 0.12;
    const grid = new Map();
    for (let i = 0; i < state.originalPositions.length; i++) {
        const pos = state.originalPositions[i];
        const gx = Math.floor(pos.x / cellSize);
        const gy = Math.floor(pos.y / cellSize);
        const gz = Math.floor(pos.z / cellSize);
        const key = `${gx},${gy},${gz}`;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(i);
    }

    const maxDist = 0.17;
    for (let i = 0; i < state.points.length; i++) {
        const pos = state.originalPositions[i];
        if (!pos) continue;
        const gx = Math.floor(pos.x / cellSize);
        const gy = Math.floor(pos.y / cellSize);
        const gz = Math.floor(pos.z / cellSize);
        const foreignClusters = new Set();
        let weight = 0;

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    const neighbors = grid.get(`${gx + dx},${gy + dy},${gz + dz}`);
                    if (!neighbors) continue;
                    for (const j of neighbors) {
                        if (j === i) continue;
                        const neighborPos = state.originalPositions[j];
                        if (!neighborPos) continue;
                        const dx = pos.x - neighborPos.x;
                        const dy = pos.y - neighborPos.y;
                        const dz = pos.z - neighborPos.z;
                        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
                        if (d > maxDist) continue;
                        if (!state.points[i] || !state.points[j]) continue;
                        const otherCluster = state.points[j].cluster;
                        if (otherCluster !== state.points[i].cluster) {
                            foreignClusters.add(otherCluster);
                            if (Number.isFinite(state.signalScores[j])) {
                                weight += state.signalScores[j] * (1 - d / maxDist);
                            }
                        }
                    }
                }
            }
        }

        state.bridgeScores[i] = weight;
        if (foreignClusters.size > 1 && weight >= 0.7) {
            state.bridgeIndices.add(i);
        }
    }
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
        const foodCluster = window.findClusterByKeyword ? window.findClusterByKeyword('restaurant') : null;
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

export function updateUrlState(extra = {}, options = {}) {
    if (state.restoringBrowserHistory) return;
    if (typeof window === 'undefined' || !window.location || !window.history) return;

    const params = new URLSearchParams(window.location.search);

    params.set('view', state.currentView);
    if (state.semanticLaneOpsMode) params.set('ops', '1');
    else params.delete('ops');

    const query = (document.getElementById('search-input')?.value || '').trim();
    if (query) params.set('q', query);
    else params.delete('q');

    const anchorIndex = state.currentSearchSummary?.anchorIndex;
    if (!Number.isFinite(anchorIndex) || anchorIndex < 0 || anchorIndex >= state.points?.length) {
        params.delete('anchor');
    } else {
        const anchorLeadId = state.points[anchorIndex]?.lead_id;
        if (anchorLeadId !== null && anchorLeadId !== undefined && anchorLeadId !== '') {
            params.set('anchor', String(anchorLeadId));
        } else {
            params.delete('anchor');
        }
    }

    if (state.activeFilters.status !== 'all') params.set('status', state.activeFilters.status);
    else params.delete('status');

    if (state.activeFilters.city !== 'all') params.set('city', state.activeFilters.city);
    else params.delete('city');

    ['website', 'email', 'geocoded'].forEach((key) => {
        if (state.activeFilters[key]) params.set(key, '1');
        else params.delete(key);
    });

    if (state.myceliumMode !== 'default') params.set('mode', state.myceliumMode);
    else params.delete('mode');

    if (state.trailDepth > 0) params.set('depth', String(state.trailDepth));
    else params.delete('depth');

    if (state.activeStoryPrompt) params.set('story', state.activeStoryPrompt);
    else params.delete('story');

    if (state.activeClusterFilter !== null) params.set('cluster', String(state.activeClusterFilter));
    else params.delete('cluster');

    if (state.selectedPoint?.lead_id) params.set('record', String(state.selectedPoint.lead_id));
    else params.delete('record');
    params.delete('lead');

    Object.entries(extra).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') params.delete(key);
        else params.set(key, String(value));
    });

    const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
    const current = `${window.location.pathname}${window.location.search}`;
    const historyState = {
        semanticDemo: true,
        reason: options.reason || 'state',
        params: Object.fromEntries(params.entries())
    };
    if (next === current) {
        if (!window.history.state?.semanticDemo || !window.history.state?.params) {
            window.history.replaceState(historyState, '', next);
        }
        return;
    }

    const method = options.mode === 'push' && !state.applyingUrlState ? 'pushState' : 'replaceState';
    try {
        window.history[method](historyState, '', next);
    } catch (err) {
        if (err.name !== 'SecurityError') console.warn('updateUrlState history call failed:', err);
    }
}

export async function copyCurrentViewLink() {
    let shareUrl;
    try {
        shareUrl = new URL(window.location.href);
    } catch {
        if (typeof window.showExperienceToast === 'function') window.showExperienceToast('Copy unavailable', 'Could not read the current page URL.');
        return null;
    }
    shareUrl.searchParams.delete('cb');
    shareUrl.searchParams.delete('lead');
    shareUrl.searchParams.set('view', state.currentView || 'galaxy');

    if (state.selectedPoint?.lead_id) {
        shareUrl.searchParams.set('record', String(state.selectedPoint.lead_id));
    }
    if (state.myceliumMode && state.myceliumMode !== 'default') {
        shareUrl.searchParams.set('mode', state.myceliumMode);
    }
    if (state.currentSearchSummary?.query) {
        shareUrl.searchParams.set('q', state.currentSearchSummary.query);
    }
    if (state.activeClusterFilter) {
        shareUrl.searchParams.set('cluster', state.activeClusterFilter);
    }
    if (state.activeStoryPrompt) {
        shareUrl.searchParams.set('story', state.activeStoryPrompt);
    }
    if (Number.isFinite(state.currentSearchSummary?.anchorIndex)) {
        shareUrl.searchParams.set('anchor', state.currentSearchSummary.anchorIndex);
    }

    const href = shareUrl.toString();
    try {
        await navigator.clipboard.writeText(href);
    } catch (err) {
        // Clipboard access can fail with SecurityError or AbortError — do not throw through UI.
        console.warn('Clipboard write failed:', err);
        if (typeof window.showExperienceToast === 'function') {
            window.showExperienceToast('Copy unavailable', 'Could not write to clipboard.');
        }
        return null;
    }
    state.lastCopiedViewLink = href;
    if (typeof window.showExperienceToast === 'function') window.showExperienceToast('View link copied', 'Link copied to clipboard.');
    return href;
}

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
    state.navState.focusedIndex = null;
    state.navState.trailSeedIndex = null;
    state.navState.trailNeighborIndices = [];
    state.navState.trailCursor = -1;
    state.navState.explorationHistoryIndices = [];
    state.navState.lastTraversalReason = null;
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
    if (typeof window.setSearchPanelState === 'function') window.setSearchPanelState({ searching: false, focusing: false, resultsRendered: false });
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
    state.navState.threadCandidates = [];
    state.nodesAreSettling = false;
}

// === View Management ===

export function hideViewHandoff() {
    const handoff = document.getElementById('view-handoff');
    if (state.viewHandoffTimer) {
        window.clearTimeout(state.viewHandoffTimer);
        state.viewHandoffTimer = null;
    }
    document.body.dataset.viewHandoffActive = 'false';
    if (!handoff) return;
    handoff.classList.remove('active');
    handoff.setAttribute('aria-hidden', 'true');
}

export function showViewHandoff(view) {
    const handoff = document.getElementById('view-handoff');
    if (!handoff) return;
    const model = getViewHandoffModel(view);
    const runeEl = document.getElementById('view-handoff-rune');
    const kickerEl = document.getElementById('view-handoff-kicker');
    const titleEl = document.getElementById('view-handoff-title');
    const noteEl = document.getElementById('view-handoff-note');

    if (runeEl) {
        runeEl.innerHTML = semanticGuideIcon(model.icon, view === 'map' ? 'Map view' : 'Mycelium view');
    }
    if (kickerEl) kickerEl.textContent = model.kicker;
    if (titleEl) titleEl.textContent = model.title;
    if (noteEl) noteEl.textContent = model.note;

    if (state.viewHandoffTimer) {
        window.clearTimeout(state.viewHandoffTimer);
        state.viewHandoffTimer = null;
    }

    handoff.setAttribute('aria-hidden', 'false');
    handoff.classList.add('active');
    document.body.dataset.viewHandoffActive = 'true';
    state.viewHandoffTimer = window.setTimeout(() => {
        handoff.classList.remove('active');
        handoff.setAttribute('aria-hidden', 'true');
        document.body.dataset.viewHandoffActive = 'false';
        state.viewHandoffTimer = null;
    }, 2200);
}

export function switchView(view, options = {}) {
    invokeClearMobileRouteFieldPeek();
    const previousView = state.currentView;
    const handoffFrom = options.handoffFrom || (typeof window.getRouteLayerOrigin === 'function' ? window.getRouteLayerOrigin() : 'galaxy');
    const shouldPreludeToMap =
        view === 'map' &&
        previousView === 'galaxy' &&
        !options.skipTerrainPrelude &&
        !options.skipUrlSync &&
        !options.silentHandoff;
    if (shouldPreludeToMap) {
        const routeCount = getRouteEmbodimentIndices().length;
        if (state.viewSwitchPreludeTimer) {
            window.clearTimeout(state.viewSwitchPreludeTimer);
            state.viewSwitchPreludeTimer = null;
        }
        setTerrainHandoffState('flattening', {
            from: handoffFrom,
            to: 'map',
            routeCount
        });
        if (typeof window.setRouteChoreographyPhase === 'function') {
            window.setRouteChoreographyPhase('terrain-prelude', {
                reason: 'map-prelude',
                anchorIndex: state.currentSearchSummary?.anchorIndex ?? state.navState?.focusedIndex ?? null,
                indexCount: routeCount
            });
        }
        if (typeof window.animateCameraToTerrainPrelude === 'function') {
            window.animateCameraToTerrainPrelude({ duration: state.MAP_HANDOFF_PRELUDE_MS || 1200 });
        }
        
        // 10/10 Polish: Flatten Three.js nodes to map coordinates during prelude
        if (typeof window.applyMapFlatteningLayout === 'function') {
            window.applyMapFlatteningLayout(true);
        }

        showViewHandoff('map');
        state.viewSwitchPreludeTimer = window.setTimeout(() => {
            state.viewSwitchPreludeTimer = null;
            if (state.currentView !== 'galaxy') return;
            switchView('map', {
                ...options,
                skipTerrainPrelude: true,
                handoffFrom
            });
        }, state.MAP_HANDOFF_PRELUDE_MS || 1200);
        return;
    }
    state.currentView = view;
    
    // 10/10 Polish: Transition Choreography
    document.body.classList.add('view-transitioning');
    document.body.dataset.activeView = view;
    document.body.dataset.cameraAssist = 'arriving';
    
    // Auto-remove transitioning class after animation completes
    window.setTimeout(() => {
        document.body.classList.remove('view-transitioning');
        if (document.body.dataset.cameraAssist === 'arriving') {
            document.body.dataset.cameraAssist = 'free';
        }
    }, 1200);
    
    if (view === 'map') {
        hideViewHandoff();
        scheduleMapRouteRefresh();
    }
    if (view !== 'galaxy' && view !== 'map') {
        if (typeof window.clearRouteExploration === 'function') window.clearRouteExploration('map-handoff');
    } else if (previousView === 'map' && Number.isFinite(state.navState.focusedIndex)) {
        // 10/10 Polish: Reset map flattening
        if (typeof window.applyMapFlatteningLayout === 'function') {
            window.applyMapFlatteningLayout(false);
        }
        
        // returning to galaxy from map while focused: restore focus pocket camera depth
        if (typeof window.animateCameraToNode === 'function') {
            window.animateCameraToNode(state.navState.focusedIndex, { 
                transitionStyle: state.semanticDiveMode ? 'dive' : 'focus',
                duration: 1100 
            });
        }
    }

    const legendPanel = document.getElementById('legend-panel');
    const legendToggle = document.getElementById('btn-legend');
    if (legendPanel && legendToggle) {
        legendPanel.classList.remove('active');
        legendPanel.setAttribute('aria-hidden', 'true');
        document.documentElement.dataset.legendActive = 'false';
        legendToggle.setAttribute('aria-expanded', 'false');
        legendToggle.setAttribute('aria-pressed', 'false');
        legendToggle.setAttribute('aria-label', 'Show field guide');
    }

    const btnGalaxy = document.getElementById('btn-galaxy');
    const btnMap = document.getElementById('btn-map');
    if (btnGalaxy) {
        btnGalaxy.classList.toggle('active', view === 'galaxy');
        btnGalaxy.setAttribute('aria-pressed', String(view === 'galaxy'));
    }
    if (btnMap) {
        btnMap.classList.toggle('active', view === 'map');
        btnMap.setAttribute('aria-pressed', String(view === 'map'));
    }

    const canvasContainer = document.getElementById('canvas-container');
    const mapContainer = document.getElementById('map-container');
    if (state.viewSwitchPreludeTimer) {
        window.clearTimeout(state.viewSwitchPreludeTimer);
        state.viewSwitchPreludeTimer = null;
    }

    // Clean up orphaned timers when leaving galaxy view
    if (view !== 'galaxy') {
        if (state.clockTimer) {
            window.clearInterval(state.clockTimer);
            state.clockTimer = null;
        }
        clearWeatherRefreshTimer();
        if (state.semanticLaneMonitorTimer) {
            window.clearInterval(state.semanticLaneMonitorTimer);
            state.semanticLaneMonitorTimer = null;
        }
        if (state.semanticLaneOpsRefreshTimer) {
            window.clearInterval(state.semanticLaneOpsRefreshTimer);
            state.semanticLaneOpsRefreshTimer = null;
        }
    }

    if (view === 'galaxy') {
        if (previousView === 'map') {
            setTerrainHandoffState('returning', {
                from: state.terrainHandoffState?.from || 'map',
                to: 'galaxy',
                routeCount: getRouteEmbodimentIndices().length,
                settleAfterMs: 1200,
                settlePhase: 'idle'
            });
        } else {
            setTerrainHandoffState('idle', { from: handoffFrom, to: 'galaxy' });
        }
        if (canvasContainer) canvasContainer.classList.remove('hidden');
        if (mapContainer) mapContainer.classList.remove('active');
        clearWeatherEffects();
        document.getElementById('weather-overlay')?.classList.remove('active');
        if (state.selectedPoint) {
            const selectedIndex = state.points.indexOf(state.selectedPoint);
            if (selectedIndex >= 0) {
                focusOnNode(selectedIndex, {
                    skipUrlSync: true,
                    fromSearchResult: !!state.currentSearchSummary,
                    restoreHistory: true,
                    preserveMode: true
                });
                setTrailFromSeed(selectedIndex);
            }
        } else if (
            state.currentSearchSummary?.anchorIndex !== null &&
            state.currentSearchSummary?.anchorIndex !== undefined
        ) {
            const anchorIndex = state.currentSearchSummary.anchorIndex;
            if (typeof window.setRouteChoreographyPhase === 'function') {
                window.setRouteChoreographyPhase('search-corridor', {
                    reason: 'return-to-mycelium-search',
                    anchorIndex,
                    indexCount: state.currentSearchSummary.resultIndices?.length || 0
                });
            }
            if (typeof window.animateCameraToSearchCorridor === 'function') {
                window.animateCameraToSearchCorridor(
                    anchorIndex,
                    state.currentSearchSummary.resultIndices || [],
                    {
                        reason: 'return-to-mycelium'
                    }
                );
            }
            focusOnNode(anchorIndex, {
                skipUrlSync: true,
                fromSearchResult: true,
                restoreHistory: true,
                preserveMode: true
            });
            setTrailFromSeed(anchorIndex);
        } else {
            if (typeof window.setRouteChoreographyPhase === 'function') {
                window.setRouteChoreographyPhase('overview', {
                    reason: 'return-to-mycelium-overview',
                    anchorIndex: null,
                    indexCount: 0
                });
            }
        }
    } else {
        const routeCount = getRouteEmbodimentIndices().length;
        setTerrainHandoffState('landing', {
            from: handoffFrom,
            to: 'map',
            routeCount,
            settleAfterMs: 1800,
            settlePhase: 'settled'
        });
        if (typeof window.setRouteChoreographyPhase === 'function') {
            window.setRouteChoreographyPhase('terrain-landing', {
                reason: 'map-handoff',
                anchorIndex: state.currentSearchSummary?.anchorIndex ?? state.navState?.focusedIndex ?? null,
                indexCount: routeCount
            });
        }
        initMap()
            .then(() => {
                if (state.currentView !== 'map') return;
                if (state.map) {
                    setTimeout(() => {
                        state.map.invalidateSize();
                        scheduleMapRouteRefresh();
                    }, 100);
                }
                if (state.weather) applyWeatherEffects();
            })
            .catch((error) => {
                console.error('Map initialization failed:', error);
            });
        if (!state.weatherInitialized) {
            scheduleWeatherHydration();
        }
        if (canvasContainer) canvasContainer.classList.add('hidden');
        if (mapContainer) mapContainer.classList.add('active');
    }

    if (!options.skipUrlSync) {
        updateUrlState({}, { mode: options.historyMode || 'push', reason: 'view' });
    }
    if (typeof window.syncClusterSectionState === 'function') window.syncClusterSectionState();
    if (typeof window.updateLegendGuideState === 'function') window.updateLegendGuideState();
    syncFocusStage(state.selectedPoint);
    if (!state.selectedPoint) {
        updateSelectedBusiness(null);
    }
    refreshCompositionState();
    if (!options.silentHandoff) {
        showViewHandoff(view);
    }
}

export function showExperienceToast(title, copy) {
    const toast = document.getElementById('experience-reset-toast');
    if (!toast) return;
    const titleEl = document.getElementById('experience-toast-title');
    const copyEl = document.getElementById('experience-toast-copy');
    toast.setAttribute('aria-hidden', 'false');
    toast.setAttribute('aria-live', 'assertive');
    if (titleEl) titleEl.textContent = title;
    if (copyEl) copyEl.textContent = copy;
    toast.classList.add('active');
    if (state.experienceResetToastTimer) {
        window.clearTimeout(state.experienceResetToastTimer);
    }
    state.experienceResetToastTimer = window.setTimeout(() => {
        toast.classList.remove('active');
        toast.setAttribute('aria-hidden', 'true');
        toast.setAttribute('aria-live', 'polite');
        if (titleEl) titleEl.textContent = '';
        if (copyEl) copyEl.textContent = '';
        state.experienceResetToastTimer = null;
    }, 2100);
}

// === Search UI ===

export function syncSearchStatusForFocus(point, options = {}) {
    const statusEl = document.getElementById('search-status');
    const resultsEl = document.getElementById('search-results');
    if (!statusEl || !point || !state.currentSearchSummary) return;
    if (!resultsEl?.classList.contains('active')) return;
    if (typeof setActiveSearchResultRow === 'function') {
        setActiveSearchResultRow(
            resultsEl,
            options.fromTraversal ? state.navState.focusedIndex : state.currentSearchSummary.anchorIndex
        );
    }

    const pointName = formatBusinessName(point.name);
    const queryLabel = state.currentSearchSummary.query
        ? `"${state.currentSearchSummary.query}"`
        : 'this connection path';
    const compactMapCopy = isCompactMapViewport();
    const compactGalaxyCopy = isCompactSearchViewport();

    if (options.fromSearchResult) {
        statusEl.textContent = compactMapCopy
            ? `${pointName} is centered in ${queryLabel}. Preview in the stack or use Prev / Next to explore.`
            : compactGalaxyCopy
              ? `${pointName} is now centered. Use the pocket controls below to enter, inspect, or explore nearby stops.`
              : `${pointName} is centered in ${queryLabel}. Hover the stack to preview another pocket, or use Prev / Next to explore further.`;
        updateSearchTrailCue({
            beat: 'focus',
            kicker: 'Anchor locked',
            title: `${pointName} is now centered`,
            note: compactMapCopy
                ? 'Search opens a trail. Preview nearby matches in the stack or use Prev / Next to explore.'
                : compactGalaxyCopy
                  ? 'Search opens a trail. Enter the mycelium, inspect connections, or explore the nearby stops below.'
                  : 'Search opens a trail. Preview ranked matches in the stack, or use Prev / Next to explore outward from this neighborhood.'
        });
        return;
    }

    if (options.fromTraversal) {
        statusEl.textContent = compactMapCopy
            ? `${pointName} is centered in ${queryLabel}. Prev / Next explores nearby businesses.`
            : `${pointName} is now centered in ${queryLabel}. Use Prev / Next to explore nearby businesses, or the result stack to jump back into ranked matches.`;
        updateSearchTrailCue({
            beat: 'walk',
            kicker: 'Semantic exploration in progress',
            title: `Exploring from ${pointName}`,
            note: compactMapCopy
                ? 'Prev / Next keeps stepping through this nearby business trail.'
                : 'The trail is live now. Use Prev / Next to explore further, or jump sideways from the ranked stack.'
        });
        return;
    }

    statusEl.textContent = compactMapCopy
        ? `${pointName} is centered in ${queryLabel}. Preview or jump from the stack.`
        : `${pointName} is centered in ${queryLabel}. Use the result stack to preview or jump, or Prev / Next to explore nearby businesses.`;
    updateSearchTrailCue({
        beat: 'focus',
        kicker: 'Search opens a trail.',
        title: `${pointName} anchors this trail`,
        note: compactMapCopy
            ? 'Preview another match in the stack, or walk forward from this anchor.'
            : 'The ranked stack still shows the broader query, while this focus keeps the active anchor.'
    });
}

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
    if (typeof window.updateTraversalUi === 'function') window.updateTraversalUi();
    refreshMapRouteEmbodiment();
    refreshCompositionState();
    if (!options.skipUrlSync) {
        updateUrlState({ record: null }, { reason: 'reset' });
    }
}

// === Input Helpers & Legend ===

export function isKeyboardTextEntryTarget(target) {
    if (!target || typeof target.tagName !== 'string') return false;
    const tagName = target.tagName.toLowerCase();
    const type = typeof target.type === 'string' ? target.type.toLowerCase() : '';
    
    if (tagName === 'input' && (type === 'text' || type === 'search' || type === 'email' || type === 'url' || type === 'password')) {
        return true;
    }
    if (tagName === 'textarea') return true;
    if (target.isContentEditable) return true;
    
    return false;
}

export function isKeyboardControlTarget(target) {
    if (!target || typeof target.tagName !== 'string') return false;
    const tagName = target.tagName.toLowerCase();
    if (tagName === 'button' || tagName === 'select' || tagName === 'a') return true;
    return false;
}

export function updateLegendGuideState() {
    const legendPanel = document.getElementById('legend-panel');
    if (!legendPanel) return;
    const guide = state.currentSemanticGuide;
    if (!guide) {
        if (legendPanel.classList.contains('active')) {
            legendPanel.classList.remove('active');
            legendPanel.setAttribute('aria-hidden', 'true');
            legendPanel.innerHTML = '';
            document.documentElement.dataset.legendActive = 'false';
        }
        return;
    }
    // Auto-open the legend panel when guide data is available
    if (!legendPanel.classList.contains('active')) {
        legendPanel.classList.add('active');
        legendPanel.setAttribute('aria-hidden', 'false');
        document.documentElement.dataset.legendActive = 'true';
        const legendToggle = document.getElementById('btn-legend');
        if (legendToggle) {
            legendToggle.setAttribute('aria-expanded', 'true');
            legendToggle.setAttribute('aria-pressed', 'true');
            legendToggle.setAttribute('aria-label', 'Hide field guide');
        }
    }
    const kicker = guide.laneStatus || 'Field Guide';
    const title = getSemanticGuideTitle(guide);
    const note = guide.text || '';
    const next = guide.nextLabel || '';
    legendPanel.innerHTML = `
        <div class="legend-guide">
            <div class="legend-guide-head">
                <span class="legend-guide-kicker">${escapeHtml(kicker)}</span>
            </div>
            <div class="legend-guide-title">${escapeHtml(title)}</div>
            ${note ? `<div class="legend-guide-note">${escapeHtml(note)}</div>` : ''}
            ${next ? `<div class="legend-guide-next">${escapeHtml(next)}</div>` : ''}
        </div>
    `;
}

export function closeLegendGuide(options = {}) {
    const legendPanel = document.getElementById('legend-panel');
    const legendToggle = document.getElementById('btn-legend');
    if (!legendPanel || !legendPanel.classList.contains('active')) return;

    legendPanel.classList.remove('active');
    legendPanel.setAttribute('aria-hidden', 'true');
    document.documentElement.dataset.legendActive = 'false';
    if (legendToggle) {
        legendToggle.setAttribute('aria-expanded', 'false');
        legendToggle.setAttribute('aria-pressed', 'false');
        legendToggle.setAttribute('aria-label', 'Show field guide');
    }

    if (options.restoreFocusPanel !== false && typeof window.restoreLegendCollapsedPanel === 'function') {
        window.restoreLegendCollapsedPanel();
    }
    if (options.restoreFocus) {
        if (window._previouslyFocusedLegend) {
            window._previouslyFocusedLegend.focus({ preventScroll: true });
        } else if (legendToggle) {
            legendToggle.focus({ preventScroll: true });
        }
    }
}

// === Keyboard Shortcuts Hint Panel ===

let _shortcutsPanelArrowToastShown = false;
let _keyboardShortcutKeyListenerBound = false;

export function initKeyboardShortcutsHint() {
    // Don't re-create if already in DOM
    if (document.getElementById('keyboard-hint-panel')) return;

    let _previouslyFocused = null;

    const panel = document.createElement('div');
    panel.id = 'keyboard-hint-panel';
    panel.className = 'keyboard-hint-panel';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Keyboard shortcuts');
    panel.setAttribute('aria-hidden', 'true');
    panel.innerHTML = `
        <div class="kh-title">Keyboard Shortcuts</div>
        <div class="kh-row"><span class="kh-keys"><kbd>Arrow</kbd></span><span>Navigate nodes</span></div>
        <div class="kh-row"><span class="kh-keys"><kbd>Home</kbd></span><span>Reset view</span></div>
        <div class="kh-row"><span class="kh-keys"><kbd>End</kbd></span><span>Recenter</span></div>
        <div class="kh-row"><span class="kh-keys"><kbd>+ / -</kbd></span><span>Zoom</span></div>
        <div class="kh-row"><span class="kh-keys"><kbd>Esc</kbd></span><span>Close overlays</span></div>
        <button class="kh-close" type="button" aria-label="Dismiss shortcuts panel">&times;</button>
    `;
    document.body.appendChild(panel);

    function closePanel() {
        if (panel._autoDismissTimer) {
            clearTimeout(panel._autoDismissTimer);
            panel._autoDismissTimer = null;
        }
        panel.classList.remove('visible');
        panel.setAttribute('aria-hidden', 'true');
        const helpButton = document.getElementById('btn-keyboard-help');
        if (helpButton) {
            helpButton.setAttribute('aria-expanded', 'false');
            helpButton.setAttribute('aria-pressed', 'false');
        }
        sessionStorage.setItem('kh_dismissed', '1');
        if (_previouslyFocused) {
            _previouslyFocused.focus();
            _previouslyFocused = null;
        }
        document.removeEventListener('keydown', _onPanelKeydown);
    }

    function _onPanelKeydown(e) {
        if (e.key === 'Escape') {
            e.stopPropagation();
            closePanel();
            return;
        }
        // Simple focus trap: Tab cycles within the panel
        if (e.key === 'Tab') {
            const focusable = panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    }

    // Wire the close button
    panel.querySelector('.kh-close').addEventListener('click', closePanel);

    function openPanel(returnFocusEl) {
        if (panel._autoDismissTimer) {
            clearTimeout(panel._autoDismissTimer);
            panel._autoDismissTimer = null;
        }
        _previouslyFocused = returnFocusEl || document.getElementById('btn-keyboard-help') || document.activeElement;
        const onboarding = document.getElementById('onboarding-hint');
        onboarding?.classList.remove('visible');
        onboarding?.setAttribute('aria-hidden', 'true');
        panel.classList.add('visible');
        panel.setAttribute('aria-hidden', 'false');
        const helpButton = document.getElementById('btn-keyboard-help');
        if (helpButton) {
            helpButton.setAttribute('aria-expanded', 'true');
            helpButton.setAttribute('aria-pressed', 'true');
        }
        panel.querySelector('.kh-close')?.focus({ preventScroll: true });
        document.removeEventListener('keydown', _onPanelKeydown);
        document.addEventListener('keydown', _onPanelKeydown);
    }

    panel._openKeyboardHintPanel = openPanel;
    panel._closeKeyboardHintPanel = closePanel;

    // Wire "?" toolbar button if it exists
    const helpBtn = document.getElementById('btn-keyboard-help');
    if (helpBtn) {
        helpBtn.setAttribute('aria-controls', 'keyboard-hint-panel');
        helpBtn.setAttribute('aria-expanded', 'false');
        helpBtn.setAttribute('aria-pressed', 'false');
        helpBtn.addEventListener('click', () => {
            if (panel.classList.contains('visible')) {
                closePanel();
            } else {
                openPanel(document.activeElement || helpBtn);
            }
        });
    }

    if (!_keyboardShortcutKeyListenerBound) {
        _keyboardShortcutKeyListenerBound = true;
        document.addEventListener('keydown', (event) => {
            const isShortcutKey = event.key === '?' || (event.key === '/' && event.shiftKey);
            if (!isShortcutKey) return;
            if (isKeyboardTextEntryTarget(event.target)) return;
            event.preventDefault();
            event.stopPropagation();
            openPanel(document.getElementById('btn-keyboard-help'));
        });
    }

    // Keep shortcuts on demand through the toolbar and keyboard shortcut.
}

export function showKeyboardShortcutsHint() {
    const panel = document.getElementById('keyboard-hint-panel');
    if (!panel) return;
    if (typeof panel._openKeyboardHintPanel === 'function') {
        panel._openKeyboardHintPanel(document.getElementById('btn-keyboard-help'));
    } else {
        const onboarding = document.getElementById('onboarding-hint');
        onboarding?.classList.remove('visible');
        onboarding?.setAttribute('aria-hidden', 'true');
        panel.classList.add('visible');
        panel.setAttribute('aria-hidden', 'false');
        panel.querySelector('.kh-close')?.focus({ preventScroll: true });
    }
    // Auto-dismiss after 5 seconds — clear any pending auto-dismiss first to avoid double-firing
    if (panel._autoDismissTimer) clearTimeout(panel._autoDismissTimer);
    panel._autoDismissTimer = setTimeout(() => {
        if (typeof panel._closeKeyboardHintPanel === 'function') {
            panel._closeKeyboardHintPanel();
        } else {
            panel.classList.remove('visible');
            panel.setAttribute('aria-hidden', 'true');
        }
        panel._autoDismissTimer = null;
    }, 5000);
}

export function flashArrowKeyToast() {
    if (_shortcutsPanelArrowToastShown) return;
    _shortcutsPanelArrowToastShown = true;
    if (typeof window.showExperienceToast === 'function') {
        window.showExperienceToast('Arrow keys to navigate — press ? for shortcuts', { duration: 3500 });
    }
}

export function handleGalaxyKeydown(event) {
    if (!event?.target) return;
    if (isKeyboardTextEntryTarget(event.target)) return;
    const isControlTarget = isKeyboardControlTarget(event.target);

    if (event.key === 'Escape') {
        // Demo takes priority — cancel it before any other Esc action
        if (window.demoController?.isRunning?.()) {
            window.demoController.cancel();
            return;
        }
        if (typeof window.closeLegendGuide === 'function') window.closeLegendGuide({ restoreFocus: true });
        if (typeof window.hideTooltip === 'function') window.hideTooltip();
        if (typeof window.hideSummaryCard === 'function') window.hideSummaryCard();
        // Also close/toggle the info panel — escape should close it when open
        if (typeof window.setInfoPanelOpen === 'function') {
            window.setInfoPanelOpen(false);
        }
        const searchInput = document.getElementById('search-input');
        const hasSearchText = Boolean(searchInput?.value?.trim());
        const hasSearchState = Boolean(state.currentSearchSummary || state.searchGlowActive);
        const hasFocusState = state.focusedNode !== null || state.navState?.focusedIndex !== null;
        if (hasSearchText || hasSearchState || hasFocusState) {
            event.preventDefault();
            returnToOverview();
        }
        return;
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        if (isControlTarget && event.key === 'ArrowUp') return;
        event.preventDefault();
        flashArrowKeyToast();
        if (typeof window.traverseNeighbor === 'function') window.traverseNeighbor(-1);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        if (isControlTarget && event.key === 'ArrowDown') return;
        event.preventDefault();
        if (typeof window.traverseNeighbor === 'function') window.traverseNeighbor(1);
    } else if (event.key === 'Home') {
        if (state.currentView === 'galaxy') {
            event.preventDefault();
            resetExplorationFocus();
        }
    } else if (event.key === 'End' || (event.key === 'c' && !event.ctrlKey && !event.metaKey)) {
        if (state.currentView === 'galaxy') {
            event.preventDefault();
            if (typeof window.recenterFocusedNode === 'function') window.recenterFocusedNode();
        }
    }

    if (event.key === '=' || event.key === '+') {
        if (typeof window.zoomCamera === 'function') window.zoomCamera(0.84);
    } else if (event.key === '-' || event.key === '_') {
        if (typeof window.zoomCamera === 'function') window.zoomCamera(1.18);
    } else if (event.key === '?' || event.key === '/') {
        event.preventDefault();
        if (typeof showKeyboardShortcutsHint === 'function') {
            showKeyboardShortcutsHint();
        }
    }
}

// === Event Listeners ===

export function initEventListeners() {
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
    window.getJourneyCompassState = getJourneyCompassState;
    window.updateJourneyCompass = updateJourneyCompass;
    window.executeJourneyCompassAction = executeJourneyCompassAction;
    window.showViewHandoff = showViewHandoff;
    window.hideViewHandoff = hideViewHandoff;
    window.showExperienceToast = showExperienceToast;

    window.setSemanticDiveMode = setSemanticDiveMode;

    window.getInterestingBusinessNote = function (point) {
        if (!point) return null;
        if (point.trivia) {
            const t = point.trivia.trim();
            // Suppress placeholder values that don't add user value
            if (t === 'Pending research.' || t === 'Pending research') return null;
            // Suppress SearXNG-sourced placeholders — implementation detail leaks into UI
            if (t.includes('SearXNG') || t.includes('Insufficient evidence')) return null;
            // Suppress verification-system outputs that read like legal/entity确认书
            if (t.includes('exact entity name') || t.includes('verified official') || t.includes('entity confirmed') || t.includes('Registry-only') || t.includes('FMCSA carrier') || t.includes('USDOT') || t.includes('SAFER snapshot') || t.includes('Texas Comptroller')) return null;
            // Suppress research-check and third-party lookup outputs
            if (t.includes('Research check') || t.includes('MapQuest') || t.includes('GoDaddy') || t.includes('WordPress site on Cloudflare') || t.includes('Hotel page is active') || t.includes('Local dirt track') || t.includes('carrier records') || t.includes('carrier lookup') || t.includes('via carrier') || t.includes('via lookup') || t.includes('contact found') || t.includes('Verified phone') || t.includes('Verified email')) return null;
            // Suppress entity-transition metadata — strings describing brand/chain transitions or legal entity history
            if (t.includes('formerly ') || t.includes('formerly known') || t.includes('renamed') || t.includes('rebranded as')) return null;
            // Suppress quasi-internal entity metadata like "National retail chain location" or "A [Brand] brand location"
            if (t.includes('retail chain location') || t.includes('brand location') || t.includes('chain location')) return null;
            // Suppress entity operating-as metadata — "operating as", "operated as", "dba", "also known as"
            if (t.includes('operating as') || t.includes('operated as') || t.includes('dba') || t.includes('also known as') || t.includes('doing business as')) return null;
            // Suppress disqualification and audit-flag strings — internal QA markers, not user-facing insights
            if (t.includes('Disqualified') || t.includes('SKIP') || t.includes('DO NOT') || t.includes('REDACTED') || t.includes(' Omits ')) return null;
            // Suppress NAICS/metadata structure strings — these are data-field artifacts, not useful business insights
            if (t.includes('NAICS') || t.includes('**Industry**') || t.includes('**Service**') || t.includes('SIC ') || t.includes('SIC:')) return null;
            // Suppress lead/profile/internal import artifacts — "New lead profile", "directory:" etc.
            if (t.includes('New lead profile') || t.includes('directory:') || t.includes('from directory') || t.includes('created from')) return null;
            // Suppress absence/negative-placeholder phrasing — these are implementation details, not useful signals
            if (t.toLowerCase().startsWith('no ') || t.toLowerCase().startsWith('none') || t.toLowerCase().startsWith('no verifiable') || t.toLowerCase().startsWith('unable to') || t.toLowerCase().startsWith('could not')) return null;
            // Suppress vague or low-content strings that don't give users an interesting signal
            if (t.length < 20) return null;
            // Suppress generic data-field fallbacks that read like field indicators, not business insights
            if (t === 'Has both email and phone.') return null;
            if (t === 'Website only — no direct contact on file.') return null;
            return t;
        }
        // Fallback signals are also generic data indicators — suppress them too
        if (point.email && point.phone) return null;
        if (point.website && !point.email && !point.phone) return null;
        return null;
    };
    window.buildSelectedMatchNarrative = function (point) {
        if (!point) return '';
        if (state.currentSearchSummary?.reason) return state.currentSearchSummary.reason;
        return '';
    };

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
