/**
 * @lib/stores/engine-bridge.svelte.ts — Shared engine bridge reference (Svelte 5 runes)
 *
 * Holds the single EngineBridge instance created by Canvas.svelte.
 *
 * Why a plain `writable` instead of `toStore(getter, setter)`:
 *   `toStore` replaces the writable's notifying `set` with the user's custom
 *   setter. In Svelte runtime this works because the render_effect re-reads the
 *   getter after mutations and calls the underlying writable's `set`. But in
 *   jsdom/vitest there is no render_effect, so `store.update()` writes to
 *   appState but subscribers never wake up — `get(store)` returns stale values.
 *
 *   A plain `writable` + `withEngineBridgeNotify()` wrapper fixes both: runtime
 *   subscribers are notified by the writable's own `.set()`, and test
 *   environments get synchronous notification too.
 */
import { get, writable, type Readable } from 'svelte/store';
import type { EngineBridge } from '@lib/engine/adapters/types';
import { appState } from '@lib/state/app.svelte.ts';

// ── Store ────────────────────────────────────────────────────────────────────

const _engineBridgeWritable = writable<EngineBridge | null>(appState.engineBridge as EngineBridge | null);

/**
 * Push mutations to both `_engineBridgeWritable` and `appState`.
 */
function withEngineBridgeNotify(updater: (v: EngineBridge | null) => EngineBridge | null): void {
  const next = updater(get(_engineBridgeWritable));
  _engineBridgeWritable.set(next);
  appState.withMutation(() => {
    appState.engineBridge = next;
  });
}

/** Engine bridge store: Readable<EngineBridge | null> + update/set. */
export type EngineBridgeStoreApi = Readable<EngineBridge | null> & {
  update(fn: (v: EngineBridge | null) => EngineBridge | null): void;
  set(value: EngineBridge | null): void;
};

export const engineBridgeStore: EngineBridgeStoreApi = {
  subscribe: _engineBridgeWritable.subscribe,
  update: (updater) => withEngineBridgeNotify(updater),
  set: (value) => withEngineBridgeNotify(() => value),
};

// ── Actions ──────────────────────────────────────────────────────────────────

/** Set the global engine bridge instance. */
export function setEngineBridge(bridge: EngineBridge | null): void {
  withEngineBridgeNotify(() => bridge);
}

/** Get the current bridge value (non-reactive). */
export function getEngineBridge(): EngineBridge | null {
  return get(_engineBridgeWritable);
}
