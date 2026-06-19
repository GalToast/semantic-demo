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

## Current Wave: W6 (2026-06-19)

**Charter:** `docs/w6-charter-2026-06-19.md`

### Scope

- Splash shell + gesture monitor + lazy Canvas mount (deferred prop)
- Reduce CSS sprawl (6 modules targeted)
- Retire `ModeChips.svelte` component
- Audio-scape cleanup (`src/lib/audio/audio-scape.ts`)

### Open Items

- [ ] Thread-inspector stash (`stash@{0}` — 10 files, re-apply after coordination)
- [ ] Bridge retirement Phase 6 decision
- [ ] Deploy-script `../js/scanner.js` decoupling

### Parallel-Session Safety

- Active worktree: CSS files, `FocusPocketA11y.svelte`, `ModeChips.svelte` (deleted), `audio-scape.ts`, `focus/geometry.ts`, `focus/stage-renderer.ts`
- See `git status` before committing; do not commit without `git log --since="3 hours ago" --oneline`

## Architecture Decision Records

| Decision                          | Status       | Doc                                            |
| --------------------------------- | ------------ | ---------------------------------------------- |
| Bridge files as canonical seam    | 🟡 Active    | `docs/migration-plan.md` §Bridge File Doctrine |
| Body data-attr as JS↔CSS contract | ✅ Active    | `AGENTS.md`                                    |
| 8,406-point mycelium invariant    | ✅ Preserved | `state.rawPositionsBuffer` in `app.svelte.ts`  |
| Nav-mirror CI guard               | ✅ Active    | `npm run lint:nav-mirror`                      |
| Svelte 5 `!==` strict-mode lint   | ✅ Active    | `npm run lint:svelte5-strict-mode`             |

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
| W6   | 2026-06-19 | Splash + lazy Canvas (in progress)  |
| W5   | 2026-06-18 | TBT optimization, a11y closeout     |
| W44  | 2026-06-17 | Bundle audit, brotli compression    |
| W43  | 2026-06-18 | Focus-stage QA, parity-attrs        |
| W42  | 2026-06-18 | Thread-inspector fix, a11y baseline |

---

_See `docs/migration-plan.md` for full technical details._
