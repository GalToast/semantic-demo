# Compaction Policy

Workstream B/C — frontier-research adoption wave.
This doc defines when compaction runs, what must survive it, per-task-type context bundles, and a proposed skill capability frontmatter extension. It is a design proposal; adoption steps are at the bottom.

---

## 1. Compaction Triggers

Compaction is the act of summarizing, pruning, or archiving context so the main lane's working memory stays within a useful budget. The harness treats compaction as a deterministic lifecycle event, not an ad-hoc cleanup.

Run compaction when **any** of the following is true:

1. **Context usage threshold** — main-lane context is ≥ 60% of the model's working budget. Measure via the harness's context-meter (token count of injected system + tool + turn history). At 60%, trigger `PreCompact`; at 80%, trigger immediately.
2. **Long-session marker** — more than 40 tool turns since the last compaction. Long sessions accumulate redundant outputs (repeated worker logs, repeated search results, repeated switchboard reads).
3. **Pre-heavy-work** — before starting a known expensive operation:
   - launching a subagent worker with a large prompt bundle
   - running `npm run build` or `npm run qa:journey:headless`
   - opening a visual-state-audit run
   - indexing a new doc corpus via `ctx_index`
4. **Session handoff** — before the main lane pauses for a switchboard handoff or exits, so the next session resumes from a clean ledger rather than a stale context dump.

Do not compact during an active user prompt turn. Compaction is a **between-turns** operation.

---

## 2. What Must Survive Compaction

These invariants are non-negotiable. If compaction loses them, the main lane will hallucinate or redo work.

| Invariant | Representation | Recovery |
|---|---|---|
| **In-flight task summary** | `memory_write` target=`project` entry with `task_id`, current status, last action, next action | Main lane reads it at session start via `memory_search` |
| **Ledger pointers** | `session.ledger_ref` pointing to `tmp/subagent-ledger.jsonl`; worker PIDs / output paths | Main lane reads ledger lines, not raw worker stdout |
| **Handoff state** | Unread switchboard `HANDOFF`s; accepted but not-yet-completed handoffs | `get_inbox` at session start |
| **Pending decisions** | Open `SIGNOFF`s; decisions with `revisit_after` in the future | `memory_search` target=`project` for recent `decision-*` entries |
| **Failure context** | Recent `failure` memory entries consulted in the current task | `memory_search` target=`failure` with current module/error tokens |
| **Episodic precedent** | Episode entries retrieved for the current task family | `ctx_search` against `tmp/memory/episodic/` |

The PreCompact hook serializes these invariants into a compact JSON payload:

```json
{
  "in_flight_task": { "task_id": "...", "status": "claimed", "next_action": "..." },
  "ledger_refs": [ "tmp/subagent-ledger.jsonl" ],
  "handoff_ids": [ "handoff-..." ],
  "pending_decision_ids": [ "decision-..." ],
  "failure_queries": [ "webgl-context-lost", "vite-hmr-cache" ],
  "episode_queries": [ "engine", "three-engine" ]
}
```

The PostCompact hook verifies each field is non-empty (or explicitly absent because the invariant does not apply). If any field is unexpectedly empty, the hook emits a warning to the switchboard decision queue so the main lane can re-read the world.

---

## 3. PreCompact / PostCompact Checklist

### PreCompact

- [ ] Pause active subagent workers? If yes, emit `SubagentStop` ledger lines with current state.
- [ ] Serialize in-flight task summary to `memory_write` target=`project` (≤2000 chars).
- [ ] Ensure all switchboard `HANDOFF` / `SIGNOFF` IDs are captured in the PreCompact payload.
- [ ] Record current `failure` memory queries (module + error family tokens) so PostCompact can re-verify.
- [ ] Record current `episode` recall queries so PostCompact can re-verify.
- [ ] If context is >80% of budget, drop non-essential tool outputs from working memory (keep only failure/decision references, not full stdout).

### PostCompact

- [ ] Re-run `memory_search` for each `failure_query`; confirm ≥1 hit or explicitly note `no_hit`.
- [ ] Re-run `ctx_search` against `tmp/memory/episodic/` for each `episode_query`; confirm ≥1 hit or explicitly note `no_hit`.
- [ ] Call `get_inbox` and confirm no new unread handoffs arrived during compaction.
- [ ] Verify in-flight task summary is still loadable; if `task_id` is missing, re-`get_next_action`.
- [ ] If any invariant failed, emit a `decision` entry with category `insight` documenting the compaction gap.
- [ ] Reset context-meter threshold counter.

---

## 4. Context Bundles by Task Type

A context bundle is the set of hot-path files, docs, and memory queries that a task family needs. Bundles keep workers scoped and prevent context pollution.

