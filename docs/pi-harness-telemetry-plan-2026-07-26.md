# Pi Harness Telemetry & Tracing Diagnostic Report

**Date:** 2026-07-26  
**Author:** Pi harness diagnostic agent (read-only investigation)  
**Scope:** `~/.pi/agent/`, `pi-coding-agent` dist, external-subagents MCP server, background jobs

---

## Executive Summary

The Pi harness has a **solid foundation** of telemetry via the flight recorder (`~/.pi/agent/flight-recorder/*.jsonl`) and the background jobs system (`~/.pi/agent/local-packages/pi-background-detach`). However, four observed failure modes expose critical telemetry gaps:

1. **Background-detach patch errors** — the `patch-core.js` inline-patch system reports `"upstream snippet not found"` but has no mechanism to surface *which* upstream version caused the mismatch or when the upstream file last changed.
2. **Subagent workers hanging with no output** — the external-subagents server tracks `output_state` and `first_assistant_output_at` but the flight recorder has **zero visibility** into subagent-side provider calls; the gap between "model received request" and "first tool call" is opaque.
3. **`npx vitest run` hanging** — the full test suite hangs but focused subsets pass; the harness records tool start/end but has **no telemetry for subprocess tree health** (orphan processes, file descriptor exhaustion, or port lock contention).
4. **Subagent worker timeout at 900s** — the worker metadata captures `exit_code` and `last_error` but the *decision* to wait 900s vs. kill at 60s is not logged, nor is the internal polling state during the wait.

The existing flight recorder is well-designed (30-day retention, JSONL, redacted secrets, per-day rotation, TUI command) and covers the main Pi agent lifecycle well. The gaps are primarily in **cross-process** and **cross-server** observability.

---

## 1. Existing Telemetry Inventory

### 1.1 Flight Recorder (`~/.pi/agent/flight-recorder/`)

**Format:** One JSONL file per day (`YYYY-MM-DD.jsonl`), append-only, 30-day retention.

**Events captured (via `flight-recorder.ts` extension):**

| Event Type | When | Key Data |
|---|---|---|
| `session_start` | Pi session begins | cwd, mode, model info |
| `before_agent_start` | Before each agent turn | promptChars, systemPromptChars, promptBreakdown (skills, tools, context files), model |
| `agent_start` / `agent_end` | Agent lifecycle | durationMs, messageCount |
| `turn_start` / `turn_end` | Per-turn lifecycle | turnIndex, durationMs, messageRole, toolResults count |
| `message_start` / `message_end` | Message lifecycle | role, stopReason, provider, model, usage (tokens, cost) |
| `assistant_first_delta` | First token from model | sinceTurnStartMs, sinceAgentStartMs |
| `tool_start` / `tool_update` / `tool_end` | Tool lifecycle | toolName, toolCallId, argsBytes, resultBytes, durationMs, isError |
| `model_select` | Model routing decision | source, previous/next provider+model |
| `provider_request` / `provider_response` | Provider HTTP round-trip | provider, model, api, payload summary (bytes, messages, tools), status, durationMs, headers (ratelimit, retry-after) |
| `mark` | User-written annotation | note (sanitized) |
| `sample` | Router health + system load | router health endpoint, CPU/memory/disk stats |

**Classification engine:** `classifyLast()` analyzes the 30 most recent events and produces a one-line diagnosis (e.g., "Likely provider slowdown", "Likely tool/harness friction").

**Exposure:** `flight_recorder` tool (status/tail/sample/mark), `/flight` slash command, TUI notify.

**Retention:** 30 days, auto-cleaned on each write.

### 1.2 Background Jobs (`pi-background-detach`)

**Format:** Per-job files in `%TEMP%/pi-background-jobs/`:
- Bash jobs: `{jobId}.stdout.log` + `{jobId}.stderr.log` (free-form text)
- Tool jobs: `{jobId}.jsonl` (concatenated JSON records with `\n` separators, parsed by `splitToolJobRecords`)

**Events in tool job JSONL:**
- `started` — jobId, toolName, toolCallId
- `detached` — params (command), reason, autoDetached flag
- `update` — partial output
- `result` — final result
- `error` — error object (name, message, stack)

