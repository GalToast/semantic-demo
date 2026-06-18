# Provider Weird Capability Map

Generated 2026-06-12 from local router catalogs plus provider docs. This file tracks AI capabilities beyond ordinary chat/code subagents.

Do not store API keys, account identifiers, request headers, or raw provider secrets here.

## Why This Exists

Several providers expose useful non-chat surfaces: image generation, image editing, video generation, audio, OCR, embeddings, rerank, route optimization, weather/climate, healthcare/bio, moderation, and specialist tool APIs. Some appear in `/v1/models`; others require direct endpoint clients with different payloads or async status polling.

The key distinction:

- **Subagent launch route:** usable through the external-subagent tool as a coding/reasoning worker.
- **Direct client route:** useful capability, but not a normal chat worker. It needs endpoint-specific code and smoke tests.

## Current Provider Map

| Provider family | Weird/cool capability classes | Current evidence | Integration path |
|---|---|---|---|
| NVIDIA NIM / Build | Healthcare/bio, weather/climate, route optimization, video/world generation, 3D generation, TTS, ASR, OCR/document AI, image generation/editing, safety, VLMs, embeddings/rerank | Local NVIDIA router exposes 120 chat-compatible-ish model IDs; NVIDIA Build/API docs expose many more endpoint families. See [nvidia-nim-capability-catalog.md](nvidia-nim-capability-catalog.md). | Mixed. Chat/VLM models can be subagents; weather, healthcare, TTS/ASR, video, 3D, and cuOpt need direct clients. |
| ModelScope | Large VLMs, Qwen image edit, DeepResearch, judge/eval, ERNIE VL, Qwen long-context/coder, DeepSeek V4, GLM, Step, MiniMax, Nex, MiMo | Local ModelScope router exposes 60 IDs. See [modelscope-capability-catalog.md](modelscope-capability-catalog.md). | Mostly subagent-compatible for text/VLM routes; image edit likely needs direct media payloads. Runtime quota needs verification. |
| Mistral direct | OCR 3, Voxtral TTS, Voxtral transcription/realtime, Devstral code agents, Codestral/Codestral Embed, moderation, multimodal generalists | Mistral docs list OCR 3, Voxtral Mini Transcribe Realtime, Voxtral TTS, Devstral 2, Codestral Embed, and Moderation 2. | Chat/code models can be subagents; OCR/audio/realtime/TTS need direct clients or provider-specific SDK paths. |
| OpenRouter | Image/audio/video/PDF-capable models, output modality filters, free router, fallback/provider routing, hosted model aliases | OpenRouter docs expose model filtering by output modalities and a free model router that selects compatible free models. | Mostly chat API compatible; media output/input requires model selection by modality and payload tests. |
| Kilo Code | Free/interactive model pool, OpenRouter-like aliases, duplicated routes for Owl/Nex/Nemotron/Poolside | Local external-subagent catalog exposes limited Kilo launch refs and duplicate routes. | Subagent-compatible when route works; must keep provider-qualified refs to avoid consuming the wrong quota. |
| Replicate / Fal-style inference | Image/video generation, voice, 3D, background removal, segmentation, upscaling, diffusion workflows | Not yet wired in this repo inventory. Commonly direct model endpoints with file URLs and async prediction status. | Direct clients; probably not subagent launch routes unless wrapped. |
| Hugging Face Inference / Spaces | Huge long-tail of research models: ASR, TTS, image, video, segmentation, classifiers, embeddings | Not yet wired in this repo inventory. Model availability and hardware can vary. | Direct clients or hosted Space automation; needs careful timeout/cost handling. |
| Google Vertex / Gemini | Multimodal Gemini, Imagen/Veo, embeddings, document AI, speech/translation via adjacent APIs | Not yet inventoried for our keys/router. | Mixed chat + direct media APIs. |
| Azure / AWS Bedrock | Provider-hosted foundation models plus document intelligence, speech, vision, translation, healthcare/comprehend-style services | Not yet inventoried for our keys/router. | Mostly direct cloud SDK clients; likely outside current free-provider focus. |
| Stability / ElevenLabs / specialist media APIs | Image/video generation, voice cloning, TTS, audio cleanup, dubbing | Not yet inventoried for our keys/router. | Direct clients; valuable for media demos, not coding subagents. |

