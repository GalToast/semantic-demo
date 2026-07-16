#!/usr/bin/env node
// scripts/vision-video-probe.mjs — empirical video-input capability probe.
//
// The static-PNG phase (Phase-2/3/5) hit a prompt-leak hallucination wall
// where cross-model VLMs recycle strings from the grader prompt's check-item
// list ("loading-modal covering the actual surface" → invented "dataReady is
// not defined" dialog). To pin transition-class bugs (mode-switch flicker,
// splash dismiss, focus-pocket zoom, veil stacking) we need temporal input.
// This probe answers: which lanes accept `type: "video_url"` in the OpenAI-compat
// chat.completions, and which answer with motion-relevant content.
//
// Assertion is content-graded (not just HTTP 200):
//   video is a 3-sec lavfi testsrc2 with a small red rectangle translating
//   left→right. We ask: "Briefly describe the motion in this short video."
//   Verdict VIDEO_ON = response mentions "moving", "rectangle", "left to right"
//   OR any motion verb (slide, translate, drift) + color reference (red).
//   Other verdicts: VIDEO_GENERIC_OK (saw a video but generic), NO_VIDEO_SUPPORT
//   (4xx explicitly), GENERIC_OR_HALLUCINATED, TIMEOUT, ERROR.
//
// Output: tmp/vision-video-probe-results-<timestamp>.json (+ human summary).
// No API-key values are echoed or written to disk.
//
// Usage:
//   node scripts/vision-video-probe.mjs                       # default LANES table
//   node scripts/vision-video-probe.mjs --lanes=foo,bar, baz  # subset
//   node scripts/vision-video-probe.mjs --video=tmp/custom.mp4
//   node scripts/vision-video-probe.mjs --token-limit=200
//   node scripts/vision-video-probe.mjs --text-mode            # use sample frames as image_url
//                                                              # (fallback when video_url unsupported)

import fs from 'node:fs'

const ROUTER = process.env.KEY_ROUTER_URL || 'http://127.0.0.1:8788'
const NOW = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace(/\.\d+Z$/, 'Z')

const PROVIDER_PREFIX = {
    nvidia: '/nvidia/v1',
    modelscope: '/modelscope/v1',
    openrouter: '/openrouter/v1',
    kilo: '/kilo/v1',
    mistral: '/mistral/v1',
    agnes: '/agnes/v1',
    zen: '/opencode-zen/v1',
    logfare: '/logfare/v1',
    cloudflare: '/cloudflare/v1',
    freemodel: '/freemodel/v1'
}

// Default LANES — drawn from docs/vision-model-matrix.md (router-probeable vision-on routes).
// Colons allowed in bareModel part of the lane id.
const DEFAULT_LANES = [
    'nvidia:meta/llama-3.2-90b-vision-instruct',
    'nvidia:meta/llama-3.2-11b-vision-instruct',
    'nvidia:nvidia/nemotron-nano-12b-v2-vl',
    'nvidia:nvidia/llama-3.1-nemotron-nano-vl-8b-v1',
    'nvidia:nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
    'nvidia:minimaxai/minimax-m3',
    'modelscope:Qwen/Qwen3-VL-8B-Instruct',
    'modelscope:Qwen/Qwen3-VL-235B-A22B-Instruct',
    'openrouter:google/gemma-4-26b-a4b-it:free',
    'logfare:minimax-m3',
    'agnes:agnes-2.0-flash'
]

function resolveRoute(lane) {
    const colon = lane.indexOf(':')
    if (colon < 0) return { error: `lane "${lane}" must be provider:bareRef` }
    const provider = lane.slice(0, colon)
    const bareModel = lane.slice(colon + 1)
    const prefix = PROVIDER_PREFIX[provider]
    if (!prefix) return { error: `unknown provider "${provider}" for lane "${lane}"` }
    return { url: `${ROUTER}${prefix}/chat/completions`, bareModel, provider }
}

async function postJson(url, body, timeoutMs, extraHeaders = {}) {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    const started = Date.now()
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...extraHeaders },
            body: JSON.stringify(body),
            signal: ctrl.signal
        })
        const txt = await res.text()
        const elapsedMs = Date.now() - started
        let json
        try {
            json = JSON.parse(txt)
        } catch {
            json = null
        }
        return {
            ok: res.ok,
            status: res.status,
            elapsedMs,
            text: txt,
            json,
            error: null
        }
    } catch (e) {
        return {
            ok: false,
            status: null,
            elapsedMs: Date.now() - started,
            text: '',
            json: null,
            error: e?.name === 'AbortError' ? 'timeout' : e?.message || String(e)
        }
    } finally {
        clearTimeout(t)
    }
}

function contentOf(json) {
    if (!json) return ''
    const m = json?.choices?.[0]?.message
    const base = m?.content ?? json?.choices?.[0]?.delta?.content ?? ''
    const reasoning = m?.reasoning_content ?? json?.choices?.[0]?.delta?.reasoning_content ?? ''
    if (base && base.length > 40) return base
    if (reasoning && reasoning.length > 40) return reasoning
    if (base || reasoning) return `${base}\n${reasoning}`.trim()
    return ''
}

