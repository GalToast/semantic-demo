# Subagent Lane Inventory — Semantic Explorer

Moved out of `AGENTS.md` (Prompt Budget: no large reference tables in the hot-path file). `docs/subagent-delegation.md` remains the source for lifecycle/rate/vision rules; this doc is just the live per-model viability table.

Probed 2026-07-27. Updated 2026-07-28.

## Lane inventory (from `model-providers.json`)

- **Primary:** `minimax-m3` (MiniMax-M3 — main lane; verified vision-capable 2026-07-15, routes: kilo/minimax, logfare, opencode-zen, minimax-direct). Previous `kilo/openrouter/owl-alpha` is dead (404 on both the kilo gateway and OpenRouter; absent from `/v1/models`) — do not re-add.
- **Registered alt:** `agnes-2.0-flash` ✅ **subagent-viable 2026-07-27** (resolves via `router-agnes`; tool-use + write succeed; verify output against parent-component scope, as it tends to over-reach into child components).
- **Free fallbacks:**
    - `laguna-s-2.1-free` **route-dependent** — ❌ on OpenCode Zen (2026-07-29: subagent tasks stuck in long reasoning loops and hit 200MB+ stdout cap), ✅ via `/poolside` `poolside/laguna-s-2.1` and `/openrouter` `poolside/laguna-s-2.1:free` for direct completion probes. **Subagent benchmark 2026-07-29 (Pi harness, poolside route):** ❌ NOT subagent-viable — launched with `--thinking max`, spun in reasoning loops producing zero output for 41–88s on both a complex audit task and a trivial one-sentence prompt. Root cause: Pi harness defaults to `--thinking max` for reasoning-capable models; laguna-s-2.1 supports reasoning but loops indefinitely at max thinking. The `external_subagent_start` API does not expose a thinking-level override. Avoid for subagent coding tasks until a `--thinking low/off` option is available.
    - `laguna-xs-2.1-free` ✅ **subagent-viable 2026-07-27** (via `openrouter/poolside/laguna-xs-2.1:free`)
    - `mimo-v2.5-free` ✅ **subagent-viable 2026-07-28** (resolves via `router-opencode-zen`) — strong for UI code edits but emits very long reasoning traces; use conciseness steering.
    - `deepseek-v4-flash-free` ✅ **subagent-viable 2026-07-28** (resolves via `router-opencode-zen`) — reliable for multi-step coding and read-only audits.
    - `nemotron-3-ultra-free` ✅ **subagent-viable 2026-07-28** (via `opencode/nemotron-3-ultra-free` → `router-opencode-zen`) — reliable but counts against the ~3–4 worker OpenCode Zen concurrency limit.
    - `north-mini-code-free` **route-dependent** — ❌ on OpenCode Zen (hallucinates `"DONE: <path>"` text without writing files, 2026-07-26), ⚠️ via `openrouter/cohere/north-mini-code:free` completed a read-only DOM audit 2026-07-23; avoid for code edits unless retested.
    - `hy3-free` / `tencent/hy3` ❌ not subagent-viable 2026-07-27 (OpenCode Zen 429 / cold stall)
    - `qwen3.6-plus` (untested recently)
    - `qwen3.6-flash` ❌ `qwen/qwen3.6-flash` is not in the unified v4 catalog via `zyditv4` (2026-07-27)
    - `qwen3.6-27b` (untested recently)
    - `qwen3.6-35b-a3b` (untested recently)

### Strong free/shadow routes for coding

| Model                    | Route                 | Best for                                      | Notes                                                           |
| ------------------------ | --------------------- | --------------------------------------------- | --------------------------------------------------------------- |
| `mimo-v2.5-free`         | `router-opencode-zen` | UI code edits, component extractions          | Long reasoning; set tight scope and steer for conciseness.      |
| `deepseek-v4-flash-free` | `router-opencode-zen` | Multi-step coding, bugsweep, read-only audits | Proven on L1/L2/L4/L5 sweep tasks.                              |
| `deepseek-v4-pro`        | `router-logfare`      | Complex UI refactor / extraction              | Reliable workhorse; 900s timeout may be needed for large tasks. |

