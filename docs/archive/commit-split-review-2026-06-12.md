# Commit Split Review — 2026-06-12

**Scope:** 37 modified files, +699 / -131 lines. Single in-flight feature: **focus-search surface DOM-preservation** with supporting contract test infrastructure.

---

## Section 1: File Categorization

| File | What Changed | Category | Split Risk |
|---|---|---|---|
| `AGENTS.md` | Fixed 4 drift items: stale `three-setup` ref, journey-compass FSM mislabel, micro-demo CANCELLED diagram, "all 225 pass" | A: AGENTS drift | low |
| `src/App.svelte` | `focusSearchForced` derived state, `searchPanelContent` snippet, `infoPanelOpen` wiring, `setSemanticDiveMode` import, body-attr MutationObserver for `data-focus-search-forced`, pointer-events CSS for `#journey-compass` | C: core | **high** |
| `src/components/InfoPanel.svelte` | New `content` snippet prop, `{@render content?.()}`, `panelOpen` derivation Boolean guard, `formatStatus` import swap, `hidden` on panel | C: core | **high** |
| `src/components/JourneyChrome.svelte` | `legacyRefreshTick` polling, `chromeHasFocus`/`chromeHasTrail` derived, timer cleanup, `inspectionLocked` state | C: core | med |
| `src/components/LegacyCompassSurface.svelte` | Added `data-focus-search-forced` sync, focus-search aware body attr handling | C: core | med |
| `src/components/FocusCard.svelte` | Conditional `focusActive` render, footer shows cluster instead of node index, bottom-sheet radius for `focus-search` + `field-node` | C: core | med |
| `src/components/ThreadInspector.svelte` | New body-attr sync for focus-search forced surface | C: core | low |
| `src/components/CompassRail.svelte` | Body-attr observers for `panelSurface`/`graphContext`, `.compass-steps` class, `.primary` class logic | C: feature | low |
| `src/components/SearchInput.svelte` | No-abort on unmount during surface transition, status div always rendered (hidden), removed `showSearchStatus` derived | C: feature | low |
| `src/components/SearchResults.svelte` | `SearchResult.index` typed as `number`, improved rank/strength labels, `.search-result-item` class, "Top match" count anchor, mobile `max-height` constraint | E: test selectors | low |
| `src/components/Filters.svelte` | Changed wrapper from `<div>` to `<details>` element | E: test selectors | low |
| `src/lib/orchestration/url-state.ts` | `preserveDomForcedFocusSearchSurface()`, `isDomForcedFocusSearchSurface()`, double-call in `_restoreSearchFromParams`, `domForcedFocusSearchSurface` guard | C: core | **high** |
| `src/lib/orchestration/compass-controller.ts` | `syncMapTrailStrip()`: County button added, `hasActiveRouteContext` density/actions change for map phase | C: feature | low |
| `src/lib/orchestration/parity-attrs.ts` | `return 'map-idle'` added to `panelSurfaceMode` IIFE | C: core | low |
| `src/lib/orchestration/parity-attrs.svelte.ts` | `return 'map-idle'` added (mirrored) | C: core | low |
| `src/lib/search-engine.ts` | `staticDev=0` escape hatch, `canUseStaticDevFallback()`, `raceWithStaticFallback()`, `fetchSemanticSearchResultsDirect` with `timeoutMs`, typed timeout error | C: feature + E: test infra | med |
| `src/lib/types/state.ts` | New `SearchResultPoint` interface, `point?:` field on `SearchResult` | C: core | low |
| `src/lib/stores/focus.svelte.ts` | Legacy fallback fallbacks throughout, new `readLegacyNavField` integration | C: core | med |
| `src/lib/stores/journey.svelte.ts` | Legacy fallback for `trailDepth`, `trailNeighborIndices`, `threadCandidates`, `walkHistoryIndices` | C: core | med |
| `src/lib/stores/navigation.svelte.ts` | 8 lines of minor fixes | C: core | low |
| `src/lib/stores/search.svelte.ts` | 2 lines added | C: core | low |
| `src/lib/stores/lifecycle.ts` | `resetExplorationFocus` `preserveSearch` default changed, `applyCompositionState` delegation, new `deriveGraphContext`/`derivePanelSurface` pure functions | C: core | med |
| `js/modules/composition-state.ts` | `forcedFocusSearchSurface` guard at top of `applyCompositionState` | C: core | low |
| `js/modules/focus-anchor-indicator.ts` | `visible` flag on sprite material (trivially unrelated — prevents GL error when texture is null) | F: misc | low |
| `js/modules/journey-point-color.ts` | `toIndexArray()` helper replacing inline casts, null-safe array access | F: misc / B: bugfix | low |
| `css/mobile_premium__focus-dive.css` | `focus-search` bottom-sheet styles, `field-node` radius, new body-gate rules | E: test CSS | low |
| `css/mobile_premium__state.css` | Minor fix (1 line change) | E: test CSS | low |
| `css/mobile_premium__surfaces.css` | `focus-search` surface overrides (34 lines) | E: test CSS | low |
| `tests/surface-contract-check.mjs` | New contract surfaces added — `search-no-results`, `mobile-product-focus-route`, `mobile-product-preview-route` | E: test infra | low |
| `tests/css-ownership-check.mjs` | Updated CSS selector counts to match new `.focus-stage-*` rules | E: test infra | low |
| `tests/product-playthrough-audit.mjs` | Updated selectors and navigation flow for focus-search states | E: test infra | low |
| `dist/svelte/index.html` | Build output refresh (4 lines) | D: dist | low |
| `dist/svelte/css/mobile_premium__chrome.css` | Built output refresh | D: dist | low |
| `dist/svelte/css/mobile_premium__focus-dive.css` | Built output refresh | D: dist | low |
| `dist/svelte/css/mobile_premium__state.css` | Built output refresh | D: dist | low |
| `dist/svelte/css/mobile_premium__surfaces.css` | Built output refresh | D: dist | low |
| `dist/svelte/css/modules/focus_stage.css` | Built output refresh (22 lines) | D: dist | low |

