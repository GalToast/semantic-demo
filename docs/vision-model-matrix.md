# Vision-Capable Model Capability Matrix

**Generated:** 2026-07-15 · **Method:** empirical probe via `scripts/vision-probe.mjs`
(Ground truth = 4 quadrants red/green/blue/yellow; `EXPECTED=['red','green','blue','yellow']`;
assertion checks **content correctness**, not just HTTP 200. Verdicts: `VISION_ON` ≥3
matched / no refusal, `PARTIAL`, `STATED_NO_IMAGE`, `GENERIC_OR_HALLUCINATED`, `NO_RESPONSE`.)

> **Rule:** a catalog `modalities.input` / `attachment` field is **NOT** proof of vision.
> Only a live image probe counts. API keys are redacted from all outputs.

---

## A. Router-probeable vision models (graded through the key-router at 127.0.0.1:8788)

### nvidia / NIM (`provider=nvidia`, upstream `integrate.api.nvidia.com/v1`)

Empirically **VISION_ON/4** (router echoes the model id, so it is actually served):

| Router lane                                            | NIM model id (vendor-prefixed)                  | Verdict     | R status                             |
| ------------------------------------------------------ | ----------------------------------------------- | ----------- | ------------------------------------ |
| `nvidia:meta/llama-3.2-11b-vision-instruct`            | `meta/llama-3.2-11b-vision-instruct`            | VISION_ON/4 | 200                                  |
| `nvidia:meta/llama-3.2-90b-vision-instruct`            | `meta/llama-3.2-90b-vision-instruct`            | VISION_ON/4 | 200                                  |
| `nvidia:nvidia/llama-3.1-nemotron-nano-vl-8b-v1`       | `nvidia/llama-3.1-nemotron-nano-vl-8b-v1`       | VISION_ON/4 | 200                                  |
| `nvidia:nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` | `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` | VISION_ON/4 | 200                                  |
| `nvidia:nvidia/nemotron-nano-12b-v2-vl`                | `nvidia/nemotron-nano-12b-v2-vl`                | VISION_ON/4 | 200 _(newly confirmed this session)_ |

Registered but **not routable right now**:

| Router lane                                      | NIM model id                                     | Status           | Why                                                                                                                                                                            |
| ------------------------------------------------ | ------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `nvidia:minimaxai/minimax-m3`                    | `minimaxai/minimax-m3`                           | **400 DEGRADED** | Real multimodal NIM build; NVIDIA-side account quota is in `DEGRADED` state (`Function id 87ea0ddc-…`). Vision **proven VISION_ON via logfare**. Clears when NIM quota resets. |
| `nvidia:microsoft/phi-3-vision-128k-instruct`    | `microsoft/phi-3-vision-128k-instruct`           | 404              | Not deployed on this NIM route right now                                                                                                                                       |
| `nvidia:microsoft/phi-4-multimodal-instruct`     | `microsoft/phi-4-multimodal-instruct`            | 410              | Not deployed (Gone)                                                                                                                                                            |
| `nvidia:llama-3.2-nemoretriever-1b-vlm-embed-v1` | `nvidia/llama-3.2-nemoretriever-1b-vlm-embed-v1` | 404              | **Embed-only** (no `/chat/completions` vision)                                                                                                                                 |
| `nvidia:llama-nemotron-embed-vl-1b-v2`           | `nvidia/llama-nemotron-embed-vl-1b-v2`           | 404              | **Embed-only** (no `/chat/completions` vision)                                                                                                                                 |

**Critical catalog-ID rule (this session):** NIM model ids require the **vendor prefix**
(`meta/`, `microsoft/`, `nvidia/`). The live survey (`tmp/nvidia-all-survey.json`, 121 models)
lists **bare** ids (`llama-3.1-nemotron-nano-vl-8b-v1`) → **404**. With the vendor prefix they
grade **VISION_ON/4**. So the nvidia/NIM vision catalogue is ~9 vision-ish entries; with correct
ids **5 are live VISION_ON**, 1 (minimax-m3) is live-but-NIM-degraded, 2 (phi) are undeployed,
2 are embed-only.

> `nvidia/meta/llama-3.2-11b-vision-instruct` graded **PARTIAL/2** in an earlier default sweep but
> **VISION_ON/4** on re-probe this session — flag as _occasionally flaky, generally vision-capable_.

### modelscope (`provider=modelscope`, upstream `api-inference.modelscope.ai/v1`)

