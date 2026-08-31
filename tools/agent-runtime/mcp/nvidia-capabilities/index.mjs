#!/usr/bin/env node
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const serverInfo = {
  name: "nvidia-capabilities-mcp-server",
  version: "0.1.0",
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(moduleDir, "../../../..")

const allowedHosts = new Set([
  "integrate.api.nvidia.com",
  "ai.api.nvidia.com",
  "build.api.nvidia.com",
  "docs.api.nvidia.com",
  "cuopt.api.nvidia.com",
  "climate.api.nvidia.com",
  "health.api.nvidia.com",
  "optimize.api.nvidia.com",
  "api.nvcf.nvidia.com",
])

const allowedHostSuffixes = [
  ".api.nvidia.com",
  ".invocation.api.nvcf.nvidia.com",
]

const capabilityCatalog = [
  {
    id: "llm_chat",
    category: "chat",
    routeClass: "current-router",
    status: "wired",
    examples: ["deepseek-ai/deepseek-v4-flash", "moonshotai/kimi-k2.6", "minimaxai/minimax-m3", "nvidia/nemotron-3-ultra-550b-a55b"],
    notes: "OpenAI-compatible chat and coding models belong in the existing key router/model picker.",
  },
  {
    id: "vision_language_chat",
    category: "vision",
    routeClass: "current-router-or-direct-api",
    status: "partial",
    examples: ["nvidia/nemotron-nano-12b-v2-vl", "meta/llama-3.2-90b-vision-instruct", "microsoft/phi-4-multimodal-instruct", "moonshotai/kimi-k2.6"],
    notes: "Keep VLM chat in the model picker when Pi can send image content correctly. Use capability tools only for non-chat image/video APIs.",
  },
  {
    id: "retrieval",
    category: "retrieval",
    routeClass: "mixed",
    status: "needs-smoke",
    examples: ["nvidia/nv-embedqa-e5-v5", "nvidia/llama-nemotron-embed-1b-v2", "nvidia/llama-nemotron-rerank-1b-v2", "nvidia/nvclip"],
    notes: "Embeddings, rerank, and image-text similarity may need endpoint-specific payloads even when the model appears in /v1/models.",
  },
  {
    id: "parse_ocr_document_ai",
    category: "document",
    routeClass: "dedicated-api",
    status: "needs-endpoint-schema",
    examples: ["nvidia/nemoretriever-parse", "nvidia/nemotron-parse", "nemotron-ocr-v1", "nemotron-table-structure-v1"],
    notes: "Expose as tools that accept file paths and return structured JSON/artifact paths.",
  },
  {
    id: "image_generation",
    category: "image",
    routeClass: "dedicated-api",
    status: "needs-endpoint-schema",
    examples: ["black-forest-labs/flux.1-dev", "black-forest-labs/flux.1-schnell", "black-forest-labs/flux.1-kontext-dev", "stabilityai/stable-diffusion-xl"],
    notes: "Do not route through /nvidia/v1/chat/completions. Use NVIDIA Visual GenAI endpoints and save generated media to disk.",
  },
  {
    id: "image_editing",
    category: "image",
    routeClass: "dedicated-api",
    status: "needs-endpoint-schema",
    examples: ["black-forest-labs/flux.1-kontext-dev", "qwen-image-edit"],
    notes: "Tool should accept image_path plus prompt and return output image path.",
  },
  {
    id: "video_generation_editing",
    category: "video",
    routeClass: "dedicated-api-async",
    status: "needs-endpoint-schema",
    examples: [
      "nvidia/cosmos3-nano",
      "nvidia/cosmos-transfer2.5-2b",
      "nvidia/cosmos-predict1-5b",
      "stabilityai/stable-video-diffusion",
      "nvidia/relighting",
      "nvidia/lipsync",
    ],
    notes: "Expect submit/status/download flow. Keep execution opt-in because quota cost may be high.",
  },
  {
    id: "speech_to_text",
    category: "speech",
    routeClass: "dedicated-api",
    status: "needs-endpoint-schema",
    examples: ["parakeet-*", "canary-1b-asr", "whisper-large-v3", "nemotron-asr-streaming"],
    notes: "Expose as speech_to_text(file_path) -> transcript plus metadata.",
  },
  {
    id: "text_to_speech",
    category: "speech",
    routeClass: "dedicated-api",
    status: "needs-endpoint-schema",
    examples: ["magpie-tts-multilingual", "magpie-tts-zeroshot", "chatterbox-multilingual-tts", "nemotron-voicechat"],
    notes: "Expose as text_to_speech(text, voice, out_path) -> audio artifact path.",
  },
  {
    id: "translation",
    category: "speech",
    routeClass: "current-router-or-dedicated-api",
    status: "partial",
    examples: ["nvidia/riva-translate-4b-instruct", "riva-translate-1.6b", "megatron-1b-nmt"],
    notes: "Some translation models are chat-like; others are speech/NMT microservices.",
  },
  {
    id: "weather_climate",
    category: "climate",
    routeClass: "dedicated-api",
    status: "needs-endpoint-schema",
    examples: ["nvidia/corrdiff", "nvidia/fourcastnet"],
    notes: "Weather/climate NIMs are not chat models. Expect tensor/file inputs and domain-specific schemas.",
  },
  {
    id: "route_optimization",
    category: "optimization",
    routeClass: "dedicated-api-async",
    status: "needs-endpoint-schema",
    examples: ["nvidia/cuopt"],
    notes: "Expose as optimization tools with submit/status/result semantics.",
  },
  {
    id: "healthcare_bio",
    category: "healthcare",
    routeClass: "dedicated-api",
    status: "needs-endpoint-schema",
    examples: ["alphafold2", "boltz2", "diffdock", "evo2-40b", "genmol", "molmim", "vista3d"],
    notes: "Specialized bio/medical endpoints. Keep out of normal subagent prompt surface until a task needs them.",
  },
  {
    id: "safety_moderation",
    category: "safety",
    routeClass: "current-router-or-dedicated-api",
    status: "partial",
    examples: ["nvidia/gliner-pii", "meta/llama-guard-4-12b", "nvidia/nemoguard-jailbreak-detect"],
    notes: "Useful for PII scrubbing and report safety checks. Some are chat-like, some are classifier endpoints.",
  },
]

const endpointDefaults = {
  imageGenerate: {
    "black-forest-labs/flux.1-dev": "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev",
    "black-forest-labs/flux.1-schnell": "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell",
    "black-forest-labs/flux.2-klein-4b": "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b",
    "stabilityai/stable-diffusion-xl": "https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-xl",
    "stabilityai/stable-diffusion-3-medium": "https://ai.api.nvidia.com/v1/genai/stabilityai/stable-diffusion-3-medium",
  },
  imageEdit: {
    "black-forest-labs/flux.1-kontext-dev": "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-kontext-dev",
    "black-forest-labs/flux.2-klein-4b": "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.2-klein-4b",
  },
  video: {
    "nvidia/cosmos3-nano": "https://api.nvcf.nvidia.com/v2/nvcf/pexec/functions/d09cd49d-d7f2-4361-928f-ea22af707249",
    "stabilityai/stable-video-diffusion": "https://ai.api.nvidia.com/v1/genai/stabilityai/stable-video-diffusion",
    "microsoft/trellis": "https://ai.api.nvidia.com/v1/genai/microsoft/trellis",
  },
  speechToText: {
    custom: "",
  },
  textToSpeech: {
    custom: "",
  },
  climate: {
    corrdiff: "https://climate.api.nvidia.com/v1/v1/infer",
    fourcastnet: "https://climate.api.nvidia.com/v1/nvidia/fourcastnet",
  },
  cuopt: {
    submit: "https://optimize.api.nvidia.com/v1/nvidia/cuopt",
    status: "https://api.nvcf.nvidia.com/v2/nvcf/pexec/status",
  },
  bio: {
    alphafold2: "https://health.api.nvidia.com/v1/protein-structure/alphafold2/predict-structure-from-sequence",
    genmol: "https://health.api.nvidia.com/v1/biology/nvidia/genmol/generate",
    molmim: "https://health.api.nvidia.com/v1/biology/nvidia/molmim/generate",
    diffdock: "https://health.api.nvidia.com/v1/biology/mit/diffdock",
    boltz2: "https://health.api.nvidia.com/v1/biology/mit/boltz2/predict",
  },
  document: {
    "nvidia/nemoretriever-parse": "https://ai.api.nvidia.com/v1/cv/nvidia/nemoretriever-parse",
    "nvidia/nemotron-parse": "https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-parse",
  },
  retrieval: {
    embeddings: "https://integrate.api.nvidia.com/v1/embeddings",
    rerank: "https://ai.api.nvidia.com/v1/retrieval/nvidia/reranking",
  },
}

const tools = [
  {
    name: "nvidia_capabilities_catalog",
    description: "List NVIDIA capability families and whether each belongs in the chat router, a dedicated API tool, or an async job tool. Read-only and does not call NVIDIA.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Optional category filter: chat, vision, retrieval, document, image, video, speech, climate, optimization, healthcare, safety." },
        routeClass: { type: "string", description: "Optional route filter such as current-router, dedicated-api, dedicated-api-async, mixed, partial." },
        query: { type: "string", description: "Optional case-insensitive search across ids, examples, and notes." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "nvidia_router_models",
    description: "Fetch the current local NVIDIA chat-router /models list, or report why it is unavailable. This checks the local router only.",
    inputSchema: {
      type: "object",
      properties: {
        baseUrl: { type: "string", description: "Local NVIDIA router base URL.", default: "http://127.0.0.1:8788/nvidia/v1" },
        limit: { type: "number", description: "Maximum model ids to return.", default: 200 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "nvidia_official_endpoint_inventory",
    description: "Read the repo-local official NVIDIA endpoint inventory generated from NVIDIA docs. Returns endpoint names/categories without making provider calls.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string", description: "Optional category filter, for example Visual Models, multimodal, Healthcare, Retrieval, climate simulation." },
        query: { type: "string", description: "Optional case-insensitive search across endpoint names and reference paths." },
        limit: { type: "number", description: "Maximum endpoints to return.", default: 200 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "nvidia_endpoint_help",
    description: "Explain how to wire a NVIDIA capability as either a model-picker route or a dedicated tool, with suggested tool shape.",
    inputSchema: {
      type: "object",
      properties: {
        capability: { type: "string", description: "Capability id or keyword, for example image_generation, text_to_speech, weather, cuopt, flux, corrdiff." },
      },
      required: ["capability"],
      additionalProperties: false,
    },
  },
  {
    name: "nvidia_image_generate",
    description: "Generate an image through NVIDIA Visual GenAI. Dry-run by default. Use for FLUX or Stable Diffusion style text-to-image tasks.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Image prompt." },
        model: { type: "string", description: "Model id, for example black-forest-labs/flux.1-dev, black-forest-labs/flux.1-schnell, black-forest-labs/flux.2-klein-4b, stabilityai/stable-diffusion-xl.", default: "black-forest-labs/flux.1-dev" },
        endpointUrl: { type: "string", description: "Optional override for NVIDIA endpoint URL." },
        width: { type: "number", description: "Image width if supported by the selected model.", default: 1024 },
        height: { type: "number", description: "Image height if supported by the selected model.", default: 1024 },
        steps: { type: "number", description: "Inference steps if supported." },
        cfgScale: { type: "number", description: "Classifier-free guidance scale if supported." },
        seed: { type: "number", description: "Optional seed." },
        outputPath: { type: "string", description: "Optional output path if the API returns binary media." },
        requestBody: { description: "Optional complete request body override for exact NVIDIA schema." },
        execute: { type: "boolean", description: "Set true to send the request. Default false.", default: false },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
  },
  {
    name: "nvidia_image_edit",
    description: "Edit or transform an image through NVIDIA Visual GenAI. Dry-run by default. Accepts an image path and prompt, with endpoint/body override for exact schemas.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Edit instruction." },
        imagePath: { type: "string", description: "Local image file path to encode as a data URL when requestBody is not provided." },
        model: { type: "string", description: "Model id, for example black-forest-labs/flux.1-kontext-dev or black-forest-labs/flux.2-klein-4b.", default: "black-forest-labs/flux.1-kontext-dev" },
        endpointUrl: { type: "string", description: "Optional override for NVIDIA endpoint URL." },
        outputPath: { type: "string", description: "Optional output path if the API returns binary media." },
        requestBody: { description: "Optional complete request body override for exact NVIDIA schema." },
        execute: { type: "boolean", description: "Set true to send the request. Default false.", default: false },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
  },
  {
    name: "nvidia_video_generate",
    description: "Submit a NVIDIA video, video-editing, video-analysis, or 3D generation request, such as Cosmos, Stable Video Diffusion, LipSync, Relighting, or TRELLIS. Dry-run by default; many video APIs are async and require status polling.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Video/3D generation prompt." },
        imagePath: { type: "string", description: "Optional conditioning image path." },
        model: { type: "string", description: "Model id, for example nvidia/cosmos3-nano, nvidia/cosmos-transfer2.5-2b, stabilityai/stable-video-diffusion, nvidia/lipsync, nvidia/relighting, or microsoft/trellis.", default: "nvidia/cosmos3-nano" },
        endpointUrl: { type: "string", description: "Optional override for NVIDIA endpoint URL." },
        outputPath: { type: "string", description: "Optional output path if the API returns binary media." },
        requestBody: { description: "Optional complete request body override for exact NVIDIA schema." },
        execute: { type: "boolean", description: "Set true to send the request. Default false.", default: false },
      },
      additionalProperties: false,
    },
  },
  {
    name: "nvidia_async_status",
    description: "Poll NVIDIA Cloud Functions async status by requestId. Use after APIs return HTTP 202 with a request id.",
    inputSchema: {
      type: "object",
      properties: {
        requestId: { type: "string", description: "NVCF invocation request id." },
        endpointUrl: { type: "string", description: "Optional full status endpoint override." },
        execute: { type: "boolean", description: "Set true to poll. Default false.", default: false },
      },
      required: ["requestId"],
      additionalProperties: false,
    },
  },
  {
    name: "nvidia_speech_to_text",
    description: "Prepare or execute a NVIDIA speech-to-text request. Speech NIMs may be hosted as dedicated microservices, so endpointUrl or requestBody may be needed.",
    inputSchema: {
      type: "object",
      properties: {
        audioPath: { type: "string", description: "Local audio file path." },
        model: { type: "string", description: "ASR model/service name for documentation, for example parakeet, canary, whisper-large-v3, nemotron-asr-streaming." },
        endpointUrl: { type: "string", description: "NVIDIA ASR endpoint URL. Required until the exact hosted endpoint is confirmed." },
        requestBody: { description: "Optional complete request body override for exact NVIDIA schema." },
        execute: { type: "boolean", description: "Set true to send the request. Default false.", default: false },
      },
      required: ["audioPath"],
      additionalProperties: false,
    },
  },
  {
    name: "nvidia_text_to_speech",
    description: "Prepare or execute a NVIDIA text-to-speech request. TTS NIMs may be hosted as dedicated microservices, so endpointUrl or requestBody may be needed.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to synthesize." },
        voice: { type: "string", description: "Voice or speaker id if supported." },
        model: { type: "string", description: "TTS model/service name for documentation, for example magpie-tts-multilingual, magpie-tts-zeroshot, chatterbox-multilingual-tts." },
        endpointUrl: { type: "string", description: "NVIDIA TTS endpoint URL. Required until the exact hosted endpoint is confirmed." },
        outputPath: { type: "string", description: "Optional output path if the API returns audio." },
        requestBody: { description: "Optional complete request body override for exact NVIDIA schema." },
        execute: { type: "boolean", description: "Set true to send the request. Default false.", default: false },
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
  {
    name: "nvidia_weather_climate",
    description: "Run or plan NVIDIA Earth-2 climate/weather inference. Supports CorrDiff sample downscaling and FourCastNet sample forecasts. Dry-run by default.",
    inputSchema: {
      type: "object",
      properties: {
        model: { type: "string", enum: ["corrdiff", "fourcastnet"], default: "corrdiff" },
        inputId: { type: "number", description: "Built-in sample input id when supported." },
        samples: { type: "number", description: "CorrDiff output sample count.", default: 1 },
        steps: { type: "number", description: "CorrDiff diffusion steps.", default: 16 },
        seed: { type: "number", description: "Optional seed." },
        variables: { type: "string", description: "FourCastNet variables string when required." },
        endpointUrl: { type: "string", description: "Optional override for NVIDIA climate endpoint URL." },
        outputPath: { type: "string", description: "Optional output path for binary/tar/NumPy responses." },
        requestBody: { description: "Optional complete request body override for exact NVIDIA schema." },
        execute: { type: "boolean", description: "Set true to send the request. Default false.", default: false },
      },
      additionalProperties: false,
    },
  },
  {
    name: "nvidia_cuopt_submit",
    description: "Submit a NVIDIA cuOpt route optimization problem. cuOpt solves logistics/routing schedules for vehicles, stops, capacities, time windows, and costs. Dry-run by default.",
    inputSchema: {
      type: "object",
      properties: {
        data: { description: "OptimizedRoutingData object. Use data=null plus assetReferences for large inputs." },
        action: { type: "string", enum: ["cuOpt_OptimizedRouting", "cuOpt_RoutingValidator"], default: "cuOpt_OptimizedRouting" },
        parameters: { type: "object", description: "Optional cuOpt parameters object." },
        clientVersion: { type: "string", description: "cuOpt client version; use custom to skip version check.", default: "custom" },
        assetReferences: { type: "string", description: "Optional comma-separated NVCF asset IDs for large inputs." },
        endpointUrl: { type: "string", description: "Optional override for cuOpt submit endpoint." },
        requestBody: { description: "Optional complete request body override for exact NVIDIA schema." },
        execute: { type: "boolean", description: "Set true to send the request. Default false.", default: false },
      },
      additionalProperties: false,
    },
  },
  {
    name: "nvidia_cuopt_status",
    description: "Poll cuOpt/NVCF async status by requestId. Use when cuOpt returns HTTP 202.",
    inputSchema: {
      type: "object",
      properties: {
        requestId: { type: "string", description: "NVCF request id returned by cuOpt." },
        execute: { type: "boolean", description: "Set true to poll. Default false.", default: false },
      },
      required: ["requestId"],
      additionalProperties: false,
    },
  },
  {
    name: "nvidia_bio_request",
    description: "Run or plan NVIDIA healthcare/bio endpoint requests, including AlphaFold2, GenMol, MolMIM, DiffDock, and Boltz2. Dry-run by default.",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", enum: ["alphafold2", "genmol", "molmim", "diffdock", "boltz2"], default: "alphafold2" },
        sequence: { type: "string", description: "Protein/amino acid sequence for structure tasks." },
        smiles: { type: "string", description: "SMILES/SAFE sequence for molecular generation/docking tasks." },
        endpointUrl: { type: "string", description: "Optional override for NVIDIA healthcare endpoint URL." },
        outputPath: { type: "string", description: "Optional output path for PDB or other artifact responses." },
        requestBody: { description: "Optional complete request body override for exact NVIDIA schema." },
        execute: { type: "boolean", description: "Set true to send the request. Default false.", default: false },
      },
      additionalProperties: false,
    },
  },
  {
    name: "nvidia_document_parse",
    description: "Run or plan NVIDIA document/OCR/parse model requests. Dry-run by default; use imagePath or requestBody for exact schema.",
    inputSchema: {
      type: "object",
      properties: {
        imagePath: { type: "string", description: "Local document/image path." },
        model: { type: "string", description: "Model id, for example nvidia/nemoretriever-parse or nvidia/nemotron-parse.", default: "nvidia/nemoretriever-parse" },
        endpointUrl: { type: "string", description: "Optional override for NVIDIA parse endpoint URL." },
        outputPath: { type: "string", description: "Optional output path." },
        requestBody: { description: "Optional complete request body override for exact NVIDIA schema." },
        execute: { type: "boolean", description: "Set true to send the request. Default false.", default: false },
      },
      additionalProperties: false,
    },
  },
  {
    name: "nvidia_embed",
    description: "Create embeddings through NVIDIA. Defaults to the OpenAI-compatible embeddings endpoint; dry-run by default.",
    inputSchema: {
      type: "object",
      properties: {
        input: { description: "Text string or array of strings to embed." },
        model: { type: "string", description: "Embedding model id.", default: "nvidia/nv-embedqa-e5-v5" },
        endpointUrl: { type: "string", description: "Optional endpoint override." },
        requestBody: { description: "Optional complete request body override." },
        execute: { type: "boolean", description: "Set true to send the request. Default false.", default: false },
      },
      required: ["input"],
      additionalProperties: false,
    },
  },
  {
    name: "nvidia_rerank",
    description: "Rerank documents/passages against a query through NVIDIA. Dry-run by default.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search/query string." },
        passages: { type: "array", items: { type: "string" }, description: "Candidate passages/documents to rerank." },
        model: { type: "string", description: "Rerank model id.", default: "nvidia/rerank-qa-mistral-4b" },
        endpointUrl: { type: "string", description: "Optional endpoint override." },
        requestBody: { description: "Optional complete request body override." },
        execute: { type: "boolean", description: "Set true to send the request. Default false.", default: false },
      },
      required: ["query", "passages"],
      additionalProperties: false,
    },
  },
  {
    name: "nvidia_api_request",
    description: "Guarded generic NVIDIA API caller with key rotation. Dry-run by default. Only HTTPS NVIDIA API hosts are allowed. Saves media/binary responses to disk.",
    inputSchema: {
      type: "object",
      properties: {
        endpointUrl: { type: "string", description: "Full HTTPS NVIDIA API endpoint URL. Host must be an allowed NVIDIA API host." },
        method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"], default: "POST" },
        body: { description: "JSON body to send. Omit for GET." },
        headers: { type: "object", description: "Additional non-auth headers. Authorization is always injected from the NVIDIA key pool." },
        execute: { type: "boolean", description: "Must be true to actually send the request. Default false returns a dry-run request plan.", default: false },
        outputPath: { type: "string", description: "Optional output path for binary/media responses." },
        timeoutMs: { type: "number", description: "Request timeout in ms, capped at 120000.", default: 60000 },
      },
      required: ["endpointUrl"],
      additionalProperties: false,
    },
  },
  {
    name: "nvidia_media_tool_plan",
    description: "Build a safe plan for image, video, speech, weather, healthcare, or optimization capability wiring before executing quota-consuming requests.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["image_generate", "image_edit", "video_generate", "speech_to_text", "text_to_speech", "weather_climate", "route_optimization", "healthcare_bio", "document_parse"] },
        modelOrEndpoint: { type: "string", description: "Model or endpoint name if known, for example flux.1-dev, corrdiff, cuopt, parakeet, nemotron-parse." },
        inputSummary: { type: "string", description: "Short description of the intended input, without secrets or large payloads." },
      },
      required: ["kind"],
      additionalProperties: false,
    },
  },
]

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"))
  } catch {
    return undefined
  }
}

