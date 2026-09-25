# W21 CSS Ownership Investigation — 2026-06-17

**Author:** main lane (investigation pass)
**Status:** investigation complete, no source changes
**Scope:** css/ + semantic-demo.css + docs/semantic-demo-css-ownership-map.md + docs/semantic-demo-mobile-state-ownership.md

---

## 1. Inventory

- **Total CSS files:** 25 (24 in `css/` root + 1 in `css/modules/focus_stage.css`)
- **Total lines:** 18,747
- **`!important` declarations (actual):** 0 — all 6 `grep` hits are inside comments explaining why `!important` is NOT used
- **Import manifest:** `semantic-demo.css` at root (17 `@import` rules)
- **Mobile premium split:** 7 files loaded directly via `<link>` in `src/index.html`
- **Tail-loaded file:** `css/modules/focus_stage.css` (1,217 lines) — loaded LAST via `<link>`, overrides everything for equal specificity
- **Theme overlay:** `vector-explorer-pandora.css` (1,806 bytes) — loaded between manifest and mobile premium

### `!important` comment locations (all false positives)

| File | Line | Context |
|---|---|---|
| `css/clusters.css` | 369 | Comment: "Selector order, not `!important`" |
| `css/mobile_base.css` | 114 | Comment: "Selector order, not `!important`" |
| `css/mobile_base.css` | 231 | Comment: "Selector order, not `!important`" |
| `css/mobile_premium__chrome.css` | 882 | Comment: "No `!important` needed" |
| `css/strands.css` | 72 | Comment: "Using `!important` is appropriate here — reduced-motion" (but no actual `!important` in the declaration) |
| `css/strands.css` | 287 | Comment: "using `!important`" (explains why it's NOT used) |

**Verdict:** The 2026-06-04 ownership map claim of "ZERO `!important` declarations" is accurate. The comment at `strands.css:72` is slightly misleading — it says `!important` "is appropriate here" but the actual rule uses selector order instead. Recommend clarifying that comment.

### Cascade order (from `semantic-demo.css`)

```
1.  base.css                        (232 lines)  — tokens, utilities
2.  loading.css                     (338 lines)  — loading overlay
3.  tooltips.css                    (265 lines)  — hover cards
4.  shell.css                       (973 lines)  — app shell, canvas
5.  time_weather.css                (505 lines)  — weather/time
6.  demo_ui.css                     (136 lines)  — demo helpers
7.  synthesis.css                   (505 lines)  — summary card
8.  controls.css                    (417 lines)  — toggles, buttons
9.  layout_base.css                 (1308 lines) — info panel, legend
10. search.css                      (2163 lines) — search/results
11. mobile_base.css                 (576 lines)  — mobile atoms
12. journey_steps.css               (910 lines)  — trail, journey
13. journey_active.css              (544 lines)  — active journey
14. clusters.css                    (444 lines)  — galaxy, selected-card
15. progressive_disclosure.css      (1053 lines) — show/hide
16. strands.css                     (1493 lines) — mobile bottom sheet
17. animations.css                  (108 lines)  — reduced-motion tail
--- loaded via <link> in index.html ---
18. vector-explorer-pandora.css     (theme overlay)
19-25. mobile_premium__*.css × 7    (final mobile owner)
26. css/modules/focus_stage.css     (1217 lines) — TAIL-LOADED FINAL AUTHORITY
```

### Media query proliferation

| Breakpoint | Occurrences | Files |
|---|---|---|
| `@media (max-width: 768px)` | 38 | 20 files |
| `@media (prefers-reduced-motion: reduce)` | 16 | 12 files |
| `@media (min-width: 769px)` | 15 | 10 files |
| `@media (max-width: 900px) and (max-height: 430px) and (orientation: landscape)` | 8 | 6 files |
| `@media (max-width: 480px)` | 5 | 4 files |
| `@media (max-width: 360px)` | 4 | 3 files |

Total `@media` rules across all CSS: **~120+** (top 4 files: `strands.css` 17, `mobile_premium__focus-dive.css` 10, `search.css` 9, `layout_base.css` 8).

---

## 2. Top 5 Ownership Smells (ranked by severity)

### Smell 1: `.focus-stage` Fragmentation (14 files, 410+ selectors) — HIGH

**File(s):** `css/modules/focus_stage.css`, `css/journey_steps.css`, `css/mobile_premium__focus-dive.css`, `css/mobile_premium__surfaces.css`, `css/strands.css`, `css/controls.css`, `css/mobile_base.css`, `css/progressive_disclosure.css`, `css/animations.css`, `css/journey_active.css`, `css/mobile_premium__narrow.css` (and more)

**Why:** The `.focus-stage` selector family is the most fragmented surface in the codebase. The ownership map documents this well (410+ selectors across 10 files), but the **architectural wrinkle** is the core smell: `css/modules/focus_stage.css` is named "base" but loaded LAST via `<link>`, making it the tail-loaded final authority. This load-order inversion means edits to this file override the mobile premium layer for equal-specificity selectors. Any developer reading the filename assumes it's early in the cascade.

**Fix:** Rename `css/modules/focus_stage.css` to `css/modules/focus-stage-tail-authority.css` (or similar) to make its tail-loaded role explicit, and add a warning comment at the top. Alternatively, move it into the `<link>` cascade before the mobile premium files and re-verify all focus-stage contracts.

**Effort:** M (rename + doc update) or L (cascade reorder + full re-verification)

**Example:**
```html
<!-- src/index.html: loads AFTER mobile premium — final authority -->
<link rel="stylesheet" href="css/modules/focus_stage.css">
```
```css
/* css/modules/focus_stage.css — loaded last, overrides mobile premium */
.focus-stage { /* base styles */ }
```

---

### Smell 2: `.info-panel` Ownership Scatter (13 files, 197 occurrences) — HIGH

**File(s):** `css/strands.css` (34), `css/layout_base.css` (33), `css/mobile_premium__state.css` (22), `css/mobile_premium__surfaces.css` (16), `css/mobile_premium__narrow.css` (9), `css/progressive_disclosure.css` (9), `css/mobile_premium__focus-dive.css` (7), `css/mobile_premium__chrome.css` (5), `css/modules/focus_stage.css` (3), `css/mobile_base.css` (3), `css/animations.css` (2)

**Why:** The `.info-panel` is the primary drawer surface but its rules are split across 13 files with no single clear winner. `css/strands.css` (34 rules) and `css/layout_base.css` (33 rules) are the top two owners, but the mobile premium files collectively hold 60+ rules. The ownership map says `layout_base.css` owns info panel layout, but `strands.css` has MORE `.info-panel` selectors — creating confusion about which file owns the final word for mobile info panel geometry.

**Fix:** Consolidate `.info-panel` geometry ownership into `css/layout_base.css` (base) + the appropriate `css/mobile_premium__*.css` files (mobile). Remove `.info-panel` rules from `css/strands.css` unless they genuinely belong to the bottom-sheet surface. Update the ownership map to reflect the final distribution.

**Effort:** L (requires mobile browser proof at 390×844 for each moved rule)

**Example:**
```css
/* strands.css: 34 .info-panel rules — overlap with layout_base.css's 33 */
/* Which file wins? Depends on cascade order, not specificity. */
```

---

### Smell 3: `.is-active` Modifier Proliferation (1,584 occurrences, 15 files) — MEDIUM

**File(s):** `css/mobile_premium__focus-dive.css` (305), `css/mobile_premium__surfaces.css` (148), `css/mobile_premium__state.css` (130), `css/mobile_premium__chrome.css` (111), `css/mobile_premium__narrow.css` (47), `css/modules/focus_stage.css` (24), `css/mobile_premium__idle.css` (16), `css/mobile_premium__map.css` (13), `css/strands.css` (11), and more

**Why:** `.is-active` is the single most common class selector in the codebase (1,584 occurrences) but it's a generic modifier with no clear ownership. It appears in 15 files, often paired with different element selectors. This makes it impossible to know which file "owns" the active state for a given surface without reading the full cascade. The mobile premium split files are the primary carriers (760+ combined), but the base files also contribute.

**Fix:** Document `.is-active` as a shared modifier with per-element ownership (e.g., `.search-results.is-active` owned by `search.css`, `.info-panel.is-active` owned by `layout_base.css`). Add this to the ownership map's "Shared Modifiers" section.

**Effort:** S (doc update + ownership map addition)

**Example:**
```css
/* 1,584 occurrences of .is-active across 15 files — no single owner */
.search-results.is-active { /* search.css */ }
.info-panel.is-active { /* layout_base.css? strands.css? */ }
```

---

### Smell 4: Landscape Breakpoint Proliferation (8+ variants, 6 files) — MEDIUM

**File(s):** `css/mobile_premium__chrome.css`, `css/mobile_premium__focus-dive.css`, `css/mobile_premium__idle.css`, `css/mobile_premium__state.css`, `css/search.css`, `css/strands.css`

**Why:** There are 8+ landscape breakpoint variants scattered across 6 files:
- `@media (max-width: 900px) and (max-height: 430px) and (orientation: landscape)` — 4 files
- `@media (max-width: 900px) and (max-height: 480px) and (orientation: landscape)` — 3 files
- `@media (max-width: 900px) and (max-height: 420px) and (orientation: landscape)` — 1 file
- `@media (max-width: 900px) and (max-height: 420px)` — 2 files
- `@media (min-width: 769px) and (max-width: 900px) and (max-height: 430px) and (orientation: landscape)` — 1 file

The short-landscape viewport taxonomy in the mobile-state ownership doc defines 3 tiers (constrained layout edge, transition behavior edge, visual screenshot sweep), but the CSS breakpoints don't cleanly map to these tiers. The `430px` vs `480px` vs `420px` max-height variants create a fragile cascade where slight height differences trigger different rules in different files.

**Fix:** Define 2-3 canonical landscape breakpoints as CSS custom properties or documented constants, and consolidate the scattered `@media` rules into the matching files. Update the short-landscape viewport taxonomy to include the CSS breakpoints explicitly.

**Effort:** M (requires live landscape proof at each breakpoint)

**Example:**
```css
/* 6 files × 8+ landscape variants = fragile cascade */
/* mobile_premium__focus-dive.css:1455 */ @media (max-width: 900px) and (max-height: 420px) and (orientation: landscape)
/* mobile_premium__focus-dive.css:1933 */ @media (max-width: 900px) and (max-height: 430px) and (orientation: landscape)
/* strands.css:170 */                    @media (max-width: 900px) and (max-height: 480px) and (orientation: landscape)
```

---

### Smell 5: `demo_ui.css` Orphan Selectors (6 of 9 selectors unreferenced) — LOW

**File(s):** `css/demo_ui.css` (136 lines, 9 class selectors)

**Why:** `demo_ui.css` is documented as owning "Demo-specific UI helpers," but 6 of its 9 class selectors have zero references in `src/` or `js/`:
- `.demo-end-toast` — 0 references
- `.demo-overlay-tag` — 0 references
- `.demo-tag-dot` — 0 references
- `.demo-toast-dismiss` — 0 references
- `.demo-toast-glyph` — 0 references
- `.demo-toast-text` — 0 references
- `.glass-panel` — 0 references

Only `.demo-starter-chip` (1 reference) and `.view-toggle` (overlaps with `controls.css`) are live. The micro-demo choreography in `js/modules/micro-demo.js` doesn't reference these selectors — it uses canvas-level animation, not DOM toast elements.

**Fix:** Delete the 6 orphan selectors from `demo_ui.css`. Keep `.demo-starter-chip` if it's still used by the demo start flow. Move `.view-toggle` ownership entirely to `css/controls.css`. Consider whether `demo_ui.css` should exist at all if it only carries 1 live selector.

**Effort:** S (delete dead CSS, verify demo still works)

**Example:**
```css
/* demo_ui.css — 6 of 9 selectors have zero references in src/ or js/ */
.demo-end-toast { ... }      /* 0 refs */
.demo-overlay-tag { ... }    /* 0 refs */
.demo-tag-dot { ... }        /* 0 refs */
.demo-toast-dismiss { ... }  /* 0 refs */
.demo-toast-glyph { ... }    /* 0 refs */
.demo-toast-text { ... }     /* 0 refs */
```

---

## 3. Cascade Order Audit

**The import manifest (`semantic-demo.css`) loads 17 modules in the documented order.** The cascade is well-structured for the base layer, but the mobile premium layer is loaded separately via `<link>` tags in `src/index.html`, creating a two-tier cascade:

1. **Base tier:** `semantic-demo.css` → 17 `@import` modules (tokens → shell → layout → search → mobile-base → journey → clusters → disclosure → strands → animations)
2. **Theme overlay:** `vector-explorer-pandora.css` (bioluminescent bloom aesthetic)
3. **Mobile premium tier:** 7 `css/mobile_premium__*.css` files loaded via `<link>` (final mobile owner)
4. **Tail authority:** `css/modules/focus_stage.css` loaded LAST (overrides everything)

**Order issues identified:**

- **No issues in the base tier.** The 17-module import order matches the ownership map's documented cascade.
- **The tail-loaded `focus_stage.css` is the known architectural wrinkle** (documented in the ownership map). Its load position means edits to this file override the mobile premium layer for equal-specificity selectors.
- **`vector-explorer-pandora.css` sits between base and mobile premium.** It's a theme overlay loaded after the base cascade but before the mobile premium split. This is intentional but not documented in the import manifest — the ownership map mentions it but the cascade position should be explicit.

**Recommendation:** Add a comment to `semantic-demo.css` noting the full cascade including the `<link>`-loaded files that follow it.

---

## 4. Orphan CSS Analysis

### Confirmed orphans (selectors with zero references in `src/` or `js/`)

| Selector | File | Lines | Status |
|---|---|---|---|
| `.demo-end-toast` | `css/demo_ui.css` | ~10 | Orphan — no refs in src/js |
| `.demo-overlay-tag` | `css/demo_ui.css` | ~10 | Orphan — no refs in src/js |
| `.demo-tag-dot` | `css/demo_ui.css` | ~5 | Orphan — no refs in src/js |
| `.demo-toast-dismiss` | `css/demo_ui.css` | ~5 | Orphan — no refs in src/js |
| `.demo-toast-glyph` | `css/demo_ui.css` | ~5 | Orphan — no refs in src/js |
| `.demo-toast-text` | `css/demo_ui.css` | ~5 | Orphan — no refs in src/js |
| `.glass-panel` | `css/demo_ui.css` | ~8 | Orphan — no refs in src/js |

**Total orphan lines:** ~48 lines across 7 selectors in 1 file.

### Likely orphans (need verification)

| Selector | File | Notes |
|---|---|---|
| `.galaxy-cluster-label` | `css/clusters.css` | Ownership map says "WebGL Sprite-only via `js/modules/cluster-labels.js`; no HTML/CSS label surface remains" — but CSS rules still exist. Verify the CSS rules are dead. |
| `.view-toggle` in `demo_ui.css` | `css/demo_ui.css` | Duplicated in `css/controls.css` which is the documented owner. The `demo_ui.css` copy may be dead. |

### Not orphan (actively used)

All top selectors (`.info-panel`, `.search-results`, `.focus-stage`, `.journey-compass`, `.is-active`) have references in both `src/` and `js/`. The fragmentation is a cascade-order problem, not an orphan problem.

---

## 5. Recommended Wave 22 Work

Ranked by impact/effort ratio:

### 1. Delete `demo_ui.css` orphan selectors (Effort: S, Impact: LOW)
Delete the 6 orphan toast/overlay selectors. Keep `.demo-starter-chip` and `.view-toggle` (or remove `.view-toggle` if `controls.css` already owns it). Verify demo still works with `npm run test:microdemo`.

### 2. Clarify `strands.css:72` comment (Effort: S, Impact: LOW)
The comment says `!important` "is appropriate here" but the actual rule doesn't use it. Reword to: "Selector order, not `!important`: reduced-motion is a user-level accessibility preference and must take precedence via cascade order."

### 3. Add `.is-active` ownership to the map (Effort: S, Impact: MEDIUM)
Document `.is-active` as a shared modifier with per-element ownership in the ownership map. This prevents future cascade confusion.

### 4. Consolidate landscape breakpoints (Effort: M, Impact: MEDIUM)
Define 2-3 canonical landscape breakpoints and consolidate the 8+ variants across 6 files. Requires live landscape proof at each breakpoint.

### 5. Investigate `.info-panel` ownership split (Effort: L, Impact: HIGH)
Audit whether `css/strands.css`'s 34 `.info-panel` rules can be moved to `css/layout_base.css` or the mobile premium files. This is the highest-impact consolidation but requires mobile browser proof.

---

## 6. Open Questions

1. **Should `css/modules/focus_stage.css` be renamed?** Its tail-loaded role is counterintuitive. A rename would make the architecture explicit but would require updating all docs and possibly the ownership contract tests.

2. **Is `vector-explorer-pandora.css` still active?** It's loaded in `src/index.html` and referenced in the ownership map, but it's a small theme overlay. Should it be documented more prominently in the cascade?

3. **Should `demo_ui.css` be deleted entirely?** If only `.demo-starter-chip` is live, it might be simpler to move that one selector to another file and delete the module.

4. **The `strands.css:72` comment says `!important` is "appropriate" but the rule doesn't use it.** Is this intentional (the comment is aspirational) or a leftover from a previous refactor? The ownership map says zero `!important` — the comment should match.

5. **How should Wave 22 handle the `.info-panel` scatter?** The 13-file distribution is the highest-impact smell but also the highest-risk to fix. Should it be a dedicated wave or part of a broader "info panel ownership" initiative?

---

## Appendix: File-by-file `@media` counts

| File | @media rules |
|---|---|
| `css/strands.css` | 17 |
| `css/mobile_premium__focus-dive.css` | 10 |
| `css/search.css` | 9 |
| `css/layout_base.css` | 8 |
| `css/mobile_premium__surfaces.css` | 7 |
| `css/progressive_disclosure.css` | 7 |
| `css/journey_active.css` | 5 |
| `css/journey_steps.css` | 5 |
| `css/animations.css` | 5 |
| `css/mobile_premium__narrow.css` | 4 |
| `css/mobile_premium__state.css` | 4 |
| `css/mobile_base.css` | 3 |
| `css/mobile_premium__chrome.css` | 3 |
| `css/clusters.css` | 2 |
| `css/controls.css` | 2 |
| `css/mobile_premium__idle.css` | 2 |
| `css/time_weather.css` | 2 |
| `css/mobile_premium__map.css` | 1 |
| `css/shell.css` | 1 |
| `css/tooltips.css` | 1 |

**Total:** ~101 `@media` rules across 20 files. The mobile premium split files collectively hold ~31.

---

## Resolution Status (W22/W23 update - 2026-06-17)

Status of each smell as of Wave 22/23 completion.

### Smell 1: `.focus-stage` Fragmentation (14 files, 410+ selectors) — HIGH
- **Status:** PARTIAL
- **Fix commit:** `69c7ae4` (docs only — tail-load documentation added to `focus_stage.css` header)
- **Notes:** The recommended rename to `focus-stage-tail-authority.css` was NOT done. The cascade reorder was NOT done. What was done: a 19-line documentation header was added to `css/modules/focus_stage.css` explaining why it is loaded last and its role as the tail-loaded final authority. This makes the architecture explicit for future developers but does not resolve the naming confusion. The rename or cascade reorder is deferred to W24+.

### Smell 2: `.info-panel` Ownership Scatter (13 files, 197 occurrences) — HIGH
- **Status:** UNRESOLVED
- **Fix commit:** none
- **Notes:** `css/strands.css` still holds 34 `.info-panel` rules; `css/layout_base.css` still holds 33. No consolidation was attempted in W22/W23. The mobile premium files collectively hold 60+ rules. This remains the highest-impact smell and requires mobile browser proof at 390×844 for each moved rule. Deferred to W24+.

### Smell 3: `.is-active` Modifier Proliferation (1,584 occurrences, 15 files) — MEDIUM
- **Status:** RESOLVED
- **Fix commit:** `9905d86` (docs — added shared modifier section to CSS ownership map)
- **Notes:** A new `## Shared Modifiers: .is-active` section was added to `docs/semantic-demo-css-ownership-map.md` documenting per-element ownership, per-file occurrence counts, and a usage rule (always pair `.is-active` with an element selector). This was the recommended fix (S effort, docs-only). No CSS changes needed — the proliferation is inherent to the shared modifier pattern and is now discoverable.

### Smell 4: Landscape Breakpoint Proliferation (8+ variants, 6 files) — MEDIUM
- **Status:** UNRESOLVED
- **Fix commit:** none
- **Notes:** 36+ landscape `@media` rules remain across 6 files (`mobile_premium__focus-dive.css` has 20 alone). The `430px` vs `480px` vs `420px` max-height variants were not consolidated. No canonical landscape breakpoints were defined. Requires live landscape proof at each breakpoint. Deferred to W24+.

### Smell 5: `demo_ui.css` Orphan Selectors (6 of 9 selectors unreferenced) — LOW
- **Status:** RESOLVED
- **Fix commit:** `b3f9827` (pre-W22 — dead rule purge in `style(css): mobile premium polish, narrow escape-hatch, dead rule purge`)
- **Notes:** The 6 orphan selectors (`.demo-end-toast`, `.demo-overlay-tag`, `.demo-tag-dot`, `.demo-toast-dismiss`, `.demo-toast-glyph`, `.demo-toast-text`, `.glass-panel`) were deleted along with associated `@keyframes`. `demo_ui.css` is now 12 lines (down from 136) containing only the `body[data-demo-active='true'] .view-toggle` hide rule. The file still exists but is minimal. Consider deleting the module entirely in W24+ if the single rule can be moved to `controls.css`.

## Deferred Items (still W24+)

| Item | Smell | Effort | Notes |
|---|---|---|---|
| Rename `focus_stage.css` to `focus-stage-tail-authority.css` | Smell 1 | M | Rename + doc update + ownership contract test update |
| Consolidate `.info-panel` ownership (strands.css → layout_base + mobile premium) | Smell 2 | L | Highest impact, highest risk — requires mobile proof |
| Consolidate landscape breakpoints to 2-3 canonical values | Smell 4 | M | Requires live landscape proof at each breakpoint |
| Clarify `strands.css:72` misleading `!important` comment | Follow-up | S | Comment says `!important` is "appropriate" but rule doesn't use it |
| Consider deleting `demo_ui.css` entirely | Smell 5 | S | Move single remaining rule to `controls.css` |

## References

- `9905d86` — docs(w22): add .is-active shared modifier section to CSS ownership map
- `69c7ae4` — css(w23): add tail-load documentation to focus_stage.css
- `b3f9827` — style(css): mobile premium polish, narrow escape-hatch, dead rule purge (Smell 5 resolution, pre-W22)
- `docs/semantic-demo-css-ownership-map.md` — updated with .is-active shared modifier section
- `css/modules/focus_stage.css` — updated with tail-load documentation header
