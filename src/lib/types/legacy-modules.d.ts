/**
 * @lib/types/legacy-modules.d.ts — Ambient declarations for @legacy/* imports
 *
 * Strategy A (from 2026-06-07 ts-strategy-analysis):
 * Prevents TypeScript from following @legacy/* path aliases into the js/ tree,
 * which pulls ~440 errors from legacy .ts files into the Svelte type-check.
 *
 * The vite.config.ts @legacy alias stays for runtime resolution.
 * TypeScript only needs to know these modules exist and what shape they have.
 *
 * 2026-06-10 (consolidation Phase 4 cleanup): the types/state.d.ts references
 * below were redirected after the d.ts was deleted. With the consolidation, all
 * legacy state types live in `js/state.ts` and are re-exported from there.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

declare module '@legacy/modules/*' {
  const mod: any;
  export = mod;
}

declare module '@legacy/state.js' {
  import type { SemanticState } from '../../../js/state.ts';
  export const state: SemanticState;
  export function withStateMutation<T>(fn: () => T): T;
}