function addUnique(keys, key) {
  if (typeof key !== "string") return
  const trimmed = key.trim()
  if (!trimmed || keys.includes(trimmed)) return
  keys.push(trimmed)
}

function collectStringValues(value, predicate, keys) {
  if (typeof value === "string") {
    if (predicate(value)) addUnique(keys, value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStringValues(item, predicate, keys)
    return
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStringValues(item, predicate, keys)
  }
}

function parseKeyList(value) {
  return String(value || "")
    .split(/[\r\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function loadNvidiaKeys() {
  const keys = []
  const home = os.homedir()
  const auth = readJson(path.join(home, ".local", "share", "opencode", "auth.json"))
  const nvidiaFile = readJson(path.join(home, ".config", "opencode", "nvidia-nim-keys.json"))
  addUnique(keys, auth?.nvidia?.key)
  collectStringValues(nvidiaFile, (value) => /^nvapi-[A-Za-z0-9_-]{20,}$/.test(value), keys)
  for (const envName of ["NVIDIA_API_KEY", "NVIDIA_NIM_API_KEY", "NVIDIA_API_KEYS", "NVIDIA_NIM_API_KEYS"]) {
    for (const key of parseKeyList(process.env[envName])) addUnique(keys, key)
  }
  for (let index = 1; index <= 20; index += 1) {
    addUnique(keys, process.env[`NVIDIA_API_KEY_${index}`])
    addUnique(keys, process.env[`NVIDIA_NIM_API_KEY_${index}`])
  }
  return keys
}

function textResult(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2)
  return {
    content: [{ type: "text", text }],
    structuredContent: typeof value === "object" && value !== null ? value : { text },
  }
}

function errorResult(message, details = {}) {
  return textResult({ ok: false, error: message, ...details })
}

function filterCatalog(args = {}) {
  const category = String(args.category || "").toLowerCase()
  const routeClass = String(args.routeClass || "").toLowerCase()
  const query = String(args.query || "").toLowerCase()
  return capabilityCatalog.filter((entry) => {
    if (category && entry.category.toLowerCase() !== category) return false
    if (routeClass && !entry.routeClass.toLowerCase().includes(routeClass)) return false
    if (!query) return true
    const haystack = JSON.stringify(entry).toLowerCase()
    return haystack.includes(query)
  })
}

async function fetchLocalModels(args = {}) {
  const baseUrl = String(args.baseUrl || "http://127.0.0.1:8788/nvidia/v1").replace(/\/+$/, "")
  const limit = Math.max(1, Math.min(Number(args.limit || 200), 500))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 4000)
  try {
    const response = await fetch(`${baseUrl}/models`, { signal: controller.signal })
    const text = await response.text()
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = undefined
    }
    const ids = Array.isArray(parsed?.data) ? parsed.data.map((item) => item.id).filter(Boolean).slice(0, limit) : []
    return {
      ok: response.ok,
      status: response.status,
      baseUrl,
      count: ids.length,
      models: ids,
      note: response.ok ? "This is the local chat-router model list, not the full NVIDIA capability catalog." : text.slice(0, 1000),
    }
  } catch (error) {
    return {
      ok: false,
      baseUrl,
      error: error instanceof Error ? error.message : String(error),
      note: "The local key router may be stopped. This does not affect the static capability catalog.",
    }
  } finally {
    clearTimeout(timer)
  }
}

function endpointHelp(capability) {
  const needle = String(capability || "").toLowerCase()
  const matches = capabilityCatalog.filter((entry) => JSON.stringify(entry).toLowerCase().includes(needle))
  const primary = matches[0]
  if (!primary) {
    return {
      ok: false,
      capability,
      suggestion: "Run nvidia_capabilities_catalog with a broader query, then use nvidia_api_request in dry-run mode once you have an official endpoint URL.",
    }
  }
  const shouldBeTool = !primary.routeClass.includes("current-router") || primary.routeClass.includes("dedicated")
  return {
    ok: true,
    capability,
    matched: primary,
    routingDecision: shouldBeTool ? "dedicated_mcp_tool" : "model_picker_or_current_router",
    recommendedShape: recommendedToolShape(primary.id),
    safety: [
      "Keep execute=false while discovering schemas.",
      "Save media/binary outputs to files and return paths.",
      "Never include API keys in prompts, docs, reports, or generated artifacts.",
      "Treat NVIDIA Build free access as limited quota, not unlimited free usage.",
    ],
  }
}

function officialEndpointInventory(args = {}) {
  const file = path.join(repoRoot, "docs", "nvidia-nim-official-endpoints.md")
  const text = fs.readFileSync(file, "utf8")
  const categoryFilter = String(args.category || "").toLowerCase()
  const query = String(args.query || "").toLowerCase()
  const limit = Math.max(1, Math.min(Number(args.limit || 200), 500))
  const endpoints = []
  let currentCategory = ""
  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+?)\s*(?:\(\d+\))?\s*$/)
    if (heading) {
      currentCategory = heading[1].trim()
      continue
    }
    const bullet = line.match(/^-\s+(.+?)\s+<(.+?)>\s*$/)
    if (!bullet) continue
    const entry = {
      category: currentCategory,
      name: bullet[1].trim(),
      referencePath: bullet[2].trim(),
    }
    const haystack = JSON.stringify(entry).toLowerCase()
    if (categoryFilter && !currentCategory.toLowerCase().includes(categoryFilter)) continue
    if (query && !haystack.includes(query)) continue
    endpoints.push(entry)
    if (endpoints.length >= limit) break
  }
  return {
    ok: true,
    source: file,
    count: endpoints.length,
    endpoints,
    note: "This is documentation inventory only. Use endpoint-specific docs and nvidia_api_request dry-run before executing quota-consuming calls.",
  }
}

