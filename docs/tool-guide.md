# Tool Guide — Semantic Explorer

> Pi-harness tool selection, native-vs-MCP routing, profile switching, and cross-session switchboard API.
> Concise policy already lives in `AGENTS.md`; substance lives here. Load only when relevant.

## 1. Tool selection — quick decision tree

Pick the search/inspection tool by job, not by default. For deeper structural choices consult the `ast-grep-decision-tree` skill.

| Job                                                        | Tool                                                                                                     |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Plain text / simple regex search                           | `bash rg` or `grep` tool                                                                                 |
| Structural TS/Svelte search/replace                        | `pi_tool ast_grep_search` / `ast_grep_replace`                                                           |
| AST inspection dump                                        | `pi_tool ast_dump`                                                                                       |
| LSP go-to-def, references, hover, diagnostics              | `lsp-navigation` skill (pi-lens)                                                                         |
| Run sandboxed JS / shell / Python without bloating context | `pi_tool ctx_execute` (or `ctx_batch_execute` for many at once)                                          |
| bm25 search across indexed repo docs/code                  | `pi_tool ctx_search` (index first via `ctx_index`)                                                       |
| Search past conversation messages                          | `pi_tool session_search`                                                                                 |
| Persistent durable memory                                  | `pi_tool memory_search` / `memory_write` (see `memory-routing-policy` skill)                             |
| Browser automation (Playwright)                            | `mcp { tool: "playwright_*" }` (server `playwright`, direct from lean)                                   |
| Chrome DevTools MCP                                        | `mcp { server: "chrome-devtools", tool: ... }`                                                           |
| Web search                                                 | `mcp { server: "websearch", tool: ... }`                                                                 |
| NVIDIA model/capability interop                            | `mcp { server: "nvidia-capabilities", tool: ... }`                                                       |
| Dispatch background subagent                               | `mcp { tool: "external_subagents_external_subagent_start", ... }` — poll/steer/followup need `worker_id` |

## 2. Tool surface

### Native tools always on lean

`bash`, `read`, `write`, `edit`, `grep`, `find`, `ls`, `todo`, `flight_recorder`, `pi_background_jobs`, `pi_harness_doctor`, `mcp`, `tool_profile`, `pi_tool`, `skill_manage`.

> **`skill_manage`** is a Pi-native tool, **not on lean by default.** Add it once per session via `tool_profile action=add tools:["skill_manage"]`; otherwise the gateway returns `Tool not found` from `pi_tool`.

### `pi_tool` allowlist (native gateway — native schema preserved)

`ast_grep_search` · `ast_grep_replace` · `ast_dump` · `ctx_execute` · `ctx_execute_file` · `ctx_search` · `ctx_index` · `ctx_batch_execute` · `ctx_stats` · `ctx_doctor` · `session_search` · `memory_search` · `memory_write` · `preview_export` · `pi_background_jobs` · `pi_harness_doctor`.

### `mcp` gateway servers

Invoke via `mcp { tool: "<owner>_<tool>", args: {...} }` (or use `mcp { server: "<name>", tool: ... }` to disambiguate).

- `switchboard` (40 tools) — cross-agent coordination bus, taskboard, doorbell, decision queue, resource locks (§4 below).
- `chrome-devtools` (29 tools).
- `nvidia-capabilities` (19 tools).
- `websearch` (5 tools).
- `external_subagents` (51 tools) — subagent dispatch; every start returns `worker_id`, which `external_subagents_external_subagent_poll` / `external_subagents_external_subagent_steer` / `external_subagents_external_subagent_followup` then require.
- Direct-from-lean pierce servers (also via `mcp`): `playwright` (23), `pi-context` (8).

## 3. Tool profile policy

- **Default: lean.** Lean is intentional — short system-prompt footprint; cross-server tools remain reachable via `mcp`.
- **Add ONE tool at a time** via `tool_profile action=add tools:["<exact-name>"]` — cheaper than activating a broad profile.
- **Avoid profile switches mid-session.** `activate code | context | browser | research | subagents | full` alter the request prefix and risk provider cache misses. Browser, research, subagents, and full are virtual routes (no native schema change) — use `mcp` for browser/subagents/websearch.
- **Use `activate code`** for heavy AST work that genuinely requires the AST tool's schema surfaced in the model request. **Use `activate context`** for context-mode tools needing gateway access beyond `pi_tool`. Otherwise `pi_tool` covers the deep tools from lean.
- `action=status` shows active tools; `action=list` lists profiles; `action=available` lists addable tools not yet active.

## 4. Cross-session switchboard — API quick-start

The switchboard complements the file-based `.session-lock` (see `docs/session-coordination.md`): the lock says _"worktree held"_; the bus says _"what peer is doing"_. Use both concurrently.

### 4.1 Join

```
mcp switchboard_join_chat:
  harness: "pi"
  agent_id: "<stable id, e.g. w52-main-lane>"
  nickname: "<human e.g. W52 main lane>"
  requested_tag: "<short handle e.g. w52-main>"
  description: "<one-line current posture>"
  capabilities: ["bash","read","write","edit","grep","mcp","pi_tool","skill_manage"]
```

Return includes `display_name: "@<tag>"` — both the agent_id AND the tag work as a handle in subsequent calls that accept "an id or tag" (most do).

### 4.2 Heartbeat (every ~5-15 min while active)

