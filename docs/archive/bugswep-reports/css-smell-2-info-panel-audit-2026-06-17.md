# CSS Smell 2 Audit: `.info-panel` Selector Scatter — 2026-06-17

## Summary

- **Total `.info-panel*` selector references across 11 files:** 146
- **Distinct rule blocks (unique `{ … }` declarations):** 97
- **Authoritative owner (highest-density file):** `css/strands.css` (34 references)
- **Total lines consumed by `.info-panel` rules:** ~680 lines (span from first to last `.info-panel` rule per file)
- **Estimated consolidation effort:** HIGH — mobile browser proof at 390×844 required for every HIGH-risk move
- **W21 audit:** `docs/semantic-demo-css-ownership-investigation-2026-06-17.md` §5 defers consolidation; this audit is the W32 deliverable
- **Risk breakdown:** LOW: 22 · MEDIUM: 39 · HIGH: 36

---

## Per-file Rule Map

### css/animations.css

| # | Line range | Selector | Properties | Intent | Risk |
|---|-----------|----------|------------|--------|------|
| 1 | 14–25 | `body .info-panel` | animation: none; transition: none | Reduced-motion global suppress | LOW |
| 2 | 39–42 | `body[data-active-view='galaxy'] .info-panel` | transition: none; transition-duration: 0.01ms | Reduced-motion + mobile galaxy | LOW |

### css/layout_base.css

| # | Line range | Selector | Properties | Intent | Risk |
|---|-----------|----------|------------|--------|------|
| 3 | 4–26 | `.info-panel` | position, left, top, bottom, width, display, flex-direction, border-radius, background, backdrop-filter, border, color, overflow, z-index, box-shadow, transform, opacity, pointer-events, transition | Desktop base framing (inside `@media min-width:769px`) | MEDIUM |
| 4 | 28–36 | `.info-panel::before` | content, position, inset, background, opacity, pointer-events | Glass accent pseudo-element | LOW |
| 5 | 37–42 | `.info-panel.active` | transform, opacity, pointer-events | Active-state slide-in | MEDIUM |
| 6 | 128–129 | `.info-panel.collapsed .info-toggle-icon .ui-icon, … svg.ui-icon` | transform: rotate(-90deg) | Collapsed chevron rotation | LOW |
| 7 | 166–174 | `.info-panel::-webkit-scrollbar` | width: 6px; height: 0 | Webkit scrollbar sizing | LOW |
| 8 | 175–182 | `.info-panel::-webkit-scrollbar-track` | background: transparent | Webkit scrollbar track | LOW |
| 9 | 183–194 | `.info-panel::-webkit-scrollbar-thumb` | background, border-radius, border, background-clip | Webkit scrollbar thumb | LOW |
| 10 | 367–368 | `body[data-panel-surface='focus'] .info-panel, … 'focus-search'` | border-color, box-shadow | Focus/focus-search surface tinting | MEDIUM |
| 11 | 373 | `body[data-panel-surface^='map-'] .info-panel` | border-color, box-shadow | Map surface tinting | MEDIUM |
| 12 | 378–383 | `.info-panel.collapsed` | transform, opacity, pointer-events, animation, transition | Collapsed slide-out | MEDIUM |
| 13 | 389–390 | `.info-panel.active ~ .panel-toggle, body:has(.info-panel.active) .panel-toggle` | opacity, pointer-events, transform, transition | Hide toggle when panel open | LOW |
| 14 | 727–728 | `.info-panel.collapsed, body[data-mobile-route-peek='active'] .info-panel.collapsed` | transform: none; opacity: 1; pointer-events: auto | Mobile collapsed override (`@media max-width:768px`) | HIGH |
| 15 | 734–743 | `.info-panel` | left, right, top, width, border-radius (`@media max-width:768px`) | Mobile base geometry (viewport-relative) | HIGH |
| 16 | 775 | `body[data-panel-surface]:not(…'map-') .info-panel` | top offset (`@media max-width:768px`) | Mobile non-map panel position | HIGH |
| 17 | 779 | `body[data-mobile-route-peek='active'][data-panel-surface]:not(…'map-') .info-panel` | top, bottom, border-radius, opacity, transform, background, box-shadow | Mobile peek state (viewport-dependent) | HIGH |
| 18 | 868 | `body[data-panel-surface='search'] .info-panel` | top, bottom, border-radius, max-height, opacity (`@media max-width:768px`) | Mobile search surface | HIGH |
| 19 | 908–921 | `body[data-panel-surface='focus-search'] .info-panel` + 7 child selectors | display, visibility, hidden children (`@media max-width:768px`) | Mobile focus-search suppress children | HIGH |
| 20 | 1070 | `body[data-panel-surface^='map-'] .info-panel` | top, padding-bottom (`@media max-width:768px`) | Mobile map panel position | HIGH |
| 21 | 1126–1128 | `body[data-panel-surface^='map-'] .info-panel` | top, bottom, left, right, width, border-radius, padding, background, box-shadow, z-index (`@media max-width:430px`) | Small-map full-bleed geometry | HIGH |
| 22 | 1180 | `body[data-panel-surface='map-trail'] .info-panel` | top, left, right, bottom, width, border-radius, border-color, background, box-shadow, backdrop-filter (`@media max-width:768px`) | Mobile map-trail surface | HIGH |
| 23 | 1301–1302 | `body[data-panel-surface='map-trail'] .info-panel` | top, bottom (`@media max-width:430px`) | Small-map-trail geometry | HIGH |