| Router lane                                   | Verdict     | R status |
| --------------------------------------------- | ----------- | -------- |
| `modelscope:Qwen/Qwen3-VL-8B-Instruct`        | VISION_ON/4 | 200      |
| `modelscope:Qwen/Qwen3-VL-235B-A22B-Instruct` | VISION_ON/4 | 200      |

### openrouter (`provider=openrouter`, upstream `openrouter.ai/api/v1`)

| Router lane                                 | Verdict     | R status               |
| ------------------------------------------- | ----------- | ---------------------- |
| `openrouter:google/gemma-4-26b-a4b-it:free` | VISION_ON/4 | 200                    |
| `openrouter:moonshotai/kimi-k2.6:free`      | 404         | no route in key-router |

### logfare (`provider=logfare`, upstream `logfare.ai/v1`) — _reseller, flaky_

| Router lane                 | Verdict                       | R status           |
| --------------------------- | ----------------------------- | ------------------ |
| `logfare:minimax-m3`        | VISION_ON/4                   | 200                |
| `logfare:kimi-k2.6`         | 502 / GENERIC_OR_HALLUCINATED | upstream transient |
| `logfare:glm-5.2`           | GENERIC_OR_HALLUCINATED       | 503                |
| `logfare:grok-4.5`          | —                             | 503                |
| `logfare:deepseek-v4-flash` | —                             | 503                |
| `logfare:mimo-v2.5`         | —                             | 429                |

### zen (`provider=zen`, upstream `opencode.ai/zen/v1`)

| Router lane                 | Verdict     | R status |
| --------------------------- | ----------- | -------- |
| `zen:mimo-v2.5-free`        | VISION_ON/4 | 200      |
| `zen:gemini-3-flash`        | —           | 401      |
| `zen:gemini-3.5-flash`      | —           | 401      |
| `zen:minimax-m3`            | —           | 401      |
| `zen:kimi-k2.6`             | —           | 401      |
| `zen:qwen3.6-plus`          | —           | 401      |
| `zen:nemotron-3-ultra-free` | —           | 500      |
| `zen:north-mini-code-free`  | —           | 500      |

### agnes (`provider=agnes`, upstream `apihub.agnes-ai.com/v1`)

| Router lane             | Verdict     | R status                                                       |
| ----------------------- | ----------- | -------------------------------------------------------------- |
| `agnes:agnes-2.0-flash` | VISION_ON/4 | 200 _(only QA failure was nav-speed at 300s; vision is solid)_ |

### kilo (`provider=kilo`)

| Router lane                 | Verdict | R status               |
| --------------------------- | ------- | ---------------------- |
| `kilo:openrouter/owl-alpha` | 404     | no route in key-router |

---

## B. Catalog-only models (no route in key-router; benchmark-only)

These appear in `model-providers.json` catalogs but have **no route** in the key-router, so they
cannot be empirically probed here. Vision capability is from vendor docs / public benchmarks.

- `moonshotai/kimi-k2.6` — native multimodal
- `openai/gpt-5.5` — native multimodal
- `claude-opus-4-7` — native multimodal (2576px encoder)
- `meta/llama-3.2-90b-vision-instruct` — vision (trails Qwen3-VL-8B-Thinking)
- `microsoft/phi-4-multimodal-instruct` — vision
- `z-ai/glm-5.2` — vision

---

## C. Vision / multimodal benchmark scores (best public)

Canonical benchmarks tracked: **MMMU, MMMU-Pro, MMBench, MathVista, DocVQA, ChartQA,
MMStar, OCRBench, RealWorldQA, AI2D, SEED-Bench, MMVet, HallusionBench, TextVQA, POPE, BLINK,
LMArena-Vision.** `TBD` = no reliable public score found.

