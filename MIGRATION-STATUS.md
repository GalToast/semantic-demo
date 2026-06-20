# Migration Status — Semantic Explorer

Single-page tracker for the Svelte 5 + TypeScript migration. Updated after each wave. For historical charters, see `docs/w*-charter-*.md`.

## Overall Progress

| Milestone                                     | Status                    | Last Updated |
| --------------------------------------------- | ------------------------- | ------------ |
| Svelte UI (26 components)                     | ✅ Complete               | W40          |
| Typed stores / state                          | ✅ Complete               | W41          |
| Engine kernel in `src/lib/`                   | ✅ Complete               | W40          |
| Bridge files (`src/lib/engine/*-bridge.ts`)   | ✅ Complete               | W8           |
| Worker (`js/workers/data-worker.ts`)          | 🟡 Active runtime         | W40          |
| Legacy islands (`legacy-reference/`)          | 🟢 Archive only           | W42          |
| BOTH-pattern `.js` shadows                    | ✅ Retired                | W10          |
| `@legacy/*` path alias                        | ✅ Retired                | 9D-Option-B  |
| Deploy-script decoupling (`../js/scanner.js`) | ✅ Complete               | 2026-06-19   |
| Svelte 5 strict-mode `!==` cleanup            | ✅ Guarded by CI          | W44          |
| Bundle optimization                           | ✅ ~338 KB gzip           | W41          |
| Parity-attrs layer                            | ✅ Functional (113 tests) | W43          |
| A11y sweep                                    | ✅ Baseline set           | W42          |

## Current Wave: W9 (2026-06-20)

**Charter:** `docs/w9-charter-2026-06-20.md`
**Previous wave:** W8 (closed 2026-06-20)
**Next wave:** W10 (pending W9 outcomes)

**Pipeline:** Phase 6C: Bridge Unwind Continuation + Parity Smoke + Lighthouse closeout

### Scope

- Redirected `Canvas.svelte`'s generic callbacks type imports directly to self-contained engine declarations (`EngineCallbacks` interface inside `@lib/engine/lifecycle.ts`), bypassing legacy bridge maps.
- Deleted `src/lib/engine/adapters/` completely, including `core.ts` (Composition root), `types.ts` (bridge types signature), and `lifecycle-bridge.ts`.
- Simplified the central barrel `src/lib/engine/index.ts` to stop exporting the old defunct `createEngineBridge` and `adapters/types`.
- Updated `tests/three-setup-init-dewindowing-contract.mjs` contract validations to target `@lib/engine/lifecycle.ts` rather than the defunct `lifecycle-bridge.ts`.
- Verified all 1,142 tests and TypeScript compilation gates are 100% green and error-free.

### Net reduction

- **−542 LoC** across this wave's legacy adapter removals + barrel simplification

### Open Items

- [x] W9-A: Production-preview parity smoke (carry-over from W43-C) — **DONE**, see `docs/production-preview-parity-baseline-w9-2026-06-20.md`
- [x] W9-B: Bridge unwind continuation (4-signal audit on remaining 34 bridges) — **DONE**, 10 micro-bridges retired (24 remaining), see `docs/w9-bridge-audit-2026-06-20.md`
- [ ] W9-C: Lighthouse 92% verification (W8 carry-over; unblocked by W44 named-imports audit)

### W9-A Findings (2026-06-20)

- **Parity smoke PASS**: dev (5173) and preview (4174) produce identical body data-attrs across all 16 attrs and 2 flows (idle + search). W8 Bridge Retirement does NOT regress the W15 parity baseline.
- **Contract test registered** under `smoke` group in `tests/contracts.manifest.json`. Runs as part of `node tests/run-all-contracts.js --group=smoke`.
- **Test baseline reality check**: `npm run test:unit` reports **1,118 passed / 1 failed / 1,119 total**. The single failure is `component-SearchBar.test.ts` "lazy-renders SearchResults sub-component when search state is active" — a pre-existing test isolation bug that reproduces only in the full-suite cumulative run. The test passes in isolation and when paired with any single other test file. **Not W9 scope; flagged for W10 or parallel-session follow-up.**

### Parallel-Session Safety

- Active worktree: CSS modules, `parity-attrs.svelte.ts`, `stores/*.svelte.ts`, `src/main.ts`
- See `git status` before committing; do not commit without `git log --since="3 hours ago" --oneline`

## Architecture Decision Records

| Decision                          | Status       | Doc                                           |
| --------------------------------- | ------------ | --------------------------------------------- |
| Bridge files as canonical seam    | ✅ Retired   | `docs/w8-charter-2026-06-20.md`               |
| Body data-attr as JS↔CSS contract | ✅ Active    | `AGENTS.md`                                   |
| 8,406-point mycelium invariant    | ✅ Preserved | `state.rawPositionsBuffer` in `app.svelte.ts` |
| Nav-mirror CI guard               | ✅ Active    | `npm run lint:nav-mirror`                     |
| Svelte 5 `!==` strict-mode lint   | ✅ Active    | `npm run lint:svelte5-strict-mode`            |
| W8 charter drafted                | ✅ Done      | `docs/w8-charter-2026-06-20.md`               |

## Known Blockers

1. **Deploy-script `../js/scanner.js` dependency**
    - **Status:** ✅ Completed 2026-06-19
    - **Resolution:** `scanner.js` was identified as a standalone CloudScan tool (60,498 bytes, last modified May 24 2026) that is deployed independently. Forward deploy never touched it; only backup/rollback referenced it. Removed references from `deploy.sh`, `deploy.ps1`, and the config topology contract test.
    - **Unblocks:** App root relocation, deploy simplification

2. **Bridge retirement (Phase 6)**
    - **Status:** ✅ Completed 2026-06-20
    - **Resolution:** Deleted defunct engine-adapter core/lifecycle bridges, streamlined Svelte Canvas init, and resolved all de-windowing contract constraints.
    - **Unblocks:** Pure self-contained Canvas component initialization and complete engine API simplification.

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

| Wave | Date       | Key Deliverable                                                    |
| ---- | ---------- | ------------------------------------------------------------------ |
| W9   | 2026-06-20 | Phase 6C: Parity smoke + bridge unwind continuation + Lighthouse   |
| W8   | 2026-06-20 | Phase 6A/6B: Retired old Engine Bridge & adapters (-542 LoC)       |
| W7   | 2026-06-19 | Dual-module collapse (Pairs 1–4) + Svelte-5 hardening (−1,553 LoC) |
| W6   | 2026-06-19 | Splash + lazy Canvas                                               |
| W5   | 2026-06-18 | TBT optimization, a11y closeout                                    |
| W44  | 2026-06-17 | Bundle audit, brotli compression                                   |
| W43  | 2026-06-18 | Focus-stage QA, parity-attrs                                       |

---

_See `docs/migration-plan.md` for full technical details._
