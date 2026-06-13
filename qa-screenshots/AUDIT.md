# Svelte 5 Viewport Reactivity Audit — 2026-06-13

**Trigger:** Fix for Bug 1 (canvas resize) revealed a systemic Svelte 5 reactivity gotcha in the `viewport` store.
**Fix commit:** `6c6597c` — `fix(canvas): wire viewport resize to bridge via $effect auto-subscription`

---

## TL;DR

The fix for Bug 1 uncovered **11+ additional sites** with the same reactivity gotcha. Most importantly, **all `class:is-compact={isCompact()}` bindings in Svelte components are broken** — they compute once on mount and never update on viewport change. This is the **likely root cause of the mobile UI overflow bugs** I flagged in the original visual QA pass (oversized legend, mode chips cut off, truncated header, search panel label truncation).

The body data-attrs (`data-compact`, `data-mobile`) DO update because they're set imperatively by `syncViewport()`. But the Svelte class bindings on `.semantic-explorer` and child components don't.

The team has a known workaround pattern in `FocusCard.svelte:64-67` and `FocusPocket.svelte:11-13`:
```ts
let nav = $state(navStore());
$effect(() => navStore.subscribe(($s) => (nav = $s)));
```
The `viewport` store just hasn't been updated to use the same pattern.

---

## The gotcha

```ts
// src/lib/stores/viewport.svelte.ts
export const isCompact = () => get(_viewportWritable).isCompact;
export const viewportWidth = () => get(_viewportWritable).width;
export const viewportHeight = () => get(_viewportWritable).height;
```

These are **function calls that do `get(store).x`** — a snapshot read. In Svelte 5 runes mode, `$effect`, `$derived`, and template bindings do **NOT** track `get()` calls. So:

- `$effect(() => { const w = viewportWidth(); ... })` → effect runs once on mount, never re-runs
- `class:is-compact={isCompact()}` → class applied once on mount, never updated
- `$derived.by(() => isCompact() ? 1 : 2)` → derived computed once, never recomputed

