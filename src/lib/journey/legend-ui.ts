/**
 * @lib/journey/legend-ui.ts — Native Svelte 5 Legend UI event subscriptions
 */

import { subscribeKeyed, EVENTS } from '@lib/orchestration/event-bus';
import { setLegendOpen } from '@lib/stores/legend.svelte';

/**
 * Registers all legend event-bus subscriptions.
 * Must be called once during app init (after DOM is ready).
 */
export function initLegendEventBusSubscriptions(): void {
  subscribeKeyed('legend-ui:VIEW_CHANGED', EVENTS.VIEW_CHANGED, () => {
    setLegendOpen(false);
  });

  subscribeKeyed('legend-ui:STATE_RESET', EVENTS.STATE_RESET, () => {
    setLegendOpen(false);
  });
}
