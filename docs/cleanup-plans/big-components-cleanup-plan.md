# Wave 1 — Big Components Cleanup Plan

**Author:** hy3-free background subagent (READ-ONLY investigation → this file only)
**Repo:** `/c/Users/HP/repos/semantic-explorer` · branch `master`. Investigated at HEAD `161194f1`; **current HEAD `5222e684`** after the parallel-lane merge of 7 commits. Header.svelte template region extents below are revision-checked at `5222e684` (`<dialog>` block now :451-482, `mode-chips` radiogroup :386-450, total Header 487 LOC unchanged). Other component extents unchanged.
**Scope:** Cleanup plan for the 6 Svelte components >450 LOC. SearchInput-side extraction is intentionally deferred to the search-layer plan (see §2 note); this plan covers SearchInput only for cross-cutting concerns and focuses the 5 others.
**Method:** `rg` / `wc -l` / `git log` / `git status` only. No edits, no builds, no tests. Every factual claim cites `file:line`.

> **⚠️ Superseded by W52 `4dde21b7` + `2833be6c` + `12ae8927` + `2537a84c`:** the Header.svelte + JourneyCompass.svelte extractions described in §1 #1 + §1 #2 below were already executed during the W52 cleanup campaign — `ModeChipRail.svelte` + `HelpDialog.svelte` extracted at `4dde21b7` / `2833be6c`; JourneyCompass split into `CompassHeader` + `CompassActionButton` + `CompassDiveSurface` at `12ae8927` / `2537a84c`. The Header.svelte line-number ranges `311-484` + JourneyCompass `357-440` referenced below are pre-extraction numbers (revision-checked at the then-current HEAD `5222e684`). The SearchResults/MapView `ErrorState` / `RetryButton` shared-seam proposal in §1 #3 remains a live follow-up pending parallel-session convergence on `SearchResults.svelte`. Treat the §1 #1 + §1 #2 narratives as historical (see post-W52 `docs/important-files.md` for the canonical parent → child inventory).

> **STATUS (2026-07-22, updated HEAD `cca058bb`):** Additional closures since W52:
>
> - **§1 #5 / §106 shared `ErrorState` + `RetryButton` seam — DONE.** `src/components/ErrorState.svelte` exists with a `map` variant and a `card` variant. MapView consumes the `map` variant: `MapView.svelte` renders `<ErrorState variant="map" title={friendlyMapError.title} detail={friendlyMapError.detail} technical={friendlyMapError.technical} retryLabel="Retry" onRetry={activateLeafletMap} />` in its error branch; the retry button resolves to `.map-retry-btn`. SearchResults consumes the `card` variant.
> - **§175 / §181 / §184 MapView + Placeholder2D journey-coverage gap — DONE (committed `cca058bb`, main-lane takeover).** `tests/mapview-placeholder-journey.spec.js` exists (5 tests: M1 `?view=map` chrome mount; M2 vendored-leaflet abort → status='error' → shared `<ErrorState>` `.map-retry-btn` retry that re-fires `activateLeafletMap`; P1 `?placeholder=1` cold-load CTA + title/badge + 5-item legend + hint; P2 CTA → `engineReady.signalReady()` flips renderKind to webgl; P3 legend-dot distinct-color directive guard) + `qa:mapview-placeholder` script registered. Authored main-lane after the dispatched subagent (`ocw_9b9a5b30`, nvidia/z-ai/glm-5.2) wedged on inference with zero files written (`pi-harness-subagent-spawn-wedge-3-layer` pattern). Gated verification: `npx playwright test … --list` = 5 tests (exit 0) + `npx eslint … --no-warn-ignored` (exit 0). The live `qa:mapview-placeholder` runtime run stays deferred to the main lane (depends on `qa:server:ensure` + `dist/svelte` freshness) — run it AFTER the live parallel-session engine refactor (`three-engine-core.ts` `LegacyState` → `AppState` cascade) commits.
> - §1 #6 (Placeholder2D `PlaceholderCategoryLegend` extraction) + §1 #7 (MapView status/back extraction) remain **lowest-priority**, gated on the above coverage gap landing + engine-owner sign-off (Leaflet/style risk).

