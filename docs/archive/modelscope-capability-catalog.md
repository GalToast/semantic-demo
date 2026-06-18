# ModelScope Capability Catalog

Generated 2026-06-12 from local router:

- `GET http://127.0.0.1:8788/modelscope/v1/models`
- Snapshot artifact: `tmp/modelscope-router-models-2026-06-12.json`

Do not store API keys, account identifiers, request headers, or raw provider secrets here.

## Current Bottom Line

The local ModelScope lane currently exposes 60 model IDs through the router. This is not just a chat/code lane. It includes large vision-language models, image-edit models, deep-research models, judge/eval models, GLM, Step, MiniMax, Nex, DeepSeek, ERNIE, Qwen, and MiMo routes.

Observed issue: a delegated ModelScope DeepSeek V4 Flash inventory worker launched successfully, dumped the catalog, then hit a ModelScope quota error on the actual model call. Treat `/v1/models` exposure as catalog availability, not runtime reliability. Cooldown/key rotation still needs testing before ModelScope becomes a heavy subagent lane.

## Verified Public Source Notes (2026-06-13)

| Route / family | Public date | Official source | Capability note for this repo |
|---|---|---|---|
| `modelscope/deepseek-ai/DeepSeek-V4-Flash` / `modelscope/deepseek-ai/DeepSeek-V4-Pro` | DeepSeek API support dated 2026-04-24 | <https://api-docs.deepseek.com/updates> | Strong code/reasoning lane when ModelScope quota is healthy; not a visual QA model. |
| `modelscope/Qwen/Qwen3-VL-235B-A22B-Instruct` | Qwen announcement was published in 2025; source checked 2026-06-13 | <https://qwen.ai/blog?from=research.latest-advancements-list&id=99f0335c4ad9ff6153e517418d48535ab6d8afef>, <https://www.modelscope.ai/models/Qwen/Qwen3-VL-235B-A22B-Instruct> | Highest-value ModelScope visual QA candidate for screenshot/spatial reasoning and possibly video-dynamics critique after smoke. |
| `modelscope/Qwen/Qwen3-VL-8B-Instruct` / `modelscope/Qwen/Qwen3-VL-8B-Thinking` | Same Qwen3-VL family as above | <https://qwen.ai/blog?from=research.latest-advancements-list&id=99f0335c4ad9ff6153e517418d48535ab6d8afef> | Cheaper visual QA smoke target before spending on 235B. |
| `modelscope/XiaomiMiMo/MiMo-V2-Flash` / direct MiMo V2.5 family | Xiaomi docs list `mimo-v2.5` and `mimo-v2.5-pro` releases on 2026-04-23 | <https://mimo.mi.com/docs/en-US/updates/model> | Direct paid MiMo is the proven implementation baseline; ModelScope MiMo routes still need tool-call/runtime smokes before product use. |

## Capability Groups

### DeepSeek / Coding / Reasoning

- `modelscope/deepseek-ai/DeepSeek-V3.1`
- `modelscope/deepseek-ai/DeepSeek-V3.2`
- `modelscope/deepseek-ai/DeepSeek-V3.2-Exp`
- `modelscope/deepseek-ai/DeepSeek-V4-Flash`
- `modelscope/deepseek-ai/DeepSeek-V4-Pro`

Use first for cheap code-reading probes and router/runtime reliability checks.

### Vision, VLM, Visual Reasoning, Image Editing

- `modelscope/OpenGVLab/InternVL3_5-241B-A28B`
- `modelscope/PaddlePaddle/ERNIE-4.5-VL-28B-A3B-PT`
- `modelscope/Qwen/QVQ-72B-Preview`
- `modelscope/Qwen/Qwen-Image-Edit`
- `modelscope/MusePublic/Qwen-Image-Edit`
- `modelscope/Qwen/Qwen2.5-VL-3B-Instruct`
- `modelscope/Qwen/Qwen2.5-VL-7B-Instruct`
- `modelscope/Qwen/Qwen2.5-VL-32B-Instruct`
- `modelscope/Qwen/Qwen2.5-VL-72B-Instruct`
- `modelscope/Qwen/Qwen3-VL-8B-Instruct`
- `modelscope/Qwen/Qwen3-VL-8B-Thinking`
- `modelscope/Qwen/Qwen3-VL-235B-A22B-Instruct`

Highest-value semantic-explorer probes:

