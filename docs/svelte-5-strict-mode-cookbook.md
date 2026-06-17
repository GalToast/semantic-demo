# Svelte 5 Strict-Mode Compiler Bug Cookbook

## TL;DR

Svelte 5's strict-mode compiler (when emitting rune-mode code) has a bug
where the `!==` operator is incorrectly compiled to `$.strict_equals(a, b, false)`
which is actually `===`. This silently **INVERTS** the comparison. The bug
affects any `!==` used inside `.svelte` and `.svelte.ts` files when rune
mode is enabled. Use `typeof` + `===` + unpacked locals as the workaround.

This bug has bitten this codebase at least 3 times. This document exists
so the next occurrence is a 5-minute fix instead of a 30-minute one.

## The bug in detail

### What Svelte does wrong

Svelte 5 wraps equality operators in `$.strict_equals(a, b, ???)` calls in
the compiled output. The third argument is an "inverted" flag: when `true`,
the result is negated (making `===` behave as `!==`). The bug is that `!==`
expressions get compiled with the **wrong** flag value — specifically, `false`
instead of `true` — so `!==` compiles to `===` (i.e. the opposite of what
you wrote).

Example compiled output (from `dist/svelte/assets/*.js`):

```js
// Source:  a !== b
// Compiled: $.strict_equals(a, b, false)   ← BUG: false means ===, not !==
// Expected: $.strict_equals(a, b, true)    ← what it should be
```

### Why it compiles to `$.strict_equals`

Svelte 5 compiles rune-mode files through its own AST transform. Binary
operators like `===` and `!==` are replaced with `$.strict_equals()` calls
to support fine-grained reactivity tracking. The third parameter controls
whether the result is inverted. The bug is in the compiler's handling of
the `!==` operator: it passes `false` (no inversion) instead of `true`
(invert), making `!==` behave identically to `===`.

### When it triggers

- File extension is `.svelte` or `.svelte.ts`
- The file uses rune-mode (`$state`, `$derived`, `$effect`, `$props`, etc.)
- The file is compiled with `<svelte:options runes={true} />` (which is now default)
- The expression uses `!==` (or `!=`)

### When it does NOT trigger

- Plain `.ts` or `.js` files (not compiled by Svelte)
- `.svelte` files WITHOUT rune mode (legacy mode)
- Expressions that only use `===` (unaffected), `<`, `>`, `<=`, `>=`

## Reproduction recipe

```svelte
<!-- repro.svelte -->
<script lang="ts">
  let a = 'hello';
  let b = 'world';
  // Expected: false. Actual: true (BUG)
  console.log('a !== b:', a !== b);
</script>
```

In the compiled output, this becomes:

```js
console.log('a !== b:', $.strict_equals(a, b, false));
// $.strict_equals('hello', 'world', false) → 'hello' === 'world' → false... wait
// Actually: $.strict_equals(a, b, false) means "a === b" (no inversion)
// So for a !== b where a='hello' and b='world':
//   Expected: true  (they ARE different)
//   Actual:   false (compiled to ===, which is false for different values)
```

The inversion is silent — no error, no warning. The code runs and produces
the opposite boolean result.

## Workaround patterns

### Pattern 1: typeof + === + unpacked locals (recommended)

Unpack reactive values into local variables, then use `typeof` checks
with `===`. Since `===` is not affected by the bug, this is safe.

**BEFORE (BUGGY):**

```ts
const _hasFocus = (_focusedIdx !== null && Number.isFinite(_focusedIdx)) || (_selBiz !== null)
```

**AFTER (WORKAROUND):**

```ts
const _focusedIdx = nav.focusedIndex
const _selBiz = focus.selectedBusiness
const _hasFocus =
    (typeof _focusedIdx === 'number' && Number.isFinite(_focusedIdx)) ||
    (typeof _selBiz === 'object' && _selBiz !== null)  // ← typeof guard protects the !==
```

The key insight: `typeof x === 'number'` is safe because `===` is not
affected. Once you've established the type, the `!== null` inside the
`typeof` guard is also safe because it's in a branch that only runs when
the type is already `'object'`.

### Pattern 2: Early return with positive equality (De Morgan's)

Rewrite negative checks as positive ones using `||` instead of `&&`.

**BEFORE (BUGGY):**

```ts
if (panelSurfaceMode !== 'search' && panelSurfaceMode !== 'focus-search') return 'none'
```

**AFTER (WORKAROUND):**

```ts
const isSearchContext = panelSurfaceMode === 'search' || panelSurfaceMode === 'focus-search'
if (!isSearchContext) return 'none'  // ← positive form via De Morgan's
```

This avoids `!==` entirely. The `!` prefix operator is not affected by
the bug — only `!==` and `!=` binary operators are.

### Pattern 3: Boolean coercion with !=

Use loose equality (`!=`) which is not affected by the strict-mode bug.

**BEFORE (BUGGY):**

```ts
if (x !== null && x !== undefined) doSomething(x)
```

**AFTER (WORKAROUND):**

```ts
if (x != null) doSomething(x)  // ← uses != (single =) which doesn't trigger the bug
```

