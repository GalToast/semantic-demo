/**
 * @/lib/state/legacy-state-adapter.ts — Adapter for the legacy app state surface
 *
 * The legacy app state is dynamically shaped: pre-Svelte-5 JS modules wrote
 * arbitrary fields onto the global state object at runtime, and the test-
 * compat proxy in main.ts still exposes that surface for backwards
 * compatibility with Playwright surface tests. Because the shape isn't
 * statically known, we cannot fully type it.
 *
 * This module is the single, documented escape hatch for that surface.
 * Import `legacyState` from here rather than casting `appState as any` at
 * call sites -- the cast is now centralized, named, and justified.
 *
 * The double-cast through `unknown` (vs a bare `as any`) is intentional:
 * it makes the type boundary explicit and matches the established codebase
 * idiom (255 existing uses across DevGui, InfoPanel, JourneyChrome,
 * SearchResults, etc.).
 *
 * The cast to `Record<string, unknown>` gives consumers a more honest
 * surface than `any`: dynamic property reads return `unknown` (forcing
 * narrowing at use sites) rather than untyped values.
 */
import { appState } from './app.svelte'

export const legacyState = appState as unknown as Record<string, unknown>