function recommendedToolShape(id) {
  if (id.includes("image")) return "nvidia_image_generate(prompt, model, width, height, seed, outputPath, execute=false) -> image path"
  if (id.includes("video")) return "nvidia_video_submit(prompt or input media, model, outputDir, execute=false) + nvidia_video_status(jobId)"
  if (id.includes("speech_to_text")) return "nvidia_speech_to_text(audioPath, language?, execute=false) -> transcript"
  if (id.includes("text_to_speech")) return "nvidia_text_to_speech(text, voice?, outputPath, execute=false) -> audio path"
  if (id.includes("weather") || id.includes("climate")) return "nvidia_weather_or_climate(model, inputFile or coordinates/time window, outputPath, execute=false)"
  if (id.includes("route")) return "nvidia_cuopt_submit(problemJson, execute=false) + nvidia_cuopt_status(jobId)"
  if (id.includes("healthcare")) return "nvidia_bio_request(model, domainInputFile, outputPath, execute=false)"
  if (id.includes("parse")) return "nvidia_parse_document(filePath, model, outputPath, execute=false) -> structured JSON"
  return "Use nvidia_api_request dry-run first, then add a narrower wrapper once the endpoint schema is verified."
}

function validateNvidiaUrl(endpointUrl) {
  let url
  try {
    url = new URL(endpointUrl)
  } catch {
    throw new Error("endpointUrl must be a valid absolute URL")
  }
  if (url.protocol !== "https:") throw new Error("Only HTTPS NVIDIA API URLs are allowed")
  const allowedBySuffix = allowedHostSuffixes.some((suffix) => url.hostname.endsWith(suffix) && url.hostname.length > suffix.length)
  if (!allowedHosts.has(url.hostname) && !allowedBySuffix) {
    throw new Error(`Host is not allowed: ${url.hostname}`)
  }
  return url
}

