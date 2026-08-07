# Important Files — Semantic Explorer

Moved from `AGENTS.md` (2026-06-26) to keep the hot-path context file lean.

This is the canonical file inventory for the repo. Linked from `AGENTS.md` → "Important Files".

## Build artifacts

- `dist/svelte/semantic-demo.css` is intentionally 0 bytes: the root `./semantic-demo.css` source is a comment-only reserved shell hook (see its own header), and `vite.config.ts` minifies root CSS in-place via lightningcss (`transform({ minify: true })`), stripping the comment to nothing. It's still linked by `dist/svelte/index.html` as an empty stylesheet (harmless). Guarded by the source-driven build-contract check `tests/semantic-demo-css-contract.mjs` (registered in the `core` + `smoke` contract groups) — re-minifies the source and asserts the dist bytes match, so a future silent drop-to-0 is caught while a real-rule addition stays green.

## Engine

- `src/lib/engine/three-engine.ts` — top-level engine orchestrator.
- `src/lib/engine/three-engine-mycelium.ts` — live mycelium / thread wrapper; delegates to `thread-manager.ts` (the live line-builder, not the fossil `mycelium-engine.ts`).
- `src/lib/engine/thread-manager.ts` — mycelium line geometry (core / wispy / bridge layers). Live path; replaces the fossil `mycelium-engine.ts`.
- `src/lib/engine/node-manager.ts`
- `src/lib/engine/resource-tracker.ts`

## Journey

- `src/lib/journey/journey.ts`
- `src/lib/journey/compass-state.ts`
- `src/lib/journey/selected-card.ts`
- `src/lib/journey/thread-inspector-state.ts` — ThreadInspector state owner (the former `thread-inspector.ts` was split into `-state` / `-adapter` / `-render` / `-webgl`).
- `src/lib/journey/thread-inspector-adapter.ts`
- `src/lib/journey/thread-inspector-render.ts`
- `src/lib/journey/thread-inspector-webgl.ts`

## Focus

- `src/lib/focus/pocket.ts`
- `src/lib/journey/focus-pocket-geometry.ts` — focus constellation geometry (moved out of `src/lib/focus/`).
- `src/lib/focus/stage-renderer.ts`

## Orchestration

- `src/lib/orchestration/app-init.ts`
- `src/lib/orchestration/lifecycle.ts`
- `src/lib/orchestration/responsive-renderer.ts` — canonical render-kind classifier (`getInitialRenderKind`) + canonical deep-link classification helper (`isDeepLinkParams`, added at `b33f35ba`; supersedes the duplicated deep-link check previously inlined inside `parseUrlParams` + `shouldRunDemo`).
- `src/lib/orchestration/view-controller.ts`
- `src/lib/orchestration/event-bus.ts`
- `src/lib/orchestration/toast.ts` — canonical toast path (Svelte store; replaces the DOM-direct version in `src/lib/ui/ui-feedback.ts`).

## State / Data

- `src/lib/state/app.svelte.ts`
- `src/lib/state/state-types.ts`
- `src/lib/data-store.ts`
- `src/lib/data-loader.ts`
- `src/lib/engine/semantic-threads.ts` — semantic-thread artifact loading; worker resets re-sync the caller request-id sequence with each fresh worker generation so valid responses are not ignored until timeout.
- `src/lib/search-engine.ts`

## Search

- `src/lib/search-engine.ts` — search engine entry (init/performSearch). Note: the search subdir is `src/lib/search/` (tokenizer/scoring/orchestration), not `src/lib/search/index.ts`.
- `src/lib/search/tokenizer.ts`
- `src/lib/search/scoring.ts`
- `src/lib/search/orchestration.ts`
- `src/lib/search/cache.ts` — canonical search cache entry (W52 `8a467b72` consolidated the legacy root `search-cache.ts` into this file — 11 cache exports appended, append-only merge, no name collisions).
- `src/lib/search/state.ts` — search Svelte-state saga (used by search-engine + state modules).

## UI / Chrome

- `src/lib/ui-renderers.ts`
- `src/lib/navigation-actions.ts`
- `src/lib/z-index.ts`
- `src/lib/navigation/mode-affordances.ts` — canonical selection-lock rule (`isModeLocked`, `SELECTION_DEPENDENT_MODES = {trail, focus, inside}`). Shared by Header, CompassRail, and `mode-bindings.ts`.
- `src/lib/components/header/mode-constants.ts` — header mode labels, icons, descriptions.
- `src/lib/components/header/mode-nav.ts` — `selectMode` is the canonical mode-switch entry point.
- `src/lib/components/header/header.css` — extracted Header visual contract.
- `src/components/CompassRail.svelte` — 6-phase compass rail.
- `src/components/JourneyCompass.svelte` — Phase-A/B journey compass parent; the 3-way split trio below was extracted from this file during W52.
- `src/lib/components/journey/CompassHeader.svelte` — compass header strip + kicker (extracted at W52 `12ae8927`).
- `src/lib/components/journey/CompassActionButton.svelte` — action-button UI primitive (extracted at W52 `12ae8927`).
- `src/lib/components/journey/CompassDiveSurface.svelte` — Phase-B dive block (focus-dive / county-reset / inside-next buttons; uses parent-passed `insideNextDisabled` reactive prop — extracted at W52 `2537a84c`).
- `src/lib/components/header/ModeChipRail.svelte` — chip-rail mode switch extracted from Header at W52 `4dde21b7`.
- `src/lib/components/header/HelpDialog.svelte` — help dialog extracted from Header at W52 `2833be6c`.

## Onboarding

- `src/lib/onboarding/onboarding-storage.ts` — canonical onboarding-run storage key + seen-reset helpers (W52 `29da7961` — supersedes ad-hoc key literals across journey specs).

## Repo reference docs

- `docs/tool-guide.md` — Pi-harness tool selection, native-vs-MCP routing, profile policy, switchboard API quick-start, common pitfalls (linked from `AGENTS.md` → Reference Docs).
