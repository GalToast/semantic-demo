# Switchboard Coordination Protocol

Use this protocol whenever parallel Pi/Codex/subagent sessions may be active in this repo. It encodes the lessons from the 2026-08-05 UI audit session (chat-only handoffs, corrupted capture races, dist rebuild conflicts, stale task drift).

## 1. When to Join

- **Session start:** immediately call `mcp({tool:'switchboard_join_chat', args:{room:'semantic-explorer'}})` before touching any tracked resource.
- **Before committing:** re-check the board (`list_tasks`, `get_inbox`) so you don't land on top of in-flight work.
- **Before releasing:** leave a `create_handoff` or `comment_task` if findings cannot land now; do not rely on chat alone.

If the board is empty for >30 min you may proceed without further coordination.

## 2. Task vs Message

| Type | Use when | MCP tool |
|------|----------|----------|
| **TASK** | Bounded work with a clear owner, acceptance criteria, and finish line | `create_task` + `claim_task` + `update_task(status)` + `comment_task` |
| **HANDOFF** | Findings/decisions that must land before another session can continue safely | `create_handoff` + `comment_task` + `accept_handoff` by receiver |
| **MESSAGE** | FYI status, no ownership required, no blocking follow-up | chat message via `switchboard_join_chat` |
| **SIGNOFF** | Something that must be approved before merge | `request_signoff` + `approve_signoff` |
| **RESOURCE** | Shared filesystem or port that cannot be touched concurrently | `claim_resource` + release when done |

**Rule of thumb:** if another session would be blocked or misled without reading it, it is a TASK or HANDOFF — not a chat message.

## 3. Finding → Handoff Flow

The 2026-08-05 FocusPocketA11y overflow finding was left as a chat message and was missed. Use this flow instead:

1. **Create a task** if the finding is fixable work:
   - `create_task(title, description, tags:[repo, finding, <area>])`
   - `claim_task(task_id)` — assign yourself if you will finish it now
   - `comment_task(task_id, 'Evidence: tmp/... | severity | repro steps')`
   - `update_task(task_id, status:'done')` when finished; include a one-line summary in the comment.

2. **Create a handoff** if the finding must be picked up by another session:
   - `create_handoff(title, description, tags:[repo, handoff, <area>])`
   - `comment_task(task_id, 'Evidence: tmp/<run>-<timestamp>.md | repro steps | expected outcome')`
   - Receiving session reads `get_inbox` / `get_next_action`, then `accept_handoff(handoff_id)` before acting.

3. **Evidence discipline:**
   - Write evidence to `tmp/` with a stable name: `tmp/<area>-<run>-<YYYY-MM-DD>.md`.
   - Post only the `tmp/` path in the task/handoff body — never paste large diffs, screenshots, or transcripts into chat.
   - Include: what changed, what broke, repro steps, whether a fix exists.

## 4. Resource Locks

The 2026-08-05 session had repeated conflicts: two sessions rebuilding `dist/` while the other captured screenshots (3 corrupted captures), and workers stepping on the PHP-served dist. Fix: claim resources before touching them.

### Presets

| Resource | Preset to claim | When |
|----------|-----------------|------|
| `dist/` rebuild | `dist-rebuild` | Any `npm run build`, Vite preview bundle, or manual dist mutation |
| Screenshot/video capture | `visual-capture` | Playwright/puppeteer screenshot runs, `tests/visual-state-audit.mjs`, `preview_export` |
| PHP dev server | `php-dev-server` | `php -S 127.0.0.1:8795 -t .` |
| Vite dev server | `vite-dev-server` | `npm run dev` on port 5173 |

### Procedure

1. `claim_resource(preset, owner:'<session-id>', ttl_seconds: 1800)` before starting.
2. Work.
3. `release_resource(preset)` immediately when done — do not wait for session end.
4. If `claim_resource` fails because another session holds it with a live heartbeat, use `get_inbox` / `ring_agent` to coordinate handoff instead of waiting blindly.

## 5. Inbox Discipline

- **Session start:** `get_inbox` + `get_next_action` — these are your real TODO list, not the chat backlog.
- **Before committing:** `get_next_action` — if you have a stale handoff addressed to you, accept or comment before pushing.
- **After completing work:** update task/handoff status so `get_next_action` reflects reality for the next session.

Use `stale_task_sweep` on abandoned work so the board does not rot.

## 6. What NOT To Do

- **Do not** post large evidence (diffs, screenshots, long logs) into chat — reference `tmp/` paths instead.
- **Do not** claim a task that another session owns with a live heartbeat; negotiate via `ring_agent` or `comment_task`.
- **Do not** leave findings only in chat — they must become a `create_handoff` or `create_task` so `get_inbox` surfaces them.
- **Do not** ignore the taskboard and rely on memory of what another session "probably saw" — the board is the durable source of truth.
- **Do not** claim a resource, forget to release it, and let TTL clean up — explicit release keeps the board honest for the next session.