Bundles are assembled at delegation time and at session start. They are **not** injected wholesale — the main lane selects the bundle and loads its contents lazily.

### 4.1 UI / Surface Work

**Task family:** Svelte components, CSS, accessibility, responsive renderer.

**Hot-path files (from `AGENTS.md` + `important-files.md`):**
- `src/lib/components/header/header.css`
- `src/components/CompassRail.svelte`
- `src/components/JourneyCompass.svelte`
- `src/lib/components/journey/CompassDiveSurface.svelte`
- `src/lib/components/header/ModeChipRail.svelte`
- `src/lib/components/header/HelpDialog.svelte`
- `src/lib/navigation/mode-affordances.ts`
- `src/lib/orchestration/responsive-renderer.ts`
- `docs/css-ownership.md`

**Memory queries:**
- `memory_search` target=`project` for surface/UI conventions
- `memory_search` target=`failure` for `svelte-gate`, `z-index`, `a11y` error families
- `ctx_search` source=`tmp/memory/episodic/` for `ui`, `surface`, `css` tags

**Bundle contents:**
- `AGENTS.md` hot-path rules only (mode switching, toast, journey phases, surface tests)
- `docs/css-ownership.md`
- `tests/surface-contract-check.mjs` surface names relevant to the task
- `docs/ux-copy-rules.md` if the task touches user-visible strings

---

### 4.2 Engine / WebGL

**Task family:** Three.js engine, mycelium geometry, WebGL contexts, resource tracker.

**Hot-path files:**
- `src/lib/engine/three-engine.ts`
- `src/lib/engine/three-engine-mycelium.ts`
- `src/lib/engine/thread-manager.ts`
- `src/lib/engine/node-manager.ts`
- `src/lib/engine/resource-tracker.ts`
- `src/lib/engine/semantic-threads.ts`
- `docs/performance-budget.md`

**Memory queries:**
- `memory_search` target=`failure` for `webgl-context-lost`, `resource-dispose`, `geometry-leak` error families
- `memory_search` target=`project` for WebGL flags (`SEMANTIC_FORCE_WEBGL_SOFTWARE`, `SEMANTIC_USE_D3D11`)
- `ctx_search` source=`tmp/memory/episodic/` for `engine`, `webgl`, `three` tags
- `memory_search` target=`failure` for `gpu`, `angle`, `d3d11` tool quirks

**Bundle contents:**
- `AGENTS.md` hot-path rules (engine invariants, resource disposal, data-worker boundary)
- `docs/performance-budget.md`
- `docs/important-files.md` Engine section only

---

### 4.3 Search / Data

**Task family:** Search engine, tokenizer, scoring, cache, data loader, semantic threads.

**Hot-path files:**
- `src/lib/search-engine.ts`
- `src/lib/search/tokenizer.ts`
- `src/lib/search/scoring.ts`
- `src/lib/search/orchestration.ts`
- `src/lib/search/cache.ts`
- `src/lib/data-store.ts`
- `src/lib/data-loader.ts`
- `src/lib/engine/semantic-threads.ts`
- `docs/search-fallback.md`

**Memory queries:**
- `memory_search` target=`failure` for `vite-hmr-cache`, `php-dev-server`, `api_unreachable`, `staticDev` error families
- `memory_search` target=`project` for search/data conventions
- `ctx_search` source=`tmp/memory/episodic/` for `search`, `data`, `semantic` tags

**Bundle contents:**
- `AGENTS.md` hot-path rules (search fallback, live data, PHP/Vite proxy)
- `docs/search-fallback.md`
- `docs/important-files.md` State/Data + Search sections only

---

### 4.4 Delegation

**Task family:** Subagent dispatch, worker templates, handoff records, context-leak prevention.

**Hot-path files:**
- `docs/subagent-delegation.md`
- `docs/switchboard-protocol.md`
- `docs/subagent-lane-inventory.md`
- `docs/tool-guide.md`
- `docs/session-coordination.md`

**Memory queries:**
- `memory_search` target=`project` for delegation conventions and worker templates
- `memory_search` target=`failure` for `worker-wedge`, `timeout`, `context-leak` error families
- `ctx_search` source=`tmp/memory/episodic/` for `delegation`, `worker`, `subagent` tags
- `ctx_search` source=`tmp/sessions/` for prior sessions with the same worker template hash

**Bundle contents:**
- `AGENTS.md` hot-path rules (subagent rules, session lock, lane inventory, no-revert boundaries)
- `docs/subagent-delegation.md`
- `docs/switchboard-protocol.md`
- `docs/tool-guide.md` routing section only

---

### 4.5 Research

**Task family:** Frontier-research digest, model-leaderboard review, capability assessment.

