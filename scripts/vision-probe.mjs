#!/usr/bin/env node
// scripts/vision-probe.mjs — layered vision-capability probe (Direct / Router).
//
// Answers: "have we accidentally turned off vision in our models?" by bisecting
// the path between the caller and the upstream model:
//
//   D (Direct)   — POST image payload straight to the provider upstream base URL
//                  with that provider's actual upstream key. (bypasses our router)
//   R (Router)   — POST the same payload to http://127.0.0.1:8788/<prefix>/chat/completions
//                  (the path callers actually use). The router handles key selection.
//
// Diff (D,R) tells you WHERE vision died:
//   D ✓ / R ✗  -> the ROUTER strips / forwards the image content (regression we hunt)
//   D ✗        -> upstream model/provider does NOT support image (or key/route issue)
//   D ✓ / R ✓  -> vision path is intact through the router
//
// Assertion is content-graded (not just HTTP 200):
//   The image is a 16x16 PNG with 4 colored quadrants (red TL, green TR, blue BL, yellow BR).
//   Prompt asks for the colors in TL/TR/BL/BR order; "red, green, blue, yellow" == vision ON.
//   This rejects the silent-strip failure mode (200 OK with generic "I don't see an image").
//
// Output: tmp/vision-probe-results-<timestamp>.json  (+ human summary to stdout).
// No API-key values are echoed or written to disk.
//
// Usage:
//   node scripts/vision-probe.mjs                         # run the default LANES table
//   node scripts/vision-probe.mjs --lane=nvidia:moonshotai/kimi-k2.6  # single lane
//   node scripts/vision-probe.mjs --router-only           # skip D (skip upstream-bypass)
//   node scripts/vision-probe.mjs --out=tmp/x.json
//   node scripts/vision-probe.mjs --list                  # show the provider map + keys found

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const HOME = process.env.HOME || process.env.USERPROFILE || process.env.HOMEDRIVE + process.env.HOMEPATH
const OC_DIR = path.join(HOME, '.config/opencode')
const ROUTER = process.env.KEY_ROUTER_URL || 'http://127.0.0.1:8788'
const NOW = new Date().toISOString().replace(/[:.]/g, '-')