## Provider health snapshot — 2026-07-28

Probed from main lane via `/v1/models` and completion calls.

| Provider / Route | Model                                                                             | Verdict | Latency  | Notes                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------- | ------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `/poolside`      | `poolside/laguna-s-2.1`                                                           | ✅      | ~0.5 s   | Direct Poolside endpoint; 200 OK                                                                           |
| `/openrouter`    | `poolside/laguna-s-2.1:free`                                                      | ✅      | ~0.4–1 s | OpenRouter free tier; 200 OK                                                                               |
| `/logfare`       | `kiro-auto`                                                                       | ❌ 429  | —        | `Logfare upstream rate-limited model kiro-auto`                                                            |
| `/logfare`       | `kimi-k2.7-code`                                                                  | ❌ 429  | —        | Rate-limited upstream                                                                                      |
| `/logfare`       | `minimax-m3`                                                                      | ⚠️      | —        | 200 OK but `content: null` — usable for routing probe only, not reliable for production completions        |
| `/kilo`          | `kilo-auto/frontier`                                                              | ❌ 402  | —        | Paid model; credits required                                                                               |
| `/kilo`          | `openrouter/auto`                                                                 | ❌ 402  | —        | Paid model; credits required                                                                               |
| `/kilo`          | `openrouter/auto-beta`                                                            | ❌ 402  | —        | Paid model; credits required                                                                               |
| `/kilo`          | `kilo-auto/free`                                                                  | ⚠️      | —        | 200 OK; maps to `stepfun/step-3.7-flash`; returns reasoning content (not raw answer) — usable with caution |
| `opencode-zen`   | free routes (deepseek-v4-flash-free, mimo-v2.5-free, nemotron-3-ultra-free, etc.) | ✅      | varies   | All probed free routes via OpenCode Zen are subagent-viable                                                |
| `/openprovider`  | all models                                                                        | ❌ 502  | —        | `/v1/models` endpoint returning 502; provider unavailable                                                  |

### Changes from 2026-07-27

- **`laguna-s-2.1-free`**: flipped from ❌ to route-dependent — still ❌ on OpenCode Zen for subagent work (reasoning-loop / 200MB cap, 2026-07-29), but ✅ via `/openrouter` and `/poolside` for direct completion probes.
- **`north-mini-code-free`**: route-dependent — ❌ via OpenCode Zen (hallucination), ⚠️ via `/openrouter` for read-only audits.
- **`minimax-m3`** (main lane): `content: null` on `/logfare` suggests Logfare is degraded for this model; other routes (kilo/minimax, minimax-direct) may be unaffected — probe those before assuming main-lane blockage.
- **OpenCode Zen free routes**: all reconfirmed viable; cap concurrency at ~3–4 workers to avoid stuck stores (observed 8 workers → 192MB+ stdout and 600s timeouts).
- **New dead entries**: `kimi-k2.7-code` (logfare 429), `/openprovider` 502 — both new to inventory.

### 2026-07-29 UI cleanup dispatch plan

| Task                         | Worker         | Route                                           | Rationale                                                  |
| ---------------------------- | -------------- | ----------------------------------------------- | ---------------------------------------------------------- |
| Mobile header overlap (B-S7) | `ocw_195ae...` | `router-opencode-zen/mimo-v2.5-free`            | Proven UI code edits; steer for conciseness.               |
| Focus facts separator (5g)   | `ocw_7a362...` | `router-opencode-zen/mimo-v2.5-free`            | Proven UI code edits.                                      |
| Role label (5k)              | `ocw_bb661...` | `router-opencode-zen/mimo-v2.5-free`            | Proven UI code edits.                                      |
| Journey suite timeout        | `ocw_763fe...` | `router-logfare/deepseek-v4-pro`                | Proven multi-step workhorse; keeps OpenCode Zen load down. |
| Visual audit catalog         | `ocw_a6844...` | `router-opencode-zen/deepseek-v4-flash-free`    | Proven read-only audits.                                   |
| Drift audit                  | `ocw_e7fdd...` | `direct-openrouter/cohere/north-mini-code:free` | Read-only; tests openrouter north-mini viability.          |

