// lifecycle-search-sync.js — Search glow, trail review, empty search recording,
// and declarative search event subscriptions
import { state } from '../state.js';
import { subscribe, EVENTS } from './event-bus.js';
import { updateJourneyCompass } from './journey-compass-controller.js';
import { getSearchGlowIndices } from '../state/selectors/index.js';
import { refreshCompositionState } from './lifecycle-modes.js';

// ── Search glow ─────────────────────────────────────────────────────────────

export function activateSearchGlow(summary) {
  state.currentSearchSummary = summary;
  state.currentEmptyQuery = null;
  state.searchGlowActive = true;
  if (summary.resultIndices) {
    state.searchGlowIndices = new Set(summary.resultIndices);
  }
  refreshCompositionState();
}

export function recordEmptySearch(query) {
  state.currentEmptyQuery = query;
  state.currentSearchSummary = null;
}

// ── Trail review ────────────────────────────────────────────────────────────

let _trailReviewReturnFocus = null;

export function showExploreTrailReview(_summary) {
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
  if (getSearchGlowIndices()?.clear) getSearchGlowIndices().clear();
  refreshCompositionState();
}

// ── Declarative search event subscriptions ───────────────────────────────────

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
