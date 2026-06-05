# CSS Archaeology Cleanup Roadmap

**Status: ARCHIVED — Superseded ×3.**

1. Superseded by 2026-06-02 mobile premium collapse into `css/mobile_premium.css`.
2. Superseded again by 2026-06-03 un-collapse into the 7-file `css/mobile_premium__*.css` split.
3. **Superseded by 2026-06-04 audit — ALL `!important` declarations have been removed from the cascade.** Every action item in this roadmap references `!important` in `mobile_premium_surfaces.css` (lines 188, 268, 488, etc.) or describes conflicts based on `!important` load-bearing patterns. These no longer exist.

**Do not follow this document for current work.** Use `docs/semantic-demo-css-ownership-map.md` (2026-06-04 update) which contains current selector counts, current file ownership, and zero `!important` references. This document is preserved for historical context only; any specific line numbers, file names, or selector conflicts below are stale.

Key items now moot:
- Priority 1A (info-panel state variants in strands.css): resolved by subsequent cascade evolution
- Priority 1B (focus-stage/focus-stage-card base dedup): no longer actionable; focus_stage.css is tail-loaded
- Priority 2D (journey-compass harmonization): selector counts have dropped significantly since this was written
- Priority 2E (polish208 consolidation): polish208 selector in journey_active.css removed
- All `!important` debt (Priority 3+): **zero `!important` remain anywhere in the CSS cascade**

What remains useful: the polish### task registry table idea (Priority 1C) is still valid but outside the scope of this audit pass.

## Session
- Date: 2026-05-19
- Files audited: `css/` - journey_active.css, progressive_disclosure.css, strands.css, mobile_base.css, mobile_premium*.css (6 files)
- Verification: `npm run check:ownership` PASS ; `npm run check:manifest` PASS

---

> **⚠ STALE BODY SECTION.** All line numbers, file names (e.g., `mobile_premium_focus.css` without `__`), `!important` references, and conflict descriptions below are dead as of 2026-06-04. All `!important` declarations have been removed from the cascade. The `mobile_premium.css` single-file import shell no longer exists. Use `docs/semantic-demo-css-ownership-map.md` for current facts.

## 1. `polish###` Comment Clusters

### journey_active.css - 22 labeled polish comments

| Polish | Lines | Description |
|--------|-------|-------------|
| `polish184` | 153-212 | Mobile focus cockpit hierarchy after field-first search beat |
| `polish174` | 412-836 | Authored journey compass for overview->search->focus->inside |
| `polish195` | 1143-1225 | Compact field-node canopy HUD |
| `polish194` | 1227-1366 | Mobile field-node walk dock |
| `polish205` | 1368-1523 | Live audit follow-up; first mobile impression field-first |
| `polish199` | 1525-1800 | Connect field-node steps into one instrument (keyframes) |
| `polish241` | 1031-1049 | Disabled prev/next button treatment for focus journey |
| `polish242` | 1031-1049 | First-stop focus has no previous target (companion to 241) |
| `polish208` | 1253-1314 | Mobile cockpit thumb targets without expanding field overlay |

**Risk**: polish174, 194, 195, 199, 205 are large multi-breakpoint blocks (300-800 lines each). They all own `.journey-compass` layout variants at the 768px, 900px, 520px, 390px, and 380px breakpoints.

### progressive_disclosure.css - polish/10-10 markers

