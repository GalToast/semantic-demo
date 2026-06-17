# Wave 22.3 Closure Update — 2026-06-17

**Status:** W20 cleanup arc PARTIALLY COMPLETE; Wave 22 in progress
**Author:** main lane
**Current HEAD:** `db9eb8d` — chore(w22): remaining parity-attrs + navigation + docs updates
**Doc type:** DOCS-ONLY — no source, test, or config files modified

---

## 1. W20 Wave 4 Cleanup Status (Live)

The original verification doc (`docs/w20-wave4-verification-2026-06-17.md`) reported 7 of 10 targets deleted with 3 remaining. Since then, one more file was cleaned up, leaving 2 pending.

### Files deleted (8 of 10)

| File | W20/W21 Commit | Notes |
|------|---------------|-------|
| `app-svelte-island.ts` | `11e4c68` | W20 Wave 3 step 1-3 |
| `three-node-manager.ts` | `11e4c68` | W20 Wave 3 step 1-3 |
| `loading-ui.ts` | `ac14b34` | W20 Wave 4 (was shadow, deleted in bulk sweep) |
| `composition-state.ts` | `ac14b34` | W20 Wave 4 |
| `exploration-mode.ts` | `ac14b34` | W20 Wave 4 |
| `map-state.ts` | `79b2576` | W20 Wave 4 |
| `journey.ts` | `f342c02` | W20 Wave 4 |
| `lifecycle-reset.ts` | `7a89261` | W21 Lane C (zero-consumer deletion) |

### Files pending deletion (2)

| File | Status | Blocker |
|------|--------|---------|
| `js/modules/lifecycle.ts` | Still exists | Parallel session WIP — 5 files still import from `./lifecycle.ts` |
| `js/modules/lifecycle-modes.ts` | Still exists | Parallel session WIP — no known importers from `js/modules/` |

### Files still importing from `./lifecycle.ts` (5)

These are the remaining importers that must be rewired before `lifecycle.ts` can be deleted:

1. `js/modules/journey-compass-controller.ts`
2. `js/modules/journey-focus-ui.ts`
3. `js/modules/journey-thread-settler.ts`
4. `js/modules/thread-inspector.ts`
5. `js/modules/url-state.ts`

### Deep-relative imports

Zero deep-relative `../../src/lib/` imports remain in `js/modules/` (already cleaned). The 10 deep-relative imports found by `rg` are all in `js/modules/components/` (Svelte island stubs — legacy, not part of W20 scope).

---

## 2. Readiness Test Current State

**Test file:** `tests/unit-active/w20-wave4-readiness-regression.test.ts`
**Command:** `bun x vitest run --config vitest.config.js w20-wave4-readiness`

### Current output (2026-06-17)

```
Tests  4 failed | 10 passed (14)
```

### Failure details (verbatim from test output)

```
FAIL  tests/unit-active/w20-wave4-readiness-regression.test.ts > W20 Wave 4 readiness: js/modules/ tree state lock > 4. Wave 4 cleanup: cross-module ./ relative imports in journey-* > journey-* files have zero cross-module ./ relative imports
AssertionError: Found 9 cross-module import(s) in journey-* files:
js/modules/journey-compass-controller.ts imports './lifecycle.ts'
js/modules/journey-focus-ui.ts imports './thread-inspector.ts'
js/modules/journey-focus-ui.ts imports './lifecycle.ts'
js/modules/journey-neighborhood.ts imports './navigation-state.ts'
js/modules/journey-selected-card.ts imports './focus-stage-renderer.ts'
js/modules/journey-selected-card.ts imports './cluster-ui-accent.ts'
js/modules/journey-selected-card.ts imports './stores.ts'
js/modules/journey-thread-settler.ts imports './lifecycle.ts'
js/modules/journey-thread-settler.ts imports './thread-inspector.ts': expected [ …(9) ] to have a length of +0 but got 9
```

### Pass count summary

