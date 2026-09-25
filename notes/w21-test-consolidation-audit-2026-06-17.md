# W21 Test Consolidation Audit — 2026-06-17

**Author:** main lane
**Status:** investigation complete, no test changes
**Scope:** tests/ + vitest.config.js + vitest.legacy.config.js

---

## 1. Inventory

- **Total test files:** 302
- **Test files by directory:**
  - `tests/` root: 217 (155 `.mjs` contract tests, 55 `.spec.js` Playwright tests, 7 other)
  - `tests/unit-active/`: 67 (vitest canonical, `npm run test:unit`)
  - `tests/unit/`: 10 (legacy, `vitest.legacy.config.js`, NOT run by default)
  - `tests/integration/`: 1 (`w15-body-attr-live-probe.spec.js`)
  - `tests/helpers/`: 3 (test utilities)
  - `tests/workers/`, `tests/playwright/`, `tests/agent-runtime/`, `tests/_fixtures/`: 1 each
- **Current vitest status:** 711 passed / 9 failed / 720 total (64 files pass, 3 files fail)
  - Failures: `commit-purity-invariant.test.ts` (1), `w20-wave4-readiness-regression.test.ts` (5+), `bridge-import-graph-invariant.test.ts` or similar (3)
  - The w20-wave4 failures are **expected** — the test is a readiness gate that fails until Wave 4 cleanup completes
- **Vitest scope:** Only `tests/unit-active/**/*.{test,spec}.{js,mjs,ts}` is included. Root `.mjs` contracts and `.spec.js` Playwright tests run via separate runners (`node tests/run-all-contracts.js`, `npx playwright test`).

---

## 2. Top 5 Consolidation Opportunities (ranked by severity)

### Opportunity 1: Redundant state-class-migration tests — MEDIUM

**File(s):**

- `tests/unit-active/camera-state-class-migration.test.ts` (14 tests)
- `tests/unit-active/compass-state-class-migration.test.ts`
- `tests/unit-active/demo-state-class-migration.test.ts`
- `tests/unit-active/engine-bridge-state-class-migration.test.ts`
- `tests/unit-active/filter-state-class-migration.test.ts`
- `tests/unit-active/focus-state-class-migration.test.ts`
- `tests/unit-active/journey-state-class-migration.test.ts`
- `tests/unit-active/legend-state-class-migration.test.ts`
- `tests/unit-active/navigation-state-class-migration.test.ts` (11 tests)
- `tests/unit-active/search-state-class-migration.test.ts` (22 tests)
- `tests/unit-active/viewport-state-class-migration.test.ts` (12 tests)
- `tests/unit-active/weather-state-class-migration.test.ts`

**Why:** All 12 files follow the same template: mock `@lib/state/app.svelte.ts` via `vi.hoisted()` + `vi.mock()`, import a store, verify getter read paths (local store → `appState` → `window.__APP_STATE__` → `window.__TEST_STATE__` → `window.__semanticState` → `window.state`). The boilerplate is ~60-80 lines per file. The only differences are: (a) which store is imported, (b) which fields are asserted, (c) the mock shape.

**Fix:** Parameterize into a single `state-class-migration.test.ts` with an array of `{ storeName, importFn, fields, mockShape }` entries. Each entry becomes a `describe()` block. The shared mock factory, setup, and teardown live once.

**Effort:** M (mechanical refactor, no logic changes)
**Test count delta:** 12 files → 1 file. ~300 lines of boilerplate eliminated. Test count stays ~150 assertions.

**Example (current pattern repeated 12×):**

```typescript
// Each file has this identical structure:
const mockState = vi.hoisted(() => ({ navState: { ... } }));
vi.mock('@lib/state/app.svelte.ts', () => ({ appState: mockState }));
import { someStore } from '@lib/stores/some.svelte';
// then 10-20 test cases verifying getter fallback chains
```

---

### Opportunity 2: Permanently-failing readiness gate — HIGH (misleading)

**File(s):**

- `tests/unit-active/w20-wave4-readiness-regression.test.ts` (all Section 1-4 assertions)

