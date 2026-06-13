# Active Context — semantic-explorer

**Last updated:** 2026-06-13
**⚠ Update-prone:** Refresh this file whenever migration state, demo readiness, or blockers change.

## Migration status (Svelte + TypeScript)
- **Scaffold:** 25 Svelte components currently present under `src/components/`
- **Stores/types:** 12/12 stores, 4/4 type files, 4/4 orchestration files complete
- **Bridge:** `src/lib/engine/bridge.ts` ~1212 lines, imperative legacy bridge
- **Svelte check:** `npm run check:svelte` passes with 0 errors / 0 warnings as of 2026-06-13.
- **Build:** `npm run build:svelte` passes as of 2026-06-13 with no `INEFFECTIVE_DYNAMIC_IMPORT` warnings after state, orchestration, camera, demo/window, semantic-guide, connection-analysis, journey canvas, event/panel, and selector import cleanup. `Canvas.svelte` now lazy-loads `@lib/engine`, creating a separate `engine-*.js` chunk, but the main entry remains large; remaining build chatter is expected runtime CSS resolution notices, plugin timing output, and the large chunk warning.
- **Legacy TS progress:** `npm run check:ts-progress` reports 151 runtime modules, 103 TS-only, 48 BOTH (`.ts` + `.js` shadow), 0 JS-only, 0 drift pairs.
- **Legacy entry:** `js/modules/app.ts` is the legacy/reference bundle entry; production remains the Svelte/Vite shell.
- **Legacy islands track:** retired as a product direction, but some `js/modules/components/*` compatibility surfaces still exist in the reference/rollback lane. Do not classify them as dead without checking import reachability and BOTH-pattern rules.
- **InfoPanel:** Single-track product surface in `src/components/InfoPanel.svelte`; keep legacy compatibility artifacts separate from product ownership.
- **Migration plan:** `docs/phase56-migration-plan.md` is the latest bridge-elimination plan; verify against live `check:ts-progress` before executing old advice.

## Demo readiness
- Svelte demo store/choreography regression for dismiss-in-COMPLETE state passes via `node tests/dismiss-in-complete-state-contract.mjs` as of 2026-06-13.
- Headed Svelte product playthrough passes with 0 ownership failures as of artifact `tmp/product-qa/2026-06-13T22-13-17-040Z`. The route seam is fixed: search focus hydrates neighbor candidates/pills, pill tap opens the thread inspector, Follow creates trail walk history, Step Inside reaches semantic dive, Map is reached through a real user route, and County reset returns to `map-idle` with search cleared from URL/store/DOM.
- Micro-demo legacy/reference path remains functional with verified state machine unless current contract runs prove otherwise.
- Do not reuse the old 2026-06-09 contract-failure list without re-running the focused contracts; current quick checks passed.
- Bugsweep 2026-06-05 resolved all 4 HIGH JS bugs (strand-continuity, three-interaction-visuals, state.js Proxy, three-node-manager textures).

## High-risk surfaces (lead approval required to touch)
- `js/state.js`, `js/modules/app.js`, `js/modules/journey.js`, `js/modules/lifecycle.js`
- `js/modules/ui-renderers.js`, `js/modules/focus-pocket.js`, `js/modules/journey-compass-state.js`
- CSS mobile cascade files (`css/journey_active.css`, `css/mobile_premium__*.css`, etc.)
- Deploy scripts (`deploy.sh`, `deploy.ps1`)

## Known blockers / open items
- Bridge elimination remains the main migration seam, but the current ineffective dynamic import warning set and runtime State Bypass warning sweep are closed. Next bridge targets are the still-large main chunk and reducing legacy/Svelte compatibility coupling without regressing the green headed playthrough.
- Product route ownership seam is closed in the Svelte path. Next product seam is cleanup/hardening around semantic dive state ownership and bridge coupling.
- Dirty worktree contains prior migration/archive/test additions under `legacy-reference/`, `tests/unit-active/`, `tests/unit/README.md`, `tests/dismiss-in-complete-state-contract.mjs`, and `vitest.legacy.config.js`. Treat as existing user/worker work; do not revert casually.
- Parallel visual-state audits can saturate local browser; prefer sequential headed runs for visual QA.