**Metadata in bash stderr:**
- `[pi] background job {jobId} started pid={pid} cwd={cwd}`
- `[pi] command: {command}`
- `[pi] background job {jobId} exited code={code} signal={signal}`

**Exposed via:** `pi_background_jobs` tool (list/check/tail/kill/clear/last/wait/diagnostics/purge-stale).

**Diagnostics:** `buildDiagnostics()` reports total/active/completed counts, by-kind/by-status breakdowns, largest logs, stale jobs (process dead + log untouched), recent errors.

### 1.3 External-Subagents Server (`~/harness/servers/external-subagents/`)

**Per-worker metadata** (persisted as `metadata.json`):
- `status` (starting/running/completed/failed/canceled/stale)
- `output_state` (no_logs/logs_only/assistant_output_seen)
- `first_output_at`, `first_assistant_output_at`
- `stdout_bytes`, `stderr_bytes`, `events_bytes`
- `pid`, `child_pid`
- `model`, `backend`, `harness`, `attempted_models[]`
- `exit_code`, `signal`, `error`, `last_text_preview`
- `live_steer`, `steer_transport`
- `created_at`, `updated_at`

**Tools:** `external_subagent_start`, `external_subagent_status`, `external_subagent_followup`, `external_subagent_steer`, `external_subagent_diagnose_worker`.

### 1.4 Key Router (`~/harness/servers/key-router/`)

- Exposes `/health` endpoint (checked by flight recorder `sample` action)
- Routes provider requests across configured providers
- **No JSONL event log** — only the health endpoint is observable

### 1.5 Harness Doctor (`pi_harness_doctor`)

- On-demand snapshot of patch status, harness config, marker counts, bloat candidates
- **Not telemetry** (no historical log; point-in-time only)

---

## 2. Gaps for Each Failure Mode

### 2.1 Failure Mode 1: Background-Detach Patch Errors

**Current state:** `ensureBackgroundDetachPatch()` runs at Pi startup. When an inline patch fails, it returns `{ errors: ["<patch-name>: upstream snippet not found"] }`. The `pi_harness_doctor` tool surfaces this on demand.

**What's missing:**
- **No startup event in the flight recorder** recording patch application results (success/repaired/errors).
- **No upstream version tracking** — when `pi update` changes a dist file, the patch system records "upstream snippet not found" but doesn't log *which* upstream version caused the mismatch, the file's mtime, or the expected vs actual content hash.
- **No automatic remediation alert** — the user must run `pi_harness_doctor` manually to discover patch failures; there's no TUI banner or toast.
- **No cross-referencing with `pi update` events** — if a `pi update` ran between sessions, there's no record of the update version or timing in the flight recorder.

### 2.2 Failure Mode 2: Subagent Workers Hanging with No Output

**Current state:** The external-subagents server tracks `output_state` and `first_assistant_output_at`. The `diagnose_worker` tool shows `tool_calls: []`, `stream_summary`, and `quiet_for_seconds`.

**What's missing:**
- **No flight recorder events for subagent-side provider calls.** When a subagent is launched via `external_subagent_start`, the *subagent's* Pi process has its own flight recorder, but there's no cross-reference linking the main session's `tool_start` for `external_subagent_start` to the subagent's `before_agent_start` events. The two JSONL streams are disconnected.
- **No telemetry for the provider-request-to-first-delta gap in subagents.** The main flight recorder captures `sinceAgentStartMs` for the main session, but subagent provider calls are invisible.
- **No event for "subagent started receiving tokens" vs "subagent produced tool calls."** The external-subagents `output_state` tracks `assistant_output_seen` but not *what kind* of output (thinking vs text vs tool_call).
- **No model-specific wedge detection.** The `pi-harness-subagent-spawn-wedge-3-layer` skill documents 4 wedge layers, but there's no automated telemetry that flags "model X has produced N bytes of text but zero tool_calls after T seconds."

### 2.3 Failure Mode 3: `npx vitest run` Hanging

**Current state:** The bash tool records `tool_start`/`tool_end` with durationMs. The flight recorder captures the provider response time. The background jobs system captures stdout/stderr for detached processes.