function safeHeaders(headers = {}) {
  const result = {}
  for (const [key, value] of Object.entries(headers || {})) {
    if (/^authorization$/i.test(key) || /^x-api-key$/i.test(key)) continue
    result[key] = String(value)
  }
  return result
}

function compactObject(value) {
  const result = {}
  for (const [key, item] of Object.entries(value || {})) {
    if (item === undefined || item === null || item === "") continue
    result[key] = item
  }
  return result
}

function fileToDataUrl(filePath) {
  if (!filePath) return undefined
  const resolved = path.resolve(String(filePath))
  const buffer = fs.readFileSync(resolved)
  const ext = path.extname(resolved).slice(1).toLowerCase()
  const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg"
    : ext === "webp" ? "image/webp"
      : ext === "gif" ? "image/gif"
        : ext === "wav" ? "audio/wav"
          : ext === "mp3" ? "audio/mpeg"
            : ext === "flac" ? "audio/flac"
              : "image/png"
  return `data:${mime};base64,${buffer.toString("base64")}`
}

function maybeFileDataUrl(filePath, execute, label = "file") {
  if (!filePath) return undefined
  return execute ? fileToDataUrl(filePath) : `<${label} will be base64-encoded from ${path.resolve(String(filePath))} when execute=true>`
}

function summarizeBody(value, depth = 0) {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value === "string") {
    if (value.startsWith("data:")) return `<data-url ${value.length} chars redacted>`
    return value.length > 500 ? `${value.slice(0, 500)}...<truncated ${value.length} chars>` : value
  }
  if (typeof value !== "object") return value
  if (depth >= 4) return "<nested object redacted>"
  if (Array.isArray(value)) {
    return value.slice(0, 8).map((item) => summarizeBody(item, depth + 1))
  }
  const result = {}
  for (const [key, item] of Object.entries(value).slice(0, 30)) {
    result[key] = summarizeBody(item, depth + 1)
  }
  return result
}