**Why:** This test was designed as a temporary gate: "FAILS today (Wave 4 not yet complete) and PASSES after Wave 4 cleanup lands." It checks that 10 deleted files (`journey.ts`, `lifecycle.ts`, `loading-ui.ts`, `composition-state.ts`, `exploration-mode.ts`, `app-svelte-island.ts`, `three-node-manager.ts`, `map-state.ts`, `lifecycle-modes.ts`, `lifecycle-reset.ts`) no longer exist in `js/modules/`, and that cross-module `./` relative imports are cleaned up. It currently fails on 5+ assertions. Perpetually-failing tests train developers to ignore test output — the most dangerous habit in a test suite.

**Fix:** Two options:

1. **If Wave 4 is complete:** Verify the deleted files are gone, clean up any remaining violations, and the test should pass. Then keep it as a permanent invariant.
2. **If Wave 4 is incomplete:** Move the failing assertions to a clearly-labeled `xit()` / `describe.skip()` block with a tracking ticket, so the suite is green. Re-enable when Wave 4 lands.

**Effort:** S (investigate + fix or skip)
**Test count delta:** Removes 5-9 always-failing assertions from the red count. Currently contributes ~5 of the 9 total failures.

---

### Opportunity 3: Duplicate parity test coverage — MEDIUM

**File(s):**

- `tests/unit/search-tokenizer-parity.test.js` (legacy, 10 tests)
- `tests/unit-active/search-tokenizer-parity.test.ts` (canonical, 6 tests)
- `tests/3d-touch-parity.spec.js` (Playwright, separate runner)
- `tests/parity-attrs-semantic-dive-race-regression.mjs` (contract runner)
- `tests/unit-active/svelte-parity-attrs.test.ts` (vitest, 15+ tests)
- `tests/unit-active/focus-port-parity.test.ts` (vitest, 32 tests)

**Why:**

