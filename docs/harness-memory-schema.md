# Harness Memory Schema

Workstream B/C — frontier-research adoption wave.
This doc is the design reference for memory kinds, episodic recall, and switchboard-linked continuity. It is a design proposal; adoption steps are at the bottom.

---

## 1. Memory Kind Schemas

We define four durable memory kinds that the main lane writes explicitly. Each kind has a stable set of fields, a canonical store, and a TTL/retention rule.

### 1.1 `session`

Records a Pi session (main lane or subagent worker) so a returning session can resume with ground truth rather than re-reading the world.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | UUID or `session-<YYYYMMDD-HHMMSS>` |
| `worker_id` | string | no | Empty for main lane; set for subagent workers |
| `started_at` | ISO-8601 | yes | |
| `ended_at` | ISO-8601 | no | Set at session end |
| `intent` | string | yes | One-line goal at session open |
| `outcome` | string | no | `done` / `partial` / `blocked` / `escalated` |
| `ledger_ref` | string | no | Path to worker ledger JSONL in `tmp/subagent-ledger.jsonl` |
| `handoff_id` | string | no | Switchboard HANDOFF that resumed this session |
| `key_decisions` | array of strings | no | Short bullets; prefer one line each |
| `failure_refs` | array of strings | no | Memory entries (target=failure) consulted or created |
| `episode_tags` | array of strings | no | Tags for episodic recall (module + action family) |

**Where it lives:** `memory_write` target=`project` (compact) for session intent/outcome, plus a structured JSONL line in `tmp/sessions/session-<id>.jsonl` for the full record. The JSONL is append-only and indexed by `ctx_index` at session end so `session_search` / `ctx_search` can retrieve it.

**Who writes it:** Main lane at session open (`intent`); main lane or worker at session end (`outcome`, `key_decisions`).

**TTL / retention:** Keep for 90 days. Archive sessions older than 90 days to `tmp/sessions/archive/`. Purge archive after 365 days unless tagged `preserve`.

**Transition trigger:** session end hook; also write on `SubagentStop` for workers.

---

### 1.2 `task`

A bounded piece of work with an owner, acceptance criteria, and a finish line. Mirrors the switchboard TASK type but adds harness-side metadata.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | Switchboard `task_id` or `task-<slug>` |
| `owner` | string | yes | Session ID or worker ID |
| `area` | string | yes | `ui` / `engine` / `search` / `focus` / `trail` / `inside` / `map` / `orchestration` / `data` / `test` |
| `status` | enum | yes | `open` / `claimed` / `done` / `blocked` / `canceled` |
| `created_at` | ISO-8601 | yes | |
| `updated_at` | ISO-8601 | yes | Mutated on every state change |
| `acceptance` | string | yes | One-line acceptance criterion |
| `evidence_refs` | array of strings | no | Paths in `tmp/` |
| `failure_refs` | array of strings | no | Related failure memories |
| `decision_refs` | array of strings | no | Related decision memories |

**Where it lives:** Switchboard `create_task` / `update_task` (durable taskboard state) is the canonical source of truth. The main lane mirrors a compact summary into `memory_write` target=`project` so recall can find it without live board access.

**Who writes it:** Any session that creates or claims work. Receiving session calls `claim_task`; completing session calls `update_task(status:'done')` plus `comment_task` with evidence path.

**TTL / retention:** Retain on switchboard until `canceled` or `done` + 30 days. Mirror in `memory` target=`project` for 90 days after completion.

**Transition trigger:** task lifecycle events (`create_task`, `claim_task`, `update_task`, `comment_task`).

---

### 1.3 `failure`

A categorized lesson from a failed attempt. The existing `memory_write` target=`failure` store already supports this kind; this schema adds structure so recall can filter by module + error family.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | `failure-<YYYYMMDD>-<slug>` |
| `category` | enum | yes | `failure` / `correction` / `insight` / `preference` / `convention` / `tool-quirk` |
| `module` | string | yes | Repo module: `engine` / `journey` / `focus` / `search` / `ui` / `orchestration` / `data` |
| `error_family` | string | yes | Short token, e.g. `webgl-context-lost`, `vite-hmr-cache`, `svelte-gate` |
| `observed_at` | ISO-8601 | yes | |
| `repro` | string | no | Steps or minimal snippet |
| `resolution` | string | no | What worked; empty if unresolved |
| `source_refs` | array of strings | no | File paths or session IDs |
| `superseded_by` | string | no | ID of a newer failure that obsoletes this one |

**Where it lives:** `memory_write` target=`failure` with `category:` embedded in the body (≤2000 chars). For >2000 chars, write a structured JSONL line to `tmp/memory/failures/failure-<id>.json` and `ctx_index` it so `ctx_search` can recall the full record.

**Who writes it:** The session that observed the failure, or the main lane after reading a worker's `failed` ledger line.

