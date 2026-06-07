// js/modules/lifecycle.js — Semantic Demo Lifecycle & Global State Bridge
// Thin facade: re-exports from extracted sub-modules + remaining local logic.
import { state } from '../state.js';
import { publish, EVENTS } from './event-bus.js';
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
  walkThreadNeighbor
} from './journey.js';
import { clearSearch } from './search-state.js';
import { getPanelSurfaceDetailFromMobileSheet } from './search-panel-adapter.js';
import { applyCompositionState, derivePanelSurface } from './composition-state.js';
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
  getStrandContinuityState,
  getInspectedThreadIndex,
  getSemanticDiveMode,
  getPoints
} from '../state/selectors/index.js';
import {
  clearClusterFilter,
  updateClusterList,
  getFilteredClusterCounts,
  syncCityFilterUi,
  populateCityFilter,
  syncFilterControls,
  applyStoryPrompt as applyStoryPromptImpl
} from './cluster-filter.js';

// ── Re-exports from extracted sub-modules ────────────────────────────────────
import {
  MODE_DESCRIPTIONS,
  STORY_DESCRIPTIONS,
  refreshCompositionState,
  updateExplorationUi as _updateExplorationUiImpl,
  setMyceliumMode,
  setTrailDepth,
  setSemanticDiveMode as _setSemanticDiveModeImpl
} from './lifecycle-modes.js';
import {
  resetExplorationFocus as _resetExplorationFocusImpl,
  resetNodePositions,
  resetExperienceState,
  returnToOverview as _returnToOverviewImpl
} from './lifecycle-reset.js';
import {
  activateSearchGlow,
  recordEmptySearch,
  showExploreTrailReview,
  hideExploreTrailReview
} from './lifecycle-search-sync.js';

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

export function updateExplorationUi() {
  refreshCompositionState();
}

export function setSemanticDiveMode(enabled) {
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

export function returnToOverview() {
  _returnToOverviewImpl();
}

export function resetExplorationFocus(options) {
  // Handles state.navState, syncFocusStage, and publish via lifecycle-reset.js
  _resetExplorationFocusImpl(options);
}

export function dispatchNavTransition(action, payload = {}) {
  if (typeof dispatchNavTransitionImpl === 'function') {
    return dispatchNavTransitionImpl(action, payload);
  }
  return { handled: false, noOp: true, reason: 'uninitialized' };
}

export const NAV_TRANSITION_ACTIONS = NAV_TRANSITION_ACTIONS_IMPL;

export { switchView, showViewHandoff, hideViewHandoff };

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
  publish(EVENTS.COMPOSITION_UPDATED);
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

export { applyStoryPromptImpl as applyStoryPrompt };
