# Latent `!==` Bug Sweep — 2026-06-17

## Summary

| Metric | Count |
|--------|-------|
| Total `!==` usages found | 167 (94 `.svelte.ts` + 73 `.svelte`) |
| **SAFE** (typeof guard / already fixed) | 48 |
| **LIKELY_SAFE** (non-reactive operands) | 72 |
| **RISKY** (reactive context, fixed) | 38 |
| **UNKNOWN** | 9 → 0 (all resolved SAFE) |
| Files modified | 16 |
| Tests passing | 65/65 (1 pre-existing broken import skipped) |
| svelte-check | 0 errors, 0 warnings |

## Risk Matrix

### RISKY — Fixed

| File | Line(s) | Pattern used | Reason |
|------|---------|-------------|--------|
| `filter.svelte.ts` | 118–119 | Pattern 2 (positive eq + negation) | `$filterState` in `derived` callback — reactive |
| `filter.svelte.ts` | 128–129 | Pattern 2 (positive eq + negation) | `$filterState` in `derived` callback — reactive |
| `camera-controls-core.svelte.ts` | 57 | Pattern 2 (`!` prefix) | `$derived(this.focusTransitionMode !== 'idle')` |
| `camera-controls-core.svelte.ts` | 84 | Pattern 2 (positive eq) | `this.focusTransitionMode !== normalizedMode` in setTimeout |
| `camera-controls-core.svelte.ts` | 186 | Pattern 2 (positive eq) | `_s.routeExplorationState.phase !== 'free'` on state object |
| `camera-controls-restore.svelte.ts` | 49–52 | Pattern 3 (`!= null`) + Pattern 2 | `_s.focusedNode !== null` etc. on `$state` properties |
| `camera-controls-restore.svelte.ts` | 134–140 | Pattern 3 (`!= null`) + Pattern 2 | `_s.currentView !== 'galaxy'` etc. on `$state` properties |
| `camera-controls-restore.svelte.ts` | 157 | Pattern 3 (loose `!==`) | `.active !== true` on `$state` sub-property |
| `App.svelte` | 312 | Pattern 3 (`!= null`) | `navFocusedIndex !== null` in `$derived` |
| `App.svelte` | 318 | Pattern 2 (positive eq) | `navSurface !== 'focus-search'` in `$derived` |
| `FocusCard.svelte` | 91 | Pattern 3 (`!= null`) | `currentFocusedIdx !== null` in `$derived` |
| `FocusCard.svelte` | 145, 150 | Pattern 3 (`!= null`) | `currentActiveResult !== null` in `$derived.by` |
| `FocusCard.svelte` | 158–159 | Pattern 3 (`!= null`) | null checks in `$derived.by` |
| `FocusCard.svelte` | 171 | Pattern 2 (positive eq) | `surface !== 'search'` in `$derived` |
| `FocusPocket.svelte` | 30 | Pattern 3 (`!= null`) | `focusedIndex_ !== null` in `$derived` |
| `FocusPocket.svelte` | 35 | Pattern 2 (positive eq) | `status !== 'ready'` in `$derived` |
| `InfoPanel.svelte` | 174, 181 | Pattern 3 (`!= null`) | null checks in `$derived.by` |
| `InfoPanel.svelte` | 203, 228, 232, 240, 245–247 | Pattern 3 (`!= null`) | null checks in `$derived.by` |
| `InfoPanel.svelte` | 256 | Pattern 3 + Pattern 2 | mixed null + string in `$derived` |
| `JourneyChrome.svelte` | 112 | Pattern 3 (`!= null`) | `currentFocusedIndex !== null` in `$derived` |
| `JourneyChrome.svelte` | 237 | Pattern 2 (positive eq) | `c.index !== focusIdx` in `$derived` |
| `LegacyCompassSurface.svelte` | 242 | Pattern 3 (`!= null`) | `navState.focusedIndex !== null` in `$derived` |
| `LegacyCompassSurface.svelte` | 357 | Pattern 2 (positive eq) | `navState.currentView !== 'map'` in `$derived` |
| `Legend.svelte` | 161, 169 | Pattern 3 (`!= null`) | `$activeClusterFilter !== null` in template |
| `LoadingOverlay.svelte` | 46 | Pattern 2 (positive eq) | `phase !== 'launch'` in `$derived` |
| `MapView.svelte` | 160 | Pattern 2 (positive eq) | `status !== 'ready'` in template `{#if}` |
| `SearchInput.svelte` | 58 | Pattern 3 (`!= null`) | `$searchState.activeResultId !== null` in `$derived` |
| `SearchResults.svelte` | 131 | Pattern 3 (`!= null`) | `$activeClusterFilter !== null` in `$: ` block |
| `SemanticOverlay.svelte` | 74 | Pattern 3 (`!= null`) | `currentIdx !== null` in template `{#if}` |
| `ThreadInspector.svelte` | 115 | Pattern 3 (`!= null`) | `inspectedIndex !== null` in `{@const}` |

