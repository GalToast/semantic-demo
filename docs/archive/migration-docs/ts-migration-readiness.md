# TS Migration Readiness

## Current State (2026-06-13)

| Metric | Value |
|---|---|
| Total runtime modules | 153 |
| TS-only (native) | 104 |
| Dual (TS+JS shadow) | 49 |
| JS-only (unconverted) | 0 |
| TS coverage | 100.0% |
| TS/JS drift pairs | 0 |

## Phase 3: Native TS Coverage (COMPLETE)
Every runtime module now has a TypeScript source. `npm run check:ts-progress` reports 0 JS-only modules and 0 TS/JS drift pairs.

The important nuance: native TS coverage is complete, but JavaScript shadow files have **not** all been retired. As of 2026-06-13 there are 49 intentional BOTH pairs (`.ts` + `.js`) in the legacy/reference lane. Do not delete or classify those `.js` files as dead without checking import reachability and the BOTH-pattern rules in `AGENTS.md`.

- **Entry point:** `js/modules/app.ts` is the legacy/reference bundle entry.
- **Production shell:** Svelte/Vite remains the product entry.
- **Verification:** `npm run check:ts-progress` confirms 0 drift and 100% TS coverage, not full JS shadow deletion.

## Verification Status

| Check | Result |
|-------|--------|
| `npm run typecheck` (tsc --noEmit) | **0 errors** as of 2026-06-13 |
| `npm run check:svelte` | **0 errors, 0 warnings** as of 2026-06-13 |
| `npm run build:svelte` | **Build succeeds** as of 2026-06-13 |
| `npm run check:ts-progress` | **153/153 TS-covered, 49 BOTH, 0 JS-only, 0 drift** as of 2026-06-13 |
| `npm run test:unit` | **70 active tests pass** as of 2026-06-13 |

## Infrastructure

### tsconfig.typecheck.json
- Optimized to include TypeScript sources in the legacy/reference lane.
- `npm run typecheck` validates the TypeScript source truth, but does not prove JavaScript shadows are removable.

### build-app.mjs
- Uses `js/modules/app.ts` as the sole entry point.
- The `--typecheck` gate ensures code quality before bundling.

## Migration History

### Phase 1: Convert blocked entry-import modules ✅ (DONE)
### Phase 2: Flip the entry ✅ (DONE)
### Phase 2.5: Port the init body ✅ (DONE)
### Phase 2.6: Tighten compatibility wrapper ✅ (DONE)
### Phase 3: Reach native TS coverage ✅ (DONE)
The runtime reached full TypeScript source coverage with no JS-only modules.

### Phase 4: Retire remaining JS shadows ⏳ (IN PROGRESS)
49 BOTH pairs remain. Treat shadow retirement as an explicit, verified cleanup phase rather than a completed fact.

## New Commands

| Command | Purpose |
|---|---|
| `npm run build:safe` | Typecheck + build |
| `npm run ts-readiness` | Migration readiness report |
| `npm run check:ts-progress` | Drift progress + next steps |
