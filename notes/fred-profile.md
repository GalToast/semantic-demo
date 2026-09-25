# Fred profile — collaboration preferences

Maintained per `AGENTS.md` ("Maintain a practical in-repo profile of
collaboration preferences, communication patterns, and stable work
habits"). Confirmed major inferences only.

## Working style

- **Decisive action over deliberation.** When asked for an opinion, give
  a prioritized recommendation with rationale and execute on the top
  pick. "Let's hit it!" / "ok let's hit it" / "a-#" are common
  green-lights. Don't ask for permission to do the obvious thing.
- **Parallel work is the norm, not the exception.** Multiple main-lane
  sessions, subagent workers, and the dev server run concurrently. The
  worktree will drift between any two `git status` calls. Treat this
  as background noise, not an emergency.
- **Plan + prompt scripts are welcome.** When the user provides a
  step-by-step plan with explicit `git add <file>` commands and message
  file paths, follow it. They invested in the planning; honor the
  intent.
- **Drift is expected, audit before acting.** When the plan's staging
  map doesn't match reality (commits absorbed in parallel, files
  untracked, unexpected modifications), STOP and re-audit. Do not
  blindly run the planned commands.

## Communication patterns

- **Short, action-oriented responses preferred.** "Your professional
  opinion?" / "Best next steps?" / "Let's hit a-#" are typical
  prompts. Match the energy: tight, prioritized, decisive.
- **Prose tone: warm, fluid, lightly poetic, human.** Mimic Gemini 3 /
  Claude Opus vibes. Not formal, not corporate.
- **Bigger decision points get a "Why this, why not that" structure.**
  List 2-3 options with tradeoffs, then a recommendation, then
  "Want me to fire the two workers, or revise the prompts first?"
- **Ends sessions with concrete next steps and a checkpoint.** Not
  "let me know if you need more." More like "Worker 1 polling now,
  Worker 2 idle, want me to wait or pre-stage Ticket 6?"
- **Acknowledges friction and saves durable lessons.** When something
  doesn't work as expected ("Bash doesn't support {tool:...} as inline
  syntax. < something we should fix?"), save it as a memory or skill
  rather than working around it. The user is comfortable with
  harness self-improvement.

## Tooling preferences

- **Prefers MCP gateway for tool calls** (external_subagents,
  websearch, nvidia-capabilities, chrome-devtools, playwright,
  switchboard). Not bash heredocs.
- **Accepts context-mode heavy use** (ctx_execute, ctx_batch_execute,
  ctx_index) for log analysis, structured data processing, multi-file
  reads. The "Think-in-Code" philosophy is welcome.
- **ast-grep preferred over rg for structural code search** in this
  repo (per repo AGENTS.md). Falls back to rg only for partial
  string matches, comments, URLs.
- **Svelte dev server runs in the background for long sessions** (PID
  24132 was alive during the 2026-06-13 session). Vite HMR
  re-touches dist files and may stage them via git autostage.
  Capture the diff to disk before committing; treat re-touches as
  expected.

## Stable work habits

- **Resumes prior work cleanly.** The "Where the previous session
  left off" pattern is common. The user provides the plan; the
  agent executes. Don't ask "where were we?" — read the prompt.
- **Accepts risky batch commits as long as the audit is honest.**
  When 2 of 5 planned commits are absorbed by an earlier commit, the
  user wants the agent to notice, report, and adapt. Not to force
  the original plan.
- **Worker policy boundaries are enforced.** AGENTS.md off-limits
  files (CSS mobile cascade, journey.ts, lifecycle.ts, focus stage,
  deploy scripts) get a callback to the main lane for owner approval.
  Cross-seam finds get routed as `Finds outside scope: <path> —
  <description>`, not silently fixed.
- **Push to origin is welcome, no extra approval needed.** Per
  AGENTS.md, the user explicitly says "Commit and push do not
  require additional approval."

## Things to NOT do

- **Don't over-explain what they already know.** They're a power user
  of this repo and Pi harness. Skip the "first, let me explain what
  ast-grep is" preamble.
- **Don't auto-accept hook warnings as blockers.** The pre-commit
  hook prints yellow reminders for high-reversion CSS files. These
  are notices, not blocks. Note them, don't wait for confirmation.
- **Don't kill broad process groups by name.** "Stop the dev
  server" means stop the exact PID, not `taskkill /IM node.exe`.
- **Don't open with a giant preamble.** Start with the action or
  the answer, not "I will help you with that."
- **Don't fight parallel-session auto-commits.** When the working tree
  flips between `git status` calls because a parallel main-lane session
  is committing (Ticket 3 hot follow-up, Ticket 4 unification,
  Ticket 5 single-track, Ticket 6 rerank all landed this way during the
  2026-06-13 wave), reconcile by reading the new commits, not by
  force-re-running your planned commits. If your staging map no longer
  matches reality, re-audit before `git commit` or the worker-policy
  review gate will reject the diff.
- **Don't push before confirming tickets close as a unit.** The
  2026-06-13 wave shipped Tickets 1, 2, 3, 4, 5, 6 as a coordinated
  stack. Pushing `28faffc` mid-wave + Ticket 6 later would have split
  the review diff and unblocked no one. The user's instinct to hold
  the push and let the rerank worker finish alongside was the right
  call.

## Worker routing (2026-06-16 wave evidence)

