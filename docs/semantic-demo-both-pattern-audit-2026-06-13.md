# BOTH-pattern audit — js/modules/*.js shim inventory (2026-06-13)

**Status:** Inline audit performed inline during the post-fix smoke sprint. This is a snapshot for the engine team, not a fix request.

## TL;DR

All 36 `.js` shims that re-export from `src/lib/**\/*.ts` resolve to existing TS files. **No missing-TS targets.** This rules out the "ENOENT" hypothesis Lane Z floated and confirms the corrected root cause in `semantic-demo-three-engine-recursion-handoff-2026-06-13.md` — the cycle is a runtime namespace-routing pattern, not a missing module on disk.

That said, three categories of `js/modules/*.js` files warrant engine-team attention:
1. **Triple-shim cycle** among `camera-controls.js` / `-core.js` / `-restore.js` — all three re-export the same src/ facade
2. **Stub no-op exports** in `ui-renderers.js` and `journey-neighborhood.js` — 9 functions literally return undefined; fall back if legacy code still imports them
3. **Two-source shims** like `filter-state.js` and `search-state.js` carry both `./legacy.ts` and `../../src/lib/*.ts` exports
4. **Back-imports** from `src/`-shaped modules into `js/state.js` — `journey-thread-settler.js:5` does `import { state } from '../../js/state.js'`

## Inventory (full coverage of `export * from` shims at js/modules/*.js)

| Shim | Re-exports from | Resolves | Notes |
|---|---|---|---|
| `camera-controls-choreography.js` | `../../src/lib/engine/camera-choreography/index.ts` | ✓ | clean |
| `camera-controls-core.js` | `../../src/lib/engine/camera-controls.ts` | ✓ | **cycle** — same target as `camera-controls-restore.js` |
| `camera-controls-restore.js` | `../../src/lib/engine/camera-controls.ts` | ✓ | **cycle** — same target as `camera-controls.js` and `-core.js` |
| `camera-controls.js` | `../../src/lib/engine/camera-controls.ts` | ✓ | **cycle** — same target as `-core.js` and `-restore.js` |
| `cluster-labels.js` | `../../src/lib/ui/cluster-labels.ts` | ✓ | clean |
| `environment.js` | `../../src/lib/utils/environment.ts` | ✓ | clean |
| `event-bus.js` | `../../src/lib/event-bus.ts` | ✓ | clean |
| `filter-state.js` | `./filter-state.ts` AND `../../src/lib/orchestration/cluster-filter-controller.ts` | ✓/✓ | two-source shim |
| `focus-panel-mode.js` | `../../src/lib/utils/focus-panel-mode.ts` | ✓ | clean |
| `focus-pocket-personality.js` | `../../src/lib/focus/personality.ts` | ✓ | clean |
| `journey-canvas-interaction.js` | `../../src/lib/journey/canvas-interaction.ts` | ✓ | clean |
| `journey-compass-controller.js` | `../../src/lib/orchestration/compass-controller.ts` | ✓ | clean |
| `journey-focus-ui.js` | `../../src/lib/journey/focus-ui.ts` | ✓ | clean |
| `journey-neighborhood.js` | `../../src/lib/journey/neighborhood.ts` | ✓ | **stub no-ops** mixed in (see below) |
| `journey-point-color.js` | `../../src/lib/journey/point-color.ts` | ✓ | clean |
| `journey-selected-card.js` | `../../src/lib/journey/selected-card.ts` | ✓ | clean |
| `journey-text-helpers.js` | `../../src/lib/journey/text-helpers.ts` | ✓ | clean |
| `journey-thread-model.js` | `../../src/lib/journey/thread-model.ts` | ✓ | clean |
| `journey-thread-settler.js` | `../../src/lib/journey/thread-settler-adapter.ts` | ✓ | **back-import** to js/state.js (see below) |
| `journey.js` | `../../src/lib/journey/journey.ts` | ✓ | clean |
| `lifecycle.js` | `../../src/lib/orchestration/lifecycle.ts` | ✓ | clean |
| `map-state.js` | `../../src/lib/engine/map-state.ts` | ✓ | clean |
| `micro-demo-camera.js` | `../../src/lib/demo/camera.ts` | ✓ | clean |
| `micro-demo-choreography.js` | `../../src/lib/demo/choreography.ts` | ✓ | clean |
| `micro-demo-guards.js` | `../../src/lib/demo/guards.ts` | ✓ | clean |
| `micro-demo-ui.js` | `../../src/lib/demo/ui.ts` | ✓ | clean |
| `scene-reveal.js` | `../../src/lib/engine/scene-reveal.ts` | ✓ | clean |
| `search-state.js` | `./search-state.ts` AND `../../src/lib/search-engine.ts` | ✓/✓ | two-source shim |
| `strand-continuity.js` | `../../src/lib/utils/strand-continuity.ts` | ✓ | clean |
| `thread-inspector.js` | `../../src/lib/journey/thread-inspector.ts` | ✓ | clean |
| `ui-feedback.js` | `../../src/lib/ui/ui-feedback.ts` | ✓ | clean |
| `ui-renderers.js` | `../../src/lib/ui-renderers.ts` | ✓ | **stub no-ops** mixed in (see below) |
| `view-controller.js` | `../../src/lib/orchestration/view-controller.ts` | ✓ | clean |

