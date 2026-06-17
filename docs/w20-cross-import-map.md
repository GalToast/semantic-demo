# W20 Cross-Import Map

**Date:** 2026-06-17
**Author:** kilo/openrouter/owl-alpha subagent
**Goal:** Document every `js/modules/→js/modules/` cross-import edge for the remaining files in the W19 dead list + the parallel session's WIP, with the corresponding `@lib/*` canonical target for each edge.

## Summary

- **Files analyzed:** 7
- **Total cross-import edges found:** 14 (js/modules/→js/modules/ inbound edges into the 7 files)
- **Edges with existing `@lib/*` canonical:** 14
- **Edges needing a new canonical:** 0
- **Estimated rewiring order (leaf-first):** 7 steps

## Key Finding

All 7 files already import exclusively from `@lib/*` canonical targets for their **outbound** dependencies. The cross-import problem is purely **inbound** — other `js/modules/` files still import FROM these 7 files via relative paths. The rewiring task (Wave 3) is to redirect those inbound importers to the appropriate `@lib/*` canonicals, not to modify the 7 files themselves.

Four of the 7 files (`app-svelte-island.ts`, `exploration-mode.ts`, `three-node-manager.ts`) have **zero** inbound cross-importers from `js/modules/`, making them safe to handle last (or already clean).

## File-by-file

### js/modules/composition-state.ts

- **Outbound cross-imports (this file imports):**
  - `@lib/engine/state-bridge` — `state` ✅ existing
  - `@lib/state/state-types` — `SemanticState` type ✅ existing
  - `@lib/orchestration/event-bus` — `publish`, `EVENTS` ✅ existing
  - `./search-panel-adapter.ts` — `getPanelSurfaceDetailFromMobileSheet` (other js/modules/ file, not in 7)
  - `@lib/engine/search-state-bridge` — `clearMobileRouteFieldPeek` ✅ existing
  - `./stores.ts` — `compositionStore` (other js/modules/ file, not in 7)

- **Inbound cross-importers (who imports this file from js/modules/):**
  1. `js/modules/lifecycle-modes.ts:5` → imports `{ applyCompositionState }` from `./composition-state.ts`
  2. `js/modules/lifecycle.ts:15` → imports `{ derivePanelSurface }` from `./composition-state.ts`
  3. `js/modules/view-controller.ts:31` → imports `{ applyCompositionState }` from `./composition-state.ts`

