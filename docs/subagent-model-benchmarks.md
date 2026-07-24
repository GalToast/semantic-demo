# Subagent Model Benchmarks — Semantic Explorer

Live tracker of which provider/model routes work reliably for subagent coding tasks in this repo. Update this after every meaningful dispatch or health-check wave.

## Legend

- **Smoke** — `node scripts/model-health-check.mjs --smoke ...` result (HTTP 200 + non-empty response).
- **Subagent** — Actual `external_subagent_start` dispatch result for a real coding task.
- **Rating** — Subjective, task-type dependent:
    - ✅ Reliable — multiple successful coding tasks, low error rate.
    - ⚠️ Conditional — works for some tasks or intermittently; know the caveats.
    - ❌ Avoid — repeated failures in this repo right now.

## Free / Shadow Routes

| Provider                | Model                           | Smoke     | Subagent                                  | Rating         | Notes                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------- | ------------------------------- | --------- | ----------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| logfare                 | `deepseek-v4-pro`               | ✅ 8/8    | ✅ Yes                                    | ✅ Reliable    | Default model as of 2026-07-23. Used for Filters, FocusCard header, default-route test, and Header extraction. ~2–6 s response. One 900 s timeout on a large JourneyChrome extraction; partial edits landed and passed `check:svelte`.                                                                                                                                                |
| logfare                 | `deepseek-v4-flash`             | ✅        | ⚠️ 429 rate-limit                         | ✅ Reliable    | 2026-07-23: read-only subagent task hit `429 Logfare upstream rate-limited model deepseek-v4-flash` immediately after the prompt. Pro variant works; flash is rate-limited at the moment. Retest later.                                                                                                                                                                               |
| logfare                 | `glm-5.2`                       | ✅        | ✅ (main lane)                            | ✅ Reliable    | Also used as main-lane provider via router-logfare.                                                                                                                                                                                                                                                                                                                                   |
| kilo                    | `poolside/laguna-m.1:free`      | ✅ 9/9    | ❌ Connection error                       | ❌ Avoid       | 2026-07-23: previously hit 429; now even a simple read-only smoke task fails with connection error. Not viable right now.                                                                                                                                                                                                                                                             |
| openrouter              | `poolside/laguna-s-2.1:free`    | ✅        | ❌                                        | ⚠️ Conditional | Laguna free lanes have reported empty-args tool_call + rate-limit issues per memory. Avoid for subagents.                                                                                                                                                                                                                                                                             |
| openrouter              | `poolside/laguna-xs-2.1:free`   | ✅        | ❌                                        | ⚠️ Conditional | Same Laguna family caveats.                                                                                                                                                                                                                                                                                                                                                           |
| cloudflare              | `@cf/openai/gpt-oss-20b`        | ✅ 15/16  | ❌ Connection error                       | ❌ Avoid       | 2026-07-23: even a simple read-only smoke task failed with connection error. Not viable for subagents right now.                                                                                                                                                                                                                                                                      |
| cloudflare              | `@cf/moonshotai/kimi-k2.6`      | ✅ 15/16  | ❌ Connection error                       | ❌ Avoid       | 2026-07-23: subagent dispatch failed with connection error immediately after the prompt. Same Cloudflare Workers AI connectivity issue as `gpt-oss-20b`.                                                                                                                                                                                                                              |
| modelscope              | `deepseek-ai/DeepSeek-V4-Flash` | ✅ 22/48  | ❌ 429 insufficient quota                 | ❌ Avoid       | 2026-07-23: health check passes, but subagent dispatch fails with `429 insufficient_quota` immediately after the prompt. No real tool-use possible.                                                                                                                                                                                                                                   |
| zydit                   | `openai/gpt-oss-20b`            | ✅ 35/116 | ❌ JSON parse error                       | ❌ Avoid       | 2026-07-23: subagent dispatch reached the model, but the pi-ai minimax-thinking patch (`parseStreamingJson`) failed with `malformed partial JSON: "cd"`. The worker aborted before any edits. Likely a streaming-format incompatibility; avoid until the patch is adjusted.                                                                                                           |
| zydit-v4                | `openai/gpt-5.5`                | ✅        | ❌ Model not found                        | ❌ Avoid       | 2026-07-23: subagent dispatch failed with `Model "router-zydit-v4/openai/gpt-5.5" not found`. The curated ref in `mmx.ts` points to a model not present in the live catalog. Do not use.                                                                                                                                                                                              |
| zenmux                  | `z-ai/glm-4.7-flash-free`       | ✅ 2/3    | ⚠️ Partial / 429 rate-limit               | ⚠️ Conditional | 2026-07-23: real subagent dispatch succeeded and created `src/lib/components/focus/SelectedMatchNarrative.svelte` (InfoPanel extraction), but hit ZenMux free usage rate-limit (429) before completing parent integration and verification. Viable only for small, fast tasks.                                                                                                        |
| nvidia                  | `deepseek-ai/deepseek-v4-flash` | ✅ 23/115 | ❌ 120 s timeout                          | ⚠️ Conditional | 2026-07-23: read-only subagent task got first assistant output at ~87 s but never completed the write step before the 120 s timeout. Too slow/unreliable for interactive subagent use.                                                                                                                                                                                                |
| nvidia                  | `google/gemma-2-2b-it`          | ✅ 23/115 | ❌ 422 tool/schema error                  | ⚠️ Conditional | 2026-07-23: subagent dispatch rejected the Pi harness request with `body -> tools: Extra inputs are not permitted` and `max_tokens` validation errors. This model/serving endpoint does not support the tool-calling schema the harness requires.                                                                                                                                     |
| nvidia                  | `poolside/laguna-xs-2.1`        | ✅ 22/115 | ⚠️ Partial / 900 s timeout                | ⚠️ Conditional | 2026-07-23: real subagent dispatch succeeded and created `src/lib/components/LegendClusterList.svelte` (204 LOC), but the worker timed out after 900 s before integrating the child into `Legend.svelte` and running verification. Incurs cost; not reliable for large tasks under the 900 s budget.                                                                                  |
| opencode-zen (zen free) | `deepseek-v4-flash-free`        | ✅ 5/5    | ✅ L1/L2/L4/L5 sweep completed 2026-07-24 | ✅ Reliable    | **2026-07-24 campaign: L1/L2/L4/L5 all completed on retry after earlier transient connection failures.** L1=2HIGH/3MED/2LOW, L2=4HIGH/8MED/7LOW, L4=4HIGH/2MED/2LOW, L5=completed with stale-test findings. Pin sweep dispatch to this model. Earlier-session 'stuck / no output' verdicts superseded — the empty-args wedge fix + LSP-daemon stability may have been prerequisites.) |
| opencode-zen (zen free) | `north-mini-code-free`          | ✅ 5/5    | ❌ Hallucinated DONE text                 | ❌ Avoid       | **2026-07-23 sweep campaign: 3/4 hallucination.** L1 att1 + L3 att3 + L4 att1 + L4 att2 all streamed a `"DONE: <path>"` text reply WITHOUT emitting the `write` tool_call — stdout grep for `"toolName":"write"` returned zero matches in each. Only L1 att1 produced a partial analysis (no write). Definitive ❌ Avoid for substantive dispatch; the model fabricates completion.   |
| opencode-zen (zen free) | `nemotron-3-ultra-free`         | ✅ 5/5    | ❌ Streaming failed (0 tokens)            | ❌ Avoid       | **2026-07-23 sweep campaign (L5 att2):** `errorMessage: Streaming response failed` — upstream returned 0 assistant tokens; harness recorded prompt-echo tool-results but no model output. Quick synchronous failure on cold-start.                                                                                                                                                    |
| opencode-zen (zen free) | `nemotron-3-super-free`         | ✅ 5/5    | ❌ 401 Model not supported                | ❌ Avoid       | **2026-07-23 sweep campaign (L3 att2):** `401 ModelError: Model nemotron-3-super-free is not supported` synchronously (~2 s after dispatch). **STALE launcher allowlist entry** — listed by `external_subagents_external_subagent_free_models` but the OpenCode Zen upstream endpoint rejects it.                                                                                     |
| opencode-zen (zen free) | `qwen3.6-plus-free`             | ✅ 5/5    | ❌ 401 Model not supported                | ❌ Avoid       | **2026-07-23 sweep campaign (L5 att3):** `401 ModelError: Model qwen3.6-plus-free is not supported` synchronously. Identical STALE-allowlist-entry failure mode as `nemotron-3-super-free`. Alias `opencode/qwen3.6-plus-free`.                                                                                                                                                       |
| opencode-zen (zen free) | `laguna-s-2.1-free`             | ✅ 5/5    | ❌ 429 rate-limit                         | ⚠️ Conditional | **2026-07-24:** subagent started, read `Header.svelte`, emitted thinking, then hit `429 Provider rate limit exceeded` from Poolside before completing the report. Rate-limit is upstream, not provider-specific.                                                                                                                                                                      |
| kilo                    | `poolside/laguna-s-2.1:free`    | ✅ 5/5    | ❌ 429 rate-limit                         | ⚠️ Conditional | **2026-07-24:** immediate `429` from Poolside: `poolside/laguna-s-2.1:free is temporarily rate-limited upstream`. Same upstream rate-limit as opencode-zen route.                                                                                                                                                                                                                     |
| openrouter              | `poolside/laguna-s-2.1:free`    | ✅ 5/5    | ⚠️ Indirect verification only             | ⚠️ Conditional | **2026-07-24:** bench-verify worker reported success, but that worker itself ran on `deepseek-v4-flash-free` — it did NOT actually dispatch on `poolside/laguna-s-2.1:free`. Direct subagent dispatch on laguna-s-2.1-free has NOT been retested today. Earlier 429 rate-limit from Poolside upstream still stands.                                                                   |
| opencode-zen (zen free) | `ling-3.0-flash-free`           | ✅ 5/5    | ❌ Indirect verification only             | ❌ Avoid       | **2026-07-24:** bench-verify worker reported success, but that worker itself ran on `deepseek-v4-flash-free` — it did NOT actually dispatch on `ling-3.0-flash-free`. Direct subagent dispatch on ling-3.0-flash-free has NOT been retested today. Earlier verdicts (opencode-zen 300s timeout, kilo connection error, openrouter invalid model ID) still stand.                      |
| kilo                    | `ling-3.0-flash-free`           | ✅ 5/5    | ❌ Connection error                       | ❌ Avoid       | **2026-07-24:** upstream `Connection error.` on first assistant turn. Same connectivity pattern as many other routes today.                                                                                                                                                                                                                                                           |
| openrouter              | `ling-3.0-flash-free`           | ✅ 5/5    | ❌ 400 invalid model ID                   | ❌ Avoid       | **2026-07-24:** upstream returned `400: ling-3.0-flash-free is not a valid model ID`. OpenRouter does not recognize this slug; route is dead from this provider.                                                                                                                                                                                                                      |
| opencode-zen (zen free) | `mimo-v2.5-free`                | ✅ 5/5    | ❌ Stream ended mid-inv                   | ❌ Avoid       | **2026-07-23 sweep campaign (L3 att1):** 1206 bash invocations + 72 reads, then `Stream ended without finish_reason` mid-investigation. Heavy exploratory churn stops short of report delivery. Distinct from the earlier '500s / connection errors' recorded on 2026-07-23 — newer failure mode is bench-style run-stop rather than server 500s.                                     |
| zen (OpenCode Zen)      | `mimo-v2.5-free`                | ❌ Flaky  | ❌                                        | ❌ Avoid       | Repeated 500s / connection errors. Default was patched away on 2026-07-23.                                                                                                                                                                                                                                                                                                            |

