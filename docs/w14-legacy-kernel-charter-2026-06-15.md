# W14 Legacy Engine Kernel Retirement Charter

> **Status:** Charter complete (read-only inventory + plan; awaiting W13-T5 completion before T6)
> **Master:** `7deabbc` (W13 arc closeout + T5 audit)
> **Date:** 2026-06-15
> **Scope:** Retire the legacy `js/modules/*.ts` engine kernel by porting 13 NOT-PORTED files to `src/lib/`, then delete the remaining legacy trees.

---

## 1. Executive Summary

After **W11** (BOTH-pattern retirement) and **W13** (state-selectors porting, 4/5 done — T5 in flight), the legacy engine kernel has been substantially reduced but the cleanup is incomplete. Of the **149 `js/modules/*.ts` engine-kernel files** (~28,467 LOC), **128 are PORTED** (60 direct + 68 via bridge) and **8 are OFF-LIMITS** (T10/T12 wave WIP), leaving **13 NOT-PORTED files** (~1,783 LOC) that form W14's work.

**The 13 NOT-PORTED files are mostly small, low-risk utilities.** One is medium-complexity (`semantic-lane.ts`, 504 LOC, async + timer management). The single Web Worker (`js/workers/data-worker.ts`, 259 LOC) is the only T6 concern. After all six W14 tickets land, the legacy `js/modules/`, `js/state.ts`, `js/state/selectors/`, and `js/workers/` trees are deleted and `tsconfig.json` aliases are updated.

**Scope:** 18 files, ~3,310 LOC (13 js/modules + 1 js/workers + 3 js/state/selectors [T5] + 1 js/state.ts [T5])
**Effort:** 2-3 sessions (~11-16 hours)
**Risk:** MEDIUM — no WebGL hot paths in scope, but `semantic-lane.ts` and `data-worker.ts` have async + serialization concerns
**Net LOC:** -1,467 (delete legacy) + 823 (new ports) = -644 net

---

## 2. Inventory & Classification

### 2.1 js/modules/*.ts (149 files, ~28,467 LOC)

| Classification | Count | LOC | Notes |
|----------------|-------|-----|-------|
| **PORTED (direct)** | 60 | ~12,000 | Svelte equivalent exists in `src/lib/` |
| **PORTED (bridge)** | 68 | ~13,600 | Bridge file exists in `src/lib/engine/` |
| **OFF-LIMITS** | 8 | ~3,494 | T10/T12 wave WIP (parallel session) |
| **NOT-PORTED** | 13 | ~1,783 | **W14 work** |
| **Total** | 149 | ~30,877 | |

### 2.2 OFF-LIMITS Files (do not touch)

The 8 OFF-LIMITS files are owned by the parallel session's T10/T12 wave work:

1. `three-engine.ts` (784 lines) — RAF handle for cancelation on deinit/re-init
2. `focus-pocket.ts` (453 lines) — Focus pocket state management
3. `journey-neighborhood.ts` (527 lines) — Neighborhood adapter
4. `journey-semantic-overlay.ts` (494 lines) — Semantic overlay rendering
5. `camera-controls-choreography-routes.ts` (319 lines) — Route choreography
6. `camera-orbit-slack.ts` (193 lines) — Orbit slack calculations
7. `cluster-labels.ts` (338 lines) — Cluster label rendering
8. `focus-stage-renderer.ts` (386 lines) — Focus stage rendering

### 2.3 NOT-PORTED Files (W14 candidates)

| # | File | Lines | Target Location | T# | Effort | Risk |
|---|------|-------|-----------------|----|--------|------|
| 1 | `idb-service.ts` | 246 | `src/lib/utils/idb-service.ts` | T1 | S | LOW |
| 2 | `tooltip.ts` | 159 | `src/lib/utils/tooltip.ts` | T1 | S | LOW |
| 3 | `pathfinding.ts` | 87 | `src/lib/utils/pathfinding.ts` | T1 | S | LOW |
| 4 | `semantic-search-mock-catalog.ts` | 142 | `src/lib/search/mock-catalog.ts` | T1 | S | LOW |
| 5 | `semantic-search-scoring.ts` | 189 | `src/lib/search/scoring.ts` | T1 | S | LOW |
| 6 | `state-mutators.ts` | 40 | `src/lib/state/mutators.ts` | T2 | S | LOW |
| 7 | `stores.ts` | 94 | `src/lib/stores/legacy-compat.ts` | T2 | S | LOW |
| 8 | `lifecycle-reset.ts` | 111 | `src/lib/orchestration/lifecycle-reset.ts` | T3 | S | LOW |
| 9 | `semantic-guide-payload.ts` | 77 | `src/lib/journey/semantic-guide-payload.ts` | T4 | S | LOW |
| 10 | `semantic-lane.ts` | 504 | `src/lib/orchestration/semantic-lane.ts` | T5 | M | MED |
| 11 | `data-worker.ts` (in `js/workers/`) | 259 | `src/lib/workers/data-worker.ts` | T6 | M | MED |
| 12 | `data.js` (selector) | 40 | **deleted by W13-T5** | T5' | S | LOW |
| 13 | `diagnostics.js` (selector) | 12 | **deleted by W13-T5** | T5' | S | LOW |
| 14 | `url-state.js` (selector) | 13 | **deleted by W13-T5** | T5' | S | LOW |

