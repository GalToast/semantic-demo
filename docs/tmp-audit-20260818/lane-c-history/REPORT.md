# tmp/ Birth Forensics Report

**Date:** 2026-08-18  
**Scope:** All files ever tracked under `tmp/` in `C:/Users/HP/repos/semantic-explorer`  
**Method:** `git log --diff-filter=A`, `git show --stat`, `git check-ignore -v`, `git grep`

---

## 1. Summary

**43 files currently tracked** under `tmp/`. **1,603 files on disk** in `tmp/` are untracked (ignored). All 43 tracked files entered the index **after** the `.gitignore tmp/` rule existed — they were explicitly added despite the ignore. The `.gitignore` has contained `tmp/` since the repo's first commit (`bcb2526a`, 2026-05-18).

## 2. .gitignore Timeline

```
$ grep -n '^tmp/' .gitignore
6:tmp/

$ git log --all --reverse --format='%h %ad %s' --date=short -- .gitignore | head -3
bcb2526a 2026-05-18 Extract Semantic Explorer standalone repo
bd2e3d37 2026-05-20 Fix final UI seams and architectural gaps in Semantic Explorer
f684cc45 2026-05-24 style: polish semantic explorer surfaces and docs
```

The `tmp/` line appears in the **initial .gitignore** at repo extraction (2026-05-18). Verification:

```
$ git show bcb2526a:.gitignore | grep tmp
tmp/
```

**Key finding:** Every file currently tracked in `tmp/` was added *after* this ignore rule existed. The ignore rule does NOT prevent already-tracked files from remaining tracked — it only blocks new additions. These files entered via explicit `git add` (not auto-staged), bypassing the ignore.

```
$ git check-ignore -v tmp/probe-hover6.mjs
(no output — file is tracked, not ignored)

$ git ls-files tmp/probe-hover6.mjs
tmp/probe-hover6.mjs
```

## 3. Birth History

**48 distinct commits** added files to `tmp/`. Date range: **2026-06-05 → 2026-08-11**.

### 3.1 Biggest Multi-Add Commits

| Rank | Commit | Date | Files Added | Pattern |
|------|--------|------|-------------|---------|
| 1 | `7b158883` | 2026-07-25 | **23** | Sprint-6 wrap-up — 8 parallel subagent workers, all reports/prompts/scripts committed |
| 2 | `dcbfb558` | 2026-08-06 | **9** | Evidence(delegate): dive/inside surface audits — worker outputs committed |
| 3 | `271fe111` | 2026-07-25 | **10** | Sprint-4/5 wrap-up — v2 failover spec + polish reports |
| 4 | `8b9abeff` | 2026-07-26 | **12** | Sprint-7 welfare + model-providers dispatch artifacts |

**Commit `7b158883` (23 files)** — full stat:
```
$ git show --stat --format='%h %ad %s' --date=short 7b158883 | head -30
7b158883 2026-07-25 feat(v2-failover): Sprint-6 wrap-up — TIER-MATRIX-MERGE + P5C patch live-verified + bench-log + session-summary

 tmp/normalize-overlay.mjs                          | 159 +++++++++++
 tmp/s6-dispatch/TIER-MATRIX-VERIFY-prompt.txt      |  64 +++++
 ... (20 more files)
 23 files changed, 2686 insertions(+)
```
Message pattern: "Sprint-6 wave: 8 parallel workers on agnes-2.0-flash... All landed except W5's P5C patch..." — **subagent swarm commit**, explicit `git add tmp/` of worker outputs.

**Commit `dcbfb558` (9 files)** — full stat:
```
$ git show --stat --format='%h %ad %s' --date=short dcbfb558 | head -20
dcbfb558 2026-08-06 evidence(delegate): dive/inside surface audits — Worker B VERDICT NONE + 5 obs; Worker A/rail-chain caught the neighbor-rail 3px collapse (fixed); probes committed

 tmp/audit-dive-2026-08-06.jsonl       |  26 ++++
 tmp/audit-dive-REPORT-WB.md           |  80 +++++++++++
 ... (7 more files)
 9 files changed, 825 insertions(+)
```
Message pattern: "evidence(delegate)" — **main-lane committing subagent worker outputs** after review.

### 3.2 Re-Entry After Cleanup

