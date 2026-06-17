# W21 Svelte Component Audit — 2026-06-17

**Author:** main-lane audit
**Status:** investigation complete, no source changes
**Scope:** src/components/ (26 components)
**Purpose:** Feed Wave 22 hardening charter

---

## 1. Inventory

- **Total components:** 26 (AGENTS.md lists 21; 5 added since last sync: DevGui, FocusPocketA11y, MapView, SpectorInspector, Toast)
- **Total lines:** 8,234
- **Component lines (sorted, largest first):**
  - JourneyChrome.svelte: 913L
  - InfoPanel.svelte: 828L
  - SearchResults.svelte: 700L
  - LegacyCompassSurface.svelte: 629L
  - FocusCard.svelte: 531L
  - SearchInput.svelte: 448L
  - Header.svelte: 414L
  - MapView.svelte: 365L
  - SpectorInspector.svelte: 355L
  - Filters.svelte: 281L
  - ThreadInspector.svelte: 282L
  - Legend.svelte: 271L
  - FocusPocketA11y.svelte: 208L
  - CompassRail.svelte: 206L
  - LoadingOverlay.svelte: 214L
  - DevGui.svelte: 198L
  - WeatherWidget.svelte: 186L
  - MapSummary.svelte: 170L
  - DemoChoreography.svelte: 169L
  - ModeChips.svelte: 161L
  - SemanticOverlay.svelte: 148L
  - Controls.svelte: 146L
  - Canvas.svelte: 143L
  - SearchBar.svelte: 98L
  - Toast.svelte: ~100L
  - FocusPocket.svelte: ~182L

- **Type safety:** 26/26 use Svelte 5 `$props()` — zero Svelte 4 `export let`
- **Props interfaces:** 23/26 have typed `interface Props`; 3 missing (FocusPocketA11y, MapView, Toast)
- **aria-\* attributes:** 178 total across 25 components (1 has zero: DevGui)
- **role= attributes:** 37 total across 18 components
- **Keyboard handlers (onkeydown):** 9 components (SearchInput, SearchResults, Header, Legend, JourneyChrome, FocusPocketA11y, + 3 inline Enter/Space handlers)
- **Component unit tests:** 0 — no dedicated test file for any component
- **TODO/FIXME:** 0 markers in components
- **Existing a11y tests:** `aria-sync-contract.mjs` (dataset→ARIA sync), `keyboard-help-aria-contract.mjs` (keyboard help panel focus trap)

---

## 2. Component Quality Matrix

| Component | Lines | Props Type | A11y (aria) | role= | Keyboard | Error State | Loading State | Priority |
|-----------|-------|------------|-------------|-------|----------|-------------|---------------|----------|
| JourneyChrome.svelte | 913 | Svelte 5 | 15 | 8 | Yes (4 handlers) | No | No | HIGH |
| InfoPanel.svelte | 828 | Svelte 5 | 6 | 0 | No | Partial (empty) | No | HIGH |
| SearchResults.svelte | 700 | Svelte 5 | 26 | 6 | Yes (1) | Yes (error+empty+retry) | Yes (spinner) | MEDIUM |
| LegacyCompassSurface.svelte | 629 | Svelte 5 | 32 | 0 | No | No | No | MEDIUM |
| FocusCard.svelte | 531 | Svelte 5 | 7 | 0 | **No** | Partial (empty only) | **No** | **HIGH** |
| SearchInput.svelte | 448 | Svelte 5 | 11 | 1 | Yes (1) | Yes (status) | Yes (spinner) | MEDIUM |
| Header.svelte | 414 | Svelte 5 | 9 | 2 | Yes (1 radiogroup) | No | No | MEDIUM |
| MapView.svelte | 365 | Svelte 5 | 6 | 1 | No | Yes (error+retry) | Yes (loading) | LOW |
| SpectorInspector.svelte | 355 | Svelte 5 | 2 | 0 | No | Yes (load phases) | Yes (loading) | LOW (dev-only) |
| ThreadInspector.svelte | 282 | Svelte 5 | 4 | 1 | No | No | No | MEDIUM |
| Filters.svelte | 281 | Svelte 5 | 4 | 0 | No | No | No | MEDIUM |
| Legend.svelte | 271 | Svelte 5 | 4 | 1 | Yes (1) | No | No | LOW |
| LoadingOverlay.svelte | 214 | Svelte 5 | 5 | 1 | No | N/A (IS the loading) | N/A | LOW |
| FocusPocketA11y.svelte | 208 | **No Props** | 9 | 7 | Yes (1) | No | No | MEDIUM |
| CompassRail.svelte | 206 | Svelte 5 | 3 | 1 | No | No | No | LOW |
| DevGui.svelte | 198 | Svelte 5 | **0** | 0 | No | No | No | LOW (dev-only) |
| WeatherWidget.svelte | 186 | Svelte 5 | 2 | 0 | No | Silent degrade | No | LOW |
| MapSummary.svelte | 170 | Svelte 5 | 2 | 1 | No | No | No | LOW |
| DemoChoreography.svelte | 169 | Svelte 5 | 3 | 0 | No | No | No | LOW |
| ModeChips.svelte | 161 | Svelte 5 | 5 | 2 | No | No | No | LOW |
| SemanticOverlay.svelte | 148 | Svelte 5 | 4 | 1 | No | No | No | LOW |
| Controls.svelte | 146 | Svelte 5 | 12 | 1 | No | No | No | LOW |
| Canvas.svelte | 143 | Svelte 5 | 3 | 1 | No | No | No | LOW |
| FocusPocket.svelte | ~182 | Svelte 5 | 1 | 0 | No | No | No | LOW |
| Toast.svelte | ~100 | **No Props** | 2 | 1 | No | N/A | N/A | LOW |
| SearchBar.svelte | 98 | Svelte 5 | 1 | 1 | No | No | No | LOW |

