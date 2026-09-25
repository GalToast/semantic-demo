---
name: TS_MIGRATION_WIP_TYPE_ERROR_FIXES
description: Targeted fixes for recurring TS errors in WIP migration files: missing Three.js type imports, stale store imports replaced with bridge stubs, multi-arg `seededUnit` calls collapsed to index+single salt, and `null` index access guarded.
source: auto-skill
extracted_at: '2026-06-08T16:46:00.000Z'
---

# TS Migration WIP Type Error Fixes

## Trigger

Use when `npm run check:svelte` surfaces a cluster of TS errors in untracked/WIP migration files, especially these recurring shapes:

- `Cannot find name 'Object3D'` / `Module 'three' has no exported member 'OrbitControls'`
- `"@lib/stores/..." has no exported member named 'X'`
- `Property 'Y' does not exist on type '{}'` after bridge casts
- `Expected 1-2 arguments, but got 3+` on `seededUnit`
- `Type 'null' cannot be used as an index type`

## Core procedure

### 1. Run and capture the exact error list first

- Re-run `npm run check:svelte` and copy the full output.
- Distinguish target WIP files from pre-existing errors in non-target files; do not touch the latter.

### 2. Read targets, then verify symbols before editing

- For "missing export" errors, grep the actual module path to confirm whether the symbol exists, was renamed, or was removed.
- For `seededUnit` arity errors, read the helper signature in `src/lib/utils/seeded-random.ts` (currently `seededUnit(index, salt = 0)`).

### 3. Fix by pattern

**Three.js type imports**
- If `Object3D` (or `Mesh`, `Material`, etc.) is used in a TS file but not imported, add it to the existing `import type { ... } from 'three'`.
- If OrbitControls is imported from `'three'`, split it into its own `import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'`.

**Stale store imports → local bridge stub**
- Remove the dead import.
- Add a local function returning the minimum shape the caller needs.
- Prefer returning data from `(globalThis as Record<string, unknown>).__semanticState` when legacy state is the only current source, and type-cast carefully to avoid `{}`.

```ts
function getNavState(): Record<string, unknown> {
  return (globalThis as Record<string, unknown>).__semanticState as Record<string, unknown> ?? {};
}
```

**`seededUnit` arity collapse**
- Replace 3+ arg calls with 2 args by packing extra state into a single salt using a stable linear combination.
- Example: `seededUnit(index, a, b, c, d)` → `seededUnit(index, a * 1000 + b * 100 + c * 10 + d)`.

**Bridge-cast `{}` narrowing**
- When accessing `__semanticState?.points`, extract into a typed intermediate before optional chaining:

```ts
const semanticState = globalThis as Record<string, unknown>;
const typed = semanticState.__semanticState as { points?: ... } | undefined;
const points = typed?.points;
```

**`null` index access**
- Extract the possibly-null index into a local, guard it with `!== null` and `Number.isFinite(...)` before using it as an array index.

```ts
const idx = state.navState.focusedIndex;
if (idx !== null && Number.isFinite(idx) && arr[idx]) { ... }
```

### 4. Verify per-file then verify the full cluster

- Re-run `npm run check:svelte` after fixes.
- Confirm the original WIP error cluster is eliminated before returning.

## Anti-patterns

- Do not edit non-target files whose errors are unrelated to the WIP cluster.
- Do not feature-gate or add new runtime behavior; keep the runtime behavior identical.
- Do not change callers when the caller can be adjusted in place with a stable salt combination.
