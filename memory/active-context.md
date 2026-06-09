# Active Context — semantic-explorer

**Last updated:** 2026-06-09
**⚠ Update-prone:** Refresh this file whenever migration state, demo readiness, or blockers change.

## Migration status (Svelte + TypeScript)
- **Scaffold:** 21/21 Svelte components complete under `src/components/`
- **Stores/types:** 12/12 stores, 4/4 type files, 4/4 orchestration files complete
- **Bridge:** `src/lib/engine/bridge.ts` ~1212 lines, imperative legacy bridge
- **svelte-check:** 0 errors in `src/` code (50 errors in legacy `js/modules/*.ts` — out of scope)
- **Legacy islands track:** Deleted in m3 sweep (2026-06-07). All rendering flows through `src/components/`.
- **InfoPanel:** Single-track (src/ only, ~764L). Legacy island orphans removed.
- **Migration plan:** `docs/migration-plan.md` — 6-phase plan (Phase 0–6), written by migration-architect worker

## Demo readiness
- Micro-demo (`micro-demo.js`) is functional with verified state machine.
- Known pre-existing contract test failures: thread-inspector, field-node, search-no-results, compass-rail, focus-pocket, info-panel-empty, mode-grid (under investigation).
- Bugsweep 2026-06-05 resolved all 4 HIGH JS bugs (strand-continuity, three-interaction-visuals, state.js Proxy, three-node-manager textures).

## High-risk surfaces (lead approval required to touch)
- `js/state.js`, `js/modules/app.js`, `js/modules/journey.js`, `js/modules/lifecycle.js`
- `js/modules/ui-renderers.js`, `js/modules/focus-pocket.js`, `js/modules/journey-compass-state.js`
- CSS mobile cascade files (`css/journey_active.css`, `css/mobile_premium__*.css`, etc.)
- Deploy scripts (`deploy.sh`, `deploy.ps1`)

## Known blockers / open items
- Root-slice TS migration: 90 broken imports traced to 2 barrel shims (`js/state.ts`, `js/modules/app.ts`) — staged commit plan in progress (2026-06-08/09)
- Subagent spawn regression: after ~5 successful spawns, harness rejects subsequent launches with "params/timeout_seconds must be integer" (2026-06-09)
- Parallel visual-state audits saturate local browser; prefer sequential runs