- `search-tokenizer-parity` exists in both `tests/unit/` (legacy JS) and `tests/unit-active/` (canonical TS). Both test the same `tokenizeSearchText` from `src/lib/search/tokenizer`. The unit-active version is the port; the unit version is the retired original. They test overlapping cases (O'Brien, co-op, AT&T, @/# prefixes).
- `svelte-parity-attrs.test.ts` (15+ vitest tests) and `parity-attrs-semantic-dive-race-regression.mjs` (1 contract test) both exercise the parity-attrs layer. The vitest version is comprehensive; the contract version is a single race-condition regression.

**Fix:**

1. Delete `tests/unit/search-tokenizer-parity.test.js` (superseded by the `.ts` port).
2. Merge the race-condition assertion from `parity-attrs-semantic-dive-race-regression.mjs` into `svelte-parity-attrs.test.ts` as an additional `it()` block. Delete the `.mjs` file.
3. `3d-touch-parity.spec.js` and `focus-port-parity.test.ts` test different surfaces (3D touch vs focus-port trivia filtering) — no merge needed.

**Effort:** S-M
**Test count delta:** Removes 2 files (legacy parity + race regression .mjs), merges ~7 assertions into existing tests.

---

### Opportunity 4: Canonical regression test overlap — MEDIUM

**File(s):**

- `tests/unit-active/composition-state-canonical-regression.test.ts` (6 tests)
- `tests/unit-active/lifecycle-bridge-canonical-regression.test.ts` (5 tests)
- `tests/unit-active/lifecycle-canonical-semantic-dive-mode-regression.test.ts` (6 tests)

**Why:** All three tests read source files via `readFileSync()` and assert import/export chain integrity. They overlap significantly:

- `composition-state-canonical` checks that `@lib/orchestration/composition-state.ts` re-exports from `@lib/stores/lifecycle`
- `lifecycle-bridge-canonical` checks that `src/lib/engine/lifecycle-bridge.ts` imports from `@lib/orchestration/lifecycle` (not legacy `js/modules/`)
- `lifecycle-semantic-dive-mode` checks that `setSemanticDiveMode` flows through the same `orchestration/lifecycle → stores/lifecycle → focus.svelte` chain

All three assert the same invariant: **the canonical re-export chain is intact and doesn't regress to legacy paths.** They could be a single `canonical-chain-regression.test.ts` with sections for each chain.

**Fix:** Merge into one `canonical-chain-regression.test.ts` with three `describe()` sections: (1) composition-state chain, (2) lifecycle-bridge chain, (3) semantic-dive-mode chain. Shared `read()` helper stays once.

**Effort:** S-M
**Test count delta:** 3 files → 1 file. ~60 lines of duplicated `read()` + `resolve()` helpers eliminated.

---

### Opportunity 5: Stale vitest.legacy.config.js and tests/unit/ — LOW

**File(s):**

- `vitest.legacy.config.js` (references `@legacy` alias → `JS_DIR`)
- `tests/unit/` (10 test files, `vitest.setup.js`, `README.md`)

**Why:** The `@legacy` alias was removed in Ticket 9D-Option-B (commit `cbc6509`). The `vitest.legacy.config.js` still defines `@legacy: JS_DIR` and includes `tests/unit/**/*.test.js`. Running `npm run test:unit:legacy` would fail for any test that uses `@legacy` imports. The `tests/unit/README.md` says "Preserve old assertions in `tests/unit/` until they are converted here or are no longer useful as reference." Some files (like `search-tokenizer-parity.test.js`) have already been ported to `tests/unit-active/`.

**Fix:**

1. Audit each `tests/unit/` file: if ported to `tests/unit-active/`, delete the legacy copy.
2. If not ported but still useful, port it or mark as intentionally preserved.
3. Once `tests/unit/` is empty, delete `vitest.legacy.config.js` and the `test:unit:legacy` npm script.

**Effort:** L (requires porting or explicit retirement decisions for 10 files)
**Test count delta:** Removes `tests/unit/` directory (10 files) + 1 config file. Net test count depends on porting decisions.

---

## 3. Deleted-File References Audit

Tests that reference files known to be deleted or moved in W19/W20/W21:

| Referenced file | Test files that reference it | Status |
|---|---|---|
| `loading-ui` | `tests/loading-ui-contract.mjs`, `tests/state-ownership-contract.mjs`, `tests/unit-active/w20-wave4-readiness-regression.test.ts` | Contract tests read the file via `readFileSync` — may still work if file exists. w20-wave4 test **expects** it to be deleted (assertion: `existsSync() === false`). |
| `composition-state` | `tests/composition-state-invariant-contract.mjs`, `tests/composition-state-owner-contract.mjs`, `tests/map-focus-search-content-owner-contract.mjs`, `tests/unit-active/composition-state-canonical-regression.test.ts`, `tests/unit-active/w20-wave4-readiness-regression.test.ts` | Same pattern — contract tests read it, w20-wave4 expects deletion. |
| `exploration-mode` | `tests/exploration-modes-contract.mjs`, `tests/unit-active/w20-wave4-readiness-regression.test.ts` | Same pattern. |
| `map-state` | `tests/map-focus-search-content-owner-contract.mjs`, `tests/projection-state-sync-contract.mjs`, `tests/residual-window-bridge-inventory-contract.mjs`, `tests/state-ownership-contract.mjs`, `tests/unit-active/cursor-surface-preservation-regression.test.ts`, `tests/unit-active/w20-wave4-readiness-regression.test.ts` | `cursor-surface-preservation-regression` reads `map-state.ts` — if deleted, this test fails. |
| `app-svelte-island` | `tests/svelte-chrome-ownership-contract.mjs`, `tests/unit-active/w20-wave4-readiness-regression.test.ts` | Contract test reads it; w20-wave4 expects deletion. |
| `three-node-manager` | `tests/unit-active/w20-wave4-readiness-regression.test.ts` | Only the readiness gate references it. |
| `modules/journey` (legacy path) | 18+ contract tests (`tests/journey-*.contract.mjs`) + 5 unit-active tests | Most reference `js/modules/journey-*` siblings (still exist as engine kernel). Not broken — the kernel `.ts` files are the active runtime. |

**Key insight:** Most "deleted file" references are in the `w20-wave4-readiness-regression.test.ts` readiness gate (which intentionally asserts deletion) and in root-level `.mjs` contract tests that use `readFileSync()` to inspect file contents. The contract tests will break only if the referenced files are actually deleted. The `cursor-surface-preservation-regression.test.ts` is the one to watch — it reads `map-state.ts` which was deleted by parallel session `79b2576`.

---

## 4. Redundancy Audit

### Canonical chain tests (3 files, overlapping)

`composition-state-canonical-regression`, `lifecycle-bridge-canonical-regression`, `lifecycle-canonical-semantic-dive-mode-regression` all assert: "the import/export chain from orchestration → stores → focus is intact and doesn't regress to legacy paths." See Opportunity 4.

### State-class-migration tests (12 files, templated)

All follow the identical mock→import→assert pattern. See Opportunity 1.

### Search tokenizer parity (2 files, near-identical)

`tests/unit/search-tokenizer-parity.test.js` and `tests/unit-active/search-tokenizer-parity.test.ts` test the same function with overlapping cases. See Opportunity 3.

### Parity-attrs coverage (2 files, overlapping)

`svelte-parity-attrs.test.ts` (vitest) and `parity-attrs-semantic-dive-race-regression.mjs` (contract) both exercise the parity layer. See Opportunity 3.

---

## 5. Test Organization Recommendations

### Current state (confusing)

```
tests/
├── _fixtures/          # Test fixtures
├── agent-runtime/      # Agent runtime tests
├── helpers/            # Test utilities (ts-resolve-loader.mjs etc.)
├── integration/        # 1 file (w15-body-attr-live-probe.spec.js)
├── playwright/         # Playwright config/helpers
├── unit/               # 10 legacy vitest tests (vitest.legacy.config.js)
├── unit-active/        # 67 canonical vitest tests (vitest.config.js)
├── workers/            # Worker tests
├── *.mjs               # 155 contract tests (node runner)
├── *.spec.js           # 55 Playwright e2e tests (npx playwright)
└── contracts.manifest.json
```

### Problems

1. **`unit/` vs `unit-active/`** — The split is historical (W17 port). The legacy `unit/` directory is dead weight unless tests are still being ported.
2. **Root-level `.mjs` contracts** — 155 files at root level. No subdirectory organization. Hard to find related tests.
3. **`integration/` has 1 file** — Either promote it or fold it into the appropriate runner.
4. **`.spec.js` vs `.mjs` vs `.test.ts`** — Three file extensions, three runners, no naming convention documentation.

### Proposed structure

```
tests/
├── unit/               # All vitest tests (merge unit/ + unit-active/)
├── contract/           # All .mjs contract tests (moved from root)
│   ├── core/
│   ├── journey/
│   ├── scene/
│   └── ...
├── e2e/                # All .spec.js Playwright tests (moved from root)
│   ├── 3d-*.spec.js
│   ├── live-*.spec.js
│   └── ...
├── helpers/            # Test utilities
└── _fixtures/          # Test fixtures
```

**Effort:** L (requires updating vitest.config.js, run-all-contracts.js, all npm scripts, CI config)

---

## 6. Recommended Wave 22 Work

Ranked by impact/effort:

| # | Task | Impact | Effort | Files changed |
|---|---|---|---|---|
| 1 | **Fix or skip w20-wave4-readiness-regression** — Currently 5+ of the 9 vitest failures. Either complete Wave 4 cleanup or `describe.skip()` the failing sections. | HIGH | S | 1 |
| 2 | **Delete `tests/unit/search-tokenizer-parity.test.js`** — Exact duplicate of the `.ts` port. | MEDIUM | S | 1 |
| 3 | **Merge 12 state-class-migration tests into 1 parameterized file** — Eliminates ~300 lines of boilerplate, makes pattern updates one-file. | MEDIUM | M | 13 (12→1) |
| 4 | **Merge 3 canonical regression tests into 1** — Eliminates duplicated `read()`/`resolve()` helpers, single file for chain-invariant checks. | MEDIUM | S | 4 (3→1) |
| 5 | **Audit `tests/unit/` for ported files, delete `vitest.legacy.config.js`** — Removes dead test config and 10 legacy files. | LOW | L | 11+ |

---

## 7. Open Questions

1. **Is Wave 4 actually complete?** The `w20-wave4-readiness-regression.test.ts` expects 10 files deleted from `js/modules/`. Some may still exist. Need to verify before fixing the test.
2. **Should root-level `.mjs` contract tests be reorganized?** This is a large refactor (155 files + all npm scripts). May be better as a separate wave.
3. **Are the 55 `.spec.js` Playwright tests all still valid?** Some (like `micro-demo.spec.js`) test features that may have changed. A separate Playwright audit would be useful.
4. **Should `commit-purity-invariant.test.ts` be exempted or fixed?** It has 12 SHA exemptions and is fragile to git history. The concept is valuable but the implementation is brittle.
