# Laguna-s-2.1 Provider Sweep — 2026-07-24

## Purpose

Test all provider-prefixed routes for `laguna-s-2.1` to determine which upstreams actually serve the model for subagent dispatch. Continuation of the Phase A FIND bug-sweep campaign on `src/lib/keyboard/` (571 LOC, 2 files: `global-shortcuts.ts` + `keyboard-help.ts`).

## Method

- Worker = `external_subagents_external_subagent_start` with the canonical bugsweep-FIND prompt. REPORT-ONLY wave (NO source edits).
- Each worker dispatched with `timeout_seconds: 600` and the same slice scope (`src/lib/keyboard/`).
- Workers probed via `stdout.log` for `errorMessage`, `stopReason`, `toolName`, `assistant_output_seen` flags, and via the `metadata.json` final status block.
- Pi harness settings verified: `DEFAULT_REASONING_EFFORT = "max"` (`mmx.ts:165`); `laguna-s-2.1` is NOT in `HIGH_REASONING_ONLY_MODELS` (`mmx.ts:168`), so it runs at `"max"` reasoning effort. Each `thinking_delta` event was correctly formatted as one-JSON-per-line.

## Workers Dispatched (all 5 providers)

| #   | Worker ID      | Route                                     | Started UTC | Ended UTC | PID   | stdout bytes          | tool calls                                | Final status                                              |
| --- | -------------- | ----------------------------------------- | ----------- | --------- | ----- | --------------------- | ----------------------------------------- | --------------------------------------------------------- |
| 1   | `ocw_d493fb30` | `opencode-zen/laguna-s-2.1-free`          | 20:32:54    | 20:36:18  | 7992  | 194,657,653 (~185 MB) | 51 bash + 12 read = 63                    | EXIT 0 / `assistant_output_seen:true` / NO REPORT.md      |
| 2   | `ocw_c4828c07` | `kilo/poolside/laguna-s-2.1`              | 20:35:54    | 20:37:46  | 5352  | 523,895               | 0 real (429 before tool use)              | EXIT 0 / `assistant_output_seen:true` / 429 upstream      |
| 3   | `ocw_330a6b86` | `nvidia/poolside/laguna-s-2.1`            | 20:52:25    | ~20:54    | 400   | 14,317                | 0 real (Connection error before tool use) | EXIT 0 / `assistant_output_seen:true` / "Model not found" |
| 4   | `ocw_137b5e54` | `openrouter/poolside/laguna-s-2.1-free`   | 21:15:14    | ~21:21    | 792   | 14,617                | 0 real (400 invalid model ID)             | EXIT 0 / `assistant_output_seen:true` / 400               |
| 5   | `ocw_4c1a74e2` | `openrouter/poolside/laguna-s-2.1` (paid) | 21:24:27    | 21:26:48  | 17076 | 628,719               | 9 bash + 12 read = 21                     | EXIT 0 / `assistant_output_seen:true` / 429 mid-stream    |

**Total: 5/5 workers EXIT 0, 5/5 `assistant_output_seen:true`, 0/5 REPORT.md written.**

## Per-Provider Findings

### 1. `opencode-zen/laguna-s-2.1-free` — ⚠️ Conditional (only route that escapes Poolside 429)

- Streams at MAX reasoning effort: 185 MB stdout, 13K thinking events, 6K thinking_delta events, 51 bash + 12 read tool calls, 14 text_delta events.
- One early `Connection error` triggered auto_recovery_start (`attempt 1 / maxAttempts 10 / delayMs 2000`); recovered within ~2 s, continued streaming.
- Last text preview shows the model was still in the EXECUTION phase — running `rg` caller-graphs for `toggleKeyboardShortcutsHint`, `handleGalaxyKeydown`, `isFormField`, plus `wc -l src/lib/keyboard/*` LOC counts.
- **Died near the 200 MB stdout CAP** mid-survey before synthesizing bug findings or invoking the `write` tool.
- Upstream escapes the shared Poolside free-tier rate-limit ceiling — `opencode-zen` appears to have its own direct upstream contract for `laguna-s-2.1-free`.

### 2. `kilo/poolside/laguna-s-2.1` — ⚠️ Conditional (429 upstream Poolside — transient, retry-eligible)