---

## 1. Executive Summary

Top issues ranked by impact ÷ effort:

1. **Header.svelte is the highest-ROI extraction target.** Its `<dialog>` help block (`:451-482`) and the `mode-chips` radiogroup (`:386-450`) are self-contained, already backed by extracted logic in `@lib/components/header/mode-nav` + `mode-constants`, and already CSS-extracted to `header.css` (`:486`). Extracting `HelpDialog.svelte` (~90 LOC) + `ModeChipRail.svelte` (~60 LOC) cuts the parent from 487→~337 with near-zero blast radius. `src/components/Header.svelte:311-484`
2. **JourneyCompass.svelte splits cleanly into 3 presentational children** (step indicators, header kicker/title/note, action buttons) that own no store subscriptions — pure prop-driven. Low risk, ~130 LOC recoverable. `src/components/JourneyCompass.svelte:357-440`
3. **SearchResults.svelte already delegates to `SearchResultItem` but still inlines three full result-surface states** (loading/error/empty) that recur in MapView's error overlay — a shared `ErrorState`/`RetryButton` seam spans both. `src/components/SearchResults.svelte:354-405` and `src/components/MapView.svelte:216-243`
4. **No W47 Svelte-5 reactivity foot-gun exists in any of the 6.** `rg 'const\s+\w+\s*=\s*getInitial'` returned nothing; all read bypass attrs via `$derived(getBypassAttr(...))` (e.g. `Placeholder2D.svelte:54` is correctly inside `onMount`, not top-level; `Legend.svelte:64`, `FocusCard.svelte:93`, `JourneyCompass.svelte:128`). So reactivity cleanup is NOT a debt item here — do not manufacture it.
5. **Placeholder2D.svelte and MapView.svelte are style-dominated (280 / 272 LOC of `<style>`)** with thin scripts (46 / 195 LOC). They yield low extraction ROI and high style-regression risk; treat as the lowest-priority wave items. `src/components/Placeholder2D.svelte:228-507`, `src/components/MapView.svelte:260-531`

---

## 2. Per-Component Breakdown

LOC measured via `wc -l src/components/*.svelte`; region boundaries via `grep -nE '<script|</script>|<style>|</style>'` (Svelte has no explicit `<template>` tag — template = lines between `</script>` and `<style>`).

| Component      | Total | script       | template      | style         | child components used                                |
| -------------- | ----- | ------------ | ------------- | ------------- | ---------------------------------------------------- |
| SearchInput    | 678   | 15-344 (330) | 345-433 (89)  | 434-678 (245) | none (delegates results to SearchResults)            |
| JourneyCompass | 646   | 36-337 (302) | 338-567 (230) | 568-646 (79)  | `CompassAction` (`:208`)                             |
| SearchResults  | 588   | 24-346 (323) | 347-475 (129) | 476-588 (113) | `SearchResult` (`:291`), `SearchResultItem` (`:448`) |
| MapView        | 531   | 9-203 (195)  | 204-259 (56)  | 260-531 (272) | none (Leaflet DOM-injected)                          |
| Placeholder2D  | 507   | 39-84 (46)   | 85-227 (143)  | 228-507 (280) | none (inline SVG)                                    |
| Header         | 487   | 11-310 (300) | 311-484 (174) | 485-487 (3)   | none (logic in `@lib/components/header/*`)           |

### 2.1 SearchInput.svelte (678) — cross-cutting only