Plus:
- `js/state.ts` (1,203 LOC, legacy state kernel) — **deleted by W13-T5** (T5' depends on appState stabilization)

**Total: 18 files, ~3,310 LOC across 6 W14 tickets + W13-T5.**

---

## 3. Ticket Plan (4 Phases, 6 Tickets)

### 3.1 Phase 1 — Simple Utilities (parallel)

#### W14-T1: Port simple utility modules to `src/lib/utils/` + `src/lib/search/`
- **Files (5, 823 LOC):** `idb-service.ts` → `utils/idb-service.ts`; `tooltip.ts` → `utils/tooltip.ts`; `pathfinding.ts` → `utils/pathfinding.ts`; `semantic-search-mock-catalog.ts` → `search/mock-catalog.ts`; `semantic-search-scoring.ts` → `search/scoring.ts`
- **Effort:** S (2-3 hours)
- **Risk:** LOW — pure utility functions, no side effects, no Three.js
- **Off-limits:** None
- **Verification:** svelte-check 0/0 + vitest 652/652 + vite build clean

#### W14-T2: Port state mutators and Svelte stores
- **Files (2, 134 LOC):** `state-mutators.ts` → `state/mutators.ts`; `stores.ts` → `stores/legacy-compat.ts`
- **Effort:** S (1-2 hours)
- **Risk:** LOW — `state-mutators.ts` is a thin wrapper around `withStateMutation`; stores are already Svelte-compatible
- **Off-limits:** None
- **Verification:** svelte-check 0/0 + vitest 652/652 + vite build clean

#### W14-T3: Port lifecycle reset functions
- **Files (1, 111 LOC):** `lifecycle-reset.ts` → `orchestration/lifecycle-reset.ts`
- **Effort:** S (1-2 hours)
- **Risk:** LOW — isolated from main lifecycle orchestration
- **Off-limits:** None
- **Verification:** svelte-check 0/0 + vitest 652/652 + vite build clean

#### W14-T4: Port semantic guide payload builder
- **Files (1, 77 LOC):** `semantic-guide-payload.ts` → `journey/semantic-guide-payload.ts` (the adapter is already PORTED via `engine/adapters-bridge.ts`)
- **Effort:** S (1 hour)
- **Risk:** LOW — pure data transformation, no side effects
- **Off-limits:** None
- **Verification:** svelte-check 0/0 + vitest 652/652 + vite build clean

### 3.2 Phase 2 — Complex Adapter (sequential, after T1-T4)

#### W14-T5: Port semantic lane adapter
- **Files (1, 504 LOC):** `semantic-lane.ts` → `orchestration/semantic-lane.ts`
- **Effort:** M (3-4 hours)
- **Risk:** MEDIUM — async operations (fetchSemanticLaneHealth), timer management (scheduleSemanticLaneMonitor), state synchronization (setSemanticLaneUiState)
- **Off-limits:** None
- **Verification:** svelte-check 0/0 + vitest 652/652 + vite build clean + manual QA (semantic lane health check, monitor scheduling)

### 3.3 Phase 3 — Worker + Retirement (sequential, last)

#### W14-T6: Port data worker + retire legacy kernel
- **Files (1 + delete ~24):**
  - `js/workers/data-worker.ts` (259 LOC) → `src/lib/workers/data-worker.ts`
  - Delete all remaining legacy files:
    - 13 NOT-PORTED `js/modules/*.ts` (after T1-T5)
    - `js/state.ts` (1,203 LOC, after W13-T5)
    - `js/state/selectors/*` (10 files, after W13-T5)
    - `js/workers/` (1 file, after porting)
  - Update imports across 30+ files
  - Remove legacy aliases from `tsconfig.json`
- **Effort:** M (3-4 hours)
- **Risk:** MEDIUM — Web Worker serialization boundary; 30+ file import updates; tsconfig.json alias removal could break builds
- **Off-limits:** W13-T5 must land first (prerequisite for js/state.ts and js/state/selectors/ deletion); all PORTED and OFF-LIMITS files in js/modules/
- **Verification:**
  - svelte-check 0/0 + vitest 652/652 + vite build clean
  - Manual QA: data loading, worker communication
  - `rg "from.*js/modules"` returns 0 matches
  - `rg "from.*js/state"` returns 0 matches
  - `rg "from.*js/workers"` returns 0 matches
  - `tsconfig.json` aliases updated

---

## 4. Risk Register

| Risk | Severity | Probability | Impact | Mitigation |
|------|----------|-------------|--------|------------|
| **R1: Web Worker Serialization** | HIGH | MEDIUM | HIGH | Preserve postMessage protocol exactly; port worker first, test independently |
| **R2: Import Updating (30+ files)** | MEDIUM | HIGH | MEDIUM | Automated `rg` grep + manual verification per ticket; incremental updates; final `rg "from.*js/"` check |
| **R3: tsconfig.json Alias Removal** | MEDIUM | MEDIUM | HIGH | Incremental alias removal with build checks per phase |
| **R4: W13-T5 Dependency** | LOW | LOW | HIGH | Wait for W13-T5 to land before T6 |
| **R5: Semantic Lane Async** | MEDIUM | MEDIUM | MEDIUM | Careful porting with timer management; manual QA of health check + monitor scheduling |

---

## 5. Schedule & Dependency Graph

```
T1 (utilities) ─┐
T2 (mutators)  ─┤
T3 (lifecycle) ─┼──→ T5 (semantic lane) ──→ T6 (worker + retirement)
T4 (guide)     ─┘                                 ↑
                                                   │
                              W13-T5 (state selectors + js/state.ts) ───┘
```

**Session breakdown:**
- **Session 1 (this arc's first session):** T1, T2, T3, T4 in parallel (4 mimo-v2.5 workers, 5-8 hours wall-clock)
- **Session 2:** T5 (semantic lane, 3-4 hours)
- **Session 3:** T6 (data worker + retirement, 3-4 hours — depends on W13-T5 landing first)

---

## 6. Verification Strategy

### Per-Ticket Verification
- `npx svelte-check --tsconfig ./tsconfig.json --threshold error` (0/0)
- `npm run test:unit` (vitest 652/652 passing)
- `npm run build` (clean build)

### Final Verification (T6)
- No imports from `js/modules/`, `js/state/`, or `js/workers/` remain
- `js/state.ts` is deleted
- `js/state/selectors/` is deleted
- `js/workers/` is deleted
- `tsconfig.json` aliases updated
- Full test suite passes
- Manual QA: data loading, worker communication, state management

---

## 7. References

- `docs/w13-arc-closeout-2026-06-15.md` — W13 closeout (T5 in flight)
- `docs/w13-state-selectors-charter-2026-06-15.md` — W13 charter pattern
- `docs/w11-arc-closeout-2026-06-15.md` — W11 BOTH-pattern retirement
- `tmp/w14-prep/INVENTORY.md` — full inventory (per-module classification)
- `tmp/w14-prep/PLAN.md` — detailed ticket plan
- `tmp/w14-prep/RISKS.md` — full risk register
- `tmp/w14-prep/EXECUTIVE-SUMMARY.md` — 1-page summary

---

## 8. W14 Charter — Ready for Sign-off

- [x] Inventory complete (149 + 10 + 1 = 161 legacy files classified)
- [x] Disposition determined (128 PORTED, 8 OFF-LIMITS, 13 NOT-PORTED)
- [x] 6 tickets scoped (T1-T6)
- [x] Effort estimated (11-16 hours, 2-3 sessions)
- [x] Risk register drafted (5 risks with mitigations)
- [x] Verification strategy defined
- [x] Schedule + dependency graph specified
- [ ] W13-T5 lands (prerequisite for T6)
- [ ] First dispatch of W14-T1-T4 in parallel (after W13-T5)

**Ready to commit. Awaiting W13-T5 completion before first dispatch.**