// ---- provider map (low-fidelity replica of the running router's PROVIDERS table, sources:
//      .../harness/servers/key-router/src/opencode-key-router.mjs lines 34-246) ----
const PROVIDERS = {
    zen: {
        upstreamBase: 'https://opencode.ai/zen/v1',
        configFile: 'zen-keys.json',
        routePrefix: '/opencode-zen/v1',
        authHeader: 'Bearer',
        envBase: null,
        altEnvBase: null,
        skipProcessEnv: false,
        extraBody: {}
    },
    nvidia: {
        upstreamBase: 'https://integrate.api.nvidia.com/v1',
        configFile: 'nvidia-nim-keys.json',
        routePrefix: '/nvidia/v1',
        authHeader: 'Bearer',
        envBase: 'NVIDIA_API_KEY',
        altEnvBase: null,
        skipProcessEnv: false,
        extraBody: {}
    },
    modelscope: {
        upstreamBase: 'https://api-inference.modelscope.ai/v1',
        configFile: 'modelscope-keys.json',
        routePrefix: '/modelscope/v1',
        authHeader: 'Bearer',
        envBase: 'MODELSCOPE_API_TOKEN',
        altEnvBase: 'MODELSCOPE_API_KEY',
        skipProcessEnv: true,
        extraBody: { include_reasoning: true, reasoning_split: true }
    },
    kilo: {
        upstreamBase: 'https://api.kilo.ai/api/gateway',
        configFile: 'kilo-keys.json',
        routePrefix: '/kilo/v1',
        authHeader: 'Bearer',
        envBase: 'KILO_API_KEY',
        altEnvBase: null,
        skipProcessEnv: false,
        extraBody: {}
    },
    openrouter: {
        upstreamBase: 'https://openrouter.ai/api/v1',
        configFile: 'openrouter-keys.json',
        routePrefix: '/openrouter/v1',
        authHeader: 'Bearer',
        envBase: 'OPENROUTER_API_KEY',
        altEnvBase: null,
        skipProcessEnv: false,
        extraBody: {}
    },
    freemodel: {
        upstreamBase: 'https://api.freemodel.dev/v1',
        configFile: 'freemodel-keys.json',
        routePrefix: '/freemodel/v1',
        authHeader: 'Bearer',
        envBase: 'FREEMODEL_API_KEY',
        altEnvBase: null,
        skipProcessEnv: false,
        extraBody: {}
    },
    logfare: {
        upstreamBase: 'https://logfare.ai/v1',
        configFile: 'logfare-keys.json',
        routePrefix: '/logfare/v1',
        authHeader: 'Bearer',
        envBase: 'LOGFARE_API_KEY',
        altEnvBase: null,
        skipProcessEnv: false,
        extraBody: {}
    },
    zydit: {
        upstreamBase: 'https://api.zydit.in/v1',
        configFile: 'zydit-keys.json',
        routePrefix: '/zydit/v1',
        authHeader: 'Bearer',
        envBase: 'ZYDIT_API_KEY',
        altEnvBase: null,
        skipProcessEnv: false,
        extraBody: {}
    },
    zyditv4: {
        upstreamBase: 'https://api.zydit.in/v4',
        configFile: 'zydit-keys.json',
        routePrefix: '/zydit/v4',
        authHeader: 'Bearer',
        envBase: 'ZYDIT_API_KEY',
        altEnvBase: null,
        skipProcessEnv: false,
        extraBody: {}
    },
    openprovider: {
        upstreamBase: 'https://openprovider.mimika.in/v1',
        configFile: 'openprovider-keys.json',
        routePrefix: '/openprovider/v1',
        authHeader: 'Bearer',
        envBase: 'OPENPROVIDER_API_KEY',
        altEnvBase: null,
        skipProcessEnv: false,
        extraBody: {}
    },
    neuralwatt: {
        upstreamBase: 'https://api.neuralwatt.com/v1',
        configFile: 'neuralwatt-keys.json',
        routePrefix: '/neuralwatt/v1',
        authHeader: 'Bearer',
        envBase: 'NEURALWATT_API_KEY',
        altEnvBase: null,
        skipProcessEnv: false,
        extraBody: {}
    },
    llm7: {
        upstreamBase: 'https://api.llm7.io/v1',
        configFile: 'llm7-keys.json',
        routePrefix: '/llm7/v1',
        authHeader: 'Bearer',
        envBase: 'LLM7_API_KEY',
        altEnvBase: null,
        skipProcessEnv: false,
        extraBody: {}
    },
    agnes: {
        upstreamBase: 'https://apihub.agnes-ai.com/v1',
        configFile: 'agnes-keys.json',
        routePrefix: '/agnes/v1',
        authHeader: 'Bearer',
        envBase: 'AGNES_AI_API_KEY',
        altEnvBase: null,
        skipProcessEnv: false,
        extraBody: {}
    },
    mistral: {
        upstreamBase: 'https://api.mistral.ai/v1',
        configFile: 'mistral-keys.json',
        routePrefix: '/mistral/v1',
        authHeader: 'Bearer',
        envBase: 'MISTRAL_API_KEY',
        altEnvBase: null,
        skipProcessEnv: false,
        extraBody: {}
    },
    // gemini: chat-completions shape → :generateContent conversion; SKIP D for now (router-side strip already known).
    gemini: {
        upstreamBase: 'https://generativelanguage.googleapis.com/v1beta',
        configFile: 'gemini-keys.json',
        routePrefix: '/gemini/v1',
        authHeader: 'x-goog-api-key',
        envBase: 'GEMINI_API_KEY',
        altEnvBase: 'GOOGLE_API_KEY',
        skipProcessEnv: false,
        extraBody: {},
        skipDirect: true
    },
    // cloudflare: URL templating needs account_id; SKIP D for now, keep R.
    cloudflare: {
        upstreamBase: 'CLOUDFLARE_TEMPLATE',
        configFile: 'cloudflare-workers-ai-keys.json',
        routePrefix: '/cloudflare/v1',
        authHeader: 'Bearer',
        envBase: null,
        altEnvBase: null,
        skipProcessEnv: false,
        extraBody: {},
        skipDirect: true
    }
}

