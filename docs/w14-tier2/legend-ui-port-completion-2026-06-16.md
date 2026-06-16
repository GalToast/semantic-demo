# W15 Candidate: legend-ui port-completion

## Gap

- kernel `js/modules/legend-ui.ts`: 308 LOC, 11 exports
- canonical `src/lib/journey/legend-ui.ts`: 20 LOC, 1 export
- **10 missing exports:**
  1. `isLegendPanelOpen`
  2. `openLegendPanel`
  3. `closeLegendPanel`
  4. `restoreLegendCollapsedPanel`
  5. `buildLegend`
  6. `updateLegendGuideState`
  7. `closeLegendGuide`
  8. `buildCanvasColorLegend`
  9. `setPreviouslyFocusedLegend`
  10. `getPreviouslyFocusedLegend`

## Live importers

### .ts (7, excluding tests + legacy-reference)

1. `js/modules/event-bindings.ts` — `buildLegend`
2. `js/modules/bindings/panel-bindings.ts` — panel open/close state
3. `js/modules/bindings/legend-bindings.ts` — legend toggle, build, guide state
4. `js/modules/lifecycle.ts` — `buildLegend`, event bus subscriptions
5. `js/modules/bindings/utility-bindings.ts` — `closeLegendGuide`
6. `src/lib/engine/legend-ui-bridge.ts` — re-exports all kernel exports
7. `src/lib/engine/lifecycle-bridge.ts` — `initLegendEventBusSubscriptions`

### .svelte (3)

1. `js/modules/components/LegendPanelChrome.svelte` — `isLegendPanelOpen`, `openLegendPanel`, `closeLegendPanel`
2. `js/modules/components/InfoPanelChrome.svelte` — legend panel state
3. `src/components/Legend.svelte` — cluster legend rendering

### Tests (4, excluded from live count)

1. `tests/legend-ui-ownership-contract.mjs`
2. `tests/lifecycle-semantic-guide-residual-bridge-contract.mjs`
3. `tests/residual-window-bridge-inventory-contract.mjs`
4. `tests/unit/ui-renderers.test.js`

**Total: 14 importers (10 live code + 4 tests), excluding legacy-reference.**

## Why W15, not W14-T2

- This is **port-completion work**, not a retirement rewiring.
- W14-T2 retirements are files where the canonical Svelte 5 port already has equivalent exports and importers just need path rewiring. Here the port is 1/11th the coverage.
- Two approaches:
  1. **Port-completion**: Extend `src/lib/journey/legend-ui.ts` from 20 → ~308 LOC to cover all 11 exports. Preserve the same module-scoped state pattern. ~2-3 hours.
  2. **Rewire to Legend.svelte**: Update all 10 live importers to use the Svelte 5 `Legend.svelte` component and Svelte stores for panel state. Eliminates the kernel entirely. ~1-2 hours.
- Need main-lane decision on approach before dispatching W15 worker.

## Effort estimate

- Approach 1 (port-completion): 2-3 hours, ~$0.005
- Approach 2 (rewire to Legend.svelte): 1-2 hours, ~$0.003

## Verification needed

- Run svelte-check + vitest after either approach
- Verify Legend.svelte renders correctly with category data
- Manual browser smoke test: open legend, toggle clusters, verify state
