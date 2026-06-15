/**
 * @lib/engine/event-bus-bridge.ts - Bridge adapter for legacy event bus.
 *
 * Re-exports the subset of event-bus consumed by src/lib/ui/.
 * Keeps direct legacy imports behind the engine boundary.
 */

export { subscribe, publish, EVENTS } from '../../../js/modules/event-bus';
