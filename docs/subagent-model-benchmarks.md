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

| Provider                | Model                           | Smoke     | Subagent                    | Rating         | Notes                                                                                                                                                                                                                                                                                                |
| ----------------------- | ------------------------------- | --------- | --------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| logfare                 | `deepseek-v4-pro`               | ✅ 8/8    | ✅ Yes                      | ✅ Reliable    | Default model as of 2026-07-23. Used for Filters, FocusCard header, default-route test, and Header extraction. ~2–6 s response. One 900 s timeout on a large JourneyChrome extraction; partial edits landed and passed `check:svelte`.                                                               |
| logfare                 | `deepseek-v4-flash`             | ✅        | ⚠️ 429 rate-limit           | ✅ Reliable    | 2026-07-23: read-only subagent task hit `429 Logfare upstream rate-limited model deepseek-v4-flash` immediately after the prompt. Pro variant works; flash is rate-limited at the moment. Retest later.                                                                                              |
| logfare                 | `glm-5.2`                       | ✅        | ✅ (main lane)              | ✅ Reliable    | Also used as main-lane provider via router-logfare.                                                                                                                                                                                                                                                  |
| kilo                    | `poolside/laguna-m.1:free`      | ✅ 9/9    | ❌ Connection error         | ❌ Avoid       | 2026-07-23: previously hit 429; now even a simple read-only smoke task fails with connection error. Not viable right now.                                                                                                                                                                            |
| openrouter              | `poolside/laguna-s-2.1:free`    | ✅        | ❌                          | ⚠️ Conditional | Laguna free lanes have reported empty-args tool_call + rate-limit issues per memory. Avoid for subagents.                                                                                                                                                                                            |
| openrouter              | `poolside/laguna-xs-2.1:free`   | ✅        | ❌                          | ⚠️ Conditional | Same Laguna family caveats.                                                                                                                                                                                                                                                                          |
| cloudflare              | `@cf/openai/gpt-oss-20b`        | ✅ 15/16  | ❌ Connection error         | ❌ Avoid       | 2026-07-23: even a simple read-only smoke task failed with connection error. Not viable for subagents right now.                                                                                                                                                                                     |
| cloudflare              | `@cf/moonshotai/kimi-k2.6`      | ✅ 15/16  | ❌ Connection error         | ❌ Avoid       | 2026-07-23: subagent dispatch failed with connection error immediately after the prompt. Same Cloudflare Workers AI connectivity issue as `gpt-oss-20b`.                                                                                                                                             |
| modelscope              | `deepseek-ai/DeepSeek-V4-Flash` | ✅ 22/48  | ❌ 429 insufficient quota   | ❌ Avoid       | 2026-07-23: health check passes, but subagent dispatch fails with `429 insufficient_quota` immediately after the prompt. No real tool-use possible.                                                                                                                                                  |
| zydit                   | `openai/gpt-oss-20b`            | ✅ 35/116 | ❌ JSON parse error         | ❌ Avoid       | 2026-07-23: subagent dispatch reached the model, but the pi-ai minimax-thinking patch (`parseStreamingJson`) failed with `malformed partial JSON: "cd"`. The worker aborted before any edits. Likely a streaming-format incompatibility; avoid until the patch is adjusted.                          |
| zydit-v4                | `openai/gpt-5.5`                | ✅        | ❌ Model not found          | ❌ Avoid       | 2026-07-23: subagent dispatch failed with `Model "router-zydit-v4/openai/gpt-5.5" not found`. The curated ref in `mmx.ts` points to a model not present in the live catalog. Do not use.                                                                                                             |
| zenmux                  | `z-ai/glm-4.7-flash-free`       | ✅ 2/3    | ⚠️ Partial / 429 rate-limit | ⚠️ Conditional | 2026-07-23: real subagent dispatch succeeded and created `src/lib/components/focus/SelectedMatchNarrative.svelte` (InfoPanel extraction), but hit ZenMux free usage rate-limit (429) before completing parent integration and verification. Viable only for small, fast tasks.                       |
| nvidia                  | `deepseek-ai/deepseek-v4-flash` | ✅ 23/115 | ❌ 120 s timeout            | ⚠️ Conditional | 2026-07-23: read-only subagent task got first assistant output at ~87 s but never completed the write step before the 120 s timeout. Too slow/unreliable for interactive subagent use.                                                                                                               |
| nvidia                  | `google/gemma-2-2b-it`          | ✅ 23/115 | ❌ 422 tool/schema error    | ⚠️ Conditional | 2026-07-23: subagent dispatch rejected the Pi harness request with `body -> tools: Extra inputs are not permitted` and `max_tokens` validation errors. This model/serving endpoint does not support the tool-calling schema the harness requires.                                                    |
| nvidia                  | `poolside/laguna-xs-2.1`        | ✅ 22/115 | ⚠️ Partial / 900 s timeout  | ⚠️ Conditional | 2026-07-23: real subagent dispatch succeeded and created `src/lib/components/LegendClusterList.svelte` (204 LOC), but the worker timed out after 900 s before integrating the child into `Legend.svelte` and running verification. Incurs cost; not reliable for large tasks under the 900 s budget. |
| opencode-zen (zen free) | `deepseek-v4-flash-free`        | ✅ 5/5    | ❌ Stuck / no output        | ⚠️ Conditional | 2026-07-23: smoke passes, but subagent dispatch with live_steer hangs with no assistant output (two attempts). Not viable for tool-using subagents right now.                                                                                                                                        |
| opencode-zen (zen free) | `deepseek-v4-flash-free`        | ✅ 5/5    | ❌ Stuck / no output        | ⚠️ Conditional | 2026-07-23: smoke passes, but subagent dispatch hangs with no assistant output (tried both json and rpc/live_steer modes). Not viable for tool-using subagents right now.                                                                                                                            |
| zen (OpenCode Zen)      | `mimo-v2.5-free`                | ❌ Flaky  | ❌                          | ❌ Avoid       | Repeated 500s / connection errors. Default was patched away on 2026-07-23.                                                                                                                                                                                                                           |