| Marker | Lines | Description |
|--------|-------|-------------|
| `polish208` | 1252-1314 | Mobile cockpit thumb targets (overlaps journey_active:1253) |
| `10/10 Polish: View Transition Choreography` | 1350-1358 | view-transitioning blur/grayscale |
| `10/10 Polish: Atmospheric Mycelium Vignette` | 1360-1373 | galaxy::after radial vignette |
| `10/10 Polish: Semantic Dive Sonic Boom` | 1375-1405 | transitioning screen-shake + sonic-boom |
| `10/10 Polish: Map Strip Title (SD-013 P3)` | 1407-1431 | .map-strip-title opacity |
| `10/10 Polish: Camera Assist Visibility (SD-013 P1)` | 1433-1437 | camera-assist arriving radial |
| `10/10 Polish: Enhanced Depth Cues` | 1449-1452 | semantic-dive::after |
| `10/10 Polish: Overhauled Search Empty State` | 1467-1567 | .search-empty-state full component |
| `10/10 Polish: Journey Compass Discovery Active` | 1569-1578 | .discovery-active variant |
| `10/10 Polish: Glassmorphism Search Input` | 1580-1594 | .search-input-wrapper focus-within |
| `10/10 Polish: Search Spinner Integration` | 1596-1618 | #search-spinner display:none |
| `10/10 Polish: Search Result Processing Juice` | 1598-1613 | .search-result-item active/processing |
| `10/10 Polish: Unified Mobile Journey Compass` | 1620-1682 | Not(panel-surface^="map-") .journey-compass |

**Risk**: Progressive_disclosure:1620-1682 (`[data-panel-surface]:not([data-panel-surface^="map-"])`) directly overrides mobile_base.css:3-62 which uses the exact same selector - creating a mid-cascade overwrite with no version marker.

---

> **⚠ STALE BODY SECTION.** All line numbers, conflict descriptions, and `!important` references below are dead as of 2026-06-04. Do not follow these cleanup actions.

## 2. Legacy Cascade Layer Map

| File | Role | Cascade position |
|------|------|-----------------|
| `mobile_base.css` | Base `.journey-compass` mobile layout + focus-search reduction | Pre-strands baseline |
| `progressive_disclosure.css` | Focus-stage base, state visibility, view transitions, search-empty | Pre-strands (mid-layer) |
| `strands.css` | Route-specific surface harmonization | Mid-layer |
| `journey_active.css` | Journey compass + focus-stage state overrides | Late pre-premium |
| `mobile_premium_focus.css` | Focus/dive composition (focus-search + semantic-dive) | Premium - first |
| `mobile_premium_state.css` | Idle panel refinement + map compass | Premium - second |
| `mobile_premium_idle.css` | Idle overview via `:has()` | Premium - third |
| `mobile_premium_chrome.css` | Search drawer + map controls | Premium - early chrome layer |
| `mobile_premium_surfaces.css` | Final mobile surface harmonizer + retained transition exception | Premium - last |
| `mobile_premium.css` | Ordered import shell (versioned: `?v=b9c7c68020fd` etc.) | Entry point |

`mobile_premium.css` is confirmed as an import shell by `check:manifest`. The versioned query params (`?v=...`) are cache busters on the @import URLs.

---

> **⚠ STALE BODY SECTION.** All line numbers and conflict descriptions below are dead as of 2026-06-04. Do not follow these cleanup actions.

## 3. Duplicate Ownership - Concrete Conflicts

### A. `.journey-compass` (768px mobile)

| File | Lines | Selector pattern | Conflict level |
|------|-------|------------------|----------------|
| `mobile_base.css` | 2-63 | `[data-panel-surface]:not([data-panel-surface^="map-"]) .journey-compass` | Baseline |
| `progressive_disclosure.css` | 1620-1682 | Same selector | Overwrites base |
| `journey_active.css` | 658-816, 712-836, 818-836 | `.journey-compass` (multiple breakpoints) | Competes with base |
| `strands.css` | 52-64, 218-308, 946-955 | `[data-panel-surface="idle/search"] .journey-compass` + `[data-panel-surface="focus"]` + generic | Competes + overrides |
| `mobile_premium_surfaces.css` | 12-39 | `[data-panel-surface]:not([data-panel-surface^="map-"]) .journey-compass` | Final harmonizer |

**Seam**: `mobile_base.css:3` (base rule) -> `strands.css:52` (state variant) -> `progressive_disclosure.css:1620` (unified override) -> `mobile_premium_surfaces.css:12` (final harmonizer with `!important` on line 188 for transition)

