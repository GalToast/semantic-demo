# Important Files — Semantic Explorer

Moved from `AGENTS.md` (2026-06-26) to keep the hot-path context file lean.

This is the canonical file inventory for the repo. Linked from `AGENTS.md` → "Important Files".

## Engine

- `src/lib/engine/three-engine.ts`
- `src/lib/engine/node-manager.ts`
- `src/lib/engine/mycelium-engine.ts`
- `src/lib/engine/three-thread-manager.ts`
- `src/lib/engine/resource-tracker.ts`

## Journey

- `src/lib/journey/journey.ts`
- `src/lib/journey/compass-state.ts`
- `src/lib/journey/selected-card.ts`
- `src/lib/journey/thread-inspector.ts`

## Focus

- `src/lib/focus/pocket.ts`
- `src/lib/focus/geometry.ts`
- `src/lib/focus/stage-renderer.ts`

## Orchestration

- `src/lib/orchestration/app-init.ts`
- `src/lib/orchestration/lifecycle.ts`
- `src/lib/orchestration/view-controller.ts`
- `src/lib/orchestration/event-bus.ts`
- `src/lib/orchestration/toast.ts` — canonical toast path (Svelte store; replaces the DOM-direct version in `src/lib/ui/ui-feedback.ts`).

## State / Data

- `src/lib/state/app.svelte.ts`
- `src/lib/state/state-types.ts`
- `src/lib/data-store.ts`
- `src/lib/data-loader.ts`
- `src/lib/semantic-threads.ts`
- `src/lib/search-engine.ts`

## Search

- `src/lib/search/index.ts`
- `src/lib/search/tokenizer.ts`
- `src/lib/search/scoring.ts`
- `src/lib/search/orchestration.ts`

## UI / Chrome

- `src/lib/ui-renderers.ts`
- `src/lib/navigation-actions.ts`
- `src/lib/z-index.ts`
- `src/lib/navigation/mode-affordances.ts` — canonical selection-lock rule (`isModeLocked`, `SELECTION_DEPENDENT_MODES = {trail, focus, inside}`). Shared by Header, CompassRail, and `mode-bindings.ts`.
- `src/lib/components/header/mode-constants.ts` — header mode labels, icons, descriptions.
- `src/lib/components/header/mode-nav.ts` — `selectMode` is the canonical mode-switch entry point.
- `src/lib/components/header/header.css` — extracted Header visual contract.
- `src/components/CompassRail.svelte` — 6-phase compass rail.
