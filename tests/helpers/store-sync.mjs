/**
 * Test-only bridge for raw Node contracts that mutate the app state kernel
 * directly, then call composition helpers that now read Svelte stores.
 */

import { navStore } from '../../src/lib/stores/navigation.svelte.ts';
import { focusStore } from '../../src/lib/stores/focus.svelte.ts';
import { searchStore } from '../../src/lib/stores/search.svelte.ts';
import { withStateMutation } from '../../src/lib/engine/state-bridge.ts';

function readSearchInputValue() {
  try {
    const input = globalThis.document?.getElementById?.('search-input');
    return typeof input?.value === 'string' ? input.value : '';
  } catch {
    return '';
  }
}

export function syncCompositionStoresFromState(state) {
  const nav = state.navState ?? {};
  const navDepth = Number.isFinite(nav.trailDepth)
    ? nav.trailDepth
    : Number.isFinite(state.trailDepth)
      ? state.trailDepth
      : 0;
  const currentView = state.currentView ?? nav.currentView ?? 'galaxy';
  const focusedIndex = nav.focusedIndex ?? state.focusedNode ?? null;
  const navMode = navDepth >= 2
    ? 'inside'
    : navDepth > 0 && nav.mode !== 'focus'
      ? 'trail'
      : nav.mode ?? navStore().mode;
  const searchSummary = state.currentSearchSummary ? { ...state.currentSearchSummary } : null;
  const query = searchSummary?.query ?? readSearchInputValue();

  withStateMutation(() => {
    state.trailDepth = navDepth;
    state.semanticDiveMode = navDepth === 2;
    state.currentView = currentView;
    if (state.navState) {
      state.navState.trailDepth = navDepth;
      state.navState.currentView = currentView;
      state.navState.focusedIndex = focusedIndex;
      state.navState.mode = navMode;
    }
  });

  navStore.set({
    ...navStore(),
    ...nav,
    currentView,
    focusedIndex,
    trailDepth: navDepth,
    mode: navMode
  });

  focusStore.set({
    ...focusStore(),
    selectedBusiness: state.selectedPoint ?? null,
    semanticDiveMode: navDepth === 2
  });

  searchStore.set({
    ...searchStore(),
    query,
    summary: searchSummary,
    hasQuery: query.trim().length > 0,
    resultsRendered: Array.isArray(searchSummary?.resultIndices) && searchSummary.resultIndices.length > 0
  });
}
