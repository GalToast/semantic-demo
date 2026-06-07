/**
 * @lib/journey/selected-card.ts — Selected business card lifecycle
 *
 * Ported from: js/modules/journey-selected-card.js
 *
 * Bridge/stub for selected business card management.
 * During migration, the actual business card is rendered by the
 * InfoPanel and FocusCard Svelte components.
 */

import type { BusinessRecord } from '@lib/types/business';
import { debugWarn } from '@lib/utils/diagnostic-adapter';

/**
 * Sync the focus stage for a given business point.
 * Ported from journey-selected-card.js syncFocusStage().
 */
export function syncFocusStage(
  _point: BusinessRecord | null,
  _options?: { skipTraversalUi?: boolean }
): void {
  debugWarn('[journey] Stub function hit: syncFocusStage');
}

/**
 * Update the selected business.
 * Ported from journey-selected-card.js updateSelectedBusiness().
 */
export function updateSelectedBusiness(
  _point: BusinessRecord | null,
  _options: {
    skipHydrate?: boolean;
    revealCard?: boolean;
    fromSearchResult?: boolean;
    skipTraversalUiUpdate?: boolean;
  } = {}
): void {
  debugWarn('[journey] Stub function hit: updateSelectedBusiness');
}

/**
 * Initialize the journey selected card adapter.
 * Ported from journey-selected-card.js initJourneySelectedCard().
 */
export function initJourneySelectedCard(
  _deps: {
    getStrandArrivalNote?: () => string;
    updateTraversalUi?: () => void;
    hydrateLeadContext?: (point: BusinessRecord, options: unknown) => void;
  } = {}
): void {
  debugWarn('[journey] Stub function hit: initJourneySelectedCard');
}