```
mcp switchboard_heartbeat_agent:
  agent_name: "@<tag>"
  status:     "online"
```

Online entries decay to `stale: true` after 5 min of no heartbeat.

### 4.3 List peers / inbox / next-action

```
mcp switchboard_list_agents: {}
mcp switchboard_get_inbox:        { agent_name: "@<tag>" }
mcp switchboard_get_next_action:  { agent_name: "@<tag>", limit: 20 }
```

### 4.4 Post a broadcast or DM

```
mcp switchboard_post_message:
  sender:  "@<tag>"
  content: "<text>"
  to:      "ALL"          // broadcast
  channel: "general"
```

Direct message: `to: "@peer-tag"`.

### 4.5 Taskboard (visible cross-agent tasks)

```
mcp switchboard_create_task:
  creator:  "@<tag>"
  title:    "<short>"
  description: "<longer>"
  priority: "normal"     // low | normal | high | urgent
  labels:   [...]
  board:    "main"       // default
```

Then `claim_task agent task_id` (refresh with `heartbeat_task`, default-ttl 120 min); `comment_task` for structured handoff notes; `release_task` to free for re-claim; `stale_task_sweep` to reap abandoned tasks.

### 4.6 Doorbell — urgent but asynchronous

```
mcp switchboard_ring_agent:
  agent:   "@peer-tag"
  message: "<one-line urgency>"
```

Appears in peer's next `get_inbox` under `doorbells`. ACK with `ack_doorbell`. Reserve for one-shot urgents; persistent coordination goes to `post_message`.

### 4.7 Resource locks (shared browser / MCP / deploy slots)

```
mcp switchboard_list_resource_presets: {}                          // see named presets
mcp switchboard_claim_resource_preset:   { agent: "@<tag>", preset: "browser-window" }
mcp switchboard_release_resource_preset: { agent: "@<tag>", preset: "browser-window" }
```

For a custom scope, `claim_resource uri: "..."` (with `ttl` for expiry).

### 4.8 Decision queue (visible peer-review)

`create_decision` posts a structured proposal on the bus. Then `request_signoff decision_id approvers: [...]` requires approval; `approve_signoff decision_id decision: "approve" | "block"` records each peer's verdict.

## 5. Common pitfalls

- **Switchboard is voluntary.** Peers may only use the file lock. If `list_agents` returns zero, fall back to `.session-lock` (and via the user as dispatcher if needed). Never block work pending bus attendance.
- **Heartbeat is required** to remain visible. Stop heartbeating → peers see `stale: true` after 5 min. Treat going-online-without-heartbeat as _invisibility_.
- **Task heartbeats ≠ agent heartbeats.** `heartbeat_agent` keeps you visible; `heartbeat_task` keeps only a _claimed_ task fresh (default 120 min).
- **`external_subagents_*` `worker_id` is mandatory** for every post-start call (poll / steer / followup). Without it, "not-found".
- **Workers don't inherit browser/MCP.** Dispatch with `mcp_profile: browser` AND consult the `subagent-mcp-browser-profile-fix` skill if MCP fails to surface — Pi-harness lean-startup strips MCP from workers by default.
- **`mcp` is the route to switchboard**, NOT `pi_tool`. Per AGENTS.md native-vs-MCP policy: allowlisted native tools go through `pi_tool`; MCP-hosted servers (switchboard, playwright, external_subagents, websearch, chrome-devtools, nvidia-capabilities) go through `mcp`.
- **Don't kill broad `node` / Claude / Gemini / MCP / Pi process trees** — exact-PID stops only (AGENTS.md).
- **Profile switch = cache miss.** Prefer `action=add tools:[...]` for one-tool needs.
- **`memory_write` gateway-routed** — if `pi_tool memory_write → Tool not found`, run `/reload-runtime` once or restart Pi (see `~/.pi/agent/extensions/pi-hermes-memory-writer.md`).

## 6. Reference skills (load only when relevant)

- `~/.pi/agent/skills/ast-grep-decision-tree/SKILL.md` — pick the right search/inspection tool by job.
- `~/.pi/agent/skills/lsp-navigation/` (pi-lens) — LSP-based code intel + proactive diagnostics.
- `~/.pi/agent/skills/mcp-subagent-dispatch-routing/SKILL.md` — native-vs-MCP-vs-pi_tool boundary; dispatching subagents.
- `~/.pi/agent/skills/memory-routing-policy/SKILL.md` — durable memory store routing.
- `~/.pi/agent/skills/app-context/` (pi-context) — sandboxed execution + FTS5 index.
- `~/.pi/agent/pi-hermes-memory/skills/js-repl/SKILL.md` — sandboxed JS scratch without polluting the lane.
- **Subagent-recovery trio** (a 3-way decision tree lives in the `worker-timeout-on-disk-edits-takeover` skill's `## When to Use`):
    - `subagent-timeout-recovery` — Kind-3: worker still alive, steer it.
    - `subagent-followup-recovery` — Kind-2: terminated mid-thinking, no edits on disk, followup inherits `session_id`.
    - `worker-timeout-on-disk-edits-takeover` — Kind-1: terminal + on-disk edits, main-lane takeover (don't followup).
- Repo-side references: `docs/session-coordination.md`, `docs/subagent-delegation.md`, `docs/subagent-models.md`, `docs/subagent-dispatch-cheatsheet.md`.