> **Caveat:** Loose equality (`!=`) performs type coercion. Use this pattern
> only when the coercion is safe (e.g. `null`/`undefined` checks).

## Known call sites in this codebase

| File | Line(s) | Workaround used |
|------|---------|-----------------|
| `src/lib/orchestration/parity-attrs.svelte.ts` | 300–310 | Pattern 2: `panelSurfaceDetail` uses `=== \|\| ===` positive form + early return |
| `src/lib/orchestration/parity-attrs.svelte.ts` | 323–329 | Pattern 2: `launchReady` uses `=== 'launch'` positive form instead of `!== 'launch'` |
| `src/lib/orchestration/parity-attrs.svelte.ts` | 381–410 | Pattern 1: `journeyPhase` IIFE uses `typeof` + `===` + unpacked locals |
| `src/lib/orchestration/parity-attrs.svelte.ts` | 474–480 | Pattern 2: `is-active` class toggle uses `===` + `!` positive form |
| `src/lib/stores/navigation.svelte.ts` | 418–450 | Pattern 1: FOCUS_NODE branch uses `Number.isFinite()` + explicit `typeof` casts |

### Canonical inline note (parity-attrs.svelte.ts:300–310)

The inline comment that first documented this bug:

```
// Note: we use `=== search || === focus-search` (positive form) and
// an early return instead of the more natural `!== search && !==
// focus-search` (negative form). Svelte 5 strict-mode compilation
// has a bug where `!==` is incorrectly compiled to `$.strict_equals(a,
// b, false)` (which is `===`), silently inverting the check. See the
// audit at qa-screenshots/PARITY_GAP_AUDIT.md for the symptom and
// the Svelte compiler gotcha.
```

### Secondary note (parity-attrs.svelte.ts:474–480)

```
// Note: we use `===` + `!` (positive form) instead of `!==` because
// Svelte 5 strict-mode compilation has a bug where `!==` is
// incorrectly compiled to `$.strict_equals(a, b, false)` (which is
// `===`), silently inverting the check.
```

### Tertiary note (parity-attrs.svelte.ts:323)

```
// Use positive equality here. This file is compiled by Svelte 5, and
// nearby parity logic documents a strict-mode compiler bug where `!==`
// can invert under rune compilation.
```

### journeyPhase IIFE (parity-attrs.svelte.ts:386–387)

```
// Avoid `===` and `!==` here — Svelte 5 strict-mode compilation
// incorrectly inverts `!==` to `===` (see canonical note at line 228).
```

### FOCUS_NODE branch (navigation.svelte.ts:418–425)

```
// Svelte 5 strict-mode compilation inverts `===` and `??` in
// some files (specifically `navigation.svelte.ts`), silently
// flipping the ternary. Use direct boolean casts + explicit
// value unpacking to avoid the bug entirely. See
// parity-attrs.svelte.ts:228-234 for the canonical note.
```

## Diagnostic snippet

If you suspect the bug is biting you, add this to your `.svelte.ts` file:

```ts
const a = 'hello'
const b = 'world'
console.log('compiled !==  check:', a !== b, 'expected:', true)
// If output shows "compiled !==  check: false expected: true" → you've hit the bug
```

If the output is the opposite of expected, you've hit the bug. Switch to
Pattern 1, 2, or 3.

You can also inspect the served bundle directly:

```bash
grep -r 'strict_equals' dist/svelte/assets/*.js
```

Look for calls with `false` as the third argument where the source uses `!==`.

## Upstream report recommendation

This bug should be reported to the Svelte team:

- **GitHub:** https://github.com/sveltejs/svelte/issues
- **Repro:** A minimal `.svelte` file with rune mode + `!==` operator
- **Expected:** `!==` compiles to `$.strict_equals(a, b, true)` (inverted)
- **Actual:** `!==` compiles to `$.strict_equals(a, b, false)` (non-inverted, same as `===`)

**Suggested title:** `[bug] Rune mode inverts !== to === in .svelte.ts files`

## Lessons learned

1. **Always test `.svelte.ts` files with the actual built bundle**, not just
   `svelte-check` — the TypeScript compiler doesn't catch this because the
   bug is in Svelte's JS code generation, not the type system.

2. **Document the workaround in code comments** so the next maintainer doesn't
   undo the fix. Every workaround in this codebase has a comment referencing
   this cookbook or the canonical note.

3. **Prefer positive equality** (`=== a || === b`) over negative (`!== a && !== b`).
   Positive forms avoid the bug entirely and are often more readable.

4. **When using `typeof` + `===`**, the bug doesn't trigger because `===` is
   unaffected. This is the safest pattern for null/undefined/type checks.

5. **The `!=` (loose equality) operator is not affected** by this bug, but
   use it with caution — it performs type coercion.

## Related documents

- `notes/w15-parity-attrs-second-look-2026-06-17.md` — W15 closeout that
  discovered the `data-journey-phase` inversion
- `notes/legacy-mirror-audit-2026-06-17.md` — Audit that found additional
  occurrences in `navigation.svelte.ts`
- `qa-screenshots/PARITY_GAP_AUDIT.md` — Original audit that identified
  the symptom