---

## 3. Top 5 Components to Harden (ranked by priority)

### 1. FocusCard.svelte — HIGH

**File:** src/components/FocusCard.svelte (531 lines)
**Role:** Primary user-facing business detail card. Shown when user clicks a node in the 3D field.

**Current state:**

- Type safety: Svelte 5 `$props()` with `interface Props` ✓
- Accessibility: 7 `aria-*` attributes (aria-label, aria-live, aria-hidden), 0 `role=` attributes
- Keyboard: **ZERO keyboard handlers** — no onkeydown, no keyboard navigation between card fields
- Error states: Has empty state ("Select a node"), but no handling for failed data resolution, corrupt index, or out-of-bounds focused index
- Loading states: **None** — no spinner/skeleton while business record resolves from store/body attrs
- Tests: **No dedicated component test**

**Hardening tasks:**

1. Add `role="article"` or `role="region"` to the card wrapper with `aria-labelledby` pointing to the business name heading
2. Add keyboard navigation between card sections (name → status → address → contact links) using arrow keys
3. Add a loading/skeleton state while `selectedRecord` resolves from the multi-source fallback chain (lines 157-176)
4. Add error boundary for corrupt/out-of-bounds `currentFocusedIdx` (currently silently returns null)
5. Add `aria-describedby` linking status badges to their visual indicators
6. Ensure contact links (website, email, phone) have proper `aria-label` and open in new tab with `rel="noopener"`
7. Write component unit test covering: empty state, search-selected state, field-focused state, corrupt index handling

**Effort:** M (2-3 hours)
**Example gap:** FocusCard has 531 lines but zero keyboard handlers — a keyboard-only user cannot interact with the card at all.

---

### 2. InfoPanel.svelte — HIGH

**File:** src/components/InfoPanel.svelte (828 lines)
**Role:** Main information panel. Surfaces: idle, search, focus, discovery. The largest Svelte component.

**Current state:**

- Type safety: Svelte 5 `$props()` with `interface Props` ✓
- Accessibility: 6 `aria-*` attributes (aria-hidden, aria-label, aria-live), **0 `role=` attributes**
- Keyboard: **No keyboard handlers** — panel content not keyboard-navigable
- Error states: Has empty state per surface, but no error boundary for MutationObserver failures or store initialization race
- Loading states: **None** — no skeleton while surface/selection resolves
- Tests: Has contract tests (`info-panel-collapsed-render-contract.mjs`, `info-panel-surface-ownership-contract.mjs`) but no component unit test

**Hardening tasks:**

1. Add `role="complementary"` to the panel wrapper (it already has `aria-label` but no role)
2. Add keyboard navigation for panel content sections (tab through business details, contact links, status badges)
3. Add loading skeleton while `effectiveSurface` and `selectedRecord` resolve
4. Add error boundary around the MutationObserver (lines 86-93) — if body attrs are missing, panel should degrade gracefully
5. Add `aria-current="page"` or equivalent to indicate which surface section is active
6. Write component unit test covering: all 4 surfaces (idle/search/focus/discovery), empty state, populated state

**Effort:** M (2-3 hours)
**Example gap:** 828 lines, 0 `role=` attributes — the panel is a `complementary` landmark by convention but never declares it.

---

### 3. JourneyChrome.svelte — HIGH

**File:** src/components/JourneyChrome.svelte (913 lines)
**Role:** Journey navigation chrome — compass header, breadcrumb trail, neighbor rail, walk controls.

**Current state:**