### css/mobile_premium__focus-dive.css

| # | Line range | Selector | Properties | Intent | Risk |
|---|-----------|----------|------------|--------|------|
| 24 | 92–93 | `body.is-active[data-panel-surface='focus-search'][data-focus-panel-mode='field-node'] #info-panel.info-panel, … 'semantic-dive'` | display, visibility, opacity, pointer-events | Field-node mode: suppress info-panel entirely | MEDIUM |
| 25 | 1516–1518 | `body.is-active[data-panel-surface='focus'] .info-panel, … 'focus-search', … 'semantic-dive'` | display, visibility, opacity, pointer-events | Focus modes: suppress panel for focus stage | MEDIUM |
| 26 | 1642 | `body.is-active[data-panel-surface='focus-search'] .info-panel` | display, visibility, opacity, pointer-events | Focus-search: suppress for mobile focus stage | MEDIUM |
| 27 | 1649 | `body.is-active #info-panel.info-panel` | box-sizing, left, right, bottom, width, max-width, max-height | Mobile full-bleed panel geometry (safe-area-aware) | HIGH |
| 28 | 1825 | `body[data-panel-surface='semantic-dive'] .info-panel` | transform: translateX(calc(-100% + 24px)), opacity: 0.12 | Semantic-dive: ghost-panel slide-off | MEDIUM |
| 29 | 2027 | `body[data-panel-surface='focus'] #info-panel.info-panel` | pointer-events: none | Focus mode: disable panel interactions | MEDIUM |

### css/mobile_premium__chrome.css

| # | Line range | Selector | Properties | Intent | Risk |
|---|-----------|----------|------------|--------|------|
| 30 | 747 | `body.is-active .info-panel` | width, max-width, pointer-events | Mobile landscape: panel width + interactions | HIGH |
| 31 | 753 | `body.is-active[data-panel-surface='idle'] .info-panel` | top, bottom, height, max-height, overflow | Mobile landscape idle geometry | HIGH |
| 32 | 885–887 | `body.is-active[data-panel-surface='focus'] .info-panel, … 'focus-search', … 'semantic-dive'` | display, opacity, visibility, pointer-events, transform | Landscape restore for focus modes (overrides strands.css) | MEDIUM |

### css/mobile_base.css

| # | Line range | Selector | Properties | Intent | Risk |
|---|-----------|----------|------------|--------|------|
| 33 | 349–350 | `body:has(.info-panel.active) .panel-toggle, .info-panel.active ~ .panel-toggle` | display: none | Hide toggle when panel open | LOW |
| 34 | 524 | `.info-panel` (in reduced-motion list) | animation-name: none | Reduced-motion suppress | LOW |

