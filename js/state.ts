// js/state.ts — barrel shim for js/state.js
// Re-exports the legacy state module while preserving its module-evaluation side effects.
// DO NOT use `export * from './state.js'` — it would not re-export the local imports
// used by the Proxy traps, and would not preserve the side-effect order.
//
// Verified 2026-06-09 against js/state.js: the original has both
//   - `export { withStateMutation, CRITICAL_KEYS_SET as CRITICAL_KEYS, TRACKED_SUB_KEYS_SET as TRACKED_SUB_KEYS } from '../src/lib/state/with-state-mutation.ts'`
//   - `import { _isMutatingRef, withStateMutation, CRITICAL_KEYS_SET as CRITICAL_KEYS, TRACKED_SUB_KEYS_SET as TRACKED_SUB_KEYS } from '../src/lib/state/with-state-mutation.ts'`
//   - `if (typeof window !== 'undefined') { window.withStateMutation = withStateMutation; }` (side effect at line ~449)
//   - `export const state = new Proxy(...)` (the main export at line ~511)

export {
  withStateMutation,
  CRITICAL_KEYS_SET as CRITICAL_KEYS,
  TRACKED_SUB_KEYS_SET as TRACKED_SUB_KEYS,
} from '../src/lib/state/with-state-mutation.ts';

export { state } from './state.js';
