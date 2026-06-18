# W20 Open Questions Investigation

**Date:** 2026-06-17
**Author:** kilo/openrouter/owl-alpha subagent
**Goal:** Resolve the 4 actionable open questions from `docs/w20-cross-import-map.md` so Wave 3 rewiring can proceed with confidence.

---

## Q1: @lib/ui/loading completeness for `scheduleWeatherHydration`

**Verdict:** YES — already exports `scheduleWeatherHydration`

**Evidence:**

- File: `src/lib/ui/loading.ts`
- Line 139: `export function scheduleWeatherHydration(): void {`
- Full export list from `src/lib/ui/loading.ts` (9 exports):
    - `interface LoadingOverrides`
    - `function setLoadingPhase`
    - `function hideLoadingOverlay` (async)
    - `function startDeferredHydration`
    - `function scheduleWeatherHydration` ✅
    - `function applyLoadingErrorState`
    - `function showTerrainPreludeOverlay`
    - `function hideTerrainPreludeOverlay`
    - `function cancelLoadingHide`

**Recommendation for W20 step 4:**
Straightforward. In `js/modules/view-controller.ts:30`, change:

```
from './loading-ui.ts'
```

to:

```
from '@lib/ui/loading'
```

No new exports needed. The canonical is complete.

---

## Q2: @lib/orchestration/lifecycle symbol coverage

**Coverage table (10 consumer symbols across 8 importers):**

| Consumer symbol           | In `@lib/orchestration/lifecycle`? | Status                                                      | If no, where?                                                                                                 |
| ------------------------- | ---------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `setMyceliumMode`         | YES                                | ✅ Re-exported from `@lib/stores/lifecycle`                 | —                                                                                                             |
| `setTrailDepth`           | YES                                | ✅ Re-exported from `@lib/stores/lifecycle`                 | —                                                                                                             |
| `dispatchNavTransition`   | YES                                | ✅ Re-exported from `@lib/stores/navigation.svelte.ts`      | —                                                                                                             |
| `NAV_TRANSITION_ACTIONS`  | YES                                | ✅ Re-exported from `@lib/stores/navigation.svelte.ts`      | —                                                                                                             |
| `exploreInsideToNextStop` | YES                                | ✅ Direct export (local function)                           | —                                                                                                             |
| `resetExplorationFocus`   | YES                                | ✅ Re-exported from `@lib/stores/lifecycle`                 | —                                                                                                             |
| `showExperienceToast`     | YES                                | ✅ Direct export (local function, stub)                     | —                                                                                                             |
| `focusOnPoint`            | YES                                | ✅ Direct export (local function)                           | —                                                                                                             |
| `updateJourneyCompass`    | YES                                | ✅ Re-exported from `@lib/orchestration/compass-controller` | —                                                                                                             |
| `setSemanticDiveMode`     | **NO**                             | ❌ Not exported under this name                             | `@lib/stores/lifecycle` exports it; `@lib/orchestration/lifecycle` exports `setSemanticDiveModeProxy` instead |

**Verdict:**

- Symbols already covered: **9/10**
- Symbols missing: **1/10** — `setSemanticDiveMode`
- Symbols needing new canonical: **0** — the symbol exists in `@lib/stores/lifecycle`, just not re-exported through `@lib/orchestration/lifecycle`

**Important context:** The consumer that needs `setSemanticDiveMode` from `lifecycle.ts` is `js/modules/journey.ts:98`. However, `js/modules/journey.ts` already imports `setSemanticDiveMode` from `@lib/stores/lifecycle` (not from `./lifecycle.ts`), so this particular cross-import edge is **already resolved** at the source level. The `@lib/orchestration/lifecycle` canonical only needs `setSemanticDiveMode` re-exported if other `js/modules/` files import it from `./lifecycle.ts` and expect to find it there.

Checking the 8 importers of `js/modules/lifecycle.ts`:

- `js/modules/journey.ts:98` — imports `setSemanticDiveMode` from `@lib/stores/lifecycle` directly (already clean, bypasses lifecycle.ts)
- No other importer of `js/modules/lifecycle.ts` imports `setSemanticDiveMode` from it

**Recommendation for W20 step 7:**
Add `setSemanticDiveMode` to the re-exports in `@lib/orchestration/lifecycle.ts` from `@lib/stores/lifecycle`. This is a one-line addition for forward compatibility, even though the current consumer (`journey.ts`) already bypasses it. The canonical should be complete for any future consumer.

---

## Q3: `derivePanelSurface` canonical home

**Verdict:** Option A — create new `@lib/orchestration/composition-state.ts`

**Evidence:**

- `src/lib/orchestration/view-controller.ts` does **NOT** import or use `derivePanelSurface` at all. It has zero references to this function.
- `derivePanelSurface` is currently imported by only one file: `js/modules/lifecycle.ts:15` from `./composition-state.ts`
- `src/lib/stores/lifecycle.ts` has its own private `derivePanelSurface` function (not exported) used internally by `applyCompositionState`
- The `js/modules/composition-state.ts` module exports only 2 public functions: `applyCompositionState` and `derivePanelSurface`
- `applyCompositionState` is already re-exported through `@lib/orchestration/lifecycle` from `@lib/stores/lifecycle`