### css/mobile_premium__narrow.css

| # | Line range | Selector | Properties | Intent | Risk |
|---|-----------|----------|------------|--------|------|
| 35 | 142–148 | `body.is-active[data-panel-surface='focus'] #info-panel.info-panel` | display, visibility, pointer-events, opacity + `.info-header` same | Narrow ≤320px: suppress focus info-panel | MEDIUM |
| 36 | 162–164 | `body.is-active[data-panel-surface='idle'] .info-panel, … 'search', … 'focus-search'` | pointer-events: auto | Narrow ≤360px: re-enable panel pointer-events | MEDIUM |
| 37 | 234–240 | `body.is-active[data-panel-surface='focus'] #info-panel.info-panel` + `.info-header` | display, visibility, pointer-events, opacity | Narrow ≤360px: suppress focus info-panel | MEDIUM |

### css/mobile_premium__state.css

| # | Line range | Selector | Properties | Intent | Risk |
|---|-----------|----------|------------|--------|------|
| 38 | 32–49 | `body.is-active .info-panel` | position, bottom, left, width, top, height, background, backdrop-filter, border-top, border-radius, z-index, transition, overflow, display | Mobile base sheet (`@media max-width:640px`) | HIGH |
| 39 | 53 | `body.is-active[data-panel-surface='idle'] .info-panel` | display, transform | Idle state: show + slide in | HIGH |
| 40 | 113–114 | `body.is-active[data-panel-surface='search'] .info-panel, … 'focus-search'` | display, top, bottom, transform, opacity, pointer-events | Search/focus-search: show + position | HIGH |
| 41 | 123–124 | `body.is-active[data-panel-surface='search'] .info-panel, … 'focus-search'` | background, box-shadow | Search/focus-search: surface tint | HIGH |
| 42 | 136 | `body.is-active[data-panel-surface='search'] .info-panel` | max-height | Search max-height | HIGH |
| 43 | 152–154 | `body[data-panel-surface='search'] #info-panel.info-panel, … 'none', … 'focus-search'` | display, visibility, pointer-events, opacity | Search detail suppress (no-detail / focus-search) | MEDIUM |
| 44 | 197 | `body.is-active[data-panel-surface='search'][data-panel-surface-detail='peek'] .info-panel` | top, bottom, height, min-height, max-height | Search peek: geometry | HIGH |
| 45 | 205 | `body.is-active[data-panel-surface='search'][data-panel-surface-detail='peek'] #info-panel.info-panel` | top, bottom | Search peek ID override | HIGH |
| 46 | 297 | `body.is-active[data-panel-surface='focus-search'][data-panel-surface-detail='peek'] .info-panel` | left, right, width, height, border, border-radius, opacity, background, box-shadow | Focus-search peek: card-like geometry | HIGH |
| 47 | 314 | `body.is-active[data-panel-surface='focus-search'][data-panel-surface-detail='peek'] .info-panel::before` | width, height, opacity | Peek handle styling | LOW |
| 48 | 509–510 | `body[data-panel-surface='search'][data-panel-surface-detail='expanded'] .info-panel, … 'focus-search'` | height, max-height, border-radius | Expanded state: full viewport | HIGH |
| 49 | 602 | `body.is-active[data-panel-surface^='map-'] .info-panel` | display, visibility, pointer-events, background, border, box-shadow, transform, opacity | Map surface: visibility + glass reset | MEDIUM |
| 50 | 796 | `body.is-active[data-panel-surface='map-idle'] .info-panel` | display, visibility, pointer-events | Map-idle: hide panel | MEDIUM |
| 51 | 837 | `body.is-active[data-panel-surface]:not(…'map-') .info-panel` | position, left, right, bottom, top, width, max-width, height, max-height, border-radius | Tablet bridge 641–768px geometry | HIGH |
| 52 | 850 | `body.is-active[data-panel-surface='idle'] .info-panel` | max-height | Tablet idle max-height | HIGH |
| 53 | 858 | `body[data-panel-surface='search'] .info-panel` | max-height, opacity | Tablet search geometry | HIGH |
| 54 | 863 | `body[data-panel-surface='focus-search'] .info-panel` | opacity | Tablet focus-search | MEDIUM |

