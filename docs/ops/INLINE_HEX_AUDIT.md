# Inline Hex Color Audit — Semantic Explorer

## 1. Discrepancy Analysis: Claimed 128 vs Actual

The background states "128 inline hex colors." Here is the verified breakdown:

| Scope | Count | Method |
|---|---|---|
| **Inline hex in `src/components/*.svelte` only** | **102** (matches) / **90** (lines) | `rg -no` = 102 individual hex values; `rg -c` = 90 lines |
| Inline hex in all `src/components/*` (svelte + css) | 123 | Includes InfoPanel.css (10) + JourneyChrome.css (23) |
| Inline hex in ALL `.svelte` files (src/) | 92 | Includes App.svelte (2) |
| Inline hex in ALL `src/` files (svelte + css + ts + html) | 206 | Includes lib/, html files, CSS files |
| Unique hex values in `src/components/*.svelte` | **39** | `sort -u` of extracted hex |

**Explanation:** The figure of 128 appears to be an approximate or slightly outdated count. The closest verified figure is **123** (all hex in `src/components/*` including `.css` files), which is 5 short of 128. The discrepancy may stem from:
- A previous version of the codebase with 5 additional hex values
- Inclusion of hex in build artifacts or generated files
- Over-counting due to regex capturing hex-like strings in comments or data arrays

**For this audit, the authoritative count is 102 individual hex color matches across 90 lines in 24 `.svelte` component files.** The difference (102 vs 90) arises because `Legend.svelte` lines 49-51 each contain 5 hex colors in array literals (15 matches on 3 lines = 12 extra).

---

## 2. Component Breakdown

| Component | Hex matches | Lines with hex |
|---|---|---|
| src/components/ThreadInspector.svelte | 10 | 10 |
| src/components/DevTelemetry.svelte | 8 | 8 |
| src/components/Legend.svelte | 20 | 8 |
| src/components/MapView.svelte | 7 | 7 |
| src/components/SpectorInspector.svelte | 7 | 7 |
| src/components/FocusCard.svelte | 5 | 5 |
| src/components/LoadingOverlay.svelte | 5 | 5 |
| src/components/Header.svelte | 5 | 5 |
| src/components/Placeholder2D.svelte | 5 | 5 |
| src/components/Filters.svelte | 4 | 4 |
| src/components/FocusPocketA11y.svelte | 3 | 3 |
| src/components/Controls.svelte | 3 | 3 |
| src/components/CompassRail.svelte | 3 | 3 |
| src/components/WeatherWidget.svelte | 2 | 2 |
| src/components/Toast.svelte | 2 | 2 |
| src/components/SearchTrailCue.svelte | 2 | 2 |
| src/components/SearchInput.svelte | 2 | 2 |
| src/components/DemoChoreography.svelte | 2 | 2 |
| src/components/Canvas.svelte | 2 | 2 |
| src/components/HoverTooltip.svelte | 1 |
| src/components/MapSummary.svelte | 1 |
| src/components/SemanticOverlay.svelte | 1 |
| src/components/Splash.svelte | 1 |
| src/components/SearchResults.svelte | 1 |

**Total: 102 inline hex color matches across 90 lines in 24 components.** (Legend.svelte accounts for 12 of the 102 via 3 lines with 5 colors each.)

---

## 3. Top 20 Most-Used Unique Colors

