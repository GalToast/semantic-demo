# Walkthrough R7 Triage

Source findings: `walkthrough-r7-findings.md`  
Triage started: 2026-06-11

## P0 — core trust blockers

| # | Finding | Triage owner/seam | Current leading suspects | Next check |
|---|---|---|---|---|
| 1 | Search relevance broken: `coffee` returns unrelated business | Search pipeline / data scoring | `src/lib/search-engine.ts`, `src/components/SearchResults.svelte`, backend `api.php?action=semantic_search` | **Resolved in R7 triage pass:** live PHP backend returned 34 coffee-relevant results for `coffee`; frontend was remapping service-backed rows as local-record array indexes. Fixed by carrying service-backed display/focus data in `SearchResult.point`; verified rendered results show coffee businesses. Also fixed search-surface restoration so URL/search-family restores set the nav surface to `search`, and search chrome is rendered inside `#info-panel` via the app-owned snippet. |
| 2 | Ghost bar chart on idle/info card | Info card render / CSS ownership | `src/components/InfoPanel.svelte`, `js/modules/focus-stage-renderer.ts`, `css/clusters.css`, legacy shell duplicate panels | **Resolved in R7 triage pass:** bars were legacy journey-compass step spans; `LegacyCompassSurface.svelte` now labels the steps and `FocusCard` is gated by `focusActive`. Verified idle DOM counts: one `#info-panel`, one `#selected-card`, one `#journey-compass`. |

## P1 — major layout regressions

| # | Finding | Triage owner/seam | Current leading suspects | Next check |
|---|---|---|---|---|
| 3 | Persistent bottom × / unclear Pulling back state | Demo / journey chrome | `src/components/DemoChoreography.svelte`, `js/modules/micro-demo.ts`, `journey-focus-ui.ts` | Inspect DOM id/class and click handler. |
| 4 | Duplicate info panels on idle | Shell parity / legacy vs Svelte | `src/App.svelte`, legacy `index.html` / `dist/svelte/index.html`, `InfoPanel.svelte`, `LegacyCompassSurface.svelte` | **Resolved in R7 triage pass:** duplicate selected-card surface removed by gating `FocusCard` to `focusActive`; verified one `#selected-card` on idle. |
| 5 | Journey compass bleeds into category legend | Journey chrome / legend z-index | `src/components/CompassRail.svelte`, `Legend.svelte`, `LegacyCompassSurface.svelte`, `css/mobile_premium__*.css` | **Partially resolved / not reproduced on desktop after fix:** no horizontal overlap between `#journey-compass` and `#legend-panel`; remaining concern is the duplicate/empty-step rendering and narrow legend visibility. |
| 6 | Empty Business Details panel hogs mobile/tablet | Info panel responsive layout | `InfoPanel.svelte`, `css/clusters.css`, mobile premium modules | **Resolved in R7 triage pass:** idle panel now closes/hides via `infoPanelOpen` in `App.svelte` and `hidden={!panelOpen}` in `InfoPanel.svelte`; verified idle `#info-panel` is `hidden=true` with `0×0` geometry on desktop/tablet/mobile. Updated `mobile-idle` contract to treat hidden idle chrome as valid. |

## P2 — user-facing leaks and responsive gaps

| # | Finding | Triage owner/seam | Current leading suspects | Next check |
|---|---|---|---|---|
| 7 | Debug/status text visible | Search UI copy | `src/components/SearchInput.svelte`, `src/components/SearchResults.svelte`, `js/modules/search-results-ui.ts`, semantic guide UI | **Resolved in R7 triage pass:** stale "No matching businesses found." status no longer shows when results are present; `#search-status` and `#search-spinner` stay mounted but are hidden after results settle; internal ranking labels were converted to user-facing copy (`Top match`, `Match N`, `Strong match`). |
| 8 | Internal ranking labels visible | Search result renderer | `src/components/SearchResults.svelte`, `search-result-renderer.ts`, `search-results-ui.ts` | **Resolved in Svelte track:** ranking labels now read as `Top match`, `Match N`, and `Strong match`; legacy renderer still needs a parity sweep if the old shell is used. |
| 9 | Single-letter nav labels | Header / nav accessibility | `Header.svelte`, `ModeChips.svelte`, CSS | Add labels/tooltips or larger tap targets. |
| 10 | Category legend hidden on mobile/tablet | Legend responsive behavior | `Legend.svelte`, legend CSS | Add toggle or compact reveal. |
| 11 | Map card overlaps map | Map summary layout | `MapSummary.svelte`, map CSS | Reduce footprint / reposition. |
| 12 | Truncated count text | Header / count formatting | `Header.svelte`, map summary copy | Add wrapping/shorter copy. |
| 13 | Weather widget unexplained | Weather widget | `WeatherWidget.svelte` | Add tooltip/copy. |

## P3 — polish / debt

| # | Finding | Triage owner/seam |
|---|---|---|
| 14 | Map abstraction explanation | MapSummary / onboarding |
| 15 | Close legend icon unclear | Legend / Header |
| 16 | No onboarding / first-run guidance | Onboarding / micro-demo |
| 17 | Console warnings from `state.scenePerformanceDiagnostics.*` | State mutation hygiene |

## Immediate working hypothesis

- Start with **#2 ghost bars** because it is visible across every state and likely has a small render/CSS seam.
- Run **#1 search relevance** in parallel if a worker is available; it may involve backend/API semantics rather than only frontend.
- Treat duplicate panels and compass bleed as one **surface composition** slice after ghost bars are understood.
