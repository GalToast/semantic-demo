# NVIDIA Capabilities MCP

Repo-local MCP server for NVIDIA API capabilities that do not belong in the chat model picker.

## Purpose

The existing local NVIDIA router is an OpenAI-compatible chat/model route. That is correct for LLMs and some VLMs, but not for every NVIDIA Build/NIM capability. Image generation, image editing, video generation, speech, climate/weather, healthcare/bio, route optimization, document parsing, and some retrieval endpoints have different URL shapes, payloads, async job flows, and artifact outputs.

This server exposes those capabilities as tools:

- `nvidia_capabilities_catalog`
- `nvidia_router_models`
- `nvidia_official_endpoint_inventory`
- `nvidia_endpoint_help`
- `nvidia_image_generate`
- `nvidia_image_edit`
- `nvidia_video_generate`
- `nvidia_async_status`
- `nvidia_speech_to_text`
- `nvidia_text_to_speech`
- `nvidia_weather_climate`
- `nvidia_cuopt_submit`
- `nvidia_cuopt_status`
- `nvidia_bio_request`
- `nvidia_document_parse`
- `nvidia_embed`
- `nvidia_rerank`
- `nvidia_api_request`
- `nvidia_media_tool_plan`

`nvidia_api_request` is guarded:

- dry-run by default
- only allows HTTPS NVIDIA API hosts
- injects NVIDIA auth from local key sources at runtime
- rotates through the local NVIDIA key pool on retryable errors
- redacts authorization from returned request plans
- saves image/audio/video/binary responses to disk

## Secret Handling

Do not put NVIDIA keys in this repo. The server reads the same local key sources used by the existing key router:

- `%USERPROFILE%\.local\share\opencode\auth.json`
- `%USERPROFILE%\.config\opencode\nvidia-nim-keys.json`
- `NVIDIA_API_KEY`, `NVIDIA_NIM_API_KEY`, `NVIDIA_API_KEYS`, `NVIDIA_NIM_API_KEYS`

## Usage

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\agent-runtime\mcp\nvidia-capabilities\run.ps1
```

Agents should first call the named task tools (`nvidia_image_generate`, `nvidia_weather_climate`, `nvidia_cuopt_submit`, etc.). Use `nvidia_api_request` only as an escape hatch when NVIDIA adds a new endpoint or the named wrapper needs an exact schema override. Quota-consuming requests should stay in dry-run mode until a user explicitly asks to execute them.

## Video / Media Endpoints

`nvidia_video_generate` resolves these verified or partially verified video and 3D endpoints without requiring a manual `endpointUrl`:

- `nvidia/cosmos3-nano` - text/image-to-video world generation. The Build model card exposes NVCF function `d09cd49d-d7f2-4361-928f-ea22af707249`; local keys tested on 2026-06-13 returned account-scoped 404, so this may require a different Build entitlement/key.
- `stabilityai/stable-video-diffusion` - image-to-video from a base64/data URI image.
- `microsoft/trellis` - 3D generation.

Build-catalog video/media cards seen but not yet endpoint-verified for local keys:

- `nvidia/cosmos-transfer2.5-2b` / `nvidia/cosmos-transfer2_5-2b` - physics-aware video/world transfer.
- `nvidia/cosmos-transfer1-7b` - physics-aware video/world transfer.
- `nvidia/cosmos-predict1-5b` - future-frame/world prediction from image or short video.
- `nvidia/lipsync` - lip dubbing from source video and audio.
- `nvidia/relighting` - video relighting against a target lighting environment.
- `nvidia/synthetic-video-detector` - synthetic video detection.
- `nvidia/active-speaker-detection` - active speaker detection/tracking in video.

Keep `execute=false` while discovering or adjusting request schemas. Use `requestBody` for model-specific payloads; the wrapper deliberately does not invent payload fields for complex video tools that require video, audio, HDRI, segmentation, depth, or scenario inputs.
