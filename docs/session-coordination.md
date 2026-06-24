# Session Coordination Protocol

W46-E4. When multiple AI sessions (Pi, Codex, subagents, parallel Claude
sessions) share this working tree, they can clobber each other's in-flight
edits. This document describes the lightweight lock protocol we use to make
that visible and avoidable.

## The problem

Without coordination, this happens regularly:

1. Session A writes `tests/widget-journey.spec.js` with new tests
2. Session B, working on something else, runs `git checkout -- <file>` or
   `git stash pop` and silently reverts A's work
3. Session A tries to commit and finds the file is back to the pre-edit
   state
4. Confusion, churn, lost work

We've seen this exact pattern in W46: file ownership disputes, merge
conflicts on tests that both sessions were editing, and 5+ commits in a
single day that were "feat X + fix tests to match X" pairs.

## The tool

`scripts/session-lock.mjs` is a Node.js script (works on Windows / macOS /
Linux, no shell wrapper required) that maintains a single lock file at
`.session-lock` at the repo root. The lock file is gitignored.

### Lifecycle

```bash
# Start of work
node scripts/session-lock.mjs acquire "W46-E4: session-coordination protocol"
# → writes .session-lock with session_id, intent, started_at, last_heartbeat

# Long work — every few minutes
node scripts/session-lock.mjs touch
# → updates last_heartbeat (otherwise the lock goes stale after 30 min)

# Track files you're working on
node scripts/session-lock.mjs add-file "src/lib/orchestration/foo.ts"
node scripts/session-lock.mjs add-file "tests/foo.spec.js"

# Check who's working
node scripts/session-lock.mjs status
# → prints active session, intent, age, heartbeat, files_in_flight

# End of work
node scripts/session-lock.mjs release
# → deletes .session-lock
```

### Stale locks

Locks expire 30 minutes after their last heartbeat. A second session can
take over a stale lock with `--force`:

```bash
node scripts/session-lock.mjs acquire "your intent" --force
# → takes over the lock, prints a warning about the previous holder
```

The 30-minute TTL is short enough that an abandoned session doesn't block
work for long, but long enough that an active session (with periodic
`touch` calls) won't lose its lock.

### What you can do when blocked

If `acquire` refuses because another session holds a fresh lock:

1. **Coordinate via the user** — the lock file has the holder's
   `session_id` (e.g. `Fred@mccullough.digital`). The user knows which
   agent is which.
2. **Wait** — set a timer for when the lock will go stale (30 min after
   last heartbeat).
3. **Take over with `--force`** — only if you're sure the holder is
   abandoned or you have the user's blessing.

## When to use it

The lock is **advisory, not mandatory**. It's a visible signal, not a hard
block. Use it when:

- You're about to make **multi-commit changes** that will touch the same
  files another session is likely working on
- You're starting a **refactor or rename** that another session's
  in-flight work would conflict with
- You're working in a **focused mode** (e.g., "only touching the weather
  widget for the next 20 min") and want others to know

Skip it for:

- **Trivial changes** (typo fix, single-line edit)
- **Read-only work** (browsing, analyzing)
- **Untracked-file experiments** (won't conflict with anyone)

## Integration with existing tooling

The pre-commit hook (`.git/hooks/pre-commit`) already does a
**branch guard** and a **high-reversion-risk file warning**. The
session-lock is independent and complementary:

- pre-commit hook: blocks the wrong branch or warns about known-fragile
  files
- session-lock: warns when another session is actively working

The hook does **not** read the session-lock — we don't want a stale lock to
block commits. The lock is purely advisory.

## Future work

- **Worktree-based isolation**: each session gets its own worktree
  (`.git/worktrees/session-X`). Higher setup cost but zero collision
  risk. Worth it if sessions keep clashing.
- **Hook into the lock**: a pre-commit hook could refuse if the active
  session's `session_id` is not the committer's. Skipped for now to
  avoid breaking the "user always wins" property.
- **Auto-`touch` integration**: a long-running npm script could
  heartbeat on a timer. Skipped for now; sessions can call `touch`
  manually.

## See also

- `scripts/session-lock.mjs` — the tool
- AGENTS.md → "Session Lock Protocol" — quick reference
- `docs/parallel-sessions-incident-2026-06-24.md` (TODO) — postmortem
  of the incident that motivated this
