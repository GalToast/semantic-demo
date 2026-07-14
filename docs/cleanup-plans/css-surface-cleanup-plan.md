# Wave 1 — CSS Surface Cleanup Plan

> Read-only investigation. No source edits, no builds, no tests. Every claim cites `file:line`.
> Repo: `/c/Users/HP/repos/semantic-explorer`, branch `master`. Investigated at HEAD `161194f1`; **current HEAD `5222e684`** after a parallel-lane merge of 7 commits. None of the CSS shards cited below were structurally modified by that merge — `5222e684` only touched `css/clusters.css` (7 lines) and `css/layout_base.css` (8 lines) cosmetically. Section cites remain valid.

## 1. Executive Summary (ranked by impact ÷ effort)

1. **7 `mobile_premium__*.css` shards are micro-sliced with documented overlap and one is empty** — `css/mobile_premium__map.css:1` is a 1-line stub, and the cascade header itself records that the 7-way split was _already collapsed on 2026-06-02 "because the chrome/state/surfaces files all targeted 6-8 of the same data-panel-surface values with overlapping concerns"_ (`css/mobile_premium__focus-dive.css:3-5`). Merge 7→3.
2. **Cross-file selector duplication across shards** — e.g. `body.surface-idle .info-panel` is styled in **4** shards (chrome+state+surfaces+narrow), and `.focus-stage-card` for `body.surface-semantic-dive` has **9** separate rule blocks inside `focus-dive.css` alone. De-dup during the merge.
3. **Fragmented breakpoint taxonomy** — mobile rules are gated at 360 (`mobile_premium__narrow.css:8`), 480 (`mobile_premium__focus-dive.css:306`), 640 (`mobile_premium__state.css:4`), 768 (`mobile_premium__chrome.css:3`, `:27`, `mobile_premium__surfaces.css:14`, `mobile_premium__idle.css:5`), and 900 landscape (`mobile_premium__chrome.css:777`, `mobile_premium__idle.css:39`). Consolidating collapses these into a single coherent tier set.
4. **Stale authority docs are archived with no live replacement** — `docs/archive/semantic-demo-css-authority-map.md` and `docs/archive/semantic-demo-mobile-state-ownership.md` were moved to `docs/archive/` by `7d240eb7` (whose body says "docs/ root now contains only: current charter, bundle audit, active bugs, accessibility baseline, and test-referenced architecture docs"), but `AGENTS.md:86` still points at the archived paths. Restore a live `docs/css-ownership.md`.
5. **Near-dead global files** — `css/demo_ui.css` is 12 lines, mostly a dead-code comment (`css/demo_ui.css:1-12`); its one live rule is a single `body[data-demo-active='true'] .view-toggle { display:none }`. Candidate for inlining into the demo flow or deletion.

## 2. CSS Inventory

Total: **17,855 lines across 25 files** (24 root + `css/modules/focus_stage.css`). Source: `find css -name '*.css' | xargs wc -l`.

Load order (injection via `transformIndexHtml`): `vite.config.ts:65-74` — `semantic-demo.css`, `vector-explorer-pandora.css`, then 7 shards in this order: `focus-dive → chrome → state → idle → map → surfaces → narrow`, then `css/modules/focus_stage.css`. **There is no `@import` chain in `css/` at all** (verified: `grep -rn "@import" css/` returns nothing) — the "cascade" is purely `<link>` injection order in `vite.config.ts`.

