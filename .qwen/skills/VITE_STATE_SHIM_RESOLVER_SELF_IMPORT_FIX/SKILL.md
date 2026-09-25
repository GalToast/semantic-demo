---
name: VITE_STATE_SHIM_RESOLVER_SELF_IMPORT_FIX
description: Fix a TS shim next to a legacy JS module when Vite/Svelte resolves the shim back to itself, causing svelte-check circular/self-import errors.
source: auto-skill
extracted_at: '2026-06-09T13:58:55.077Z'
---

# Vite State Shim Resolver Self-Import Fix

## When to use

- A TS shim exists next to a legacy JS module (e.g. `js/state.ts` shimming `js/state.js`).
- `npm run check` or `svelte-check` reports a circular/self-import error from the shim re-exporting the JS sibling.
- The error points back to the TS shim even though the shim intends to re-export the JS file.

## Trigger

- Task mentions a TS shim for a JS module and a svelte-check error such as:
  - "Circular definition of import alias"
  - "Cannot find module './state.js' or its corresponding type declarations"
- The user asks to fix the circular export around `js/state.ts`-style shims.

## Detection

1. Read the TS shim. Look for:
   - `export { ... } from './state.js';`
   - Any `export *` or named re-export from a JS sibling in the same directory.
2. Read the Svelte/TS consumer error. If it reports the TS shim as the resolver target, suspect Vite/Svelte resolved the JS specifier to the TS shim because the shim exists next to the JS file.
3. Confirm by checking `vite.config.ts` aliases and root settings. Aliases like `@legacy: resolve(__dirname, 'js')` can make the shim the nearest match for `./state.js` relative imports.
4. Confirm by reproducing the failure:
   - `npm run check`
   - Capture whether removing or renaming the shim changes the error path.

## Fix strategy

Use the smallest safe unblocker that preserves runtime behavior.

### Recommended: explicit type-check suppression on the JS re-export

In the TS shim, keep the JS re-export but annotate it as an expected resolver edge case:

```ts
// @ts-expect-error Vite/Svelte resolves './state.js' to this TS shim unless the JS file is requested directly.
export { state } from './state.js';
```

Use `@ts-expect-error` instead of `@ts-ignore` when:
- The line is intentionally invalid under strict TS resolution.
- You want future tooling to fail loudly if the assumption changes.

Use `@ts-ignore` only if the project already standardizes on ignore for migration shims.

### Alternative: typed module declaration for a query-string shim

If you want the TS shim to re-export through a non-`.js` specifier to avoid self-resolution:
- Add a `declare module './state.js?legacy' { ... }` block in the shim.
- Re-export the JS module through `'./state.js?legacy'`.

This is more invasive and often fails `svelte-check` because the augmenting module name must exist in the current package graph. Prefer the `@ts-expect-error` approach unless the project explicitly supports query-based legacy shims.

## Procedure

### Step 1: Inspect shim and resolver behavior

1. Read `js/state.ts` and `js/state.js`.
2. Read `vite.config.ts` to understand alias resolution and `fs.allow` entries.
3. Grep for imports of the shim/JS module from `src/`:
   - `src/**/*.svelte`
   - `src/**/*.ts`
4. Note whether consumers import `@legacy/state.js`, `../state.js`, or `js/state.js`.

### Step 2: Apply the shim annotation

1. Edit the TS shim to add `@ts-expect-error` on the JS re-export line.
2. Keep the original JS re-export intact so runtime behavior stays the same.
3. Do not change the legacy JS file.

### Step 3: Verify build and type surface

Run:
- `npm run check`
- `npm run build:safe`
- `npm run test:unit -- <focused test>` if prior failures existed from the same shim issue

Expected:
- `svelte-check`: 0 errors
- `vite build`: succeeds
- `tsc --noEmit -p tsconfig.typecheck.json`: passes

### Step 4: Document the assumption

Add a short comment in the shim explaining:
- Why the JS re-export still works at runtime.
- Why TS/Vite checks need the assumption override.
- What would invalidate the assumption (e.g. deleting `js/state.js`, changing Vite resolution, removing the alias mapping).

## Verification protocol

1. Re-run `npm run check` and confirm `svelte-check` is green.
2. Run `git diff -- <shim>` to confirm the change is minimal.
3. If a unit test previously failed due to shim resolution, re-run that test file after the shim fix.

## Anti-patterns

- Do not replace the JS re-export with a TS-only implementation unless the goal is to fully retire the legacy JS file.
- Do not add broad `// @ts-ignore` blocks across many files when the root cause is one shim resolver edge case.
- Do not change `tsconfig.json` excludes to mask shim resolution issues.
- Do not assume the error indicates a real circular runtime dependency; TS/Vite resolution can report circularity even when runtime behavior would not loop.

## Related skills

- `PRODUCTION_READINESS_GATE` — use when this shim fix is part of a broader release readiness sweep.
- `CACHE_BUSTER_BUILD_TEST_HASH_MISMATCH` — use if cache-buster failures remain after this shim fix.
- `TS_JS_DRIFT_CLOSURE_SLICE` — use when the shim fix is part of a wider drift-closure or shell-wiring slice.
