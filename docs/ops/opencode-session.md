# OpenCode Session: TypeScript Entry-Point Readiness

**Date:** 2026-06-05
**Task:** Verify/complete conversion of 16 blocked entry-import JS modules to TypeScript shadow files

## Actual State (Discovered)

**The 16 target `.ts` shadow files already exist.** They were created as part of prior migration work. The `ts-readiness` report confirms the entry point is already ready for flip:

```
Entry imports: 44/44 ready
Entry ready for flip: YES
TS coverage: 56.9%
```

### Existing `.ts` shadow files (all in `js/modules/`)

| File | Size | Type |
|------|------|------|
| `bridge-registry.ts` | 2.5 KB | Full implementation |
| `camera-controls.ts` | 4.1 KB | Facade re-export (core + restore + choreography) |
| `data-loader.ts` | 9.7 KB | Full implementation (worker API + main-thread fallback) |
| `exploration-mode.ts` | 2.9 KB | Full implementation |
| `focus-pocket.ts` | 16.2 KB | Full implementation (THREE.js + geometry + personality) |
| `journey.ts` | 8.8 KB | Facade re-export (60+ APIs from sub-modules) |
| `journey-compass-controller.ts` | 16.4 KB | Full implementation |
| `journey-point-color.ts` | 8.1 KB | Full implementation |
| `journey-webgl.ts` | 0.9 KB | Re-export facade (route-trace, arrival-handoff, semantic-overlay) |
| `micro-demo.ts` | 11.1 KB | Full implementation (guards, camera, UI sub-modules) |
| `lifecycle.ts` | 17.0 KB | Full implementation (518 lines) |
| `scene-reveal.ts` | 2.6 KB | Full implementation |
| `semantic-dive-ui.ts` | 11.2 KB | Full implementation |
| `semantic-guide.ts` | 12.0 KB | Full implementation |
| `semantic-threads.ts` | 16.3 KB | Full implementation |
| `webgl-restore-adapter.ts` | 0.5 KB | Full implementation |

### Verification Results

| Check | Result |
|-------|--------|
| `npm run typecheck` (tsc --noEmit) | **0 errors** |
| `npm run build` (esbuild) | **Build succeeds** (562.6 KB in 403ms) |
| `npm run ts-readiness` | **44/44 imports ready, Entry flip: YES** |

### Stale docs

`docs/ts-migration-readiness.md` still reports the old state (28/44, 45.1%, NO). Needs updating to reflect current 44/44, 56.9%, YES.

## Next Steps

1. **Update `docs/ts-migration-readiness.md`** with current metrics
2. **Port `app.js` logic into `app.ts`** for the true flip — currently `app.ts` is a thin shim that dynamically imports `app.js`
3. **Convert remaining 62 JS-only modules** (all non-entry-path sub-modules like camera-controls-core, journey-focus-ui, thread-inspector, etc.) — these don't block the entry flip but would complete the migration
