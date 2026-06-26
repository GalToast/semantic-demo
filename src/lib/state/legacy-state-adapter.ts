/**
 * @/lib/state/legacy-state-adapter.ts — Adapter for the legacy app state surface
 *
 * The legacy app state is dynamically shaped: pre-Svelte-5 JS modules wrote
 * arbitrary fields onto the global state object at runtime, and the test-
 * compat proxy in main.ts still exposes that surface for backwards
 * compatibility with Playwright surface tests. The statically-known subset
 * is captured in `LegacyState` (see `./legacy-state.ts`); the index
 * signature `[key: string]: unknown` preserves dynamic access while forcing
 * narrowing at use sites for the typed subset.
 *
 * This module is the single, documented escape hatch for that surface.
 * Import `legacyState` from here rather than casting `appState as any` at
 * call sites -- the cast is now centralized, named, and justified.
 *
 * The double-cast through `unknown` (vs a bare `as any`) is intentional:
 * it makes the type boundary explicit and matches the established codebase
 * idiom.
 */
import { appState } from './app.svelte'
import type { LegacyState } from './legacy-state'

export const legacyState = appState as unknown as LegacyState