| Rank | Hex value | Total occurrences | Component count | Classification | Suggested CSS var |
|---|---|---|---|---|---|
| 1 | #e0f0f0 | 20 | 14 | text (light teal, secondary) | `--color-text-teal-secondary` (NEW) or use `--color-text-secondary` (rgba(255,255,255,0.78)) — **#e0f0f0 is a tinted teal, not neutral white**; needs dedicated var |
| 2 | #b0d0d0 | 10 | 8 | text (muted teal-gray) | `--color-text-muted-teal` (NEW) or `--color-text-muted` (rgba(255,255,255,0.58)) — **different hue family** |
| 3 | #6a8a8a | 10 | 7 | text (dark teal-gray) | `--color-text-dark-teal` (NEW) or `--color-text-secondary` — **slightly different hue** |
| 4 | #ff6b6b | 9 | 8 | accent/status (danger red) | **MATCH: `--status-danger` (#ff6b6b)** ✅ |
| 5 | #4ecdc4 | 9 | 6 | accent (primary alt) | **MATCH: `--color-primary-alt` (#4ecdc4)** ✅ |
| 6 | #ffd93d | 4 | 3 | accent (warning yellow) | Near: `--color-accent` (#ffdf4c) or `--status-warning` (#ffd66b) — **close but not exact** |
| 7 | #96ceb4 | 3 | 3 | text/accent (mint green) | `--color-status-success` (#8ff7d0) is different; consider `--color-mint` (NEW) |
| 8 | #888 | 3 | 2 | text (neutral gray) | `--color-text-muted` (rgba(255,255,255,0.58)) — **#888 is darker/neutral** |
| 9 | #7eeee6 | 2 | 2 | accent (bright cyan) | Near: `--color-primary-tint` (#79ebde) — **very close, consider merging** |
| 10 | #6bcb77 | 2 | 2 | accent (green) | Near: `--status-success` (#8ff7d0) — **different hue (green vs cyan-green)** |
| 11 | #071018 | 2 | 2 | bg (deep navy/black) | Near: `--color-surface-glass` (rgba(15,18,28,0.88)) — **#071018 is the opaque base of this gradient** |
| 12 | #ffffff | 1 | 1 | text (pure white) | **MATCH: `--color-text-strong` (rgba(255,255,255,0.98))** ✅ |
| 13 | #fff | 1 | 1 | text/stroke (pure white) | **MATCH: `--color-text-strong`** ✅ |
| 14 | #ffeaa7 | 1 | 1 | accent (light yellow) | Near: `--color-accent` (#ffdf4c) — **different shade** |
| 15 | #ffe1d1 | 1 | 1 | text (warm peach) | NEW: `--color-peach-light` |
| 16 | #ff9a9a | 1 | 1 | accent (soft red) | Near: `--status-danger` (#ff6b6b) — **lighter variant** |
| 17 | #ff976b | 1 | 1 | accent (coral/orange) | NEW: `--color-coral` |
| 18 | #ff8c42 | 1 | 1 | accent (orange) | NEW: `--color-orange` |
| 19 | #ff6b9d | 1 | 1 | accent (pink) | NEW: `--color-pink` |
| 20 | #fd79a8 | 1 | 1 | accent (rose pink) | NEW: `--color-rose` |

---

## 4. Existing CSS Variables Available (from css/base.css)

### Color Tokens
| Variable | Value | Type |
|---|---|---|
| `--color-primary` | `#52e5d7` | Accent |
| `--color-primary-rgb` | `82, 229, 215` | RGB tuple |
| `--color-primary-soft` | `rgba(82, 229, 215, 0.2)` | Soft bg |
| `--color-primary-ring` | `rgba(82, 229, 215, 0.8)` | Focus ring |
| `--color-primary-tint` | `#79ebde` | Light tint |
| `--color-primary-tint-rgb` | `121, 235, 222` | RGB tuple |
| `--color-primary-tint-soft` | `rgba(121, 235, 222, 0.2)` | Soft bg |
| `--color-primary-alt` | `#4ecdc4` | Secondary accent |
| `--color-primary-alt-rgb` | `78, 205, 196` | RGB tuple |
| `--color-accent` | `#ffdf4c` | Warning/accent |
| `--color-accent-rgb` | `255, 223, 76` | RGB tuple |
| `--color-accent-soft` | `rgba(255, 223, 76, 0.1)` | Soft bg |
| `--color-accent-border` | `rgba(255, 223, 76, 0.22)` | Border |
| `--color-surface-glass` | `rgba(15, 18, 28, 0.88)` | Glass surface |
| `--color-surface-panel` | `rgba(12, 17, 26, 0.93)` | Panel surface |
| `--color-border-subtle` | `var(--glass-reflection)` | Border |
| `--color-border-muted` | `rgba(255, 255, 255, 0.1)` | Muted border |
| `--color-text-strong` | `rgba(255, 255, 255, 0.98)` | Strong text |
| `--color-text-primary` | `rgba(255, 255, 255, 0.94)` | Primary text |
| `--color-text-secondary` | `rgba(255, 255, 255, 0.78)` | Secondary text |
| `--color-text-muted` | `rgba(255, 255, 255, 0.58)` | Muted text |

