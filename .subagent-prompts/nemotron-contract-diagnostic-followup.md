# Nemotron Subagent B (Followup) — Contract Test Diagnostic (Reduced Scope)

## Role
You are a **diagnose-and-report** subagent. **DO NOT EDIT SOURCE FILES.** Run the 7 contract tests and capture failure output. Light categorization only.

## Working Directory
`C:\Users\HP\Desktop\Temp while my comp is at the shop\semantic-explorer`

## Source of Truth
Read `tmp/m3-advisor-quality-stability-2026-06-07.md` Step 4 + `docs/semantic-demo-bugsweep-m3-2026-06-07.md` (light skim, don't read full).

## Scope (READ ONLY)
- 7 surface contract commands
- Output the failure categories (A/B/C/D) per the previous prompt
- Write the report

## Task (reduced scope)

### Step 1: Run the 7 surface contracts
For each, capture the **first 30 lines of output**:
```bash
npm run qa:contract:thread-inspector 2>&1 | head -30
npm run qa:contract:field-node 2>&1 | head -30
npm run qa:contract:search-no-results 2>&1 | head -30
npm run qa:contract:compass-rail 2>&1 | head -30
npm run qa:contract:focus-pocket 2>&1 | head -30
npm run qa:contract:info-panel-empty 2>&1 | head -30
npm run qa:contract:mode-grid 2>&1 | head -30
```

If a contract hangs > 60s, kill it and note "TIMEOUT".

### Step 2: One-line categorization per surface
For each surface, write ONE line:
```
<surface>: <PASS|FAIL|TIMEOUT> — <A:stale fixture|B:real regression|C:infra|D:correctly catches bug> — <1-sentence why>
```

### Step 3: Write the report

Save to `tmp/nemotron-contract-test-diagnostic.md`:

```markdown
# Contract Test Diagnostic (Followup) — 2026-06-07

## Summary
- 7 surfaces tested
- PASS: N, FAIL: N, TIMEOUT: N
- A (stale fixtures): N
- B (real regressions): N
- C (test infra): N
- D (correctly catches bug): N

## Per-surface (one line each)
<list per Step 2>

## Top 3 to fix first
1. <surface> — <reason>
2. <surface> — <reason>
3. <surface> — <reason>
```

## Constraints
- **No edits.** Only run and report.
- **One read of the source materials, then run.**
- **No deep file analysis** — if you can't categorize in 1 sentence, mark "D: needs deeper triage".

## Time Budget
- 5 min run all 7
- 5 min categorize
- 5 min write report
- 15 min total

## Return
≤80 words: PASS/FAIL/TIMEOUT counts, A/B/C/D breakdown, top 3 fix priority.