| File                                 | LOC  | Owns                                                                                                       |
| ------------------------------------ | ---- | ---------------------------------------------------------------------------------------------------------- |
| `css/mobile_premium__focus-dive.css` | 2107 | FOCUS/DIVE states; journey-compass focus geometry; focus-stage-card; contains the cascade header (`:1-25`) |
| `css/search.css`                     | 1822 | Search chrome, results, filters, `.rail-section` (desktop+global)                                          |
| `css/mobile_premium__surfaces.css`   | 1512 | Panel-specific surface rules (info-panel, selected-details, view-toggle in idle)                           |
| `css/strands.css`                    | 1421 | Strand/thread visuals, compass geometry, canvas                                                            |
| `css/layout_base.css`                | 1292 | Core desktop layout; references shard interplay (`css/layout_base.css:243`, `:389-390`)                    |
| `css/modules/focus_stage.css`        | 1290 | Focus-stage visibility/positioning; loaded last via `<link>` (`css/modules/focus_stage.css:5`)             |
| `css/progressive_disclosure.css`     | 1061 | Disclosure/rail expansions; references `surfaces.css` (`:790`)                                             |
| `css/mobile_premium__chrome.css`     | 961  | Chrome/furniture across states (≤768px + 900 landscape)                                                    |
| `css/journey_steps.css`              | 916  | Journey step UI                                                                                            |
| `css/mobile_premium__state.css`      | 859  | State-machine styles (≤640px + 641-768px)                                                                  |
| `css/shell.css`                      | 759  | App shell                                                                                                  |
| `css/journey_active.css`             | 668  | Active journey state                                                                                       |
| `css/mobile_base.css`                | 566  | Base mobile layout                                                                                         |
| `css/controls.css`                   | 451  | Control widgets                                                                                            |
| `css/time_weather.css`               | 441  | Weather/time widget                                                                                        |
| `css/clusters.css`                   | 401  | Cluster visuals                                                                                            |
| `css/loading.css`                    | 350  | Loading overlay                                                                                            |
| `css/base.css`                       | 285  | Root base                                                                                                  |
| `css/mobile_premium__narrow.css`     | 253  | ≤360px narrow viewport tightening                                                                          |
| `css/synthesis.css`                  | 196  | Synthesis panel                                                                                            |
| `css/animations.css`                 | 129  | Keyframes                                                                                                  |
| `css/mobile_premium__idle.css`       | 102  | Idle surface rules (≤768px)                                                                                |
| `css/demo_ui.css`                    | 12   | **Near-dead** — 1 live rule, rest dead-code comment                                                        |
| `css/mobile_premium__map.css`        | 1    | **EMPTY** — only the cascade-header comment (`css/mobile_premium__map.css:1`)                              |

**Flagged:**

- **Empty/dead:** `mobile_premium__map.css` (1 line), `demo_ui.css` (12 lines, mostly comment).
- **Overlapping selectors (same selector in >1 file):**
    - `body.surface-idle .info-panel` — `chrome` (1) + `state` (2) + `surfaces` (1) + `narrow` (1). Verified per-file counts.
    - `body.surface-semantic-dive .view-toggle` — `chrome` (1) + `narrow` (2).
    - `body.surface-semantic-dive .focus-stage-card` — 9 blocks within `focus-dive.css` (intra-file dup).
    - Broad shared _state-prefix_ selectors (`body.surface-idle`, `body.surface-focus`, `.journey-compass`, `#canvas-container`, `.stat-caption`, `.info-header`, `.rail-section`, `.view-toggle`) appear in 8–13 files each — these are state-gated _context_ prefixes, not necessarily duplicate rules; the real duplication is the component-level selectors above.
- **One un-gated rule in `surfaces.css`:** `body:not(.surface-idle) #selected-details.active:not([hidden])` (`css/mobile_premium__surfaces.css:3-5`) has **no `@media`** and applies at all viewports — a desktop-leak risk to verify, not introduced by this plan.

## 3. Mobile Premium Shard Consolidation Assessment

Load order and shard responsibilities (`vite.config.ts:65-74`, headers):

- **`focus-dive`** (2107) — FOCUS/DIVE; holds cascade header. `@media (max-width:768px)` + 480 tier (`:306`).
- **`chrome`** (961) — furniture across states. `@media (max-width:768px)`, `(max-width:900px) and (max-height:430px) landscape` (`:777`).
- **`state`** (859) — state machine. `@media (max-width:640px)`, `(min-width:641px) and (max-width:768px)` (`:804`,`:825`).
- **`idle`** (102) — idle surface. `@media (max-width:768px)` + 900 landscape (`:39`).
- **`map`** (1) — **EMPTY stub**; delete.
- **`surfaces`** (1512) — panel-specific; mostly `@media (max-width:768px)` but with one un-gated rule (`:3-5`).
- **`narrow`** (253) — ≤360px tightening; `(min-width:361px) and (max-width:768px)` block too (`:102`).

