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

## Confirm-with-user items (uncertain inferences)

These are working hypotheses from one session, not yet confirmed:

- "Let's hit it!" is a generic green-light, not a specific command
  selector. It can also mean "hit the recommended path I asked
  for," not "hit the literal option I just listed."
- The user is comfortable with harness-self-upgrade mid-task
  (saving skills, memory, tool-quirks). They explicitly
  acknowledged the MCP-bash-syntax gotcha as worth fixing.
