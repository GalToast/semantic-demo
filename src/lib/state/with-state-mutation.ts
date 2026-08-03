// with-state-mutation.ts — typed extraction of the state mutation guard.
// Extracted from js/state.js for TS migration.
//
// DEPRECATED (2026-07-27): The new app.svelte.ts Proxy does NOT read
// _isMutatingRef — its STATE_VALIDATORS checks run on every write via
// validateStateProperty independently. withStateMutation() provides zero
// functional benefit in the new system: the wrapper just invokes its
// callback and returns the result. Existing call sites still work —
// they are no-op-correct — but should not be added in new code.
// ~17 non-engine files still call it and are being unwrapped incrementally;
// src/lib/engine/* keeps its engineState.withStateMutation binding
// intentionally.

/**
 * No-op mutation wrapper retained for backward compatibility.
 *
 * The legacy js/state.ts proxy read a shared `_isMutatingRef` flag to decide
 * whether to allow/silence mutation warnings. The new app.svelte.ts Proxy
 * validates writes via STATE_VALIDATORS instead, so the flag is no longer
 * consulted at runtime. This wrapper simply invokes `fn` and returns its
 * result, preserving call-site compatibility while the ~17 remaining callers
 * are migrated to plain blocks.
 *
 * Do not add new call sites — use a plain block `{ ... }` instead.
 */
export function withStateMutation<T>(fn: () => T): T {
    return fn()
}