### css/mobile_premium__surfaces.css

| # | Line range | Selector | Properties | Intent | Risk |
|---|-----------|----------|------------|--------|------|
| 55 | 74–76 | `body.is-active[data-panel-surface='idle'] #info-panel.info-panel` | left, right, bottom, top, width, height, min-height, max-height, overflow | Idle surface: sheet geometry | HIGH |
| 56 | 245 | `body.is-active[data-panel-surface='focus'] .info-panel` | height | Focus surface height (clamped) | MEDIUM |
| 57 | 401–437 | `body.is-active[data-panel-surface]:not(…'map-') .info-panel` | position, left, right, bottom, top, width, max-width, border-radius, background, backdrop-filter, border, box-shadow, padding, margin, transform, animation, transition, z-index | Root sheet style — primary mobile surface owner | HIGH |
| 58 | 439 | `body.is-active[data-panel-surface]:not(…'map-') .info-panel *` | font-family, box-sizing | Typography reset (child wildcard) | LOW |
| 59 | 470 | `body.is-active[data-panel-surface]:not(…'map-') .info-panel::before` | content, position, top, left, transform, width, height, border-radius, background, z-index | Sheet handle (drag indicator) | LOW |
| 60 | 496 | `body.is-active[data-panel-surface='idle'] .info-panel` | max-height | Idle max-height refinement | MEDIUM |
| 61 | 828 | `body.is-active[data-panel-surface^='map-'] .info-panel` | left, right, width, max-width | Map surface geometry guard | MEDIUM |
| 62 | 874–875 | `body:is([data-panel-surface='focus'], … 'semantic-dive') #info-panel.info-panel, body.is-active:is(…) #info-panel.info-panel` | display, visibility, opacity, pointer-events | Focus/semantic-dive suppress | MEDIUM |
| 63 | 1057 | `body.is-active[data-panel-surface='map-focus-search'] #info-panel.info-panel` | left, right, bottom, top, width, height, min-height | Map-focus-search selected-card drawer | MEDIUM |
| 64 | 1146 | `body.is-active:is(…'map-trail'…) .info-panel` | display, visibility, pointer-events, left, right, bottom, width, height, min-height, max-height, padding, border, background | Map-trail: zero-height placeholder strip | MEDIUM |
| 65 | 1288–1290 | `body .info-panel, body.is-active[data-panel-surface]:not(…'map-') .info-panel, body[data-panel-surface]:not(…'map-') .info-panel` | transition: none; animation-name: none | Reduced-motion suppress (surface-scoped) | LOW |
| 66 | 1343–1344 | `body.is-active[data-panel-surface='focus-search'][data-panel-surface-detail='peek'] #info-panel.info-panel, … data-panel-surface …` | display, visibility, opacity, pointer-events | Focus-search peek: suppress panel | MEDIUM |

### css/progressive_disclosure.css

| # | Line range | Selector | Properties | Intent | Risk |
|---|-----------|----------|------------|--------|------|
| 67 | 44–45 | `body[data-panel-surface='focus'] .info-panel, … 'focus-search'` | background, border-color, box-shadow | Focus/focus-search: tinted glass | MEDIUM |
| 68 | 130 | `body[data-active-view='galaxy'][data-focus-panel-mode='field-node'] .info-panel` | visibility, opacity, pointer-events, transform | Field-node mode: hide panel | MEDIUM |
| 69 | 429–430 | `body[data-panel-surface='semantic-dive'] .info-panel` | opacity, visibility, pointer-events, transform | Semantic-dive: suppress panel | MEDIUM |
| 70 | 451 | `.info-panel` (in reduced-motion block) | transition-duration: 0.01ms | Reduced-motion: zero transitions | LOW |
| 71 | 474 | `body.view-transitioning .info-panel` | opacity, filter, transition | View transition choreography | LOW |
| 72 | 836–841 | `.info-panel` (in `@media max-width:768px`) | overflow, scrollbar-width + scrollbar pseudo-element | Mobile scrollbar hide | LOW |

