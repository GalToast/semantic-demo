# NVIDIA NIM Capability Catalog

Generated 2026-06-12 from:

- Local router: `GET http://127.0.0.1:8788/nvidia/v1/models`
- External subagent live catalog: `external_subagent_free_models compact=true`
- NVIDIA Build public catalog: <https://build.nvidia.com/models>
- NVIDIA publisher page: <https://build.nvidia.com/nvidia>
- NVIDIA speech catalog: <https://build.nvidia.com/explore/speech>

Do not store API keys, account identifiers, request headers, or raw provider responses here.

## Current Bottom Line

Our local OpenAI-compatible NVIDIA lane currently exposes 120 model IDs. This is broader than coding/chat: it includes agentic/code LLMs, multimodal and vision-language models, embeddings/retrieval, parsing, safety/PII, translation, and video-specialized models.

Exhaustive official endpoint checklist: [nvidia-nim-official-endpoints.md](nvidia-nim-official-endpoints.md).

Exhaustive NVIDIA Build card inventory: [nvidia-build-model-cards.md](nvidia-build-model-cards.md).

Important distinction:

- **Router-exposed now:** available through our local OpenAI-compatible NVIDIA route, at least at `/v1/models`. These still need endpoint-specific smoke tests before we call them reliable.
- **NVIDIA Build free endpoint, not currently in our chat router:** may require a dedicated NVIDIA API client because media/speech/video endpoints often are not plain chat-completions models.

## Best First Coding / Agentic Picks

Prioritize these for semantic-explorer subagents and repo work:

| Launch ref | Likely role | Notes |
|---|---|---|
| `nvidia/deepseek-ai/deepseek-v4-flash` | Fast coding/agent scout | Should be one of the first cheap repo-work probes. |
| `nvidia/deepseek-ai/deepseek-v4-pro` | Heavier coding/reasoning | Use for harder code review or debugging after flash scout. |
| `nvidia/moonshotai/kimi-k2.6` | Long-horizon coding + multimodal reasoning | Public catalog describes agentic tool use and image/video understanding; likely high-value but may need steering. |
| `nvidia/z-ai/glm-5.1` | Agentic coding/reasoning | Already observed as useful but very log-heavy through Pi. |
| `nvidia/nemotron-3-ultra-550b-a55b` | Heavy agentic reasoning, planning, tool calling | NVIDIA catalog positions it as 1M-context agent/coding/planning model. |
| `nvidia/nemotron-3-super-120b-a12b` | Agentic reasoning | Candidate when Ultra is rate-limited. |
| `nvidia/minimaxai/minimax-m2.7` | Coding/reasoning/office work | NVIDIA route may work even when ModelScope route rejected. |
| `nvidia/mistralai/mistral-medium-3.5-128b` | Coding/agentic text | NVIDIA-hosted Mistral option distinct from direct Mistral provider. |
| `nvidia/mistralai/mistral-small-4-119b-2603` | Smaller fast assistant | Good scout candidate. |
| `nvidia/stepfun-ai/step-3.7-flash` | Multimodal reasoning/coding | Worth testing for UI/vision + code tasks. |
| `nvidia/qwen/qwen3.5-397b-a17b` | Large Qwen reasoning | Test only when router health is good. |
| `nvidia/openai/gpt-oss-120b` | General reasoning/code | Needs per-model reasoning-level config if provider rejects high effort. |

## Router-Exposed Capability Groups

These model IDs are available from the local NVIDIA `/v1/models` list. Some appear in multiple groups because they are multimodal or retrieval-adjacent.

### Agentic, Coding, Reasoning, World-Knowledge Chat

