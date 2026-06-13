# Bug 2 Diagnosis — Welcome/tour card persists in search mode

**Date:** 2026-06-13
**Status:** Diagnosis complete, fix proposed, NOT YET APPLIED
**Severity:** 🟠 HIGH

---

## TL;DR

The welcome card (and the "1. overview / 2. search / 3. focus / 4. inside / 5. map" demo step list) is rendered by `LegacyCompassSurface.svelte` inside `<section id="journey-compass">`. **The CSS that hides it on search mode ALREADY EXISTS** in `css/mobile_premium__chrome.css:789`:

```css
body.is-active[data-panel-surface='search'] .journey-compass.journey-compass {
    display: none;
    visibility: hidden;
    pointer-events: none;
}
```

But the rule **never fires** because the Svelte track's parity layer (`src/lib/orchestration/parity-attrs.svelte.ts`) manages ~50 body `data-*` attributes — but **does NOT manage the `is-active` class on the body**. The legacy `js/modules/composition-state.ts:106` did:

```ts
root.classList.toggle('is-active', Boolean(surface));
```

This was the single line that drove dozens of CSS rules like the one above. When the parity layer was ported to Svelte, this class management was lost.

**The fix is a 2-3 line change to `parity-attrs.svelte.ts`** to mirror the legacy pattern.

---

## Reproduction (browser-confirmed)

1. Load `http://localhost:5173/?nodemo=1` (1440×900)
2. Click the **S Search** mode chip
3. **Expected:** Welcome card hides; only the search panel + 3D mycelium remain.
4. **Actual:** Welcome card (with "OVERVIEW | MONTGOMERY COUNTY" / "The MoCo Mycelium" / "STEP INSIDE" / "MAP" buttons) sits next to the search results panel.

Screenshot: `qa-screenshots/16-bug2-search-mode.png`

## Diagnostic trail