**TTL / retention:** Keep indefinitely in the `failure` memory store. Superseded entries stay searchable but are tagged `superseded_by`. No hard purge; prune only entries whose `superseded_by` chain is >3 deep and whose `source_refs` no longer exist.

**Transition trigger:** PostToolUseFailure hook; worker stop with `outcome: failed`; manual `memory_write` after a fix.

---

### 1.4 `decision`

A recorded architecture, routing, or coordination decision. The switchboard decision queue and `SIGNOFF` type already support decision logging; this schema adds the harness fields that prior-session recall needs.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | `decision-<YYYYMMDD>-<slug>` |
| `domain` | string | yes | `memory` / `compaction` / `routing` / `ui` / `engine` / `search` / `test` / `delegation` |
| `question` | string | yes | One-line question this decision answers |
| `chosen` | string | yes | The selected option |
| `rejected` | array of strings | no | Alternatives considered |
| `rationale` | string | yes | Why the chosen option wins |
| `decided_at` | ISO-8601 | yes | |
| `decided_by` | string | yes | Session ID or human initials |
| `revisit_after` | ISO-8601 | no | If this is a time-boxed experiment |
| `switchboard_ref` | string | no | Linked task/handoff/signoff ID |

**Where it lives:** `memory_write` target=`project` (compact summary) for recall. Full record in `tmp/memory/decisions/decision-<id>.json`. The switchboard `SIGNOFF` or `HANDOFF` body contains the same text when the decision is coordinated across sessions.

**Who writes it:** Main lane after a non-trivial choice; subagent worker when a `SIGNOFF` is completed; human via switchboard `approve_signoff`.

**TTL / retention:** Keep for 180 days. If `revisit_after` is set and past, tag `expired` and let it age out after another 90 days.

**Transition trigger:** End of any planning step that selects among alternatives; switchboard `approve_signoff`.

---

## 2. Cross-Kind Relationships

These are the stable pointers that let recall compose across kinds:

```
session.outcome   ──► task.status        (was this session's intent completed?)
session.ledger_ref ──► failure.source_refs   (did this worker fail on X?)
task.evidence_refs ──► decision.switchboard_ref   (did a decision gate this task?)
decision.revisit_after ──► session   (is this still true in the current session?)
```

The main lane treats these pointers as read-only after creation. They form the recall graph that episodic memory and switchboard-linked recall traverse.

---

## 3. Episodic Memory Design

Episodic memory closes the gap between "what happened" (session JSONL) and "what to do next" (few-shot precedent). It is a distilled, similarity-keyed store of past episodes.

### 3.1 Episode Entry Schema

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | `episode-<YYYYMMDD>-<hash4>` |
| `created_at` | ISO-8601 | yes | |
| `task_family` | enum | yes | `ui` / `engine` / `search` / `delegation` / `research` / `compaction` |
| `trigger` | string | yes | What started the episode (user request, error, switchboard event) |
| `action` | string | yes | What the main lane / worker actually did |
| `outcome` | enum | yes | `success` / `partial` / `failure` |
| `lesson` | string | yes | One-line takeaway |
| `session_id` | string | yes | Source session |
| `task_id` | string | no | Source task |
| `failure_id` | string | no | Related failure memory |
| `decision_id` | string | no | Related decision |
| `tags` | array of strings | yes | Repo module + action family + any error token |
| `replay_quality` | enum | no | `high` / `medium` / `low` — confidence that the episode is a valid precedent |

### 3.2 Distillation Process

Episodes are distilled from session JSONL at two points:

1. **Session end** — lightweight pass over the last session JSONL. The main lane extracts up to 3 high-signal episodes (one per distinct task family) and writes them to `tmp/memory/episodic/episodes.jsonl`. This pass is fast and deterministic.
2. **Nightly compaction** — heavier pass over the last 7 days of session JSONL + `tmp/memory/episodic/episodes.jsonl`. Merges duplicate episodes, canonicalizes the `lesson` field, and prunes low-quality episodes. Bounded to 200 entries; oldest/lowest `replay_quality` entries are dropped first.

**Trigger:** session end hook writes 0–3 episodes. Nightly cron or pre-heavy-work hook runs the compaction pass.

**Where episodes live:** `tmp/memory/episodic/episodes.jsonl` (append-only, line-delimited JSON). The full JSONL is `ctx_index`ed at write time so `ctx_search` can retrieve episodes without loading the whole file.

**Recall surface:** The main lane searches episodes via `ctx_search` with queries composed from:
- current task family keywords
- repo module keywords from `important-files.md` hot-path files
- error tokens from recent tool failures

The recall step runs before delegation and before heavy work. It returns the top 3 analogous episodes, sorted by tag overlap + recency. The main lane appends them to the worker prompt or planning context as precedent.

### 3.3 Episode Quality Gate

Not every session warrants an episode. A session must meet at least one of:
- A non-trivial failure was observed and resolved.
- A decision was recorded with `switchboard_ref`.
- A task transitioned through `open → claimed → done` with evidence in `tmp/`.
- A worker produced a reusable pattern (e.g. a visual-state-audit recipe, a contract-test scaffold).