`01-ai/yi-large`, `ai21labs/jamba-1.5-large-instruct`, `bigcode/starcoder2-15b`, `bytedance/seed-oss-36b-instruct`, `databricks/dbrx-instruct`, `deepseek-ai/deepseek-coder-6.7b-instruct`, `deepseek-ai/deepseek-v4-flash`, `deepseek-ai/deepseek-v4-pro`, `google/codegemma-1.1-7b`, `google/codegemma-7b`, `google/gemma-4-31b-it`, `ibm/granite-34b-code-instruct`, `ibm/granite-8b-code-instruct`, `meta/llama-4-maverick-17b-128e-instruct`, `minimaxai/minimax-m2.7`, `mistralai/codestral-22b-instruct-v0.1`, `mistralai/ministral-14b-instruct-2512`, `mistralai/mistral-7b-instruct-v0.3`, `mistralai/mistral-large`, `mistralai/mistral-large-2-instruct`, `mistralai/mistral-large-3-675b-instruct-2512`, `mistralai/mistral-medium-3.5-128b`, `mistralai/mistral-nemotron`, `mistralai/mistral-small-4-119b-2603`, `mistralai/mixtral-8x22b-v0.1`, `mistralai/mixtral-8x7b-instruct-v0.1`, `moonshotai/kimi-k2.6`, `nv-mistralai/mistral-nemo-12b-instruct`, `nvidia/mistral-nemo-minitron-8b-8k-instruct`, `nvidia/nemotron-3-nano-30b-a3b`, `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`, `nvidia/nemotron-3-super-120b-a12b`, `nvidia/nemotron-3-ultra-550b-a55b`, `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3-next-80b-a3b-instruct`, `qwen/qwen3.5-122b-a10b`, `qwen/qwen3.5-397b-a17b`, `sarvamai/sarvam-m`, `stepfun-ai/step-3.5-flash`, `stepfun-ai/step-3.7-flash`, `stockmark/stockmark-2-100b-instruct`, `upstage/solar-10.7b-instruct`, `writer/palmyra-creative-122b`, `writer/palmyra-fin-70b-32k`, `writer/palmyra-med-70b`, `writer/palmyra-med-70b-32k`, `z-ai/glm-5.1`, `zyphra/zamba2-7b-instruct`, `meta/codellama-70b`, `nvidia/llama3-chatqa-1.5-70b`.

### Vision / Multimodal / Image Understanding

`adept/fuyu-8b`, `google/deplot`, `google/gemma-3n-e2b-it`, `google/gemma-3n-e4b-it`, `google/gemma-4-31b-it`, `meta/llama-3.2-11b-vision-instruct`, `meta/llama-3.2-90b-vision-instruct`, `microsoft/kosmos-2`, `microsoft/phi-3-vision-128k-instruct`, `microsoft/phi-4-multimodal-instruct`, `nvidia/cosmos-reason2-8b`, `nvidia/ising-calibration-1-35b-a3b`, `nvidia/llama-3.1-nemotron-nano-vl-8b-v1`, `nvidia/llama-3.2-nemoretriever-1b-vlm-embed-v1`, `nvidia/llama-nemotron-embed-vl-1b-v2`, `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`, `nvidia/nemotron-nano-12b-v2-vl`, `nvidia/neva-22b`, `nvidia/nvclip`, `nvidia/vila`.

High-priority vision probes:

- `nvidia/moonshotai/kimi-k2.6` even though the local model name is not explicitly vision-tagged; NVIDIA Build describes it as multimodal with image/video understanding.
- `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` because NVIDIA describes it as understanding images, video, speech, and text.
- `nvidia/google/gemma-4-31b-it`, `nvidia/meta/llama-3.2-90b-vision-instruct`, `nvidia/microsoft/phi-4-multimodal-instruct`, `nvidia/nemotron-nano-12b-v2-vl`.

### Embeddings, Retrieval, Rerank, Similarity

`baai/bge-m3`, `nvidia/embed-qa-4`, `nvidia/llama-3.2-nemoretriever-1b-vlm-embed-v1`, `nvidia/llama-3.2-nv-embedqa-1b-v1`, `nvidia/llama-nemotron-embed-1b-v2`, `nvidia/llama-nemotron-embed-vl-1b-v2`, `nvidia/nemoretriever-parse`, `nvidia/nv-embed-v1`, `nvidia/nv-embedcode-7b-v1`, `nvidia/nv-embedqa-e5-v5`, `nvidia/nv-embedqa-mistral-7b-v2`, `nvidia/nvclip`, `snowflake/arctic-embed-l`.

