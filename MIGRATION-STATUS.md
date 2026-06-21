# Migration Status — Semantic Explorer

Single-page tracker for the Svelte 5 + TypeScript migration. Updated after each wave. For historical charters, see `docs/w*-charter-*.md`.

## Overall Progress

| Milestone                                     | Status                             | Last Updated |
| --------------------------------------------- | ---------------------------------- | ------------ |
| Svelte UI (26 components)                     | ✅ Complete                        | W40          |
| Typed stores / state                          | ✅ Complete                        | W41          |
| Engine kernel in `src/lib/`                   | ✅ Complete                        | W40          |
| Bridge files (`src/lib/engine/*-bridge.ts`)   | ✅ Complete (0 remaining)          | Phase 7      |
| Worker (`src/lib/workers/data-worker.ts`)     | ✅ Complete                        | W10          |
| Legacy islands (`legacy-reference/`)          | 🟢 Archive only                    | W42          |
| BOTH-pattern `.js` shadows                    | ✅ Retired                         | W10          |
| `@legacy/*` path alias                        | ✅ Retired                         | 9D-Option-B  |
| Deploy-script decoupling (`../js/scanner.js`) | ✅ Complete                        | 2026-06-19   |
| Svelte 5 strict-mode `!==` cleanup            | ✅ Guarded by CI                   | W44          |
| Bundle optimization                           | ✅ ~338 KB gzip                    | W41          |
| Parity-attrs layer                            | ✅ Functional (113 tests)          | W43          |
| A11y sweep                                    | ✅ Baseline set                    | W42          |

## Current Wave: Phase 7 Closeout (2026-06-20)

**Charter:** `docs/phase-7-state-bridge-retirement-2026-06-20.md`
**Previous wave:** W10 / Phase 6C bridge thinnability continuation
**Next wave:** Release hardening: full static/unit/contract gates, product playthrough, visual QA, and Lighthouse/performance re-baseline

**Pipeline:** Final bridge retirement + release-readiness closeout

### Scope

- Retired 20 single-consumer and passthrough bridges via 5-signal dead-code audit:
  - `weather-ui-bridge.ts`, `role-label-bridge.ts`, `event-bindings-bridge.ts`, `camera-orbit-slack-bridge.ts`, `adapters-bridge.ts`, `thread-inspector-bridge.ts`, `journey-point-color-bridge.ts`, `journey-thread-model-bridge.ts`, `journey-thread-settler-bridge.ts`, `inspected-strand-overlay-bridge.ts`, `route-arrival-overlay-bridge.ts`, `camera-controls-restore-bridge.ts`, `journey-focus-ui-bridge.ts`, `journey-neighborhood-bridge.ts`, `journey-webgl-bridge.ts`, `journey-compass-controller-bridge.ts`, `window-actions-bridge.ts`, `search-state-bridge.ts`, `strand-continuity-bridge.ts`, `lifecycle-bridge.ts`
  - Total: 34 → 0 bridge files remaining after Phase 7.
- Closed the worker URL wrapper as bridge debt by moving the Vite `?worker&url` boundary to `src/lib/workers/data-worker-url.ts`.
- Refactored `tests/unit-active/w11-t7-adapters-init.test.ts` to assert all 11 adapters are imported from their canonical owners (no longer requires reading the obsolete `adapters-bridge.ts`).
- Fixed the W9-era `component-SearchBar.test.ts` isolation bug (vacuous `vi.mock` hoisting).
- Verified `npm run test:unit` green: **1135/1135 passing**, 102/102 test files.
- Verified all core (12) and smoke (8) QA visual contracts pass perfectly with 0 regressions.

- Deleted the final legacy bridge: `src/lib/engine/state-bridge.ts`.
- Migrated all remaining ~58 consumers to use `appState` and `withStateMutation` natively.
- No matching `from '@lib/engine/state-bridge'` imports remain in the entire codebase.
- Verified `npm run test` green: static/config/ownership/token/surface/semantic/typecheck suite.
- Verified `npm run test:unit` green: **1129/1129 passing**, 101/101 test files.
- Verified `npm run build` green.
- Verified `npm run check:svelte` green: 0 errors, 0 warnings.
- Verified `npm run test:contract` green: **64/64 passing**.

### Release-Hardening Seams

