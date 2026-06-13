# Active Context — semantic-explorer

**Last updated:** 2026-06-13
**⚠ Update-prone:** Refresh this file whenever migration state, demo readiness, or blockers change.

## Migration status (Svelte + TypeScript)
- **Scaffold:** 25 Svelte components currently present under `src/components/`
- **Stores/types:** 12/12 stores, 4/4 type files, 4/4 orchestration files complete
- **Bridge:** `src/lib/engine/bridge.ts` ~1212 lines, imperative legacy bridge
- **Svelte check:** `npm run check:svelte` passes with 0 errors / 0 warnings as of 2026-06-13.
- **Build:** `npm run build:svelte` passes as of 2026-06-13; ineffective dynamic import warnings are down to 2 after state, orchestration, camera, demo/window, semantic-guide, and connection-analysis import cleanup.
- **Legacy TS progress:** `npm run check:ts-progress` reports 153 runtime modules, 104 TS-only, 49 BOTH (`.ts` + `.js` shadow), 0 JS-only, 0 drift pairs.
- **Legacy entry:** `js/modules/app.ts` is the legacy/reference bundle entry; production remains the Svelte/Vite shell.
- **Legacy islands track:** retired as a product direction, but some `js/modules/components/*` compatibility surfaces still exist in the reference/rollback lane. Do not classify them as dead without checking import reachability and BOTH-pattern rules.
- **InfoPanel:** Single-track product surface in `src/components/InfoPanel.svelte`; keep legacy compatibility artifacts separate from product ownership.
- **Migration plan:** `docs/phase56-migration-plan.md` is the latest bridge-elimination plan; verify against live `check:ts-progress` before executing old advice.

## Demo readiness
- Svelte demo store/choreography regression for dismiss-in-COMPLETE state passes via `node tests/dismiss-in-complete-state-contract.mjs` as of 2026-06-13.
- Headed Svelte product playthrough now gets past the Step Inside semantic-dive wait after syncing `navStore.trailDepth` with journey trail depth. Latest full run artifact: `tmp/product-qa/2026-06-13T21-02-33-214Z`.
- Micro-demo legacy/reference path remains functional with verified state machine unless current contract runs prove otherwise.
- Do not reuse the old 2026-06-09 contract-failure list without re-running the focused contracts; current quick checks passed.
- Bugsweep 2026-06-05 resolved all 4 HIGH JS bugs (strand-continuity, three-interaction-visuals, state.js Proxy, three-node-manager textures).

## High-risk surfaces (lead approval required to touch)
- `js/state.js`, `js/modules/app.js`, `js/modules/journey.js`, `js/modules/lifecycle.js`
- `js/modules/ui-renderers.js`, `js/modules/focus-pocket.js`, `js/modules/journey-compass-state.js`
- CSS mobile cascade files (`css/journey_active.css`, `css/mobile_premium__*.css`, etc.)
- Deploy scripts (`deploy.sh`, `deploy.ps1`)

## Known blockers / open items
- Bridge elimination remains the main migration seam. Remaining ineffective dynamic import warnings are the accepted legacy journey/event lazy imports: `js/modules/journey-canvas-interaction.ts` via `js/modules/journey.ts`, and `js/modules/event-bindings.ts` via `js/modules/journey-selected-card.ts`. Current warning snapshot: `tmp/bridge-import-warnings-after-window-static-20260613.txt`; owner plan: `tmp/warning-owner-plan-20260613.md`; journey/event cycle report: `tmp/journey-event-warning-report-20260613.md`.
- Product playthrough still has a route ownership seam after the Step Inside fix: mobile neighbor preview/follow do not populate thread inspector, candidate pills, or walk history, and the map assertion still reaches via debug-probe instead of a real user route. Start next pass from `05-mobile-neighbor-preview.json`, `06-mobile-neighbor-follow.json`, and `08-mobile-map-after-dive.json` in the latest product QA artifact.
- Dirty worktree contains prior migration/archive/test additions under `legacy-reference/`, `tests/unit-active/`, `tests/unit/README.md`, `tests/dismiss-in-complete-state-contract.mjs`, and `vitest.legacy.config.js`. Treat as existing user/worker work; do not revert casually.
- Parallel visual-state audits can saturate local browser; prefer sequential headed runs for visual QA.