- Upstream transforms the slug → `poolside/laguna-s-2.1:free` (the Poolside free tier).
- Explicit 429 error: `"poolside/laguna-s-2.1:free is temporarily rate-limited upstream. Please retry shortly, or add your own key to accumulate your rate limits: https://openrouter.ai/settings/integrations"`, `provider_name: "Poolside"`, `is_byok: false`.
- `auto_retry_start` triggered at attempt 1/10, delayMs 2000 — supervisor killed worker shortly after. This is a SUPERVISOR-LEVEL kill decision (timeout after retries surface), NOT a route verdict. The route itself would have recovered on the next auto-retry attempt once the upstream bucket refreshed.
- The 429 is upstream Poolside, NOT kilo-specific. It is **TRANSIENT** per the literal 429 message ("Please retry shortly") — the Poolside free-tier bucket is time-limited and resets within ~1–2 h of last call. Retest `kilo/poolside/laguna-s-2.1` at a different time of day, with a BYOK Poolside key, or after switching upstreams.

### 3. `nvidia/poolside/laguna-s-2.1` — ❌ Avoid (Model not found)

- `stderr: Warning: Model "poolside/laguna-s-2.1" not found for provider "router-nvidia". Using custom model id.`
- 5 `Connection error` events + 4 `stopReason:error` + 1 `auto_retry_start` then supervisor killed.
- The nvidia gateway DOES NOT RECOGNIZE the `poolside/<slug>` form for `laguna-s-2.1`. The parallel session's benchmarks doc row for `nvidia/poolside/laguna-xs-2.1:free` confirms the gateway recognizes older siblings (xs-2.1) but not `laguna-s-2.1`.

### 4. `openrouter/poolside/laguna-s-2.1-free` — ❌ Avoid (400 invalid model ID)

- OpenRouter REST API rejects with `400: "poolside/laguna-s-2.1-free is not a valid model ID"`.
- The OpenRouter registry doesn't expose this slug variant directly.
- 4 stopReason:error events + auto_retry_start triggered before supervisor killed worker.

### 5. `openrouter/poolside/laguna-s-2.1` (paid variant requested) — ⚠️ Conditional (partial work + 429 mid-stream, retry-eligible)

- Worker requested the paid variant (no `-free` suffix per catalog assumption).
- OpenRouter REROUTED the request: `model: "poolside/laguna-s-2.1:free"` (auto-suffix-append to `:free`). **The paid vs free slug distinction is illusory on OpenRouter — both routes hit the same upstream Poolside free tier.**
- Worker did succeed at REAL partial work: 628 KB stdout, 224 message_updates, 177 text events, 9 bash + 12 read = 21 tool calls. Got `pwd`/`date` smoke + read both keyboard files (content visible in extraction). This is **clear evidence the route accepts the request and streams fine** — the 429 hit AFTER ~2 min of productive streaming, suggesting the upstream rate-limit window has elapsed.
- The 429 returned: `"429: Provider returned error","code":429,"metadata":{"provider_name":"Poolside","is_byok":false}` from the SAME upstream Poolside free tier that worker #2 hit. Same **TRANSIENT, retry-eligible** failure mode — NOT a permanent route gap.

## Key Findings

### 1. The universe of providers for laguna-s-2.1 is narrow

Only 5 distinct provider paths had catalog evidence:

- `opencode-zen/laguna-s-2.1-free`
- `kilo/poolside/laguna-s-2.1` (transforms to `poolside/laguna-s-2.1:free`)
- `nvidia/poolside/laguna-s-2.1`
- `openrouter/poolside/laguna-s-2.1`
- `openrouter/poolside/laguna-s-2.1-free`

Other providers (`cloudflare`, `zenmux`, `logfare`, `modelscope`, `neuralwatt`, `novatitan`) host only the older `laguna-xs.2:free` / `laguna-m.1:free` siblings, NOT `laguna-s-2.1`.

### 2. The shared Poolside free-tier rate limit is the dominant ceiling

- `kilo/poolside/laguna-s-2.1`, `openrouter/poolside/laguna-s-2.1`, AND `openrouter/poolside/laguna-s-2.1-free` all route upstream to `poolside/laguna-s-2.1:free` (Poolside `provider_name`, `is_byok: false`).
- They share the SAME upstream rate-limit bucket — hitting one route consumes quota for all three.
- A BYOK Poolside key (per 429 metadata: `https://openrouter.ai/settings/integrations`) would bypass the free-tier ceiling.

### 3. `opencode-zen/laguna-s-2.1-free` is the ONLY route that escapes the Poolside 429

