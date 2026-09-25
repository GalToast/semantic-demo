# CSS Smell 2 Audit: .info-panel Scatter (W24, 2026-06-17)

**Status:** RESOLVED (Phase 1 audit) — consolidation plan proposed, application deferred to W25+

## 1. Background

Per notes/w21-css-ownership-investigation-2026-06-17.md, Smell 2 was identified as:
- 13-file distribution of `.info-panel` rules (actual count: **10 files**)
- No canonical ownership defined
- High-impact smell (affects mobile + desktop surfaces)
- 143 total rule occurrences across those 10 files

## 2. Current Distribution

| File | Rule Count | Primary Role | Key Selectors |
|---|---|---|---|
| css/strands.css | 34 | Mobile bottom sheet | `body[data-active-view='galaxy'] .info-panel`, `body[data-panel-surface='focus'] .info-panel`, `body[data-panel-surface='semantic-dive'] .info-panel`, `body[data-panel-surface='idle'] .info-panel`, `body[data-panel-surface='search'] .info-panel`, `body[data-panel-surface='map-trail'] .info-panel` |
| css/layout_base.css | 33 | Desktop layout (canonical base) | `.info-panel {}`, `.info-panel::before`, `.info-panel.active`, `.info-panel.collapsed`, `.info-panel-surface`, scrollbar rules, `.info-panel.collapsed .info-toggle-icon`, `body[data-panel-surface='focus'] .info-panel` (media queries) |
| css/mobile_premium__state.css | 22 | Mobile state machine | `body.is-active .info-panel`, `body.is-active[data-panel-surface='idle'] .info-panel`, `body.is-active[data-panel-surface='search'] .info-panel`, `body.is-active[data-panel-surface='focus-search'] .info-panel`, peek/expanded states, `body.is-active[data-panel-surface^='map-'] .info-panel` |
| css/mobile_premium__surfaces.css | 17 | Mobile surface rendering | `body.is-active[data-panel-surface='idle'] #info-panel.info-panel`, `body.is-active[data-panel-surface='focus'] .info-panel`, `body.is-active[data-panel-surface]:not([data-panel-surface^='map-']) .info-panel`, `.info-panel-surface-selection`, map surface rules |
| css/progressive_disclosure.css | 9 | Show/hide transitions | `body[data-panel-surface='focus'] .info-panel`, `body[data-panel-surface='focus-search'] .info-panel`, field-node mode, `.info-panel.collapsed`, `.info-panel::-webkit-scrollbar` |
| css/mobile_premium__narrow.css | 9 | Narrow viewport overrides | `body.is-active[data-panel-surface] .info-panel-surface`, `body.is-active[data-panel-surface='focus'] #info-panel.info-panel`, `.info-header`, `.info-panel` collapsed states |
| css/mobile_premium__focus-dive.css | 9 | Focus-dive mode | `body.is-active[data-panel-surface='focus-search'][data-focus-panel-mode='field-node'] #info-panel.info-panel`, `body.is-active[data-panel-surface='focus'] .info-panel`, `body.is-active[data-panel-surface='semantic-dive'] .info-panel` |
| css/mobile_premium__chrome.css | 5 | Mobile chrome shell | `body.is-active .info-panel`, `body.is-active[data-panel-surface='idle'] .info-panel`, `body.is-active[data-panel-surface='focus'] .info-panel`, `body.is-active[data-panel-surface='focus-search'] .info-panel`, `body.is-active[data-panel-surface='semantic-dive'] .info-panel` |
| css/mobile_base.css | 3 | Mobile atoms | `body:has(.info-panel.active) .panel-toggle`, `.info-panel.active ~ .panel-toggle`, collapsed state |
| css/animations.css | 2 | Reduced-motion overrides | `body .info-panel` (prefers-reduced-motion), `body[data-active-view='galaxy'] .info-panel` |

## 3. Duplication Analysis

### 3.1 Cross-File Duplicate Selectors (same compound selector in ≥2 files)