**What's missing:**
- **No child process tree telemetry.** When `npx vitest run` spawns worker processes, the harness has no visibility into how many children are alive, their PIDs, or their resource usage. If vitest hangs due to an orphaned worker process, the harness can't distinguish "vitest is slow" from "vitest spawned a zombie."
- **No file descriptor / port lock telemetry.** If vitest hangs because port 3000 is held by a previous test run, the harness doesn't know.
- **No subprocess exit-tree monitoring.** When the parent vitest process is killed (via timeout), the harness doesn't track whether child processes survived.
- **No correlation between vitest hangs and concurrent tool calls.** If another Pi session is running a dev server on the same port, the flight recorder doesn't cross-reference concurrent sessions.

### 2.4 Failure Mode 4: Subagent Worker Timeout at 900s

**Current state:** The external-subagents server has `timeout_seconds` in `StartArgs`. When a worker times out, `last_error` captures the timeout message. The `wait` action polls every 1s.

**What's missing:**
- **No telemetry for the wait decision.** When `waitJob()` is called with a 600s timeout, the decision to poll is not logged. The flight recorder captures the `tool_start`/`tool_end` for the `pi_background_jobs` call but not the internal polling loop's state.
- **No intermediate checkpoint logging during waits.** A 600s wait produces no flight recorder events between start and end; if the wait times out, the only evidence is the `tool_end` with `durationMs: 600000`.
- **No worker-lifecycle events in the flight recorder.** The external-subagents server's `metadata.json` updates are not mirrored to any JSONL log. The `updated_at` field is the only record of lifecycle transitions.
- **No cross-server correlation.** When the main Pi session calls `external_subagent_start` and then `external_subagent_status`, the two calls are in the flight recorder but there's no link to the external-subagents server's internal worker state.

---

## 3. Recommended Instrumentation Plan

### Priority 1: Minimal First Slice (Estimated: ~200 lines of code)

#### 3.1 Patch Application Events in Flight Recorder

**File:** `~/.pi/agent/local-packages/pi-background-detach/index.ts`  
**What:** At the end of `ensureBackgroundDetachPatch()`, append a flight recorder event.

```typescript
// After ensureBackgroundDetachPatch() runs in the module-level init:
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const flightRecorderDir = join(homedir(), ".pi", "agent", "flight-recorder");
const today = new Date().toISOString().slice(0, 10);
const logPath = join(flightRecorderDir, `${today}.jsonl`);

function recordPatchStatus(status: ReturnType<typeof ensureBackgroundDetachPatch>) {
  try {
    const record = {
      ts: new Date().toISOString(),
      type: "patch_status",
      pid: process.pid,
      installed: status.installed,
      ok: status.ok,
      repairedCount: status.repaired.length,
      errorCount: status.errors.length,
      errors: status.errors,
    };
    appendFileSync(logPath, `${JSON.stringify(record)}\n`, "utf8");
  } catch { /* best-effort */ }
}
```

**Value:** Immediately after a `pi update`, the user can check `flight_recorder status` and see whether patches were applied successfully, without running `pi_harness_doctor`.

#### 3.2 Subagent Launch/Status Events in Flight Recorder

**File:** `~/.pi/agent/local-packages/pi-background-detach/index.ts` (or a new extension)  
**What:** When `external_subagent_start` is called from the main session, record the worker_id, model, and timeout in the flight recorder.

Since `external_subagent_start` is an MCP tool (not directly instrumentable from the main Pi process), the best approach is to **add a flight recorder event from the model's tool call** via the `tool_execution_end` hook. The flight recorder already captures `tool_start`/`tool_end` for every tool call; we can enhance the `classifyLast()` engine to detect subagent-related tools and flag anomalies.

**Enhancement to `classifyLast()`:**

```typescript
// In flight-recorder.ts, enhance classifyLast():
if (toolStart && toolStart.toolName?.startsWith("external_subagent")) {
  const elapsed = Date.now() - (toolStartTimes.get(toolStart.toolCallId) ?? Date.now());
  if (elapsed > 300_000) {
    return `Likely subagent wedge: ${toolStart.toolName} has been running for ${Math.round(elapsed/1000)}s without completion.`;
  }
}
```

**Value:** The `flight_recorder status` classification will now detect "Likely subagent wedge" when a subagent tool call has been running >5 minutes.