// ---- default lanes ----
const DEFAULT_LANES = [
    // === vision-tagged sanity lanes (probe SHOULD return VISION_ON) ===
    { provider: 'openrouter', model: 'google/gemma-4-26b-a4b-it:free' }, // matrix \u2713 gemma vision, OR free
    { provider: 'openrouter', model: 'google/gemma-4-31b-it:free' }, // matrix \u2713 gemma vision, OR free
    { provider: 'nvidia', model: 'meta/llama-3.2-11b-vision-instruct' }, // matrix \u2713 LLaMA-vision on NIM (entitlement-dependent)
    { provider: 'nvidia', model: 'nvidia/llama-3.1-nemotron-nano-vl-8b-v1' }, // NIM VL (vision-language)
    { provider: 'nvidia', model: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning' }, // "omni" claim on NIM
    { provider: 'modelscope', model: 'Qwen/Qwen3-VL-8B-Instruct' }, // known vision on ModelScope
    // === user-named UNVERIFIED (what we came here to settle) ===
    { provider: 'modelscope', model: 'Tencent-Hunyuan/Hy3' }, // hy3 vision question (Hunyuan-3 on ModelScope)
    { provider: 'zen', model: 'hy3-free' }, // hy3 via OpenCode Zen free
    { provider: 'kilo', model: 'openrouter/owl-alpha' }, // AGENTS primary main lane (UNVERIFIED)
    { provider: 'openrouter', model: 'openrouter/owl-alpha' }, // same model on OpenRouter directly
    // === logfare free provider, matrix-\u2713 + UNVERIFIED models via this flakier reseller ===
    { provider: 'logfare', model: 'kimi-k2.6' }, // matrix \u2713 kimi-k2.6 (UNVERIFIED via logfare)
    { provider: 'logfare', model: 'minimax-m3' }, // matrix \u2713 via logfare
    { provider: 'logfare', model: 'mimo-v2.5' }, // matrix \u2713 via logfare
    { provider: 'logfare', model: 'glm-5.2' },
    { provider: 'logfare', model: 'grok-4.5' },
    { provider: 'logfare', model: 'deepseek-v4-flash' },
    // === OpenCode Zen free/paid roster (router routePrefix /opencode-zen/v1) ===
    { provider: 'zen', model: 'gemini-3-flash' }, // matrix \u2713 via zen
    { provider: 'zen', model: 'gemini-3.5-flash' },
    { provider: 'zen', model: 'minimax-m3' },
    { provider: 'zen', model: 'kimi-k2.6' },
    { provider: 'zen', model: 'mimo-v2.5-free' },
    { provider: 'zen', model: 'nemotron-3-ultra-free' },
    { provider: 'zen', model: 'north-mini-code-free' }, // tool_call:false per catalog — but probe image directly here
    { provider: 'zen', model: 'qwen3.6-plus' },
    { provider: 'zen', model: 'deepseek-v4-flash' },
    { provider: 'zen', model: 'big-pickle' }
]

// ---- arg parse ----
const argv = process.argv.slice(2)
const argHas = (s) => argv.includes(s)
const argVal = (s) => {
    const a = argv.find((x) => x.startsWith(s + '='))
    return a ? a.slice(s.length + 1) : null
}
const explicitLane = argVal('--lane')
const explicitLanes = argVal('--lanes')
const routerOnly = argHas('--router-only')
const listOnly = argHas('--list')
const idsOnly = argVal('--ids-only') // comma-list of provider:ids to probe (override defaults)
const perLaneTimeoutMs = Number(argVal('--timeout') ?? 60000)
const outPath = argVal('--out') || `tmp/vision-probe-results-${NOW}.json`
const harnessMode = argHas('--harness')
const gradeText = argVal('--grade')
const pngPath = argVal('--png') || 'tmp/vision-probe-groundtruth.png'
const harnessModel = argVal('--model') || 'agnes-2.0-flash'

let LANES = DEFAULT_LANES
if (explicitLane) LANES = [{ provider: explicitLane.split(':')[0], model: explicitLane.split(':').slice(1).join(':') }]
else if (explicitLanes || idsOnly) {
    const src = explicitLanes || idsOnly
    LANES = src
        .split(',')
        .filter(Boolean)
        .map((t) => ({ provider: t.split(':')[0], model: t.split(':').slice(1).join(':') }))
}

// ---- helpers ----
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function redactKeyInfo(k) {
    return k ? `<key len=${k.length} prefix=${k.slice(0, 6)}…>` : '<none>'
}

function readKeyFile(file) {
    try {
        if (!fs.existsSync(file)) return []
        const raw = fs.readFileSync(file, 'utf8').trim()
        const data = JSON.parse(raw)
        const pick = (item) => {
            if (typeof item === 'string' && item.length > 6) return item
            if (item && typeof item === 'object')
                return (
                    item.key ||
                    item.token ||
                    item.apiKey ||
                    item.value ||
                    (typeof item.keyId === 'string' && item.secret ? item.secret : null)
                )
            return null
        }
        if (Array.isArray(data)) return data.map(pick).filter(Boolean)
        if (data && typeof data === 'object') {
            for (const field of ['keys', 'tokens', 'apiKeys', 'secrets'])
                if (Array.isArray(data[field])) return data[field].map(pick).filter(Boolean)
            // object keyed by id => pick any string value > 8 chars
            return Object.values(data).filter((v) => typeof v === 'string' && v.length > 8)
        }
        return []
    } catch {
        return [] /* tolerant parse */
    }
}

function resolveUpstreamKey(p) {
    // 1. configFile pool (the router's primary source for those listed)
    if (p.configFile) {
        const pool = readKeyFile(path.join(OC_DIR, p.configFile))
        if (pool && pool.length) return { source: 'configFile', keys: pool }
    }
    // 2. env (respects skipProcessEnv by treating as last resort)
    if (p.envBase && process.env[p.envBase]) return { source: 'env:' + p.envBase, keys: [process.env[p.envBase]] }
    if (p.altEnvBase && process.env[p.altEnvBase])
        return { source: 'env:' + p.altEnvBase, keys: [process.env[p.altEnvBase]] }
    // 3. opencode.json inline options.apiKey (scan for any inline apiKey value)
    try {
        const ocPath = path.join(OC_DIR, 'opencode.json')
        if (fs.existsSync(ocPath)) {
            const txt = fs.readFileSync(ocPath, 'utf8')
            // find any "apiKey": "<value>" — naive but keeps us out of nested schema assumptions
            const matches = Array.from(
                txt.matchAll(
                    /"apiKey"\s*:\s*"(nvapi-[A-Za-z0-9_-]{20,}|sk-or-v1-[A-Za-z0-9_-]{20,}|sk-cp-[A-Za-z0-9_-]{20,}|sk-LJuR[A-Za-z0-9_-]{20,}|[A-Za-z0-9_-]{40,})"/g
                )
            )
            const values = matches.map((m) => m[1]).filter(Boolean)
            if (values.length) return { source: 'opencode.json:inline', keys: values }
        }
    } catch {
        /* opencode.json scan tolerant */
    }
    return { source: 'none', keys: [] }
}

// ---- probe image: 16x16 PNG with 4 colored quadrants (red, green, blue, yellow) ----
let CRC_TABLE = null
function crc32(buf) {
    if (!CRC_TABLE) {
        CRC_TABLE = new Int32Array(256)
        for (let n = 0; n < 256; n++) {
            let c = n
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
            CRC_TABLE[n] = c
        }
    }
    let c = 0xffffffff
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
}
function pngChunk(type, data) {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length, 0)
    const t = Buffer.from(type, 'ascii')
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0)
    return Buffer.concat([len, t, data, crc])
}
function generateProbeImage() {
    const W = 16,
        H = 16
    // quadrants: top-left=red (0,8)→(8,16); top-right=green; bottom-left=blue; bottom-right=yellow
    const blocks = [
        [0, 8, 0, 8, [255, 0, 0]],
        [8, 16, 0, 8, [0, 255, 0]],
        [0, 8, 8, 16, [0, 0, 255]],
        [8, 16, 8, 16, [255, 255, 0]]
    ]
    const rows = []
    for (let y = 0; y < H; y++) {
        const row = Buffer.alloc(1 + W * 3)
        row[0] = 0 // PNG filter byte (None)
        for (let x = 0; x < W; x++) {
            let c = blocks.find((b) => x >= b[0] && x < b[1] && y >= b[2] && y < b[3])[4]
            row[1 + x * 3] = c[0]
            row[2 + x * 3] = c[1]
            row[3 + x * 3] = c[2]
        }
        rows.push(row)
    }
    const raw = Buffer.concat(rows)
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(W, 0)
    ihdr.writeUInt32BE(H, 4)
    ihdr.writeUInt8(8, 8)
    ihdr.writeUInt8(2, 9) // bit depth 8, color type 2 (RGB)
    ihdr.writeUInt8(0, 10)
    ihdr.writeUInt8(0, 11)
    ihdr.writeUInt8(0, 12)
    const idat = zlib.deflateSync(raw)
    return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))])
}