| Selector Pattern | Files | Notes |
|---|---|---|
| `body.is-active .info-panel` | mobile_premium__chrome.css (747), mobile_premium__state.css (32) | Same rule — mobile_premium__state.css is the later load (overrides) |
| `body.is-active[data-panel-surface='idle'] .info-panel` | mobile_premium__surfaces.css (496), mobile_premium__state.css (53, 850), mobile_premium__chrome.css (753) | 3 files — mobile_premium__state.css has two separate rules |
| `body.is-active[data-panel-surface='focus'] .info-panel` | mobile_premium__surfaces.css (245), mobile_premium__focus-dive.css (1516), mobile_premium__chrome.css (885), mobile_premium__narrow.css (142, 234) | 4 files — highest-scattered selector |
| `body.is-active[data-panel-surface='focus-search'] .info-panel` | mobile_premium__state.css (113, 124), mobile_premium__focus-dive.css (1517), mobile_premium__chrome.css (886), mobile_premium__narrow.css (164) | 4 files |
| `body.is-active[data-panel-surface='semantic-dive'] .info-panel` | mobile_premium__focus-dive.css (1518, 1825), mobile_premium__chrome.css (887), strands.css (53, 343) | 3 files |
| `body.is-active[data-panel-surface='search'] .info-panel` | mobile_premium__state.css (113, 136, 858), mobile_premium__narrow.css (163) | 2 files |
| `body.is-active[data-panel-surface^='map-'] .info-panel` | mobile_premium__surfaces.css (828), mobile_premium__state.css (602) | 2 files |
| `body.is-active[data-panel-surface]:not([data-panel-surface^='map-']) .info-panel` | mobile_premium__surfaces.css (401, 1289, 1290), mobile_premium__state.css (837) | 3 occurrences in 2 files |
| `.info-panel.collapsed` | layout_base.css (378, 727, 728), progressive_disclosure.css (452) | 2 files |
| `.info-panel::-webkit-scrollbar` | layout_base.css (166), strands.css (46), progressive_disclosure.css (841) | 3 files |
| `.info-header` (in .info-panel context) | layout_base.css, strands.css, progressive_disclosure.css, mobile_premium__narrow.css, mobile_premium__surfaces.css, mobile_premium__state.css | **7 files** — most scattered sub-selector |
| `#info-panel.info-panel` (ID+class) | mobile_premium__surfaces.css, mobile_premium__focus-dive.css, mobile_premium__narrow.css, mobile_premium__state.css | 4 files — high-specificity mobile overrides |

### 3.2 Sub-Component Ownership

| Sub-Selector | Canonical File | Secondary Files |
|---|---|---|
| `.info-panel-surface` | layout_base.css (150) | mobile_premium__surfaces.css (711), mobile_premium__narrow.css (31) |
| `.info-panel-surface-selection` | mobile_premium__surfaces.css (711) | (none — single owner) |
| `.info-toggle-icon` | layout_base.css (80-129) | animations.css (19) |
| `.info-header` | layout_base.css (implied via .info-panel) | strands.css, progressive_disclosure.css, mobile_premium__narrow.css, mobile_premium__surfaces.css, mobile_premium__state.css |
| `#info-panel.info-panel` | mobile_premium__surfaces.css, mobile_premium__state.css | mobile_premium__focus-dive.css, mobile_premium__narrow.css |

## 4. Ownership Recommendation

Based on file naming, cascade order (per semantic-demo.css), and the mobile premium load sequence:

| Layer | Canonical Owner | Responsibility |
|---|---|---|
| Desktop base | css/layout_base.css | `.info-panel` base rule, `.info-panel::before`, `.info-panel.active`, `.info-panel.collapsed`, scrollbar, `.info-panel-surface`, `.info-toggle-icon` |
| Mobile shell | css/mobile_premium__chrome.css | `body.is-active .info-panel` baseline, chrome-level active surface |
| Mobile state machine | css/mobile_premium__state.css | All `body.is-active[data-panel-surface='...'] .info-panel` peek/expanded/detail states |
| Mobile surfaces | css/mobile_premium__surfaces.css | Surface-level rendering (`#info-panel.info-panel`), `.info-panel-surface-selection`, map surface rules |
| Focus-dive mode | css/mobile_premium__focus-dive.css | `data-focus-panel-mode='field-node'` overrides, semantic-dive focus |
| Narrow viewport | css/mobile_premium__narrow.css | Narrow viewport `.info-panel` overrides |
| Bottom sheet | css/strands.css | Galaxy view, idle/search/focus panel states for bottom-sheet layout |
| Progressive disclosure | css/progressive_disclosure.css | Show/hide transitions, field-node mode, `.info-panel.collapsed` mobile variant |
| Animations | css/animations.css | `prefers-reduced-motion` overrides only |
| Mobile base | css/mobile_base.css | Toggle button relationship (`.info-panel.active ~ .panel-toggle`) |

### Rationale

- `layout_base.css` is the natural canonical owner for desktop — it defines the base `.info-panel {}` rule and all desktop-specific states. It loads at position 9 in the cascade (mid-early).
- `mobile_premium__state.css` is the natural owner for mobile state visibility — it handles the `body.is-active[data-panel-surface]` state machine that determines which surface the panel renders in.
- `mobile_premium__chrome.css` handles the chrome-level mobile shell (position-dependent, loaded before state).
- The remaining files are feature-specific and should only own rules unique to their feature scope.

## 5. Consolidation Plan (for W25+)

### Phase 1: Deduplicate Clear Overlaps (Low Risk)

**Target:** Eliminate identical selectors that appear in 2+ files with no differing declarations.