**Pairwise mergeability:**

- **chrome vs narrow** — `narrow` is strictly a sub-breakpoint (≤360px) of `chrome`'s ≤768px furniture; `narrow` even has a `361–768px` block (`:102`) that overlaps `chrome`'s main block. **Highly mergeable** → `mobile_premium__layout.css`.
- **state vs surfaces** — `state` is the ≤640px state machine; `surfaces` is panel-specific and mainly ≤768px. They overlap on `body.surface-idle .info-panel` and `body:not(.surface-idle) ... .info-panel`-style rules. **Mergeable** → `mobile_premium__state.css` (rename to surface/state).
- **idle vs chrome** — `idle` is a thin (102 LOC) single-surface slice of `chrome`'s furniture concern; `body.surface-idle .info-panel` already spans both. **Mergeable** into `layout` or `state`; recommend folding into `state` since idle is a surface state.
- **focus-dive** — the component-heavy file (focus-stage-card, journey-compass focus geometry). NOT owned by a single Svelte component via `@import`; it styles `FocusCard.svelte` / `JourneyCompass.svelte` / `SelectedBusinessDetails.svelte` through global selectors. Keep as the **components** file.
- **map** — empty; **delete**, not a merge target.

**Final recommendation: merge 7 → 3 (+ delete `map`):**

1. **`mobile_premium__components.css`** ← `focus-dive` (rename) + `idle` (fold). Owns focus/dive + idle component/surface rules. De-dup `body.surface-idle .info-panel` (was in chrome+state+surfaces+narrow) and the 9 `.focus-stage-card` blocks.
2. **`mobile_premium__state.css`** ← `state` + `surfaces` (fold). Owns surface/panel state machine. De-dup the `info-panel`/`.view-toggle` cross-references; resolve the un-gated `surfaces.css:3-5` rule (add explicit `@media (max-width:768px)` or confirm intent).
3. **`mobile_premium__layout.css`** ← `chrome` + `narrow` (fold). Owns chrome/furniture + narrow breakpoint. Collapses 360/768/900 tiers.

`map.css` deleted. Update `vite.config.ts:65-74` link list and the cascade-header comment in the renamed container (`focus-dive.css:1-25`) which references "7 files." Re-point the cross-file comment references in `journey_active.css:47`, `mobile_premium__idle.css:24`, `mobile_premium__narrow.css:155`, `search.css:54`, `strands.css:815`, `:619`, `layout_base.css:243`,`:389-390`, `progressive_disclosure.css:790`.

## 4. Component CSS Extraction Candidates

**Finding contradicts the prompt's assumption:** inline CSS ownership is _already the norm_. Of 40 `src/**/*.svelte` files, **36 have a `<style>` block**; only **4 lack one**: `src/components/AppBoot.svelte`, `src/components/DevToolsMount.svelte`, `src/components/SearchResultItem.svelte`, `src/components/WalkBreadcrumb.svelte` — all minor/no-UI shell components. Only **2** use the Header `@import` pattern: `src/components/Header.svelte:486` (`@import '@lib/components/header/header.css'`) and `src/components/ProximityLegend.svelte:171` (`@import '@lib/css/z-layers.css'`).

No high-ROI _extract-global-into-component_ candidates exist. The reverse is the real opportunity (see §3): large global files (`search.css` 1822, `strands.css` 1421) style search/focus components (`SearchBar.svelte`, `SearchResults.svelte`, `FocusCard.svelte`, `InfoPanel.svelte`, `JourneyCompass.svelte`), but they are desktop+global and shared by 8–13 files per selector — pulling them inline would force re-extraction of every dependent component. **Recommendation: do NOT pursue component extraction this wave; consolidate the mobile shards instead.** If any extraction is done later, `demo_ui.css`'s single live rule (`body[data-demo-active='true'] .view-toggle`) is the only safe, dependency-free inline candidate.

