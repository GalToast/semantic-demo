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

## The test-strategy gap — why journey tests come first

Contract tests (1,135/1,135 passing) catch the things they cover. They
do not cover **user-visible behavior** the way a real user experiences
it. This is the "test strategy gap":

1. A feature ships (e.g., the weather widget in W45–W46).
2. Contract tests pass. CI is green.
3. A UX critique sweep — done by a session using Playwright MCP —
   finds 4 real bugs:
    - The desktop branch in `App.svelte:470` was missing `onSceneReady`,
      so the weather widget never mounted
    - The pill at y=105 was hidden behind the legend button at y=117
      (z-index 50 vs 100), so clicks were eaten
    - The FORECAST row had `text-overflow: ellipsis` with
      `max-width: 130px`, truncating the value
    - `fetchWeather` was a `Math.random()` stub, not the canonical
      Open-Meteo client

The 4 bugs all shipped despite 1,135/1,135 contract tests passing. The
root cause: contract tests assert on state shapes and function
contracts, not on what the user can see and click.

**Rule:** for any user-visible feature (one that touches a Svelte
component, the desktop/mobile mount branches, or any DOM the user
interacts with), the merge must include **at least one journey test**
in `tests/widget-journey.spec.js` (or a similar user-journey spec). A
journey test exercises the feature end-to-end through Playwright,
asserting on what the user actually sees — pill geometry, click-through,
console errors, focus behavior. Contract tests are not a substitute.

### When a journey test is required

Add a journey test when the feature:

- Adds a new UI element (button, pill, panel, modal, toast)
- Changes the z-index, click-target geometry, or focus order of an
  existing element
- Replaces a stub or mock with a real implementation (e.g., the
  weather `Math.random()` → Open-Meteo wiring)
- Adds a keyboard shortcut, focus behavior, or a11y semantic
- Touches a high-reversion-risk CSS file (the pre-commit hook's
  warning list)

If the change is purely internal (a refactor, a renamed function, a
new helper), no journey test is needed. If in doubt, write the journey
test — it is cheap, and the user is the first to notice when it fails.

### Pattern

`tests/widget-journey.spec.js` is the canonical pattern. Each test:

1. Boots the dev server (or uses `TEST_BASE_URL`)
2. Navigates to the page
3. Waits for the feature to be ready (no fixed `setTimeout` — wait for
   the visible state)
4. Asserts on visible state (temperature, pill geometry, focus, etc.)
5. Asserts on console errors (the user is the first to notice JS
   exceptions)
6. Cleans up

`npm run qa:journey:headless` runs all 10 tests against a running dev
server. The 10 tests in `widget-journey.spec.js` were written **after**
the W46 sweep found 4 weather-widget bugs. The right time to have
written them was **before** the weather widget feature merged.

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

## Automated enforcement (W48-T3)

W48-T3 (2026-06-25) added a third check to the pre-commit hook
(`scripts/git-hooks/pre-commit` + `.ps1` shim) that warns when a
user-visible file is staged without a journey test. The check is
**warn-only by default** and matches the existing high-reversion-risk
file pattern (no blocking; human judgment still wins).

### What the check does

1. Lists staged files via `git diff --cached --name-only`
2. Splits them into two buckets:
    - **User-visible**: `src/components/*.svelte`, `src/App.svelte`,
      `src/lib/ui/*.ts`, `src/lib/keyboard/*.ts`
    - **Journey test**: `tests/widget-journey.spec.js`,
      `tests/*-journey*.spec.{js,ts}`, `tests/journey/*.spec.{js,ts}`
3. If the user-visible bucket has files but the journey bucket is
   empty, prints a yellow reminder with the file list and points at
   `docs/session-coordination.md` → "The test-strategy gap"

### Override

Pass `--SkipTestStrategyGapCheck` (bash) or `-SkipTestStrategyGapCheck`
(PowerShell) to suppress the warning for a single commit. Use for pure
internal refactors that don't need a new journey test.

### Coverage rationale

The patterns above are intentionally narrow:

- **`src/components/*.svelte`** — every user-facing Svelte component
- **`src/App.svelte`** — root, controls the desktop/mobile mount branches
- **`src/lib/ui/*.ts`** — event/UI binding logic (one removed
  binding breaks the user's click flow)
- **`src/lib/keyboard/*.ts`** — keyboard shortcuts and a11y

Things NOT covered (and why):

- **`src/lib/orchestration/*.ts`** — often refactored without behavior
  change; the W47 wave edited these heavily without adding new journey
  tests for each commit. Treat as "use judgment."
- **`src/lib/state/*.svelte.ts`** — state plumbing; the user's
  experience is mediated by components, not state files.
- **`src/lib/journey/*.ts`** — mostly internal data shaping.

The principle: warn about changes that DIRECTLY touch what the user
sees or clicks. Plumbing is exempted.

### Testing the check

The bash hook is unit-testable. A 30-line scratch script in
`/tmp/test-hook-repo` exercises 8 scenarios:

1. Svelte + journey test → no warning
2. Svelte only, no journey test → warns
3. `src/lib/ui/*.ts` only → warns (binding changes are user-visible)
4. Svelte only, `--SkipTestStrategyGapCheck` → no warning
5. Internal `.ts` (e.g. `src/lib/state/internal.ts`) → no warning
6. `App.svelte` + journey test → no warning
7. `src/lib/orchestration/*.ts` (not in patterns) → no warning
8. Override flag suppresses the warning for a single commit

The PowerShell shim has identical semantics; it runs the same pattern
list via `-like` globs.

## See also

- `scripts/session-lock.mjs` — the tool
- AGENTS.md → "Session Lock Protocol" — quick reference
- `docs/parallel-sessions-incident-2026-06-24.md` (TODO) — postmortem
  of the incident that motivated this
