# tests/unit/ Retirement Closure (W24, 2026-06-17)

**Status:** Phase 1-4 retirement COMPLETE
**Audit:** notes/w24-tests-unit-audit.md (created 2026-06-17)

---

## 1. Executive Summary

The legacy `tests/unit/` directory has been fully retired as part of the W24 cleanup arc.
All test files have been either migrated to `tests/unit-active/` (active suite) or deleted
as having equivalent coverage in the active suite.

- **2 broken tests deleted** (Phase 1, commit `17806d3`)
- **3 KEEP tests migrated** to tests/unit-active/ via `git mv` (Phase 2-3, commit `e2d6931`)
- **vitest.setup.js relocated** to tests/unit-active/ (Phase 2, commit `e2d6931`)
- **vitest.config.js updated** to match new setup path (commit `268a628`)
- **5 RETIRE tests deleted** (Phase 4, commit `fca78ec`)
- **README.md updated** to reflect final state
- **setup/ directory** still exists (verify before next deletion wave)

## 2. Phase-by-Phase Breakdown

### Phase 1: Delete Broken Tests (commit `17806d3`)
Files deleted:
- `tests/unit/idb-service-timeout.test.js` (90 lines) — source `idb-service.ts` no longer exists
- `tests/unit/journey-text-helpers.test.js` (70 lines) — source `journey-text-helpers` no longer exists

Both tests imported from source files that had been deleted in earlier cleanup waves.
Total removed: 160 lines.

### Phase 2: Relocate vitest.setup.js (commit `e2d6931`)
- `tests/unit/vitest.setup.js` → `tests/unit-active/vitest.setup.js`
- `vitest.config.js`: setupFiles path updated in commit `268a628`
- Critical infrastructure (`window.matchMedia` stub for jsdom) moved to active suite

### Phase 3: Migrate KEEP Tests (commit `e2d6931`)
Files migrated via `git mv` (preserves history, no path adjustments needed):
- `tests/unit/data-search-sweep.test.js` → `tests/unit-active/data-search-sweep.test.js`
- `tests/unit/environment.test.js` → `tests/unit-active/environment.test.js`
- `tests/unit/search-results-ui-ts-dom.test.js` → `tests/unit-active/search-results-ui-ts-dom.test.js`

Both directories are at the same depth (`../../src/...`), so import paths work unchanged.

### Phase 4: Delete RETIRE Tests (commit `fca78ec`)
Files deleted:
- `tests/unit/clean-optional-value.test.js` (71 lines)
- `tests/unit/relationship-roles.test.js` (117 lines)
- `tests/unit/search-tokenizer-parity.test.js` (60 lines)
- `tests/unit/search-tokenizer.test.js` (106 lines)
- `tests/unit/strand-continuity-ts.test.ts` (335 lines)

Total deleted: 689 lines. Coverage verified in tests/unit-active/.

## 3. Final State of tests/unit/

```
tests/unit/
├── README.md (updated pointer to tests/unit-active/)
└── setup/ (still exists, verify before next deletion wave)
```

tests/unit-active/ now contains (post Phase 2-3):
- `vitest.setup.js` (relocated from tests/unit/)
- `data-search-sweep.test.js` (migrated via git mv)
- `environment.test.js` (migrated via git mv)
- `search-results-ui-ts-dom.test.js` (migrated via git mv)
- Plus pre-existing active tests (state-class-migration, w20-wave4-readiness, component-*, etc.)

## 4. Verification

- Full vitest run: PASS after each committed phase
- No regression introduced by Phase 1-3
- Active suite covers all retired functionality (verified in audit)

## 5. Files Retired — Mapping

| Retired File | Status | Active Equivalent |
|---|---|---|
| `idb-service-timeout.test.js` | ✅ Deleted (Phase 1) | (source gone — no equivalent needed) |
| `journey-text-helpers.test.js` | ✅ Deleted (Phase 1) | (source gone — no equivalent needed) |
| `vitest.setup.js` | ✅ Relocated (Phase 2) | `tests/unit-active/vitest.setup.js` |
| `data-search-sweep.test.js` | ✅ Migrated (Phase 3) | `tests/unit-active/data-search-sweep.test.js` |
| `environment.test.js` | ✅ Migrated (Phase 3) | `tests/unit-active/environment.test.js` |
| `search-results-ui-ts-dom.test.js` | ✅ Migrated (Phase 3) | `tests/unit-active/search-results-ui-ts-dom.test.js` |
| `clean-optional-value.test.js` | ✅ Deleted (Phase 4) | `clean-optional-value.test.ts` |
| `relationship-roles.test.js` | ✅ Deleted (Phase 4) | `relationship-roles.test.ts` |
| `search-tokenizer-parity.test.js` | ✅ Deleted (Phase 4) | `search-tokenizer-parity.test.ts` |
| `search-tokenizer.test.js` | ✅ Deleted (Phase 4) | `search-tokenizer.test.ts` |
| `strand-continuity-ts.test.ts` | ✅ Deleted (Phase 4) | `strand-continuity.test.ts` |

## 6. Lessons Learned

1. **Audit before trust:** The W21 audit overcounted duplicates; the actual cross-file
   duplicate count was 1, not 11. Always verify audit claims before bulk actions.
2. **Test relocation path:** `git mv` preserves history. No path adjustments needed when
   both `tests/unit/` and `tests/unit-active/` are at the same depth (`../../src/...` works).
3. **vitest.setup.js was gating:** Moving it first unblocked all subsequent retirement work.
   The vitest.config.js path update (`268a628`) was a separate follow-up commit.
4. **Source integrity checks:** Confirmed all 2 broken tests referenced deleted source files
   before deletion, avoiding false positives.
5. **Phase 4 bundled with doc:** The 5 RETIRE test deletions (689 lines) were committed
   alongside the closure doc in a single commit (`fca78ec`), completing the full arc.

## 7. Reference

- `notes/w24-tests-unit-audit.md` — Phase 1 audit, original categorization
- `17806d3` — Phase 1: delete 2 broken tests
- `e2d6931` — Phase 2-3: setup relocation + 3 KEEP tests migration (via git mv)
- `268a628` — vitest.config.js setupFiles path update
- `fca78ec` — Phase 4: delete 5 RETIRE tests + this closure doc
- `vitest.config.js` — setupFiles path (now points to tests/unit-active/)
