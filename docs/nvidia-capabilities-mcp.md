# NVIDIA Capabilities MCP

This repo now has a local MCP server for NVIDIA API capabilities:

`tools/agent-runtime/mcp/nvidia-capabilities/`

## Routing Rule

Use two separate surfaces:

- **Model picker / key router:** chat-like models, coding models, and VLM chat models that work through OpenAI-compatible chat payloads.
- **MCP tools:** non-chat NVIDIA capabilities such as image generation/editing, video generation/editing, text-to-speech, speech-to-text, climate/weather simulation, cuOpt route optimization, healthcare/bio endpoints, document parsing, OCR, and specialized retrieval/rerank endpoints.

The existing local NVIDIA router is intentionally scoped to the OpenAI-compatible lane at `https://integrate.api.nvidia.com/v1`. That host can expose many LLM/VLM model IDs through `/v1/models`, but it is not proof that FLUX, Stable Diffusion, speech, weather, healthcare, or cuOpt are callable through `/v1/chat/completions` or `/v1/images/generations`.

## Tools

- `nvidia_capabilities_catalog` - static catalog of capability families and routing decisions.
- `nvidia_router_models` - local router `/models` probe for chat-router visibility.
- `nvidia_official_endpoint_inventory` - full local endpoint inventory generated from official NVIDIA docs.
- `nvidia_endpoint_help` - routing and wrapper guidance for a named capability.
- `nvidia_media_tool_plan` - safe plan builder for media/domain tools.
- `nvidia_image_generate` / `nvidia_image_edit` - NVIDIA Visual GenAI image tools.
- `nvidia_video_generate` / `nvidia_async_status` - video, 3D, and async job helpers.
- `nvidia_speech_to_text` / `nvidia_text_to_speech` - speech wrappers once the exact hosted Speech NIM endpoint is selected.
- `nvidia_weather_climate` - Earth-2 CorrDiff and FourCastNet wrapper.
- `nvidia_cuopt_submit` / `nvidia_cuopt_status` - cuOpt optimization submit and polling.
- `nvidia_bio_request` - AlphaFold2, GenMol, MolMIM, DiffDock, Boltz2 style bio/healthcare wrapper.
- `nvidia_document_parse` - document/OCR/parse wrapper.
- `nvidia_embed` / `nvidia_rerank` - retrieval helpers.
- `nvidia_api_request` - guarded generic NVIDIA API caller and escape hatch.

`nvidia_api_request` is dry-run by default. Agents must pass `execute: true` before it sends a request. This prevents accidental quota burn while agents are discovering endpoint schemas.

## Key Handling

The MCP server does not store keys in the repo or Pi config. It reads NVIDIA keys from the local user-scoped sources already used by the router:

- `%USERPROFILE%\.local\share\opencode\auth.json`
- `%USERPROFILE%\.config\opencode\nvidia-nim-keys.json`
- NVIDIA-related environment variables

Returned request plans redact authorization headers.

## Artifact Handling

Image, audio, video, and binary responses are saved to disk and returned as file paths. Default output directory:

`reports/nvidia-capabilities/`

Executed JSON responses are postprocessed when possible:

- JSON-embedded base64 image/audio/video data is saved as an artifact.
- AlphaFold2-like PDB text is saved as `.pdb`.
- Async `requestId` / `reqId` fields are surfaced for `nvidia_async_status` and `nvidia_cuopt_status`.
- Large climate, archive, and binary responses should be written to `outputPath` or the default artifact directory.

## Next Endpoint Wrappers

As each official endpoint schema is verified, promote it from `nvidia_api_request` dry-runs into a narrower wrapper:

- `nvidia_image_generate`
- `nvidia_image_edit`
- `nvidia_video_submit`
- `nvidia_video_status`
- `nvidia_speech_to_text`
- `nvidia_text_to_speech`
- `nvidia_weather_or_climate`
- `nvidia_cuopt_submit`
- `nvidia_parse_document`

Keep quota-consuming tools opt-in and file-backed.
