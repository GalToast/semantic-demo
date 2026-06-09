# TS Migration Readiness

## Current State (2026-06-08)

| Metric | Value |
|---|---|
| Total runtime modules | 151 |
| TS-only (native) | 151 |
| Dual (TS+JS shadow) | 0 |
| JS-only (unconverted) | 0 |
| TS coverage | 100.0% |

## Phase 3: Shadow Retirement (COMPLETE)
All legacy JavaScript shadow files in `js/modules/` have been removed. The application now runs exclusively on native TypeScript source files bundled via `esbuild`.

- **Shadow removal:** 151 `.js` files deleted.
- **Entry point:** `js/modules/app.ts` is the canonical entry.
- **Verification:** `npm run check:ts-progress` confirms 0 drift and 100% native coverage.

## Verification Status

| Check | Result |
|-------|--------|
| `npm run typecheck` (tsc --noEmit) | **0 errors** |
| `npm run build:safe` (typecheck + esbuild) | **Build succeeds** |
| `npm run check:ts-progress` | **151/151 native, 100% coverage** |
| `npm run test:contract` | **PASS** |
| `npm run lint:all` | **PASS** |

## Infrastructure

### tsconfig.typecheck.json
- Optimized to include only `.ts` files within `js/modules/`.
- `npm run typecheck` validates the pure TypeScript source truth.

### build-app.mjs
- Uses `js/modules/app.ts` as the sole entry point.
- The `--typecheck` gate ensures code quality before bundling.

## Migration History

### Phase 1: Convert blocked entry-import modules ✅ (DONE)
### Phase 2: Flip the entry ✅ (DONE)
### Phase 2.5: Port the init body ✅ (DONE)
### Phase 2.6: Tighten compatibility wrapper ✅ (DONE)
### Phase 3: Remove JS shadows ✅ (DONE)
The legacy compatibility layer and all JS shadows were retired on 2026-06-08, completing the transition to a native TypeScript engine.

## New Commands

| Command | Purpose |
|---|---|
| `npm run build:safe` | Typecheck + build |
| `npm run ts-readiness` | Migration readiness report |
| `npm run check:ts-progress` | Drift progress + next steps |