Potential uses:

- Semantic Explorer business similarity and search embedding experiments.
- Code search or symbol-to-doc retrieval.
- Screenshot/image embedding experiments with `nvclip` or VL embed routes.

### Parsing, OCR-Like Structure, Document/Chart Extraction

`google/deplot`, `nvidia/nemoretriever-parse`, `nvidia/nemotron-parse`.

Potential uses:

- Turn screenshots, charts, PDFs, and rendered UI artifacts into structured notes.
- Convert visual QA screenshots into text evidence for small subagents.

### Safety, Moderation, PII, Guardrails

`meta/llama-guard-4-12b`, `nvidia/gliner-pii`, `nvidia/llama-3.1-nemoguard-8b-content-safety`, `nvidia/llama-3.1-nemoguard-8b-topic-control`, `nvidia/llama-3.1-nemotron-safety-guard-8b-v3`, `nvidia/nemotron-3-content-safety`, `nvidia/nemotron-3.5-content-safety`, `nvidia/nemotron-content-safety-reasoning-4b`.

Potential uses:

- Scrub PII from worker reports before archiving.
- Safety/abuse checks for generated web content or public-facing text.
- Topic and content moderation experiments.

### Translation / Speech-Adjacent Text Routes

`nvidia/riva-translate-4b-instruct`, `nvidia/riva-translate-4b-instruct-v1.1`.

Potential uses:

- Multilingual outreach copy, labels, business summaries, or UI copy.
- Translation smoke tests without reaching for a heavyweight chat model.

### Video-Specialized / Media Understanding Through Router

`nvidia/ai-synthetic-video-detector`, `nvidia/cosmos-reason2-8b`, `nvidia/neva-22b`, `nvidia/vila`.

Potential uses:

- Synthetic video detection, video/image reasoning, or media QA if endpoint payloads are supported by our client.
- These likely need dedicated payload tests; do not assume plain text chat is enough.

## NVIDIA Build Free Endpoints Not Yet Exposed By Our OpenAI-Compatible Router

These appear in NVIDIA Build as free endpoints or downloadable/free endpoints, but they did not appear in our local NVIDIA `/v1/models` list under these exact IDs. They may require dedicated API wiring outside chat completions.