**Hot-path files:**
- `docs/subagent-model-benchmarks.md`
- `docs/subagent-model-latency-findings-2026-07-23.md`
- `docs/vision-model-matrix.md`
- `tmp/bleeding-edge-digest.md`
- `docs/important-files.md`

**Memory queries:**
- `memory_search` target=`memory` for cross-project frontier findings
- `ctx_search` source=`tmp/memory/episodic/` for `research`, `digest`, `benchmark` tags
- `ctx_search` source=`tmp/` for prior digests and benchmarks

**Bundle contents:**
- `AGENTS.md` hot-path rules only (delegation defaults, knowledge-gap → websearch)
- `tmp/bleeding-edge-digest.md` executive summary only (top-20 list)
- Relevant `docs/subagent-*` benchmark files for the model family under review

---

## 5. Skill Capability Declarations (PROPOSAL)

This section is a **proposal for the main lane to adopt**. It does not modify any existing SKILL.md. The goal is to make skill discovery deterministic and context-bundle assembly automatic.

### 5.1 Proposed Frontmatter Extension

Add two optional fields to the YAML frontmatter of every SKILL.md:

```yaml
---
name: "some-skill"
description: "..."
version: 1
updated: "2026-08-05"
capabilities: [vision, web, subagents, browser, shell, database]
context_budget: medium
---
```

**`capabilities`** is an array of capability tokens. Defined tokens:

| Token | Meaning |
|---|---|
| `vision` | Skill requires screenshot / image / video input |
| `web` | Skill performs web search or fetches URLs |
| `subagents` | Skill dispatches external subagents |
| `browser` | Skill drives Playwright / browser MCP |
| `shell` | Skill runs bash / PowerShell commands |
| `database` | Skill reads/writes SQLite / ctx_index / ctx_search |
| `filesystem` | Skill reads/writes repo files |
| `git` | Skill inspects or mutates git state |
| `network` | Skill opens sockets or hits localhost services |
| `render` | Skill captures screenshots or visual audits |
| `ui` | Skill edits Svelte / CSS / DOM |
| `engine` | Skill touches engine / WebGL / Three.js |

Skills can add custom tokens, but the twelve above cover every current repo skill.

**`context_budget`** is one of:

| Value | Meaning |
|---|---|
| `lean` | Skill body is ≤60 lines; inject body directly into worker prompt |
| `medium` | Skill body is 60–200 lines; load body on demand from skill path |
| `heavy` | Skill body is >200 lines or references large docs; load only description + linked doc paths |

### 5.2 Rationale

1. **Deterministic dispatch.** When the main lane assembles a worker prompt, it can filter `available_skills` by `capabilities` instead of matching free-text descriptions. This eliminates the "which skill should I load?" ambiguity that currently requires the main lane to scan `skill-index.md`.
2. **Token-budget compliance.** `context_budget` tells the harness whether to inject the skill body into the worker prompt (`lean`), load it on demand (`medium`), or reference it by path (`heavy`). This directly implements the bundle-assembly rule in §4.
3. **Progressive-disclosure contract.** The current progressive-disclosure model (name + description in index, body on demand) is informal. Adding `capabilities` and `context_budget` makes it a machine-readable contract without changing skill behavior.
4. **No breaking change.** Both fields are optional. Existing skills without them default to `capabilities: [filesystem]` and `context_budget: medium`. This preserves backward compatibility.

### 5.3 Adoption Boundary

This proposal is **frozen at design**. Do not edit any SKILL.md until the main lane reviews and accepts the proposal. If accepted, the first skill to migrate is `memory-routing-policy` (it already has structured frontmatter and a clear capability set: `database`, `filesystem`, `shell`).

---

## 6. Adoption Steps

| # | Who | What |
|---|---|---|
| 1 | Main lane | Review and accept (or revise) the skill capability declaration proposal in §5. |
| 2 | Harness owner | Implement PreCompact / PostCompact hooks with the checklist in §3. Wire them to session-end and context-threshold events. |
| 3 | Harness owner | Implement context-meter measurement (token count of injected system + tool + turn history) and the threshold triggers in §1. |
| 4 | Main lane | For each task family in §4, validate the bundle against the actual hot-path files in `important-files.md` and trim any file that is not on the hot path. |
| 5 | Main lane | Add bundle-assembly logic to the delegation path so worker prompts include the bundle contents (or references) scoped to the task family. |
| 6 | Main lane | If capability declarations are accepted, add a `skill-index` validator that warns when a skill's `capabilities` array does not match its actual tool usage. |
| 7 | Main lane | Add a compaction smoke test: run a 50-turn session, trigger compaction at 60%, assert all six invariants in §2 survive. |