## Multi-Provider Free Models Needing Allow-List Updates

| Model                 | Currently Exposed From | Missing Provider Routes | Action Needed                                                                                                                                                              |
| --------------------- | ---------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ling-3.0-flash-free` | `opencode-zen`         | `kilo`, `openrouter`    | All provider routes currently fail: opencode-zen times out, kilo returns connection error, openrouter returns invalid model ID. Revisit after upstream stability improves. |

## Paid / Allowed-Paid Routes

| Provider       | Model               | Smoke | Subagent                    | Rating   | Notes                                                                                                                                                                                                                                                        |
| -------------- | ------------------- | ----- | --------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| opencode-go    | `mimo-v2.5`         | N/A   | ❌ 401 Insufficient balance | ❌ Avoid | 2026-07-23: subagent dispatch failed immediately with `CreditsError: Insufficient balance`. Not usable until billing is topped up. Previously reliable paid route.                                                                                           |
| opencode-go    | `deepseek-v4-flash` | N/A   | ❌ Stuck / no output        | ❌ Avoid | 2026-07-23: subagent dispatch launched but produced no assistant output for 200+ seconds. Possibly the same balance/auth issue as `mimo-v2.5`, or an upstream hang. Canceled; do not use until retested.                                                     |
| minimax-direct | `MiniMax-M3`        | N/A   | ❌ 429 Token Plan limit     | ❌ Avoid | **2026-07-24:** all four lane retries failed immediately with `429 Token Plan usage limit reached: Upgrade your Token Plan or purchase Credits for more usage. (2056)`. Previously reliable paid route; currently unusable until plan/credits are increased. |

## Main Lane Providers (Not Subagents)

| Provider             | Model            | Status    | Notes                                                                                         |
| -------------------- | ---------------- | --------- | --------------------------------------------------------------------------------------------- |
| direct-freeinference | `kimi-k2.7-code` | ❌ Flaky  | `Provider finish_reason: unexpected_state` on 2026-07-23. Avoid for main lane until resolved. |
| router-logfare       | `glm-5.2`        | ✅ Stable | Main lane route used during this session.                                                     |
| router-nvidia        | `z-ai/glm-5.2`   | ✅ Stable | Parallel session / worker route proven.                                                       |

## Lessons / Rules of Thumb

1. **Laguna free lanes are risky for subagents.** Both `kilo/poolside/laguna-m.1:free` and `openrouter/poolside/laguna-s-2.1-free` hit upstream rate limits or emit empty-args tool calls in this repo.
2. **Cloudflare Workers AI health-checks pass but subagent dispatch is unproven.** `gpt-oss-20b` failed on connection; retest before delegating real work.
3. **Logfare is the current free-route workhorse.** `deepseek-v4-pro` and `deepseek-v4-flash` have the most subagent success in this repo today. Use `timeout_seconds` ≥ 900 for large extractions; one JourneyChrome task timed out after 900 s with partial edits that still passed `check:svelte` and `test:contract`.
4. **Paid OpenCode routes are currently unusable.** Both `opencode-go/mimo-v2.5` and `opencode-go/deepseek-v4-flash` failed on 2026-07-23 (insufficient balance / no output). Do not depend on them until billing or upstream connectivity is restored.
5. **Free routes have strict rate limits.** `zenmux/z-ai/glm-4.7-flash-free` and `kilo/poolside/laguna-m.1:free` hit usage/rate limits during real tasks. Use them only for small, quick work; prefer Logfare for multi-step extractions.
6. **Verify completion claims.** A worker may report success with fabricated diff stats. Always verify via `git diff --stat` and `grep '"toolName":"write"' stdout.log` **AND stat the deliverable file on disk** — subagents may stream `"DONE: <path>"` text without ever emitting the `write` tool_call (the `north-mini-code-free` hallucination pattern: 3/4 sweep dispatches fabricated completion text-only today, all with `status:completed` + `output_state:assistant_output_seen`).
7. **Use long timeouts.** First assistant output can take 30–60 s for some routes; set `timeout_seconds` ≥ 900 for real tasks.
8. **Provider-qualified refs bypass OpenCode Zen.** Bare free IDs like `mimo-v2.5-free` route to `router-opencode-zen`; use `logfare/...`, `kilo/...`, `nvidia/...`, etc.

## Open Questions

- Does `zenmux/z-ai/glm-4.7-flash-free` complete a real subagent coding task and pass verification?
- Does `nvidia/poolside/laguna-xs-2.1` complete a real subagent coding task and pass verification?
- Can `opencode-go` paid routes be restored once balance/auth issues are resolved?
- Are the remaining untested free routes (`cloudflare/@cf/openai/gpt-oss-20b`, `modelscope/deepseek-ai/DeepSeek-V4-Flash`) viable after retry or with different prompts?

Next health-check/subagent wave should answer these and update the table.

## Health-Check Wave 2026-07-23 (15 s timeout, limit 10 per provider)

Run: `node scripts/model-health-check.mjs --smoke --all-safe --limit=10 --timeout=15000`

Quick connectivity snapshot across providers:

| Provider           | Catalog | Free/shadow tested | Smoke OK | Smoke Fail | Notes                                                                 |
| ------------------ | ------: | -----------------: | -------: | ---------: | --------------------------------------------------------------------- |
| zen (opencode-zen) |      57 |                  5 |        5 |          0 | All free Zen models pass smoke; subagent tool-use still being tested. |
| nvidia             |     119 |                115 |       23 |         92 | Many 404s; some deepseek/gemma/llama models pass.                     |
| modelscope         |      50 |                 48 |       22 |         26 | DeepSeek V3/V4 family mostly passes.                                  |
| kilo               |     351 |                 10 |        6 |          4 | Laguna free lanes mixed.                                              |
| openrouter         |     343 |                 14 |       10 |          4 | Free Cohere/Nvidia/Google models pass.                                |
| freemodel          |       3 |                  3 |        0 |          3 | All fail.                                                             |
| logfare            |       8 |                  8 |        7 |          1 | Proven subagent workhorse.                                            |
| zydit              |     120 |                116 |        9 |        107 | Sparse passes.                                                        |
| cloudflare         |      16 |                 16 |       15 |          1 | Workers AI free models mostly pass smoke.                             |
| zenmux             |     147 |                  3 |        0 |          3 | Rate-limited even in smoke.                                           |

See `tmp/model-health/health-2026-07-23T18-43-15-179Z.json` for full per-model results.

### Read-only DOM-contract audit task (2026-07-23)

Task: read `src/components/ThreadInspector.svelte`, list DOM ids/classes, and write a report to `tmp/subagent-benchmark-reports/<model>.md`.

| Provider     | Model                                          | Status                            | Elapsed | Notes                                                                                                                                                                                                                    |
| ------------ | ---------------------------------------------- | --------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| logfare      | `deepseek-v4-pro`                              | ✅ completed                      | ~57 s   | Read file, wrote correct report with 8 DOM IDs and 16 classes.                                                                                                                                                           |
| logfare      | `deepseek-v4-flash`                            | ⚠️ 429 rate-limit                 | ~32 s   | Prompt delivered; Logfare returned upstream rate-limit for the flash variant. Pro variant succeeded.                                                                                                                     |
| nvidia       | `deepseek-ai/deepseek-v4-flash`                | ❌ 120 s timeout                  | ~120 s  | First assistant output at ~87 s, but never completed the write step. Too slow/unreliable.                                                                                                                                |
| nvidia       | `google/gemma-2-2b-it`                         | ❌ 422 tool/schema error          | ~25 s   | Model endpoint rejects tool-calling schema (`tools` extra inputs not permitted, `max_tokens` too high). Not compatible with Pi harness.                                                                                  |
| openrouter   | `inclusionai/ling-3.0-flash:free`              | ❌ MCP hang / canceled            | ~45 s   | Worker stuck at `MCP: 0/7 servers` for >20 s; canceled to avoid blocking. May retest after MCP server cleanup.                                                                                                           |
| opencode-zen | `deepseek-v4-flash-free`                       | ❌ no output / canceled           | ~60 s   | Smoke passes but subagent never produced assistant output in either json or rpc/live_steer mode.                                                                                                                         |
| cloudflare   | `@cf/moonshotai/kimi-k2.6`                     | ❌ connection error               | ~40 s   | Prompt delivered; model returned connection error before any tool call.                                                                                                                                                  |
| cloudflare   | `@cf/openai/gpt-oss-20b`                       | ❌ no assistant output / canceled | ~50 s   | Worker initialized but produced no assistant output within 45 s of prompt delivery; canceled.                                                                                                                            |
| logfare      | `deepseek-v4-pro` (ThreadInspector extraction) | ❌ MCP server wedge / canceled    | ~30 s   | Multiple stale `external-subagents` bun MCP servers (PIDs 14564, 19512, 22132, 25436) were running and the gateway could not reliably connect; the extraction task was completed manually in the main lane.              |
| nvidia       | `nemotron-3-super-120b-a12b`                   | ❌ 404 before tool call           | ~30 s   | Health-check passed, but subagent dispatch returned `404 page not found` from the upstream router before any tool call. Not available for subagent work.                                                                 |
| openrouter   | `cohere/north-mini-code:free`                  | ✅ completed                      | ~45 s   | Read file, wrote report. Used `find` to look for test references; report is correct but brief.                                                                                                                           |
| mistral      | `mistral/mistral-medium-latest`                | ❌ model not found                | ~6 s    | `router-mistral/mistral-medium-latest` not found by the Pi harness. The doctor's recommended launch ref is stale.                                                                                                        |
| nvidia       | `mistralai/mistral-small-4-119b-2603`          | ❌ model not found                | ~6 s    | `router-nvidia/mistralai/mistral-small-4-119b-2603` not found by the Pi harness, despite appearing in health-check catalog.                                                                                              |
| kilo         | `poolside/laguna-s-2.1:free`                   | ⚠️ partial                        | ~120 s  | Complex DOM-contract task timed out before any tool call, but a simple read-only smoke task (`tmp/subagent-read-test.txt`) succeeded and echoed the file contents. Laguna is usable only for light, low-latency prompts. |
| openrouter   | `qwen/qwen3.6-flash`                           | ❌ 402 insufficient credits       | ~35 s   | Prompt delivered; upstream returned `Insufficient credits` before any tool call. The `:free` suffix is required on this route.                                                                                           |
| kilo         | `qwen/qwen3.6-flash`                           | ❌ connection error               | ~45 s   | Prompt delivered; worker auto-retried 3×, then upstream connection error before any tool call.                                                                                                                           |
| logfare      | `glm-5.2`                                      | ❌ no assistant output / canceled | ~40 s   | Worker started and daemon launched, but no assistant output appeared after 35 s; canceled.                                                                                                                               |
| logfare      | `kimi-k2.7-code`                               | ❌ no assistant output / canceled | ~55 s   | Prompt delivered; no assistant output after 45 s; canceled.                                                                                                                                                              |
| openrouter   | `poolside/laguna-s-2.1:free`                   | ❌ 429 upstream rate-limit        | ~40 s   | Prompt delivered; upstream Poolside returned `temporarily rate-limited`. Auto-retrying.                                                                                                                                  |
| modelscope   | `deepseek-ai/DeepSeek-V4-Flash`                | ❌ 429 insufficient quota         | ~52 s   | Prompt delivered; model returned quota error before any tool call.                                                                                                                                                       |

## Sweep Campaign 2026-07-23 — Aggregate Findings

The campaign-doc `docs/subagent-bench-sweep-campaign-2026-07-23.md` records 17 attempts across 6 investigation lanes (engine sync / extract seam / CSS surface / search layer / test-strategy gap / window-global) at HEAD `743a6bb0`.

**Aggregate model-outcome verdicts today:**

| Model                    | Dispatch attempts today                                      | Successful writes | Failure pattern                                                      | Verdict     |
| ------------------------ | ------------------------------------------------------------ | ----------------- | -------------------------------------------------------------------- | ----------- |
| `deepseek-v4-flash-free` | 6 (L1 att2, L2 att1, L3 att4/5/6, L4 att3, L5 att4, L6 att1) | 5/6               | att4 stale-PID-by-LSP-wedge, att5 transient stale-key-router-catalog | ✅ Reliable |
| `north-mini-code-free`   | 4 (L1 att1, L3 att3, L4 att1/2)                              | 0/4               | 100% hallucinated `DONE: <path>` text without emitting `write`       | ❌ Avoid    |
| `mimo-v2.5-free`         | 1 (L3 att1)                                                  | 0/1               | 1206 bash churn + stream error                                       | ❌ Avoid    |
| `nemotron-3-ultra-free`  | 1 (L5 att2)                                                  | 0/1               | Streaming response failed (0 tokens, cold start)                     | ❌ Avoid    |
| `nemotron-3-super-free`  | 1 (L3 att2)                                                  | 0/1               | 401 Model not supported (stale allowlist)                            | ❌ Avoid    |
| `qwen3.6-plus-free`      | 1 (L5 att3)                                                  | 0/1               | 401 Model not supported (stale allowlist)                            | ❌ Avoid    |

**New failure lore discovered today:**

1. **Stale PID-by-LSP-wedge (spawning layer #2 from `pi-harness-subagent-spawn-wedge-3-layer` skill):** Worker emits many `write` calls to helper scripts + many `bash` calls, then a final `bash` call whose result never arrives (auto-detached >15 s); harness marks PID stale after ~11.5 min of silence. Root cause: `pi-lens-shared-lsp` daemon cold-start crash (`Daemon exited with code: 1` + `Daemon startup timeout`). Detect via `status:stale` + `pid_alive:false` + `last_log_at` >5 min behind `quiet_for_seconds`.
2. **Transient stale key-router-model-catalog mid-session:** Bare model name resolves to a prefixed route that the key-router later rejects synchronously as `Model <name> not found` even though the launcher's `external_subagents_external_subagent_free_models` reports it as launchable. Recovery: re-dispatch with the same bare model name — the launcher's route-resolution cache refreshes on the next poll cycle. Don't waste time waiting for the upstream to recover.

**Mitigation playbook for sweep-style multi-step investigation:**

1. Pin dispatch to `deepseek-v4-flash-free` from the start.
2. Verify every `status:completed` claim via stat of the deliverable file — never trust a `status:completed` text reply alone. The `north-mini-code-free` hallucination pattern (text-only `DONE: <path>` with no `write` tool_call) is a recurring 100% reproducible model behavior.
3. Detect synchronous refusal at ~2 s by polling once shortly after dispatch; re-dispatching a different model immediately is cheaper than letting the worker hang.
4. Detect stale-PID-by-LSP by polling at ~5-min cadence; re-dispatch a fresh cold-start — `external_subagent_followup` inherits the crashed-LSP context.

### 2026-07-23 — external-subagents MCP wedge

- After dispatching a few workers, multiple stale `external-subagents` bun MCP servers were running (PIDs 14564, 19512, 22132, 25436). `external_subagent_start` calls returned `Not connected` and the gateway did not reliably respawn the stdio server after the stale processes were killed.
- **Recovery required:** `/reload-runtime` or a full Pi restart so the gateway re-initializes the `external-subagents` stdio server cleanly.
- **Workaround:** the `LoadingOverlay → ErrorState` refactor and the `ThreadInspector` panel extraction were completed manually in the main lane rather than via subagent because the tool was unavailable. Verification passed for both.

    Addendum (2026-07-24): subsequent observation ~15:20 UTC shows the stdio transport AUTO-RESPAWN works on the NEXT Pi turn after server death - no /reload-runtime and no full Pi restart needed. The earlier bun process (mcp*server_pid 12888) wedged after 4 parallel external_subagent_start calls at 14:23 UTC; subsequent calls over the next hour failed with 'Not connected'; a fresh bun (mcp_server_pid 13492) spawned naturally at 15:20 UTC on the next successful dispatch. The async-write-queue fix (mmx.ts:4371-4397, file mtime 09:25 local) was already on disk; bun re-loaded it cleanly. LESSON: when you see Not connected on external_subagent*\* after a dispatch storm, just keep retrying - the harness will re-spawn the bun server within ~30-60 min.

## Sweep Campaign 2026-07-24 — cross-provider outage goose re-probe

Re-derived the golden geese under a broad free-route outage (began ~2026-07-23 13:50Z, still ongoing at the 2026-07-24 15:30Z probe). Verdict keyed on connect -> emit real assistant tokens -> complete a report. Campaign log: `docs/bugsweep-campaign-2026-07-24.md`.

Today's probe outcomes:

- `opencode-zen/deepseek-v4-flash-free` (yesterday's 5/5 goose): Connection error on turn 1, 0 tokens, no report -> opencode-zen route DOWN today.
- `nvidia/thinkingmachines/inkling`: Connection error on turn 1, 0 tokens, no report -> nvidia-inkling route DOWN (was 429 earlier).
- `kilo/poolside/laguna-s-2.1:free`: connected ~2 min, thinking + todo + bash (2.1 MB), then 429 'Poolside upstream rate-limited' ~45 s into investigation -> connects but Poolside free upstream rate-limits; cannot complete.
- `openrouter/poolside/laguna-s-2.1:free`: connected, read getInitialRenderKind (renderer.ts:49), then 429 Poolside -> shares the SAME Poolside upstream as kilo (provider_name: Poolside, is_byok: false in both), so both Laguna-free lanes share one rate-limit ceiling.
- `agnes-2.0-flash` (bare ref -> pi:router-agnes/agnes-2.0-flash), W2c dangling vars: connected ~2.5 min (15:43:52), bash + read + reasoning, 4.4 MB, REAL token usage (input 37441 / output / reasoning), alive, not rate-limited -> FREE GOOSE (in flight to completion).
- `nvidia/z-ai/glm-5.2` (main-lane route as subagent), W5c z-index/DOM: connected ~2.5 min, reasoning through toast / LoadingOverlay -> ErrorState z-index + click-eating, 3.3 MB, alive, not rate-limited -> PAID GOOSE (in flight to completion).

### Locked-down golden geese (2026-07-24 outage day)

- **Free goose: `agnes-2.0-flash`** — independent `agnes` upstream, the only free/alt route emitting real tokens on an outage day. Default free subagent lane during free-route outages. Upgrade to fully-verified once W2c completes its report.
- **Paid goose: `nvidia/z-ai/glm-5.2`** — reliable under the outage; keep to ~1 concurrent subagent to avoid rate-limit contention with the live main lane.

### Avoid / conditional today

- `deepseek-v4-flash-free` (opencode-zen): offline today (Connection error); restore as primary free goose once the route recovers (deepest sweep track record).
- `north-mini-code-free`: avoid (hallucinated DONE text, 0/4).
- `mimo-v2.5-free`, `nemotron-3-ultra-free`, `nemotron-3-super-free`, `qwen3.6-plus-free`: avoid (401 / streaming / churn; 2026-07-23).
- `kilo` + `openrouter` `poolside/laguna-s-2.1:free`: shared Poolside free upstream 429s ~45 s into tool-use; not viable for multi-step completion on the free tier (needs a BYOK Poolside key). Laguna S 2.1 = interesting-but-not-a-goose via the free Poolside path today.
- `nvidia/thinkingmachines/inkling`: route down today; retry post-outage.

### New failure lore (2026-07-24)

- **Connection error vs 429:** Connection error = stopReason 'error', errorMessage 'Connection error.', usage.output 0, assistant_output_seen false, willRetry true + auto_retry_start — the provider ROUTE rejected the request before streaming (the model lane is fine; the route is down). 429 = upstream rate limit mid-stream carrying a provider_name (e.g. Poolside).
- **Shared-upstream rate-limit aliasing:** kilo/ and openrouter/ `poolside/laguna-s-2.1:free` surface identical provider_name: Poolside 429s -> the prefixes are gateways to the SAME upstream. Do not spend two slices probing shared-upstream routes; read the free-fallback inventory as upstream-grouped.

### Goose-hunt playbook (augmenting 2026-07-23)

1. During a free-route outage, pin dispatch to `agnes-2.0-flash` (free) and/or `nvidia/z-ai/glm-5.2` (paid, reliable) instead of waiting on downed opencode-zen / nvidia-free routes.
2. Confirm goose candidacy by real non-zero `usage.output` / `reasoning` tokens + a tool call, not just status: running (zero-usage workers are streaming nothing).
3. Two gateways with the same provider_name in the 429 metadata = one upstream; do not double-probe.

## Avenues Re-Verified 2026-07-24 ~15:00 UTC - main lane (router-direct curl + external_subagent_start dispatch)

The earlier 2026-07-24 'laguna-s.2.1 / ling-3.0-flash' Avoid rows from today were RE-VERIFIED via curl smokes (POST <http://127.0.0.1:8788/><provider>/v1/chat/completions) + one real external_subagent_start dispatch. The earlier Avoid rows measured transient upstream state at the time they ran; the route layer is healthy when re-tested an hour later.

| Route                                                  | Earlier row today                                                                | Re-verified ~15:00 UTC                                                                                                                                                                                                                                       | Verdict                                                                                                                                        |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| opencode-zen/laguna-s-2.1-free                         | AVOID / 429 rate-limit                                                           | curl 200+SMOKE_PASS (1.01 s, no warmup); real subagent ocw_fc9c3727 agent_end+settled                                                                                                                                                                        | Conditional (transient 429 had cleared)                                                                                                        |
| kilo/poolside/laguna-s-2.1:free                        | AVOID / 429 rate-limit                                                           | curl 200+SMOKE_PASS (1.91 s, upstream Poolside)                                                                                                                                                                                                              | Conditional (transient 429 had cleared)                                                                                                        |
| opencode-zen/ling-3.0-flash-free                       | AVOID / 300s timeout                                                             | curl 200+SMOKE_PASS ONLY at max_tokens>=250; below 250 returns null+length (reasoning warmup consumes budget)                                                                                                                                                | Conditional (HTTP-route healthy; 300s multi-step subagent timeouts may persist; curl smokes must use >=200 max_tokens to avoid false-negative) |
| kilo/inclusionai/ling-3.0-flash:free (upstream Novita) | AVOID / Connection error                                                         | curl 200+SMOKE_PASS direct output (1.70 s, no reasoning warmup)                                                                                                                                                                                              | Reliable for short bash-y subagent work - fastest reliable ling route today                                                                    |
| opencode-zen/mimo-v2.5-free                            | AVOID / 500 across all 6 keys                                                    | STILL 500 today (14:02 UTC via /catalog recentFailures + worker ocw_5d48cb69 crash mid-task); seen as recently as the 'show all routes' check                                                                                                                | AVOID (unchanged)                                                                                                                              |
| opencode-zen/nemotron-3-ultra-free                     | AVOID / Streaming response failed (cold-start 0-token, 2026-07-23 sweep L5 att2) | MIXED: today worker ocw_ac71331b (pid 7528) on same route produced ~25K useful tokens (8-TODO plan + 2 bash + reasoning content) over 14:21-14:34 UTC before going silent at 14:34 (pid died; cause unknown - possibly post-settle 'the' turn wedge pattern) | Conditional (cold-start flaky on some dispatches but real subagent output achievable)                                                          |

## Top-Tier Curl Smoke — 2026-07-24 ~17:00 UTC post-campaign reprobe (3 routes bench-dispatched at ~18:05 UTC — ALL FAILED bench, see [Bench-Validation Results](#bench-validation-results--2026-07-24-1805-utc) below)

After the 5-lane campaign `semantic-explorer-pivot-2026-07-24` concluded, three NEW routes were verified via router-direct curl probes. These were then bench-dispatched around 18:05 UTC on 2026-07-24 — **all three failed bench** (see the [Bench-Validation Results](#bench-validation-results--2026-07-24-1805-utc) section below for both attempts' outcomes). The curl-era table is kept here for HTTP-layer inspection.

| Route                                 | Smoke                    | Notes                                                                                                                                                                                                                                  |
| ------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `zenmux/z-ai/glm-4.6v-flash-free`     | ✅ 200 / 6.9 s / 162 tok | Vision-capable GLM exposed via ZenMux free lane. Already captured by Lane B health sweep (200 / 5946 ms). Bench dispatch still needed.                                                                                                 |
| `cloudflare/@cf/moonshotai/kimi-k2.6` | ✅ 200 / 3.18 s / 85 tok | Cloudflare route works directly via workers-ai — does NOT require the `agree` warmup noted for sibling `@cf/meta/llama-3.2-11b-vision`. Faster TTFT than most opencode-zen routes today. Bench dispatch still needed.                  |
| `modelscope/Tencent-Hunyuan/Hy3`      | ⚠️ 200 / empty body      | Enumerated in `/catalog` (canonical_id `Hy3`); route forwards the request but upstream returns `choices:null, usage.total_tokens:0`. Likely needs `reasoning:{effort:"max"}` extra-body. Bench dispatch must include reasoning config. |

### Recommended next bench inclusions — DONE 2026-07-24 ~18:05 UTC

All three routes were bench-dispatched. **All three FAILED bench** — they are NOT usable as new ✅ Reliable routes. See the **Bench-Validation Results** section below for the full verdicts.

### Caveat

Router-direct curl ≠ external_subagent dispatch validation. These are HTTP-layer smoke successes — subagent workers must be bench-launched on these routes before listing them in the `## Free / Shadow Routes` main table as ✅ Reliable. **The bench-dispatches done at 18:05 UTC on 2026-07-24 demonstrated this caveat crisply: all 3 curl-passing routes failed dispatch (2 hallucination patterns + 1 streaming connection error).**