---

## Section 2: Validation Results

**svelte-check: 0 errors, 0 warnings.** Pass.

**AGENTS.md invariant audit:**

| Invariant | Result |
|---|---|
| `withStateMutation()` for tracked sub-objects | ✅ No violations found. All diff churn is in `.svelte` components (which use Svelte 5 `$state`, not the `state.js` Proxy), or in `.ts` orchestration that calls proper store update methods. No raw `state.navState.X =` patterns. |
| `Math.random()` → `seededUnit()` | ✅ No `Math.random()` introduced. The `performMockSearch` function in `search-engine.ts` already existed; the new code doesn't add any. |
| `!important` in CSS | ✅ No `!important` declarations in any new or changed CSS. |
| Dead CSS selectors (grep-confirmed) | ✅ No dead selectors observed in the diff. The `bottom-sheet` radius rule in `FocusCard.svelte` targets `data-panel-surface='focus-search'][data-focus-panel-mode='field-node']` which the new parity-attrs path actively writes. |

---

## Section 3: Suggested Commit Split (5 commits, execution order)

### Commit 1 — Legacy JS bugfixes (Phase 1 trivial)
```bash
git add js/modules/focus-anchor-indicator.ts js/modules/journey-point-color.ts
```
**Message:** `fix(legacy): prevent GL null texture crash + harden toIndexArray in point-color`  
**Rationale:** Unrelated bugfixes in the legacy Three.js layer that are independently safe to land and should not be bundled with the feature.

### Commit 2 — AGENTS.md drift correction
```bash
git add AGENTS.md
```
**Message:** `chore(agents): fix 4 drift items — stale three-setup ref, compass FSM mislabel, micro-demo diagram, contract test count`  
**Rationale:** Documentation-only; zero runtime impact; should be its own atomic commit so it doesn't pollute the feature diff.

### Commit 3 — Focus-search surface feature (core)
```bash
git add src/App.svelte src/components/InfoPanel.svelte src/components/JourneyChrome.svelte src/components/FocusCard.svelte src/components/LegacyCompassSurface.svelte src/components/ThreadInspector.svelte src/components/CompassRail.svelte src/components/SearchInput.svelte src/lib/orchestration/url-state.ts src/lib/orchestration/compass-controller.ts src/lib/orchestration/parity-attrs.ts src/lib/orchestration/parity-attrs.svelte.ts src/lib/search-engine.ts src/lib/types/state.ts src/lib/stores/focus.svelte.ts src/lib/stores/journey.svelte.ts src/lib/stores/navigation.svelte.ts src/lib/stores/search.svelte.ts src/lib/stores/lifecycle.ts js/modules/composition-state.ts
```
**Message:** `feat(focus-search): DOM-preserved URL restore + search panel content injection + forced-focus body attrs`  
**Rationale:** This is the coordinated in-flight feature. All these files form a single logical unit — the `focusSearchForced` derivation, the `preserveDomForcedFocusSearchSurface` URL restore path, the `content` snippet prop on InfoPanel, and the legacy composition-state guard. Applying without any one of these leaves the surface partially broken.