### B. `.focus-stage` and `.focus-stage-card` (768px)

| File | Lines | What it owns |
|------|-------|--------------|
| `progressive_disclosure.css` | 148-171, 1096-1181 | Base `.focus-stage` + `.focus-stage-card` at 768px |
| `strands.css` | 109-139 | `.focus-stage` + `.focus-stage-card` for focus/focus-search/semantic-dive |
| `journey_active.css` | 2-151, 939-1141 | `.focus-stage` + `.focus-stage-card` at 768px + 380px |
| `mobile_premium_focus.css` | 179-206, 189-206 | `.focus-stage-card` for focus-search + semantic-dive |

**Conflict**: `progressive_disclosure.css:157-171` sets `.focus-stage-card` with `max-height: none; overflow-y: auto;` then `strands.css:123-129` sets `max-height: min(34vh, 270px); overflow-y: auto;` - same property, different values. Both apply at `max-width: 768px`.

### C. `.focus-stage-journey.active` (768px)

| File | Lines | Grid columns |
|------|-------|-------------|
| `progressive_disclosure.css` | 936-969 | `44px minmax(0,1fr) 44px` |
| `journey_active.css` | 1013-1024 | `minmax(0,1fr) 50px` (single column for disabled prev) |
| `journey_active.css` | 1288-1298 | `minmax(56px,.72fr) minmax(0,1.18fr) minmax(66px,.86fr)` (field-node mode) |
| `mobile_premium_focus.css` | 250-265 | `minmax(0,1fr) 44px` (focus-search) |
| `mobile_premium_focus.css` | 418-429 | `minmax(0,1fr)` (dive state hidden) |

### D. `.info-panel` (768px, focus states)

| File | Lines | `top` value | `bottom` value | `max-height` |
|------|-------|-------------|----------------|--------------|
| `progressive_disclosure.css` | 57-64 | `auto` | `calc(12px+...)` | not set |
| `strands.css` | 85-94 | `calc(58px+...)` | `auto` | `min(15vh,116px)` |
| `mobile_premium_state.css` | 810-819 | not set | not set | not set (display:none override) |

These are fundamentally different layouts applied to the same selector at the same breakpoint - neither is a refinement of the other.

### E. `mobile_premium_surfaces.css` line 188 - retained `!important` exception

```css
transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1) !important;
```

Comment states: "Retained: strands.css prefers-reduced-motion blanket override requires high precedence". This one is intentional and should not be removed in a blind debt pass. Other remaining `!important` flags in `mobile_premium_surfaces.css` still need scoped review, especially typography and search/peek geometry.

---

> **⚠ STALE BODY SECTION.** All priority actions, line numbers, and file references below are dead as of 2026-06-04. Do not follow this roadmap.

## 4. Priority Cleanup Roadmap

### Priority 1 - High-confident dedup (low risk, immediate value)

**A. Extract `.info-panel` state variants from `strands.css` into `mobile_premium_state.css`**

- **Why**: `strands.css:85-107` defines focus/focus-search/semantic-dive info-panel with conflicting `top`/`bottom` values vs `progressive_disclosure.css:57-64`. `mobile_premium_state.css` already has focus/search/idle info-panel rules (lines 28-46, 810-819) that correctly suppress display. Consolidating here removes the mid-strands conflict.
- **Seam**: `strands.css:85-94` -> move to `mobile_premium_state.css` (after existing line 819 block)
- **Risk**: Low - `mobile_premium_state.css` is loaded after `strands.css` via `mobile_premium.css` import, so any displaced rule will be overridden by existing rules in `mobile_premium_state.css`. Verify at 390px/480px breakpoints.

**B. Deduplicate `.focus-stage` + `.focus-stage-card` base rules**