1. UI screenshot critique with `Qwen3-VL-235B-A22B-Instruct`.
2. Smaller screenshot probe with `Qwen3-VL-8B-Instruct`.
3. Image-edit smoke with `Qwen-Image-Edit` against a generated throwaway image.
4. Visual reasoning smoke with `QVQ-72B-Preview`.

### Research / Judge / Evaluation

- `modelscope/iic/Tongyi-DeepResearch-30B-A3B`
- `modelscope/opencompass/CompassJudger-1-32B-Instruct`
- `modelscope/Menlo/Jan-nano`
- `modelscope/Shanghai_AI_Laboratory/Intern-S1`
- `modelscope/Shanghai_AI_Laboratory/Intern-S1-mini`

Potential uses:

- Deep research scout for docs/provider inventories.
- Judge model for ranking UI screenshots or subagent final reports.
- Small-model sanity checks on whether a prompt is understandable.

### Qwen Long-Context / Code / General

- `modelscope/Qwen-Ambassador/Qwen3.7-Max`
- `modelscope/Qwen-Ambassador/Qwen3.7-Plus`
- `modelscope/Qwen/Qwen2.5-7B-Instruct-1M`
- `modelscope/Qwen/Qwen2.5-14B-Instruct-1M`
- `modelscope/Qwen/Qwen2.5-Coder-7B-Instruct`
- `modelscope/Qwen/Qwen2.5-Coder-14B-Instruct`
- `modelscope/Qwen/Qwen2.5-Coder-32B-Instruct`
- `modelscope/Qwen/Qwen3-Coder-30B-A3B-Instruct`
- `modelscope/Qwen/Qwen3-Next-80B-A3B-Instruct`
- `modelscope/Qwen/Qwen3-Next-80B-A3B-Thinking`
- `modelscope/Qwen/Qwen3-235B-A22B-Instruct-2507`
- `modelscope/Qwen/Qwen3-235B-A22B-Thinking-2507`

Potential uses:

- Long-context code audit.
- Qwen-family fallback when direct Qwen harness sessions are unhealthy.
- Compare Qwen thinking/non-thinking behavior through Pi.

### MiniMax / Nex / GLM / Step / MiMo / ERNIE

- `modelscope/MiniMax/MiniMax-M1-80k`
- `modelscope/MiniMax/MiniMax-M2.5`
- `modelscope/MiniMax/MiniMax-M2.7`
- `modelscope/nex-agi/Nex-N2-Pro`
- `modelscope/zai-org/GLM-4.7-Flash`
- `modelscope/zai-org/GLM-5`
- `modelscope/zai-org/GLM-5.1`
- `modelscope/stepfun-ai/Step-3.5-Flash`
- `modelscope/stepfun-ai/step3`
- `modelscope/XiaomiMiMo/MiMo-V2-Flash`
- `modelscope/PaddlePaddle/ERNIE-4.5-0.3B-PT`
- `modelscope/PaddlePaddle/ERNIE-4.5-21B-A3B-PT`
- `modelscope/PaddlePaddle/ERNIE-4.5-300B-A47B-PT`

Potential uses:

- Compare same/similar model families across NVIDIA, ModelScope, OpenRouter, Kilo, and direct providers.
- Use `Nex-N2-Pro`, GLM, and Step for UI/vision/code subagent probes.
- Use `MiMo-V2-Flash` only after tool-call behavior is tested; prior MiMo lanes have been inconsistent.

## Suggested Next Smokes

Run tiny probes before assigning real work:

1. `modelscope/Qwen/Qwen3-VL-235B-A22B-Instruct`: one local screenshot, ask for three layout defects.
2. `modelscope/OpenGVLab/InternVL3_5-241B-A28B`: same screenshot, compare critique quality.
3. `modelscope/iic/Tongyi-DeepResearch-30B-A3B`: report-only provider-doc inventory.
4. `modelscope/opencompass/CompassJudger-1-32B-Instruct`: rank two short subagent reports.
5. `modelscope/nex-agi/Nex-N2-Pro`: code + vision smoke.
6. `modelscope/zai-org/GLM-5.1`: focused code-reading smoke.
7. `modelscope/Qwen/Qwen-Image-Edit`: direct image-edit payload smoke, not a subagent worker.

## Agent Notes

- Always launch with the leading provider segment, for example `modelscope/Qwen/Qwen3-VL-235B-A22B-Instruct`.
- A ModelScope catalog entry is not enough; runtime quota can still fail.
- Image-edit routes probably need direct media payloads rather than normal chat-subagent prompts.
- Do not use ModelScope for heavy parallel waves until key rotation/cooldown behavior is verified.