| Capability | NVIDIA Build item | What it does | Router status |
|---|---|---|---|
| Text/image-to-video | `cosmos3-nano` | Physics-aware video generation from text or image prompt | Not in local `/v1/models` as `cosmos3-nano`; related `nvidia/cosmos-reason2-8b` is exposed. |
| Video/image understanding | `cosmos3-nano-reasoner` | Structured reasoning on videos or images | Not in local `/v1/models` under this ID. |
| Video relighting/editing | `Relighting` | Re-illuminates people in video with target HDRI lighting | Not in local `/v1/models`. |
| Synthetic video detection | `synthetic-video-detector` | Detects AI-generated/synthetic video | Exposed locally as `nvidia/ai-synthetic-video-detector`; needs payload smoke. |
| Active speaker detection | `Active Speaker Detection` | Detects and tracks speaker identities across video frames | Not in local `/v1/models`. |
| Lip sync / dubbing | `LipSync` | Syncs lips in video to input audio | Not in local `/v1/models`. |
| Speech-to-speech | `nemotron-voicechat` | Real-time voicechat style speech model | Not in local `/v1/models`. |
| Text-to-speech | `magpie-tts-multilingual`, `magpie-tts-zeroshot` | Multilingual and zero-shot TTS | Not in local `/v1/models`. |
| Speech-to-text | `parakeet-*`, `canary-1b-asr`, `whisper-large-v3` | ASR/transcription | Not in local `/v1/models`. |
| 3D generation | `TRELLIS` | Generates 3D assets from text or image input | Not in local `/v1/models`. |
| Image generation/editing | `qwen-image`, `qwen-image-edit` | Text-to-image and image editing | Not in local NVIDIA `/v1/models`; ModelScope has `Qwen-Image-Edit`. |
| 3D / OpenUSD search | `usdsearch` | AI-powered search over OpenUSD data, 3D models, images, and assets from text or image inputs | Not in local `/v1/models`; likely dedicated endpoint. |
| OpenUSD code | `usdcode` | OpenUSD knowledge Q&A and USD-Python code generation | In NVIDIA docs as chat-style route, not currently exposed locally. |
| OCR / document AI | `nemotron-ocr-v1`, `nemoretriever-ocr`, `nemotron-table-structure-v1`, `nemotron-page-elements-v3`, `nemotron-graphic-elements-v1` | OCR, table extraction, page element detection, document layout extraction | Some related parse routes are exposed locally; exact OCR/object-detection IDs are not. |
| Object/scene detection | `nv-dinov2`, `nv-grounding-dino`, `retail-object-detection`, `visual-changenet` | Image/video detection, grounding, change detection | Not exposed locally under these exact IDs. |
| Autonomous driving perception | `bevformer`, `sparsedrive`, `streampetr` | BEV perception, sparse driving stack, 3D object detection | Not exposed locally under these exact IDs. |
| Video/world generation | `cosmos-transfer1-7b`, `cosmos-transfer2.5-2b`, `cosmos-predict1-5b`, `cosmos-predict1-7b` | Physics-aware video/world-state generation and prediction | Not exposed locally under these exact IDs. |
| Audio cleanup | `Background Noise Removal` | Audio denoising for speech intelligibility | Not exposed locally. |
| Telepresence video | `eyecontact` | Estimates and redirects gaze in video | Not exposed locally. |
| Jailbreak detection | `nemoguard-jailbreak-detect` | Classifies text for jailbreak attempts | Not exposed locally under this ID. |
| Image generation | `FLUX.1-dev`, `FLUX.1-schnell`, `FLUX.1-Kontext-dev`, `flux.2-klein-4b`, `stable-diffusion-3.5-large` | Text-to-image and image edit/generation models | Not exposed locally through the NVIDIA chat router. |
| Audio enhancement | `Studio Voice`, `Background Noise Removal` | Speech enhancement / denoising | Not exposed locally. |
| ASR / speech-to-text | `canary-1b-asr`, `conformer-ctc-asr`, `nemotron-asr-streaming`, `parakeet-*`, `whisper-large-v3` | Transcription and speech recognition | Not exposed locally except translation-adjacent text routes. |
| TTS / voice | `magpie-tts-multilingual`, `magpie-tts-zeroshot`, `chatterbox-multilingual-tts`, `nemotron-voicechat` | Text-to-speech, zero-shot voice, voicechat | Not exposed locally. |
| Translation / NMT | `riva-translate-1.6b`, `riva-translate-4b-instruct-v1_1`, `megatron-1b-nmt` | Neural machine translation | Local router exposes `nvidia/riva-translate-4b-instruct` and `nvidia/riva-translate-4b-instruct-v1.1`; others not exposed. |
| Medical imaging / anatomy | `vista-3d` | Anatomy segmentation/annotation | Not exposed locally. |
| Bio / drug discovery | `alphafold2`, `alphafold2-multimer`, `Boltz-2`, `diffdock`, `esm2-650m`, `esmfold`, `evo2-40b`, `genmol`, `molmim`, `msa-search`, `openfold2`, `openfold3`, `proteinmpnn`, `rfdiffusion` | Protein structure, protein embeddings, molecular docking/generation, genomics | Not exposed locally. |
| Weather / climate | `corrdiff`, `fourcastnet` | Weather/climate downscaling and forecasting | Not exposed locally through chat router. |
| Logistics optimization | `cuopt` | Vehicle routing / optimization | Not exposed locally through chat router. |

## Official NVIDIA API Reference Surfaces To Investigate

The NVIDIA API reference is broader than our local OpenAI-compatible chat router. These categories may need separate clients, payload formats, and status-polling support.