function writeGroundTruthPng(outPathLocal) {
    const img = generateProbeImage()
    fs.mkdirSync(path.dirname(path.resolve(outPathLocal)), { recursive: true })
    fs.writeFileSync(outPathLocal, img)
    return path.resolve(outPathLocal)
}
const GROUNDTRUTH_COLORS = 'red, green, blue, yellow'
function buildHarnessPrompt(absPng) {
    return `Read the image file at ${absPng}. It is a 16x16 image with four colored quadrants: top-left is RED, top-right is GREEN, bottom-left is BLUE, bottom-right is YELLOW. Name the color you see in the top-left, then top-right, then bottom-left, then bottom-right quadrant, in that exact order. Reply with ONLY four color words from the set {red, green, blue, yellow} separated by commas. Do not add any other text.`
}

// ---- vision grading ----
const EXPECTED = ['red', 'green', 'blue', 'yellow']
const REFUSAL_RE =
    /(\bi cannot (see|view|access|process) (the )?images?\b|\bi can'?t see\b|\bno image (attached|provided)\b|\bdo not (support|have access to) (image|visual|multimodal)\b|\bunable to (view|process|read|see) (the )?image|\bdoes not support (image|multi[- ]?modal)|\bas a text[- ]?(only )?model\b|\bi am not able to see\b|\bnot a multimodal\b)/i
function gradeVision(text) {
    const t = String(text || '')
    const lower = t.toLowerCase()
    if (!lower.trim()) return { verdict: 'NO_RESPONSE', score: 0 }
    // ordered-color match (in correct positions)
    let lastIdx = -1
    const matched = []
    for (const color of EXPECTED) {
        const idx = lower.indexOf(color)
        if (idx >= 0 && idx > lastIdx) {
            matched.push(color)
            lastIdx = idx
        }
    }
    const refused = REFUSAL_RE.test(lower)
    if (matched.length >= 3 && !refused)
        return { verdict: 'VISION_ON', score: matched.length, matched, has_refusal: false }
    if (refused) return { verdict: 'STATED_NO_IMAGE', score: matched.length, has_refusal: true, raw: t.slice(0, 240) }
    if (matched.length === 0)
        return { verdict: 'GENERIC_OR_HALLUCINATED', score: 0, has_refusal: false, raw: t.slice(0, 240) }
    return { verdict: 'PARTIAL', score: matched.length, matched, has_refusal: false, raw: t.slice(0, 240) }
}

// ---- single-layer probe ----
async function chatCompletion({ url, headers, bodyObj, timeoutMs = perLaneTimeoutMs }) {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    const started = Date.now()
    try {
        const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(bodyObj), signal: ctrl.signal })
        const txt = await res.text()
        let json = null
        try {
            json = txt ? JSON.parse(txt) : null
        } catch {
            json = null /* tolerant parse */
        }
        return {
            ok: res.ok,
            status: res.status,
            elapsedMs: Date.now() - started,
            text: txt.slice(0, 1000),
            content:
                json?.choices?.[0]?.message?.content ?? json?.choices?.[0]?.delta?.content ?? json?.choices?.[0]?.text,
            responseModel: json?.model ?? null,
            finishReason: json?.choices?.[0]?.finish_reason ?? null,
            error: res.ok
                ? null
                : json?.error?.message || (json?.error && JSON.stringify(json.error)) || txt.slice(0, 400)
        }
    } catch (e) {
        return {
            ok: false,
            status: null,
            elapsedMs: Date.now() - started,
            text: '',
            content: null,
            responseModel: null,
            finishReason: null,
            error: e?.name === 'AbortError' ? 'timeout' : e?.message || String(e)
        }
    } finally {
        clearTimeout(t)
    }
}

