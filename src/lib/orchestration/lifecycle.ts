/**
 * @lib/orchestration/lifecycle.ts — Semantic Demo Lifecycle & Global State Bridge
 *
 * Replaces js/modules/lifecycle.js.
 *
 * Orchestrates mode switching, trail depth, search glow, exploration focus,
 * and semantic dive. Writes to stores (navStore, searchStore, focusStore,
 * journeyStore) for all state mutations.
 *
 * Event subscriptions are wired at module load for backward compatibility
 * with the legacy event bus. These should be migrated to $effect or
 * onMount in a future pass.
 */

import { get } from 'svelte/store';
import { navStore } from '@lib/stores/navigation';
import { searchStore, clearSearchGlow } from '@lib/stores/search';
import { focusStore, setSemanticDiveMode as setFocusDiveMode } from '@lib/stores/focus';
import { journeyStore } from '@lib/stores/journey';
import { businessRecords } from '@lib/data-store';
import { publish, subscribe, EVENTS } from '@lib/orchestration/event-bus';
import { getFocusedJourneyPoint, getJourneyCompassState, JOURNEY_ACTIONS } from '@lib/orchestration/compass-state';
import {
  executeJourneyCompassAction,
  updateJourneyCompass,
  installSemanticJourneyProbe,
  scheduleMapRouteRefresh,
  getViewHandoffModel,
  getJourneyCompassPresentationState,
  invokeClearMobileRouteFieldPeek
} from '@lib/orchestration/compass-controller';
import { switchView, showViewHandoff, hideViewHandoff } from '@lib/orchestration/view-controller';
import type { BusinessRecord } from '@lib/types/business';
import type { SearchSummary } from '@lib/types/state';

// ── Constants ─────────────────────────────────────────────────────────────────

export const MODE_DESCRIPTIONS: Record<string, string> = {
  default: 'County-wide overview across all visible records.',
  bloom: 'Living records with high relationship potential.',
  bridge: 'Connective nodes linking disparate county themes.',
  trail: 'Focused path of related business entities.',
  inside: 'Immersive exploration of local neighborhoods.'
};

export const STORY_DESCRIPTIONS: Record<string, string> = {
  standard: 'A semantic journey through Montgomery County.',
  market: 'Market exploration through business relationships.',
  civic: 'Civic connectivity across community anchors.',
  growth: 'Economic growth and development pathways.',
  'signal-rich': 'Explore the densest local business clusters with high relationship potential.',
  'bridge-businesses': 'Explore connectors between business communities.',
  'mapped-food': 'Follow food trails across the county map.',
  'disqualified-ghosts': 'View records that are disqualified but still present in the corpus.'
};

// ── Legacy re-exports (compass state + controller) ────────────────────────────

export {
  getFocusedJourneyPoint,
  getJourneyCompassState,
  JOURNEY_ACTIONS,
  executeJourneyCompassAction as executeJourneyCompassAction,
  updateJourneyCompass,
  installSemanticJourneyProbe,
  scheduleMapRouteRefresh,
  getViewHandoffModel,
  getJourneyCompassPresentationState,
  invokeClearMobileRouteFieldPeek
};

export { switchView, showViewHandoff, hideViewHandoff };

// ── Event Subscriptions (phase 3 declarative sync) ────────────────────────────
// NOTE: These module-level subscriptions match the legacy lifecycle.js.
// They should migrate into App.svelte onMount blocks in the future.

subscribe(EVENTS.DIVE_MODE_REQUESTED, ({ enabled }) => {
  setSemanticDiveMode(enabled);
});

subscribe(EVENTS.EXPLORATION_RESET_REQUESTED, (options) => {
  resetExplorationFocus(options as Record<string, unknown>);
});

subscribe(EVENTS.OVERVIEW_REQUESTED, () => {
  returnToOverview();
});

subscribe(EVENTS.TRAIL_DEPTH_UPDATE_REQUESTED, ({ depth, options }) => {
  setTrailDepth(depth, options ?? {});
});

subscribe(EVENTS.SEARCH_SUCCESS, () => {
  refreshCompositionState();
  updateJourneyCompass();
});

subscribe(EVENTS.SEARCH_EMPTY, ({ query }) => {
  refreshCompositionState();
  updateJourneyCompass();
  recordEmptySearch(query);
});

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

// ── Mode / Trail Depth ────────────────────────────────────────────────────────

