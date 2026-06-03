# Semantic-Dive & Focus State CSS Audit

Status: complete
Date: 2026-05-20
Task: 223 -- Legacy focus & semantic-dive states
Current note: Historical audit. As of 2026-06-02, the `mobile_premium_focus.css` findings map to the `FOCUS / DIVE STATES` section in `css/mobile_premium.css`.

Purpose: Determine if CSS rules in progressive_disclosure.css and journey_active.css
are obsolete duplicates of rules already defined in mobile_premium_focus.css.

---

## Methodology

- Read all four CSS files and the owner matrix (docs/semantic-demo-focus-stage-css-owner-matrix.md)
- Compared selectors line-by-line against canonical definitions in mobile_premium_focus.css
- Relationship labels: FULL DUPLICATE (fully superseded), NEAR-DUPLICATE (same purpose,
  different values), PARTIAL DUPLICATE (base overlaps, unique enhancements remain),
  UNIQUE (no counterpart in canonical)

The key differentiator is the is-active body class gate used throughout
mobile_premium_focus.css. Legacy rules lack this gate, making them broader and
potentially overriding the canonical layer when body.is-active is absent.

---

## Summary

| File                  | Duplicates | Near-Dupes | Partial-Dupes | Uniques |
|-----------------------|------------|-------------|----------------|---------|
| progressive_disclosure.css | 6          | 3           | 2              | ~6      |
| journey_active.css  | 0          | 3           | 3              | ~15     |

progressive_disclosure.css has the most redundant rules -- 6 full duplicates of rules
already owned by mobile_premium_focus.css. journey_active.css is mostly canonical for its
own domains (journey-compass, field-node canopy/walk dock); its overlap with
mobile_premium_focus.css is limited to a handful of focus-search layout variants.

## progressive_disclosure.css -- Duplicate Analysis

### FULL DUPLICATES (fully superseded by mobile_premium_focus.css)

| Lines  | Selector | Canonical owner | Verdict |
|--------|----------|-----------------|---------|
| 674-679 | body[data-panel-surface="focus"] .focus-stage-journey.active, body[data-panel-surface="focus-search"] .focus-stage-journey.active | mobile_premium_focus.css:198-213 | Full duplicate -- only sets gap, margin-top, padding-top. Canonical has full grid layout, border, min-height. |
| 850-855 | Same as above, repeated at 430px breakpoint | mobile_premium_focus.css:198-213 | Full duplicate -- same bare subset at a different viewport |
| 1028-1034 | body[data-panel-surface="semantic-dive"] .focus-stage-inside-controls, body[data-panel-surface="semantic-dive"] .focus-stage-inside-status | mobile_premium_focus.css:308-340 | Full duplicate -- bare display:grid only. Canonical has full padding, border, background, box-shadow, and grid-template-columns. |
| 1128-1131 | body[data-panel-surface="semantic-dive"] .focus-stage-journey.active | mobile_premium_focus.css:374-385 | Full duplicate -- only margin-top and padding-top. Canonical has full layout properties. |
| 1273-1285 | html body[data-panel-surface="semantic-dive"] .focus-stage-inside-controls (gap: 8px), html body[data-panel-surface="semantic-dive"] .focus-stage-inside-btn (min-height: 44px) | mobile_premium_focus.css:334-351 | Full duplicate -- bare display/gap/min-height. Canonical has full grid layout, border-radius, font properties. |

### NEAR-DUPLICATES (same structural purpose, different values)

| Lines | Selector | Canonical diff | Verdict |
|-------|----------|----------------|---------|
| 148-155 | .focus-stage (mobile base) | Canonical uses left:10px; right:10px; bottom:calc(12px+...); width:auto. This rule uses left:0; right:0; bottom:0; width:100%. | Near-duplicate -- legacy full-sheet reset; canonical is compact mobile composition |
| 157-171 | .focus-stage-card (mobile base) | Canonical uses border-radius:8px; padding:11px 10px 10px; gap:7px. This rule uses border-radius:28px 28px 0 0; padding:20px 16px calc(14px+...). | Near-duplicate -- older 28px-radius card foundation; superseded for focus-search/semantic-dive |
| 927-934 | body[data-panel-surface="focus-search"] .focus-stage-journey.active | Canonical is 2-column grid (1fr 44px). This rule is 3-column grid (44px 1fr 44px). | Near-duplicate -- 3-column variant vs canonical 2-column; lacks is-active guard |

### UNIQUES (no counterpart in mobile_premium_focus.css)

| Lines | Selector | Rationale |
|-------|----------|-----------|
| 981-985 | body[data-panel-surface="semantic-dive"] .focus-stage (desktop fixed) | Desktop right-anchored fixed-width layout. Canonical only covers mobile via is-active guard. |
| 987-996 | body[data-panel-surface="semantic-dive"] .focus-stage-card (desktop) | Desktop card with cluster-rgb gradients. No desktop semantic-dive card in canonical. |
| 1015-1026 | body[data-panel-surface="semantic-dive"] .focus-stage-dive-btn, .focus-stage-dive-copy | Desktop dive button styling. No desktop counterpart in canonical. |
| 1062-1079 | body[data-panel-surface="semantic-dive"] .focus-stage-card (mobile, 768px) | Adds max-height:224px; overflow-y:auto. Canonical uses max-height:none. |
| 1215-1223 | html body[data-panel-surface="semantic-dive"] .info-panel, .semantic-lane-rail, .selected-card | Opacity/visibility suppression for semantic-dive desktop. |
| 173-184 | .focus-stage-card::after (top grabber bar) | Uses ::after; canonical uses ::before. Non-conflicting since different pseudo. |