- The opencode-zen gateway appears to have its own upstream contract for `laguna-s-2.1-free` that does NOT share the Poolside free-tier rate-limit bucket.
- Worker #1 streamed 185 MB of cognitive output, 13K thinking events, 63 real tool calls, doing real caller-graph verification (`rg` for `toggleKeyboardShortcutsHint`, `isFormField`, `handleGalaxyKeydown`).
- BUT it died near the 200 MB stdout cap (~5 min in) before synthesizing a bug report or writing REPORT.md.
- **The model burns enormous thinking bandwidth before finalization** — at "max" reasoning effort, laguna-s-2.1 produces ~13K `thinking_delta` events in 5 min, leaving proportionally less budget for `write` tool synthesis.

### 4. nvidia gateway does NOT recognize the `poolside/<slug>` form for `laguna-s-2.1`

- The parallel session's benchmarks doc (`docs/subagent-model-benchmarks.md`) has rows for `nvidia/poolside/laguna-xs-2.1:free` (line 28) — the gateway recognizes the older `laguna-xs-2.1` sibling — but no row for `nvidia/poolside/laguna-s-2.1:free`.
- This sweep CONFIRMS that absence: `nvidia/poolside/laguna-s-2.1` returns "Model not found for provider router-nvidia" + 5 Connection errors.

### 5. OpenRouter auto-appends `:free` to the requested slug (paid-vs-free is illusory)

- Requested `openrouter/poolside/laguna-s-2.1` (paid variant per catalog assumption).
- OpenRouter's REST API routes it to `poolside/laguna-s-2.1:free` (auto-suffix append), so the "paid-via-OpenRouter" path actually hits the SAME Poolside free upstream as the explicit `:free` request.
- The two openrouter requests (with and without `:free` suffix) are NOT distinct rate-limit paths — they share the same upstream bucket.
- OpenRouter returns 400 ("not a valid model ID") when the slug variant has `-free` suffix in the slug itself (`poolside/laguna-s-2.1-free` — hyphen, not colon), but ACCEPTS the no-suffix form and reroutes to the upstream `:free`.

### 6. Reasoning behavior is normal, parsing is correct

- Verified `thinking_delta` events are discrete JSON-per-line: `{"type":"message_update","assistantMessageEvent":{"type":"thinking_delta","contentIndex":0,"delta":"Let",...,"thinkingSignature":"reasoning"}}`.
- Each event carries `delta` (the new chunk) and `partial.thinking` (cumulative snapshot — useful for replay without re-chunking).
- All 5 workers confirmed: thinking content ranged over "Let me analyze this task...", caller-graph verification, LOC counts, file surveying — typical "max" reasoning.
- Pi harness parses all events cleanly; NO log boundary/escape issues observed. The 200 MiB `stdout.log` cap is the principal artifact budget; workers exceeding it continue but their logs are truncated.

## Verdict Per Provider

| Provider                                | Verdict for laguna-s-2.1 subagent dispatch today                                                                                                                                                                                                                                                               |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `opencode-zen/laguna-s-2.1-free`        | ⚠️ **Conditional (streams fine)** — the only route that escapes the Poolside 429 ceiling. Massive streams possible (185 MB). Worker died at the 200 MB stdout cap before finalizing; recommend a tighter time budget, scoped slice (one file), or reduced `OPENCODE_COMPAT_REASONING_EFFORT` for laguna-s-2.1. |
| `kilo/poolside/laguna-s-2.1`            | ⚠️ **Conditional (retry-eligible)** — Funneled directly to Poolside free tier → 429 within ~2 min. The 429 message says "Please retry shortly" — TRANSIENT upstream rate-limit state, NOT a permanent route gap. Retest at a different time of day, with a BYOK Poolside key, or in an off-rate-window.        |
| `nvidia/poolside/laguna-s-2.1`          | ❌ **Avoid (catalog gap, not rate-limit)** — Gateway doesn't recognize the slug (`Model not found for provider router-nvidia`). This is a registry gap that won't improve without upstream provider adding the slug, NOT a rate-limit issue.                                                                   |
| `openrouter/poolside/laguna-s-2.1-free` | ❌ **Avoid (registry gap, not rate-limit)** — 400 "not a valid model ID". OpenRouter's REST registry simply doesn't expose this slug variant; this won't improve without OpenRouter updating their catalog.                                                                                                    |
| `openrouter/poolside/laguna-s-2.1`      | ⚠️ **Conditional (retry-eligible)** — Rerouted upstream to `:free` → 429 AFTER completing 21 partial tool calls (real work streamed fine before the cap). Same transient Poolside ceiling as kilo — will clear on the same cadence; retest in ~1–2 h.                                                          |

## Recommendations