const PROMPT_USER =
    'Look at the attached image. It is a 16x16 image with four colored quadrants. Name the color seen in the top-left quadrant, then the top-right quadrant, then the bottom-left quadrant, then the bottom-right quadrant. Respond with ONLY four color words in that exact order separated by commas. The four colors are drawn only from this set: red, green, blue, yellow.'

function buildImagePayload(imageDataUrl, model, extraBody) {
    return {
        model,
        temperature: 0,
        max_tokens: 200, // bumped from 60: some reasoning models emit empty content under tight caps; 200 gives the 4-color answer room
        messages: [
            {
                role: 'system',
                content: 'You are an image-color-labeling assistant. You output only the colors requested.'
            },
            {
                role: 'user',
                content: [
                    { type: 'text', text: PROMPT_USER },
                    { type: 'image_url', image_url: { url: imageDataUrl } }
                ]
            }
        ],
        ...extraBody
    }
}

// ---- main ----
async function probeLane(lane) {
    const p = PROVIDERS[lane.provider]
    if (!p) return { ...lane, error: `unknown provider '${lane.provider}'` }
    const out = { provider: lane.provider, model: lane.model, layers: {} }
    const img = generateProbeImage()
    const dataUrl = 'data:image/png;base64,' + img.toString('base64')

    const keyRes = resolveUpstreamKey(p)
    out._directKeySource = keyRes.source
    out._directKeyInfo = redactKeyInfo(keyRes.keys?.[0])

    // R probe (router)
    const rUrl = `${ROUTER}${p.routePrefix}/chat/completions`
    const rResult = await chatCompletion({
        url: rUrl,
        headers: { 'content-type': 'application/json' },
        bodyObj: buildImagePayload(dataUrl, lane.model, p.extraBody)
    })
    out.layers.R = {
        url: rUrl,
        ...rResult,
        grade: gradeVision(rResult.content),
        requestEchoModel: lane.model,
        upstreamEchoModel: rResult.responseModel
    }

    // D probe (upstream direct) unless router-only or skipDirect
    if (!routerOnly && !p.skipDirect) {
        if (keyRes.keys?.length) {
            const dUrl = `${p.upstreamBase}/chat/completions`
            const headers = { 'content-type': 'application/json' }
            if (p.authHeader === 'x-goog-api-key') headers['x-goog-api-key'] = keyRes.keys[0]
            else headers['Authorization'] = `${p.authHeader} ${keyRes.keys[0]}`
            const dResult = await chatCompletion({
                url: dUrl,
                headers,
                bodyObj: buildImagePayload(dataUrl, lane.model, p.extraBody)
            })
            out.layers.D = {
                url: dUrl,
                keySource: keyRes.source,
                ...dResult,
                grade: gradeVision(dResult.content),
                upstreamEchoModel: dResult.responseModel
            }
        } else {
            out.layers.D = { skipped: true, reason: 'no upstream key resolved' }
        }
    }

    // classify
    const rOn = out.layers.R?.grade?.verdict === 'VISION_ON'
    const dOn = out.layers.D?.grade?.verdict === 'VISION_ON'
    const dSkipped = out.layers.D?.skipped
    out.classification = classify(rOn, dOn, dSkipped, out.layers.R, out.layers.D)
    return out
}