- **Top responsibilities:** Owns `queryInput`, debounce timer, `searchAbortController`, focus-intent consumption (`SearchInput.svelte:46-56`); emits search via `dispatchSearch`/`publish(SEARCH_CANCELLED)` (`:129`, `:300`); Enter-to-focus-first-result scrolling (`:280-288`).
- **Concurrent-edit risk:** Working tree clean (`git status -uall` → "nothing to commit"). Churn: touched in all of last 20 commits (`git log --oneline -20` → 20 rows). → **HIGH-CHURN-BE-CAUTIOUS**. The dominant extraction (e.g. the semantic-lane health pill `:347-352`, suggestion/clear sub-UI) belongs to the **search-layer plan** — do NOT duplicate it here.
- **Extraction candidates (cross-cutting only):**
    - `useSearchDebounce` / focus-intent helper in `@lib/search/` — absorbs the debounce+abort logic (`:179-210`). Shared with SearchResults consumers. ~40 LOC → parent ~638.
    - `SearchStatusHint.svelte` — the `semantic-lane-pill` health indicator (`:347-352`, `:660-678` style). ~10 LOC + style → parent ~628.
- **Risk:** med (high churn; script-coupled to search stores).

### 2.2 JourneyCompass.svelte (646)

- **Top responsibilities:** Subscribes to `journeyStore`/`focusStore`/`navState` and recomputes compass + presentation state (`:76-140`); renders step indicators, kicker/title/note, and primary/secondary/step-inside action buttons; emits via `handleAction`/`executeJourneyCompassAction` (`:141`). Owns `compass`, `presentation`, `phase`, `density`, `copy`, parity-derived body attrs (`:114-136`).
- **Concurrent-edit risk:** Clean tree. Churn: 11 of last 20 commits. → **HIGH-CHURN-BE-CAUTIOUS** (recent `consolidate z-index tokens` + `remove duplicate mode picker overlay` PR-C, `c1a9119a`, `43dc5c73`).
- **Extraction candidates (all pure prop-driven, no store ownership → low risk):**
    - `CompassStepIndicators.svelte` — the `{#each JOURNEY_COMPASS_PHASE_ORDER}` step spans (`:357-372`). Props: `phase`, `order`, `STEP_DESCRIPTIONS`. ~30 LOC → parent ~616.
    - `CompassHeader.svelte` — kicker/title/note block (`:374-392`). Props: `kicker`, `title`, `note`, `visibleTitle`. ~20 LOC → parent ~596.
    - `CompassActionButton.svelte` — primary/secondary/step-inside buttons driven by `buttonHidden`/`buttonDisabled`/`buttonLabel`/`actionKey` (`:393-440`). Props: `action`, `variant`, `onclick`. ~50 LOC → parent ~546.
- **Result:** parent 646 → ~540. **Risk:** low-med.

### 2.3 SearchResults.svelte (588)

- **Top responsibilities:** Derives `resultSlice`/`total`/`visibleCount`/`suggestions`/`isResultsSurfaceActive` (`:58-103`); keyboard listbox nav (`handleContainerKeyDown`, `setActiveResultByIndex`, `:110-138`); emits `URL_SYNC_REQUESTED`, `SEARCH_FOCUS_REQUESTED`, `SEARCH_CLEARED` (`:227`, `:314`, `:339-344`). Already delegates rows to `SearchResultItem` (`:448`).
- **Concurrent-edit risk:** Clean tree. Churn: 20/20 commits (very active — F7 dead-mirror removal `eb357ac6`, W48 polish `025a8e36`). → **HIGH-CHURN-BE-CAUTIOUS**.
- **Extraction candidates:**
    - `SearchErrorState.svelte` — the `isFullError` block (`:354-377`). Props: `friendlyError`, `onRetry`, `onClear`. ~45 LOC → parent ~543. **Shares shape with MapView error overlay (see §3).**
    - `SearchEmptyState.svelte` — the `isEmpty` block + suggestions chips (`:378-405`). Props: `summary`, `suggestions`, `onSuggestionClick`. ~55 LOC → parent ~488.
    - `SearchResultList.svelte` — listbox + `showMore` (`:420-470`). Optional; keep if it clarifies keyboard-nav ownership. ~50 LOC → parent ~438.
- **Result:** parent 588 → ~480 (with first two). **Risk:** med (high churn; listbox a11y tested).

### 2.4 MapView.svelte (531)

