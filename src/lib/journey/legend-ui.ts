/**
 * @lib/journey/legend-ui.ts — Native Svelte 5 Legend UI event subscriptions
 */

import { subscribe, EVENTS } from '@lib/engine/event-bus-bridge';
import { setLegendOpen } from '@lib/stores/legend.svelte';

/**
 * Registers all legend event-bus subscriptions.
 * Must be called once during app init (after DOM is ready).
 */
export function initLegendEventBusSubscriptions(): void {
  subscribe(EVENTS.VIEW_CHANGED, () => {
    setLegendOpen(false);
  });

  subscribe(EVENTS.STATE_RESET, () => {
    setLegendOpen(false);
  });
}