---

## journey_active.css -- Duplicate Analysis

journey_active.css is the canonical owner for: .journey-compass desktop + mobile,
field-node canopy HUD (data-focus-panel-mode="field-node"), and field-node walk dock.
Most of its rules have no counterpart in mobile_premium_focus.css -- therefore
UNIQUE, not duplicate.

### NEAR-DUPLICATES (different layout modes, not straight duplicates)

| Lines | Selector | Canonical diff | Verdict |
|-------|----------|----------------|---------|
| 3-8 | html body[data-panel-surface="focus-search"] .focus-stage | Canonical bottom:calc(12px+...). This rule bottom:calc(58px+...). 46px difference. | Near-duplicate -- different bottom offset; same structural intent |
| 10-22 | html body[data-panel-surface="focus-search"] .focus-stage-card | Canonical max-height:none; border-radius:8px. This rule max-height:43vh; border-radius:22px; overflow-y:auto. | Near-duplicate -- capped height with scrolling vs unlimited height |
| 46-52 | html body[data-panel-surface="focus-search"] .focus-stage-journey.active | Canonical 2-col (1fr 44px). This rule 3-col (42px 1fr 52px). | Near-duplicate -- 3-column with explicit side buttons vs canonical 2-column |

### PARTIAL DUPLICATES (base styling overlapped, unique enhancements remain)

| Lines | Selector | Overlap | Unique enhancement |
|-------|----------|---------|-------------------|
| 289-296 | html body[data-panel-surface="semantic-dive"] .focus-stage-card | Both define semantic-dive card. Canonical amber accent (255,210,77); this rule cyan (121,235,222). | max-height:46vh -- canonical uses max-height:none |
| 298-309, 328-359 | html body[data-panel-surface="semantic-dive"] .focus-stage-inside-status | Base styling near-duplicated in mobile_premium_focus.css:308-316. | insideStatusPulse keyframe animation (lines 342-359) -- unique to journey_active.css |
| 311-401 | html body[data-panel-surface="semantic-dive"] .focus-stage-inside-controls + button treatments | Base display:grid and grid-template-columns owned by canonical. | Amber gradient on btn-inside-next, cyan on btn-inside-county, disabled states (lines 367-401) -- unique to journey_active.css |

### UNIQUES (owned by journey_active.css, no counterpart in mobile_premium_focus.css)

| Lines | Selector | Rationale |
|-------|----------|-----------|
| 412-651 | .journey-compass (desktop, 240 lines) | Full desktop compass: layout, rail, step states, phases, action buttons. |
| 657-830 | .journey-compass mobile overrides (breakpoints 900px/768px/520px) | Mobile responsive cascade for compass. No canonical .journey-compass mobile rules. |
| 965-982 | body[data-panel-surface="focus-search"] .journey-compass (mobile, 768px) | Compass without is-active guard. Unique non-is-active fallback. |
| 984-986 | html body[data-panel-surface="focus-search"] .focus-stage (bottom:28px) | 28px bottom offset -- distinct from 58px (line 6) and 12px (canonical). |
| 1002-1018 | html body[data-panel-surface="focus"] .focus-stage-journey.active | 50px button column vs canonical 44px. 6px difference. |
| 1133-1216 | html body.is-active[data-panel-surface="focus-search"][data-focus-panel-mode="field-node"] .journey-compass | Field-node canopy HUD. No canonical equivalent. |
| 1219-1357 | .focus-stage and .focus-stage-card field-node walk dock | Walk dock for field-node state. No canonical equivalent. |
| 1544-1626 | html body.is-active[data-active-view="galaxy"][data-focus-panel-mode="field-node"] .journey-compass | Galaxy view field-node compass. No canonical equivalent. |
| 1628-1650 | html body[data-active-view="galaxy"][data-focus-panel-mode="field-node"] .focus-stage-* hides | Hides for field-node mode. No canonical equivalent. |
| 1652-1758 | html body[data-active-view="galaxy"][data-focus-panel-mode="field-node"] .focus-stage-journey.active, #btn-focus-* | Field-node walk dock button styling. No canonical equivalent. |
| 1758-1792 | html body[data-active-view="galaxy"][data-focus-panel-mode="field-node"][data-field-step-sync="active"]::before, etc. | Field-step-sync animation block. No canonical equivalent. |

---

## Risk Assessment for Future Migration

1. Cascade order: progressive_disclosure.css rules lack is-active guards. When body.is-active is set, mobile_premium_focus.css wins. When absent, legacy rules win. Asymmetric but intentional.

2. Pulse animation: journey_active.css:342-359 owns insideStatusPulse keyframe. Cannot be moved to canonical without losing animation.

3. Inside button treatments: btn-inside-next amber gradient and btn-inside-county cyan (journey_active.css:367-401) are unique -- no canonical counterpart.

4. Field-node rules: All field-node rules are unique to journey_active.css per owner matrix. Out-of-scope for deduplication.

5. progressive_disclosure.css bare-display rules at 1028-1034 and 1273-1285 are fully superseded. Safe to remove once is-active gating is confirmed in runtime.