### Commit 4 — CSS mobile premium overrides for focus-search
```bash
git add css/mobile_premium__focus-dive.css css/mobile_premium__state.css css/mobile_premium__surfaces.css src/components/Filters.svelte
```
**Message:** `feat(css): mobile bottom-sheet + surface overrides for focus-search state`  
**Rationale:** CSS-only commit. Depends on Commit 3's body-attr changes landing first (the CSS selectors target `data-panel-surface='focus-search'`), so this must come after.

### Commit 5 — Contract test infrastructure + dist rebuild
```bash
git add tests/surface-contract-check.mjs tests/css-ownership-check.mjs tests/product-playthrough-audit.mjs dist/svelte/index.html dist/svelte/css/ src/components/SearchResults.svelte
```
**Message:** `chore(tests): add focus-search contract surfaces + selector updates + dist rebuild`  
**Rationale:** Test infrastructure adapts to the new feature. `dist/svelte/` must come after the source changes that produced it. `SearchResults.svelte` lives here because its label/string changes (`"Top match"`, `"Strong match"`, etc.) are contract-test-facing, not feature-logic.

---

## Section 4: Risk List

**Top 3 risks of partial commit:**

1. **Commit 3 without Commit 4:** The feature "works" but mobile users see no bottom-sheet chrome — floating controls with no surface containment. Not a crash, but a visible regression.
2. **Commit 4 without Commit 3:** CSS selectors targeting `data-panel-surface='focus-search'` are dead rules until the body attr is written. No runtime impact, but confusing for future grep.
3. **Commit 5 without Commit 3:** Contract tests for `mobile-product-focus-route` and `search-no-results` will fail because the DOM hooks they assert (`data-focus-search-forced`, updated `.search-results-count` strings) won't exist yet.

**Top 3 risks of the full batch:**

1. **Double-call of `preserveDomForcedFocusSearchSurface` in `_restoreSearchFromParams`:** Called once at the top (line ~140) and once after `runSearch` completes (line ~180) and once more at the very end of `applyUrlState()` (line ~126). This is intentional (belt-and-suspenders against async race), but if the function ever has side-effect sensitivity, triple-invocation could bite.
2. **`searchAbortController` not aborted on unmount during surface transition:** The deliberate choice to *not* abort during `idle → search` transition means a slow first search could complete after the user navigates away, writing stale results to the global store. If downstream consumers don't guard on surface, this is a stale-state injection.
3. **Duplicated `computeParityAttributes` logic:** `parity-attrs.ts` and `parity-attrs.svelte.ts` both contain the `return 'map-idle'` change. If one file is updated without the other in future work, parity drifts silently.

**Recommended contract test sequence after each commit:**

| After commit | Run |
|---|---|
| 1 (legacy bugfix) | `npm run qa:contract:all` (baseline sanity) |
| 2 (AGENTS) | No test needed (docs only) |
| 3 (feature) | `npm run qa:contract:all -- --surface=search-error --surface=launch-focus --surface=compass-rail` then `npm run test:contract` |
| 4 (CSS) | `npm run qa:surface:mobile-idle` and `npm run qa:contract:all -- --surface=mobile-product-focus-route` |
| 5 (tests + dist) | `npm run qa:contract:all` (full suite) |

---

## Section 5: Should NOT Be in This Batch

- **`js/modules/focus-anchor-indicator.ts` (the `visible` flag fix):** This is a one-line GL guard that has nothing to do with the focus-search feature. It's already in Commit 1 where it belongs — just make sure it stays there.

- **`dist/svelte/` files:** These are build artifacts. If the repo policy is to commit built output (which it appears to be, given the existing tracked files), fine — but this commit should happen strictly *after* Commits 3+4 are verified green. Not before.

- **`js/modules/journey-point-color.ts`:** The `toIndexArray()` refactor is a defensive null-safety fix that could be its own PR. It's only included here because it touched the same file as other work. If you want a clean history, pull it into a standalone commit before Commit 1.

- **`src/components/SearchInput.ts` unmount abort guard:** The comment says "do not abort on remount during surface transition" — this is a behavioral change that could mask real issues if the input unmounts for reasons *other* than the expected surface transition. It's correct today but fragile. Keep an eye on it.