function outputPathFor(contentType, requestedPath) {
  if (requestedPath) return path.resolve(String(requestedPath))
  const ext = contentType.includes("image/") ? contentType.split("/")[1].split(";")[0]
    : contentType.includes("audio/") ? contentType.split("/")[1].split(";")[0]
      : contentType.includes("video/") ? contentType.split("/")[1].split(";")[0]
        : contentType.includes("json") ? "json"
          : "bin"
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").slice(0, 10) || "bin"
  return path.resolve(process.cwd(), "reports", "nvidia-capabilities", `nvidia-${Date.now()}.${safeExt}`)
}

function outputPathWithExt(kind, ext, requestedPath) {
  if (requestedPath) return path.resolve(String(requestedPath))
  return path.resolve(process.cwd(), "reports", "nvidia-capabilities", `${kind}-${Date.now()}.${ext}`)
}

function findFirstStringByKeys(value, keys) {
  if (!value || typeof value !== "object") return undefined
  const keySet = new Set(keys.map((key) => key.toLowerCase()))
  const queue = [value]
  while (queue.length) {
    const current = queue.shift()
    if (!current || typeof current !== "object") continue
    if (Array.isArray(current)) {
      queue.push(...current)
      continue
    }
    for (const [key, item] of Object.entries(current)) {
      if (typeof item === "string" && keySet.has(key.toLowerCase()) && item.trim()) return item
      if (item && typeof item === "object") queue.push(item)
    }
  }
  return undefined
}