## Bench-Validation Results — 2026-07-24 ~18:05 UTC

Three routes that had passed the curl-era smoke above were dispatched as actual Pi subagent workers to bench-validate them (the only way to verify tool-call layer behavior, since curl cannot exercise the streaming + tool-schema path). All three FAILED.

| Route                                 | Curl probe                | Worker dispatch outcome                                                                                                                                                                                                                | Bench verdict                                                                                                                                                |
| ------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `zenmux/z-ai/glm-4.6v-flash-free`     | ✅ 200 / 6.9 s / 162 tok   | Worker completed cleanly (`exit 0`, 18,932 tokens, 16 bash + 6 read stream events) BUT emitted "REPORT.md" + "BENCH-VALIDATION-DONE" **purely as text** — `0 write` tool_calls.                                                          | ❌ **Hallucinated `write` tool** — same pattern as `north-mini-code-free` (Lane A bench, 2026-07-23). Read-only investigation ✅; edit/dispatch ❌.                       |
| `cloudflare/@cf/moonshotai/kimi-k2.6` | ✅ 200 / 3.18 s / 85 tok   | **2 attempts** both errored with `stopReason:"error", errorMessage:"Connection error."` — **0 tokens emitted**. Pi's auto_retry (`maxAttempts:3, delayMs:2000`) fired both times but the bun external-subagents supervisor terminated the process tree before the retry could complete. | ❌ **Subagent dispatch unstable** — works for OpenAI-shape HTTP one-shot but NOT for streaming SDK adapter (`api:"openai-completions"` stream mode). 2-attempt reproducibility = persistent not transient. |
| `modelscope/Tencent-Hunyuan/Hy3` (3 reasoning-config variants tested) | ⚠️ 200 / empty body       | Three reasoning config variants (`extra_body.reasoning.effort`, top-level `reasoning.effort`, top-level `reasoning_effort`) all returned **STATUS 200 with `choices:null, usage.total_tokens:0`** — slug is recognized but upstream emits nothing for OpenAI-shaped requests regardless of reasoning config. Router reports the variant accepts the slug but returns no content. | ❌ Needs ModelScope-specific request schema (not OpenAI-completions OpenAI-shape). Worker dispatch not yet attempted via subagent harness.                       |