OpenCode Zen load: 4 workers (3 mimo + 1 deepseek), within the ~3–4 safe zone but at the edge. If any mimo worker stalls due to long reasoning, it will be steered/canceled and relaunched on another provider.

## Orchestration bugsweep trial — 2026-07-29 (free routes, max reasoning)

Goal: trial untrialed free-catalogue models (max reasoning where supported) on a real bugsweep of 5 orchestration files. Route-health barriers blocked every free subagent from completing the trial end-to-end; the main lane finished the sweep manually (`tmp/trial-2026-07-29/main-lane-findings.md` — 1 MED + 4 LOW + 1 investigated-resolved). Trial detail: `tmp/trial-2026-07-29/trial-summary.md`.

| Route                                          | Health                                                                                            | Launchable?                                                                                                                                                                                                                                                                             | Verdict                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **OpenRouter key-router** `/openrouter/v1`     | ✅ alive (direct API + key-router 200 for `openai/gpt-oss-20b:free` `reasoning_effort:max`, 1-3s) | ❌ workers exit 124 (120s timeout); 0 assistant output                                                                                                                                                                                                                                  | upstream works, launch harness times out — NOT viable                               |
| **NVIDIA upstream** `integrate.api.nvidia.com` | ✅ alive (direct API 200, 370-850ms, all reasoning variants)                                      | ❌ key-router `/nvidia/v1/chat/completions` → **404** (path listed but not wired). 5 workers stalled 7+ min, cancelled.                                                                                                                                                                 | upstream alive, key-router broken — NOT viable                                      |
| **ModelScope** `/modelscope/v1`                | ✅ alive (after warmup)                                                                           | ⚠️ partial. **Qwen3-30B-A3B-Thinking-2507** produced 23 tool calls but an **off-task** report (project-wide `any` grep). PROMPT-v3 got it on-task but it **completed without writing the report**; followup rescue stalled. DeepSeek-V4-Flash hit **429 insufficient_quota** ~9 min in. | route works; models lack report-writing discipline — NOT viable without heavy steer |
| **Cloudflare** `/cloudflare/v1`                | ✅ alive (`@cf/qwen/qwen3-30b-a3b-fp8` chat OK)                                                   | ⚠️ `qwq-32b` produced reasoning text but **0 tool calls** — can't read files                                                                                                                                                                                                            | NOT viable for code-intelligence sweep                                              |
| **kilo** `*/kilo*`                             | ❌ HTTP 402 (balance -0.00003)                                                                    | ❌ all models fail                                                                                                                                                                                                                                                                      | dead                                                                                |
| **zenmux**                                     | ❌ HTTP 000                                                                                       | ❌ down                                                                                                                                                                                                                                                                                 | dead                                                                                |
| **airforce**                                   | ✅ alive                                                                                          | ❌ not a key-router provider lane — not launchable via external_subagents                                                                                                                                                                                                               | not launchable                                                                      |
| **freeinference.org**                          | ✅ alive (7 models, 292K tokens/6.3s)                                                             | untested as Pi harness provider                                                                                                                                                                                                                                                         | candidate, untested                                                                 |

Cross-cutting:

- `--thinking max` is applied to ALL subagent workers regardless of model reasoning support (gemma got it too); no override exposed by `external_subagent_start`. User confirmed: keep it.
- NVIDIA `nvidia/*` free nemotron models are NOT exposed via OpenRouter in this subagent catalogue — they only reach the broken nvidia key-router lane.
- The one model that produced output (ModelScope Qwen3-30B) went off-task — a prompt-discipline problem surfaced, not just a route problem; PROMPT-v3 (ordered read→find→report, forbid project-wide grep) fixed on-task-ness but the model still didn't deliver the report artifact.
- 2026-07-27 bench ground truth (`docs/bugsweep-bench-2026-07-27.md`) had no orchestration entries → all main-lane findings are NEW.

Next lane to trial (not yet done): freeinference.org as a direct Pi harness provider — alive, fast, has reasoning-capable models; only untested piece remaining.