## Three categories warrant attention

### 1. Triple-shim cycle on `camera-controls.js / -core.js / -restore.js`

```
js/modules/camera-controls.js         → src/lib/engine/camera-controls.ts (the facade)
js/modules/camera-controls-core.js    → src/lib/engine/camera-controls.ts (same)
js/modules/camera-controls-restore.js → src/lib/engine/camera-controls.ts (same)
```

All three shims re-export the **same** src/ facade. This means:

- `import { foo } from 'js/modules/camera-controls.js'` and `import { foo } from 'js/modules/camera-controls-restore.js'` resolve to the same `foo` symbol.
- There is no `src/lib/engine/camera-controls-restore.ts` distinct from the facade. The intended separation (core vs restore) was lost during the BOTH-pattern migration.
- Lane Z's first-attempt hypothesis (the ts file is ENOENT) was right that `src/lib/engine/camera-controls-restore.ts` is missing — but the .js shim does not point at it. The shim silently aliases to the unified facade.

**Engine team action:** Either restore distinct TS files (`camera-controls-core.ts` and `camera-controls-restore.ts`) OR consolidate the .js shim layer so two of the three silences (e.g., the js side aliases to two distinct runtime dispatchers, not one facade). Option 1 in the handoff doc is the
lowest-risk path.

### 2. Stub no-op exports in legacy shims

```js
// journey-neighborhood.js:11-19
export function getSemanticNeighborRecordBetween() {
  return null;
}

export function ensureBoundedNeighborhoodFromActivePocket() {
  return false;
}
```

```js
// ui-renderers.js:2-8
export function updateSelectedCardHeading(..._args) {}
export function renderSelectedMetaStrip(..._args) {}
export function renderSelectedMatchPanel(..._args) {}
export function renderSelectedActionRow(..._args) {}
export function syncSelectedCardContentVariant(..._args) {}
export function setActiveSearchResultRow(..._args) {}
export function updateSearchTrailCue(..._args) {}
```

These are dead-letter exports — the importer pulls them in but receives undefined. They are NOT a build break (the import resolves) but they look like leftover stubs from a mid-migration phase. Worth confirming whether any legacy code still imports these paths; if not, delete. If yes, replace with a real impl.

Same finding applies to:
- `semantic-guide.js` (newly recreated as 2-line stub — confirms Lane B's earlier stub-discovery; flagged here for visibility)

### 3. Back-imports from src-shaped modules to `js/state.js`

```js
// journey-thread-settler.js:5
import { state } from '../../js/state.js';
```

This pulls legacy `state.js` (mutable singleton) into what is otherwise a clean src/-side module. The risk: anyone who imports `journey-thread-settler.js` from src/ is also dragging in the entire legacy state singleton — bringing back the proxy-bypass gap that was fixed in `state.js:530-531`. Engine team should confirm whether `journey-thread-settler.js` is invoked from any src/ import path; if not, drop the back-import.

## What this audit is NOT

- Not a fix request — out of my lane.
- Not a guarantee — I scanned `js/modules/*.js` exports only. TS-side imports were not surveyed; cross-tier cycles might still surface from there.
- Not the source of the three-engine recursion — confirmed by direct inspection that shim paths resolve.

## What to do next

1. Engine team decides between option 1 (no-op stub at `src/lib/engine/camera-controls-restore.ts`) and option 2 (re-port the legacy core + restore split) per `semantic-demo-three-engine-recursion-handoff-2026-06-13.md`.
2. If option 2: while porting, also add a TS entry that exposes the same surface the .js shim consumers currently expect — so the cycle closes without an extra facade layer.
3. Delete the stub no-op functions in `ui-renderers.js` / `journey-neighborhood.js` / `semantic-guide.js` if their importers are migrated. If still imported, raise as follow-up.

## References

- `docs/semantic-demo-three-engine-recursion-handoff-2026-06-13.md` — corrected root cause (cycle, not missing-TS)
- `docs/semantic-demo-url-anchor-regression-2026-06-12.md` — main fix diagnosis
- `docs/subagent-model-catalog.md` — Lane Z (kimi-k2.6) catalog entry
- `memory/reusable-knowledge.md` — JS/TS BOTH pattern section (cross-ref)