### Status Tokens
| Variable | Value | Type |
|---|---|---|
| `--status-success` | `#8ff7d0` | Success green |
| `--status-warning` | `#ffd66b` | Warning amber |
| `--status-danger` | `#ff6b6b` | Danger red |
| `--status-info` | `#bae6fd` | Info blue |

### Glass & Reflection
| Variable | Value | Type |
|---|---|---|
| `--glass-bg` | `linear-gradient(...)` | Background |
| `--glass-bg-deep` | `linear-gradient(...)` | Deep bg |
| `--glass-bg-accent` | `radial-gradient(...)` | Accent glow |
| `--glass-border` | `1px solid var(--glass-reflection)` | Border |
| `--glass-border-glow` | `1px solid rgba(82, 229, 215, 0.35)` | Glowing border |
| `--glass-border-muted` | `1px solid var(--glass-reflection-soft)` | Muted border |
| `--glass-reflection` | `rgba(255, 255, 255, 0.08)` | Reflection |
| `--glass-reflection-fade` | `rgba(255, 255, 255, 0.03)` | Fade |
| `--glass-reflection-glow` | `rgba(255, 255, 255, 0.15)` | Glow |
| `--glass-reflection-soft` | `rgba(255, 255, 255, 0.04)` | Soft |
| `--glass-reflection-strong` | `rgba(255, 255, 255, 0.12)` | Strong |
| `--glass-reflection-muted` | `rgba(255, 255, 255, 0.05)` | Muted |

### Shadow Tokens
| Variable | Value | Type |
|---|---|---|
| `--shadow-umbra` | `rgba(0, 0, 0, 0.54)` | Deep shadow |
| `--shadow-penumbra` | `rgba(0, 0, 0, 0.24)` | Mid shadow |
| `--shadow-antumbra` | `rgba(0, 0, 0, 0.12)` | Light shadow |
| `--shadow-glass` | `0 24px 64px var(--shadow-umbra)...` | Glass shadow |
| `--shadow-glass-glow` | `0 16px 48px rgba(82, 229, 215, 0.2)...` | Glowing shadow |
| `--shadow-premium-glow` | `0 20px 56px rgba(82, 229, 215, 0.25)...` | Premium glow |
| `--shadow-card` | `0 12px 40px var(--shadow-penumbra)` | Card shadow |
| `--shadow-panel` | `var(--shadow-glass)` | Panel shadow |
| `--shadow-focus-ring` | `0 0 0 3px rgba(82, 229, 215, 0.38)` | Focus ring |

### Radius & Space
| Variable | Value |
|---|---|
| `--glass-radius-panel` | `18px` |
| `--glass-radius-card` | `14px` |
| `--glass-radius-action` | `10px` |
| `--glass-radius-pill` | `999px` |
| `--space-1` through `--space-6` | `4px` through `24px` |
| `--radius-tight` | `8px` |
| `--radius-normal` | `12px` |
| `--radius-card` | `16px` |
| `--radius-large` | `20px` |
| `--radius-pill` | `999px` |

---

## 5. Replacement Recommendations

### 5.1 Exact Matches (No Action Needed)