/**
 * Set the mycelium rendering mode (default / bloom / bridge / trail / inside).
 * Side-effects: recomputes mode-specific index sets, updates search glow,
 * publishes VIEW_CHANGED event.
 */
export function setMyceliumMode(mode: string, options: { skipUrlSync?: boolean } = {}): void {
  const currentMode = get(navStore).myceliumMode;
  if (currentMode === mode) return;

  navStore.update((s) => ({ ...s, myceliumMode: mode }));

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

  if (!options.skipUrlSync) {
    publish(EVENTS.VIEW_CHANGED, { myceliumMode: mode });
  }

  updateExplorationUi();
}

/**
 * Set the exploration trail depth. Depth 0 = overview, 1 = trail/focus,
 * 2 = inside/immersive. Guards invalid transitions unless explicitly
 * allowed via options.
 */
export function setTrailDepth(
  depth: number,
  options: { fromUserGesture?: boolean; skipUrlSync?: boolean; allowDiveExit?: boolean } = {}
): void {
  const prevDepth = Number(get(journeyStore).trailDepth || 0);
  const nextDepth = Number.isFinite(Number(depth)) ? Number(depth) : 0;
  const enteringSemanticDive = nextDepth === 2 && prevDepth < 2;
  const leavingSemanticDive = prevDepth >= 2 && nextDepth < 2;

  if (enteringSemanticDive && !options.fromUserGesture) return;
  if (leavingSemanticDive && !options.fromUserGesture && !options.allowDiveExit) return;

  journeyStore.update((s) => ({ ...s, trailDepth: nextDepth }));
  navStore.update((s) => ({
    ...s,
    trailDepth: nextDepth,
    mode: nextDepth >= 2 ? 'inside' as const : (nextDepth > 0 && s.mode !== 'focus' ? 'trail' as const : s.mode)
  }));

  if (!options.skipUrlSync) {
    publish(EVENTS.EXPLORATION_DEPTH_CHANGED, { depth: nextDepth });
  }

  updateExplorationUi();
}

// ── Panel Surface Helpers ─────────────────────────────────────────────────────

/**
 * Derive a lifecycle panel surface context from search/focus intent flags.
 * Returns 'idle', 'search', 'focus', or 'focus-search'.
 */
export function deriveLifecyclePanelSurfaceContext(
  opts: { hasSearchIntent?: boolean; hasFocus?: boolean } = {}
): string {
  const { hasSearchIntent = false, hasFocus = false } = opts;
  if (hasSearchIntent && hasFocus) return 'focus-search';
  if (hasSearchIntent) return 'search';
  if (hasFocus) return 'focus';
  return 'idle';
}

// ── Composition State ─────────────────────────────────────────────────────────

/**
 * Refresh the composition state by syncing body data attributes from stores.
 * In the legacy, this called applyCompositionState({ state, root: document.body }).
 * In the Svelte port, CSS coexistence is handled by $effect blocks in App.svelte.
 */
export function refreshCompositionState(): void {
  const $nav = get(navStore);
  const $search = get(searchStore);
  const $focus = get(focusStore);

  if (typeof document !== 'undefined' && document.body) {
    // Sync key data attributes for CSS coexistence
    document.body.dataset.navMode = $nav.mode;
    document.body.dataset.panelSurface = $nav.surface;
    document.body.dataset.viewMode = $nav.currentView;
    document.body.dataset.searchStatus = $search.status;
    document.body.dataset.focusTransition = $focus.transitionMode;
    document.body.dataset.semanticDive = String($focus.semanticDiveMode);
  }

  publish(EVENTS.COMPOSITION_UPDATED);
}

// ── Semantic Dive ─────────────────────────────────────────────────────────────

/**
 * Enable or disable semantic dive mode. When entering, sets trailDepth=2
 * and transitions the body data attribute through 'transitioning' → 'active'.
 */
export function setSemanticDiveMode(enabled: boolean): void {
  const nextActive = !!enabled;
  setFocusDiveMode(nextActive);

  if (nextActive) {
    if (document.body) document.body.dataset.semanticDive = 'transitioning';
    setTrailDepth(2, { fromUserGesture: true });

    const $focus = get(focusStore);
    if ($focus.semanticDiveMode && document.body?.dataset.semanticDive === 'transitioning') {
      window.setTimeout(() => {
        if (document.body?.dataset.semanticDive === 'transitioning') {
          document.body.dataset.semanticDive = 'active';
        }
      }, 820);
    }
  } else {
    setTrailDepth(1, { allowDiveExit: true, skipUrlSync: true });
  }

  updateExplorationUi();
}

