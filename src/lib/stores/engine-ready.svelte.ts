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

function signalReady(): void {
  _value = true;
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
  subscribe(fn: (v: boolean) => void) {
    // Immediately invoke with current value, then re-invoke on change.
    fn(_value);
    // No teardown needed: the flag only goes false → true once.
    return () => {};
  },
};
