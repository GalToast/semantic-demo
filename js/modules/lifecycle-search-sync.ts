// lifecycle-search-sync.js — Search glow, trail review, empty search recording,
// and declarative search event subscriptions
import { state } from '@lib/engine/state-bridge'
import type { SearchSummary } from '@lib/state/state-types'
import { subscribe, EVENTS } from '@lib/orchestration/event-bus';
import { updateJourneyCompass } from '@lib/engine/journey-compass-controller-bridge';
import { appState } from '@lib/state/app.svelte';
import { refreshCompositionState } from './lifecycle-modes.ts';

// ── Search glow ─────────────────────────────────────────────────────────────

export function activateSearchGlow(summary: SearchSummary) {
  state.currentSearchSummary = summary;
  state.currentEmptyQuery = null;
  state.searchGlowActive = true;
  if (summary.resultIndices) {
    state.searchGlowIndices = new Set(summary.resultIndices as Iterable<number>);
  }
  refreshCompositionState();
}

export function recordEmptySearch(query: string) {
  state.currentEmptyQuery = query;
  state.currentSearchSummary = null;
}

// ── Trail review ────────────────────────────────────────────────────────────

let _trailReviewReturnFocus: HTMLElement | null = null;

export function showExploreTrailReview(_summary: Record<string, unknown>) {
  const overlay = document.getElementById('trail-review-overlay');
  if (overlay) {
    overlay.setAttribute('aria-hidden', 'false');
    overlay.hidden = false;
    overlay.classList.add('visible');
    const closeBtn = overlay.querySelector('.trail-review-close') as HTMLElement | null;
    if (closeBtn) {
      _trailReviewReturnFocus = document.activeElement as HTMLElement;
      closeBtn.focus();
    }
  }
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
    _trailReviewReturnFocus = null;
  }
  state.currentSearchSummary = null;
  state.searchGlowActive = false;
  if (appState.searchGlowIndices?.clear) appState.searchGlowIndices.clear();
  refreshCompositionState();
}

// ── Declarative search event subscriptions ───────────────────────────────────

subscribe(EVENTS.SEARCH_SUCCESS, () => {
  refreshCompositionState();
  updateJourneyCompass();
});

subscribe(EVENTS.SEARCH_EMPTY, (payload: Record<string, unknown>) => {
  refreshCompositionState();
  updateJourneyCompass();
  recordEmptySearch(payload.query as string);
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