- **Swarm mode is the default at end-of-day.** Dispatching 2-3 subagents simultaneously (Three.js pair, lifecycle recon, bridge flips) with live-steer on is now standard. User signals readiness with "let's hit it" or "dispatch." Main lane reviews and commits while swarm churns.
- **Quality gate enforcement is expected.** User catches when subagent output isn't reviewed ("You're not really reviewing"). The fix: add `grep "from.*js/modules"` verification directly into the worker prompt so the gate is hard-coded, not trust-based.
- **mimo-v2.5 is the productive default for focused refactors.** Three-engine.ts Ticket 3 cold/hot retirements,
  lifecycle-bridge HOT follow-up, and the BOTH-pattern baseline all
  landed clean with mimo. Tool use is reliable, AST reasoning is
  sharp on engine plumbing. Switched Worker A followup to mimo when
  the openrouter/free route hit a dead model slug.
- **`openrouter/free` resolves to `z-ai/glm-4.5-air:free` which 404s.**
  Worker A's first call errored at startup with `404 This model is
  unavailable for free. The paid version is available now - use this
  slug instead: z-ai/glm-4.5-air`. Always `external_subagent_followup`
  to a known-clean route rather than spawning fresh; the same
  session_id preserves tool surface + working dir.
- **Bigger sweave = run mimo-v2.5 with `live_steer: true` and high
  timeout_seconds (3600-5400).** Workers that try to do a 19-import
  retirement + commit + verify + push in <15 minutes compress the
  verification margin. Better: 1-hour budget with steer for blockers.

## Bash tool quirks (2026-06-13)

- `head` is not on the default `bash` shell PATH on this Windows
  harness. Piping `rg | head -N` and `2>&1 | rg | head` fail with
  `The term 'head' is not recognized`. Use the rg-only form, fetch
  bounded output, or grep via PowerShell `Select-Object -First`.
- `$_.Name`, `$.Line`, and other PowerShell member-access chains break
  when the heredoc reaches the bash tool because of context-mode
  stripping the `$_`. Prefer simple `Select-Object Name,Length` or
  write the script to a file and execute it.
- Vite dev server PID stays alive across the session (`npm run
  dev:svelte` backgrounded via `pi-bg-*` jobs). When `dist/svelte/`
  is rebuilt mid-commit, the file watcher can land uncommitted edits
  to index.html and CSS even when no agent is touching them. Treat
  these as expected re-touches.

##

## Confirm-with-user items (uncertain inferences)

These are working hypotheses from one session, not yet confirmed:

- "Let's hit it!" is a generic green-light, not a specific command
  selector. It can also mean "hit the recommended path I asked
  for," not "hit the literal option I just listed."
- The user is comfortable with harness-self-upgrade mid-task
  (saving skills, memory, tool-quirks). They explicitly
  acknowledged the MCP-bash-syntax gotcha as worth fixing.

## W24-W29 Collaboration Observations (post-W23 update)

Updated after extended W24-W29 session work.

### Subagent Dispatch Pattern (validated)

**Best fits (100% success rate observed):**
- DOCS-only changes (no conflict with code work)
- Pure new file creation in clean directories
- TEST-only work with pre-verified clean source files
- Out-of-repo work (different cwd = zero race risk)

**Avoid:**
- Touching files M-flagged by parallel session
- Re-running work already in flight
- Multi-file imports that race parallel session rewires

### Worker Prompt Template (proven this session)

When dispatching mimo-2.5 workers, prepend these sections:

```
PRE-FLIGHT CHECKS (REQUIRED):
1. Verify tool surface (Read/Write/Edit/Bash/Grep)
2. Verify target file is CLEAN (not M-flagged)
3. Verify pre-flight data (rg/ls/cat source before editing)

NEVER:
- Use pi_background_jobs action: "poll" (invalid)
- Write a single file >800 lines (model degeneration)
- Modify the same file as another active worker (race condition)

AFTER EACH WORK:
- Commit with --only pathspec to avoid parallel session WIP
- Push to origin
- Report: pre-flight results + commit SHA + push result + any surprises
```

### Parallel Session Coordination (refined)

**Always before committing:**
```bash
git log --since="3 hours ago" --oneline
git status --short
```

**Rules:**
- 5+ unseen commits in 3 hours → queue work, do not commit
- M-flagged files I didn't create → pause and pick different seam
- Use `git commit --only <pathspec>` to avoid pulling parallel session WIP
- After rebase drops commits: `git reflog | grep <sha>` → `git cherry-pick <sha>`

### Worker Pivot Patterns (observed)

When workers encounter obstacles, smart workers pivot to alternate approaches:
- **Source-inspection pattern** (readFileSync) when render() fails due to circular store deps
- **Pattern adaptation** (Match the established pattern in existing similar tests)
- **Smart assertions** (regex matching for variable text, lowercase DOM vs CSS capitalize)

### Session Rhythm (user preference)

- User says "hit it" / "let's hit it" → ready to dispatch
- User says "decompose and delegate" → ready for parallel workers
- User asks "status" → poll workers and report concisely
- User says "leave X" / "what's left" → strategic decision point

### Confirmed Tools

- `mcp__external_subagents_external_subagent_start` — primary dispatch
- `mcp__external_subagents_external_subagent_poll` — check status
- `mcp__external_subagents_external_subagent_cancel` — stop workers
- `git commit --only pathspec` — race-safe commits
- `git reflog | grep sha` — recover dropped commits

### Open Questions (for next session)

- Does user prefer opencode-go/mimo-v2.5 over other models for ALL work?
- Should subagent prompts always include the full template above?
- Is the "dispatch everything" pattern sustainable at this pace?
