# UI-2: Bottom-Left Triple Collision in Focus State

**Date:** 2026-06-14  
**Status:** RESOLVED  
**Audit source:** `docs/ui-ux-audit-2026-06-13.md` HIGH #4

## Problem

In `data-panel-surface=focus-search` (focused-node mode with active trail), Legend, JourneyChrome, and MapSummary all rendered simultaneously in the bottom-left quadrant and collided:

| Surface | Position | Size | Overlap zone |
|---------|----------|------|--------------|
| Legend | (16, 451) | 200×433 | y: 451–884 |
| JourneyChrome | (97, 545) | 194×283 | y: 545–828 |
| MapSummary | (16, 679) | 180×125 | y: 679–804 |

Visual evidence: `audit/a1-desktop-focus.png`

## Layout Contract

**Rule:** When `focusActive` is true (any focus/inside/trail/focus-search surface), Legend is hidden. JourneyChrome and MapSummary remain visible.

**Rationale:** In focus mode, the user is actively exploring a node and its trail. JourneyChrome provides trail controls and neighbor navigation; MapSummary provides the mini-map trail view. The category legend is not needed during focused exploration and its presence obscures the other two surfaces.

**Data attribute contract:** `data-panel-surface` starting with `focus` → Legend concealed via `concealedByFocus` prop → `display: none` in CSS.

## Files Changed

| File | Change |
|------|--------|
| `src/components/Legend.svelte` | Added `concealedByFocus` prop, `class:concealed-by-focus` binding, `.legend.concealed-by-focus { display: none; }` CSS rule, `aria-hidden` gate |
| `src/App.svelte` | Passes `concealedByFocus={focusActive}` to `<Legend />` |
| `tests/unit-active/bottom-left-collisions.test.ts` | NEW — 14 structural tests asserting the prop exists, the CSS rule uses `display: none` without `!important`, and App.svelte wires it to `focusActive` |
| `docs/ui-2-bottom-left-collision-2026-06-14.md` | This doc |

## Before/After

**Before:** Legend, JourneyChrome, and MapSummary all visible in bottom-left during focus-search. Three overlapping surfaces at z:50–200.

**After:** Legend is `display: none` when `focusActive` is true. JourneyChrome (trail controls) and MapSummary (mini-map) are the only bottom-left surfaces. No overlap.

## Verification

- `npm run check` — svelte-check passes (0 new errors)
- `npm run test:unit` — 14/14 new tests pass; full suite passes
- `npm run build:svelte` — clean build, no new warnings
- `git status -sb` — only intended files changed

## Precedent

Follows the `mapView` prop pattern from UI-6 (commit `7f01df5`) which resolved the Legend/InfoPanel collision in map view by repositioning Legend via a prop-driven CSS class.