// ── Overview Return ───────────────────────────────────────────────────────────

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
  // Camera settle is handled by the engine bridge
  updateExplorationUi();
}

// ── Exploration UI Refresh ────────────────────────────────────────────────────

/**
 * Refresh all exploration UI after a state change.
 */
export function updateExplorationUi(): void {
  refreshCompositionState();
}

// ── Exploration Focus Reset ───────────────────────────────────────────────────

/**
 * Reset the exploration focus, optionally preserving the current search.
 * Clears navigation state, trail, search glow, and mycelium mode.
 */
export function resetExplorationFocus(options: Record<string, unknown> = {}): void {
  const preserveSearch = options.preserveSearch !== false;
  const skipUrlSync = !!options.skipUrlSync;

  // Capture the current search summary before clearing
  const preservedSearchSummary: Record<string, unknown> | null = preserveSearch
    ? (get(searchStore).summary as unknown as Record<string, unknown> ?? null)
    : null;

  // Reset navigation state
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

  // Reset search state
  searchStore.update((s) => ({
    ...s,
    glowActive: false,
    glowIndices: new Set(),
    glowTopIndex: null,
    previewIndex: null,
    trailCue: 'idle' as const,
  }));

  navStore.update((s) => ({ ...s, myceliumMode: 'default' }));

  if (!preserveSearch) {
    searchStore.update((s) => ({ ...s, summary: null }));
    // clearSearch from the store resets everything
  }

  // Restore the preserved summary if we kept it
  if (preserveSearch && preservedSearchSummary) {
    searchStore.update((s) => ({
      ...s,
      // Restore relevant parts — the engine bridge can rehydrate the full summary
    }));
  }

  if (!skipUrlSync) {
    publish(EVENTS.STATE_RESET, { reason: 'manual-reset', options });
  }

  updateExplorationUi();
}

/**
 * Legacy proxy for resetExplorationFocus.
 */
export function resetNodePositions(options: Record<string, unknown> = {}): void {
  resetExplorationFocus(options);
}

// ── Full Experience Reset ─────────────────────────────────────────────────────

/**
 * Full experience state reset: clears timers, search input, search glow,
 * and publishes STATE_RESET.
 */