## Paid / Allowed-Paid Routes

| Provider       | Model               | Smoke | Subagent                    | Rating      | Notes                                                                                                                                                                                                    |
| -------------- | ------------------- | ----- | --------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| opencode-go    | `mimo-v2.5`         | N/A   | ❌ 401 Insufficient balance | ❌ Avoid    | 2026-07-23: subagent dispatch failed immediately with `CreditsError: Insufficient balance`. Not usable until billing is topped up. Previously reliable paid route.                                       |
| opencode-go    | `deepseek-v4-flash` | N/A   | ❌ Stuck / no output        | ❌ Avoid    | 2026-07-23: subagent dispatch launched but produced no assistant output for 200+ seconds. Possibly the same balance/auth issue as `mimo-v2.5`, or an upstream hang. Canceled; do not use until retested. |
| minimax-direct | `MiniMax-M3`        | N/A   | ✅ Reliable                 | ✅ Reliable | Allowed paid exception for minimax route.                                                                                                                                                                |

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
6. **Verify completion claims.** A worker may report success with fabricated diff stats. Always verify via `git diff --stat` and `grep '"name":"edit"' stdout.log` before accepting a subagent result.
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

| Provider     | Model                                          | Status                            | Elapsed | Notes                                                                                                                                                                                                       |
| ------------ | ---------------------------------------------- | --------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| logfare      | `deepseek-v4-pro`                              | ✅ completed                      | ~57 s   | Read file, wrote correct report with 8 DOM IDs and 16 classes.                                                                                                                                              |
| logfare      | `deepseek-v4-flash`                            | ⚠️ 429 rate-limit                 | ~32 s   | Prompt delivered; Logfare returned upstream rate-limit for the flash variant. Pro variant succeeded.                                                                                                        |
| nvidia       | `deepseek-ai/deepseek-v4-flash`                | ❌ 120 s timeout                  | ~120 s  | First assistant output at ~87 s, but never completed the write step. Too slow/unreliable.                                                                                                                   |
| nvidia       | `google/gemma-2-2b-it`                         | ❌ 422 tool/schema error          | ~25 s   | Model endpoint rejects tool-calling schema (`tools` extra inputs not permitted, `max_tokens` too high). Not compatible with Pi harness.                                                                     |
| openrouter   | `inclusionai/ling-3.0-flash:free`              | ❌ MCP hang / canceled            | ~45 s   | Worker stuck at `MCP: 0/7 servers` for >20 s; canceled to avoid blocking. May retest after MCP server cleanup.                                                                                              |
| opencode-zen | `deepseek-v4-flash-free`                       | ❌ no output / canceled           | ~60 s   | Smoke passes but subagent never produced assistant output in either json or rpc/live_steer mode.                                                                                                            |
| cloudflare   | `@cf/moonshotai/kimi-k2.6`                     | ❌ connection error               | ~40 s   | Prompt delivered; model returned connection error before any tool call.                                                                                                                                     |
| cloudflare   | `@cf/openai/gpt-oss-20b`                       | ❌ no assistant output / canceled | ~50 s   | Worker initialized but produced no assistant output within 45 s of prompt delivery; canceled.                                                                                                               |
| logfare      | `deepseek-v4-pro` (ThreadInspector extraction) | ❌ MCP server wedge / canceled    | ~30 s   | Multiple stale `external-subagents` bun MCP servers (PIDs 14564, 19512, 22132, 25436) were running and the gateway could not reliably connect; the extraction task was completed manually in the main lane. |
| nvidia       | `nemotron-3-super-120b-a12b`                 | ❌ 404 before tool call           | ~30 s   | Health-check passed, but subagent dispatch returned `404 page not found` from the upstream router before any tool call. Not available for subagent work. |
| openrouter   | `cohere/north-mini-code:free`                | ✅ completed                      | ~45 s   | Read file, wrote report. Used `find` to look for test references; report is correct but brief. |
| mistral      | `mistral/mistral-medium-latest`              | ❌ model not found                | ~6 s    | `router-mistral/mistral-medium-latest` not found by the Pi harness. The doctor's recommended launch ref is stale. |
| nvidia       | `mistralai/mistral-small-4-119b-2603`        | ❌ model not found                | ~6 s    | `router-nvidia/mistralai/mistral-small-4-119b-2603` not found by the Pi harness, despite appearing in health-check catalog. |
| modelscope   | `deepseek-ai/DeepSeek-V4-Flash`                | ❌ 429 insufficient quota         | ~52 s   | Prompt delivered; model returned quota error before any tool call.                                                                                                                                          |

## Operational Notes

### 2026-07-23 — external-subagents MCP wedge

- After dispatching a few workers, multiple stale `external-subagents` bun MCP servers were running (PIDs 14564, 19512, 22132, 25436). `external_subagent_start` calls returned `Not connected` and the gateway did not reliably respawn the stdio server after the stale processes were killed.
- **Recovery required:** `/reload-runtime` or a full Pi restart so the gateway re-initializes the `external-subagents` stdio server cleanly.
- **Workaround:** the `LoadingOverlay → ErrorState` refactor and the `ThreadInspector` panel extraction were completed manually in the main lane rather than via subagent because the tool was unavailable. Verification passed for both.