- Product/visual QA: run product playthrough, UI-quality, and critical mobile/desktop visual surfaces after migration closeout.
- Performance re-baseline: refresh Lighthouse/bundle evidence now that bridge retirement is complete; worker analysis flagged LCP and mobile Lighthouse coverage as the highest-value perf seams.
- Artifact hygiene: `npm run report:artifacts` currently reports `tmp/` at ~305 MB, dominated by visual-audit and worker-log outputs. Use dry-run pruning before any cleanup.

### Open Items

- [x] State bridge boundary map — migrated all 58 callers of `state-bridge.ts` to use `appState` directly and deleted the final bridge.
- [x] Worker URL wrapper closeout — Vite `?worker&url` remains centralized at `src/lib/workers/data-worker-url.ts`, outside the engine bridge inventory.

### Parallel-Session Safety

- Active worktree: CSS modules, `parity-attrs.svelte.ts`, `stores/*.svelte.ts`, `src/App.svelte`, `src/main.ts`
- See `git status` before committing; do not commit without `git log --since="3 hours ago" --oneline`

## Architecture Decision Records

| Decision                          | Status       | Doc                                           |
| --------------------------------- | ------------ | --------------------------------------------- |
| Bridge files as canonical seam    | ✅ Retired   | `docs/archive/w8-charter-2026-06-20.md`       |
| Body data-attr as JS↔CSS contract | ✅ Active    | `AGENTS.md`                                   |
| 8,406-point mycelium invariant    | ✅ Preserved | `state.rawPositionsBuffer` in `app.svelte.ts` |
| Nav-mirror CI guard               | ✅ Active    | `npm run lint:nav-mirror`                     |
| Svelte 5 `!==` strict-mode lint   | ✅ Active    | `npm run lint:svelte5-strict-mode`            |
| W8 charter drafted                | ✅ Done      | `docs/archive/w8-charter-2026-06-20.md`       |

## Known Blockers

1. **Deploy-script `../js/scanner.js` dependency**
    - **Status:** ✅ Completed 2026-06-19
    - **Resolution:** `scanner.js` was identified as a standalone CloudScan tool (60,498 bytes, last modified May 24 2026) that is deployed independently. Forward deploy never touched it; only backup/rollback referenced it. Removed references from `deploy.sh`, `deploy.ps1`, and the config topology contract test.
    - **Unblocks:** App root relocation, deploy simplification

2. **Bridge retirement (Phase 6)**
    - **Status:** ✅ Completed 2026-06-20
    - **Resolution:** Deleted defunct engine-adapter core/lifecycle bridges, streamlined Svelte Canvas init, migrated the final `state-bridge.ts` consumers to canonical `appState` / `withStateMutation`, and resolved all bridge/de-windowing contract constraints.
    - **Unblocks:** Pure self-contained Canvas component initialization, complete engine API simplification, and release-readiness validation.

## Quick Commands

```bash
# Check everything
npm run test

# Check migration-specific items
npm run check:bridges
npm run typecheck
npm run qa:contract -- --all
npm run qa:visual -- --all
```

## Changelog (last 5 waves)

| Wave | Date       | Key Deliverable                                                                                      |
| ---- | ---------- | ---------------------------------------------------------------------------------------------------- |
| Phase 7 | 2026-06-20 | Final `state-bridge.ts` retirement; 34→0 bridge files; `test:contract` 64/64                        |
| W10  | 2026-06-20 | Phase 6C cont.: 5 more bridges retired (34→19, −44% total), test alignment, 1135/1135 unit tests     |
| W9   | 2026-06-20 | Phase 6C: Parity smoke + bridge unwind continuation + Lighthouse (Perf 80, A11y 100, BP 100, SEO 91) |
| W8   | 2026-06-20 | Phase 6A/6B: Retired old Engine Bridge & adapters (-542 LoC)                                         |
| W7   | 2026-06-19 | Dual-module collapse (Pairs 1–4) + Svelte-5 hardening (−1,553 LoC)                                   |
| W6   | 2026-06-19 | Splash + lazy Canvas                                                                                 |
| W5   | 2026-06-18 | TBT optimization, a11y closeout                                                                      |
| W44  | 2026-06-17 | Bundle audit, brotli compression                                                                     |
| W43  | 2026-06-18 | Focus-stage QA, parity-attrs                                                                         |

---

_See `docs/migration-plan.md` for full technical details._
