# Worker FIXED — Commit the orphaned lane Playwright-dist-freshness work + tie-off

You are an autonomous cleanup worker in C:/Users/HP/repos/semantic-explorer.

## Background (read-only; verify each claim)
- A previous lane refactored the Playwright webServer wrapper to skip `npm run
  build` when `dist/svelte` is fresh. The work is **UNCOMMITTED**:
  `scripts/playwright-web-server.mjs` is modified (`git status` shows ` M`).
- Supporting file should exist: `scripts/playwright-dist-freshness.mjs`
  (its `getPlaywrightDistFreshness` is imported by the changed web-server), plus
  a contract test `tests/playwright-dist-freshness-contract.mjs`.
- Related precedent commit already in history: `0fb83796` (test(infra): make
  Playwright webServer API host env-aware).

## Your job — land the orphaned work as the lane left it
1. VERIFY the change is coherent: the diff imports `getPlaywrightDistFreshness`
   and uses it to skip the build when fresh (with `PLAYWRIGHT_FORCE_BUILD=1`
   override). Report WHAT it does in your own words.
2. Verify `scripts/playwright-dist-freshness.mjs` + the contract test exist and
   pass: run `node tests/playwright-dist-freshness-contract.mjs` and
   `node --check scripts/playwright-web-server.mjs`.
3. Stage and commit ONLY these related files:
   - `scripts/playwright-web-server.mjs`
   - `scripts/playwright-dist-freshness.mjs` (if new)
   - `tests/playwright-dist-freshness-contract.mjs` (if new/untracked)
   - `docs/dev-commands.md` (only if its diff IS part of this feature's docs)
   Message: `chore(test-infra): land orphaned Playwright dist-freshness (lane follow-up) — reused fresh dist skips npm run build when PLAYWRIGHT_DIST freshness passes`
4. DO NOT touch: package.json, any src/, css/, api/, or anything else. If the
   working tree contains OTHER uncommitted files (e.g. AGENTS.md, docs/), leave
   them untouched — commit only the four paths above.

## Rubric (self-score 0-10 in report)
- R5 — The dist-freshness contract test passes (document output)
- R4 — web-server type/parse checks (node --check) pass
- R3 — commit contains ONLY the stated paths (git show --stat)
- R2 — You wrote tmp/repair-playwright-freshness-REPORT.md with the diff summary + verification output
- R1 — You did not modify any source logic; at most you may FIX a broken import/name IF the code is broken (and say so)

## Extra context
`npm run build` takes ~2 min; the old webServer ran it unconditionally, so any
Playwright suite was slow. Freshness-aware skipping is the win. Your report
last line must be:
`PLAYWRIGHT-FRESHNESS DONE — commit: <short-sha>`