- Type safety: Svelte 5 `$props()` with `interface Props` ✓
- Accessibility: 15 `aria-*` attributes, 8 `role=` attributes — **best in class**
- Keyboard: 4 `onkeydown` handlers (walk, inspect, pin, surface stop) — good coverage
- Error states: **None** — no handling for empty candidate list, failed trail load, or invalid step index
- Loading states: **None** — no skeleton while candidates/trail resolve
- Tests: Has contract tests but no component unit test

**Hardening tasks:**

1. Add loading state while `filteredCandidates` and trail data resolve
2. Add empty state when no candidates are available ("No nearby businesses to explore")
3. Add error handling for invalid `stepIndex` in breadcrumb (currently could render undefined step names)
4. Add `aria-busy="true"` to neighbor rail while candidates load
5. Verify focus management when walking to a neighbor (focus should move to the new FocusCard)
6. Write component unit test covering: breadcrumb rendering, neighbor rail with/without candidates, trail toggle, walk/inspect/pin actions

**Effort:** S (1-2 hours — already well-accessible, needs error/loading polish)
**Note:** This is the most accessible component in the set. The work here is error/loading states, not ARIA fundamentals.

---

### 4. Filters.svelte — MEDIUM

**File:** src/components/Filters.svelte (281 lines)
**Role:** Status/signal/city filter chips with reset.

**Current state:**

- Type safety: Svelte 5 `$props()` with `interface Props` ✓
- Accessibility: 4 `aria-*` attributes (aria-label, aria-pressed), 0 `role=` attributes
- Keyboard: **No keyboard handlers** — filter chips not keyboard-navigable
- Error states: None (filters are derived from static data, unlikely to fail)
- Loading states: None (not needed — filters are synchronous)
- Tests: Has contract test (`filter-ownership-contract.mjs`) but no component unit test

**Hardening tasks:**

1. Add `role="group"` or `role="toolbar"` to the filter container
2. Add keyboard navigation between filter chips (arrow keys within group, Tab to move between status/signal/city groups)
3. Add `aria-pressed` toggle feedback with live region announcing filter count changes
4. Add keyboard shortcut to clear all filters (Escape within the filter group)
5. Write component unit test covering: filter toggle, clear all, count badge updates

**Effort:** S (1 hour)
**Example gap:** Filter chips have `aria-pressed` but no `role="checkbox"` or `role="button"` and no keyboard navigation between them.

---

### 5. SearchInput.svelte — MEDIUM

**File:** src/components/SearchInput.svelte (448 lines)
**Role:** Search input with debounce, clear, keyboard shortcut, status announcements.

**Current state:**

- Type safety: Svelte 5 `$props()` with `interface Props` ✓
- Accessibility: 11 `aria-*` attributes, 1 `role=` — good baseline
- Keyboard: 1 `onkeydown` handler — handles slash shortcut, Escape, Enter
- Error states: Has status indicator with aria-live
- Loading states: Has spinner with aria-hidden toggle
- Tests: No dedicated component test

**Hardening tasks:**

1. Add `role="searchbox"` to the input element (currently just `aria-label="Search businesses"`)
2. Add `aria-autocomplete="list"` when results are available
3. Add `aria-expanded` to indicate whether results dropdown is open
4. Verify the slash shortcut (`/`) doesn't interfere with browser find-in-page (Ctrl+F)
5. Add loading state announcement via `aria-busy` on the input during search
6. Write component unit test covering: debounce timing, clear behavior, keyboard shortcut, status announcements

**Effort:** S (1 hour)
**Note:** SearchInput is already well-structured. The main gap is searchbox role and aria-expanded for the results association.

---

## 4. Cross-Cutting Findings

### 4.1 Keyboard Navigation Gap

**9 of 26 components** have any keyboard handler at all. The remaining 17 rely on implicit click behavior. For a 3D visualization app where keyboard users may not be able to interact with the WebGL canvas, the DOM UI panels are the primary accessible surface — and most lack keyboard navigation.

**Affected high-traffic surfaces:**

- FocusCard: 0 keyboard handlers (531 lines)
- InfoPanel: 0 keyboard handlers (828 lines)
- Filters: 0 keyboard handlers (281 lines)
- Controls: 0 keyboard handlers (146 lines)
- LegacyCompassSurface: 0 keyboard handlers (629 lines)

### 4.2 Role Attribute Gap

**8 components** have zero `role=` attributes despite being semantic landmarks or interactive widgets:

- InfoPanel (complementary landmark)
- FocusCard (article/region)
- FocusPocket (list)
- Filters (group/toolbar)
- LegacyCompassSurface (navigation)
- SpectorInspector (dev-only, acceptable)
- DemoChoreography (status)
- WeatherWidget (complementary)

### 4.3 Test Coverage Void

**Zero component-level unit tests exist.** The test suite has 170+ contract/integration tests but none that import and render individual Svelte components. This means:

- No regression protection for component prop changes
- No verification of ARIA attribute correctness in isolation
- No keyboard interaction testing at the component level
- Contract tests verify DOM IDs and body attributes, not component behavior

