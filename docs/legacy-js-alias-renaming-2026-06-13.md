# @legacy → @legacy-js Alias Renaming (Ticket 9D)

**Date:** 2026-06-13
**Commit:** `28007ab`

## What happened

The Vite/Vitest/TypeScript path alias `@legacy` was renamed to `@legacy-js`
across all configuration files (`vite.config.ts`, `vitest.config.js`,
`src/tsconfig.json`) and all 36 consuming import sites in `src/`.

## Why

1. **Self-documenting.** `@legacy-js` immediately signals that this alias
   points to the legacy `js/` runtime bridge — distinct from the canonical
   `@/`, `@lib/`, `@components/` aliases. Future readers don't need to look
   up what `@legacy` resolves to.

2. **Disambiguation.** During the BOTH-pattern migration, the old `@legacy`
   name was ambiguous — it could be confused with the `legacy-reference/`
   archive or other legacy-adjacent concepts. `@legacy-js` anchors the
   alias to the specific `js/` directory it bridges into.

3. **Future retirement wave.** The rename makes a future "drop the alias
   entirely" wave safer: every consumer now carries a visually distinct
   prefix (`@legacy-js/`) that can be found with a single `rg` query,
   making Option B (rewriting to relative paths) straightforward.

## Scope

| Layer | Files changed |
|---|---|
| Vite config | `vite.config.ts` |
| Vitest config | `vitest.config.js` |
| TypeScript paths | `src/tsconfig.json` |
| Svelte components | 1 file (`MapView.svelte`) |
| TypeScript source | 34 files under `src/lib/` |
| Test assertions | `demo-choreography-exports.test.ts` |

**Total:** 39 files, 148 lines changed (all mechanical renames).

## Verification

- `npm run check` — 0 errors
- `svelte-check` — 0 errors, 0 warnings
- `npm run lint` — 0 errors (20 pre-existing warnings)
- `npm run test:unit` — 15/15 files, 119/119 tests pass
- `npm run build:svelte` — builds successfully
- `rg "@legacy" src/` — 0 hits (old alias fully removed)
- `rg "@legacy-js" src/` — 36 hits (all expected files)

## What's NOT changed

- No `js/` files were modified — the legacy bridge tree is untouched
- No runtime behavior changes — module resolutions are identical
- No new `@legacy-js` imports were introduced — this is a rename, not expansion

## Next steps

Ticket 9E (future wave): rewrite all 36 `@legacy-js/*` imports as
relative paths, then drop the alias from `vite.config.ts`,
`vitest.config.js`, and `src/tsconfig.json` entirely.
