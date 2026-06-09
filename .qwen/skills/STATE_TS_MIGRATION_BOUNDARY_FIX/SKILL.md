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
