---
name: state-ts-migration-boundary-fix
description: Canonicalize legacy JS state modules into TS while preserving runtime behavior and migration boundaries
source: auto-skill
extracted_at: '2026-06-09T16:32:20.148Z'
---

# State TS Migration Boundary Fix

## When to use
- Legacy `js/state.js` is the runtime source of truth but a TS shadow (`js/state.ts`) exists as a bandage or shim.
- The goal is to make `js/state.ts` the canonical implementation without breaking the Svelte/Vite resolution path or legacy importers.
- You need to preserve Proxy-based mutation guards, `window.withStateMutation`, and dev-mode deep tracking exactly as they behave in `js/state.js`.

## Approach

### 1. Port the implementation, don't shim it
- Copy the full `js/state.js` body into `js/state.ts` (Proxy, `_rawState`, `_makeProdProxy`, helpers).
- Keep runtime semantics identical: same `CRITICAL_KEYS`/`TRACKED_SUB_KEYS` logic, same `semanticDiveMode`/`focusedNode` derived properties.
- Do **not** use `export { state } from './state.js'` — that recreates the original cycle/bandage problem.

### 2. Handle TS strictness surgically
- Add `// @ts-nocheck` at the top of `js/state.ts` **only** if the file uses runtime Proxy patterns that are impractical to type precisely (e.g., `target[prop]`, `new Proxy(obj, { set(t, p, v, r) })`).
- Use `Record<PropertyKey, unknown>` casts at Proxy boundaries instead of `any`.
- Use `typeof prop === 'string'` guards before calling `.has()` on `CRITICAL_KEYS`/`TRACKED_SUB_KEYS` so TS doesn't widen to `string | symbol`.
- Add explicit types for module-scope caches (`_devWarned: Set<string> | null`, `_prodProxyCache: StateProxyCache | null`).

### 3. Make `js/state.js` a thin compatibility shim
```js
export {
  _rawState,
  state,
  withStateMutation,
  CRITICAL_KEYS,
  TRACKED_SUB_KEYS,
} from './state.ts';
```
- Do **not** put `@ts-expect-error` in `js/state.ts`.
- Do **not** re-export from `../src/lib/state/with-state-mutation.ts` inside `js/state.ts` if it creates a second import path — import it once inside `js/state.ts` and re-export the aliases.

### 4. Fix ambient declarations for legacy consumers
- Update `src/lib/types/legacy-modules.d.ts` so `declare module '@legacy/state.js'` re-exports typed shapes from `types/state.d.ts` (e.g., `SemanticState`) instead of `any`.
- If the project already has `declare global { interface Window { withStateMutation?: ... } }`, make the property optional (`?`) to avoid duplicate-interface modifier errors.

### 5. Verify with the migration gates
Run in order:
1. `npm run check` — svelte-check + vite build must be 0 errors/warnings.
2. `npm run build:safe` — typecheck + bundle must pass.
3. `npm run check:ts-progress` — confirm 100% TS-only coverage and `app.ts` as active entry.
4. `npm run test:unit` — confirm no regressions.
5. `npm run test` — confirm full static gate passes (cache, ownership, tokens, etc.).

### 6. Clean up adjacent artifacts
- If a brittle test file like `tests/unit/bridge-degraded.test.js` exists solely for the old seam and coverage is provided elsewhere, delete it after confirming no other file imports it.
- If cache-buster drift appears after rebuilds, run `npm run refresh:cache` (do not manually edit hashes).
- If CSS ownership contracts flag new `.selector` definitions in `mobile_premium__*.css`, update `tests/css-ownership-check.mjs` baselines with the exact count and a comment, rather than moving the rule to a different file.

## Why this order
The `js/state.ts` boundary is the highest-risk migration seam because every module in `js/modules/` imports from it. Getting it wrong cascades into 86+ svelte-check errors. Professionalizing it first unblocks the rest of the TS migration and prevents the bandage from becoming permanent.

## Anti-patterns to avoid
- Keeping `@ts-expect-error` in `js/state.ts` to suppress a self-import cycle — fix the boundary instead.
- Porting `js/state.js` into `js/state.ts` and then leaving `js/state.js` as the real runtime source — creates confusion about which file is canonical.
- Adding `any` types to silence errors in the Proxy traps — use `Record<PropertyKey, unknown>` and runtime `typeof` guards.
- Editing test files just to make them pass when the underlying fixture is obsolete — prefer deletion if coverage is redundant.

## Consolidated types pattern (learned 2026-06-10)
When moving types from `types/state.d.ts` into `js/state.ts`:

