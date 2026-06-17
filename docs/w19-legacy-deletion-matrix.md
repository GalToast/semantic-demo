# Legacy File Deletion Matrix (W19 Corrected)

**Generated:** 2026-06-17  
**Method:** Cross-referenced `js/modules/*.ts` against all `src/`, `tests/`, `docs/`, and `js/modules/` references (imports, `readFileSync`, `read()`, dynamic `import()`).

## Critical Lesson

An initial import-only `rg -l "from.*['\"].*<base>"` search returned **zero** mentions for three files. A follow-up manual search revealed that all three are referenced by **test file reads** (`readFileSync`, `read()`), proving that **import-only searches are insufficient for deletion safety**. Future deletion audits must include:
- `from\s+['"].*<base>` (static imports)
- `readFileSync\(.*<base>` / `read\(.*<base>` (test file reads)
- `new Worker\(.*<base>` (worker instantiation)
- `await import\(['"].*<base>` (dynamic imports)

## Zero-Reference Candidates (all BLOCKED)

| File | Blocked By | Reason |
|------|-----------|--------|
| `js/modules/app-svelte-island.ts` | `tests/svelte-chrome-ownership-contract.mjs` | Test reads `read('js/modules/app-svelte-island.ts')` — mount contract check |
| `js/modules/three-node-manager.ts` | `tests/scene-atmosphere-contract.mjs` | Test reads `resolveSource('js/modules/three-node-manager.ts')` — contract check |
| `js/modules/three-node-manager.ts` | `tests/three-resource-lifecycle-contract.mjs` | Test reads `path.join(SEMDEMO_ROOT, 'js/modules/three-node-manager.ts')` — contract check |
| `js/modules/three-node-manager.ts` | `tests/three-visual-polish-contract.m上新.md with test references from the parallel session | `readFileSync`/`read()` for contract check |
| `js/modules/exploration-mode.ts` | `docs/` (`.js` references) + cosmetic working-tree modification | Docs reference `js/modules/exploration-mode.js`; file has uncommitted semicolon-stripping by parallel session |

## Conclusion

**No `js/modules/*.ts` files can be safely deleted in this session without first updating 4 contract test files.**

**Next step for deletion wave:**
1. Repoint contract tests to read from canonical `src/lib/` twins or `legacy-reference/`.
2. Verify no other `readFileSync` / `read()` / `import()` references remain.
3. Then delete the confirmed-safe files.

## Full Cross-Reference Data (excl self)

| File | Mentions (all types) | Status |
|------|----------------------|--------|
| `app-svelte-island.ts` | 0 imports, 1 test read | **BLOCKED** |
| `exploration-mode.ts` | 0 imports, docs reference `.js` | **BLOCKED** |
| `three-node-manager.ts` | 0 imports, 3 test reads | **BLOCKED** |
| `composition-state.ts` | 1 | — |
| `connection-analysis-adapter.ts` | 1 | Critical file (restored in c13c308) |
| `cluster-ui-accent.ts` | 3 | — |
| `connection-analysis.ts` | 2 | — |
| `event-bindings.ts` | 2 | — |
| `focus-anchor-indicator.ts` | 4 | — |
| `focus-pocket-geometry.ts` | 1 | — |
| `focus-pocket-personality.ts` | 1 | — |
| `focus-stage-dom.ts` | 1 | — |
| `focus-stage-renderer.ts` | 4 | — |
| `idb-service.ts` | 2 | — |
| `journey-arrival-handoff.ts` | 1 | — |
| `journey-canvas-hit-test.ts` | 3 | — |
| `journey-canvas-hover.ts` | 1 | — |
| `journey-canvas-interaction.ts` | 4 | — |
| `journey-canvas-node-picking.ts` | 1 | — |
| `journey-compass-controller.ts` | 10 | — |
| `journey-compass-state.ts` | 1 | — |
| `journey-focus-ui.ts` | 5 | — |
| `journey-lifecycle-adapter.ts` | 6 | — |
| `journey-neighborhood.ts` | 7 | — |
| `journey-point-color.ts` | 6 | — |
| `journey-route-trace.ts` | 2 | — |
| `journey-selected-card.ts` | 4 | — |
| `journey-semantic-overlay.ts` | 1 | — |
| `journey-text-helpers.ts` | 6 | — |
| `journey-thread-model.ts` | 12 | — |
| `journey-thread-settler.ts` | 9 | — |
| `journey-webgl-utils.ts` | 3 | — |
| `journey-webgl.ts` | 10 | — |
| `journey.ts` | 90 | — |
| `lifecycle-modes.ts` | 2 | — |
| `lifecycle-reset.ts` | 1 | — |
| `lifecycle.ts` | 50 | — |
| `map-flattening-layout.ts` | 4 | — |
| `map-state.ts` | 6 | — |
| `mycelium-engine.ts` | 3 | — |
| `navigation-state.ts` | 4 | — |
| `pathfinding.ts` | 0 imports, 1 test read | In `legacy-reference/` too; test reads `js/modules/` |
| `role-label.ts` | 3 | — |
| `scene-events.ts` | 1 | — |
| `search-panel-adapter.ts` | 8 | — |
| `search-trail-cue-renderer.ts` | 5 | — |
| `semantic-guide-payload-adapter.ts` | 2 | — |
| `semantic-guide-payload.ts` | 3 | — |
| `semantic-lane.ts` | 8 | — |
| `semantic-threads.ts` | 4 | — |
| `state-mutators.ts` | 5 | — |
| `stores.ts` | 98 | Inflated by substring matches on `legacy-stores` |
| `thread-inspector-adapter.ts` | 2 | — |
| `thread-inspector.ts` | 13 | — |
| `three-interaction-visuals.ts` | 2 | — |
| `three-search-animations.ts` | 5 | — |
| `three-thread-manager.ts` | 1 | — |
| `tooltip.ts` | 6 | — |
| `url-state.ts` | 8 | — |
| `view-controller.ts` | 13 | — |
| `weather-ui.ts` | 3 | — |
| `weather.ts` | 8 | — |

## Recommendations for Next Session

1. **Delete the 4 contract tests that read dead `js/modules/*.ts` files**, or repoint them to `legacy-reference/` or `src/lib/` canonical paths.
2. **Then re-run the bridge audit** (using the more robust script in `tmp/bridge-audit-v2.cjs`) to confirm the zero-mention files are now truly safe.
3. **For `pathfinding.ts`:** The test `tests/pathfinding-contract.mjs` directly reads `js/modules/pathfinding.ts`. Since there's a `legacy-reference/pathfinding.ts` copy, the test should be repointed to read from there (or the canonical implementation if it exists in `src/`).
4. **For `stores.ts` (98 mentions):** Most are false positives from `legacy-stores`, `stores-bridge`, etc. A manual review is needed to determine if any actual `import from 'js/modules/stores'` remains.