| Inline Hex | Existing Var | Usage Count |
|---|---|---|
| `#ff6b6b` | `--status-danger` | 9 |
| `#4ecdc4` | `--color-primary-alt` | 9 |

These two colors account for **18 of 90 occurrences (20%)**. Replace all instances with `var(--status-danger)` and `var(--color-primary-alt)`.

### 5.2 Near-Matches (Consider Merging)

| Inline Hex | Closest Existing Var | Delta | Recommendation |
|---|---|---|---|
| `#7eeee6` | `--color-primary-tint` (#79ebde) | ΔE ≈ 3 | Merge: update `--color-primary-tint` to `#7eeee6` |
| `#ffffff` / `#fff` | `--color-text-strong` (rgba(255,255,255,0.98)) | Visual match | Replace with `var(--color-text-strong)` |
| `#071018` | `--color-surface-glass` base (15,18,28 ≈ 071018) | Same dark navy | Add `--color-surface-solid: #071018` |

### 5.3 Colors Needing New Tokens

#### High-Priority (used in ≥3 components)

| Color | Occurrences | Components | Classification | Proposed Var |
|---|---|---|---|---|
| `#e0f0f0` | 20 | 14 components | text (light teal) | `--color-text-teal-light` |
| `#b0d0d0` | 10 | 8 components | text (muted teal-gray) | `--color-text-teal-muted` |
| `#6a8a8a` | 10 | 7 components | text (dark teal-gray) | `--color-text-teal-dark` |

These three teal-family colors dominate the inline hex usage. They form a coherent **teal text hierarchy** that should be captured in a new section of CSS variables.

#### Medium-Priority (used in 2-3 components)

| Color | Occurrences | Components | Classification | Proposed Var |
|---|---|---|---|---|
| `#ffd93d` | 4 | FocusPocketA11y, Placeholder2D, Legend | accent (yellow) | `--color-accent-yellow` |
| `#96ceb4` | 3 | FocusCard, LoadingOverlay, Legend | text (mint) | `--color-mint` |
| `#888` | 3 | Placeholder2D, Legend | text (neutral gray fallback) | `--color-gray-fallback` |
| `#6bcb77` | 2 | Placeholder2D, Legend | accent (green) | `--color-green` |

#### Low-Priority (single-use, cluster legend palette)

The Legend.svelte file contains a **16-color cluster palette** (lines 49-51):
```
#4ecdc4, #ff6b6b, #ffd93d, #6bcb77, #4d96ff,
#ff8c42, #a66cff, #ff6b9d, #45b7d1, #96ceb4,
#ffeaa7, #74b9ff, #fd79a8, #00b894, #e17055
```

Plus 3 additional unique colors scattered in MapView, WeatherWidget, SpectorInspector, etc. These are all **data visualization / cluster identity colors** that should be grouped into a `--cluster-*` or `--data-*` token family.

### 5.4 Per-Component Top-3 Replacement Plan

#### ThreadInspector.svelte (10 occurrences, 7 unique)
| Color | Uses | Proposed Replacement |
|---|---|---|
| `#e0f0f0` (3×) | text labels | `var(--color-text-teal-light)` NEW |
| `#6a8a8a` (4×) | muted text | `var(--color-text-teal-dark)` NEW |
| `#b0d0d0` (1×) | secondary text | `var(--color-text-teal-muted)` NEW |
| `#4ecdc4` (1×) | accent | `var(--color-primary-alt)` ✅ EXISTING |
| `#caf4f1` (1×) | light accent | `var(--color-primary-tint)` or NEW |

#### DevTelemetry.svelte (8 occurrences, 5 unique)
| Color | Uses | Proposed Replacement |
|---|---|---|
| `#e0f0f0` (2×) | text | `var(--color-text-teal-light)` NEW |
| `#4ecdc4` (3×) | accent/outlines | `var(--color-primary-alt)` ✅ EXISTING |
| `#b0d0d0` (1×) | text | `var(--color-text-teal-muted)` NEW |
| `#6a8a8a` (1×) | text | `var(--color-text-teal-dark)` NEW |
| `#7eeee6` (1×) | accent | `var(--color-primary-tint)` NEAR-MATCH |

#### Legend.svelte (8 unique colors, many occurrences)
| Color | Uses | Proposed Replacement |
|---|---|---|
| Cluster palette (15 colors) | Data viz categories | `--cluster-1` through `--cluster-15` NEW |
| `#888` (2×) | Fallback | `var(--color-gray-fallback)` NEW |
| `#4ecdc4` (1×) | Primary cluster | `var(--color-primary-alt)` ✅ EXISTING |
| `#b0d0d0` (1×) | Text | `var(--color-text-teal-muted)` NEW |
| `#ffd93d` (1×) | Warning cluster | `var(--color-accent-yellow)` NEW |

#### Header.svelte (5 occurrences, 3 unique)
| Color | Uses | Proposed Replacement |
|---|---|---|
| `#e0f0f0` (1×) | text | `var(--color-text-teal-light)` NEW |
| `#b0d0d0` (2×) | text | `var(--color-text-teal-muted)` NEW |
| `#6a8a8a` (2×) | text | `var(--color-text-teal-dark)` NEW |

#### MapView.svelte (7 unique, all single-use)
| Color | Uses | Proposed Replacement |
|---|---|---|
| `#e7f7f2` (1×) | text | `var(--color-teal-pale)` NEW |
| `#f5fff9` (1×) | text | `var(--color-teal-paler)` NEW |
| `#ffe1d1` (1×) | text | `var(--color-peach)` NEW |
| `#7ee7db` (1×) | background | `var(--color-primary-tint)` NEAR-MATCH |
| `#ff976b` (1×) | background | `var(--color-coral)` NEW |
| `#eafffb` (1×) | text | `var(--color-teal-whitest)` NEW |
| `#071018` (1×) | background | `var(--color-surface-solid)` NEW |

---

## 6. Summary

| Metric | Value |
|---|---|
| **Total inline hex color occurrences** | **102** individual hex values across 90 lines (in `src/components/*.svelte`) |
| **Total unique hex values** | **39** |
| **Components affected** | **24 out of 37** (.svelte files) |
| **Exact token matches** | 2 colors (#ff6b6b, #4ecdc4) → 18 occurrences (20%) |
| **Near matches** | 2 colors (#7eeee6→#79ebde, #071018→surface base) |
| **High-priority new vars needed** | 3 (#e0f0f0, #b0d0d0, #6a8a8a) |
| **Medium-priority new vars needed** | 4 (#ffd93d, #96ceb4, #888, #6bcb77) |
| **Low-priority / cluster palette** | ~20 unique single-use colors |
| **Estimated LOC reduction** | ~102 lines (one hex → one var reference) |
| **Net new CSS vars needed** | ~25-30 (3 high + 4 medium + ~18 cluster + ~5 MapView/Weather) |
| **Discrepancy vs claimed 128** | 90 (svelte only) / 123 (svelte+css in components/) / 135 (all src/.svelte) |

### Recommended Implementation Priority

1. **Immediate (20% impact):** Replace `#ff6b6b` → `var(--status-danger)` and `#4ecdc4` → `var(--color-primary-alt)` across all 24 components (18 occurrences eliminated)
2. **High-priority (44% impact):** Add `--color-text-teal-light`, `--color-text-teal-muted`, `--color-text-teal-dark` and replace `#e0f0f0` (20), `#b0d0d0` (10), `#6a8a8a` (10) = 40 more occurrences
3. **Medium-priority:** Add cluster palette tokens and remaining accent colors
4. **Low-priority:** MapView/WeatherWidget/SpectorInspector unique colors

After steps 1-2, **58 of 102 occurrences (57%)** would be resolved with just **5 CSS variables** (2 existing + 3 new).