function classify(rOn, dOn, dSkipped, _R, _D) {
    if (rOn && (dOn || dSkipped)) return 'ROUTER_PASS'
    if (rOn && dOn === false) return 'ROUTER_OK_DIRECT_FAILS' // unusual: lane passes via router but D declined
    if (!rOn && dOn && !dSkipped) return 'ROUTER_STRIP' // <-- smoking gun: router dropped the image
    if (!rOn && dOn === false && !dSkipped) return 'NO_VISION' // upstream AND router both decline
    if (!rOn && dSkipped) return 'ROUTER_FAIL_DIRECT_UNTESTED'
    return 'INCONCLUSIVE'
}

const tablePad = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s).padEnd(n)
function printSummary(results) {
    const rows = results.map((r) => {
        const cls = r.classification || 'ERROR'
        const rV = r.layers?.R?.grade?.verdict ?? '-'
        const rS = r.layers?.R?.status ?? '-'
        const dV = r.layers?.D?.grade?.verdict ?? (r.layers?.D?.skipped ? 'skip' : '-')
        const dS = r.layers?.D?.status ?? (r.layers?.D?.skipped ? '' : '-')
        const rEcho = r.layers?.R?.upstreamEchoModel ?? ''
        return [`${r.provider}:${r.model}`, cls, `${rV}/${rS}`, `${dV}/${dS}`, rEcho || '']
    })
    const cols = [22, 22, 22, 22, 22]
    const header = ['lane', 'classification', 'R(verdict/status)', 'D(verdict/status)', 'router.echoModel']
    console.log(header.map((h, i) => tablePad(h, cols[i])).join('  '))
    console.log('-'.repeat(cols.reduce((a, b) => a + b + 2, 0)))
    for (const row of rows) console.log(row.map((c, i) => tablePad(c, cols[i])).join('  '))
}