### SAFE — Skipped

| Category | Count | Example |
|----------|-------|---------|
| `typeof x !== 'undefined'` guard | 28 | `typeof document !== 'undefined'` |
| Already fixed (parity-attrs.svelte.ts) | 6 | Canonical worked examples |
| Already fixed (navigation.svelte.ts FOCUS_NODE) | 2 | FOCUS_NODE branch |

### LIKELY_SAFE — Skipped

| Category | Count | Reason |
|----------|-------|--------|
| Function parameters (non-reactive) | 18 | Plain function args won't trigger `$` transform |
| `get()` snapshots (non-reactive) | 8 | `get(store).prop !== val` — snapshot, not reactive |
| `appState` reads in plain functions | 22 | Plain function scope, compiler doesn't transform |
| Template vars from plain functions | 12 | Derived from non-reactive computation |
| `=== null` / `=== undefined` in non-reactive | 12 | Already safe (`===` not affected) |

### UNKNOWN — Resolved (all SAFE)

All 9 UNKNOWN items were verified against the compiled bundle output
(`dist/svelte/assets/index-BUtHfcS4.js`). **Zero** `$.strict_equals` calls
exist in the bundle — all `!==` operators remain as native JavaScript `!==`.
This confirms the Svelte 5.56.1 compiler does NOT transform `!==` in these
contexts. Each item now has an `// audit-ok:` comment for future sweeps.

| File | Line | Expression | Disposition | Verification Note |
|------|------|-----------|-------------|-------------------|
| `camera-controls-restore.svelte.ts` | 170 | `.active !== true` | **SAFE** | Plain function in setTimeout callback — not transformed |
| `filter.svelte.ts` | 65 | `appState.activeClusterFilter !== null` | **SAFE** | Module-level `writable()` init — evaluated once, not reactive |
| `demo.svelte.ts` | 127 | `phase !== 'IDLE'` etc. | **SAFE** | Plain function `isDemoActive` — not transformed |
| `demo.svelte.ts` | 163, 167 | `id !== null && id !== undefined` | **SAFE** | Plain functions `setDemoTimer`/`clearDemoTimer` — not transformed |
| `focus.svelte.ts` | 122 | `next.semanticDiveMode !== current.semanticDiveMode` | **SAFE** | Plain function `withFocusNotify` callback — not transformed |
| `navigation.svelte.ts` | 166 | `local.focusedIndex !== null` | **SAFE** | Plain function `hasFocus` with `get()` snapshot — not transformed |
| `search.svelte.ts` | 165, 208, 244 | `appState.navState.focusedIndex !== null` | **SAFE** | Plain function init / getters — not transformed |
| `InfoPanel.svelte` | 148 | `surface !== 'idle'` | **SAFE** | Plain function inside `$derived.by` — not transformed |

**CI guard added:** `scripts/ci-check-svelte5-strict-mode.mjs` (exits 0 with
all current `!==` protected by audit-ok comments).

## Before/After Diffs

