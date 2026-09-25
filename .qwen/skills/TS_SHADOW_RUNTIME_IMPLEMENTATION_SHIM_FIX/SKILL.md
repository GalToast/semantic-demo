---
name: TS_SHADOW_RUNTIME_IMPLEMENTATION_SHIM_FIX
description: Professional fix pattern for same-basename .ts/.js migration seams where a TS shim shadows a JS runtime file.
source: auto-skill
extracted_at: '2026-06-09T15:57:50.141Z'
---

# TS Shadow Runtime Implementation Shim Fix

## When to use this pattern
Use when a `*.ts` file exists beside `*.js` with the same basename and the TS file was added as a compatibility shim (re-exporting the JS file), but the project goal is to migrate the implementation to TypeScript while preserving all existing JS importers.

## Core pattern
1. Make the `*.ts` file the canonical runtime implementation.
2. Make the legacy `*.js` file a thin re-export wrapper around `./<name>.ts`.
3. Move runtime-heavy code (Proxy factories, side-effect registration, DOM/window mutation) into the `.ts` file unchanged except for TS syntax.
4. Keep any `import type` helpers in `*.d.ts` files (or a typed module shim in `src/lib/types/`).
5. Use the typed module declaration surface to provide strong types for `@legacy/<name>.js` consumers.

## Specifics for state-like singletons
For modules like `js/state.ts/js/state.js`:
- The `.ts` file keeps the full runtime proxy, raw state initialization, mutation helpers, and key-set exports.
- The `.js` file becomes:
  ```js
  export {
    _rawState,
    state,
    withStateMutation,
    CRITICAL_KEYS,
    TRACKED_SUB_KEYS,
  } from './state.js';
  ```
- Ambient types should continue serving legacy consumers:
  - `types/<module>.d.ts` declares public surface.
  - `src/lib/types/legacy-modules.d.ts` declares `@legacy/<module>.js` using the typed surface.
- For runtime files with hard-to-model Proxy/side-effect behavior, add a single `// @ts-nocheck` at the top of the `.ts` file instead of hiding a self-import cycle. This is acceptable only when:
  - The `.ts` file is the canonical runtime file.
  - All typed intake is provided by `*.d.ts` / typed helpers elsewhere.

## Verification contract
Treat these checks as the required validation sequence after the change:
- `npm run check` must be green (Svelte build + svelte-check).
- `npm run build:safe` must pass.
- `npm run check:ts-progress` must pass.
- Run `git diff --stat HEAD -- <canonical ts file> <compat js file> <type declarations>` to confirm the seam changed cleanly.

## Why this beats the shim bandage
A shim with `export { state } from './state.js'` only works if the runtime path stops resolving the `.ts` neighbor. When it does resolve, the bandage becomes a self-import cycle. Making the `.ts` file canonical removes the ambiguity and aligns the migration direction: the implementation lives in TS, compatibility lives in JS, and type safety is provided via ambient typings.
