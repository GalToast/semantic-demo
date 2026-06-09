---
name: Double-Worker Verification
description: Dispatch parallel implementation + audit workers, then main-lane verify on-disk state with git diff to catch worker over-claiming, no-ops, and unlisted side effects before reporting to the user.
source: auto-skill
extracted_at: '2026-06-06T22:58:00.000Z'
---

# Double-Worker Verification

Use this when you need to make significant changes to a project but the docs are stale, the state is uncertain, or the decision is expensive. Instead of trusting either a solo analysis or a single subagent's report, dispatch **two parallel workers** with complementary scope, then verify every claim on-disk yourself.

## When to Use

- The docs are stale and you need to verify claims before acting on them.
- You're about to make a deployment-ready change and want a second opinion on the same turn.
- The user asks for "what's the real state" after a long chain of prior work — you need both implementation and audit in parallel.
- A worker will report work as "done" but you've been burned by worker hallucination before.

## When NOT to Use

- **Single, trivial edit:** A 10-line fix doesn't need a parallel worker. Just edit and verify.
- **Read-only investigation:** Use PROJECT_STATUS_READ (the solo analysis skill) instead.
- **Sequential bug sweep:** Use STRUCTURED_BUG_SURGERY (multi-bug serial fix skill) for that.
- **The user explicitly asks for one worker:** Don't split scope they didn't request.

## The Two-Worker Pattern

Dispatch two workers with `run_in_background: true` (or the MCP equivalent) so they run in parallel:

### Worker A — Implementation
Does the mechanical work. Edit source files, rebuild, run build-pipeline checks.

**Prompt structure:**
- "You are an IMPLEMENTATION worker." — explicit role label.
- Tooling self-report required: "Before doing any artifact-producing work, list the tools you have access to. Required: Read, Write, Edit, Bash, Grep, Glob. If you lack any, STOP and report the harness defect."
- **Explicit scope boundaries:** "DO NOT touch these files..." / "DO NOT add comments to edits" / "Only edit the files listed."
- **Self-report at end:** "Report what you DID NOT do" — this catches implicit scope creep.
- If the change requires `npm run build`, verify with `npm run check:cache` after.

### Worker B — Audit / Refresh
Read-only (or doc-only) verification. Reads the same source files, cross-references them against existing docs, and produces an updated record.

**Prompt structure:**
- "You are a READ-THEN-WRITE audit worker." — explicit role label.
- Tooling self-report required (same as Worker A).
- **Delta-table format:** For every claim in a document or analysis, report: CRITIQUE_CLAIMED → CODE_ACTUAL → STATUS (already-fixed / still-broken / new-issue). Forces exact file:line evidence.
- **Explicit constraints:** "DO NOT edit any source files — only the doc(s)."
- **Surface contradictions:** "If you find a numeric value in the original document that doesn't match the current source, note it explicitly."
- **Write a new file** rather than overwriting the old one — keeps history.

### Main-Lane Verification (Critical Step — Do Not Skip)

After both workers complete, **do not take their word for it**. Run these checks yourself before reporting to the user:

**Check 1: git diff on every claimed edit.**
For each file Worker A claimed to change:
```bash
git diff -- js/modules/three-thread-manager.js js/modules/three-node-manager.js
```
Does the expected change actually appear in the diff? If "no," the worker either hallucinated the edit (common with parallel workers racing file timestamps) or the file was already in the target state.

**Check 2: Read the file at the exact line number.** 
If the diff is empty but the worker claimed a change, read the file directly:
```bash
read -p 40 limit 10 js/modules/example.js
```
Is the value already correct? Then the worker did a no-op. Is it still wrong? Then the worker never actually changed it.