Sessions that are pure chat or single-tool navigation do not produce episodes.

### 3.4 Recall Protocol

```
Main lane starts planning
  → identify task_family + module + error tokens
  → ctx_search source=tmp/memory/episodic/ queries=[task_family, module, error_token]
  → if hits ≥ 1: append as "Prior analogous episodes:" block
  → if hits = 0: proceed without episode injection
```

Episodes are context, not authority. If an episode conflicts with current repo evidence, prefer current evidence and note the conflict in the new `decision` record.

---

## 4. Switchboard-Linked Recall

Switchboard is the durable coordination surface. The memory schema links into it at three points: handoffs, tasks, and signoffs.

### 4.1 Handoff → Session Continuity

A `HANDOFF` record is the highest-signal cross-session pointer because it encodes "what another session could not finish." The main lane reads `get_inbox` at session start and does the following:

1. For each unread `HANDOFF`:
   - Read the description and linked `tmp/` evidence path.
   - Load the source `session` record via its ID.
   - Load any linked `episode` entries by `session_id`.
   - Compose a 3–5 line handoff digest: intent, what was blocked, what the next session should try.
2. The handoff digest becomes the first block in the main-lane planning context.

### 4.2 Task → Episode → Decision Chain

When a task spans multiple sessions, the recall path is:

```
task (switchboard)
  → task.evidence_refs (tmp/ paths)
  → task.failure_refs → failure.source_refs → session.id
  → session → episode entries with session_id
  → episode.decision_id → decision.rationale
```

The main lane traverses this chain only when the task is resumed (via `claim_task` after `get_inbox`). It does not pre-load the entire chain on every session start — that would bloat context. Instead, it loads the chain lazily: task summary first, then failures/decisions only if the task is blocked.

### 4.3 Decision Queue as Episodic Index

Switchboard decisions that are tagged with a `task_family` become searchable as a secondary episodic index. When `ctx_search` returns no episodes for a query, the main lane falls back to a switchboard `list_tasks` / `list_handoffs` query filtered by tags. This fallback is cheap because the board is sparse.

### 4.4 Cross-Session Handoff Record in the Decision Queue

The bleeding-edge digest ranked cross-session handoff record in the switchboard decision queue (#14). Our design treats this as:

- Every `HANDOFF` that cannot land immediately gets a `create_handoff` call with tags `[repo, handoff, <area>]`.
- The handoff body includes a `memory_snapshot` block: the top 2 relevant `failure` IDs, the top 1 relevant `episode` ID, and the current `task_id` if one exists.
- The receiving session reads the handoff, loads the linked memory, and then calls `accept_handoff` only after the linked memory is digested. This prevents the "chat-only handoff" failure mode documented in `switchboard-protocol.md`.

---

## 5. Store Partition Summary

| Store / Path | Kind(s) | Size limit | Retention | Indexed |
|---|---|---|---|---|
| `memory_write` target=`project` | session, task, decision | ≤2000 chars each | 90–180 days | Yes (SQLite FTS) |
| `memory_write` target=`failure` | failure | ≤2000 chars each | Indefinite | Yes |
| `tmp/sessions/*.jsonl` | session | Unlimited | 90 days active / 365 archive | `ctx_index` at session end |
| `tmp/memory/episodic/episodes.jsonl` | episode | Unlimited (capped at 200 entries) | Indefinite | `ctx_index` at write |
| `tmp/memory/failures/*.json` | failure (long) | Unlimited | Indefinite | `ctx_index` at write |
| `tmp/memory/decisions/*.json` | decision (full) | Unlimited | 180 days | `ctx_index` at write |
| Switchboard taskboard | task, handoff, signoff | Board-managed | Until canceled + 30 days | Native |

---

## 6. Adoption Steps

| # | Who | What |
|---|---|---|
| 1 | Main lane | Add `tmp/memory/episodic/`, `tmp/memory/failures/`, `tmp/memory/decisions/` directories (empty) and `ctx_index` them once so `ctx_search` has a source. |
| 2 | Main lane | Update `memory-routing-policy` skill to add `episode` and `decision` rows in its routing table, referencing this doc. |
| 3 | Harness owner | Implement session-end hook that writes 0–3 episodes from session JSONL to `tmp/memory/episodic/episodes.jsonl` and `ctx_index`es the result. |
| 4 | Harness owner | Implement nightly compaction pass (see `docs/compaction-policy.md`) that merges/prunes episodes and updates rolling `MEMORY.md`. |
| 5 | Main lane | At session start, add a `ctx_search` call against `tmp/memory/episodic/` using task-family + module keywords before delegation. |
| 6 | Main lane | When creating switchboard `HANDOFF`s, include the `memory_snapshot` block with linked `failure`/`episode`/`task` IDs. |
