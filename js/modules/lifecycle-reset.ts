// lifecycle-reset.ts — Reset/overview functions and their declarative event subscriptions
import { state, withStateMutation } from '../state.ts';
import { publish, subscribe, EVENTS } from '@lib/orchestration/event-bus';
import { clearExplorationFocusSelection } from './url-state.ts';
import { switchView } from './view-controller.ts';
import { syncFocusStage } from './journey.ts';
import { clearSearch } from './search-state.ts';
import { clearAllTimers } from './utils/timer-utils.ts';
import { clearNavigationFocusState, clearTrailThreadState } from './navigation-state.ts';
import {
  clearSearchGlow,
  setSearchPanelState,
  updateSearchStatusMessage
} from './search-state.ts';
import { settleCameraToOverviewPose } from './camera-controls.ts';
import { getSearchGlowIndices } from '../state/selectors/index.ts'
import { refreshCompositionState, updateExplorationUi } from './lifecycle-modes.ts';
import { appState } from '@lib/state/app.svelte';

// ── Reset functions ─────────────────────────────────────────────────────────

export function resetExplorationFocus(options: { preserveSearch?: boolean; skipSearchClearEvent?: boolean; skipUrlSync?: boolean } = { preserveSearch: true }) {
  const preservedSearchSummary = options.preserveSearch === false
    ? null
    : appState.currentSearchSummary;

  withStateMutation(() => {
    state.navState.mode = 'overview';
  });
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
  const searchInput = document.getElementById('search-input') as HTMLInputElement | null;
  if (searchInput) searchInput.value = '';
  const searchResults = document.getElementById('search-results');
  if (searchResults) {
    searchResults.classList.remove('active');
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

export function returnToOverview() {
  resetExperienceState();
  if (appState.currentView !== 'galaxy') {
    switchView('galaxy');
  }
  settleCameraToOverviewPose();
  updateExplorationUi();
}

// ── Declarative event subscriptions ─────────────────────────────────────────

subscribe(EVENTS.EXPLORATION_RESET_REQUESTED, (options) => {
  resetExplorationFocus(options);
});

subscribe(EVENTS.OVERVIEW_REQUESTED, () => {
  returnToOverview();
});