## 5. Authority Doc Recommendation

**Recommendation: replace** the two archived docs with a new live `docs/css-ownership.md` (do not simply move them back out of `docs/archive/`). Rationale: `7d240eb7`'s body explicitly scoped `docs/` root to "current charter, bundle audit, active bugs, accessibility baseline, and test-referenced architecture docs" — CSS ownership is none of those, so the archive move was intentional, not accidental. Restoring the old maps verbatim would re-add stale 7-file-split charts that this plan proposes to undo.

**Target outline for `docs/css-ownership.md`:**

1. Load mechanism — `<link>` injection order in `vite.config.ts:65-74`; no `@import` chain (cite grep result).
2. Module ownership table — every `css/*.css` file → surface/component it owns (build from §2 inventory).
3. Mobile shard map — current 3-file target (`components`/`state`/`layout`) post-merge, with breakpoint tiers (360/480/640/768/900).
4. Component-owned CSS convention — Header/ProximityLegend `@import` pattern (`Header.svelte:486`, `ProximityLegend.svelte:171`); inline `<style>` is the default (36/40 components).
5. Body-class / `data-panel-surface` state taxonomy (idle/search/focus/semantic-dive/map) and which file gates each.
6. Change protocol — how to add a new state/breakpoint without re-splintering.

**AGENTS.md pointer change:** `AGENTS.md:86` currently reads `CSS ownership: docs/archive/semantic-demo-css-authority-map.md, docs/archive/semantic-demo-mobile-state-ownership.md`. Replace with `CSS ownership: docs/css-ownership.md`. Leave the generic "If a referenced doc is missing…" fallback sentence intact.

## 6. Verification Steps

Run by main lane (NOT by this subagent):

- `npm run build:svelte` — CSS bundling/link injection check (`package.json:129`, `vite build --config vite.config.ts`). Confirms `vite.config.ts:65-74` link edits resolve.
- `npm run qa:surface:mobile-idle` — primary surface the shards style.
- `npm run qa:surface:all` — full surface regression.
- `npm run test:contract` — includes CSS-touching contract tests: `tests/unit-active/css-important-invariant.test.ts` (merges must not alter `!important` counts), `tests/unit-active/component-SelectedBusinessDetails.test.ts`, `tests/unit-active/legend-display-none-offscreen.test.ts`, `tests/shell-contract-check.js`, `tests/cache-buster-check.js` (link injection order), `tests/sd143-map-search-visual.spec.js`.
- `node tests/visual-state-audit.mjs` — captures surfaces incl. `01-mobile-idle`, `07-desktop-idle`, `16-desktop-info-panel-populated`, `18-mobile-loading-overlay`, `19-mobile-compass-rail`, `20-mobile-mode-grid-visible`, `04-mobile-field-node-active`, search-error, map-trail-strip, focus-thread-inspector (`tests/visual-state-audit.mjs:79,82,650,654,658,666,676,734-805,926-961`). Verify no desktop leak from the un-gated `surfaces.css:3-5` rule after merge.

## 7. Recommended Execution Order

1. `docs: add docs/css-ownership.md; repoint AGENTS.md:86` (pure doc, no CSS risk).
2. `css: delete empty mobile_premium__map.css; remove its link in vite.config.ts:71`.
3. `css: merge chrome+narrow → mobile_premium__layout.css` (update `vite.config.ts:68,73`).
4. `css: merge state+surfaces → mobile_premium__state.css` (update `vite.config.ts:69,72`; gate `surfaces.css:3-5`).
5. `css: fold idle into components file; rename focus-dive → mobile_premium__components.css` (update `vite.config.ts:67,70`); de-dup `info-panel` + `.focus-stage-card`.
6. `docs: refresh vite.config.ts comment + cross-file shard references` listed in §3.

PLAN SAVED TO: tmp/wave1-plans/css-surface-cleanup-plan.md