- **Now:** 10/14 (71% pass rate)
- **Before W22:** 16/22 (73% pass rate)
- **Delta:** Test suite was consolidated from 22 → 14 tests in W21.1 (readiness gate restructure). The 4 failures are the same underlying issues as before; test count decreased while pass count decreased proportionally.

### Pending failures breakdown

| # | Failure | Root cause | Required fix |
|---|---------|-----------|--------------|
| 1 | `lifecycle.ts` should be deleted | Still exists on disk | Delete after rewiring 5 importers |
| 2 | `lifecycle-modes.ts` should be deleted | Still exists on disk | Delete after confirming zero consumers |
| 3 | No `js/modules/` file imports from `./lifecycle.ts` | 5 files still import it | Rewire imports to `@lib/stores/lifecycle` or other canonicals |
| 4 | `journey-*` cross-module imports (9 violations) | Genuine — journey files have internal `./` relative imports | Separate cleanup wave; some may resolve when lifecycle.ts importers are rewired |

---

## 3. Wave 22 Status (Charter Execution)

### Wave 22.1 ✅ COMPLETE

- **demo_ui.css orphan cleanup:** Audit was stale — orphans already deleted in `7a89261` (W21 Lane C). No work needed.
- **`.is-active` shared modifier doc:** Updated in `docs/semantic-demo-css-ownership-map.md` — commit `9905d86`.

### Wave 22.2 ✅ COMPLETE

- **Navigation + journey test migration:** Consolidated to standalone files in commit `96bd0d8`.
- All 12 state-class-migration tests now consolidated into 6 files (10 in main scaffold + 2 standalone).

### Wave 22.3 ⏳ IN PROGRESS

- W20 closure verification (this doc)
- Landscape breakpoint consolidation — DEFERRED to W23 (see §4)

---

## 4. Deferred to W23 (per W22 Charter)

These items from the W22 charter are explicitly deferred to W23 due to effort level or dependency:

| Item | Source | Effort | Why deferred |
|------|--------|--------|-------------|
| Landscape breakpoint consolidation (Smell 4) | CSS audit | M | Requires live landscape proof at 8+ breakpoints across 6 files |
| `.focus-stage` cascade order fix (Smell 1) | CSS audit | L | HIGH impact but rename + doc update + re-verify all contracts |
| `.info-panel` CSS consolidation (Smell 2) | CSS audit | L | HIGH impact but requires mobile browser proof at 390×844 across 13 files |
| Component test foundation | Svelte audit §5 | L | Needs `@testing-library/svelte` setup decision first |
| `tests/unit/` legacy retirement | Test audit | L | 10 files to port or retire + delete vitest.legacy.config.js |

---

## 5. Remaining Work for W20 Closure

To achieve readiness test 14/0 (all passing):

1. **Rewire 5 `./lifecycle.ts` importers** → `@lib/stores/lifecycle` or other canonicals
2. **Delete `lifecycle.ts`** → after zero importers remain
3. **Delete `lifecycle-modes.ts`** → after confirming zero consumers
4. **Address 9 journey-* cross-module imports** → some resolve with lifecycle rewire; remainder is a separate cleanup wave (genuine inter-journey dependencies like `./thread-inspector.ts`, `./navigation-state.ts`, etc.)

---

## 6. References

| Document | Path | Relevance |
|----------|------|-----------|
| W22 charter | `docs/w22-charter-2026-06-17.md` | Wave 22.3 item 1 definition |
| Original W20 verification | `docs/w20-wave4-verification-2026-06-17.md` | Baseline status (7/10 deleted, 3 pending) |
| CSS ownership investigation | `notes/w21-css-ownership-investigation-2026-06-17.md` | Smell 4 (landscape breakpoints), Smells 1-3 |
| Test consolidation audit | `notes/w21-test-consolidation-audit-2026-06-17.md` | State-class migration consolidation |
| Readiness test | `tests/unit-active/w20-wave4-readiness-regression.test.ts` | 14 tests, 4 failures |

---

*Last updated 2026-06-17 by main lane. W20 cleanup is 80% complete (8/10 files deleted); 2 files + 5 importers remain.*