function verdict(text, status, httpOk) {
    if (!httpOk && (status === 400 || status === 415 || status === 422)) {
        if (/video|multimodal|unsupported|not supported|media type|invalid type/i.test(text)) {
            return 'NO_VIDEO_SUPPORT'
        }
    }
    if (!text || text.length < 30) {
        if (!httpOk) return 'ERROR'
        return 'GENERIC_OR_HALLUCINATED'
    }
    const t = text.toLowerCase()
    const motionVerbs =
        /mov(e|es|ing)|slide(s|ing)?|translate(s|ing)?|drift(s|ing)?|travel(s|ing)?|pan(s|ning)?|fly(ing)?|walk(s|ing)|cross(es|ing)?/i.test(
            text
        )
    const rectRefs = /rect|box|square|shape|object|red|color|c[ée]lades?|tuyeau|rectangle/i.test(text)
    const leftRight = /left to right|left-to-right|right to left|right-to-left|across (the )?screen|horizontal/i.test(
        text
    )
    if (motionVerbs && rectRefs) return 'VIDEO_ON'
    if (motionVerbs || leftRight || rectRefs) return 'VIDEO_PARTIAL'
    if (
        /i (do not|don'?t|cannot|can'?t) (see|watch|process)|video input|video format|unsupported media|i can'?t|frame/i.test(
            text
        )
    ) {
        return 'NO_VIDEO_SUPPORT'
    }
    if (/the video|this video|in the (video|clip)|frame|frames|animation|clip/i.test(text)) return 'VIDEO_GENERIC_OK'
    return 'GENERIC_OR_HALLUCINATED'
}

async function probeLane(lane, videoB64, opts) {
    const route = resolveRoute(lane)
    if (route.error)
        return { lane, ok: false, status: null, verdict: 'ERROR', elapsedMs: 0, content: '', error: route.error }
    const dataUrl = `data:video/mp4;base64,${videoB64}`
    const userContent = [
        { type: 'text', text: opts.promptText },
        { type: 'video_url', video_url: { url: dataUrl } }
    ]
    const body = {
        model: route.bareModel,
        temperature: 0,
        max_tokens: opts.maxTokens,
        messages: [{ role: 'user', content: userContent }]
    }
    // ModelScope routes want extra flags for reasoning-style behavior; add the
    // same include_reasoning:true flag vision-grader-inline uses so the route
    // matches its in-probe defaults.
    if (route.provider === 'modelscope') {
        body.include_reasoning = true
        body.reasoning_split = true
    }
    const r = await postJson(route.url, body, opts.timeoutMs)
    const content = contentOf(r.json) || (r.text ? r.text.slice(0, 400) : '')
    const v = verdict(content, r.status, r.ok)
    return {
        lane,
        url: route.url,
        bareModel: route.bareModel,
        ok: r.ok,
        status: r.status,
        elapsedMs: r.elapsedMs,
        verdict: v,
        content: content.slice(0, 320),
        error: r.error,
        responseModel: r.json?.model ?? null,
        finishReason: r.json?.choices?.[0]?.finish_reason ?? null
    }
}

const argv = process.argv.slice(2)
const argVal = (s) => {
    const a = argv.find((x) => x.startsWith(s + '='))
    return a ? a.slice(s.length + 1) : null
}
const lanesArg = argVal('--lanes')
const Lanes = lanesArg
    ? lanesArg
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
    : DEFAULT_LANES
const videoPath = argVal('--video') || 'tmp/vp-test-mp4.mp4'
const timeoutMs = Number(argVal('--timeout') ?? 120000)
const maxTokens = Number(argVal('--max-tokens') ?? 200)
const textMode = argv.includes('--text-mode')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

if (!fs.existsSync(videoPath)) {
    console.error(`Video file not found: ${videoPath}`)
    console.error('  Generate via:')
    console.error('  ffmpeg -y -f lavfi -i testsrc2=duration=3:size=640x360:rate=15 \\')
    console.error('          -c:v libx264 -pix_fmt yuv420p -movflags +faststart \\')
    console.error(`          -vf "drawbox=x='10+t*200':y=150:w=80:h=60:color=red@0.8:t=fill" \\`)
    console.error('          ${videoPath}')
    process.exit(2)
}

const promptText =
    'Briefly describe the motion in this short 3-second video. What do you see moving, and in which direction? Answer in 1-3 sentences. Be specific about visible motion.'

const videoB64 = fs.readFileSync(videoPath).toString('base64')
process.stderr.write(
    `[video-probe] video=${videoPath} (${videoB64.length} b64 bytes) lanes=${Lanes.length} timeout=${timeoutMs}ms\n`
)

const sleepMs = Number(argVal('--sleep') ?? 1500)
;(async () => {
    const results = []
    for (let i = 0; i < Lanes.length; i++) {
        const lane = Lanes[i]
        process.stderr.write(`  ${i + 1}/${Lanes.length} ${lane} → `)
        const r = await probeLane(lane, videoB64, {
            timeoutMs,
            maxTokens,
            promptText,
            textMode
        })
        process.stderr.write(
            `${r.verdict} (status=${r.status} ${r.elapsedMs}ms ${r.content ? `${r.content.length}c` : ''}${r.error ? ` err=${r.error}` : ''})\n`
        )
        if (r.content) process.stderr.write(`    reply: ${r.content.replace(/\s+/g, ' ').slice(0, 200)}\n`)
        results.push(r)
        if (i < Lanes.length - 1) await sleep(sleepMs)
    }
    const summaryPath = `tmp/vision-video-probe-results-${NOW}.json`
    fs.writeFileSync(
        summaryPath,
        JSON.stringify(
            {
                generatedAt: new Date().toISOString(),
                promptText,
                timeoutMs,
                videoPath,
                modes: { textMode },
                results
            },
            null,
            2
        )
    )
    console.log('\n=== video-probe summary ===')
    const counts = results.reduce((m, r) => {
        m[r.verdict] = (m[r.verdict] || 0) + 1
        return m
    }, {})
    console.log(JSON.stringify(counts, null, 2))
    console.log(`wrote ${summaryPath}`)
})()