| Action | From | To | Risk |
|---|---|---|---|
| Remove duplicate `body.is-active .info-panel` | mobile_premium__chrome.css:747 | Keep in mobile_premium__state.css:32 | LOW — state.css loads later, already wins |
| Remove duplicate `.info-panel::-webkit-scrollbar` | progressive_disclosure.css:841 | Keep in layout_base.css:166, strands.css:46 (different context) | LOW — strands.css scrollbar is galaxy-specific |
| Consolidate `.info-panel.collapsed` mobile overrides | progressive_disclosure.css:452 | Move to mobile_premium__state.css | LOW — progressive_disclosure handles show/hide but state.css owns collapsed visual |

### Phase 2: Resolve .info-header Scatter (Medium Risk)

**Target:** `.info-header` appears in 7 files.

| Action | Detail |
|---|---|
| Define canonical home | css/layout_base.css (desktop base) for structural rules |
| Mobile-specific `.info-header` | Move to css/mobile_premium__state.css (state-dependent visibility) |
| Feature-specific `.info-header` | Keep in strands.css (galaxy-specific), mobile_premium__narrow.css (viewport-specific) |
| Remove redundant | progressive_disclosure.css, mobile_premium__surfaces.css — move relevant rules to state.css |

### Phase 3: Establish `#info-panel.info-panel` Pattern (High Risk)

**Target:** The `#info-panel.info-panel` high-specificity pattern appears in 4 mobile premium files.

| Action | Detail |
|---|---|
| Document the pattern | Add comment at top of mobile_premium__surfaces.css explaining why `#info-panel.info-panel` is used (ID+class for mobile state overrides) |
| Audit for redundancy | Compare declarations in surfaces vs. state vs. focus-dive vs. narrow — some may be identical |
| Consolidate where possible | Move common `#info-panel.info-panel` rules to mobile_premium__state.css, keep feature-specific in their respective files |

### Phase 4: Document Ownership (No Risk)

| Action | Detail |
|---|---|
| Create css/ownership-map.md | Per W21 recommendation — define `.info-panel` ownership per layer |
| Add header comments | In each file, add a comment block listing what `.info-panel` rules this file is responsible for |

## 6. Risks & Verification Steps

### Before Applying Consolidation

1. **Visual QA — Desktop**
   - Open `semantic-demo.html` in desktop viewport (≥1200px)
   - Verify `.info-panel` renders correctly in all panel surfaces (idle, focus, search, focus-search, semantic-dive, map-*)
   - Verify collapsed state toggle works
   - Verify scrollbar styling persists

2. **Visual QA — Mobile**
   - Test on mobile viewport (≤400px) with mobile premium active
   - Verify all `body.is-active[data-panel-surface='...']` states render correctly
   - Test peek → expanded → collapsed transitions
   - Verify map surface variants (`data-panel-surface^='map-'`)

3. **Visual QA — Tablet/Narrow**
   - Test narrow viewport (400-768px) for mobile_premium__narrow.css overrides
   - Verify `.info-panel-surface` visibility

4. **State Machine Verification**
   - Verify `mobile_premium__state.css` state machine still works after any moves
   - Test all `data-panel-surface` values: idle, search, focus, focus-search, semantic-dive, map-idle, map-focus, map-focus-search, map-trail
   - Test `data-panel-surface-detail` values: none, peek, expanded

5. **Progressive Disclosure**
   - Verify show/hide transitions in progressive_disclosure.css still work
   - Test field-node mode

6. **Animations / Reduced Motion**
   - Enable `prefers-reduced-motion: reduce` in DevTools
   - Verify animations.css overrides still apply

7. **Regression Check**
   - Search for any JavaScript that reads `.info-panel` computed styles or classList
   - Ensure no JS depends on rule ordering that consolidation might break

## 7. Summary Statistics

| Metric | Value |
|---|---|
| Total CSS files with `.info-panel` rules | **10** (not 13 as originally claimed) |
| Total rule occurrences | **143** |
| Unique base selectors (`.info-panel` without sub-selector) | **10 files** |
| Unique sub-selectors (`.info-panel-*`) | 3 (`.info-panel-surface`, `.info-panel-surface-selection`, scrollbar variants) |
| `.info-header` scatter | **7 files** — worst sub-selector scatter |
| `#info-panel.info-panel` scatter | **4 files** — mobile-only high-specificity pattern |
| Cross-file duplicate selectors | **11 patterns** identified |
| Files that could lose rules after consolidation | 6 (mobile_premium__chrome.css, progressive_disclosure.css, mobile_base.css, animations.css, strands.css, mobile_premium__surfaces.css) |

## 8. References

- notes/w21-css-ownership-investigation-2026-06-17.md — W21 audit, original smell report (13-file claim)
- notes/w24-progress-2026-06-17.md — W24 wave status, deferral reasons
- docs/semantic-demo-css-ownership-map.md — existing ownership map (planned update for .info-panel section)
- docs/semantic-demo-mobile-state-ownership.md — mobile state machine documentation
- semantic-demo.css — import manifest (cascade order reference)