## Highest-Value Weird Experiments

1. **NVIDIA cuOpt tiny route optimization**
   - Why: easiest non-chat endpoint to prove with a tiny JSON problem.
   - Use: route planning, logistics demos, optimization examples.
   - Client: direct endpoint, not a chat subagent.

2. **ModelScope / NVIDIA image edit**
   - Why: immediate visual payoff; Qwen Image Edit is present in ModelScope and NVIDIA Build.
   - Use: UI mockups, annotated screenshots, asset edits.
   - Client: direct media payload.

3. **NVIDIA TRELLIS / 3D generation**
   - Why: directly relevant to a 3D visual product if accessible.
   - Use: generate/inspect 3D assets or scene elements.
   - Client: direct media/asset endpoint.

4. **Mistral OCR 3**
   - Why: practical for PDFs, screenshots, docs, invoices, and visual QA evidence extraction.
   - Use: convert screenshots/PDFs into structured text for smaller subagents.
   - Client: direct OCR API.

5. **NVIDIA / Mistral speech lanes**
   - Why: TTS/ASR enables audio demos, voice notes, accessibility, and transcript pipelines.
   - Use: generated narration, speech-to-text, multilingual voice workflows.
   - Client: direct audio payloads.

6. **NVIDIA FourCastNet / CorrDiff**
   - Why: weather/climate is genuinely weird and cool.
   - Use: standalone scientific demo, not semantic-explorer.
   - Client: direct tensor/weather input. Higher setup cost than cuOpt.

7. **NVIDIA healthcare/bio endpoints**
   - Why: AlphaFold/OpenFold/Boltz/DiffDock/Evo2/GenMol/MolMIM/RFdiffusion are serious science endpoints.
   - Use: standalone bio demo only.
   - Client: direct FASTA/PDB/SMILES/medical-image payloads. Not relevant to semantic-explorer.

8. **OpenRouter modality-filtered model discovery**
   - Why: lets us automatically find image/audio/video/PDF-capable routes instead of hardcoding guesses.
   - Use: keep external-subagent picker and router catalog fresh.
   - Client: OpenRouter models API, then route-specific smokes.

## Immediate Backlog

1. Add a provider inventory script that records:
   - provider
   - model or endpoint id
   - modality in/out
   - subagent launchable yes/no
   - direct client needed yes/no
   - smoke-test status
   - quota/rate notes without secrets

2. Add direct-client smoke scaffolds for:
   - NVIDIA cuOpt
   - Mistral OCR
   - ModelScope Qwen Image Edit
   - OpenRouter modality-filtered model discovery

3. Keep external-subagent model catalog separate from weird endpoint catalog:
   - [subagent-model-catalog.md](subagent-model-catalog.md) = worker performance.
   - This file = provider capability surface.

## Source Links

- NVIDIA Build model catalog: <https://build.nvidia.com/models>
- NVIDIA NIM API reference: <https://docs.api.nvidia.com/nim/reference/models-1>
- NVIDIA OpenFold3 overview: <https://docs.nvidia.com/nim/bionemo/openfold3/latest/overview.html>
- Mistral model overview: <https://docs.mistral.ai/models/overview>
- Mistral OCR article: <https://mistral.ai/news/mistral-ocr/>
- OpenRouter model docs: <https://openrouter.ai/docs/guides/overview/models>
- OpenRouter models API reference: <https://openrouter.ai/docs/api/api-reference/models/get-models>
- OpenRouter free router: <https://openrouter.ai/openrouter/free>