- **Why**: `progressive_disclosure.css:148-171` and `strands.css:109-139` both define base `.focus-stage` + `.focus-stage-card` at 768px with conflicting `border-radius` and `padding` values. `journey_active.css` also redefines these at 768px. `mobile_premium_focus.css` has the authoritative final versions.
- **Seam**: Remove `progressive_disclosure.css:148-171` (base focus-stage rules). `mobile_premium_focus.css:179-206` is the canonical replacement. Also remove duplicate `progressive_disclosure.css:1096-1181` (second `.focus-stage-card` block for semantic-dive mobile - replaced by `mobile_premium_focus.css:188-218`).
- **Risk**: Low - These are base resets; `mobile_premium_focus.css` has the final composition layer.

**C. Document the `polish###` inventory in a comment block at top of `journey_active.css`**

- **Why**: All 22 `polish###` comments reference internal task/Polishi task numbers. Without a central registry it's impossible to know whether a polish block is "still live" or "superseded by mobile_premium". Adding a task-number->line-range table makes future archaeology faster.
- **Seam**: Add to top of `journey_active.css` after line 1 comment block
- **Risk**: Zero - purely additive documentation.

### Priority 2 - Moderate risk, high value

**D. Harmonize `.journey-compass` mobile cascade**

- **Why**: 4 files (`mobile_base.css`, `progressive_disclosure.css`, `journey_active.css`, `strands.css`) all define `.journey-compass` at 768px. `mobile_premium_surfaces.css:12-39` is the final harmonizer but relies on `!important`-free cascade to win - fragile if specificity conflicts grow.
- **Approach**: Consolidate into `mobile_premium_surfaces.css` as the single canonical mobile `.journey-compass` file, with `mobile_base.css` and `strands.css` keeping only non-768px breakpoint rules (e.g., 900px landscape, 520px, 390px).
- **Seam**: Remove `[data-panel-surface]:not([data-panel-surface^="map-"]) .journey-compass` from `mobile_base.css:3-62` (keep 900px+ landscape block). Remove `strands.css:52-64` (idle/search `.journey-compass`). Remove `progressive_disclosure.css:1620-1682`. Keep `journey_active.css:658-836` only if it contains 390px/380px-specific overrides not in `mobile_premium_surfaces.css`.
- **Risk**: Moderate - `journey_active.css:818-836` (520px) has `[data-panel-surface="semantic-dive"]` overrides for `.journey-compass` top positioning. Must verify these are not duplicated in `mobile_premium_surfaces.css`.

**E. Extract `polish208` from `progressive_disclosure.css:1252-1314` into a named component block**

- **Why**: `polish208` in progressive_disclosure and `polish208` in journey_active both target `.journey-compass-action` at 768px with conflicting `min-height` (44 vs 45) and `font-size` (9 vs 10).
- **Seam**: `progressive_disclosure.css:1252-1314` + `journey_active.css:1267-1279` -> consolidate into `mobile_premium_focus.css` (since it already owns journey-compass-action in focus-search state via lines 147-169).
- **Risk**: Moderate - need to verify journey_active:1267-1279 is not needed for non-focus states.

### Priority 3 - Requires behavioral verification

**F. Audit `progressive_disclosure.css:1705-1736` (scrollbar hiding block)**