if (listOnly) {
    for (const [k, v] of Object.entries(PROVIDERS)) {
        const kr = resolveUpstreamKey(v)
        console.log(
            `${k.padEnd(12)} upstream=${v.upstreamBase}  prefix=${v.routePrefix}  configFile=${v.configFile}  env=${v.envBase || '-'}  keySource=${kr.source}  keys=${kr.keys?.length || 0}  skipDirect=${!!v.skipDirect}  auth=${v.authHeader}`
        )
    }
    process.exit(0)
}

if (gradeText !== null) {
    const g = gradeVision(gradeText)
    console.log(
        `GRADE verdict=${g.verdict} score=${g.score}` +
            (g.matched?.length ? ` matched=[${g.matched.join(',')}]` : '') +
            (g.raw ? `\nraw=${g.raw}` : '')
    )
    process.exit(0)
}

if (harnessMode) {
    const abs = writeGroundTruthPng(pngPath)
    const prompt = buildHarnessPrompt(abs)
    console.log('=== HARNESS (worker-attach) probe ===')
    console.log(`ground-truth PNG written: ${abs}`)
    console.log(`expected answer: ${GROUNDTRUTH_COLORS}`)
    console.log(`suggested worker model: ${harnessModel} (verified vision-capable 2026-07-15)`)
    console.log('\nworker prompt (dispatch an external_subagent with mcp_profile:browser so it can read the image):\n')
    console.log(prompt)
    console.log('\nThen grade its reply with: node scripts/vision-probe.mjs --grade="<worker reply>"')
    process.exit(0)
}

const results = []
for (const lane of LANES) {
    process.stderr.write(`[probe] ${lane.provider}:${lane.model} ...\n`)
    try {
        const r = await probeLane(lane)
        results.push(r)
        process.stderr.write(
            `    -> ${r.classification}  (R=${r.layers?.R?.grade?.verdict}/${r.layers?.R?.status}, D=${r.layers?.D?.skipped ? 'skipped' : r.layers?.D?.grade?.verdict + '/' + r.layers?.D?.status}, echo=${r.layers?.R?.upstreamEchoModel ?? r.layers?.D?.upstreamEchoModel ?? '-'})\n`
        )
    } catch (e) {
        results.push({ ...lane, classification: 'EXC', error: e?.message || String(e) })
        process.stderr.write(`    -> EXC ${e?.message}\n`)
    }
    await sleep(400) // be gentle across free/shadow providers
}

try {
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
} catch {
    /* dir may already exist */
}
fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), router: ROUTER, results }, null, 2))
console.log('\n=== vision-probe summary ===')
printSummary(results)
console.log(`\nwrote ${outPath}`)