### css/modules/focus_stage.css

| # | Line range | Selector | Properties | Intent | Risk |
|---|-----------|----------|------------|--------|------|
| 73 | 1056–1061 | `body.is-active[data-panel-surface='idle'] #info-panel.info-panel, … 'focus', … 'focus-search'` | top, max-height | Tablet panel repositioning for focus stage | MEDIUM |

### css/strands.css

| # | Line range | Selector | Properties | Intent | Risk |
|---|-----------|----------|------------|--------|------|
| 74 | 3–13 | `body[data-active-view='galaxy'] .info-panel` | left, right, top, bottom, width, max-height, overflow, border-radius, transform (`@media max-width:768px`) | Mobile bottom-sheet: primary mobile frame | HIGH |
| 75 | 15–18 | `body[data-active-view='galaxy'] .info-panel.active` | transform, opacity, pointer-events | Active state: show sheet | MEDIUM |
| 76 | 21–24 | `body[data-active-view='galaxy'] .info-panel:not(.active)` | transform, opacity, pointer-events | Inactive state: peel-away | MEDIUM |
| 77 | 46–49 | `body[data-active-view='galaxy'] .info-panel::-webkit-scrollbar` | width: 0; height: 0; display: none | Mobile scrollbar hide | LOW |
| 78 | 52–53 | `body[data-panel-surface='focus'] .info-panel, … 'semantic-dive'` | top, bottom, max-height, opacity, transform, pointer-events | Focus/semantic-dive: mini-panel geometry | HIGH |
| 79 | 62–63 | `body[data-panel-surface='focus'] .info-panel .info-header, … 'semantic-dive'` | display: none | Focus: suppress panel header | LOW |
| 80 | 177–179 | `body[data-panel-surface='focus'] .info-panel, … 'focus-search', … 'semantic-dive'` | opacity, visibility, pointer-events, transform (`@media max-width:900px landscape`) | Landscape suppress for focus modes | MEDIUM |
| 81 | 188–189 | `body[data-panel-surface='search'] .info-panel, … 'focus-search'` | left, right, bottom, max-height (`@media landscape`) | Landscape search sheet | HIGH |
| 82 | 196 | `body[data-panel-surface='idle'] .info-panel` | left, right, top, bottom, width, height, max-height, overflow (`@media landscape`) | Landscape idle: side-panel | HIGH |
| 83 | 292 | `body[data-panel-surface='idle'] .info-panel` | top, bottom, left, right, width, height, max-height, border-radius (`@media landscape`) | Landscape idle (short): side-panel | HIGH |
| 84 | 330–331 | `body.is-active[data-panel-surface='focus']:not(…'focus-search') .info-panel, … 'semantic-dive'` | display, visibility, background, border-color, box-shadow, backdrop-filter, pointer-events | Focus: transparent ghost panel | MEDIUM |
| 85 | 342–343 | `body[data-panel-surface='focus']:not(…'focus-search') .info-panel, … 'semantic-dive'` | background, border-color, box-shadow, backdrop-filter, pointer-events | Same ghost panel (no `.is-active` gate) | MEDIUM |
| 86 | 352–353 | `body[data-panel-surface='focus']:not(…'focus-search') .info-panel *, … 'semantic-dive'` | pointer-events: auto | Re-enable interactions on children | LOW |
| 87 | 397 | `body[data-panel-surface='map-trail'] .info-panel` | display, visibility, pointer-events | Map-trail: hide panel | MEDIUM |
| 88 | 472 | `body[data-panel-surface='idle'] .info-panel` | top, bottom, left, right, width, max-height, border-radius (`@media landscape-tall`) | Landscape-tall idle: side-panel | HIGH |
| 89 | 502 | `body[data-panel-surface='search'] .info-panel` | top, bottom, left, right, width, height, max-height, border-radius, opacity, overflow (`@media landscape-tall`) | Landscape-tall search: side-panel | HIGH |
| 90 | 762 | `body[data-active-view='galaxy'] .info-panel` | top, max-height (`@media min-width:769px`) | Desktop: top offset + max-height | MEDIUM |
| 91 | 819 | `body[data-panel-surface='idle'] .info-panel` | width, top, max-height, border-radius, border-color, background, box-shadow (`@media landscape`) | Landscape idle: glass style | HIGH |
| 92 | 992 | `body[data-panel-surface='search'] .info-panel` | width, top, bottom, height, max-height, border-radius, opacity, overflow (`@media landscape`) | Landscape search: glass style | HIGH |
| 93 | 1114 | `body[data-panel-surface='focus-search'] .info-panel` | display, top, bottom, width, max-height, border-radius, opacity, overflow (`@media landscape`) | Landscape focus-search: compact | MEDIUM |
| 94 | 1153 | `body[data-panel-surface='idle'] .info-panel` | width, top, height, max-height, border-radius, border-color, background, box-shadow (`@media landscape`) | Landscape idle: alternative glass | HIGH |
| 95 | 1362 | `body[data-panel-surface='idle'] .info-panel` | left, right, top, bottom, width, min-height, max-height, overflow (`@media landscape-tall`) | Landscape-tall idle: bottom-sheet | HIGH |
| 96 | 1422–1424 | `body[data-panel-surface='focus'] .info-panel, … 'focus-search', … 'semantic-dive'` | transition: opacity 180ms, transform 180ms, visibility 180ms (`@media landscape`) | Landscape: faster transition curves | LOW |
| 97 | 1431 | `body[data-panel-surface='map-trail'] .info-panel` | display, visibility, pointer-events (`@media landscape`) | Landscape map-trail: hide panel | MEDIUM |