**Recommendation:**
Create `@lib/orchestration/composition-state.ts` re-exporting:

- `applyCompositionState` from `@lib/stores/lifecycle` (or keep existing re-export in lifecycle.ts)
- `derivePanelSurface` from `js/modules/composition-state.ts` (since the Svelte store version is private)

This is the cleanest option because:

1. `derivePanelSurface` is a pure function (no store dependencies) that belongs in orchestration, not in the view-controller
2. A dedicated 2-function canonical is cleaner than folding it into view-controller which doesn't use it
3. All 3 importers (`lifecycle-modes.ts`, `lifecycle.ts`, `view-controller.ts`) can import from the same canonical path

---

## Q4: `walkThreadNeighbor` canonical home

**Verdict:** YES — in `@lib/journey/thread-settler`

**Evidence:**

- File: `src/lib/journey/thread-settler.ts`
- Line 267: `export function walkThreadNeighbor(index: number, options: WalkOptions = {}): WalkResult | null {`
- Also exported as a class method on `ThreadSettler.walkThreadNeighbor`
- `js/modules/lifecycle.ts:7` already imports it from `@lib/journey/thread-settler` (not from `./journey.ts`)
- The cross-import map correctly identified `@lib/journey/thread-settler` as the canonical

**Recommendation:**
No action needed. The canonical already exists and exports `walkThreadNeighbor`. Owl-1's cycle break can proceed — `js/modules/lifecycle.ts` already imports from the canonical path. The remaining work is to ensure `js/modules/journey.ts` re-exports are no longer needed for this symbol.

---

## Optional Q5: `updateJourneyCompass` canonical home

**Verdict:** Already in `@lib/orchestration/lifecycle` via re-export from `@lib/orchestration/compass-controller`

**Evidence:**

- `src/lib/orchestration/compass-controller.ts` line 40: `export function updateJourneyCompass(): void {`
- `src/lib/orchestration/lifecycle.ts` re-exports it: `updateJourneyCompass,` (from the compass-controller re-export block)
- `js/modules/journey-thread-settler.ts:12` imports `updateJourneyCompass` from `./lifecycle.ts`
- `js/modules/thread-inspector.ts:20` imports `updateJourneyCompass` from `@lib/engine/journey-compass-controller-bridge` (already a different canonical path)

**Recommendation:**
No action needed. The symbol is already available through `@lib/orchestration/lifecycle`.

---

## Summary of recommendations for Wave 3

- **Step 1-3 (zero-effort, no rewiring needed):** `app-svelte-island`, `exploration-mode`, `three-node-manager`

- **Step 4 (loading-ui.ts → view-controller.ts):** ✅ SAFE — `@lib/ui/loading` already exports `scheduleWeatherHydration`. One-line import change in `view-controller.ts:30`.

- **Step 5 (composition-state.ts):** Create new `@lib/orchestration/composition-state.ts` re-exporting `applyCompositionState` + `derivePanelSurface`. Then rewire `lifecycle-modes.ts:5`, `lifecycle.ts:15`, and `view-controller.ts:31`.

- **Step 6 (journey.ts):** `@lib/journey/thread-settler` already exports `walkThreadNeighbor` ✅. `@lib/journey/selected-card` already exports `syncFocusStage` ✅. Rewire the 7 importers of `journey.ts` to the appropriate `@lib/journey/*` canonicals.

- **Step 7 (lifecycle.ts):** 9/10 symbols already covered. Add `setSemanticDiveMode` re-export to `@lib/orchestration/lifecycle.ts` from `@lib/stores/lifecycle` for completeness (even though the current consumer already bypasses it). Then rewire all 8 importers.

### Blockers

**No hard blockers.** All 4 questions resolve cleanly:

- Q1: Export exists ✅
- Q2: 9/10 covered, 1 easy add ✅
- Q3: New file needed but straightforward ✅
- Q4: Export exists ✅

### New finding worth surfacing

`js/modules/lifecycle.ts` has already partially self-resolved: it imports `walkThreadNeighbor` from `@lib/journey/thread-settler` (line 7) and `updateSelectedBusiness`/`syncFocusStage` from `@lib/journey/selected-card` (line 6) — both canonical paths. The remaining relative imports in this file are:

1. `switchView, showViewHandoff, hideViewHandoff` from `./view-controller.ts` (line 5)
2. `derivePanelSurface` from `./composition-state.ts` (line 15)
3. `dispatchNavTransition, NAV_TRANSITION_ACTIONS` from `./navigation-state.ts` (lines 27-28)

These 3 relative imports are the actual cross-import edges that step 7 needs to resolve, not the full set of 8 importer files. The lifecycle.ts file itself is already mostly canonical.
