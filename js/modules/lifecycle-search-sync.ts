// lifecycle-search-sync.js — Search glow, trail review, empty search recording,
// and declarative search event subscriptions
import { state } from '../state.js';
import { subscribe, EVENTS } from './event-bus.js';
import { updateJourneyCompass } from './journey-compass-controller.js';
import { getSearchGlowIndices } from '../state/selectors/index.js';
import { refreshCompositionState } from './lifecycle-modes.js';

const _s = state as Record<string, unknown>;

// ── Search glow ─────────────────────────────────────────────────────────────

export function activateSearchGlow(summary: Record<string, unknown>) {
  _s.currentSearchSummary = summary;
  _s.currentEmptyQuery = null;
  _s.searchGlowActive = true;
  if (summary.resultIndices) {
    state.searchGlowIndices = new Set(summary.resultIndices as Iterable<number>);
  }
  refreshCompositionState();
}

export function recordEmptySearch(query: string) {
  _s.currentEmptyQuery = query;
  _s.currentSearchSummary = null;
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
  _s.currentSearchSummary = null;
  _s.searchGlowActive = false;
  if (getSearchGlowIndices()?.clear) getSearchGlowIndices().clear();
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
