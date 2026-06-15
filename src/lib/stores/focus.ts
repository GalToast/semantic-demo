// Auto-generated wrapper to aid Vite / TS resolution
// NOTE: FOCUS_CONSTELLATION_MOTIFS is re-exported here from the engine
// track because the W11 port moved the constant to `@lib/engine/config`
// but a Svelte-side consumer (`src/lib/focus/geometry.ts`) still imports it
// from the legacy stores barrel. This is a transitional shim that the next
// W11 sweep should fold into `focus.svelte.ts` proper (or rewrite the
// consumer to import from `@lib/engine/config` directly).
export { FOCUS_CONSTELLATION_MOTIFS } from '../engine/config';
export type { ConstellationMotif } from '../engine/config';
export * from './focus.svelte.ts';
