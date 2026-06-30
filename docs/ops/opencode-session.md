# OpenCode Session: TypeScript Entry-Point Readiness

**Date:** 2026-06-05
**Task:** Verify/complete conversion of 16 blocked entry-import JS modules to TypeScript shadow files

## Current Status (2026-06-29)

The TS shadow conversion this session described is **fully completed and superseded by W47/W48**. The legacy `js/modules/*.ts` shadow files no longer exist; their work has been ported into the canonical Svelte 5 / TypeScript runtime under `src/lib/`. See:

- `docs/migration-plan.md` § "Engine kernel" — engine deployment
- `docs/typing-contract.md` — current `as any` budget (5 occurrences, 43 files affected, down from 575 in W47-A)
- `src/lib/engine/` (41 files), `src/lib/journey/`, `src/lib/orchestration/`, `src/lib/state/` for the current owners
- `tests/unit-active/as-any-budget.test.ts` for the live budget enforcement

This doc is retained as a **historical snapshot** of the migration's midway point. The "Next Steps" section at the bottom is no longer active work.

---

## Actual State (as of 2026-06-05; superseded)

**The 16 target `.ts` shadow files already exist.** They were created as part of prior migration work. The `ts-readiness` report confirms the entry point is already ready for flip:

```
Entry imports: 44/44 ready
Entry ready for flip: YES
TS coverage: 56.9%
```

### Historical Shadow-File Inventory (all since migrated into `src/lib/`)

| Shadow file (since removed) | Modern home |
|---|---|
| `js/modules/bridge-registry.ts` | deprecated — dewindowed; `__APP_STATE__` removed; replaced by `src/lib/state/app.svelte.ts` |
| `js/modules/camera-controls.ts` | `src/lib/engine/camera-controls.ts` (+ `camera-controls-core.ts`, `camera-choreography/`, `camera-controls-restore.svelte.ts`) |
| `js/modules/data-loader.ts` | `src/lib/data-loader.ts` (moved to lib root) |
| `js/modules/exploration-mode.ts` | `src/lib/orchestration/lifecycle.ts` |
| `js/modules/focus-pocket.ts` | `src/lib/journey/focus-pocket.ts` + `focus-pocket-geometry.ts` |
| `js/modules/journey.ts` | `src/lib/journey/journey.ts` |
| `js/modules/journey-compass-controller.ts` | `src/lib/orchestration/compass-controller.ts` (+ `compass-state.ts`) |
| `js/modules/journey-point-color.ts` | `src/lib/journey/point-color.ts` (rename pending per Step 3 cleanup plan) |
| `js/modules/journey-webgl.ts` | webgl helpers split into `src/lib/engine/three-engine-*.ts` (multiple files) |
| `js/modules/micro-demo.ts` | `src/lib/demo/choreography.ts` (+ `camera.ts`, `guards.ts`, `ui.ts`, `demo-script.ts`) |
| `js/modules/lifecycle.ts` | `src/lib/orchestration/lifecycle.ts` + `src/lib/stores/lifecycle.ts` |
| `js/modules/scene-reveal.ts` | `src/lib/engine/scene-reveal.ts` |
| `js/modules/semantic-dive-ui.ts` | `src/lib/journey/semantic-dive.ts` + `semantic-overlay.ts` |
| `js/modules/semantic-guide.ts` | `src/lib/journey/semantic-guide.ts` (+ `semantic-guide-payload.ts`) |
| `js/modules/semantic-threads.ts` | `src/lib/semantic-threads.ts` (still at lib root; rename to `src/lib/engine/semantic-threads.ts` pending per Step 3 cleanup plan) |
| `js/modules/webgl-restore-adapter.ts` | deprecated — replaced by Engine WebGL restore path in `src/lib/engine/` |

### Historical Verification Results

| Check | Result |
|-------|--------|
| `npm run typecheck` (tsc --noEmit) | **0 errors** (was 0 errors; current `npm run test:unit` enforces a tighter `as any` budget of 5) |
| `npm run build` (esbuild) | **Build succeeds** (562.6 KB in 403ms) (current bundle ~1,217 KB raw / ~338 KB gzip per `docs/migration-plan.md`) |
| `npm run ts-readiness` | **44/44 imports ready, Entry flip: YES** (current state: full Svelte 5 + TS shell at `dist/svelte/index.html`) |

### Status of "Stale Docs" item

`docs/ts-migration-readiness.md`: **never written / no longer applicable.** This doc was the planned follow-up. The actual current state lives in `docs/typing-contract.md` and `docs/migration-plan.md`. There is no `docs/ts-migration-readiness.md` to update; refer to those two docs instead.

---

## Historical Next Steps (no longer active)

> These items were active as of 2026-06-05. They have since been completed or superseded by the W47/W48 migration arc.

1. Doppler / immigrate `app.js` logic into `app.ts`. **Completed**: `app.ts` is the Svelte `src/main.ts` entry; legacy `app.js` no longer exists.
2. Convert remaining 62 JS-only modules. **Completed**: all entry-path modules are now TypeScript under `src/lib/`. Sub-modules are similarly typed. The `as any` budget is currently 5 (per `docs/typing-contract.md`).
3. Update `docs/ts-migration-readiness.md` — **N/A**, that doc was never created; the live readiness doc is `docs/typing-contract.md`.