1. **Remove `// @ts-nocheck` at line 1** — this is the critical first step; svelte-check will not resolve types from `types/state.d.ts` if the file is excluded from tsconfig, so the types MUST live in `js/state.ts` itself.
2. **Declare all interfaces/types locally** between `declare global` and `export const _rawState`.
3. **Use `as unknown as T` casts** for properties initialized to `null` that have non-null types (e.g., `scene: null as unknown as SemanticState['scene']`). This preserves runtime while satisfying the type.
4. **Use `satisfies NestedType`** for inline objects like `navState` that are missing properties in the inferred shape — add the missing properties and append `satisfies NavState`.
5. **Type Maps/Sets explicitly** — `new Map<string, SemanticNode>()` instead of `new Map()`, `new Set<string>()` instead of `new Set()`. Unparameterized Maps infer as `Map<unknown, unknown>` which conflicts with typed properties.
6. **Timeout IDs**: use `ReturnType<typeof setTimeout>` — `null` is NOT assignable to this type; use `undefined` instead if the property allows `Timeout | undefined`.
7. **Proxy typing**: type the result as `export const state: SemanticState = new Proxy(...)` but use targeted `// @ts-ignore` comments on the handler lines that use dynamic `target[prop]` with `string | symbol` keys. Do NOT blanket `@ts-nocheck` the file.
8. **Dev-mode block**: add explicit types to `_devWarned`, `_devProxyCache`, `_prodProxyCache`, `_getTopKey`, `_makeProdProxy`, `_track`, `_trackSub`. Use `as unknown as Record<string, unknown>` for dynamic key access on `_rawState`.
9. **Remove augmentation blocks** from `types/state.d.ts` (`declare module '../state.js' { ... }`) after the types are local.

## d.ts cleanup pattern
After types are consolidated into `js/state.ts`:
- Delete the `declare module '../state.js' { ... }` and `declare module '../../state.js' { ... }` blocks from `types/state.d.ts`.
- Keep the interface/type declarations in `types/state.d.ts` if it's still included by tsconfig; delete the file entirely only after all consumer imports are redirected (Phase 4).
- Update any `src/lib/types/legacy-modules.d.ts` references to point to `js/state.ts` instead of `types/state.d.ts`.

## Verification gates for this boundary
- `npm run typecheck` must be 0 errors.
- `npm run test:unit` must be 339/339 pass.
- `npm run build` must produce ~571.9kb (within 1kb).
- `npm run check:svelte` error count should decrease (types unblock svelte-check's import chain resolution).
- `npx tsc --noEmit -p tsconfig.typecheck.json --listFiles | grep js/modules | grep .ts` — confirm the js/modules files are actually being checked; watch for the exclude trap (`"exclude": ["js"]` in base tsconfig swallows child includes).

## Orphan import redirect checkpoint (narrow reconciliation pass)

Use this when `types/state.d.ts` is already deleted but a small number of legacy importers still reference the old path. This is a post-consolidation repair slice, not a broad refactor.

### Scope discipline
- Edit only identified imports that stale-path to `../../types/state.ts`, `types/state.d.ts`, or equivalent legacy type surfaces.
- Document-but-don’t-touch adjacent out-of-scope errors (e.g., `src/lib/` named-export errors against `@legacy/*`).

### Procedure

1. **Confirm the canonical source already exports the needed symbols.**
   Grep `js/state.ts` for each needed interface/type before redirecting.

2. **Redirect exact relative imports in owned files only.**
   Change `../../types/state.ts` → `../state.ts` (or the closest correct relative path). Prefer `import type` when no runtime import is required.

3. **Prove orphan status before claiming completion.**
   Run a targeted regex check against consumed extensions:
   - `from\s+['"].*types/state`
   - `../../types/state\.ts`
   - `types/state\.d\.ts`
   Zero matches (excluding comments) = safe to report orphaned.

4. **Verify with both tiers.**
   - `npm run typecheck` — must remain 0 errors.
   - `npm run check:svelte` — count alone is not a gate; inspect whether your owned files are now error-free versus any change coming from `src/` seams.

5. **Report ownership boundaries and pre-existing errors explicitly.**
   State which files changed, which files were inspected read-only, and which post-change svelte-check errors are owned vs. pre-existing/out-of-scope.

### Common pitfalls
- Treating a falling svelte-check count as proof of correctness — verify the error is not just moving from one out-of-scope file to another.
- Believing `types/state.d.ts` is still present — a deleted `.d.ts` is often resolved by Svelte-track `@lib/types/state` instead of `types/state.d.ts`; that is correct and not a regression.
- Broadening the import rewrite beyond the assigned ownership slice.
