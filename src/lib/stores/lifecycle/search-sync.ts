/**
 * @lib/stores/lifecycle/search-sync.ts — Port of js/modules/lifecycle-search-sync.js
 *
 * Search glow, trail review, empty search recording,
 * and declarative search event subscriptions.
 *
 * Writes to: searchStore.
 * Reads from: searchStore.
 * Depends on: modes.ts (refreshCompositionState).
 */
import { searchStore } from '@lib/stores/search';
import { subscribe, EVENTS } from '@lib/orchestration/event-bus';
import { updateJourneyCompass } from '@lib/orchestration/compass-controller';
import { refreshCompositionState } from './modes';
import type { SearchSummary } from '@lib/types/state';

// ── Module-level empty query storage ─────────────────────────────────────────
// The JS original writes state.currentEmptyQuery which is read by the compass
// and UI feedback code. Preserved here until those consumers are ported.
let _currentEmptyQuery: string | null = null;

/** Read access for the last empty query result (consumed by compass/UI). */
export function getCurrentEmptyQuery(): string | null {
  return _currentEmptyQuery;
}

// ── Search glow ─────────────────────────────────────────────────────────────

/**
 * Activate the search glow effect on the mycelium field.
 */
export function activateSearchGlow(summary: { resultIndices?: number[]; query?: string }): void {
  _currentEmptyQuery = null;

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
  _currentEmptyQuery = query;

  searchStore.update((s) => ({
    ...s,
    summary: null,
  }));
}

// ── Trail review ────────────────────────────────────────────────────────────

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