Full evidence + trace + analysis per route:

- `tmp/bench-validate/zenmux-z-ai-glm-4.6v-flash-free/REPORT.md` (main-lane authored, worker failed to call `write`)
- `tmp/bench-validate/cloudflare-kimi-k2.6/REPORT.md` (main-lane authored, both attempts `Connection error`)
- `tmp/bench-validate/modelscope-hy3/REPORT.md` (TBD — modelscope emitted empty body for all 3 reasoning config variants via curl; subagent dispatch not yet attempted via worker harness; listed as a future bench slot to verify)

### Lesson — curl smoke ≠ subagent readiness

A route returning `200` from a one-shot curl probe (`POST /<provider>/v1/chat/completions` with a `messages` body, no streaming) only validates the HTTP-level response shape. The subagent dispatch layer (Pi's `api:openai-completions` adapter, streaming mode, with tool schema) exercises a DIFFERENT code path that can fail in two ways curl never sees:

1. **`write` tool hallucination** (zenmux case) — model emits "I wrote REPORT.md" + "DONE" purely as **text** without ever calling the `write` tool. Same pattern as `north-mini-code-free` (Lane A, 2026-07-23).
2. **Streaming `Connection error.`** (cloudflare case) — model route works for non-streaming HTTP, but emits `stopReason:"error", errorMessage:"Connection error."` consistently for streaming SDK calls. Even Pi's auto_retry can't recover because the bun supervisor terminates the tree on `agent_end` before the retry attempt dispatches.

**Bench-validate = required to validate a new route.** This revises the curl-era "Top-Tier Routes Verified" section above: it was curl-only and pre-bench; all 3 of those routes have now been bench-dispatched and failed at the dispatch layer. The curl-era table still has value as an HTTP-shape inspection — but NOT as a subagent-readiness signal.

## Harness Updates — 2026-07-24 ~17:00 UTC

One harness change landed after Lane A's doc edits + Lane D2 postmortem:

- **`C:/Users/HP/harness/servers/external-subagents/src/mmx.ts`** `FREE_OPENCODE_MODELS` allowlist: **REMOVED** `"nemotron-3-super-free"` — confirmed STALE (401 ModelError from OpenCode Zen upstream). The route was listed in `external_subagents_external_subagent_free_models` despite upstream rejections; all such launches were wasted dispatch budget.
- `"nemotron-3-ultra-free"` **retained** in `FREE_OPENCODE_MODELS` (smoke passes; long-context stream-hang pattern is task-soft-delete per Lane D2 postmortem; workers may still opt-in for short tasks but should cap launch budget).
- MCP server process may require restart for the change to take effect (bun caches the const array literal at startup).

## Goose-hunt wave 2026-07-24 17:36Z — `agnes`-followup-unlock discovery + W4c false-positive audit

Tactics retested: (a) `external_subagent_followup` on stalled-deep-work to recover the context + trigger only the write; (b) followup-retry of a stalled worker after a transient `Connection error.`; (c) honest source-trace audit of `agnes`'s W4c complex-reactivity findings.

### Free goose: `agnes-2.0-flash` — refined verdict

| Tactic                                          | Slice                               | Result                                                                                     | Notes                                                                                                                                                                              |
| ----------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh dispatch (small slice)                    | W2c dangling lint vars              | ✅ completed → 12.7 KB report — **10/10** (main-lane cross-verified)                       | citation-grade evidence + extracting-commit cites; `agnes` reliably completes small/observable slices.                                                                             |
| Followup-recover stalled                        | W4c Svelte-5 snapshot/gate footguns | ✅ completed in ~4 min from followup dispatch (118 new output tokens, $0) → 13.3 KB report | **GOOSE-UNLOCK MECHANISM WORKS** for stalled `agnes` deep-work: `external_subagent_followup({worker_id})` resumes via the recorded `session_id` and finishes only the write step. |
| Followup-retry on transient `Connection error.` | W3c lifecycle                       | ✅ completed in ~2.3 min from re-dispatch → 9.6 KB report                                  | Re-followup on the same `worker_id` (same `session_id`) recovers from transient route blips fast. ⚠️ BUT the W3c resulting report's #1 finding was a fabricated false-positive (see 2nd caveat + ledger below).                                                                                  |

**Bench-quality caveat (added 17:36Z): `agnes` is WEAK on complex Svelte 5 reactive inference.** Its W4c report flagged 9 `$derived(getter())` patterns as "non-reactive mount-time snapshots" — **all 9 FALSE POSITIVES**. Main-lane source-trace confirms: `_readNavSnapshot()` (`navigation-state.svelte.ts:83`) returns `appState.navState` directly, which IS `$state<NavState>` (`app.svelte.ts:282`); Svelte 5 wraps non-primitive `$state` in a deeply reactive proxy that tracks property reads through any call-frame depth. `agnes` conflated the canonical AGENTS.md W54-class `const x = getInitial*()` (TOP-LEVEL `const` outside `$derived`/`$effect`; captured once, frozen) footgun with the unrelated `$derived(fn-reading-$state())` pattern. The project's own `FocusCard.svelte:58` comment empirically-documented this Way-clears ago: *"Reading it inside $derived registers reactivity directly — no mirror needed."*

Report honest-stamped 4/10 + caution footer in `tmp/bugsweep-2026-07-24/worker4-reactivity-footguns-report.md`; do NOT action the 9 findings.

**Second caveat (added 17:47Z): `agnes` ALSO fabricates evidence in audit-finding mode.** Its W3c lifecycle report claimed `rg "removeEventListener" src/lib/data-loader.ts` returned "zero matches for the worker" — but main-lane rg against HEAD `b5c3c39b` (file unmodified) returns THREE worker `removeEventListener` calls at lines 131-133 inside `settle()` plus `signal.removeEventListener` at 130, plus `worker.terminate()` at 134. The cited data-loader listener-leak finding is 0/1 real. Both families of false-positives (W4c reactive-inference + W3c audit-truthiness) confirm: `agnes` writes well-structured reports, BUT every per-finding claim of evidence MUST be main-lane source-traced before stamping — it can hallucinate rg output, not just abstract inference.

→ **Recommended use for `agnes-2.0-flash`**: execution-bound slices — lint-var/cleanup tails, DOM-id enumeration, smoke audits, ref-name pattern sweeps, simple file:line mapping. **Avoid for Svelte-5-reactivity inference**; use a model that traces signals natively (or main-lane).

### Paid goose: `nvidia/z-ai/glm-5.2` — refined verdict

| Tactic                       | Slice               | Result                                                                                                                                                                                                                                                                                                                        |
| ---------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh dispatch (large slice) | G1 z-index/DOM      | ❌ stalled pre-write (92 MB stdout, no report file). Connects reliably during outage (no rate-limit) + deep thinking (caught a real a11y focus-in-aria-hidden violation in thinking), but stalls at the WRITE step on large slices.                                                                                           |
| Followup-recover stalled     | same G1 `worker_id` | ❌ stalled pre-write AGAIN — even with explicit "writing the report now" instruction, `agent_settled` exit0 stop_reason `stop` with `tool_calls:[]` + 0 output. `glm-5.2` *says* it's writing but does NOT emit the `write` tool call. The followup-unlock that rescues `agnes` does NOT rescue `glm-5.2` for the write step. |

→ **`glm-5.2` = paid connect-goose**: reliable transport + good a11y thinking, but **unreliable for substantive deliverables on large slices** (fails the WRITE step; followup can't recover it). Use for slice investigation; host the deliverable-write on main-lane from the bounded stream-summary dump, OR spawn an `agnes-2.0-flash` followup to make the WRITE on the discovered findings.

### Cross-cutting goose-hunt tactics unlocked today

1. **`external_subagent_followup({worker_id})` (inherited `session_id`)** is the universal unlock for stalled `agnes` deep-work — finishes only the write step in minutes (~2–4 min, ~100 new tokens, $0). Rescues both LSP-wedge stalls and pre-write-step stalls on the `agnes` lane.
2. **Provider outage does not block the goose-hunt**: independent upstreams (e.g. `agnes`'s `pi:router-agnes`) keep working through `opencode-zen` / `nvidia` / `kilo` / `openrouter` downtimes — use route-independence as a meta-cue; geese surviving an outage are stronger picks.
3. **Parallel-session churn-mid-audit risk**: on a shared machine with an in-flight bugsweep-fix wave, workers read half-applied trees. The parallel session here committed `b5c3c39b` ("close AbortSignal dedup race + startDemo guard lock") and was actively extending `app.svelte.ts`/`search/*`/`state/*` during worker audits (one `glm-5.2` worker literally watched `css/base.css` change between two reads). My read-only workers left **0 src edits + 0 git commits** (verified). For worker findings on churned files, mark NEEDS-RE-VERIFICATION against stable HEAD before actioning.

### Updated rating perspective — 2026-07-24 outage-day (revised)

- `agnes-2.0-flash`: **✅ Reliable for execution-bound slices** + ⚠️ avoid for complex-reactive inference; followup-rescues stalled perimeter work.
- `nvidia/z-ai/glm-5.2`: **⚠️ Conditional** — reliable connect+think, but does NOT emit writes on large slices & followup doesn't recover; pair with a writer model or rest big slices.

### Deliverable ledger — worker reports written today (2026-07-24 17:36Z)

| Worker                          | Slice                      | Bytes | ~UTC  | Q                    | Action                                                                                                                                                                 |
| ------------------------------- | -------------------------- | ----- | ----- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W2c `agnes` (fresh)             | dangling lint vars         | 12674 | 16:48 | **10/10** ✅         | None — all 5 verified HARMLESS, main-lane cross-validate footer added.                                                                                                 |
| W4c `agnes` (followup)          | Svelte-5 snapshot footguns | 15585 | 17:31 | 4/10 — premise WRONG | Skip — 9/9 findings false-positive; honest-stamp footer + decisive-trace footer added.                                                                                 |
| W3c `agnes` (followup-retry)    | lifecycle                  | 9553  | 17:33 | **4/10 — #1 fabricates evidence** | Skip — #1 false-positive (`settle()` removes all worker listeners at lines 131-133 + `worker.terminate()` at 134); footer added to report file.                                                                                                                                                 |
| G1 `glm-5.2` (fresh + followup) | z-index/DOM (→ a11y)       | 0     | n/a   | ❌ no report written | Possibly abandon; `glm-5.2` stalls pre-write on large slices even with followup. Retrievable insights in the 86 MB stdout (a11y focus-in-aria-hidden violation found). |
