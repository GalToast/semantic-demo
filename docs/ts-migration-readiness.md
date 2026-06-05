# TS Migration Readiness

## Current State (2026-06-05)

| Metric | Value |
|---|---|
| Total runtime modules | 144 |
| TS-only (native) | 0 |
| Dual (TS+JS shadow) | 144 |
| JS-only (unconverted) | 0 |
| TS coverage | 100.0% |
| TS/JS drift pairs | 0 |
| Entry imports ready | **44/44** |
| Entry ready for flip | **YES** |

## Key Files (js/modules/)

All 16 blocked entry-import modules now have `.ts` shadow siblings:

| Module | .ts Size | Type |
|--------|----------|------|
| `bridge-registry.ts` | 2.5 KB | Implementation |
| `camera-controls.ts` | 4.1 KB | Facade (core/restore/choreography) |
| `data-loader.ts` | 9.7 KB | Implementation |
| `exploration-mode.ts` | 2.9 KB | Implementation |
| `focus-pocket.ts` | 16.2 KB | Implementation (THREE.js) |
| `journey.ts` | 8.8 KB | Facade (60+ APIs) |
| `journey-compass-controller.ts` | 16.4 KB | Implementation |
| `journey-point-color.ts` | 8.1 KB | Implementation |
| `journey-webgl.ts` | 0.9 KB | Re-export facade |
| `lifecycle.ts` | 17.0 KB | Implementation |
| `micro-demo.ts` | 11.1 KB | Implementation |
| `scene-reveal.ts` | 2.6 KB | Implementation |
| `semantic-dive-ui.ts` | 11.2 KB | Implementation |
| `semantic-guide.ts` | 12.0 KB | Implementation |
| `semantic-threads.ts` | 16.3 KB | Implementation |
| `webgl-restore-adapter.ts` | 0.5 KB | Implementation |

## Verification

| Check | Result |
|-------|--------|
| `npm run typecheck` (tsc --noEmit) | **0 errors** |
| `npm run build:safe` (typecheck + esbuild) | **Build succeeds** (561.9 KB) |
| `npm run ts-readiness` | **44/44 imports ready, Entry flip: YES** |
| `node tests/ts-js-drift-contract.mjs --strict` | **0 drift pairs** |
| `npm run test` | **PASS** |
| `npm run qa:contract:desktop-idle` | **PASS** (5/5, headed) |

## Infrastructure

### tsconfig.typecheck.json
- Extends `tsconfig.json`, includes `js/modules/**/*.ts` for type checking
- `npm run typecheck` uses this config

### build-app.mjs: `--typecheck` gate
- Runs `tsc --noEmit` before esbuild step
- Exposed as `npm run build:safe`

### build-app.mjs: `--ts-readiness` report
- Scans all JS/TS files, reports coverage and entry readiness
- Exposed as `npm run ts-readiness`

## Path to app.ts Full Flip

### Phase 1: Convert blocked entry-import modules ✅ (DONE)
All 16 entry-import modules have `.ts` siblings. See table above.

### Phase 2: Flip the entry ✅ (DONE)
`scripts/build-app.mjs` now builds from `js/modules/app.ts`.

`app.ts` is the active runtime entry. It mirrors `app.js`'s direct import graph for drift checking, owns the init helpers and `init()` body, registers the WebGL restore handler, and self-starts the app:
```ts
setWebGLContextRestoreHandler(init);

init().catch((err) => {
    console.error('Initialization critical failure', err);
    throw err;
});
```

The cache-buster freshness contract also builds from `app.ts`, so `npm run test` validates the active entry rather than the legacy `app.js` entry.

### Phase 2.5: Port the init body ✅ (DONE)
The core init orchestration has been ported into `app.ts`. `app.js` is now a compatibility wrapper that preserves the legacy import/export surface for drift checks and older module consumers.

### Phase 2.6: Tighten compatibility wrapper -> NEXT
Reduce the `app.js` wrapper once downstream consumers no longer depend on its old import surface. The current wrapper intentionally keeps side-effect parity imports so the drift contract can continue proving the legacy entry graph while TypeScript owns runtime boot.

### Phase 3: Remove JS shadows -> FUTURE
Once TS modules are the runtime source:
- Delete JS shadow files
- Remove them from `tsconfig.typecheck.json` explicit includes
- Update drift contract baseline (`npm run ts-js-drift --update`)

**Contract behavior during Phase 3 retirement**: The drift contract already handles TS-only native modules correctly. When a JS shadow is deleted:
- `computeDrift()` skips TS-only modules (no JS to compare) — no false drift
- `--progress` reclassifies modules as `tsOnly (native)` — correct tracking
- Type-only imports (`import type ...`) are already excluded from drift comparison
- `KNOWN_BASELINE` entries for retired modules appear as "improvements" (optional cleanup)

No source edits to the drift contract or ts-readiness tools are needed for Phase 3.

## Remaining JS-only Modules

None. All 144 runtime modules now have TypeScript siblings.

The remaining migration work is not conversion; it is retiring the compatibility JS layer once the runtime/import graph can point directly at TypeScript modules.

## New Commands

| Command | Purpose |
|---|---|
| `npm run build:safe` | Typecheck + build |
| `npm run ts-readiness` | Migration readiness report |
| `npm run check:ts-progress` | Drift progress + next steps |
