/**
 * @lib/journey/focus-ui.ts — Focus stage UI update utilities
 *
 * Ported from: js/modules/journey-focus-ui.js
 *
 * Bridge/stub for focus stage UI updates. During migration,
 * the actual DOM manipulation is handled by the Svelte components.
 */

import { debugWarn } from '@lib/utils/diagnostic-adapter';

/**
 * Check if the viewport is in condensed focus stage mode.
 * Ported from journey-focus-ui.js isCondensedFocusStageViewport().
 */
export function isCondensedFocusStageViewport(): boolean {
  if (typeof window === 'undefined') return false;
  debugWarn('[journey] Stub function hit: isCondensedFocusStageViewport');
  return false;
}

/**
 * Check if the focus neighbor rail should use single-item mode.
 * Ported from journey-focus-ui.js shouldUseSingleNeighborFocusRail().
 */
export function shouldUseSingleNeighborFocusRail(): boolean {
  if (typeof document === 'undefined') return false;
  debugWarn('[journey] Stub function hit: shouldUseSingleNeighborFocusRail');
  return false;
}

/**
 * Check if the selected business neighbor rail should be suppressed.
 * Ported from journey-focus-ui.js shouldSuppressSelectedBusinessNeighborRail().
 */
export function shouldSuppressSelectedBusinessNeighborRail(): boolean {
  debugWarn('[journey] Stub function hit: shouldSuppressSelectedBusinessNeighborRail');
  return false;
}

/**
 * Check if there is a cold degraded semantic fallback.
 * Ported from journey-focus-ui.js hasColdDegradedSemanticFallback().
 */
export function hasColdDegradedSemanticFallback(): boolean {
  debugWarn('[journey] Stub function hit: hasColdDegradedSemanticFallback');
  return false;
}

/**
 * Check if floating focus journey only mode should be used.
 * Ported from journey-focus-ui.js shouldUseFloatingFocusJourneyOnly().
 */
export function shouldUseFloatingFocusJourneyOnly(): boolean {
  debugWarn('[journey] Stub function hit: shouldUseFloatingFocusJourneyOnly');
  return false;
}

/**
 * Initialize focus neighbor rail subscriptions.
 * Ported from journey-focus-ui.js initFocusNeighborRailSubscriptions().
 */
export function initFocusNeighborRailSubscriptions(): void {
  debugWarn('[journey] Stub function hit: initFocusNeighborRailSubscriptions');
}

/**
 * Update the focus neighbor rail.
 * Ported from journey-focus-ui.js updateFocusNeighborRail().
 */
export function updateFocusNeighborRail(
  _options?: {
    focusedIndex?: number | null;
    threadCandidates?: readonly unknown[];
    threadInspectorActive?: boolean;
  }
): void {
  debugWarn('[journey] Stub function hit: updateFocusNeighborRail');
}

/**
 * Update the traversal UI.
 * Ported from journey-focus-ui.js updateTraversalUi().
 */
export function updateTraversalUi(
  _options?: {
    hasFocus?: boolean;
    walkHistoryIndices?: readonly number[];
    neighborCount?: number;
    currentName?: string;
    threadSource?: string;
  }
): void {
  debugWarn('[journey] Stub function hit: updateTraversalUi');
}
