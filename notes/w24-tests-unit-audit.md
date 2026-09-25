# tests/unit/ Legacy Audit (W24, 2026-06-17)

**Status:** Audit complete — retirement plan proposed, application deferred

## 1. Background

Per docs/w22-charter-2026-06-17.md (Section 7) and the W24 deferred items, `tests/unit/` was identified as legacy and slated for retirement. This audit catalogs the current state and recommends migration paths.

The directory preserves the pre-Svelte Vitest unit suite as reference material (per its own README). Files are intentionally not deleted, but many target retired `js/modules/*` owners or legacy behavior and are not part of the active unit gate (`npm run test:unit`). Legacy tests are run via the separate `npm run test:unit:legacy` script, which uses `vitest.legacy.config.js`.

## 2. Current Inventory

| File | Type | Lines | Purpose | Test Target | Source Exists? |
|---|---|---|---|---|---|
| `vitest.setup.js` | setup | 27 | window.matchMedia stub for jsdom | Infrastructure | n/a |
| `setup/` | dir | — | Empty setup directory | n/a | n/a |
| `clean-optional-value.test.js` | .js | 71 | NULLISH_SENTINELS + whitespace + empty cases | `src/lib/utils/dom-formatters.ts` | ✅ Yes |
| `data-search-sweep.test.js` | .js | 55 | Geo-data tokenizer NFC + IDB dbPromise reset | `src/lib/utils/geo-data` | ✅ Yes |
| `environment.test.js` | .js | 83 | Viewport / matchMedia / DPR behavior | `src/lib/utils/environment.ts` | ✅ Yes |
| `idb-service-timeout.test.js` | .js | 90 | IndexedDB transaction timeout resilience | `src/lib/services/idb-service.ts` | ❌ **MISSING** |
| `journey-text-helpers.test.js` | .js | 70 | truncateMicrocopy, getSharedTrailTopicLabel | `js/modules/journey-text-helpers` | ❌ **MISSING** |
| `relationship-roles.test.js` | .js | 117 | normalize/get/describe relationship roles | `src/lib/utils/relationship-roles.ts` | ✅ Yes |
| `search-results-ui-ts-dom.test.js` | .js | 132 | renderSearchResultItems, empty/error states | `src/lib/search/results-ui.ts` | ✅ Yes |
| `search-tokenizer-parity.test.js` | .js | 60 | Special-char preprocessing, Intl.Segmenter fallback | `src/lib/search/tokenizer.ts` | ✅ Yes |
| `search-tokenizer.test.js` | .js | 106 | tokenizeSearchText, expandSearchIntent, countTokenMatches | `src/lib/search/tokenizer.ts` | ✅ Yes |
| `strand-continuity-ts.test.ts` | .ts | 335 | StrandContinuityManager timer tracking, cancelAll, snapshot | `src/lib/utils/strand-continuity.ts` | ✅ Yes |
| `README.md` | doc | ~20 | Documents legacy structure | n/a | n/a |

**Total:** 11 test files (.js/.ts), 1 setup file, 1 README, 1 empty dir. **1,146 lines** of test code.

## 3. Retirement Candidates

### ✅ RETIRE — Covered by tests/unit-active/

These files have direct, explicit equivalents in `tests/unit-active/`:

| Legacy File | Active Equivalent | Notes |
|---|---|---|
| `clean-optional-value.test.js` | `clean-optional-value.test.ts` | Active version imports same `src/lib/utils/dom-formatters` |
| `search-tokenizer-parity.test.js` | `search-tokenizer-parity.test.ts` | Active file header says "Port of tests/unit/search-tokenizer-parity.test.js (W17)" |
| `search-tokenizer.test.js` | `search-tokenizer.test.ts` | Active covers tokenizeSearchText, expandSearchIntent, countTokenMatches |
| `relationship-roles.test.js` | `relationship-roles.test.ts` | Active imports same `src/lib/utils/relationship-roles` functions |
| `strand-continuity-ts.test.ts` | `strand-continuity.test.ts` | Active covers StrandContinuityManager, get/reset singleton |

### ❌ RETIRE — Broken (source file missing)

These test files import from modules that no longer exist. They will fail at import time if run:

| Legacy File | Missing Source | Status |
|---|---|---|
| `idb-service-timeout.test.js` | `src/lib/services/idb-service.ts` | Source deleted; test is dead code |
| `journey-text-helpers.test.js` | `js/modules/journey-text-helpers.js` | Source deleted; test is dead code |

### ⚠️ KEEP — No active equivalent (migration needed)

These test files target existing source modules but have **no equivalent** in `tests/unit-active/`:

| Legacy File | Test Target | Lines | Risk if Retired |
|---|---|---|---|
| `environment.test.js` | `src/lib/utils/environment.ts` | 83 | **Medium** — viewport/matchMedia logic is load-bearing for responsive behavior |
| `data-search-sweep.test.js` | `src/lib/utils/geo-data` | 55 | **Low** — covers tokenizer NFC normalization + IDB reset; may be partially covered by `search-tokenizer*.ts` |
| `search-results-ui-ts-dom.test.js` | `src/lib/search/results-ui.ts` | 132 | **Medium** — covers renderSearchResultItems + empty/error state rendering; no active equivalent |

### 📦 KEEP — Infrastructure

| File | Status | Notes |
|---|---|---|
| `vitest.setup.js` | **KEEP** (critical) | Referenced by `vitest.config.js` `setupFiles: ['tests/unit/vitest.setup.js']`. Moving this would break the active test suite. Must be relocated before directory can be deleted. |
| `setup/` | **DELETE** | Empty directory, no references. |
| `README.md` | **ARCHIVE** | Move to `docs/` as historical reference before directory deletion. |

## 4. Migration Plan (for W25+)

### Phase 0: Pre-flight (risk: minimal)

1. Run `npm run test:unit:legacy` and record baseline pass/fail counts
2. Run `npm run test:unit` (active suite) and record baseline
3. Verify no CI pipeline references `tests/unit/` test files directly (audit confirmed: only `vitest.legacy.config.js` and historical docs reference them)

### Phase 1: Shadow-exclude legacy tests from runner

1. Update `vitest.legacy.config.js` `include` to empty array `[]` (or delete the config)
2. Run `npm run test:unit:legacy` — should show 0 tests, confirm clean exit
3. Remove `"test:unit:legacy"` script from `package.json`

### Phase 2: Migrate load-bearing tests to tests/unit-active/

For the 3 files with no active equivalent:

| File | Migration Step | Estimated Effort |
|---|---|---|
| `environment.test.js` | Port 83 lines to `.ts`, update imports | Small — straightforward `.js` → `.ts` conversion |
| `data-search-sweep.test.js` | Evaluate overlap with `search-tokenizer*.ts` in active; port unique assertions | Small — likely 2-3 unique assertions |
| `search-results-ui-ts-dom.test.js` | Port to `.ts`, update imports from `results-ui.ts` | Medium — 132 lines, some DOM mocking |

### Phase 3: Move vitest.setup.js

1. Copy `tests/unit/vitest.setup.js` → `tests/vitest.setup.js` (or `tests/unit-active/vitest.setup.js`)
2. Update `vitest.config.js` `setupFiles` to point to new location
3. Run `npm run test:unit` to verify no regressions

### Phase 4: Delete legacy directory

1. Delete `tests/unit/` entirely (all files, `setup/` subdir)
2. Run full test suite to confirm clean
3. Update any docs referencing `tests/unit/`

## 5. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Parallel session WIP on tests/unit/ files | Medium | Check git log for recent changes to `tests/unit/` before deletion; coordinate with active sessions |
| `vitest.setup.js` move breaks active suite | High | Phase 3 requires careful staging — run full suite between copy and config update |
| Missing edge cases in active equivalents | Low | Before retiring each legacy file, diff its assertions against active version |
| CI references `tests/unit/` | Low | Audit confirmed no CI references; only `vitest.legacy.config.js` and historical docs |
| `data-search-sweep.test.js` has unique IDB coverage | Low | IndexedDB dbPromise reset test is structural (tests module shape, not behavior); safe to drop |

## 6. Step-by-Step Plan

```
Phase 0: Pre-flight
  ☐ Run npm run test:unit:legacy, record baseline
  ☐ Run npm run test:unit, record baseline

Phase 1: Shadow-exclude
  ☐ Empty vitest.legacy.config.js include array
  ☐ Confirm 0 tests run from tests/unit/
  ☐ Remove "test:unit:legacy" from package.json scripts

Phase 2: Migrate (W25+)
  ☐ Port environment.test.js → tests/unit-active/environment.test.ts
  ☐ Evaluate data-search-sweep.test.js for unique assertions, port if needed
  ☐ Port search-results-ui-ts-dom.test.js → tests/unit-active/search-results-ui.test.ts

Phase 3: Move setup
  ☐ Copy vitest.setup.js to tests/ root or tests/unit-active/
  ☐ Update vitest.config.js setupFiles path
  ☐ Run npm run test:unit — confirm pass

Phase 4: Delete
  ☐ Delete tests/unit/ directory entirely
  ☐ Archive README.md to docs/
  ☐ Run full test suite
  ☐ Update any doc references
```

## 7. Reference

- `docs/w22-charter-2026-06-17.md` — original retirement plan (Section 7)
- `notes/w20-retrospective-2026-06-17.md` — lessons learned
- `tests/unit-active/` — modern equivalent (47+ .ts test files)
- `vitest.legacy.config.js` — legacy test runner config
- `package.json` `"test:unit:legacy"` — legacy test script
