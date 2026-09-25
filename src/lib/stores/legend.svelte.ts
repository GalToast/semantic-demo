/**
 * @lib/stores/legend.svelte.ts — Legend panel visibility store
 *
 * Manages whether the category legend panel is open.
 * Default: open on desktop (>768px), closed on mobile.
 *
 * Why a plain `writable` instead of `toStore(getter, setter)`:
 *   `toStore` replaces the writable's notifying `set` with the user's custom
 *   setter. In Svelte runtime this works because the render_effect re-reads the
 *   getter after mutations and calls the underlying writable's `set`. But in
 *   jsdom/vitest there is no render_effect, so `store.update()` writes to
 *   appState but subscribers never wake up — `get(store)` returns stale values.
 *
 *   A plain `writable` + `withLegendNotify()` wrapper fixes both: runtime
 *   subscribers are notified by the writable's own `.set()`, and test
 *   environments get synchronous notification too.
 */
import { get, writable, type Readable } from 'svelte/store';
import { appState } from '@lib/state/app.svelte.ts';

// ── Store ────────────────────────────────────────────────────────────────────

const _legendWritable = writable<boolean>(appState.legendOpen);

/**
 * Push mutations to both `_legendWritable` and `appState`.
 */
function withLegendNotify(updater: (v: boolean) => boolean): void {
  const next = updater(get(_legendWritable));
  _legendWritable.set(next);
  appState.withMutation(() => {
    appState.legendOpen = next;
  });
}

/** Legend store: Readable<boolean> + update/set. */
export type LegendStoreApi = Readable<boolean> & {
  update(fn: (v: boolean) => boolean): void;
  set(value: boolean): void;
};

export const legendOpen: LegendStoreApi = {
  subscribe: _legendWritable.subscribe,
  update: (updater) => withLegendNotify(updater),
  set: (value) => withLegendNotify(() => value),
};

// ── Actions ──────────────────────────────────────────────────────────────────

/** Toggle the legend panel open/closed. */
export function toggleLegend(): void {
  withLegendNotify(v => !v);
}

/** Set the legend panel to a specific open/closed state. */
export function setLegendOpen(open: boolean): void {
  withLegendNotify(() => open);
}