| API family | Examples from NVIDIA docs | Endpoint shape / implication |
|---|---|---|
| Large language models | DeepSeek V4, GLM-5.1, Kimi K2.6, Nemotron, Mistral, Qwen, GPT OSS | Mostly chat/response style; best fit for our current router and external-subagent harness. |
| Retrieval APIs | `embed-qa-4`, `llama-nemotron-embed-*`, `llama-nemotron-rerank-*`, `nvclip`, `nv-embed*`, `nv-rerank*` | Embedding and reranking endpoints; not all are plain chat models. |
| Visual models | Flux, Stable Diffusion, Stable Video Diffusion, Trellis, detection, grounding, VLMs | Mixed image/video generation, image inference, async request/status patterns. |
| Multimodal APIs | Llama vision, Kimi, Qwen/Nemotron multimodal, Flux Kontext | Image/video/audio + text payloads; may need direct payload tests. |
| Healthcare / bio | `evo2-40b`, `alphafold2`, `alphafold2-multimer`, `proteinmpnn`, `rfdiffusion`, `esmfold`, `esm2-650m`, `boltz2`, `diffdock`, `genmol`, `molmim`, `vista3d`, `openfold2`, `openfold3` | Specialized bio/medical endpoints; likely not useful for Semantic Explorer but important for full capability inventory. |
| Route optimization | `nvidia/cuOpt` | Dedicated optimization API with submit + status polling, not chat. |
| Climate simulation | `nvidia/corrdiff`, `nvidia/fourcastnet` | Tensor/NumPy weather/climate inference; not chat. |
| Skills | NVIDIA Skills catalog, 118 skills observed | Agent skills for Codex/Claude/etc.; install surface is separate from NIM inference models. |

## NVIDIA Skills Catalog Notes

NVIDIA Build also exposes official agent skills, installable with:

```bash
npx skills add NVIDIA/skills
```

Observed high-signal skill areas:

- cuOpt optimization and routing skills.
- RAG Blueprint deployment/config/troubleshooting skills.
- DeepStream video analytics and vision model import skills.
- NemoClaw agent sandbox/setup/security/inference skills.
- CUDA-Q, DALI, Holoscan, MONAI, and accelerated-computing workflow skills.

These are not model endpoints, but they may be useful for Codex/Pi skills if we later want reusable workflows around NIM, video analytics, retrieval, or optimization.

## Smoke-Test Backlog

### Coding Subagent Reliability

1. `nvidia/deepseek-ai/deepseek-v4-flash`
2. `nvidia/deepseek-ai/deepseek-v4-pro`
3. `nvidia/moonshotai/kimi-k2.6`
4. `nvidia/minimaxai/minimax-m2.7`
5. `nvidia/mistralai/mistral-medium-3.5-128b`
6. `nvidia/stepfun-ai/step-3.7-flash`
7. `nvidia/qwen/qwen3.5-397b-a17b`

### Vision / UI QA Reliability

1. `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`
2. `nvidia/nemotron-nano-12b-v2-vl`
3. `nvidia/google/gemma-4-31b-it`
4. `nvidia/meta/llama-3.2-90b-vision-instruct`
5. `nvidia/microsoft/phi-4-multimodal-instruct`
6. `nvidia/cosmos-reason2-8b`

### Non-Chat API Wiring

1. Confirm whether our router should expose non-chat NVIDIA endpoints at all.
2. If yes, add endpoint-specific clients for TTS, ASR, video generation/editing, synthetic-video detection, 3D generation, retrieval/rerank, route optimization, climate, and bio/healthcare APIs.
3. Add smoke tests that do not burn large quota: model list, endpoint metadata, schema validation, status endpoint checks, and tiny requests only when explicitly useful.
4. Keep media generation off by default; generated audio/video/images should require an explicit task.

## Notes For Agents

- Use provider-qualified refs like `nvidia/moonshotai/kimi-k2.6`; do not strip the leading `nvidia/` when the same model exists elsewhere.
- `/v1/models` proves catalog exposure, not production reliability.
- Media/speech endpoints may not accept chat-completions payloads. Treat them as separate API clients until proven otherwise.
- Prefer cheap metadata probes first; only run generation requests when the task actually needs them.