| Step | Probe | Result |
|---|---|---|
| 1 | `bodyDataPanelSurface` after clicking Search | `"search"` ✓ — the navigation state IS in search mode |
| 2 | `bodyDataDemoPhase` | `"IDLE"` (suppressed via `?nodemo=1`) — demo is not the culprit |
| 3 | Find the welcome card in DOM | It's inside `<section id="journey-compass">` rendered by `LegacyCompassSurface.svelte` |
| 4 | Inspect the compass's `data-phase` attr | `"overview"` — the compass hasn't transitioned to search phase |
| 5 | Inspect `compass.phase` derivation logic | Returns `'overview'` because `hasSearch = !!summary` is false (no search summary yet — the user clicked Search but hasn't typed a query) |
| 6 | Check the existing CSS for search-mode welcome-card hiding | Found `css/mobile_premium__chrome.css:789` — exists, gates on `body.is-active` |
| 7 | Check `body` class list | `[]` — no `is-active` class |
| 8 | Find where the legacy code set `is-active` | `js/modules/composition-state.ts:106` — `root.classList.toggle('is-active', Boolean(surface))` |
| 9 | Check the Svelte parity layer | `src/lib/orchestration/parity-attrs.svelte.ts` does NOT manage `is-active` — only `data-*` attrs |

## Why the welcome card is showing (full chain)

```
User clicks "S Search"
  → navStore.surface = "search"
  → body data-panel-surface = "search"  (set by parity-attrs.ts ✓)
  → body.is-active  ← NEVER SET  ✗
  → CSS rule `body.is-active[data-panel-surface='search'] .journey-compass { display: none }`
    does NOT match → welcome card remains visible

Meanwhile:
  → compass.phase = "overview" (no search summary yet)
  → The compass content reflects the overview phase ("Overview | Montgomery County", etc.)
```

## Why this single fix solves multiple symptoms

Many CSS rules across the codebase require `body.is-active`. Currently ALL of them are silently failing. Examples:

| File | Rule | Symptom when `is-active` is missing |
|---|---|---|
| `mobile_premium__chrome.css:789` | Hide `.journey-compass` on search mode | **Welcome card stays on search** |
| `mobile_premium__chrome.css:6,20,29,38,47,...` | Various `data-panel-surface='idle'` rules for rail sections, filter chips | Idle-state rails may not be properly visible |
| `mobile_premium__chrome.css:95-127` | `data-panel-surface='search'] .search-results.active` | Search results may not be properly styled |
| `mobile_premium__focus-dive.css` (multiple) | Focus/dive mobile layouts | Likely affects focus surface layout |
| `FocusCard.svelte:341,342,347,499,501,517,524,526` (`:global()` rules) | `.focus-card` styling per surface | Focus card layout may be wrong |
| `App.svelte:560,568,575,585` (`:global()` rules) | Journey compass on focus-search | Compass layout on focus-search may be wrong |

The fix is a single source-of-truth change. Once `is-active` is correctly managed, dozens of CSS rules start firing that were dormant before.

---

## Fix proposal

Add `is-active` class management to `parity-attrs.svelte.ts`. The pattern matches the legacy `composition-state.ts:106` logic: `is-active` is added when there's an active surface (non-idle).

### Change 1: Add the derivation in `computeParityAttributes()`

In the function, after the existing `panelSurfaceMode` derivation, add:

```ts
// is-active: matches the legacy composition-state.ts:106 pattern.
// "Active" means the user has moved off the idle/overview surface
// and is interacting with a search/focus/inside/map/etc. surface.
// The CSS rules for every non-idle surface are gated on this class.
const isActive = panelSurfaceMode !== 'idle';
```

The function already returns a `ParityAttributeMap`; we need a separate return channel for the class. Cleanest options:

**Option A:** Return a `bodyClassList: string[]` field alongside the attribute map. The `applyParityAttributes` function then applies class toggles.

**Option B:** Add the class toggle as a separate step in the writer (always toggle based on `panelSurfaceMode`).

Option B is more minimal and matches the existing one-purpose-per-function style. Pseudo-diff:

```ts
export function applyParityAttributes(map: ParityAttributeMap): void {
  if (typeof document === 'undefined' || !document.body) return;

  // existing data-attr write loop
  for (const [key, value] of Object.entries(map)) {
    // ... unchanged
  }

  // NEW: toggle is-active class to match the legacy composition-state
  // pattern. Most mobile CSS rules for non-idle surfaces are gated on
  // body.is-active, so without this toggle, the mobile layout doesn't
  // adapt to surface changes.
  const isActive = Boolean(map.panelSurface) && map.panelSurface !== 'idle';
  document.body.classList.toggle('is-active', isActive);
}
```

This is a **single function call addition** (~4 lines). No new state, no new exports, no surface ownership change.

### Verification (browser test plan)

1. Reload `http://localhost:5173/?nodemo=1`
2. Check `document.body.classList.contains('is-active')` — should be `false` on idle overview
3. Click the **S Search** mode chip
4. Check `document.body.classList.contains('is-active')` — should be `true`
5. Take a screenshot — welcome card should be GONE
6. Click **M Overview** to go back
7. Check `is-active` — should be `false` again
8. Visit each of the 6 mode chips and verify the visual state matches expectations

### Side effects to expect

With `is-active` correctly managed, the following should all "just start working" without any other changes:
- Welcome card hides on search, focus, inside, map modes
- Mobile rail sections, filter chips, search results styling activate properly
- Focus card layout switches correctly between surfaces
- Journey compass layout adapts on focus-search

If anything looks wrong after the fix, the diagnostics are easy: re-check `body.is-active` and the `data-panel-surface` value.

---

## Separate concern (NOT this bug, but related)

The "1. overview / 2. search / 3. focus / 4. inside / 5. map" demo step list inside the welcome card is **intentionally always rendered** as the journey progress indicator. The original QA flagged it as persisting after demo completion, but it's a design choice — these are the journey milestones, not a transient demo UI. They show "current" and "done" states based on the user's journey position.

If we want to suppress them when the demo is active, that's a separate fix. Out of scope for Bug 2.

## Files involved in the fix

- `src/lib/orchestration/parity-attrs.svelte.ts` — add 4 lines to `applyParityAttributes`

That's it. No other source files need to change.

## What I did NOT do

- Did NOT apply the fix (user said "investigate", not "fix")
- Did NOT touch the `is-active` class management in any other file
- Did NOT modify the CSS or the LegacyCompassSurface
- Did NOT extend the compass state derivation (the `is-active` fix is simpler and more aligned with what the legacy code did)