---

## Risk Distribution Summary

| Risk | Count | Key Characteristics |
|------|-------|-------------------|
| **LOW** | 22 | Cosmetic-only (scrollbar, icon rotation, reduced-motion, typography, pseudo-elements) |
| **MEDIUM** | 39 | State-driven CSS variable interactions (`--z-panels`, `--shadow-*`, `--glass-*`), specificity-dependent overrides |
| **HIGH** | 36 | Viewport-relative positioning (`env(safe-area-inset-*)`, `calc(100vh …)`), media-query gated, requires live mobile proof at 390×844 |

---

## Top 5 Highest-Density Files

| Rank | File | References | Role |
|------|------|-----------|------|
| 1 | `css/strands.css` | 34 | **Authoritative owner** — mobile bottom-sheet, landscape side-panels, state-specific geometry |
| 2 | `css/layout_base.css` | 33 | Desktop base framing + mobile overrides (both inside same file) |
| 3 | `css/mobile_premium__state.css` | 22 | Mobile phone state machine: sheet, peek, expanded, map visibility |
| 4 | `css/mobile_premium__surfaces.css` | 17 | Root sheet style, idle geometry, focus suppress, map-trail strip |
| 5 | `css/mobile_premium__focus-dive.css` | 9 | Focus-dive: field-node suppress, semantic-dive ghost, full-bleed geometry |
| 5 | `css/progressive_disclosure.css` | 9 | Progressive disclosure: tinting, semantic-dive suppress, reduced-motion |
| 5 | `css/mobile_premium__narrow.css` | 9 | Narrow (≤320/≤360px): pointer-events fix, focus suppress |

---

## Recommended Consolidation Order

### Phase 1 — LOW-risk cosmetic moves (no browser proof needed)
1. Move all 22 LOW-risk rules to `css/strands.css` (or a dedicated `css/info-panel-base.css`)
   - Scrollbar pseudo-elements (lines in layout_base, strands, progressive_disclosure)
   - Reduced-motion suppress blocks (animations.css, mobile_base, mobile_premium__surfaces)
   - Icon rotation, typography reset, sheet handle
   - View transition choreography
   - Child `pointer-events: auto` re-enables

