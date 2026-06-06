/**
 * @lib/stores/lifecycle/reset.ts — Port of js/modules/lifecycle-reset.js
 *
 * Reset/replay helpers and their declarative event subscriptions.
 * Composes store resets across navStore, journeyStore, focusStore, searchStore.
 *
 * Writes to: navStore, journeyStore, focusStore, searchStore.
 * Reads from: all of the above.
 * Publishes: STATE_RESET.
 */
import { get } from 'svelte/store';
import { navStore } from '@lib/stores/navigation';
import { journeyStore } from '@lib/stores/journey';
import { focusStore } from '@lib/stores/focus';
import { searchStore, clearSearchGlow } from '@lib/stores/search';
import { publish, subscribe, EVENTS } from '@lib/orchestration/event-bus';
import { clearExplorationFocusSelection } from '@lib/orchestration/url-state';
import { switchView } from '@lib/orchestration/view-controller';
import { refreshCompositionState, updateExplorationUi } from './modes';
import { clearAllTimers } from '@lib/utils/timer-utils';
import type { SearchSummary } from '@lib/types/state';

// ── Reset functions ─────────────────────────────────────────────────────────

/**
 * Reset exploration focus, optionally preserving the current search.
 * Clears navigation state, trail, search glow, and mycelium mode.
 */
export function resetExplorationFocus(
  options: {
    preserveSearch?: boolean;
    skipUrlSync?: boolean;
    skipSearchClearEvent?: boolean;
  } = {}
): void {
  const preserveSearch = options.preserveSearch !== false;

  // Capture the current search summary before clearing
  const preservedSearchSummary: SearchSummary | null = preserveSearch
    ? get(searchStore).summary
    : null;

  // Clear exploration focus selection (matches JS clearExplorationFocusSelection)
  clearExplorationFocusSelection();

  // Reset navigation state (matches clearNavigationFocusState + clearTrailThreadState from JS)
  navStore.update((s) => ({
    ...s,
    trailDepth: 0,
    mode: 'overview' as const,
    focusedIndex: null,
    trailSeedIndex: null,
    trailNeighborIndices: [],
    trailCursor: -1,
    walkHistoryIndices: [],
    lastTraversalReason: null,
    threadCandidates: [],
    threadReasonByIndex: new Map(),
    threadSource: 'geometric-fallback',
  }));

  // Reset focus state
  focusStore.update((s) => ({
    ...s,
    semanticDiveMode: false,
    selectedBusiness: null,
    strandContinuityPhase: 'idle' as const,
    inspectedStrandIndex: null,
    pocketNodes: [],
  }));

  // Reset journey state
  journeyStore.update((s) => ({
    ...s,
    trailDepth: 0,
    trailSeedIndex: null,
    trailNeighborIndices: [],
    trailCursor: -1,
    walkHistoryIndices: [],
    threadCandidates: [],
  }));

  // Reset search glow
  searchStore.update((s) => ({
    ...s,
    glowActive: false,
  }));

  navStore.update((s) => ({ ...s, myceliumMode: 'default' }));

  // Reset search state (matches JS clearSearch with skipResetFocus)
  if (!preserveSearch) {
    searchStore.update((s) => ({ ...s, summary: null }));
  } else if (preservedSearchSummary) {
    searchStore.update((s) => ({ ...s, summary: preservedSearchSummary }));
  }

  if (!options.skipUrlSync) {
    publish(EVENTS.STATE_RESET, { reason: 'manual-reset', options });
  }

  updateExplorationUi();
}

/**
 * Legacy proxy for resetExplorationFocus.
 */
export function resetNodePositions(
  options: {
    preserveSearch?: boolean;
    skipUrlSync?: boolean;
    skipSearchClearEvent?: boolean;
  } = {}
): void {
  clearExplorationFocusSelection();
  resetExplorationFocus(options);
}

/**
 * Full experience state reset: clears search input, search glow,
 * timers, and publishes STATE_RESET.
 */
export function resetExperienceState(
  options: {
    preserveSearch?: boolean;
    skipUrlSync?: boolean;
    skipSearchClearEvent?: boolean;
  } = {}
): void {
  resetExplorationFocus(options);

  // Clear all tracked timers (matches JS clearAllTimers call)
  clearAllTimers();

  searchStore.update((s) => ({
    ...s,
    summary: null,
    glowActive: false,
    glowIndices: new Set(),
    glowTopIndex: null,
    previewIndex: null,
    anchorIndex: null,
  }));

  // Clear search input DOM element
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

  clearSearchGlow();
  refreshCompositionState();
  publish(EVENTS.STATE_RESET, { reason: 'manual-reset' });
}

/**
 * Return to the county overview: resets state, switches to galaxy view,
 * and settles the camera to the overview pose.
 */
export function returnToOverview(): void {
  resetExperienceState();
  const $nav = get(navStore);
  if ($nav.currentView !== 'galaxy') {
    switchView('galaxy');
  }
  // Camera settle is handled by the engine bridge (settleCameraToOverviewPose in JS).
  updateExplorationUi();
}

// ── Declarative event subscriptions ─────────────────────────────────────────

subscribe(EVENTS.EXPLORATION_RESET_REQUESTED, (options) => {
  resetExplorationFocus(options as Record<string, unknown>);
});

subscribe(EVENTS.OVERVIEW_REQUESTED, () => {
  returnToOverview();
});