function saveBase64Artifact(data, kind, requestedPath) {
  let value = findFirstStringByKeys(data, ["b64_json", "base64", "image", "audio", "video", "data"])
  if (!value || !/^[A-Za-z0-9+/=\r\n]+$/.test(value.replace(/^data:[^,]+,/, "").trim())) return undefined
  const mimeMatch = value.match(/^data:([^;]+);base64,/)
  value = value.replace(/^data:[^,]+;base64,/, "")
  const mime = mimeMatch?.[1] || ""
  const ext = mime.includes("jpeg") ? "jpg"
    : mime.includes("png") ? "png"
      : mime.includes("webp") ? "webp"
        : mime.includes("mpeg") ? "mp3"
          : mime.includes("wav") ? "wav"
            : mime.includes("video") ? "mp4"
              : kind === "image" ? "png"
                : kind === "audio" ? "wav"
                  : kind === "video" ? "mp4"
                    : "bin"
  const outPath = outputPathWithExt(kind, ext, requestedPath)
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  const buffer = Buffer.from(value, "base64")
  fs.writeFileSync(outPath, buffer)
  return { outputPath: outPath, bytes: buffer.length, artifactKind: kind }
}

function saveTextArtifact(text, kind, ext, requestedPath) {
  if (!text) return undefined
  const outPath = outputPathWithExt(kind, ext, requestedPath)
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, text, "utf8")
  return { outputPath: outPath, bytes: Buffer.byteLength(text, "utf8"), artifactKind: kind }
}

function extractRequestId(data) {
  return findFirstStringByKeys(data, ["requestId", "request_id", "reqId", "id"])
}

function postprocessNvidiaData(data, options = {}) {
  const result = {}
  if (data && typeof data === "object") {
    const requestId = extractRequestId(data)
    if (requestId) result.requestId = requestId
  }
  if (options.artifactKind && data && typeof data === "object") {
    const artifact = saveBase64Artifact(data, options.artifactKind, options.outputPath)
    if (artifact) Object.assign(result, artifact)
  }
  if (options.textArtifactKeys && data && typeof data === "object") {
    const text = findFirstStringByKeys(data, options.textArtifactKeys)
    const artifact = saveTextArtifact(text, options.artifactKind || "nvidia", options.textExt || "txt", options.outputPath)
    if (artifact) Object.assign(result, artifact)
  }
  return Object.keys(result).length ? result : undefined
}

async function nvidiaImageGenerate(args = {}) {
  const model = String(args.model || "black-forest-labs/flux.1-dev")
  const endpointUrl = args.endpointUrl || endpointDefaults.imageGenerate[model]
  if (!endpointUrl) return { ok: false, error: `No default endpoint for image model '${model}'. Provide endpointUrl.`, knownModels: Object.keys(endpointDefaults.imageGenerate) }
  const isStableDiffusion = model.includes("stable-diffusion")
  const body = args.requestBody || (isStableDiffusion
    ? compactObject({
      text_prompts: [{ text: args.prompt }],
      height: args.height || 1024,
      width: args.width || 1024,
      cfg_scale: args.cfgScale,
      seed: args.seed,
      steps: args.steps,
    })
    : compactObject({
      prompt: args.prompt,
      height: args.height || 1024,
      width: args.width || 1024,
      cfg_scale: args.cfgScale,
      seed: args.seed,
      steps: args.steps,
    }))
  return guardedNvidiaRequest({
    endpointUrl,
    method: "POST",
    body,
    outputPath: args.outputPath,
    execute: args.execute,
    timeoutMs: 120000,
    postprocess: { artifactKind: "image", outputPath: args.outputPath },
  })
}

async function nvidiaImageEdit(args = {}) {
  const model = String(args.model || "black-forest-labs/flux.1-kontext-dev")
  const endpointUrl = args.endpointUrl || endpointDefaults.imageEdit[model]
  if (!endpointUrl) return { ok: false, error: `No default endpoint for image edit model '${model}'. Provide endpointUrl.`, knownModels: Object.keys(endpointDefaults.imageEdit) }
  const body = args.requestBody || compactObject({
    prompt: args.prompt,
    image: maybeFileDataUrl(args.imagePath, args.execute, "image"),
  })
  return guardedNvidiaRequest({
    endpointUrl,
    method: "POST",
    body,
    outputPath: args.outputPath,
    execute: args.execute,
    timeoutMs: 120000,
    postprocess: { artifactKind: "image", outputPath: args.outputPath },
  })
}

async function nvidiaVideoGenerate(args = {}) {
  const model = String(args.model || "nvidia/cosmos3-nano")
  const endpointUrl = args.endpointUrl || endpointDefaults.video[model]
  if (!endpointUrl) return { ok: false, error: `No default endpoint for video/3D model '${model}'. Provide endpointUrl.`, knownModels: Object.keys(endpointDefaults.video) }
  const body = args.requestBody || compactObject({
    prompt: args.prompt,
    image: maybeFileDataUrl(args.imagePath, args.execute, "image"),
  })
  return guardedNvidiaRequest({
    endpointUrl,
    method: "POST",
    body,
    outputPath: args.outputPath,
    execute: args.execute,
    timeoutMs: 120000,
    postprocess: { artifactKind: "video", outputPath: args.outputPath },
  })
}

async function nvidiaAsyncStatus(args = {}) {
  const endpointUrl = args.endpointUrl || `${endpointDefaults.cuopt.status}/${encodeURIComponent(String(args.requestId))}`
  return guardedNvidiaRequest({
    endpointUrl,
    method: "GET",
    execute: args.execute,
    timeoutMs: 60000,
  })
}

async function nvidiaSpeechToText(args = {}) {
  if (!args.endpointUrl) {
    return {
      ok: false,
      dryRun: true,
      error: "Speech NIM hosted endpoint URL is not confirmed in local config. Provide endpointUrl after selecting the exact ASR service.",
      model: args.model || "",
      suggestedUse: "Use this wrapper once the ASR endpoint is known; it will encode audioPath or send your requestBody through the guarded NVIDIA caller.",
    }
  }
  const body = args.requestBody || compactObject({
    audio: maybeFileDataUrl(args.audioPath, args.execute, "audio"),
    model: args.model,
  })
  return guardedNvidiaRequest({
    endpointUrl: args.endpointUrl,
    method: "POST",
    body,
    execute: args.execute,
    timeoutMs: 120000,
  })
}