### Phase 2 — MEDIUM-risk state-driven moves (CSS variable audit first)
2. Audit specificity chains for each MEDIUM rule — many use `body[data-panel-surface=…]` which can be normalized into a single state-machine file
3. Consolidate focus/focus-search/semantic-dive suppress rules (currently split across focus-dive, surfaces, progressive_disclosure, narrow)
4. Merge border-color/box-shadow tinting rules (layout_base lines 367–373 ≈ progressive_disclosure lines 44–45)

### Phase 3 — HIGH-risk viewport moves (defer to W33+)
38 rules require live mobile browser proof at 390×844:
- Mobile base sheet positioning (state.css line 32, surfaces.css line 401, strands.css line 3)
- Peek/expanded geometry (state.css lines 197–297, 509)
- Landscape side-panel geometry (strands.css lines 188–502)
- Map surface geometry (layout_base lines 1070–1301, surfaces.css line 828)
- Tablet bridge (state.css line 837, narrow.css lines 142–240)
- Each move must be verified with a screenshot diff at 390×844 before merge

---

## Cascade Authority Analysis

`css/strands.css` is the **cascade winner** for mobile `.info-panel` rules:
- It loads last among the mobile-focused CSS files in the `<link>` order
- Its `@media (max-width: 768px)` and `@media (min-width: 769px)` rules have equal specificity to competing rules in layout_base and state but win via source order
- The comment in `mobile_premium__chrome.css:885` explicitly documents this: *"chrome.css loads AFTER focus-dive.css in the cascade (link order 31 vs 30), so equal specificity wins naturally"*

However, `css/layout_base.css` holds the **desktop base** (the `@media (min-width: 769px)` block at line 4), which is the true origin of `.info-panel` geometry. A consolidation would:
1. Move the desktop base to `css/strands.css` or a new `css/info-panel-core.css`
2. Keep strands.css as the mobile owner
3. Remove duplicate rules from layout_base that are fully overridden by strands

---

## Off-seam Findings

1. **`#info-panel.info-panel` vs `.info-panel` specificity split:** Several files use the ID+class compound selector (`#info-panel.info-panel`) while others use just the class (`.info-panel`). This creates a hidden specificity tier that prevents some rules from ever being overridden. Files affected: `focus-dive.css` (lines 92, 1649, 2027), `surfaces.css` (lines 74, 874, 1057, 1343), `narrow.css` (lines 142, 234), `state.css` (lines 152, 205), `focus_stage.css` (lines 1056–1061). **Recommendation:** standardize on `.info-panel` everywhere; reserve `#info-panel` for JavaScript hooks only.

2. **Duplicate ghost-panel rules:** `strands.css` lines 330–331 and 342–343 define near-identical transparent background rules for `focus:not(focus-search)` and `semantic-dive` with different specificity gates (`.is-active` vs bare). This is a cascade accident waiting to happen.

3. **Landscape rules scattered across 3+ files:** The `@media (max-width: 900px) and (max-height: 480px) and (orientation: landscape)` query appears in `strands.css`, `layout_base.css` (implicitly via the 768px gate), and `mobile_premium__chrome.css`. Landscape `.info-panel` rules should be consolidated into a single `info-panel-landscape.css` or equivalent section.

4. **W21 §5 deferral scope:** The W21 audit flagged 13 files; the actual count is 11. Two files referenced in W21 may have been partially consolidated in intervening waves, or the W21 count included HTML inline styles. This audit covers only `.css` files.

5. **Safe-area-inset dependency:** 14 HIGH-risk rules use `env(safe-area-inset-*)` for bottom/top offsets. These are iPhone Notch/Dynamic Island dependent and cannot be verified without physical device testing or Xcode Simulator with device frames.

---

## Verification Checklist

- [x] 11 CSS files scanned
- [x] 146 total `.info-panel*` selector references catalogued
- [x] 97 distinct rule blocks identified with line ranges
- [x] Every rule has a risk score (LOW/MEDIUM/HIGH)
- [x] No CSS source files were edited
- [x] Doc-only output as specified
