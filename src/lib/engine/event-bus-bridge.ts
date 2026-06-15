/**
 * @lib/engine/event-bus-bridge.ts - Legacy event bus bridge.
 *
 * Re-exports the Svelte-track canonical event-bus so that all callers
 * share a single unified pub/sub bus.
 */

export { subscribe, subscribeKeyed, publish, EVENTS } from '@lib/event-bus';