#### 3.3 Subprocess Health Check for Bash Commands

**File:** `~/.pi/agent/local-packages/pi-background-detach/index.ts`  
**What:** Add a `subprocess_health` action to `pi_background_jobs` that checks for orphaned child processes.

```typescript
// New action in pi_background_jobs:
case "subprocess_health": {
  const jobs = listJobs();
  const running = jobs.filter(j => j.status === "running" || j.status === "running-or-detached");
  const orphaned = running.filter(j => j.kind === "bash" && j.pid && !pidAlive(j.pid));
  return {
    running: running.length,
    orphaned: orphaned.length,
    orphanedJobs: orphaned.map(summarizeJob),
  };
}
```

**Value:** After a vitest hang, the user can run `pi_background_jobs action=subprocess_health` to see if any background jobs have orphaned processes.

### Priority 2: Enhanced Telemetry (Estimated: ~400 lines)

#### 3.4 Subagent Worker Lifecycle Events

**File:** `~/harness/servers/external-subagents/src/mmx.ts`  
**What:** Append lifecycle events to a dedicated JSONL log (`~/.pi/agent/flight-recorder/subagents-YYYY-MM-DD.jsonl`).

Events to add:
- `worker_start` — worker_id, model, harness, cwd, timeout, pid
- `worker_first_output` — worker_id, output_state, bytes
- `worker_output_state_change` — worker_id, from → to, bytes, elapsed_ms
- `worker_complete` — worker_id, exit_code, total_bytes, duration_ms
- `worker_timeout` — worker_id, timeout_seconds, last_output_state, bytes_at_timeout
- `worker_error` — worker_id, error_message, exit_code

**Implementation sketch:**

```typescript
// In mmx.ts, at each lifecycle transition:
function recordWorkerEvent(type: string, meta: Partial<WorkerMetadata>) {
  try {
    const logDir = join(homedir(), ".pi", "agent", "flight-recorder");
    const logPath = join(logDir, `subagents-${new Date().toISOString().slice(0,10)}.jsonl`);
    const record = { ts: new Date().toISOString(), type, worker_id: meta.worker_id, ... };
    appendFileSync(logPath, JSON.stringify(record) + "\n", "utf8");
  } catch { /* best-effort */ }
}
```

**Value:** After a subagent wedge, the user can `flight_recorder tail` (or read the subagents JSONL directly) to see the full lifecycle: when the worker started, when it first produced output, when it transitioned to `assistant_output_seen`, and when it timed out.

#### 3.5 Vitest/Subprocess Hang Detection

**File:** `~/.pi/agent/local-packages/pi-background-detach/index.ts`  
**What:** Add a `watchdog` action to `pi_background_jobs` that monitors running jobs for stalled output.

```typescript
case "watchdog": {
  const maxStaleMinutes = Number(params.maxStaleMinutes ?? 5);
  const jobs = listJobs();
  const running = jobs.filter(j => !isCompletedJob(j));
  const stalled = [];
  for (const job of running) {
    const files = jobFiles(job);
    const newestMtime = files.reduce((latest, f) => {
      try { return Math.max(latest, fs.statSync(f).mtimeMs); } catch { return latest; }
    }, 0);
    const staleMinutes = (Date.now() - newestMtime) / 60_000;
    if (staleMinutes > maxStaleMinutes) {
      stalled.push({ ...summarizeJob(job), staleMinutes: Math.round(staleMinutes) });
    }
  }
  return { running: running.length, stalled: stalled.length, stalledJobs: stalled };
}
```

**Value:** After a vitest hang, `pi_background_jobs action=watchdog maxStaleMinutes=2` immediately identifies which jobs have stalled output.

### Priority 3: Cross-Server Correlation (Estimated: ~300 lines + design)

#### 3.6 Unified Correlation ID

**Concept:** Assign a `correlation_id` to each subagent dispatch that flows from:
1. Main session's `tool_start` for `external_subagent_start` → flight recorder
2. External-subagents server's `worker_start` event → subagents JSONL
3. Subagent's own `session_start` → subagent's flight recorder

