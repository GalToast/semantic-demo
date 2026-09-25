---
name: TS_NIGHTCHECK_GRADUATION_REPAIR
description: Remove `@ts-nocheck` from a TS runtime sibling by adding missing live state properties to `types/*.d.ts`, replacing broad `Record<string, unknown>` casts with narrow typed access, and validating exports/signatures against the JS source of truth.
source: auto-skill
extracted_at: '2026-06-08T18:40:42.520Z'
---

# TS @ts-nocheck Graduation Repair

Use when a typed sibling still carries `// @ts-nocheck` because the type system lacks live properties written by runtime code.

## Invariants
- JS file is behavioral source of truth; TS sibling must match.
- State properties set by the module at runtime that are absent from `_rawState` must be declared in `types/**/*.d.ts` and mapped into the shared state interface.
- Remove `// @ts-nocheck` only after the repaired file passes `npm run typecheck`.

## Procedure
1. Identify global state writes/reads the TS sibling bypasses with `(state as Record<string, unknown>)` or similar.
2. Add each missing live property to the shared state interface in `types/state.d.ts` (or the relevant ambient declaration file) with the narrowest type that matches JS behavior.
3. Replace broad casts with typed property access; if a selector’s return type is too narrow for a DOM API like `removeEventListener`, cast the selector result at the call site instead of casting the state object.
4. Add any missing option flags that gate the live behavior (e.g., `deferred?: boolean` on restore options).
5. Run `npm run typecheck`. If failures remain, stop and report blockers instead of broadening scope.
6. If the module participates in wider checks, also run `npm run check:svelte` and `npm run check:ts-progress`.
7. Compare the JS and TS siblings for behavior drift; flag any semantic mismatch before removing `@ts-nocheck`.

## Verification gates
- `npm run typecheck`
- `npm run check:svelte`
- `npm run check:ts-progress`
- Targeted existing tests if available; otherwise state that no targeted test was found.