- **Status:** has-cross-imports (3 inbound js/modules/ edges)
- **@lib/* target candidates:**
  - `applyCompositionState` → `@lib/orchestration/lifecycle` (already re-exports from `lifecycle-modes.ts`) ✅
  - `derivePanelSurface` → needs a new `@lib/` canonical OR compose through `@lib/orchestration/view-controller` (which already imports it)
  - **Recommended:** Create `@lib/orchestration/composition-state.ts` re-exporting `applyCompositionState` + `derivePanelSurface` so `lifecycle-modes.ts`, `lifecycle.ts`, and `view-controller.ts` can import from `@lib/orchestration/composition-state`

### js/modules/loading-ui.ts

- **Outbound cross-imports (this file imports):**
  - `@lib/engine/state-bridge` — `state`, `withStateMutation` ✅
  - `@lib/state/state-types` — `LoadingPhaseKey`, `SemanticState` ✅
  - `@lib/orchestration/event-bus` — `subscribe`, `EVENTS` ✅
  - `./journey.ts` — `restoreFocusTrailState`, `updateSelectedBusiness` (cross-import to another of the 7)
  - `./scene-events.ts` — `SCENE_READY` (other js/modules/)
  - `./semantic-threads.ts` — `loadSemanticThreads` (other js/modules/)
  - `@lib/engine/search-state-bridge` — `applyFilters` ✅
  - `./three-thread-manager.ts` — `createMycelium` (other js/modules/)
  - `./state-mutators.ts` — `updateLoadingPhaseKey` (other js/modules/)
  - `./weather.ts` — `initWeather` (other js/modules/)
  - `./utils/dom-formatters.ts` — `escapeHtml` (other js/modules/)

- **Inbound cross-importers (who imports this file from js/modules/):**
  1. `js/modules/view-controller.ts:30` → imports `{ scheduleWeatherHydration }` from `./loading-ui.ts`

- **Status:** has-cross-imports (1 inbound js/modules/ edge)
- **@lib/* target candidates:**
  - `scheduleWeatherHydration` → `@lib/ui/loading` already exists ✅; verify it exports `scheduleWeatherHydration`
  - If not, re-export from `@lib/ui/loading.ts`

### js/modules/journey.ts

- **Outbound cross-imports (this file imports):**
  - `@lib/engine/state-bridge` — `state`, `withStateMutation` ✅
  - `@lib/orchestration/event-bus` — `subscribe`, `publish`, `EVENTS` ✅
  - **Many `./journey-*.ts` files** (journey-webgl, journey-thread-model, journey-thread-settler, thread-inspector, journey-neighborhood, journey-selected-card, focus-stage-renderer, journey-focus-ui, journey-canvas-interaction, journey-point-color, journey-text-helpers) — other js/modules/ files not in the 7 list
  - `../../src/lib/journey/thread-settler-adapter` — `traverseNeighbor`, `previewInsideNextThread` ✅ already @lib/
  - `@lib/engine/strand-continuity-bridge` — `setStrandContinuityState`, `clearStrandContinuityState` ✅
  - `@lib/journey/focus-pocket` — `applyLocalNeighborhoodFocus` ✅
  - `./lifecycle.ts` — `setSemanticDiveMode as setSemanticDiveModeImpl` (cross-import to another of the 7)
  - `@lib/state/app.svelte` — `appState` ✅

- **Inbound cross-importers (who imports this file from js/modules/):**
  1. `js/modules/journey-compass-controller.ts:21` → imports `{ setSemanticDiveMode }` from `./journey.ts`
  2. `js/modules/loading-ui.ts:10` → imports `{ restoreFocusTrailState, updateSelectedBusiness }` from `./journey.ts`
  3. `js/modules/lifecycle.ts:11` → imports `{ updateSelectedBusiness, syncFocusStage, walkThreadNeighbor }` from `./journey.ts`
  4. `js/modules/lifecycle-reset.ts:6` → imports `{ syncFocusStage }` from `./journey.ts`
  5. `js/modules/journey-semantic-overlay.ts:13` → imports `{ getCurrentTrailFocusIndex, getNextWalkCandidateForIndex }` from `./journey.ts`
  6. `js/modules/lifecycle-modes.ts:6` → imports `{ applyPointFilterColors }` from `./journey.ts`
  7. `js/modules/view-controller.ts:28` → imports `{ updateSelectedBusiness, setTrailFromSeed, syncFocusStage, setRouteChoreographyPhase }` from `./journey.ts`

- **Status:** has-cross-imports (7 inbound js/modules/ edges — heaviest importer)
- **@lib/* target candidates:**
  - `setSemanticDiveMode` → `@lib/journey/semantic-dive` ✅
  - `updateSelectedBusiness`, `syncFocusStage` → `@lib/journey/selected-card` ✅
  - `walkThreadNeighbor` → `@lib/journey/thread-settler` ✅
  - `restoreFocusTrailState` → `@lib/journey/neighborhood` or new `@lib/journey/restore-helpers`
  - `applyPointFilterColors` → `@lib/journey/point-color` ✅
  - `getCurrentTrailFocusIndex`, `getNextWalkCandidateForIndex` → `@lib/journey/neighborhood` ✅
  - `setTrailFromSeed`, `setRouteChoreographyPhase` → `@lib/journey/webgl` or new `@lib/journey/route-choreography`
  - **Note:** `journey.ts` is the highest-fan-out module. It imports from ~14 other journey-* files. Its rewiring depends on the journey-* chain being rewired first.

### js/modules/lifecycle.ts

- **Outbound cross-imports (this file imports):**
  - `@lib/engine/state-bridge` — `state` ✅
  - `@lib/orchestration/event-bus` — `publish`, `EVENTS` ✅
  - `./view-controller.ts` — `switchView`, `showViewHandoff`, `hideViewHandoff` (other js/modules/)
  - `./journey.ts` — `updateSelectedBusiness`, `syncFocusStage`, `walkThreadNeighbor` (cross-import to another of the 7)
  - `../../src/lib/journey/thread-settler-adapter` — `traverseNeighbor` ✅
  - `@lib/engine/search-state-bridge` — `clearSearch` ✅
  - `./search-panel-adapter.ts` — `getPanelSurfaceDetailFromMobileSheet` (other js/modules/)
  - `./composition-state.ts` — `derivePanelSurface` (cross-import to another of the 7)
  - `@lib/engine/camera-controls` — `focusOnNode` ✅
  - `../../src/lib/journey/semantic-guide.ts` — `hideSummaryCard` ✅
  - `@lib/ui/ui-feedback` — `showExperienceToast`, `syncSearchStatusForFocus` ✅
  - `./semantic-lane.ts` — 3 functions (other js/modules/)
  - `./navigation-state.ts` — `dispatchNavTransition`, `NAV_TRANSITION_ACTIONS` (other js/modules/)
  - `@lib/state/app.svelte` — `appState` ✅
  - `./lifecycle-modes.ts` — `MODE_DESCRIPTIONS`, `STORY_DESCRIPTIONS`, `refreshCompositionState`, `setMyceliumMode`, `setTrailDepth` (other js/modules/)
  - `./lifecycle-reset.ts` — `resetExplorationFocus`, `resetNodePositions`, `resetExperienceState`, `returnToOverview` (other js/modules/)
  - `@lib/orchestration/url-state` — `copyCurrentViewLink` ✅
  - `./journey-compass-controller.ts` — `updateJourneyCompass` (other js/modules/)

- **Inbound cross-importers (who imports this file from js/modules/):**
  1. `js/modules/exploration-mode.ts:9` → imports `{ setMyceliumMode, setTrailDepth }` from `./lifecycle.ts`
  2. `js/modules/journey-focus-ui.ts:19` → imports `{ dispatchNavTransition, NAV_TRANSITION_ACTIONS }` from `./lifecycle.ts`
  3. `js/modules/journey-compass-controller.ts:24` → imports `{ exploreInsideToNextStop, resetExplorationFocus, setTrailDepth }` from `./lifecycle.ts`
  4. `js/modules/map-state.ts:13` → imports `{ showExperienceToast, focusOnPoint }` from `./lifecycle.ts`
  5. `js/modules/journey.ts:98` → imports `{ setSemanticDiveMode }` from `./lifecycle.ts`
  6. `js/modules/journey-thread-settler.ts:12` → imports `{ dispatchNavTransition, NAV_TRANSITION_ACTIONS, focusOnPoint, updateJourneyCompass }` from `./lifecycle.ts`
  7. `js/modules/thread-inspector.ts:20` → imports `{ dispatchNavTransition, NAV_TRANSITION_ACTIONS, focusOnPoint, syncFocusStage }` from `./lifecycle.ts`
  8. `js/modules/url-state.ts:19` → imports multiple from `./lifecycle.ts`

- **Status:** has-cross-imports (8 inbound js/modules/ edges — the other heaviest)
- **@lib/* target candidates:**
  - `setMyceliumMode`, `setTrailDepth` → `@lib/orchestration/lifecycle` ✅
  - `dispatchNavTransition`, `NAV_TRANSITION_ACTIONS` → `@lib/orchestration/lifecycle` ✅
  - `exploreInsideToNextStop`, `resetExplorationFocus` → `@lib/orchestration/lifecycle` ✅
  - `showExperienceToast` → `@lib/ui/ui-feedback` ✅
  - `focusOnPoint` → `@lib/orchestration/lifecycle` ✅
  - `setSemanticDiveMode` → `@lib/journey/semantic-dive` ✅
  - `updateJourneyCompass` → `@lib/orchestration/lifecycle` or `@lib/journey/compass-controller`

### js/modules/app-svelte-island.ts

- **Outbound cross-imports (this file imports):**
  - `svelte` — `mount` ✅
  - `./components/App.svelte` — `App` (src/components, not js/modules/)
  - `@lib/utils/diagnostic-adapter` — `debugWarn` ✅

- **Inbound cross-importers (who imports this file from js/modules/):**
  - **NONE** — no js/modules/ file imports from `app-svelte-island.ts`

- **Status:** clean (0 inbound cross-imports)
- **@lib/* target candidates:** N/A — this file is already isolated
- **Note:** The file is a thin Svelte mount bridge. No rewiring needed. Can be marked as Wave 4 deletion candidate as-is.

### js/modules/exploration-mode.ts

- **Outbound cross-imports (this file imports):**
  - `@lib/engine/state-bridge` — `state` ✅
  - `@lib/orchestration/cluster-filter-controller` — `applyStoryPrompt` ✅
  - `./lifecycle.ts` — `setMyceliumMode`, `setTrailDepth` (cross-import to another of the 7)

- **Inbound cross-importers (who imports this file from js/modules/):**
  - **NONE** — no js/modules/ file imports from `exploration-mode.ts`

- **Status:** has-cross-imports-outbound (1 outbound edge to lifecycle.ts), but 0 inbound edges
- **@lib/* target candidates:**
  - `setMyceliumMode`, `setTrailDepth` → `@lib/orchestration/lifecycle` ✅
- **Note:** This is a thin re-export/exploration-mode descriptor. After rewiring the `lifecycle.ts` import to `@lib/orchestration/lifecycle`, this file becomes a leaf. Its 2 constants (`MODE_DESCRIPTIONS`, `STORY_DESCRIPTIONS`) are re-exported from `lifecycle.ts` → `lifecycle-modes.ts`, so they're already duplicated. Consider whether this file is even needed after migration.

### js/modules/three-node-manager.ts

- **Outbound cross-imports (this file imports):**
  - `three` — THREE ✅
  - `@lib/engine/state-bridge` — `state` ✅
  - `@lib/engine/webgl-context` — `webglContext` ✅
  - `@lib/utils/design-tokens` — `SCENE_PALETTE` ✅
  - `./utils/geo-data.ts` — `computeOverviewScatterOffsets` (js/utils/, not js/modules/)
  - `./utils/ui-presentation.ts` — `getThreadCategoryColor` (js/utils/)
  - `./utils/three-textures.ts` — 3 texture functions (js/utils/)
  - `./utils/seeded-random.ts` — `seededUnit` (js/utils/)
  - `@lib/engine/config` — `CONFIG` ✅
  - `@lib/engine/resource-tracker` — `disposeObject3D` ✅

- **Inbound cross-importers (who imports this file from js/modules/):**
  - **NONE** from `js/modules/` — only test files reference it by path

- **Status:** clean (0 inbound cross-imports from js/modules/)
- **@lib/* target candidates:** N/A — already isolated from js/modules/ cross-imports
- **Note:** This file still has internal js/utils/ cross-imports but those are outside the Wave 3 scope. The parallel session is porting it to `src/lib/engine/node-manager.ts`. Once ported, the js/modules/ version becomes dead code.

## Rewiring order (leaf-first)

Ordered by inbound cross-import count (fewest first), considering dependency chains:

| Step | File | Inbound edges | Rationale |
|------|------|--------------|-----------|
| 1 | `app-svelte-island.ts` | 0 | No js/modules/ inbound imports. Already clean. No rewiring needed. |
| 2 | `exploration-mode.ts` | 0 | No inbound edges, but 1 outbound to `lifecycle.ts`. Rewire that 1 import to `@lib/orchestration/lifecycle`, then done. |
| 3 | `three-node-manager.ts` | 0 | No js/modules/ inbound imports. Already clean. Parallel session porting to `src/lib/engine/node-manager.ts`. |
| 4 | `loading-ui.ts` | 1 | Only `view-controller.ts` imports from it. Rewrite `view-controller.ts:30` to import `scheduleWeatherHydration` from `@lib/ui/loading`. |
| 5 | `composition-state.ts` | 3 | `lifecycle-modes.ts`, `lifecycle.ts`, `view-controller.ts` import from it. After step 4, `view-controller.ts` still imports `applyCompositionState`. Create `@lib/orchestration/composition-state.ts` re-export, then rewire all 3 importers. |
| 6 | `journey.ts` | 7 | Heaviest inbound fan-out. Must come after `journey-*` chain is wired. Rewire each of the 7 importers to `@lib/journey/*` canonicals. |
| 7 | `lifecycle.ts` | 8 | Highest inbound fan-out. Must come last since `journey.ts`, `exploration-mode.ts`, and others import from it. Rewire all 8 importers to `@lib/orchestration/lifecycle` and other canonicals. |

### Detailed rewiring steps

**Step 1-3 (zero-effort):** No source changes needed. Mark as clean.

**Step 4 — loading-ui.ts → view-controller.ts:**
- In `js/modules/view-controller.ts:30`: change `from './loading-ui.ts'` → `from '@lib/ui/loading'`
- Verify: `npm run check:ts-progress`

**Step 5 — composition-state.ts (3 edges):**
- Create `@lib/orchestration/composition-state.ts` re-exporting `applyCompositionState` + `derivePanelSurface` from `js/modules/composition-state.ts` (or inline them)
- In `js/modules/lifecycle-modes.ts:5`: change `from './composition-state.ts'` → `from '@lib/orchestration/composition-state'`
- In `js/modules/lifecycle.ts:15`: change `from './composition-state.ts'` → `from '@lib/orchestration/composition-state'`
- In `js/modules/view-controller.ts:31`: change `from './composition-state.ts'` → `from '@lib/orchestration/composition-state'`

**Step 6 — journey.ts (7 edges):**
- In `js/modules/journey-compass-controller.ts:21`: `setSemanticDiveMode` → `@lib/journey/semantic-dive`
- In `js/modules/loading-ui.ts:10`: `restoreFocusTrailState`, `updateSelectedBusiness` → verify `@lib/journey/neighborhood` and `@lib/journey/selected-card` exports
- In `js/modules/lifecycle.ts:11`: `updateSelectedBusiness`, `syncFocusStage`, `walkThreadNeighbor` → `@lib/journey/selected-card`, `@lib/journey/thread-settler`
- In `js/modules/lifecycle-reset.ts:6`: `syncFocusStage` → `@lib/journey/selected-card`
- In `js/modules/journey-semantic-overlay.ts:13`: `getCurrentTrailFocusIndex`, `getNextWalkCandidateForIndex` → `@lib/journey/neighborhood`
- In `js/modules/lifecycle-modes.ts:6`: `applyPointFilterColors` → `@lib/journey/point-color`
- In `js/modules/view-controller.ts:28`: multiple → split to appropriate `@lib/journey/*`

**Step 7 — lifecycle.ts (8 edges):**
- In `js/modules/exploration-mode.ts:9`: `setMyceliumMode`, `setTrailDepth` → `@lib/orchestration/lifecycle`
- In `js/modules/journey-focus-ui.ts:19`: `dispatchNavTransition`, `NAV_TRANSITION_ACTIONS` → `@lib/orchestration/lifecycle`
- In `js/modules/journey-compass-controller.ts:24`: `exploreInsideToNextStop`, `resetExplorationFocus`, `setTrailDepth` → `@lib/orchestration/lifecycle`
- In `js/modules/map-state.ts:13`: `showExperienceToast`, `focusOnPoint` → `@lib/orchestration/lifecycle`
- In `js/modules/journey.ts:98`: `setSemanticDiveMode` → `@lib/journey/semantic-dive` (bypass lifecycle.ts entirely)
- In `js/modules/journey-thread-settler.ts:12`: `dispatchNavTransition`, `NAV_TRANSITION_ACTIONS`, `focusOnPoint`, `updateJourneyCompass` → `@lib/orchestration/lifecycle`
- In `js/modules/thread-inspector.ts:20`: `dispatchNavTransition`, `NAV_TRANSITION_ACTIONS`, `focusOnPoint`, `syncFocusStage` → split across `@lib/orchestration/lifecycle` + `@lib/journey/selected-card`
- In `js/modules/url-state.ts:19`: multiple → verify each symbol's canonical home

## Open questions for the parallel session

1. **`@lib/ui/loading` exports:** Does `src/lib/ui/loading.ts` already export `scheduleWeatherHydration`? If not, the loading-ui.ts → view-controller.ts rewire (step 4) requires either adding the export or choosing a different canonical.

2. **`@lib/orchestration/lifecycle` completeness:** Does `src/lib/orchestration/lifecycle.ts` already re-export all 12+ symbols that `js/modules/lifecycle.ts` currently provides to its importers (especially `focusOnPoint`, `showExperienceToast`, `exploreInsideToNextStop`, `NAV_TRANSITION_ACTIONS`)? The W19 wave wired `lifecycle-bridge.ts` to it, but the full symbol set needs verification.

3. **`derivePanelSurface` canonical home:** Should this live in `@lib/orchestration/composition-state` (new file) or be folded into `@lib/orchestration/view-controller` (which already imports it)? The composition-state.ts module exports only 2 public functions, so a dedicated canonical seems cleanest.

4. **journey.ts self-referencing loop:** `journey.ts` imports `setSemanticDiveMode` from `lifecycle.ts`, and `lifecycle.ts` imports `syncFocusStage` from `journey.ts`. This circular dependency (`journey.ts ↔ lifecycle.ts`) currently resolves via ES module hoisting but creates a fragile coupling. Should one of these cross-edges be broken by moving `syncFocusStage` to `@lib/journey/selected-card` (which already exports it)?

5. **journey-semantic-overlay.ts import:** This file imports from BOTH `./journey.ts` and `./journey-thread-model.ts` — after rewiring journey.ts imports, does journey-semantic-overlay become a pure leaf, or does it still have a dependency chain?

6. **Exploration-mode.ts value:** After rewiring, `exploration-mode.ts` only re-exports `setMyceliumMode` and `setTrailDepth` from `@lib/orchestration/lifecycle`, plus defines local constants already in `lifecycle-modes.ts`. Can this file be deleted in Wave 4 rather than rewired?

## Unexpected findings

- **`app-svelte-island.ts` is truly isolated** — it imports nothing from `js/modules/` and nothing from `js/modules/` imports it. It's a pure Svelte mount utility that uses only `@lib/utils/diagnostic-adapter`. It could be moved to `src/lib/` rather than deleted.

- **`exploration-mode.ts` and `lifecycle-modes.ts` duplicate constants** — both define `MODE_DESCRIPTIONS` and `STORY_DESCRIPTIONS`. The `exploration-mode.ts` version is imported by nothing in `js/modules/`, while `lifecycle-modes.ts` is imported by `lifecycle.ts`. During Wave 4, `exploration-mode.ts` should be a safe deletion candidate.

- **`three-node-manager.ts` has zero js/modules/ inbound edges** — it was incorrectly included in the "cross-import" analysis scope. Its cross-imports are all to `js/utils/` (not `js/modules/`), which is outside Wave 3 scope. The parallel session's port to `src/lib/engine/node-manager.ts` is the correct path.

- **`lifecycle.ts` imports from `journey.ts` and vice versa** — this bidirectional cross-import (lifecycle↔journey) means neither can be rewired independently. The circular dependency must be broken first, likely by ensuring `journey-selected-card.ts` exports `syncFocusStage` and `journey-thread-settler.ts` exports `walkThreadNeighbor`.

- **All `@lib/` canonical targets already exist** — no new `@lib/` modules need to be created for the outbound imports of the 7 files. The rewiring work is exclusively in the **consumer** files (the ~12 js/modules/ files that import FROM the 7).
