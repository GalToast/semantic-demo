/**
 * @lib/types/legacy-modules.d.ts — Ambient declarations for @legacy/* imports
 *
 * Strategy A (from 2026-06-07 ts-strategy-analysis):
 * Prevents TypeScript from following @legacy/* path aliases into the js/ tree,
 * which pulls ~440 errors from legacy .ts files into the Svelte type-check.
 *
 * The vite.config.ts @legacy alias stays for runtime resolution.
 * TypeScript only needs to know these modules exist and what shape they have.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

declare module '@legacy/*' {
  const mod: any;
  export = mod;
}

declare module '@legacy/state.js' {
  export const state: any;
  export function withStateMutation(fn: () => void): void;
}