async function nvidiaTextToSpeech(args = {}) {
  if (!args.endpointUrl) {
    return {
      ok: false,
      dryRun: true,
      error: "Speech NIM hosted endpoint URL is not confirmed in local config. Provide endpointUrl after selecting the exact TTS service.",
      model: args.model || "",
      suggestedUse: "Use this wrapper once the TTS endpoint is known; it will save audio responses to outputPath when provided.",
    }
  }
  const body = args.requestBody || compactObject({
    text: args.text,
    voice: args.voice,
    model: args.model,
  })
  return guardedNvidiaRequest({
    endpointUrl: args.endpointUrl,
    method: "POST",
    body,
    outputPath: args.outputPath,
    execute: args.execute,
    timeoutMs: 120000,
    postprocess: { artifactKind: "audio", outputPath: args.outputPath },
  })
}

async function nvidiaWeatherClimate(args = {}) {
  const model = String(args.model || "corrdiff").toLowerCase()
  const endpointUrl = args.endpointUrl || endpointDefaults.climate[model]
  if (!endpointUrl) return { ok: false, error: `Unknown climate model '${model}'. Use corrdiff or fourcastnet, or provide endpointUrl.` }
  const body = args.requestBody || (model === "fourcastnet"
    ? compactObject({
      input_id: args.inputId ?? 0,
      variables: args.variables || "u10m,v10m,t2m,sp,msl",
    })
    : compactObject({
      input_id: args.inputId ?? 1,
      samples: args.samples ?? 1,
      steps: args.steps ?? 16,
      seed: args.seed,
    }))
  const headers = model === "fourcastnet" ? { "NVCF-POLL-SECONDS": "5", Accept: "application/json" } : { Accept: "application/json" }
  return guardedNvidiaRequest({
    endpointUrl,
    method: "POST",
    body,
    headers,
    outputPath: args.outputPath,
    execute: args.execute,
    timeoutMs: 120000,
    postprocess: { artifactKind: model, outputPath: args.outputPath },
  })
}

async function nvidiaCuoptSubmit(args = {}) {
  const endpointUrl = args.endpointUrl || endpointDefaults.cuopt.submit
  const body = args.requestBody || compactObject({
    action: args.action || "cuOpt_OptimizedRouting",
    data: args.data === undefined ? null : args.data,
    parameters: args.parameters || null,
    client_version: args.clientVersion || "custom",
  })
  const headers = args.assetReferences ? { "NVCF-INPUT-ASSET-REFERENCES": String(args.assetReferences) } : {}
  return guardedNvidiaRequest({
    endpointUrl,
    method: "POST",
    body,
    headers,
    execute: args.execute,
    timeoutMs: 120000,
  })
}

async function nvidiaBioRequest(args = {}) {
  const task = String(args.task || "alphafold2").toLowerCase()
  const endpointUrl = args.endpointUrl || endpointDefaults.bio[task]
  if (!endpointUrl) return { ok: false, error: `Unknown bio task '${task}'.`, knownTasks: Object.keys(endpointDefaults.bio) }
  const body = args.requestBody || compactObject({
    sequence: args.sequence,
    smiles: args.smiles,
  })
  return guardedNvidiaRequest({
    endpointUrl,
    method: "POST",
    body,
    outputPath: args.outputPath,
    execute: args.execute,
    timeoutMs: 120000,
    postprocess: task === "alphafold2"
      ? { artifactKind: "alphafold2", textArtifactKeys: ["pdb", "pdb_text", "structure", "output"], textExt: "pdb", outputPath: args.outputPath }
      : { artifactKind: task, outputPath: args.outputPath },
  })
}

async function nvidiaDocumentParse(args = {}) {
  const model = String(args.model || "nvidia/nemoretriever-parse")
  const endpointUrl = args.endpointUrl || endpointDefaults.document[model]
  if (!endpointUrl) return { ok: false, error: `No default endpoint for document parse model '${model}'. Provide endpointUrl.`, knownModels: Object.keys(endpointDefaults.document) }
  const body = args.requestBody || compactObject({
    image: maybeFileDataUrl(args.imagePath, args.execute, "document image"),
    model,
  })
  return guardedNvidiaRequest({
    endpointUrl,
    method: "POST",
    body,
    outputPath: args.outputPath,
    execute: args.execute,
    timeoutMs: 120000,
    postprocess: { artifactKind: "document-parse", outputPath: args.outputPath },
  })
}

async function nvidiaEmbed(args = {}) {
  const endpointUrl = args.endpointUrl || endpointDefaults.retrieval.embeddings
  const body = args.requestBody || compactObject({
    model: args.model || "nvidia/nv-embedqa-e5-v5",
    input: args.input,
  })
  return guardedNvidiaRequest({
    endpointUrl,
    method: "POST",
    body,
    execute: args.execute,
    timeoutMs: 120000,
  })
}

async function nvidiaRerank(args = {}) {
  const endpointUrl = args.endpointUrl || endpointDefaults.retrieval.rerank
  const body = args.requestBody || compactObject({
    model: args.model || "nvidia/rerank-qa-mistral-4b",
    query: args.query,
    passages: args.passages,
  })
  return guardedNvidiaRequest({
    endpointUrl,
    method: "POST",
    body,
    execute: args.execute,
    timeoutMs: 120000,
  })
}