**Confirmed in the browser** (at viewport 390×844):
- `body.dataset.compact === "true"` ✓ (set imperatively by `syncViewport`)
- `document.querySelector('.semantic-explorer').classList.contains('is-compact')` === `false` ✗ (Svelte binding didn't update)

---

## Affected sites (12 in 10 files)

| File | Line | Pattern | Status |
|---|---|---|---|
| `src/components/Canvas.svelte` | 60 | `bridge.resize(viewportWidth(), viewportHeight())` in `onMount` | ✅ One-shot, no reactivity needed |
| `src/components/Canvas.svelte` | 111-112 | `<canvas width={viewportWidth() * dpr()}>` template attr | ⚠️ Likely broken but the canvas is replaced by `initThreeJS()` so it's a placeholder |
| `src/components/Canvas.svelte` | 67-72 | `$effect(() => { w = $viewport.width; ... })` | ✅ **Fixed in 6c6597c** |
| `src/App.svelte` | 241 | `class:is-compact={isCompact()}` | 🔴 **BROKEN — confirmed in browser** |
| `src/App.svelte` | 242 | `class:reduced-motion={reducedMotion()}` | 🟡 Likely broken (same pattern) |
| `src/App.svelte` | 243 | `class:is-overview={isOverview()}` | 🟡 Likely broken (same pattern) |
| `src/components/Controls.svelte` | 47 | `class:compact={isCompact()}` | 🟡 Likely broken |
| `src/components/Header.svelte` | 112, 117, 158 | `class:compact={isCompact()}`, `{#if !isCompact()}` | 🟡 Likely broken |
| `src/components/JourneyChrome.svelte` | 132-136 | `$derived.by(() => { if (isCompact() && !isUltraCompactPortrait()) return 1; ... })` | 🔴 **BROKEN — neighbor rail count stuck at mount-time value** |
| `src/components/LegacyCompassSurface.svelte` | 382 | `class:standard-flex={!isCompact() && ...}` | 🟡 Likely broken |
| `src/components/MapView.svelte` | 89 | `class:is-compact={isCompact()}` | 🟡 Likely broken |
| `src/components/SearchBar.svelte` | 60 | `class:is-compact={isCompact()}` | 🟡 Likely broken |
| `src/components/SemanticOverlay.svelte` | 80 | `{#if !isCompact()}` | 🟡 Likely broken |
| `src/components/WeatherWidget.svelte` | 56 | `class:compact={isCompact()}` | 🟡 Likely broken |

The status labels:
- 🔴 — **Confirmed broken in browser** (for `class:is-compact` and the `$derived.by` neighbor count)
- 🟡 — **Same pattern, almost certainly broken**, not yet individually confirmed
- ⚠️ — Broken in principle but doesn't matter for current behavior
- ✅ — Working correctly (one-shot reads)

---

## Implication for the original QA findings

The original `qa-screenshots/REPORT.md` listed these mobile issues:
- Category legend oversized (~50% of viewport)
- Mode chips overflow horizontally
- Header title "Semantic Explorer" truncates to "Semantic Explor..."
- Search panel "SEARCH" label truncates to "ARCH"

All four are likely **downstream of `class:is-compact` never being applied**. The mobile-specific CSS rules (e.g., `mobile_premium__narrow.css`) are gated on `.is-compact` or `[data-compact="true"]` on the relevant element. If the class never applies, the CSS rules never fire, and the mobile layout never engages.

This is a much higher-leverage fix than I initially thought. Fixing the reactivity in App.svelte, Header.svelte, and the others might collapse all four mobile UI bugs into a single fix.

---

## Fix pattern (existing in the codebase)

The team has already solved this exact problem in two components. Apply the same pattern at the call sites:

**Option A — Auto-subscription in template bindings (simplest):**
```svelte
<script>
  import { viewport } from '@lib/stores/viewport';
</script>

<div class:is-compact={$viewport.isCompact}>
  {#if !$viewport.isCompact}
    <Header />
  {/if}
</div>
```
Auto-subscription works in `.svelte` files. `viewport` is already a subscribable store.

**Option B — Mirror into `$state` (for files with many reads or $derived.by):**
```svelte
<script>
  import { viewport } from '@lib/stores/viewport';
  // Mirror viewport into $state (FocusCard.svelte:64-67 pattern)
  let vp = $state(viewport());
  $effect(() => viewport.subscribe(($s) => (vp = $s)));
</script>

<div class:is-compact={vp.isCompact}>

<script>
  // $derived now tracks $state, so this re-evaluates on viewport change:
  const candidateLimit = $derived(
    vp.isCompact && !vp.isUltraCompactPortrait ? 1 :
    vp.isCompactLandscape || vp.isUltraCompactPortrait ? 2 :
    vp.isMobile && vp.isCompact ? 4 : 5
  );
</script>
```

Option A is the minimum-touch fix. Option B is needed for `$derived.by` and any place that wants stable references.

---

## Recommended fix order

1. **`src/App.svelte:241-243`** — three class bindings. The `.is-compact` class fix here will likely cascade to all the mobile UI overflow bugs at once.
2. **`src/components/Header.svelte:112, 117, 158`** — same pattern. Header chrome is visible on all idle surfaces.
3. **`src/components/JourneyChrome.svelte:132-136`** — `$derived.by` with viewport reads. The neighbor rail count is wrong on mobile/desktop swap (was a follow-up in the original QA gap).
4. **Other component class bindings** (Controls, MapView, SearchBar, SemanticOverlay, WeatherWidget, LegacyCompassSurface) — same one-line fix per file. Can be batched.

The simplest end state would be to update the viewport store itself to export `$state`-tracked values. That removes the gotcha for all callers and eliminates the need for per-file workarounds. But that's a bigger refactor — the per-file fix is safer and more isolated.

---

## Suggested test for verification

After the fix, this should work:

```js
// At 1440x900:
document.querySelector('.semantic-explorer').classList.contains('is-compact') === false
// After resize to 390x844 + dispatch resize event:
document.querySelector('.semantic-explorer').classList.contains('is-compact') === true
// After resize back to 1440x900:
document.querySelector('.semantic-explorer').classList.contains('is-compact') === false
```

Currently this fails on the second assertion. After the fix, all three should pass.

---

## Note on the canvas-resize fix

The fix in `6c6597c` is complete and verified. The renderer now resizes on viewport change. The remaining work is the same gotcha applied to other files.

The body data-attrs (`data-compact`, `data-mobile`) continue to work correctly because they're set imperatively. The Svelte class bindings don't. CSS that uses `[data-compact="true"]` (on body) works. CSS that uses `.is-compact` (on the relevant element) doesn't.
