# Harness Worker-Contract Standard

Codifies the required artifact contract every delegated worker must emit.
This document references — but does not duplicate — the switchboard protocol,
subagent delegation lifecycle, and repo-wide worker rules already defined in
`docs/switchboard-protocol.md`, `docs/subagent-delegation.md`, and `AGENTS.md`.

---

## 1. Required Input Contract

Every worker prompt must be a self-contained brief. Main-lane agents SHALL
include the following sections in every `external_subagent_start` call
(and in any `tmp/<topic>/worker-prompt.md` written to disk before dispatch).

### 1.1 Scope
Exact files the worker may touch. Format:

```
Scope:
  - src/lib/stores/search.svelte.ts
  - tests/some-contract.mjs
```

Scope must be explicit — name specific paths, not directories or modules.
Workers must not guess at the seam.

### 1.2 Allowed Files
A positive list of files the worker may read or modify. Files outside this
list require explicit main-lane approval. This prevents scope creep and
parallel-session interference.

### 1.3 No-Revert Boundary
Files or directories the worker MUST NOT modify under any circumstances, even
if the worker believes a re-format or "while-I'm-here" improvement is warranted.
Format:

```
No-revert boundaries:
  - AGENTS.md (hot-path, loaded every turn)
  - docs/subagent-delegation.md (shared delegation rules)
```

Violation of a no-revert boundary is an automatic score penalty; the main lane
reverts the change and records it in the worker scorecard.

### 1.4 Expected Evidence
Precise artifacts the worker promises to produce. At minimum:

- `tmp/<topic>/PLAN.md` — before heavy work begins
- `tmp/<topic>/REPORT.md` — after work completes
- Any diff evidence (`git diff -- <path>`) or test output supporting claims

### 1.5 Verification Commands
Exact commands the worker SHALL run before claiming completion. These must be
re-runnable by the main lane without modification:

```
Verification commands:
  - node tests/some-contract.mjs
  - npm run qa:contract
```

Workers paste the full output into `REPORT.md`. "Green" claims without
output from this turn are invalid.

### 1.6 Model / Lane Choice Rationale
Brief justification for the selected model lane (vision-capable, code-capable,
free-tier requirement, etc.):

```
Model: kilo/openrouter/owl-alpha
Rationale: text/code work; no vision required; fast free route.
```

See `docs/subagent-delegation.md` § "Subagent Lane Inventory" for the
current vision-capability matrix and lane viability rules.

---

## 2. Required Output Artifacts

### 2.1 PLAN.md (pre-work)

Written before heavy work begins. Contents:

1. **What I will change** — file:line citations for each planned edit
2. **How I will verify** — commands the worker will run
3. **Risk notes** — any parallel-session or dependency concerns

### 2.2 REPORT.md (post-work)

Written to `tmp/<topic>/REPORT.md` after all work and verification are
complete. Contents:

1. **What was changed** — each change as `file:line` cite
2. **What was NOT changed** — explicit list to limit scope creep
3. **Verification evidence** — full, verbatim output from the verification
   commands in §1.5
4. **Score self-assessment** — worker rates itself 1–10 against the brief;
   main lane overrides after judging
5. **Done marker** — final line matching the prompt's requested marker

The done marker format:

```
<TOPIC> <MARKER>
```

For example, a prompt requesting "worker contract standard" might end with:

```
HARNESS STANDARDS DONE
```

A prompt requesting "switchboard protocol verification" might end with:

```
SWITCHBOARD PROTOCOL DONE
```

The marker text SHALL match the wording requested in the worker prompt's
acceptance criteria.

### 2.3 Additional Evidence (as needed)

Workers doing visual work SHALL include screenshot paths
(`tests/visual-state-audit.mjs` output) per the visual verification rules
in `docs/subagent-delegation.md`.

---

## 3. Verification Loop as Default

Verification is the default, not optional polish.

### 3.1 Worker Runs Verification

Before writing `REPORT.md`, the worker runs every command listed in §1.5
verbatim and captures full output. No summarization — paste raw output.

### 3.2 Main Lane Re-Runs Deterministically

The main lane re-runs the same verification commands on the worker's output
before accepting the report. If the worker's claimed "green" output differs
from the main lane's re-run, the worker is scored down and the discrepancy
is recorded.

### 3.3 Green Claims Must Cite This-Turn Output

A "green" or "passing" claim in any worker output (REPORT.md, chat message,
switchboard handoff) is invalid unless it is backed by verification command
output from the same turn that produced the claim. Stale verification from a
prior session or prior commit is not acceptable unless the main lane explicitly
re-ran and confirmed it.

### 3.4 Failure Goes to Main Lane

If a worker's verification fails, the worker explains the failure in
`REPORT.md` rather than silently omitting it. The main lane then decides:
fix, re-delegate with narrowed scope, or revert.

---

## 4. Tool-Call Schema Validation

Worker tool calls (`edit`, `write`, `bash`) are validated against expected
shapes where feasible.

### 4.1 Edit Calls

Every `edit` call must specify:
- The exact file path
- An `oldText` value that matches a unique, non-overlapping region of the
  current file contents
- A `newText` value that replaces only the specified region

Workers must not emit stacked/overlapping `edit` calls in a single batch.
The main lane rejects batches where `oldText` regions overlap.

### 4.2 Write Calls

Every `write` call for an existing file must be preceded by a `read` of the
current file contents (the no-revert boundary check). Workers writing new
files in allowed directories need no prior read.

### 4.3 Bash Calls

Workers must not use bash for multi-line JS beyond ~80 characters — the
`write-node-script-on-windows` skill applies. Prefer the `write` tool to
create a script file, then run `node <abs-path>`.

### 4.4 Validation Gate (optional but recommended)

When the main lane receives a worker's `REPORT.md`, it may run a lightweight
schema check against the report itself:

```
- Does the report contain the required § headers?
- Does the verification section include actual command output (not just a
  summary)?
- Does the final line match the done-marker convention?
```

Failing this gate scores the worker ≤ 6/10 regardless of code quality.

---

## 5. Main-Lane Judging and Polish

Per `docs/subagent-delegation.md` § "Delegation Lifecycle":

1. **Score 1–10** against: scope adherence, no-revert boundary respect,
   evidence completeness, verification output quality
2. **Polish to 10/10** if score < 10: take over on the main lane, fix gaps,
   ship. Do not return to the user with incomplete work.
3. **Record the score** in the switchboard task/handoff comment so future
   sessions can track worker quality trends.

---

## 6. Reference Index

| Concept | Canonical Source |
|---------|-----------------|
| Switchboard protocol (TASK/HANDOFF/MESSAGE/RESOURCE) | `docs/switchboard-protocol.md` |
| Evidence discipline (`tmp/` paths, no chat diffs) | `docs/switchboard-protocol.md` §3 |
| Delegation lifecycle (investigate → plan → delegate → judge → polish) | `docs/subagent-delegation.md` |
| Visual verification (screenshot requirement) | `docs/subagent-delegation.md` § "Visual Verification" |
| Vision capability matrix (which lanes can see images) | `docs/subagent-delegation.md` § "Vision Capability Matrix" |
| Worker prompt requirements (scope, allowed files, verification) | `AGENTS.md` § "Subagents" |
| Model lane inventory (free/paid/vision/text-only) | `docs/subagent-delegation.md` § "Subagent Lane Inventory" |

This standard does not duplicate any of the above; it adds the artifact
naming convention, done-marker format, and tool-call schema validation
needed for the main lane to enforce consistency across workers.

HARNESS STANDARDS DONE
