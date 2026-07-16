# AI Model LLM Leaderboard Scores

**Source:** [artificialanalysis.ai LLM Leaderboard](https://artificialanalysis.ai/leaderboards/models)  
**Date verified:** 2026-07-15

## Intelligence Scores

Models from the project's Pi harness lane inventory, mapped to their official names on the artificialanalysis.ai leaderboard.

| Project ID                  | Leaderboard Name            | Intelligence Index | Notes                                                            |
| --------------------------- | --------------------------- | ------------------ | ---------------------------------------------------------------- |
| `mimo-v2.5-free`            | **MiMo-V2.5-Pro**           | **42**             | Reasoning model variant                                          |
| `deepseek-v4-flash-free`    | **DeepSeek V4 Flash (Max)** | **40**             | Max effort reasoning                                             |
| `qwen3.6-plus-free`         | **Qwen3.6 Plus**            | **40**             | Not in live free catalog 2026-07-15                              |
| `nemotron-3-ultra-free`     | **Nemotron 3 Ultra**        | **38**             | —                                                                |
| `grok 4.3`                  | **Grok 4.3 (high)**         | **38**             | High reasoning tier                                              |
| `north-mini-code-free`      | **North Mini Code**         | **21\***           | Asterisk = reasoning variant                                     |
| `hy3-free`                  | —                           | **N/A**            | Not listed on artificialanalysis.ai, new lane (added 2026-07-15) |
| `kilo/openrouter/owl-alpha` | —                           | **N/A**            | Not listed on artificialanalysis.ai                              |
| `agnes-2.0-flash`           | —                           | **N/A**            | Not listed on artificialanalysis.ai                              |

### Key

- **Intelligence Index** (range ~10–60): composite benchmark from artificialanalysis.ai v4.1 (GDPval-AA, Terminal-Bench, SciCode, HLE, GPQA, etc.)
- **Asterisk (\*)** on the leaderboard indicates a reasoning/thought variant.

## Coding Scores

| Project ID                  | Coding Index | Status                                                                |
| --------------------------- | ------------ | --------------------------------------------------------------------- |
| `mimo-v2.5-free`            | —            | **Not currently available**                                           |
| `deepseek-v4-flash-free`    | —            | **Not currently available**                                           |
| `qwen3.6-plus-free`         | —            | **Not currently available** (dormant in live free catalog 2026-07-15) |
| `nemotron-3-ultra-free`     | —            | **Not currently available**                                           |
| `grok 4.3`                  | —            | **Not currently available**                                           |
| `north-mini-code-free`      | —            | **Not currently available**                                           |
| `hy3-free`                  | —            | **N/A** (new lane, score TBD)                                         |
| `kilo/openrouter/owl-alpha` | —            | Not listed                                                            |
| `agnes-2.0-flash`           | —            | Not listed                                                            |

**Note:** artificialanalysis.ai shows per-model "Coding Index" tabs, but all tested models display "Not currently available" at this time. This appears to be a platform-wide data unavailability rather than model-specific.

## Individual Coding Benchmarks (Intelligence Breakdown)

For models that _are_ on the leaderboard, the Intelligence Breakdown section includes the following coding-related sub-scores (as percentages):

### DeepSeek V4 Flash (Max)

- **Terminal-Bench v2.1:** 62%
- **SciCode:** 45%

(Other models' detailed sub-scores can be queried per-model on the site, but the dedicated "Coding Index" composite is not yet published.)

## Why `owl-alpha` and `agnes-2.0-flash` Are Missing

- **`kilo/openrouter/owl-alpha`:** This is a custom router/model identifier (Kilo via OpenRouter). It does not appear as a named model on artificialanalysis.ai.
- **`agnes-2.0-flash`:** Agnes models are not yet indexed on artificialanalysis.ai. They may be added in a future leaderboard update.

---

## Vision / Multimodal Scores

**Source:** `scripts/vision-probe.mjs` (empirical image probe — ground-truth red/green/blue/yellow,
asserts content correctness, not just HTTP 200) + websearch of BenchLM.ai, llm-stats.com,
artificialanalysis.ai, Vals.ai, pricepertoken.com, model cards. **Date verified:** 2026-07-15.

> **Rule:** a catalog `modalities.input` / `attachment` field is **NOT** proof of vision. Only a
> live image probe counts. API keys are redacted from all outputs.

### Empirical vision-probe verdicts (router-probeable)

| Model (provider/model)                                 | Verdict         | Score | Route             |
| ------------------------------------------------------ | --------------- | ----- | ----------------- |
| `logfare/minimax-m3`                                   | VISION_ON       | 4/4   | router            |
| `zen/mimo-v2.5-free`                                   | VISION_ON       | 4/4   | router            |
| `nvidia/nvidia/llama-3.1-nemotron-nano-vl-8b-v1`       | VISION_ON       | 4/4   | router            |
| `nvidia/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` | VISION_ON       | 4/4   | router            |
| `nvidia/nvidia/nemotron-nano-12b-v2-vl`                | VISION_ON       | 4/4   | router            |
| `nvidia/meta/llama-3.2-11b-vision-instruct`            | VISION_ON\*     | 4/4\* | router            |
| `nvidia/meta/llama-3.2-90b-vision-instruct`            | VISION_ON       | 4/4   | router            |
| `modelscope/Qwen/Qwen3-VL-8B-Instruct`                 | VISION_ON       | 4/4   | router            |
| `modelscope/Qwen/Qwen3-VL-235B-A22B-Instruct`          | VISION_ON       | 4/4   | router            |
| `openrouter/google/gemma-4-26b-a4b-it:free`            | VISION_ON       | 4/4   | router            |
| `agnes/agnes-2.0-flash`                                | VISION_ON       | 4/4   | router            |
| `logfare/kimi-k2.6`                                    | NO_VISION/flaky | –     | upstream 502      |
| `openrouter/moonshotai/kimi-k2.6:free`                 | NO_ROUTE        | –     | 404 in key-router |
| `kilo/openrouter/owl-alpha`                            | NO_ROUTE        | –     | 404 in key-router |

\* `nvidia/meta/llama-3.2-11b-vision-instruct` graded PARTIAL/2 in an earlier sweep but VISION_ON/4
on re-probe — flag as occasionally flaky, generally vision-capable.

### Published multimodal benchmarks (best public)

| Model                  | MMMU | MMMU-Pro        | MMBench | MathVista | DocVQA | ChartQA | VQAtest | POPE  | Other                                                     | Source                                |
| ---------------------- | ---- | --------------- | ------- | --------- | ------ | ------- | ------- | ----- | --------------------------------------------------------- | ------------------------------------- |
| Gemini 3 Flash         | TBD  | 81.2%           | 86.7%   | TBD       | TBD    | TBD     | TBD     | 85.6% | SOTA MMMU-Pro                                             | businessanalytics.substack; llm-stats |
| Qwen3-VL-8B (Thinking) | TBD  | TBD             | TBD     | TBD       | 90.1%  | 85.5%   | 95.3%   | TBD   |                                                           | llm-stats                             |
| Kimi K2.6              | TBD  | TBD             | TBD     | TBD       | TBD    | TBD     | TBD     | TBD   | BenchLM 74/100; SWE-Bench Pro 58.6%; Terminal-Bench 66.7% | benchlm.ai; llm-stats; deepinfra      |
| MiniMax M3             | TBD  | (sep. vs gemma) | TBD     | TBD       | TBD    | TBD     | TBD     | TBD   | AA Intelligence Index 55; BenchLM 71                      | artificialanalysis.ai; benchlm.ai     |
| LLaMA 3.2 90B Vision   | TBD  | TBD             | TBD     | TBD       | <90.1% | <85.5%  | <95.3%  | TBD   | trails Qwen3-VL-8B-Thinking                               | llm-stats                             |
| Claude Opus 4.7        | TBD  | TBD             | TBD     | TBD       | TBD    | TBD     | TBD     | TBD   | BenchLM #7/79 prov.                                       | benchlm.ai                            |
| GPT-5.5                | TBD  | TBD             | TBD     | TBD       | TBD    | TBD     | TBD     | TBD   | BenchLM #13/79; ARC-AGI-2 85%; GPQA 93.6%                 | benchlm.ai; vals.ai                   |
| agnes-2.0-flash        | TBD  | TBD             | TBD     | TBD       | TBD    | TBD     | TBD     | TBD   | VISION_ON/4 empirical (this probe)                        | this doc                              |
| phi-4-multimodal       | TBD  | TBD             | TBD     | TBD       | TBD    | TBD     | TBD     | TBD   |                                                           | TBD                                   |
| glm-5.2                | TBD  | TBD             | TBD     | TBD       | TBD    | TBD     | TBD     | TBD   |                                                           | TBD                                   |
| nemotron-nano-vl       | TBD  | TBD             | TBD     | TBD       | TBD    | TBD     | TBD     | TBD   |                                                           | TBD                                   |

`TBD` = no reliable public score found.

### nvidia / NIM catalogue note

The nvidia/NIM provider serves a large vision catalogue (121 models in the live survey; ~9 vision-ish).
With correct vendor-prefixed model ids, **5 are live VISION_ON** (`meta/llama-3.2-11b-vision-instruct`,
`meta/llama-3.2-90b-vision-instruct`, `nvidia/llama-3.1-nemotron-nano-vl-8b-v1`,
`nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`, `nvidia/nemotron-nano-12b-v2-vl`). `minimaxai/minimax-m3`
is registered and multimodal but currently returns NVIDIA-side `DEGRADED function cannot be invoked`
(account quota) — vision is proven VISION_ON via the **logfare** route. `microsoft/phi-3-vision` /
`phi-4-multimodal` are not deployed on this NIM route (404/410); two `embed` models are embedding-only.
Vendor-prefix rule: NIM model ids need `meta/`, `microsoft/`, `nvidia/` prefixes — bare survey ids 404.

---

_For internal use — cross-reference with `docs/subagent-models.md` and the harness `model-providers.json` before routing subagents._
