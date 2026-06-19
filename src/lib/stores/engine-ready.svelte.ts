/**
 * @lib/stores/engine-ready.svelte.ts — Engine readiness gate (W6-T1)
 *
 * Flipped to true by first user gesture; consumed by Canvas.svelte
 * and Splash.svelte. Uses Svelte 5 $state rune for fine-grained
 * reactivity without a full writable store.
 *
 * @example
 *   import { engineReady } from '@lib/stores/engine-ready.svelte';
 *   if (engineReady.value) { /* engine can init *\/ }
 *   engineReady.signalReady();
 */

// ── State ────────────────────────────────────────────────────────────────────

let _value = $state(false);
const _subscribers = new Set<(v: boolean) => void>();

function signalReady(): void {
  if (_value) return;
  _value = true;
  for (const fn of _subscribers) {
    fn(_value);
  }
}

/** Read-only accessor for the ready flag. */
function getReady(): boolean {
  return _value;
}

export const engineReady = {
  /** Subscribe-compatible accessor — reads the current $state value. */
  get value(): boolean {
    return _value;
  },
  /** Set to true once (idempotent). Triggers reactive subscriptions. */
  signalReady,
  /** Named getter for compatibility with $store patterns. */
  getReady,
  /** Store-compatible subscription. Immediately invokes with current value and re-invokes on change. */
  subscribe(fn: (v: boolean) => void) {
    fn(_value);
    _subscribers.add(fn);
    return () => {
      _subscribers.delete(fn);
    };
  },
};