| Model                  | MMMU | MMMU-Pro        | MMBench | MathVista | DocVQA | ChartQA | VQAtest | POPE  | Other                                                     | Source                                |
| ---------------------- | ---- | --------------- | ------- | --------- | ------ | ------- | ------- | ----- | --------------------------------------------------------- | ------------------------------------- |
| Gemini 3 Flash         | TBD  | 81.2%           | 86.7%   | TBD       | TBD    | TBD     | TBD     | 85.6% | SOTA MMMU-Pro                                             | businessanalytics.substack; llm-stats |
| Qwen3-VL-8B (Thinking) | TBD  | TBD             | TBD     | TBD       | 90.1%  | 85.5%   | 95.3%   | TBD   |                                                           | llm-stats                             |
| Kimi K2.6              | TBD  | TBD             | TBD     | TBD       | TBD    | TBD     | TBD     | TBD   | BenchLM 74/100; SWE-Bench Pro 58.6%; Terminal-Bench 66.7% | benchlm.ai; llm-stats; deepinfra      |
| MiniMax M3             | TBD  | (sep. vs gemma) | TBD     | TBD       | TBD    | TBD     | TBD     | TBD   | AA Intelligence Index 55; BenchLM 71                      | artificialanalysis.ai; benchlm.ai     |
| LLaMA 3.2 90B Vision   | TBD  | TBD             | TBD     | TBD       | <90.1% | <85.5%  | <95.3%  | TBD   | trails Qwen3-VL-8B-Thinking                               | llm-stats                             |
| Claude Opus 4.7        | TBD  | TBD             | TBD     | TBD       | TBD    | TBD     | TBD     | TBD   | BenchLM #7/79 prov.                                       | benchlm.ai                            |
| GPT-5.5                | TBD  | TBD             | TBD     | TBD       | TBD    | TBD     | TBD     | TBD   | BenchLM #13/79; ARC-AGI-2 85%; GPQA 93.6%                 | benchlm.ai; vals.ai                   |
| agnes-2.0-flash        | TBD  | TBD             | TBD     | TBD       | TBD    | TBD     | TBD     | TBD   |                                                           | TBD                                   |
| phi-4-multimodal       | TBD  | TBD             | TBD     | TBD       | TBD    | TBD     | TBD     | TBD   |                                                           | TBD                                   |
| glm-5.2                | TBD  | TBD             | TBD     | TBD       | TBD    | TBD     | TBD     | TBD   |                                                           | TBD                                   |
| nemotron-nano-vl       | TBD  | TBD             | TBD     | TBD       | TBD    | TBD     | TBD     | TBD   |                                                           | TBD                                   |

Sources: benchlm.ai, llm-stats.com, artificialanalysis.ai, vals.ai, pricepertoken.com,
deepinfra, mindstudio.ai, vellum.ai, model cards.

---

## D. Key findings / corrections (this session)

1. **nvidia/NIM has a large vision catalogue** (121 models in the live survey; ~9 vision-ish).
   Only **5 are live VISION_ON** with correct vendor-prefixed ids; the rest are undeployed (phi),
   embed-only, or (minimax-m3) live-but-NIM-degraded.
2. **`minimax-m3` IS routed through nvidia** — registered (`minimaxai/minimax-m3`) and multimodal.
   The `400` is NVIDIA's account-level `DEGRADED` function state, _not_ a missing model or a
   text-only build. Vision is proven VISION_ON via the **logfare** route.
3. **Vendor-prefix rule:** NIM model ids need `meta/`, `microsoft/`, `nvidia/` prefixes. Bare
   survey ids 404. (`nvidia/llama-3.1-nemotron-nano-vl-8b-v1` works; `llama-3.1-nemotron-nano-vl-8b-v1` 404s.)
4. **logfare/zen resellers are flaky** (kimi 502s, glm/grok/deepseek 503, mimo 429) — avoid for
   time-critical vision work; `agnes` is the reliable vision worker.
5. **`agnes/agnes-2.0-flash`** is the one model both available _and_ VISION_ON — use for research
   (websearch works) and as the grader in hybrid QA (reads PNGs, no nav → no timeout).

---

## Proven probe commands

```bash
# Full default sweep (26 lanes)
node scripts/vision-probe.mjs --out=tmp/vision-probe-results-YYYY-MM-DD.json

# Router-only, specific lanes (COLON format, --flag=value — NOT space, NOT slash)
node scripts/vision-probe.mjs --router-only \
  --lanes='nvidia:meta/llama-3.2-90b-vision-instruct,nvidia:nvidia/nemotron-nano-12b-v2-vl' \
  --out=tmp/grade-nvidia2.json

# Local verify + grade (no router)
node scripts/vision-probe.mjs --verify=tmp/vp-h.png --grade=tmp/vp-h.png
```

Raw grade artifacts: `tmp/grade-nvidia.json`, `tmp/grade-nvidia2.json`,
`tmp/grade-nvidia-minimax.json`, `tmp/grade-missing.json`,
`tmp/vision-probe-results-2026-07-15T14-14-05-690Z.json`.