- **Top responsibilities:** Leaflet lifecycle — `activateMapShell`/`deactivateMapShell`/`initMap` with `DisposableRegistry` + `activationToken` (`:42-182`); publishes `VIEW_CHANGED`/`TOOLTIP_HIDE_REQUESTED` (`:105`, `:155`); owns `status`/`statusDetail`/`rawError` and `friendlyMapError` via `friendlyErrorMessage` (`:26-31`, `src/lib/utils/error-messages.ts`). Template is thin (56 LOC) but `<style>` is 272 LOC.
- **Concurrent-edit risk:** Clean tree. Churn: 20/20 (W49-F view-transition `7d49971d`, tooltip gaps `6433a31b`). → **HIGH-CHURN-BE-CAUTIOUS**.
- **Extraction candidates:**
    - `MapStatusOverlay.svelte` — loading shimmer + error status + retry (`:216-243`). Props: `status`, `statusDetail`, `friendlyMapError`, `onRetry`. ~30 LOC → parent ~501. **Reuses the shared `ErrorState`/`RetryButton` from §3.**
    - `MapBackButton.svelte` — footer back control (`:245-258`). Props: `onclick`. ~15 LOC → parent ~486.
- **Result:** parent 531 → ~486. **Risk:** high — Leaflet DOM is injected into `#map-container`/`#canvas-container` (`:67`, `:115-122`); the style block is huge and regression-prone; script is tightly coupled to `activationToken` race-gating. Lower priority than Header/JourneyCompass/SearchResults.

### 2.5 Placeholder2D.svelte (507)

- **Top responsibilities:** Mobile 2D splash — inline SVG orb cluster (`placeholder-svg`, `:88-180`), category legend, CTA `enter3d` → `engineReady.signalReady()` (`:67-73`), auto-open legend on mobile (`onMount`, `:54-64`). Script only 46 LOC; `<style>` 280 LOC.
- **Concurrent-edit risk:** Clean tree. Churn: 14/20 (W50-UX-2 `7f43a9e3`, a11y landmark fixes `f477e1c8`). → **SAFE-TO-TOUCH** (moderate churn, no parallel WIP).
- **Extraction candidates:**
    - `PlaceholderCategoryLegend.svelte` — `previewCategories` `<ul>` (`:80`, `:190-205`). Props: `categories`. ~20 LOC → parent ~487.
    - `OrbCluster.svelte` — the SVG orb composition (`:104-180`). Purely presentational; low ROI. ~80 LOC → parent ~427. (Optional — SVG is a single cohesive block.)
- **Result:** parent 507 → ~467 (first only). **Risk:** low-med (style-bound; changes must keep `data-testid="placeholder-2d"` `:88` and `placeholder-cta` `:192` stable for existing tests).

### 2.6 Header.svelte (487) — highest ROI