**Implementation:** The `external_subagent_start` tool already accepts a `session_id` parameter. Use this as the correlation key. The main flight recorder's `tool_start` for `external_subagent_start` should include the `session_id` in its details. The external-subagents server should log `session_id` in its `worker_start` event.

#### 3.7 Provider Call Tracing for Subagents

**Concept:** When a subagent's Pi process makes a provider call, the subagent's flight recorder logs `provider_request`/`provider_response` with the subagent's PID. To correlate this back to the main session, add the `worker_id` to the subagent's environment variables (alongside the existing `PI_SESSION_ID`, `PI_PROVIDER`, etc.).

**Implementation:** In `mmx.ts`, when spawning the subagent Pi process, add `PI_WORKER_ID={worker_id}` to the environment. In `flight-recorder.ts`, if `process.env.PI_WORKER_ID` is set, include it in every event record.

---

## 4. Root Cause Hypotheses

### 4.1 Background-Detach Patch Errors ("upstream snippet not found")

**Hypothesis:** A recent `pi update` (likely to 0.81.x) changed the surrounding code in `bash.js` or `agent-session.js` such that the `needle` string in `patch-core.js` no longer matches. The `pi_harness_doctor` output confirms: `patchStatus.errors: ["bash.js tool execute detach: upstream snippet not found", "bash.js tool execute background result: upstream snippet not found"]`. This means the two inline patches named "bash.js tool execute detach" and "bash.js tool execute background result" have needles that don't match the current upstream `bash.js` content.

**Evidence:** The doctor output shows `patchStatus.installed: false` with exactly these two errors. The other ~20 inline patches in `patch-core.js` succeeded (their markers are present), so the upstream change was localized to the bash tool's execute function.

**Likely fix:** Update the two needle strings in `patch-core.js` to match the current upstream `bash.js` content. The actual feature (backgrounding) still works because the *marker* (`_ctx?.detachSignal,`) is present — the patches were already applied previously and survived. The error fires because `ensureBackgroundDetachPatch()` re-checks needles on every startup, and the upstream file has drifted.

### 4.2 Subagent Workers Hanging with No Output

**Hypothesis:** This is a **multi-cause** issue with at least three contributing factors (based on the documented wedge history in `pi-subagent-arg-transport-drop-wedge.md`):

1. **Tool-call arg-transport drop (Wedge-4):** The `proxy.js toolcall_end` missing re-parse caused args to arrive as `{}`. This was FIXED by `pi-proxy-toolcall-end-reparse`, but if the patch was overwritten by a `pi update`, it would recur.
2. **Compaction.js SyntaxError (Bug-3):** The non-idempotent `pi-prompt-budget-guard` write created a half-written `compaction.js` during subagent Pi startup. This was FIXED but could recur if a new extension writes to `compaction.js`.
3. **Model-intrinsic behavior:** Some models (GLM-5.2 on NVIDIA NIM) emit reasoning tokens without function-call envelopes under high load. This is a provider-level issue, not a harness bug.

**Current mitigations:** The `pi-proxy-toolcall-end-reparse` local package auto-applies on every Pi startup. The `pi-prompt-budget-guard` idempotency fix is durable. The `FORCE_REASONING_DEFAULT` flag in the external-subagents server ensures reasoning-capable models get reasoning enabled.

### 4.3 `npx vitest run` Hanging

**Hypothesis:** Most likely caused by **orphaned worker processes** from a previous test run that hold port locks or file locks. The vitest test runner spawns worker threads/processes; if the parent is killed (e.g., by a Pi timeout), the children may survive as orphans. On Windows, `taskkill /F /T /PID` is used to kill process trees, but if the process tree was not fully tracked (e.g., the child spawned via a different shell), orphans survive.

**Contributing factor:** The semantic-explorer repo's test suite (`vitest run`) runs ~50+ tests; if any test opens a port (e.g., a mock HTTP server for the PHP API fallback) and doesn't clean up, subsequent runs hang waiting for the port.

**Evidence from flight recorder:** The tool job log shows `Command timed out after 120 seconds` for `npx vitest run` — consistent with a port-lock hang rather than a slow test.

### 4.4 Subagent Worker Timeout at 900s

