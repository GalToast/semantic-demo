# Parameter-Property Strip-Mode Compatibility — REPORT

**Date:** 2026-08-10
**Scope:** `src/lib/stores/lifecycle.ts` import chain → second parameter-property
**Goal:** Unblock `tests/aria-sync-contract.mjs` under `ts-resolve-loader` (strip-only mode).

---

## 1. Root cause

The previous fix converted the parameter-property in `src/lib/stores/filter.svelte.ts`
(2026-08-10) to explicit-field form, but the loader was still throwing
`TypeScript parameter property is not supported in strip-only mode` because a
**second** parameter-property lives deeper in the import chain.

Walking `lifecycle.ts`'s imports (`rg '^import '`) and probing each candidate
under `node --loader ./tests/helpers/ts-resolve-loader.mjs` showed:

```
IMPORT FAILED: TypeScript parameter property is not supported in strip-only mode
file:///C:/Users/HP/repos/semantic-explorer/src/lib/data-store.ts:128
    constructor(
        private compute: () => T,
                ^^^^^^^^^^^^^^^^
        base: { subscribe(run: () => void): () => void }
```

## 2. Culprit

| File | Line | Class | Field |
|------|------|-------|-------|
| `src/lib/data-store.ts` | 126–132 | `DerivedRuneStore<T>` | `private compute: () => T` |

Only the constructor parameter was a TS-only parameter-property; the rest of
`DerivedRuneStore` is well-formed strip-mode-compatible. The other private
fields (`#derivedSource`, `#subscribers`) are already native-private fields.

## 3. The fix (explicit-field conversion — filter.svelte.ts pattern)

```diff
 class DerivedRuneStore<T> {
     #derivedSource: RuneSource<T>
     #subscribers = new Set<(value: T) => void>()
+    // Explicit-field form (2026-08-10): the parameter-property shorthand
+    // (constructor(private compute)) is a TS-only construct that
+    // --experimental-transform-types (strip-only) CANNOT strip ("parameter
+    // property not supported in strip-only mode"), which broke Node
+    // contract runs importing this store (lifecycle.ts → data-store.ts).
+    // Semantically identical to the parameter-property form.
+    private compute: () => T

     constructor(
-        private compute: () => T,
+        compute: () => T,
         base: { subscribe(run: () => void): () => void }
     ) {
+        this.compute = compute
         this.#derivedSource = deriveState(() => this.compute())
```

The body is untouched — `this.compute()` is still the only consumer. Behavior
identical; only the declaration form changed.

## 4. Cache hygiene

`tmp/transformed-data-store.ts` (the loader's `TS_RESOLVE_DEBUG` snapshot of
the prior transform) was stale: it still contained the old
`private compute: () => T,` form. Deleted so any future debug-snapshot reflects
the new explicit-field source. (`ts-resolve-loader` writes but never reads
this cache, so this is belt-and-suspenders hygiene, not a functional fix.)

## 5. Verification

### Probe — `tmp/probe-lifecycle.mjs`

**Before fix:**
```
IMPORT FAILED: TypeScript parameter property is not supported in strip-only mode
...src/lib/data-store.ts:128
    constructor(
        private compute: () => T,
```

**After fix:**
```
OK keys: MODE_DESCRIPTIONS, STORY_DESCRIPTIONS, activateSearchGlow, applyCompositionState, derivePanelSurface, getCurrentEmptyQuery, hideExploreTrailReview, recordEmptySearch, refreshCompositionState, resetExperienceState, resetExplorationFocus, resetNodePositions, returnToOverview, setMyceliumMode, setSemanticDiveMode, setTrailDepth, showExploreTrailReview, updateExplorationUi
OK function refreshCompositionState
```

### ARIA sync contract — `tests/aria-sync-contract.mjs`

Before fix: `ASSERTION FAILED: refreshCompositionState is callable` (the loader
threw before the test could even start, because `lifecycle.ts` failed to
import — see root cause above).

After fix:
```
=== ARIA Sync Contract ===

[PHASE] overview — idle state                 PASS
[PHASE] search — search intent active         PASS
[PHASE] focus — node selected                 PASS
[PHASE] semantic-dive — trailDepth >= 2       PASS
[PHASE] reset — full state clear              PASS
[EDGE]  focus without search                  PASS
[EDGE]  map view overrides semantic-dive      PASS
[EDGE]  map with focus and search             PASS
[EDGE]  single-char input below threshold     PASS

All ARIA sync contracts passed.
```

### `tsc --noEmit`

Clean — no output (exit 0). The explicit-field form keeps full type
information; only the shorthand was removed.

## 6. Files touched

| File | Reason |
|------|--------|
| `src/lib/data-store.ts` | Fix: `DerivedRuneStore` constructor parameter-property → explicit field (lines 122–134). |
| `tmp/transformed-data-store.ts` | Deleted (stale loader debug snapshot). |
| `tmp/parameter-property-REPORT.md` | This report. |
| `tmp/probe-lifecycle.mjs` | Probe script (re-used; not modified). |

**Not touched:** `tests/helpers/ts-resolve-loader.mjs`, `tests/aria-sync-contract.mjs`,
the rest of `src/lib/stores/lifecycle.ts`'s import chain.

## 7. Fleet-dirty note

`src/lib/data-store.ts` had a 1-line uncommitted modification on `master`
(comment swap: `// @ts-ignore` → `// @ts-expect-error` on line 21) at the time
of the fix. The fleet's WIP is on line 21; this fix is on lines 122–134 — 100
lines apart, addressing an orthogonal concern (TS-only strip-mode
incompatibility in `DerivedRuneStore`). Surgical edit; no overlap with the
fleet's in-flight comment change.