Commit `9cbcfdeb` (2026-08-05) performed a major hygiene sweep:
```
$ git show --stat --format='%h %ad %s' --date=short 9cbcfdeb | head -10
9cbcfdeb 2026-08-05 chore(tmp): ground-git tmp/ hygiene — relocate durable, untrack transient

- RELOCATE (git mv): 52 files → docs/
- REMOVE (git rm --cached): 60 transient artifacts
- net: tmp/ now 0 tracked files
```

**Within hours, files re-entered:**
```
$ git log --diff-filter=A --format='%h %ad %s' --date=short -- tmp/ | head -5
5a3ab701 2026-08-11 fix(tests): bridge-rewire 19 static @lib imports (the landmine class)
6c600b78 2026-08-11 fix(engine): strip-mode compatibility...
ad4f7ee4 2026-08-09 test(a11y): make trail-review overlay focus contract runnable...
f0840f81 2026-08-06 docs(lanes): verified-dead lane probe table...
d81f0beb 2026-08-06 docs(ui): archive ui-issues-report-20260804...
```

**Pattern:** Agents/subagents write probe scripts and reports to `tmp/`, then commit them alongside feature work. The `.gitignore tmp/` rule is ignored because the files are explicitly staged.

## 4. Deletion History

Only **one deletion commit** exists:
```
$ git log --diff-filter=D --name-only --format='--- %h %ad %s ---' --date=short -- tmp/ | head -20
--- 9cbcfdeb 2026-08-05 chore(tmp): ground-git tmp/ hygiene — relocate durable, untrack transient ---
(tmp/ files removed via git rm --cached)
```

No files have been deleted from tracking since the 2026-08-05 cleanup. All 43 current files remain tracked.

## 5. Why It Recurs

1. **Implicit `git add .` by agents:** Subagent workers and main-lane commits routinely stage all modified/new files, including `tmp/` outputs.
2. **`.gitignore` is advisory for explicit adds:** `git add tmp/somefile` bypasses the ignore — the rule only blocks automatic discovery.
3. **No pre-commit/pre-push guard:** Nothing in the hook chain checks for `tmp/` tracked files.
4. **Cultural norm:** `tmp/` is treated as "working state that happens to be useful to commit for evidence" rather than "transient scratch."

## 6. Blast Radius

**Tags:** `v1.0.95` through `v1.0.99` — none reference `tmp/` files.

**Branches:** `master` (current), `b1`, `de-land`, `fix/data-edge-webgl-boot`, `testfix-land`, `tools-land`, `wave-takeover-2026-08-17`, plus upstream remotes. No branch-specific `tmp/` dependencies.

**Tracked-code references to likely `tmp/` filenames:**
```
$ git grep -n -F 'probe-hover6' ':!tmp/*'
(no results)

$ git grep -n -F 'trail-diagnose' ':!tmp/*'
(no results)

$ git grep -n -F 'vision-jury-findings' ':!tmp/*'
(no results)

$ git grep -n -F 'audit-dive' ':!tmp/*'
(no results)
```
**Zero references** to any of the 8 probe names across tracked code outside `tmp/`.

**Gates that glob `tmp/`:**
```
$ grep -n 'tmp/' package.json
16:    "eval:ci": "node scripts/eval-harness.mjs --ci=tmp/eval-manifest.ci.json && ..."
32:    "models:capability-status": "node scripts/build-model-capability-status.mjs --catalog=tmp/phone-model-parity/canonical-model-catalog.json --health=tmp/phone-model-health/latest.json --markdown"
```
Two npm scripts write/read runtime artifacts under `tmp/`. These are **runtime paths**, not tracked files — they create `tmp/eval-harness-log.jsonl`, `tmp/eval-manifest.ci.json`, `tmp/phone-model-parity/`, `tmp/phone-model-health/` on execution.

```
$ grep -rn 'tmp/' scripts/eval-harness.mjs
6:const LOG_PATH = 'tmp/eval-harness-log.jsonl'
```
One script hardcodes `tmp/` for its log file. **Not tracked** (correctly untracked).

## 7. Conclusion

The 43 tracked `tmp/` files are **evidence artifacts** (probe scripts, JSONL logs, worker reports) that agents systematically commit alongside feature work. The `.gitignore tmp/` rule exists but is ineffective against explicit `git add`. The durable fix requires a **pre-push guard** plus cultural shift: `tmp/` = intransient working state; durable artifacts belong in `docs/` or subagent `out_dirs`.