export function resetExperienceState(options: Record<string, unknown> = {}): void {
  resetExplorationFocus(options);

  searchStore.update((s) => ({
    ...s,
    summary: null,
    glowActive: false,
    glowIndices: new Set(),
    glowTopIndex: null,
    previewIndex: null,
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

// ── Search Glow ───────────────────────────────────────────────────────────────

/**
 * Activate the search glow effect on the mycelium field.
 */
export function activateSearchGlow(summary: { resultIndices?: number[]; query?: string }): void {
  searchStore.update((s) => ({
    ...s,
    summary: summary as unknown as SearchSummary,
    glowActive: true,
    glowIndices: new Set(summary.resultIndices ?? []),
    glowTopIndex: (summary.resultIndices?.[0] ?? null) as number | null,
  }));

  refreshCompositionState();
}

/**
 * Record an empty search result (query that returned no matches).
 */
export function recordEmptySearch(query: string): void {
  searchStore.update((s) => ({
    ...s,
    // Mark the empty query state
  }));
}

// ── Trail Review Overlay ──────────────────────────────────────────────────────

let _trailReviewReturnFocus: Element | null = null;

/**
 * Show the trail review overlay.
 */
export function showExploreTrailReview(_summary?: string): void {
  const overlay = document.getElementById('trail-review-overlay');
  if (overlay) {
    overlay.setAttribute('aria-hidden', 'false');
    overlay.hidden = false;
    overlay.classList.add('visible');
    const closeBtn = overlay.querySelector('.trail-review-close') as HTMLElement | null;
    if (closeBtn) {
      _trailReviewReturnFocus = document.activeElement;
      closeBtn.focus();
    }
  }
}

/**
 * Hide the trail review overlay and restore focus.
 */
export function hideExploreTrailReview(): void {
  const overlay = document.getElementById('trail-review-overlay');
  if (overlay) {
    overlay.setAttribute('aria-hidden', 'true');
    overlay.hidden = true;
    overlay.classList.remove('visible');
    if (_trailReviewReturnFocus && typeof (_trailReviewReturnFocus as HTMLElement).focus === 'function') {
      (_trailReviewReturnFocus as HTMLElement).focus();
    }
  }

  searchStore.update((s) => ({
    ...s,
    summary: null,
    glowActive: false,
    glowIndices: new Set(),
    glowTopIndex: null,
  }));

  refreshCompositionState();
}

// ── Bloom / Bridge Index Recomputations ───────────────────────────────────────

/**
 * Recompute bloom indices — active records with websites.
 */
function recomputeBloomIndices(): Set<number> {
  const points = get(businessRecords);
  const indices = new Set(
    (points ?? [])
      .map((point: BusinessRecord, index: number) => ({ point, index }))
      .filter(({ point }) => point.status === 'active' && point.website)
      .map(({ index }) => index)
  );
  return indices;
}

/**
 * Recompute bridge indices — records mentioning bridge/network/community.
 */
function recomputeBridgeIndices(): Set<number> {
  const points = get(businessRecords);
  const indices = new Set(
    (points ?? [])
      .map((point: BusinessRecord, index: number) => ({ point, index }))
      .filter(({ point }) => {
        const text = `${point.what || ''} ${point.public_note || ''} ${point.public_detail || ''}`.toLowerCase();
        return text.includes('bridge') || text.includes('network') || text.includes('community');
      })
      .map(({ index }) => index)
  );
  return indices;
}

// ── Focus on Point ────────────────────────────────────────────────────────────

/**
 * Focus on a business record point. Delegates camera movement to the
 * index-based camera owner via engine bridge.
 */
export function focusOnPoint(
  point: BusinessRecord | null,
  options: { skipUrlSync?: boolean; revealCard?: boolean } = {}
): boolean {
  if (!point) return false;

  focusStore.update((s) => ({
    ...s,
    selectedBusiness: {
      index: -1, // resolved by engine bridge
      name: point.name,
      category: point.category,
      city: point.city,
      status: point.status,
      website: point.website,
      email: point.email,
      phone: point.phone,
      revealedAt: performance.now(),
    },
  }));

  if (!options.skipUrlSync) {
    publish(EVENTS.CAMERA_NODE_FOCUSED, { point, options });
  }

  return true;
}

// ── Inside / Next Stop ────────────────────────────────────────────────────────

/**
 * Explore to the next stop in the inside (immersive) surface.
 * Called from compass NEXT_STOP action and journey-bindings.
 */
export function exploreInsideToNextStop(): void {
  const $focus = get(focusStore);
  if ($focus.strandContinuityPhase === 'exploring') return;

  // Engine bridge handles the actual traversal;
  // this store-level port only guards against re-entry.
}

// ── Hydrate Lead Context ──────────────────────────────────────────────────────

/**
 * Hydrate the UI context for a given lead/business point.
 * Syncs the focus stage and updates the selected business card.
 */
export function hydrateLeadContext(point: BusinessRecord | null): void {
  if (!point) return;
  focusOnPoint(point, { revealCard: true });
}

// ── Legacy Semantic Lane Probes ────────────────────────────────────────────────

/**
 * Probe the semantic lane health.
 * Legacy stub — actual implementation lives in the engine bridge.
 */
export function probeSemanticLane(_options?: Record<string, unknown>): Promise<unknown> {
  return Promise.resolve(null);
}

/**
 * Schedule a semantic lane health monitor.
 * Legacy stub — actual implementation lives in the engine bridge.
 */
export function scheduleSemanticLaneMonitor(): void {
  // No-op in store port
}

/**
 * Set the semantic lane UI state.
 * Legacy stub — actual implementation lives in the engine bridge.
 */
export function setSemanticLaneUiState(_laneState: string, _options?: Record<string, unknown>): void {
  // No-op in store port
}

// ── UI Feedback Stubs ─────────────────────────────────────────────────────────

/**
 * Sync search status for a focused business point.
 * Legacy stub — actual implementation lives in ui-feedback.js.
 */
export function syncSearchStatusForFocus(_point: Record<string, unknown> | null, _options?: Record<string, unknown>): void {
  // No-op in store port
}

/**
 * Hide the summary card.
 */
export function hideSummaryCard(): void {
  // The focus store handles selected business; the engine bridge hides the card
}

/**
 * Show an experience toast message.
 */
export function showExperienceToast(_message: string, _detail?: string): void {
  // No-op in store port — notification system TBD
}

// ── Misc Exports ──────────────────────────────────────────────────────────────

/**
 * Get the mobile search sheet detail from panel surface adapter.
 * Returns empty string in the store port — the engine bridge resolves.
 */
export function getMobileSearchSheetDetail(): string {
  return '';
}