**Hypothesis:** The worker was dispatched with `timeout_seconds: 900` (or the default timeout). The worker's model produced output (the `output_state` shows `assistant_output_seen`) but then went silent — likely stuck in a reasoning loop or waiting for a provider response that never completed. The external-subagents server's polling loop detected no activity for 900s and killed the process tree.

**Contributing factor:** Free-tier models (NVIDIA NIM, OpenRouter free) have rate limits and cold-start delays. A worker dispatched on a free model may receive a 429 response, wait for retry-after, receive another 429, and eventually exhaust its timeout without producing meaningful output.

---

## 5. Optional: Proof-of-Concept — Subprocess Watchdog Script

A minimal watchdog script that can be run independently to detect orphaned processes:

```javascript
// ~/.pi/agent/scripts/subprocess-watchdog.mjs
// Run: node ~/.pi/agent/scripts/subprocess-watchdog.mjs
// Detects orphaned background jobs and stale processes.

import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const jobsDir = join(tmpdir(), "pi-background-jobs");
const now = Date.now();
const STALE_MS = 5 * 60 * 1000; // 5 minutes

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

const files = readdirSync(jobsDir, { withFileTypes: true });
const stdoutFiles = files.filter(f => f.isFile() && f.name.endsWith(".stdout.log"));

for (const f of stdoutFiles) {
  const jobId = f.name.replace(/\.stdout\.log$/, "");
  const stderrPath = join(jobsDir, `${jobId}.stderr.log`);
  const stat = statSync(join(jobsDir, f.name));
  const ageMs = now - stat.mtimeMs;
  
  if (ageMs < STALE_MS) continue; // recently active, skip
  
  const stderr = readFileSync(stderrPath, "utf8");
  const pidMatch = stderr.match(/pid=(\d+)/);
  if (!pidMatch) continue;
  
  const pid = Number(pidMatch[1]);
  const alive = pidAlive(pid);
  const command = (stderr.match(/\[pi\] command: (.*)/) || [])[1] || "?";
  
  console.log(`${alive ? "⚠️  ORPHAN" : "✅ dead"} ${jobId} pid=${pid} age=${Math.round(ageMs/60000)}m cmd=${command.slice(0, 80)}`);
}
```

---

## 6. Summary Table

| Gap | Current Telemetry | Proposed Addition | Priority | Effort |
|---|---|---|---|---|
| Patch status at startup | `pi_harness_doctor` (on-demand) | Flight recorder `patch_status` event | P1 | ~20 lines |
| Subagent wedge detection | `classifyLast()` (main session only) | Enhanced classification for subagent tools | P1 | ~30 lines |
| Orphaned processes | `pi_background_jobs diagnostics` | `subprocess_health` action + `watchdog` action | P1 | ~60 lines |
| Subagent worker lifecycle | `metadata.json` (per-worker, no JSONL) | `subagents-YYYY-MM-DD.jsonl` event log | P2 | ~150 lines |
| Cross-server correlation | None | Unified `correlation_id` + `PI_WORKER_ID` env | P3 | ~100 lines + design |
| Provider call tracing for subagents | Subagent's own flight recorder (isolated) | `PI_WORKER_ID` in env → main session visibility | P3 | ~50 lines |
| Vitest hang root cause | Tool timeout only | Process tree monitoring + port-lock detection | P2 | ~100 lines |

---

## 7. Key Files to Instrument

| File | What to Add | Why |
|---|---|---|
| `~/.pi/agent/local-packages/pi-background-detach/index.ts` | `patch_status` flight recorder event at startup | Visibility into patch application |
| `~/.pi/agent/extensions/flight-recorder.ts` | Enhanced `classifyLast()` for subagent tools | Detect wedges from main session |
| `~/.pi/agent/local-packages/pi-background-detach/index.ts` | `subprocess_health` + `watchdog` actions | Detect orphaned/stalled processes |
| `~/harness/servers/external-subagents/src/mmx.ts` | Worker lifecycle JSONL events | Full subagent observability |
| `~/.pi/agent/extensions/flight-recorder.ts` | `PI_WORKER_ID` passthrough in events | Cross-server correlation |
| `~/.pi/agent/local-packages/pi-background-detach/scripts/patch-core.js` | Upstream version hash in error messages | Diagnose patch drift faster |