async function guardedNvidiaRequest(args = {}) {
  const url = validateNvidiaUrl(args.endpointUrl)
  const method = String(args.method || "POST").toUpperCase()
  const execute = Boolean(args.execute)
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...safeHeaders(args.headers),
  }
  const hasBody = args.body !== undefined && method !== "GET"
  const requestPlan = {
    endpointUrl: url.toString(),
    method,
    headers: { ...headers, Authorization: "Bearer <redacted>" },
    hasBody,
    execute,
  }
  if (hasBody) requestPlan.bodyPreview = summarizeBody(args.body)
  if (!execute) {
    return {
      ok: true,
      dryRun: true,
      requestPlan,
      note: "Set execute=true to send this request. Keep dry-run while discovering endpoint schemas.",
    }
  }

  const keys = loadNvidiaKeys()
  if (!keys.length) return { ok: false, error: "No NVIDIA API keys found in local key sources or environment." }
  const timeoutMs = Math.max(1000, Math.min(Number(args.timeoutMs || 60000), 120000))
  const retryStatuses = new Set([401, 402, 403, 408, 409, 425, 429, 500, 502, 503, 504])
  const attempts = []

  for (let offset = 0; offset < keys.length; offset += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, {
        method,
        headers: { ...headers, Authorization: `Bearer ${keys[offset]}` },
        body: hasBody ? JSON.stringify(args.body) : undefined,
        signal: controller.signal,
      })
      const contentType = response.headers.get("content-type") || ""
      const attempt = { attempt: offset + 1, status: response.status, ok: response.ok, contentType }
      attempts.push(attempt)
      const buffer = Buffer.from(await response.arrayBuffer())
      if (!response.ok) {
        const bodyPreview = buffer.toString("utf8").slice(0, 1200)
        attempt.errorPreview = bodyPreview
        const nvcfAccountScopedMiss = response.status === 404 && /not found for account/i.test(bodyPreview)
        if ((retryStatuses.has(response.status) || nvcfAccountScopedMiss) && offset + 1 < keys.length) continue
        return { ok: false, requestPlan, attempts, status: response.status, errorPreview: bodyPreview }
      }
      // Binary check must be content-type driven only. Treating any call with
      // args.outputPath as binary caused FLUX/SD responses (Content-Type:
      // application/json wrapping base64 JPEG) to be saved as raw JSON text
      // instead of decoded image bytes.
      const looksBinaryFromHeader = /^(image|audio|video)\//.test(contentType) || contentType.includes("octet-stream")
      if (looksBinaryFromHeader) {
        const outPath = outputPathFor(contentType, args.outputPath)
        fs.mkdirSync(path.dirname(outPath), { recursive: true })
        fs.writeFileSync(outPath, buffer)
        return { ok: true, requestPlan, attempts, status: response.status, contentType, outputPath: outPath, bytes: buffer.length, artifactKind: "raw-binary" }
      }
      const text = buffer.toString("utf8")
      let parsed
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = undefined
      }
      const postprocessed = parsed && args.postprocess ? postprocessNvidiaData(parsed, args.postprocess) : undefined
      return {
        ok: true,
        requestPlan,
        attempts,
        status: response.status,
        contentType,
        ...(postprocessed ? { postprocessed } : {}),
        data: parsed ?? text.slice(0, 4000),
      }
    } catch (error) {
      attempts.push({ attempt: offset + 1, ok: false, error: error instanceof Error ? error.message : String(error) })
      if (offset + 1 >= keys.length) return { ok: false, requestPlan, attempts }
    } finally {
      clearTimeout(timer)
    }
  }
  return { ok: false, requestPlan, attempts, error: "All NVIDIA keys failed." }
}

function mediaToolPlan(args = {}) {
  const kind = String(args.kind || "")
  const catalog = filterCatalog({ query: kind.replace(/_/g, " ") })
  return {
    ok: true,
    kind,
    modelOrEndpoint: args.modelOrEndpoint || "",
    inputSummary: args.inputSummary || "",
    executeDefault: false,
    nextSteps: [
      "Find the official NVIDIA endpoint URL and request schema for this model.",
      "Use nvidia_api_request with execute=false to verify host/method/body shape.",
      "Run one tiny execute=true smoke only when the user explicitly wants to spend quota.",
      "Promote the verified request into a narrower wrapper tool after the schema is proven.",
    ],
    likelyCatalogMatches: catalog,
  }
}

async function callTool(name, args) {
  if (name === "nvidia_capabilities_catalog") {
    const capabilities = filterCatalog(args)
    return textResult({ ok: true, count: capabilities.length, capabilities })
  }
  if (name === "nvidia_router_models") return textResult(await fetchLocalModels(args))
  if (name === "nvidia_official_endpoint_inventory") return textResult(officialEndpointInventory(args))
  if (name === "nvidia_endpoint_help") return textResult(endpointHelp(args.capability))
  if (name === "nvidia_image_generate") return textResult(await nvidiaImageGenerate(args))
  if (name === "nvidia_image_edit") return textResult(await nvidiaImageEdit(args))
  if (name === "nvidia_video_generate") return textResult(await nvidiaVideoGenerate(args))
  if (name === "nvidia_async_status") return textResult(await nvidiaAsyncStatus(args))
  if (name === "nvidia_speech_to_text") return textResult(await nvidiaSpeechToText(args))
  if (name === "nvidia_text_to_speech") return textResult(await nvidiaTextToSpeech(args))
  if (name === "nvidia_weather_climate") return textResult(await nvidiaWeatherClimate(args))
  if (name === "nvidia_cuopt_submit") return textResult(await nvidiaCuoptSubmit(args))
  if (name === "nvidia_cuopt_status") return textResult(await nvidiaAsyncStatus(args))
  if (name === "nvidia_bio_request") return textResult(await nvidiaBioRequest(args))
  if (name === "nvidia_document_parse") return textResult(await nvidiaDocumentParse(args))
  if (name === "nvidia_embed") return textResult(await nvidiaEmbed(args))
  if (name === "nvidia_rerank") return textResult(await nvidiaRerank(args))
  if (name === "nvidia_api_request") return textResult(await guardedNvidiaRequest(args))
  if (name === "nvidia_media_tool_plan") return textResult(mediaToolPlan(args))
  return errorResult(`Unknown tool: ${name}`)
}

function response(id, result) {
  return JSON.stringify({ jsonrpc: "2.0", id, result })
}

function errorResponse(id, code, message) {
  return JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })
}

async function handleMessage(message) {
  const id = message.id
  try {
    if (message.method === "initialize") {
      return response(id, {
        protocolVersion: message.params?.protocolVersion || "2024-11-05",
        capabilities: { tools: { listChanged: false } },
        serverInfo,
      })
    }
    if (message.method === "notifications/initialized") return undefined
    if (message.method === "tools/list") return response(id, { tools })
    if (message.method === "tools/call") {
      const result = await callTool(message.params?.name, message.params?.arguments || {})
      return response(id, result)
    }
    if (message.method === "ping") return response(id, {})
    return errorResponse(id, -32601, `Method not found: ${message.method}`)
  } catch (error) {
    return errorResponse(id, -32000, error instanceof Error ? error.message : String(error))
  }
}

let buffer = ""
process.stdin.setEncoding("utf8")
process.stdin.on("data", (chunk) => {
  buffer += chunk
  let newline
  while ((newline = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, newline).trim()
    buffer = buffer.slice(newline + 1)
    if (!line) continue
    let message
    try {
      message = JSON.parse(line)
    } catch {
      process.stdout.write(errorResponse(null, -32700, "Parse error") + "\n")
      continue
    }
    handleMessage(message).then((lineOut) => {
      if (lineOut) process.stdout.write(lineOut + "\n")
    })
  }
})

process.stderr.write(`${serverInfo.name} ${serverInfo.version} ready\n`)
