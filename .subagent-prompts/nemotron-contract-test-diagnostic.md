# Nemotron Subagent B — Contract Test Diagnostic

## Role
You are a **diagnose-and-report** subagent. **DO NOT EDIT SOURCE FILES.** Read, run, and report. Your job is to triage the 7 known-failing contract test surfaces so the main lane can decide what's stale vs. real.

## Working Directory
`C:\Users\HP\Desktop\Temp while my comp is at the shop\semantic-explorer`

## Source of Truth
Read `tmp/m3-advisor-quality-stability-2026-06-07.md` Step 4 for the scope. Also read the m3 sweep's M-doc for any surface-contract findings: `docs/semantic-demo-bugsweep-m3-2026-06-07.md`.

## Scope (READ ONLY — no edits)
- `tests/surface-contract-check.mjs` (4360 lines, 21 surfaces) — the contract runner
- `tests/contract/` — any contract helper files
- `tests/run-all-contracts.js` — the orchestrator
- The 7 known-failing surfaces (in priority order):
  1. `thread-inspector`
  2. `field-node`
  3. `search-no-results`
  4. `compass-rail`
  5. `focus-pocket`
  6. `info-panel-empty`
  7. `mode-grid`

## OUT OF SCOPE (do NOT touch)
- All source files (no fixes — only diagnosis)
- `package.json` script edits
- The QA scripts (only run them, don't edit them)

## What to Investigate (priority order)

### 1. Get baseline failure output
For each of the 7 surfaces, run the contract test and capture the failure:
- `npm run qa:contract:thread-inspector` (etc. for each surface)
- Note: per F-BUILD-6, `test:contract` may hit 120s timeout. If that happens, run individual surface contracts instead.

### 2. Categorize each failure
For each of the 7 surfaces, classify the failure as ONE of:
- **A. Stale test fixture** — test asserts on a DOM ID / data attribute / file that no longer exists. Fix would be to update the test.
- **B. Real visual regression** — a Svelte/CSS/code change broke a real visual contract. Fix would be in source.
- **C. Test infrastructure issue** — runner itself is broken (timeout, import error, etc.). Fix would be in `tests/surface-contract-check.mjs` or the runner config.
- **D. Test is correct, surface is genuinely broken** — combine B + C in the sense that the test correctly catches a real bug.

### 3. For each failure, capture:
- Surface name
- Failure category (A/B/C/D)
- Specific assertion that failed (quote the line)
- File:line ref to the test code
- File:line ref to the relevant source code (if applicable)
- Proposed fix (1 sentence, do NOT apply)

### 4. Cross-reference
- Are any of the 7 failures caused by recent commits? `git log --since="2026-06-01" -- tests/surface-contract-check.mjs` to see if the test file itself was recently changed.
- Are any caused by recent source changes in the surfaces they test? (e.g., was `focus-pocket.js` changed in the last 5 days?)
- Do any share a common root cause? (e.g., all 7 fail because the surface-component map changed)

## Time Budget
- 5 min read source
- 15 min run the 7 surface contracts, capture output
- 10 min categorize each
- 5 min write report
- 5 min cross-reference

If you fall behind, prioritize: capture failure output (don't skip) > categorize (5 surfaces minimum) > cross-reference.

## Output
Save your report to `tmp/nemotron-contract-test-diagnostic.md` with:

```markdown
# Contract Test Diagnostic — 2026-06-07

## Summary
- 7 surfaces tested
- A (stale fixtures): N
- B (real regressions): N
- C (test infra): N
- D (correctly catches bug): N

## Per-surface findings

### thread-inspector
- Category: A/B/C/D
- Failed assertion: <quote>
- Test file:line
- Source file:line (if applicable)
- Proposed fix: <1 sentence>

### field-node
...

(etc. for all 7)

## Cross-cutting patterns
- <if multiple surfaces share a root cause>

## Recommended fix order
1. <highest priority fix>
2. ...
```

## Constraints
- **No edits.** Only diagnosis.
- **No false claims.** Quote the actual failure output.
- **Don't speculate** about what the fix would look like; just say "fix the test" or "fix the source" at file:line.

## Return
≤150 words: A/B/C/D counts, top 3 surfaces by fix priority, biggest pattern.
