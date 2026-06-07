/**
 * src/lib/event-bus.ts
 *
 * Thin re-export of the orchestration event bus.
 *
 * Both this module and @lib/orchestration/event-bus export the same EVENTS
 * manifest, subscribe/publish functions, and subscriber maps.  Earlier they
 * were independent instances — events published on one bus never reached
 * subscribers on the other, causing split-state for search glow and filter
 * coordination.  This module now delegates entirely to the canonical
 * orchestration bus so all importers share a single subscriber set.
 *
 * Legacy callers that import from 'src/lib/event-bus' will reach the same
 * bus as callers importing from 'src/lib/orchestration/event-bus'.
 */

export {
  EVENTS,
  subscribe,
  subscribeKeyed,
  publish,
  getSubscriberCount,
  clearAllSubscribers,
} from './orchestration/event-bus';

export type { EventName } from './orchestration/event-bus';