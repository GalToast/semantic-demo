/**
 * @lib/engine/state-bridge.ts - Bridge to the canonical Svelte 5 state class.
 *
 * W13-T5b Wave 1 (2026-06-16): Repointed from the legacy `js/state.ts` to
 * the canonical Svelte 5 class at `src/lib/state/app.svelte.ts`. This breaks
 * the circular dependency where `app.svelte.ts` was importing types FROM
 * the bridge (which itself imported from `js/state.ts`).
 *
 * The `state` export is aliased to `appState` for backward compatibility
 * with the 65+ consumers that use `state.X` access patterns. Future
 * waves (W13-T5b Wave 2-6) can migrate consumers to use `appState`
 * directly.
 *
 * Types are re-exported from `@lib/state/state-types` (the canonical types
 * file extracted from `js/state.ts` in Wave 1).
 */

import { appState } from '@lib/state/app.svelte';
import type { SemanticState } from '@lib/state/state-types';

export const state = appState as unknown as SemanticState;
export { withStateMutation } from '@lib/state/with-state-mutation';
export type * from '@lib/state/state-types';
