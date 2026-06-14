# Wave 10 Legacy Runtime Audit — Ticket W1

**Date:** 2026-06-13
**Outcome:** Partially retired — BOTH-pattern shadows archived in W2; engine kernel remains active
**Auditor:** Pi main lane
**Companion docs:**
- `legacy-reference/js-both-shadows-2026-06-13/README.md` — W2 archive record
- `docs/wave-10-legacy-retirement.md` — W3 retirement record (companion to this audit)

## Summary

The `js/` directory is **not dead legacy code**. It is the **active Three.js engine runtime** (the kernel) that the Svelte UI layer wraps via the imperative bridge in `src/lib/engine/`. Archiving `js/` entirely would break the application.

However, the W1 audit found **50 BOTH-pattern `.js` shadow files** in `js/` that were vestigial — thin `export * from './X.ts'` re-exports of their `.ts` siblings, kept around for the original migration's bundler resolution. These were retired + archived in W2 (commit `7fc7b9d`); the `.ts` files remain as the canonical engine kernel implementations.

## Audit Findings

### Cross-reference count
- **38 files in `src/`** have hard ES module imports into `js/`
- **~80 unique import paths** from `src/` into `js/modules/` and `js/state.js`
- **30+ test files** in `tests/` import from `js/`
- **2 Svelte components** (`Header.svelte`, `Legend.svelte`) import directly from `js/modules/`

### Critical dependency: `src/lib/engine/` (imperative bridge)

The entire `src/lib/engine/` directory (18+ files) is the "imperative-only bridge" described in AGENTS.md. It imports from `js/` by design — it wraps the legacy Three.js engine for the Svelte shell. Key consumers:

| src/lib/engine/ file | js/ modules imported |
|---|---|
| `three-engine.ts` | 18 modules (view-controller, map-state, ui-feedback, map-flattening-layout, webgl-restore-adapter, focus-anchor-indicator, audio-scape, event-bindings, loading-ui, cluster-labels, focus-pocket, scene-reveal, camera-controls, mycelium-engine, inspected-strand-overlay-adapter, route-arrival-overlay-adapter, three-search-animations, three-interaction-visuals) |
| `demo-choreography.ts` | js/state.js + 9 modules (camera-controls, focus-pocket, lifecycle, journey-compass-controller, journey, bindings/panel-bindings, micro-demo-guards, micro-demo-camera, micro-demo-ui) |
| `camera-controls.ts` | 3 modules (camera-controls-core, camera-controls-restore, camera-controls-choreography) |
| `camera-choreography/cursor.ts` | js/state.js + selectors + 3 modules |
| `camera-choreography/focus.ts` | js/state.js + selectors + 4 modules |
| `camera-choreography/routes.ts` | js/state.js + selectors + 2 modules |
| `adapters/lifecycle-bridge.ts` | js/state.js + 5 modules |
| `map-state.ts` | js/state + 3 modules |
| `scene-reveal.ts` | js/state + 2 modules |
| `node-manager.ts` | js/state |
| `thread-manager.ts` | js/state |
| `three-postprocessing.ts` | js/modules/* |

### Other src/ consumers

- `src/lib/journey/` — 10 files import from `js/state.js` and `js/modules/` (canvas-hit-test, canvas-node-picking, canvas-interaction, focus-pocket, focus-ui, journey, selected-card, semantic-dive, semantic-guide, thread-inspector, thread-settler-adapter)
- `src/lib/orchestration/` — 3 files (window-actions, triggers, cluster-filter-controller)
- `src/lib/ui/` — 3 files (ui-feedback, loading, cluster-labels)
- `src/lib/demo/` — 3 files (guards, choreography, camera)
- `src/lib/semantic-threads.ts` — imports `js/workers/data-worker.js?worker&url`
- `src/components/Header.svelte` — imports `js/modules/keyboard-help.ts`
- `src/components/Legend.svelte` — imports `js/modules/legend-ui`

### Test file consumers

30+ test files import from `js/`, including:
- All unit tests in `tests/unit/` (adapters, data-loader, event-bindings, environment, focus-pocket, journey-*, lifecycle, search-*, state, strand-continuity, ui-renderers, etc.)
- Contract tests (focus-pocket-composition, focus-pocket-motion, legend-ui-ownership, loading-ui, map-flattening-raw-buffer, share-view-clipboard, state-ownership, ts-js-drift, etc.)
- `tests/source-path.mjs` — utility that resolves `js/modules/*.js` paths

### tsconfig.json

```json
{
  "paths": {
    "@legacy/*": ["js/*"]   // <-- still active path mapping
  },
  "include": ["src/**/*", "types/**/*.d.ts", "vite.config.ts"],
  "exclude": ["node_modules", "dist", "js", "tests", "css"]
}
```

The `@legacy/*` path alias still maps to `js/*`. While `js/` is in `exclude` (tsc doesn't type-check it), Vite resolves the imports at build time.

### deploy scripts

`deploy.sh` and `deploy.ps1` reference `../js/scanner.js` — a **sibling project** path (`C:\Users\HP\repos\` area), NOT this repo's `js/` directory. Out of scope.

## Root Cause

The Svelte track is the **UI layer**, not the full application. The Three.js engine (scene, camera, shaders, instanced meshes, thread geometry, focus pocket, journey system, search, weather, etc.) still lives in `js/modules/`. The `src/lib/engine/` bridge is specifically designed to call these legacy functions — it's not dead coupling, it's the intended architecture.

The AGENTS.md "imperative-only bridge" section confirms this:
> `@lib/engine/bridge.ts` calls legacy functions directly. No reactive state, no Three.js types in the bridge.

## What Would Need to Happen for W1 to Proceed

To archive `js/`, the entire Three.js engine would need to be ported to `src/` first. This is not a "legacy runtime retirement" — it's a full engine rewrite. The 38 src/ files with js/ imports would need their dependencies satisfied by new `src/lib/engine/` implementations, not by calls into `js/modules/`.

This is likely a multi-wave effort (W2+), not a single ticket.

## What Actually Happened in W2

The W1 audit was correct that `js/` is the active runtime, but the BOTH-pattern shadow files within `js/` (50 total) were the **vestigial part** — thin `export * from './X.ts'` re-exports that no live code actually needed. Those were:

1. **Moved to `legacy-reference/js-both-shadows-2026-06-13/`** via `git mv` (history preserved)
2. **All explicit `from 'X.js'` imports in src/ and tests/ updated to extensionless** so Vite resolves to the `.ts` directly
3. **README added to the archive** explaining the BOTH-pattern retirement

**Result:** The `.ts` is the canonical implementation; the `.js` shadows are reference material in the archive. The engine kernel (`js/modules/*.ts` + `js/state.ts` + `js/state/`) remains active. The Svelte UI → Svelte bridge → engine kernel architecture is now clean and explicit.

## Recommendation

1. ✅ **BOTH-pattern shadows retired** (W2 done, commit `7fc7b9d`)
2. ⏭️ **Wave 10 close-out** — rewrite the retirement record, update AGENTS.md to document the engine-as-kernel architecture (W3-W5)
3. ⏸️ **Engine port (future arc)** — porting the engine kernel to `src/` is a separate multi-week effort, not Wave 10's scope
4. **Update AGENTS.md** to clarify that js/ is the active engine, not dead legacy