- **Top responsibilities:** Mode-chip radiogroup (`:386-450`, roving tabindex via `keyboardFocusIndex` `:73`, `handleModeKeydown` `:85`), legend/keyboard-help/app-help utility buttons (`:318-328`), and a full `<dialog>` help overlay (`:451-482`). Mode logic already extracted to `@lib/components/header/mode-nav.ts` (`selectMode`/`isModeLocked`/`computeModeKeydown`, imported around `:32`) and CSS to `header.css` via `@import` (`:486`). Template is 174 LOC but 150 of it is the dialog + chip rail.
- **Concurrent-edit risk:** Clean tree. Churn: 20/20 (W50 focus-on-#search-input `81efadcb`, bugsweep `01c31a2e`). → **HIGH-CHURN-BE-CAUTIOUS** but the extraction is mechanically safe (logic already externalized).
- **Extraction candidates:**
    - `HelpDialog.svelte` — the entire `<dialog class="help-dialog">` block (`:451-482`). Props: `bind:this`, `onClose`. Can reuse `src/lib/utils/focus-trap.ts` (exists, see §3). ~90 LOC → parent ~397.
    - `ModeChipRail.svelte` — the `mode-chips` radiogroup (`:386-450`). Props: `modes`, `activeMode`, `hasSelection`, `keyboardFocusIndex`, handler closures. ~60 LOC → parent ~337.
    - `OnboardingToast.svelte` (optional) — first-visit onboarding logic (`markOnboardingSeen`, `:47`, storage key `:44`) is shared with ProximityLegend; a small toast component could absorb it.
- **Result:** parent 487 → ~337. **Risk:** med (high churn, but the dialog/chip-rail are leaf UI; keep `aria-label`/`role="radiogroup"`/`#mode-chips`/`#btn-*` ids stable — they are asserted by `widget-journey.spec.js:777,1054,1105`).

### 2.7 Additional big-but-not-top (mention only, no detailed plan)

- `FocusCard.svelte` (462) — focus panel; uses `$derived(getBypassAttr('focusPanelMode'))` correctly (`:93`). Touches `src/components/FocusCard.svelte`.
- `JourneyChrome.svelte` (457) — chrome shell; `src/components/JourneyChrome.svelte`.
- `Canvas.svelte` (454) — WebGL canvas; `src/components/Canvas.svelte`. High engine-dispose risk; defer.
- `ThreadInspector.svelte` (453) — thread inspector; has dedicated `tests/thread-inspector-a11y-journey.spec.js` + `journey-thread-inspector-contract.mjs`. Defer.

---

## 3. Cross-Cutting Patterns

- **Shared `@import '<file>.css'`-inside-`<style>` pattern already established.** Only `Header.svelte:486` (`@import '@lib/components/header/header.css'`) and `ProximityLegend.svelte:171` (`@import '@lib/css/z-layers.css'`) use it. **Recommendation:** every new extracted component follows this pattern — co-locate its CSS at `src/lib/components/<Name>/<name>.css` and `@import` it, keeping global `css/` tokens as the source of truth. This keeps the precedent consistent and avoids a second style-ownership model.
- **Shared `ErrorState` + `RetryButton` seam.** `SearchResults.svelte:354-377` (error block) and `MapView.svelte:216-243` (error overlay) both render a title/detail/`Retry`/`Clear` pattern and both normalize via `friendlyErrorMessage` (`src/lib/utils/error-messages.ts`, used `MapView.svelte:27` and `SearchResults` via `src/lib/search/results-ui.ts`). **Recommendation:** extract one `src/lib/components/ErrorState.svelte` (+ a `RetryButton`) consumed by both. Eliminates a duplicated a11y structure.
- **Shared `SuggestionChips` (empty-state).** `SearchResults.svelte:378-405` renders `search-suggestion-chip` buttons from `suggestions`. SearchInput's cross-cutting layer may surface related suggestions. **Recommendation:** a `SuggestionChips.svelte` under `src/lib/components/` if a second consumer emerges.
- **Shared focus-trap util EXISTS.** `src/lib/utils/focus-trap.ts` + `src/lib/utils/focus-trap-bindings.ts` (`rg -l` confirmed). Header's `HelpDialog` (§2.6) and any future modal should bind this instead of hand-rolling Escape/outside-click handlers (`Header.svelte:451-482` has inline `onclick`/`onkeydown` Escape logic after grepping onkeydown Escape inside the dialog span).
- **No Svelte-5 reactivity foot-gun to fix.** `rg 'const\s+\w+\s*=\s*getInitial'` → no matches across `src/components/`. Bypass attrs are read reactively via `$derived(getBypassAttr(...))` (`Placeholder2D.svelte:54` is correctly scoped inside `onMount`; `Legend.svelte:64`, `FocusCard.svelte:93`, `JourneyCompass.svelte:128`). **Do not manufacture a reactivity refactor here** — the W47 pattern is already applied.
- **Reusable `<style>` blocks.** Most large `<style>` blocks are component-specific (orbs, map shimmer, search spinner). Tokenize into `css/` only where a token already exists (e.g. `CLUSTER_COLORS` `Placeholder2D.svelte:42`); otherwise keep scoped + `@import` per the Header precedent.

---

## 4. Concurrent-Edit Risk Map

`git status -uall -- src/components/` → **"nothing to commit, working tree clean"** (no parallel-lane WIP on any of the 6). Therefore none are `DO-NOT-TOUCH` on WIP grounds. Churn = commits touching the file in the last 20 (`git log --oneline -20 -- <file> | wc -l`).

| Component      | WIP? | Churn (last 20) | Recommendation                                              |
| -------------- | ---- | --------------- | ----------------------------------------------------------- |
| SearchInput    | No   | 20/20           | **HIGH-CHURN-BE-CAUTIOUS** (defer to search plan)           |
| JourneyCompass | No   | 11/20           | **HIGH-CHURN-BE-CAUTIOUS** (safe mechanically)              |
| SearchResults  | No   | 20/20           | **HIGH-CHURN-BE-CAUTIOUS**                                  |
| MapView        | No   | 20/20           | **HIGH-CHURN-BE-CAUTIOUS** (high style/Leaflet risk)        |
| Placeholder2D  | No   | 14/20           | **SAFE-TO-TOUCH**                                           |
| Header         | No   | 20/20           | **HIGH-CHURN-BE-CAUTIOUS** (highest ROI, safe mechanically) |

**Rule from the brief:** if a component had appeared in `git status -uall -- src/components/`, its recommendation would be forced to `DO-NOT-TOUCH (parallel WIP)`. None do today — but the main lane MUST re-run `git status -uall -- src/components/` immediately before executing each extraction, because parallel-session WIP can land between now and Wave 2 and flip a `SAFE`→`DO-NOT-TOUCH`.

---

## 5. Recommended Execution Order

Topic-pure commits, each = (parent edited) + (one or more extracted children). Each needs a journey test alongside (pre-commit hook `scripts/git-hooks/pre-commit` warns when `src/components/*.svelte` is staged without one) OR a `--SkipTestStrategyGapCheck` bypass for a verified pure-internal refactor.

1. **`refactor(header): extract HelpDialog from Header`**
    - Files: `src/components/Header.svelte` + `src/lib/components/header/HelpDialog.svelte` (+ `header.css` addition).
    - Journey test to add/touch: `tests/widget-journey.spec.js` already asserts `#btn-app-help` focus + dialog role (`:451-482`); add a `HelpDialog` open/close/Escape journey assertion. Keep `aria-labelledby/aria-describedby` and `#btn-app-help` ids stable.
    - Invariant: help dialog still opens via `#btn-app-help`, closes on Escape/outside-click, focus returns to trigger.
2. **`refactor(header): extract ModeChipRail from Header`**
    - Files: `Header.svelte` + `src/lib/components/header/ModeChipRail.svelte`.
    - Journey test: extend `widget-journey.spec.js:777,1054,1105` (mode-chip click / roving tabindex). Keep `#mode-chips`, `role="radiogroup"`, `data-mode`, `aria-checked` stable.
    - Invariant: `selectMode(modeId, source)` (`@lib/components/header/mode-nav`) remains the only mode-switch funnel — do not reach `updateUrlState` directly from the new child (`AGENTS.md` "Conventions (header / mode / toast)").
3. **`refactor(journey): extract CompassStepIndicators + CompassHeader + CompassActionButton from JourneyCompass`**
    - Files: `JourneyCompass.svelte` + 3 children under `src/lib/components/journey/`.
    - Journey test: `tests/journey-compass-state-contract.mjs`, `tests/btn-journey-primary-layout.spec.js`, `tests/journey-event-bindings-contract.mjs` must still pass; add a render assertion for step indicators + `#btn-journey-primary`.
    - Invariant: `data-journey-action`, `aria-disabled`, `hidden`, `aria-label` on action buttons identical to current output (`JourneyCompass.svelte:393-440`).
4. **`refactor(search): extract SearchErrorState + SearchEmptyState from SearchResults`**
    - Files: `SearchResults.svelte` + `src/lib/components/search/SearchErrorState.svelte` + `SearchEmptyState.svelte`.
    - Journey test: `tests/search-results-svelte-ownership-contract.mjs`; extend `widget-journey.spec.js:1226-1286` (`#search-results-count` peek label, F7 regression `eb357ac6`). Keep `#search-result-list` `role="listbox"` + `aria-activedescendant` stable.
    - Invariant: error/empty states still emit `SEARCH_CLEARED` / `URL_SYNC_REQUESTED` via existing handlers (`:227`, `:339-344`).
5. **`refactor(ui): extract shared ErrorState + RetryButton, consume in SearchResults + MapView`** (cross-cutting, depends on #4)
    - Files: new `src/lib/components/ErrorState.svelte` + `RetryButton.svelte`; edit `SearchResults.svelte` + `MapView.svelte`.
    - Journey test: `tests/map-flattening-raw-buffer-contract.mjs`, `tests/unit-active/component-MapView.test.ts`; SearchResults ownership contract.
    - Invariant: `friendlyErrorMessage` normalization preserved (`MapView.svelte:27`); retry still calls `activateLeafletMap` (`MapView.svelte:216-243`).
6. **`refactor(placeholder): extract PlaceholderCategoryLegend from Placeholder2D`** (lowest priority)
    - Files: `Placeholder2D.svelte` + `src/lib/components/PlaceholderCategoryLegend.svelte`.
    - Journey test: **coverage gap** — no dedicated Placeholder2D test found (see §6). Add a `placeholder-legend` render journey test before extraction. Keep `data-testid="placeholder-2d"` / `placeholder-cta` stable.
    - Invariant: SVG orb cluster + `enter3d` → `engineReady.signalReady()` untouched (`Placeholder2D.svelte:67-73`).
7. **MapView status/back extraction** — only after #5, lowest priority due to Leaflet/style risk.

---

## 6. Verification Steps

Run after each commit and at Wave 2 end:

- `npm run check:svelte` — Svelte template/type check.
- `npm run check` — full type check.
- `npm run test:unit` — unit suite (incl. `tests/unit-active/component-MapView.test.ts`).
- `npm run audit:a11y` — catches regressions in interactive containers, button `type`, aria-labels, aria-hidden focusable children. **Critical for the Header dialog/chip-rail and SearchResults listbox extractions.**
- `npm run qa:journey:headless` — **REQUIRED** per pre-commit hook whenever `src/components/*.svelte` is staged.

**Journey-test touch-points (from `rg` of `tests/widget-journey.spec.js`):**

| Component      | Covered in `widget-journey.spec.js`? | Evidence                                                                                                                                                                 | Dedicated contract/journey test          |
| -------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| SearchInput    | Yes                                  | `#search-input` fills/focus `:170,315,462,1220`; dedicated `search-input-escape-cancel-journey.spec.js`                                                                  | strong                                   |
| JourneyCompass | Partial (via buttons)                | `#btn-journey-primary` layout `btn-journey-primary-layout.spec.js`; `journey-compass-state-contract.mjs`, `journey-event-bindings-contract.mjs`                          | strong                                   |
| SearchResults  | Yes                                  | `#search-results-count` / `#search-result-list` `:1226-1286`; F7 regression `:1171`; `search-results-svelte-ownership-contract.mjs`                                      | strong                                   |
| MapView        | No direct widget-journey ref         | only unit + contract: `unit-active/component-MapView.test.ts`, `map-flattening-raw-buffer-contract.mjs`                                                                  | **gap: no headless journey coverage**    |
| Placeholder2D  | No                                   | only a comment at `:734`; **no dedicated test found**                                                                                                                    | **COVERAGE GAP — add before extraction** |
| Header         | Yes                                  | `#mode-chips` `:777,1054,1105`; `#search-input` focus `:462-498`; `mobile-chip-aaa.spec.js`, `focus-pocket-state-owner-contract.mjs`, `live-semantic-roles-contract.mjs` | strong                                   |

**Pre-execution coverage gaps to close:** MapView and Placeholder2D have no `widget-journey.spec.js` coverage. Before extracting them (steps 5/6/7), add minimal headless journey assertions (map error→retry; placeholder legend + CTA) so the pre-commit journey-test requirement is satisfiable and regressions are caught.

---

PLAN SAVED TO: tmp/wave1-plans/big-components-cleanup-plan.md