- **Why**: Comment says "Stage 3 hygiene: scrollbar hiding - migrated from mobile_base.css:56-79 (info-panel block)". This was a migration marker. Verify the source is no longer referenced and the migrated version is canonical.
- **Seam**: If verified, this block can be removed (it's redundant with `mobile_premium_surfaces.css` which has modern scrollbar rules).

**G. Remove `progressive_disclosure.css:1350-1452` (10/10 Polish view transition + atmospheric blocks)**

- **Why**: `progressive_disclosure.css:1350-1373` (view transition + mycelium vignette) and `progressive_disclosure.css:1449-1452` (depth cues) are purely atmospheric decorative rules that should either be: (a) moved to a dedicated `animations/atmospheric.css`, or (b) removed if the effect is now handled by JS-driven class toggling with inline styles.
- **Seam**: Requires checking whether `body.view-transitioning` and `body[data-semantic-dive="transitioning"]` classes are still set by JS or if these are dead CSS rules.
- **Risk**: High - requires behavioral test. Do not remove without verifying the JS still applies these classes.

**H. Verify `journey_active.css:1031-1049` (polish241/242) against `mobile_premium_focus.css:296-323`**

- **Why**: `journey_active.css` hides disabled prev/next buttons with `display:none` for focus-search, but `mobile_premium_focus.css:296-323` (focus-stage-dive-btn) uses different positioning (absolute, bottom:12px). Need to verify which is authoritative for field-node mode.
- **Risk**: Moderate - could affect the disabled state UX for journey navigation buttons.

---

> **⚠ STALE BODY SECTION.** All actions, line numbers, and file references below are dead as of 2026-06-04.

## 5. Summary of Recommended Actions

| # | Action | File(s) | Lines | Type |
|---|--------|---------|-------|------|
| 1 | Add polish### task registry table | `journey_active.css` | after line 1 | Documentation |
| 2 | Remove base `.focus-stage` + `.focus-stage-card` resets | `progressive_disclosure.css` | 148-171, 1096-1181 | Deduplication |
| 3 | Move `strands.css` info-panel focus variants to `mobile_premium_state.css` | `strands.css` -> `mobile_premium_state.css` | 85-94 | Consolidation |
| 4 | Consolidate `.journey-compass` into `mobile_premium_surfaces.css` as canonical | `mobile_base.css`, `strands.css`, `progressive_disclosure.css` | see section 4D | Cascade harmonization |
| 5 | Merge duplicate `polish208` journey-compass-action rules | `progressive_disclosure.css`, `journey_active.css` | 1252-1314, 1267-1279 | Deduplication |
| 6 | Audit + remove or relocate scrollbar-hiding migration marker | `progressive_disclosure.css` | 1705-1736 | Hygiene |
| 7 | Audit 10/10 atmospheric blocks with JS verification | `progressive_disclosure.css` | 1350-1452 | High-risk verification |
| 8 | Verify disabled button treatment (polish241/242) vs premium focus | `journey_active.css` vs `mobile_premium_focus.css` | 1031-1049 vs 296-323 | Behavioral verification |

---

## 6. Verified Non-Issues

- **`!important` on `mobile_premium_surfaces.css:188`**: Legitimate transition exception for the current cascade. Preserve unless reduced-motion ownership is redesigned.
- **`mobile_premium.css` as import shell**: Confirmed by `check:manifest`. No inline styles; all rules live in imported modules.
- **Versioned `@import` in `mobile_premium.css`**: `?v=b9c7c68020fd` etc. are cache busters, not semantic version pins. Safe to leave.
- **`:has()` in `mobile_premium_idle.css`**: Browser support is now baseline (Chrome 105+, Safari 15.4+, Firefox 121+). No polyfill needed.

---

> **⚠ STALE BODY SECTION.** All risk descriptions and `!important` references below are dead as of 2026-06-04.

## 7. Risks and Unresolved Issues

| Risk | Severity | Description |
|------|----------|-------------|
| JS verification needed before removing atmospheric CSS | High | `body.view-transitioning` and `body[data-semantic-dive="transitioning"]` classes may no longer be applied - dead CSS if JS was changed |
| Field-node mode disabled button behavior unclear | Medium | `journey_active.css:1031-1049` (display:none) vs `mobile_premium_focus.css` (no display:none) - need live test at 390px |
| Journey compass specificity war | Medium | 4 files defining same selector at same breakpoint without `!important` - relies on cascade order which is fragile under future additions |
| `polish208` collision between progressive_disclosure and journey_active | Medium | Both files have `polish208` targeting `.journey-compass-action` at 768px with different min-height values |
| `mobile_base.css` scrollbar rules vs `mobile_premium_surfaces.css` | Low | `mobile_base.css:56-79` (commented as "migrated to progressive_disclosure:1705-1736") - confirm both are deduplicated or one is canonical |
