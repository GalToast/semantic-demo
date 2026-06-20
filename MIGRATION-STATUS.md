# Migration Status — Semantic Explorer

Single-page tracker for the Svelte 5 + TypeScript migration. Updated after each wave. For historical charters, see `docs/w*-charter-*.md`.

## Overall Progress

| Milestone                                     | Status                         | Last Updated |
| --------------------------------------------- | ------------------------------ | ------------ |
| Svelte UI (26 components)                     | ✅ Complete                    | W40          |
| Typed stores / state                          | ✅ Complete                    | W41          |
| Engine kernel in `src/lib/`                   | ✅ Complete                    | W40          |
| Bridge files (`src/lib/engine/*-bridge.ts`)   | 🟡 Load-bearing (Phase 6 open) | W42          |
| Worker (`js/workers/data-worker.ts`)          | 🟡 Active runtime              | W40          |
| Legacy islands (`legacy-reference/`)          | 🟢 Archive only                | W42          |
| BOTH-pattern `.js` shadows                    | ✅ Retired                     | W10          |
| `@legacy/*` path alias                        | ✅ Retired                     | 9D-Option-B  |
| Deploy-script decoupling (`../js/scanner.js`) | ✅ Complete                    | 2026-06-19   |
| Svelte 5 strict-mode `!==` cleanup            | ✅ Guarded by CI               | W44          |
| Bundle optimization                           | ✅ ~338 KB gzip                | W41          |
| Parity-attrs layer                            | ✅ Functional (113 tests)      | W43          |
| A11y sweep                                    | ✅ Baseline set                | W42          |

## Current Wave: W7 (2026-06-19)

**Charter:** `docs/w7-charter-dual-module-collapse-2026-06-19.md`
**Next wave:** W8 charter drafted at `docs/w8-charter-2026-06-20.md` (Phase 6A prep)

**Pipeline:** Dual-Module Collapse + Symptomatic Svelte-5 Hardening

### Scope

- 4 focus/↔journey/ dual-module pair collapses (Pairs 1, 2, 3, 4)
- Audio-scape null guards (`audio-scape.ts:166` RAF-path crash fix, empty-catch comments)
- Triggers.ts:391 removal — `TOOLTIP_HIDE_REQUESTED` no-op consumer (real handler in `src/lib/ui/tooltip.ts`)
- Lifecycle stubs dedup — `probeSemanticLane` + `setSemanticLaneUiState` re-exported from canonical `semantic-lane.ts`
- W7-A bulk-data migration — 286 MB moved to `public/data/` (out of git)
- Vite config path fix for `public/data/*` dist output; cache-buster path updates; deploy.sh/ps1 parity
- Thread-inspector activation gap fix — `pinThreadNeighbor(<focusedIndex>)` returns valid state via `pinFirstAvailableNeighbor` fallback

### Net reduction

- **−1,553 LoC** across this wave's pair collapses + stub dedup

### Open Items

- [ ] Bridge retirement Phase 6 decision (carried from W6)
- [ ] Lighthouse 92% verification (blocked on Three.js named-imports audit completing)

### Parallel-Session Safety

- Active worktree: CSS modules, `parity-attrs.svelte.ts`, `stores/*.svelte.ts`, `engine/*-bridge.ts` (still load-bearing), `src/main.ts`
- See `git status` before committing; do not commit without `git log --since="3 hours ago" --oneline`

## Architecture Decision Records

| Decision                          | Status       | Doc                                            |
| --------------------------------- | ------------ | ---------------------------------------------- |
| Bridge files as canonical seam    | 🟡 Active    | `docs/migration-plan.md` §Bridge File Doctrine |
| Body data-attr as JS↔CSS contract | ✅ Active    | `AGENTS.md`                                    |
| 8,406-point mycelium invariant    | ✅ Preserved | `state.rawPositionsBuffer` in `app.svelte.ts`  |
| Nav-mirror CI guard               | ✅ Active    | `npm run lint:nav-mirror`                      |
| Svelte 5 `!==` strict-mode lint   | ✅ Active    | `npm run lint:svelte5-strict-mode`             |
| W8 charter drafted                | 🟢 Phase 6A prep | `docs/w8-charter-2026-06-20.md`           |

## Known Blockers

1. **Deploy-script `../js/scanner.js` dependency**
    - **Status:** ✅ Completed 2026-06-19
    - **Resolution:** `scanner.js` was identified as a standalone CloudScan tool (60,498 bytes, last modified May 24 2026) that is deployed independently. Forward deploy never touched it; only backup/rollback referenced it. Removed references from `deploy.sh`, `deploy.ps1`, and the config topology contract test.
    - **Unblocks:** App root relocation, deploy simplification

2. **Bridge retirement (Phase 6)**
    - Impact: Engine lifecycle is still bridged instead of owned by Canvas component
    - Decision needed: Canvas-own-lifecycle design
    - Unblocks: Full bridge elimination, engine API simplification

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

| Wave | Date       | Key Deliverable                     |
| ---- | ---------- | ----------------------------------- |
| W7   | 2026-06-19 | Dual-module collapse (Pairs 1–4) + Svelte-5 hardening (−1,553 LoC) |
| W6   | 2026-06-19 | Splash + lazy Canvas                |
| W5   | 2026-06-18 | TBT optimization, a11y closeout     |
| W44  | 2026-06-17 | Bundle audit, brotli compression    |
| W43  | 2026-06-18 | Focus-stage QA, parity-attrs        |

---

_See `docs/migration-plan.md` for full technical details._