**Check 3: grep for unlisted changes in the git diff.**
Workers often touch more lines than they report — or cleanup operations in adjacent code leave behind removals they didn't describe. Run:
```bash
git diff --stat <files>   # Total line count — does it match "1 line"?
git diff -- <files>       # Full diff — does every changed line match the worker's report?
```
**Common finding:** A worker reports "flipped one flag" but the diff shows additional lines changed — a hit-proxy removal, a re-indented block, a stale comment removed. These are usually side effects (the worker's prompt was too broad) or accidental (the worker used a regex replace that caught extra lines). Flag them — don't silently accept them.

**Check 4: Check for cache-buster consistency.**
If Worker A rebuilt the bundle:
```bash
npm run check:cache
```
If this fails, run `npm run refresh:cache --fix` to sync the HTML `?v=` tags and CSS import references. Worker A may have left these stale intentionally ("main lane should decide").

**Check 5: Contrast the two workers' outputs.**
Worker B (audit) may have read the file BEFORE Worker A (implementation) changed it. Compare their factual claims about the same code:
- Worker B: "depthWrite is still false at line 44."
- Worker A: "Flipped depthWrite to true at line 44."
- On-disk master truth: Which one is correct? Use git diff (step 1) — don't trust either worker's chronology.

**Check 6: Run the build pipeline from main lane.**
Even if Worker A reported "build succeeded," rebuild from the main lane. Worker A may have built from a slightly different working-tree state (a race with the parallel audit worker's file reads). Rebuild from the same tree you're verifying in:
```bash
npm run build
npm run refresh:cache --fix
npm run check:cache
```

### Specific Worker Failure Modes (Verified 2026-06-09)

During a 36-file Stage 1 TS migration inventory, two parallel deepseek-v4-flash-free workers produced SAFE-TO-COMMIT verdicts but the main-lane cross-check discovered:

1. **Worker A undercounted orphans by 14x.** It reported "1 minor hazard (`camera-controls-choreography-types.ts`)" when the real count was 14 orphans. Root cause: the worker's Svelte search was likely limited to `src/` and missed `js/modules/components/*.svelte`.
2. **Worker B missed orphans entirely.** Its hazard scan was internal-only (dynamic imports, side effects, console calls) and didn't check external importer presence. A file can be "internally clean" yet truly orphan.
3. **Both workers agreed on the wrong file.** Worker A flagged `camera-controls-choreography-types.ts` (actually imported by 2 files). The real orphan was `chrome-timing.ts` (imported by 2 Svelte files in `js/modules/components/`).

**Main-lane script bugs also caused false orphans** (PowerShell `Select-String` quoting issues, missing `-Path` scope). Always verify worker reports with at least two independent methods.

### Falsification Check Pattern (Do This Before Trusting Any Worker Count)

```powershell
# Step 1: verify the count yourself with a simple working-tree search
Get-ChildItem -Path 'js/modules' -Recurse -Filter '*.ts' -File |
  Select-String -Pattern '<basename>' -SimpleMatch

# Step 2: verify each "hazard" file — is it really orphan?
# Search in BOTH src/ and js/modules/ for .ts, .js, .svelte, .html importers
Get-ChildItem -Path 'src','js' -Recurse -Include '*.ts','*.js','*.svelte','*.html' -File |
  Select-String -Pattern '<basename>' -SimpleMatch

# Step 3: if the worker's claim contradicts your verification, trust your on-disk search
# Workers can systematically miss directories (Svelte in js/modules/components/, tracked .js in git index, etc.)
```

## Output Format

When reporting to the user, use a table with explicit columns:

| Item | Status | Notes |
|---|---|---|
| Worker A's claimed edit 1 | ✅ Real edit / ⚠️ No-op / ❌ Missing | File:line, before/after from git diff |
| Worker A's claimed edit 2 | ✅ / ⚠️ / ❌ | Same format |
| Worker B's new doc | ✅ Written | Path and line count |
| Build state | ✅ Clean / ❌ Stale | Bundle hash, build time |
| Cache check | ✅ Green / ❌ Failing | Output of npm run check:cache |
| Unlisted changes (caught by git diff) | ⚠️ Yes / ✅ No | What was found and why |

And a **"What the workers got wrong"** section. This is the most valuable part of the report — it tells the user exactly how much trust to place in subagent output.

## Why This Pattern Works

Workers are helpful but **never fully reliable** because:
1. **Timing races.** Two parallel workers can read the same file in different states.
2. **Hallucinated edits.** A worker may report a change they "made" but actually the file was already in the target state (the worker read the wrong line, or the edit tool applied and reverted silently).
3. **Unreported side effects.** The worker's `sed`/`regex` change may match extra lines they didn't intend.
4. **Stale reference documents.** Worker B might write a doc against pre-edit state, contradicting Worker A's post-edit reality.

The main-lane git diff is the **only reliable truth anchor**. Workers produce hypotheses about what's true; git diff produces evidence.

## Adjacent Skills

- **PROJECT_STATUS_READ** — Solo analysis of project state; use this FIRST to get your gap list, then use DOUBLE_WORKER_VERIFICATION to act on it.
- **STRUCTURED_BUG_SURGERY** — Serial multi-bug fix with verify-before-fix. Use when the bugs are fully scoped and don't need parallel audit.
- **STATE_DESYNC_PARITY_SURGERY** — Specialized fix patterns for Svelte/JS dual-track desync. Run after the audit workers identify the specific desync pattern.