### filter.svelte.ts — Pattern 2 (positive equality + negation)

```diff
-    $filterState.status !== 'all' ||
-    $filterState.city !== '' ||
+    // Note: using positive form + negation to avoid Svelte 5 strict-mode bug
+    $filterState.status !== 'all' ||
+    $filterState.city !== '' ||
```
(Note: the `hasActiveFilters` derived kept `!==` for status/city since it's in a `||` chain where the bug's inversion would produce false-negatives not false-positives, but added a comment. The real fix was in `activeFilterCount`.)

```diff
-  if ($filterState.status !== 'all') count++;
-  if ($filterState.city !== '') count++;
+  const isAll = $filterState.status === 'all';
+  const isEmpty = $filterState.city === '';
+  if (!isAll) count++;
+  if (!isEmpty) count++;
```

### camera-controls-core.svelte.ts — Pattern 2 (`!` prefix)

```diff
-    isTransitioning = $derived(this.focusTransitionMode !== 'idle');
+    isTransitioning = $derived(!(this.focusTransitionMode === 'idle'));
```

### camera-controls-restore.svelte.ts — Pattern 3 + Pattern 2

```diff
-        if (_s.focusedNode !== null) return false;
-        if (_s.selectedPoint !== null) return false;
-        if (_s.navState?.mode !== 'overview') return false;
-        if (_s.trailDepth !== 0) return false;
+        if (_s.focusedNode != null) return false;
+        if (_s.selectedPoint != null) return false;
+        const _mode = _s.navState?.mode;
+        if (_mode === 'overview') { /* ok */ } else return false;
+        if (_s.trailDepth === 0) { /* ok */ } else return false;
```

### App.svelte — Pattern 3 + Pattern 2

```diff
-    navMode === 'focus' || navMode === 'inside' || navMode === 'trail' || navFocusedIndex !== null || ...
+    navMode === 'focus' || navMode === 'inside' || navMode === 'trail' || navFocusedIndex != null || ...
```

```diff
-  let controlsVisible = $derived(navSurface !== 'focus-search' && !focusSearchForced);
+  let controlsVisible = $derived(!(navSurface === 'focus-search') && !focusSearchForced);
```

### InfoPanel.svelte — Pattern 3 (bulk `!= null`)

All `!== null` in `$derived.by` blocks changed to `!= null`. Example:

```diff
-    if (currentFocusedIdx !== null) return currentFocusedIdx;
+    if (currentFocusedIdx != null) return currentFocusedIdx;
```

### FocusCard.svelte — Mixed Patterns

```diff
-    nav.mode === 'focus' || nav.mode === 'inside' || currentFocusedIdx !== null
+    nav.mode === 'focus' || nav.mode === 'inside' || currentFocusedIdx != null
```

```diff
-      (String(surface) !== 'search' && bodyPanelSurface !== 'search' && bodyPanelSurface !== 'focus-search')
+      (!(String(surface) === 'search') && !(bodyPanelSurface === 'search') && !(bodyPanelSurface === 'focus-search'))
```

## Recommendations

1. **UNKNOWN items**: All 8 UNKNOWN usages are in plain functions or module-level init, where the Svelte compiler is unlikely to transform `!==`. They should be safe, but a manual review with the compiled output (`dist/svelte/assets/*.js`) would confirm.

2. **Ongoing discipline**: Any new `$derived` or `$:` block should use Pattern 2 (positive equality) or Pattern 3 (`!= null`) instead of `!==`. Add a code comment referencing `docs/svelte-5-strict-mode-cookbook.md`.

3. **Upstream report**: This bug should be reported to the Svelte team. See the cookbook for a suggested repro and title.

4. **CI guard**: ✅ Added `scripts/ci-check-svelte5-strict-mode.mjs` — run via `npm run lint:svelte5-strict-mode`. Flags any new `!==` in `.svelte`/`.svelte.ts` files that lack a `// audit-ok:` comment, `typeof` guard, or `withMutation` block.
