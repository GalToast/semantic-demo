# Explore-Swarm — W4 Tests, Build/Config, Scripts & Docs Integrity — Semantic Explorer (2026-06-19)

## Role

You are **Worker 4 of 4** in a read-only "explore every nook and cranny" swarm. **DO NOT EDIT, WRITE, OR COMMIT ANY FILES** except your one deliverable report. Exhaustively read and analyze your slice for real bugs, smells, dead/unused tests, broken script targets, config drift, and doc-link/token inconsistency. If a finding tempts you to fix it — stop and document it instead. The main lane synthesizes all four reports and decides what to fix.

## Working Directory

`C:\Users\HP\repos\semantic-explorer`

## Pre-existing Docs (READ FIRST)

- `scripts/package-scripts-refactor.md` (a script-consolidation plan is in flight — treat as truth-in-progress for `package.json` dedup)
- `docs/semantic-demo-design-tokens.md` (token source of truth for doc-consistency checks)
- `docs/archive/semantic-demo-bugsweep-m3-2026-06-07.md` through `wave4`
- `tmp/bridge-retirement-audit-2026-06-19.md`

Mark findings **CONFIRMED (known)** if already present, else **NEW**.

## Dirty-file policy (parallel session is editing these right now)

You MAY read these, but findings rooted in their current contents must be tagged **`NEEDS-RECHECK (file dirty)`**:

```
package.json
eslint.config.js
.gitignore
tests/mobile-layout-bugs-116-119-120.spec.cjs
tests/surface-contract-check.mjs
tests/unit-active/component-ModeChips.test.ts
tests/unit-active/mobile-mode-chip-icons.test.ts
```

## Your Slice — Tests, Build/Config, Scripts & Docs (READ + ANALYZE)

- `tests/**` (all `.mjs`, `.spec.js`, `.spec.cjs`, `.test.ts`, `run-all-contracts.js`, helpers) — with dirty caveat above
- `package.json` (script targets, deps) — NEEDS-RECHECK
- `eslint.config.js`, `vite.config.ts`, `vitest.config.js`, `vitest.legacy.config.js`, `svelte.config.js`, `playwright.config.js`, `tsconfig.json`, `tsconfig.typecheck.json` — NEEDS-RECHECK for eslint/package
- `scripts/**` (ci-checks, qa-server, model-health-check, etc.)
- `docs/**` link integrity + design-token consistency

## Methodology

1. **Adversarial review**: "what would make this wrong?", "what's untested?", "what script points at a deleted file?"
2. **Verify against source/filesystem**: every script-target and doc-link claim checked with `rg`, `find`, `ls`. Use `git diff HEAD -- <path>` for dirty files.
3. **Cite file:line**. Avoid "may/could/possibly".
4. **Be exhaustive** across the test/config surface — this slice is wide and shallow; catalog systematically.

## Priority sweep targets (tests/config/docs)

1. **Script-target integrity**: for each `package.json` script, does the referenced file exist? (recent commit `0dddabc` repointed 47 tests; commit `ce07c48` touched deploy — check for dangling refs). Flag the 197→60 script consolidation plan status.
2. **Duplicate/dead scripts**: per `scripts/package-scripts-refactor.md` — byte-identical commands under different names; surface any already-deduped vs still-duplicated.
3. **Test referencing deleted paths**: any test still importing `js/modules/*` (mostly retired) or other deleted files → runtime failure.
4. **Unused vars / stale eslint-disable** in tests (the known cluster in `tests/integration/a11y-baseline.spec.js` ~18 stale `no-console` disables, and a few unused `viewportHeight`/`fs`/`expect`) — catalog them as LOW cleanup.
5. **Config drift**: `tsconfig.json` vs `tsconfig.typecheck.json` include/exclude mismatch; `vitest.config.js` vs `vitest.legacy.config.js` — is legacy still needed? `eslint.config.js` ignoring paths that no longer exist.
6. **Dep versions**: any dependency obviously mismatched to peer (e.g. `svelte ^5.56` vs `@sveltejs/vite-plugin-svelte ^7.1.2` vs `svelte-check ^4.1.0`) — flag without claiming breakage unless you can show it.
7. **Doc-link integrity**: `docs/**/*.md` relative links and the `docs/...` references in `AGENTS.md` — do the targets exist? (AGENTS.md lists several reference docs; verify each path.)
8. **Design-token consistency**: do JS token sources match `docs/semantic-demo-design-tokens.md`?
9. **Helper/loader correctness**: `tests/helpers/ts-resolve-loader.mjs` and `run-all-contracts.js` groups — any group name referenced but undefined, or defined but never run?

## Output

Save to **`tmp/explore-w4-tests-config-report.md`** with the standard structure:

```markdown
# Tests, Build/Config, Scripts & Docs — Exploration Report (2026-06-19)
## Summary  (counts + NEW/known/needs-recheck + top 3 risks)
## Cross-reference to prior sweeps  (table)
## HIGH / ## MEDIUM / ## LOW  (each: File:line, Verified, Evidence, Impact, 1-sentence fix)
## Verification Notes  (incl. a compact "broken script targets" + "broken doc links" appendix)
```

## Constraints

- **No edits.** No `npm run build`/`test`/`lint` (read-only). If you must verify a script, *read* its target file, don't execute it.
- **No false regressions.** Verify each broken-link/broken-target claim by actually checking the path exists or not.
- **Wall budget: 1200s (20 min).** Be exhaustive.

## Return

Text summary (≤200 words): (1) report path, (2) severity counts + NEW/known/needs-recheck, (3) top 3 by impact, (4) the compact broken-targets/broken-links list inline, (5) cross-cutting notes for the other three workers.