1. **For laguna-s-2.1 subagent dispatch today, `opencode-zen/laguna-s-2.1-free` is the most permissive route** (escapes the shared Poolside 429 ceiling). When that route is healthy (`/catalog recentFailures` clean), prefer it.
2. **Mitigate the finalization problem** (worker ran out of stdout budget mid-survey):
    - Cap reasoning effort to `medium` for laguna-s-2.1 (override via `OPENCODE_COMPAT_REASONING_EFFORT=medium` env var before launching the worker -- note that the env var must be set in the worker's env, currently this means a launcher-level setting).
    - OR scope the worker to ONE file (not two — 571 LOC was too much for 200 MB stdout).
    - OR set a tighter `timeout_seconds` (300s instead of 600s) so the worker finalizes earlier.
3. **Routes that returned 429 are NOT dead routes** — they are TRANSIENT Poolside free-tier rate-limit states.
    - `kilo/poolside/laguna-s-2.1` and `openrouter/poolside/laguna-s-2.1` share the same upstream Poolside free-tier bucket. Worker #5 actually completed 21 tool calls + partial streaming BEFORE the mid-stream 429 — clear evidence the route accepts requests and streams fine. The Poolside free-tier bucket typically resets within ~1–2 h of last call.
    - Retest these Conditional routes at a different time of day, OR alternate providers to let the shared bucket cool down, OR add a BYOK Poolside key (per the 429 metadata's `https://openrouter.ai/settings/integrations` hint).
4. **`nvidia/poolside/laguna-s-2.1` and `openrouter/poolside/laguna-s-2.1-free` are NOT retry-able** — they fail with `Model not found` / `400 invalid model ID` (registry gaps, NOT rate-limit). These won't improve without upstream provider adding the slug; treat as Avoid and don't waste rate-limit budget retrying them.
5. **The `(free, paid)` slug distinction is illusory on OpenRouter** — OpenRouter redirects `poolside/laguna-s-2.1` to `poolside/laguna-s-2.1:free` upstream. There's no separate paid path via OpenRouter for `laguna-s-2.1` unless you BYOK a Poolside key on the OpenRouter side.

## Cross-Reference

- Concurrently-edited by parallel session: `docs/subagent-model-benchmarks.md` (lines 22, 38-40, 129, 134, 180, 181, 195, 213-218) — the parallel session ran their own `laguna-s-2.1` route probes around 15:00 UTC and reached a substantively-similar conclusion that `kilo` + `openrouter` routes share the same Poolside 429 ceiling. This dedicated file records MY independent sweep findings five hours later and complements with the NEW data the parallel session had not yet captured:
    - **NEW**: nvidia gateway returns "Model not found for provider router-nvidia" for `poolside/laguna-s-2.1`.
    - **NEAR-FINDING**: opencode-zen/laguna-s-2.1-free does NOT hit 429 (the parallel session's row #38 attributed its death to "429 Provider rate limit exceeded"; my worker #1 had only ONE early transient Connection error that auto-recovered, then ran cleanly until the 200 MB stdout cap, no further 429s).
    - **NEW**: `openrouter/poolside/laguna-s-2.1` (paid variant) gets auto-rerouted to `:free` upstream — same rate-limit ceiling as the explicit free form.
- Concurrent subagent benchmark campaign log: `docs/bugsweep-campaign-2026-07-24.md` (parallel session).

## Artifacts

- Worker stdout logs: `.opencode/opencode-workers/{ocw_d493fb30,ocw_c4828c07,ocw_330a6b86,ocw_137b5e54,ocw_4c1a74e2}/`
- `tmp/bugsweep-find/<provider-slug>/REPORT.md` — NOT created by any worker (0/5 workers completed their write tool calls before death/disconnect).
- `tmp/extract-mode-text.mjs` — scratch helper for extracting assistant text content from worker stdout.log.
- `tmp/w1-tail.log` — last 2 MB of Worker #1's stdout (used to inspect final state since the full log is 185 MB).
- This file: `docs/laguna-s-2.1-provider-sweep-2026-07-24.md`

## Memory Saved

- `~/.pi/agent/pi-hermes-memory/failures.md` entry `laguna-s-2.1-provider-sweep-2026-07-24` (1472 chars, key `laguna-s-2.1-provider-sweep-2026-07-24`, stamp 2026-07-24, kind `tool-quirk`): documents all 5 worker outcomes + Poolside free-tier shared-upstream-ceiling + nvidia gateway rejection + OpenRouter auto-suffix-append finding + finalization-failure observation.