### 4.4 AGENTS.md Component Count Drift

AGENTS.md lists 21 components. Actual count is 26. Five components were added since the last documentation sync:

- `DevGui.svelte` (dev-only lil-gui panel)
- `FocusPocketA11y.svelte` (keyboard/screen-reader shadow list)
- `MapView.svelte` (Leaflet map chrome)
- `SpectorInspector.svelte` (dev-only WebGL inspector)
- `Toast.svelte` (transient notification)

### 4.5 Error State Coverage

Only 4 of 26 components have meaningful error handling:

- SearchResults: Full error state with retry/dismiss ✓
- MapView: Loading/error/retry lifecycle ✓
- SpectorInspector: Load phase tracking (dev-only) ✓
- SearchInput: Status indicator ✓

The remaining 22 components either silently degrade or have no error handling at all.

### 4.6 Loading State Coverage

Only 3 of 26 components have loading indicators:

- SearchResults: Spinner + "Searching..." text ✓
- MapView: Loading status with retry ✓
- LoadingOverlay: IS the loading indicator ✓

All other data-fetching or state-resolving components have no loading UX.

---

## 5. Recommended Wave 22 Work

Ranked by impact × effort ratio:

1. **FocusCard keyboard + loading** (HIGH, S-M) — Highest-impact gap. A 531-line user-facing card with zero keyboard navigation and no loading state. Keyboard users cannot interact with business details at all.

2. **InfoPanel role + loading** (HIGH, M) — 828 lines, zero `role=` attributes. The panel is the primary information surface but doesn't declare itself as a landmark. Add `role="complementary"` and loading skeleton.

3. **Filters keyboard nav** (MEDIUM, S) — Quick win. Add `role="group"`, arrow-key navigation between chips, and live region for filter count changes. ~1 hour.

4. **SearchInput aria-expanded** (MEDIUM, S) — Quick win. Add `role="searchbox"`, `aria-autocomplete="list"`, and `aria-expanded` to connect input to results. ~1 hour.

5. **Component test foundation** (HIGH, L) — Write the first 3-5 component unit tests (FocusCard, InfoPanel, SearchInput, Filters, SearchResults) to establish the testing pattern. This is the highest-leverage investment for long-term quality.

---

## 6. Open Questions

1. **Should keyboard navigation in FocusCard/InfoPanel follow a roving tabindex pattern (like Header's radiogroup) or a simple Tab sequence?** The Header component already implements roving tabindex for mode chips — should this pattern be standardized across all interactive panels?

2. **Is there a screen reader testing plan?** The codebase has ARIA attributes but no evidence of screen reader testing (NVDA, VoiceOver, JAWS). Should Wave 22 include manual screen reader QA?

3. **Should the 5 new components (DevGui, FocusPocketA11y, MapView, SpectorInspector, Toast) be added to AGENTS.md?** The scaffold status table is stale.

4. **Component test framework:** The project uses Vitest for unit tests and Playwright for contract tests. Should component tests use `@testing-library/svelte` + Vitest, or Playwright component testing?

5. **FocusCard loading state source:** The component resolves `selectedRecord` from 3 sources (Svelte store, body attrs, legacy `__APP_STATE__`). Should the loading state gate on all 3 being evaluated, or show content as soon as any source resolves?

---

## Appendix: Keyboard Handler Inventory

| Component | Handler | Pattern | Notes |
|-----------|---------|---------|-------|
| SearchInput.svelte | `onkeydown={handleKeydown}` | Slash, Escape, Enter | Full keyboard search UX |
| SearchResults.svelte | `onkeydown={handleContainerKeyDown}` | Arrow keys, Enter, Escape | Roving listbox pattern |
| Header.svelte | `onkeydown={handleModeKeydown}` | Arrow keys, Home/End, Ctrl+1-6 | Roving tabindex radiogroup |
| Legend.svelte | `onkeydown={handleLegendKeydown}` | Arrow keys, Enter | Roving tabindex group |
| JourneyChrome.svelte | `onkeydown={stopRailSurfaceEvent}` | Prevents event propagation | Surface event guard |
| JourneyChrome.svelte | inline Enter/Space handlers (×3) | Walk, inspect, pin | Button-role neighbors |
| FocusPocketA11y.svelte | `onkeydown={handleKeydown}` | Enter/Space dispatch | Screen-reader shadow list |
| FocusCard.svelte | **NONE** | — | Critical gap |
| InfoPanel.svelte | **NONE** | — | Critical gap |
| Filters.svelte | **NONE** | — | Gap |
| Controls.svelte | **NONE** | — | Gap |
| LegacyCompassSurface.svelte | **NONE** | — | Gap |

---

*End of audit. No source files were modified.*
