#!/usr/bin/env node
// scripts/vision-video-jury-probe.mjs — parallel-dispatch multi-model VIDEO probe.
//
// Probes a wide CSV of router lanes for `type:"video_url"` chat-completions input
// support. Default lane list draws from `tmp/vision-video-jury-lanes.json` (the
// curated union: all 84 catalog-flagged video-candidate routes + 21 confirmed
// VISION_ON lanes + agnes-video retry + logfare candidates). Designed to fan out
// to concurrency 8 so the whole probe fits in ~3-10 min wall instead of the
// ~30+min sequential script (which is what scripts/vision-video-probe.mjs does).
//
// The test MP4 (`tmp/vp-test-mp4.mp4`, 3-sec testsrc2 + moving red rectangle
// L→R + diagonal rainbow stripe + counter) acts as the video payload. The prompt
// asks for a 1-3 sentence motion description; verdict classification checks for
// motion-language signals + content-length thresholds (the spans invented by the
// 4-quadrant image-jury probe are NOT reused here — video verdicts need motion
// vocabulary, not color matching).
//
// Usage:
//   node scripts/vision-video-jury-probe.mjs                       # default 111-lane set
//   node scripts/vision-video-jury-probe.mjs --lanes=a,b,c          # explicit CSV
//   node scripts/vision-video-jury-probe.mjs --concurrency=8 --timeout=120000
//   node scripts/vision-video-jury-probe.mjs --out=tmp/vpvjury.json
//   LANES_JSON=tmp/vision-video-jury-lanes.json node scripts/vision-video-jury-probe.mjs

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
    'opencode-zen': '/opencode-zen/v1',
    logfare: '/logfare/v1',
    cloudflare: '/cloudflare/v1',
    freemodel: '/freemodel/v1',
    zydit: '/zydit/v1',
    'zydit-v4': '/zydit/v4',
    openprovider: '/openprovider/v1',
    neuralwatt: '/neuralwatt/v1'
}

const VIDEO_PATH = process.env.VIDEO_MP4 || 'tmp/vp-test-mp4.mp4'
const PROMPT_TEXT =
    'Briefly describe the motion in this short 3-second video clip. Be specific about what is moving and in which direction (left, right, up, down, diagonal). Reply in 1-3 sentences. Do not over-explain or list numbers.'

// Stage the 111-lane CSV if absent.
const LANES_DEFAULT_PATH = 'tmp/vision-video-jury-lanes.json'

class VideoMotionVerdict {
    constructor(content) {
        this.content = content || ''
        this.lc = this.content.toLowerCase()
        // motion vocabulary (test MP4 has: moving red rectangle L→R, diagonal rainbow stripe, counter)
        this.motionKw = [
            'move',
            'moving',
            'moves',
            'motion',
            'transitions',
            'transit',
            'flows',
            'sweeps',
            'drifts',
            'ascend',
            'descend',
            'shifts',
            'scrolls',
            'scroll',
            'slides',
            'slide',
            'progress',
            'progresses',
            'right',
            'left',
            'up',
            'down',
            'diagonal',
            'across'
        ]
        // visual-element vocabulary
        this.elementKw = [
            'square',
            'rectangular',
            'rect',
            'rectang',
            'block',
            'line',
            'stripe',
            'streak',
            'shape',
            'object',
            'pixel',
            'square',
            'dots',
            'cluster',
            'countdown',
            'timer',
            'counter',
            'rainbow',
            'multicolor',
            'grey',
            'gray',
            'color',
            'colors',
            'bars',
            'pattern',
            'background',
            'frame'
        ]
    }
    score() {
        let motion = 0,
            element = 0
        for (const k of this.motionKw) if (this.lc.includes(k)) motion++
        for (const k of this.elementKw) if (this.lc.includes(k)) element++
        return { motion, element }
    }
    verdict() {
        const len = this.content.length
        const blank = !this.content.trim()
        if (blank) return { verdict: 'NO_RESPONSE', score: {} }
        const s = this.score()
        // Generic fallback signals (text-only CLI "hello", "how can I help")
        if (len < 50 && /hello|how can i|what can i|assistant|chat help/i.test(this.content)) {
            return { verdict: 'GENERIC_OR_HALLUCINATED', score: s }
        }
        // Strong video-understanding signal: motion + visual-element vocabulary
        if (s.motion >= 2 && s.element >= 1 && len >= 60) {
            return { verdict: 'VIDEO_ON', score: s }
        }
        // Partial: motion-only or element-only OR shorter acknowledgement
        if ((s.motion >= 1 || s.element >= 2) && len >= 40) {
            return { verdict: 'VIDEO_PARTIAL', score: s }
        }
        // Refusal or "I can't view video" style responses
        if (/cannot|can't|not able|unable|don't have|no video/gi.test(this.content)) {
            return { verdict: 'NO_VISION', score: s }
        }
        return { verdict: 'GENERIC_OR_HALLUCINATED', score: s }
    }
}

function resolveRoute(lane) {
    const colon = lane.indexOf(':')
    if (colon < 0) return { error: `lane "${lane}" must be provider:bareRef` }
    const provider = lane.slice(0, colon)
    const bareModel = lane.slice(colon + 1)
    const prefix = PROVIDER_PREFIX[provider]
    if (!prefix) return { error: `unknown provider "${provider}" for lane "${lane}"` }
    return { url: `${ROUTER}${prefix}/chat/completions`, bareModel, provider }
}

function contentOf(json, txtFallback) {
    if (!json) return txtFallback
    const m = json?.choices?.[0]?.message
    const base = m?.content ?? json?.choices?.[0]?.delta?.content ?? ''
    const reasoning = m?.reasoning_content ?? json?.choices?.[0]?.delta?.reasoning_content ?? ''
    if (base && base.length > 40) return base
    if (reasoning && reasoning.length > 40) return reasoning
    if (base || reasoning) return `${base}\n${reasoning}`.trim()
    return ''
}

async function postJson(url, body, timeoutMs) {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    const started = Date.now()
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
            signal: ctrl.signal
        })
        const text = await res.text()
        const elapsedMs = Date.now() - started
        let json
        try {
            json = JSON.parse(text)
        } catch {
            json = null
        }
        return { ok: res.ok, status: res.status, elapsedMs, text, json, error: null }
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

function classifyErrorProbe(status, rawText) {
    const lc = (rawText || '').toLowerCase()
    // NIM signature: "At most 0 video(s) may be provided..."
    if (lc.includes('at most 0 video') || lc.includes('limit-mm-per-prompt')) {
        return 'NO_VIDEO_SUPPORT'
    }
    // gemma-3n signature: "Unknown video model type: gemma3n"
    if (lc.includes('unknown video model type')) return 'NO_VIDEO_SUPPORT'
    // mistral 422 — their chat-completions wants content as plain string, not array
    if (status === 422 || lc.includes('input should be a valid string')) return 'PAYLOAD_FORMAT_REJECT'
    // Auth / credits / payment
    if (status === 401 || lc.includes('unauthorized') || lc.includes('auth')) return 'AUTH_REQUIRED'
    if (
        status === 402 ||
        lc.includes('insufficient_credit') ||
        lc.includes('payment required') ||
        lc.includes('billing')
    )
        return 'CREDITS_EXHAUSTED'
    if (status === 429 || lc.includes('rate limit') || lc.includes('rate_limit')) return 'RATE_LIMITED'
    if (status === 404 || lc.includes('not found') || lc.includes('does not exist')) return 'MODEL_NOT_FOUND'
    if (status === 400 || (lc.includes('"error"') && lc.includes('video'))) {
        // generic 400 reject from non-standard request shape
        return 'PAYLOAD_FORMAT_REJECT'
    }
    if (status === 0 || lc === 'timeout') return 'TIMEOUT'
    return 'TRANSPORT_ERROR'
}

async function probeLane(lane, videoB64, timeoutMs) {
    const route = resolveRoute(lane)
    if (route.error) {
        return {
            lane,
            ok: false,
            status: null,
            elapsedMs: 0,
            verdict: 'ERROR',
            content: '',
            error: route.error,
            responseModel: null,
            finishReason: null,
            score: {}
        }
    }
    const dataUrl = `data:video/mp4;base64,${videoB64}`
    const userContent = [
        { type: 'text', text: PROMPT_TEXT },
        { type: 'video_url', video_url: { url: dataUrl } }
    ]
    const body = {
        model: route.bareModel,
        temperature: 0,
        max_tokens: 300,
        messages: [{ role: 'user', content: userContent }]
    }
    if (route.provider === 'modelscope') {
        body.include_reasoning = true
        body.reasoning_split = true
    }
    const r = await postJson(route.url, body, timeoutMs)
    if (!r.ok) {
        const errVerdict = classifyErrorProbe(r.status, r.text)
        return {
            lane,
            provider: route.provider,
            bareModel: route.bareModel,
            ok: false,
            status: r.status,
            elapsedMs: r.elapsedMs,
            verdict: errVerdict,
            content: '',
            error: r.error || r.text.slice(0, 240),
            responseModel: r.json?.model ?? null,
            finishReason: r.json?.choices?.[0]?.finish_reason ?? null,
            score: {}
        }
    }
    const content = contentOf(r.json, r.text ? r.text.slice(0, 320) : '')
    const v = new VideoMotionVerdict(content)
    const { verdict, score } = v.verdict()
    return {
        lane,
        provider: route.provider,
        bareModel: route.bareModel,
        ok: true,
        status: r.status,
        elapsedMs: r.elapsedMs,
        verdict,
        score,
        content: content.slice(0, 260),
        error: r.error,
        responseModel: r.json?.model ?? null,
        finishReason: r.json?.choices?.[0]?.finish_reason ?? null
    }
}

async function parallelPool(items, concurrency, runner) {
    const queue = items.map((it, i) => ({ it, i }))
    const results = []
    async function worker() {
        while (queue.length > 0) {
            const { it, i } = queue.shift()
            if (!it) return
            results[i] = (await runner(it, i)) ?? { it, ok: false, verdict: 'WORKER_ERROR' }
        }
    }
    const workers = []
    for (let w = 0; w < concurrency; w++) workers.push(worker())
    await Promise.all(workers)
    return results
}

const argv = process.argv.slice(2)
const argVal = (s) => {
    const a = argv.find((x) => x.startsWith(s + '='))
    return a ? a.slice(s.length + 1) : null
}
const lanesArg = argVal('--lanes')
let Lanes
if (lanesArg) {
    Lanes = lanesArg
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
} else if (process.env.LANES_JSON && fs.existsSync(process.env.LANES_JSON)) {
    Lanes = JSON.parse(fs.readFileSync(process.env.LANES_JSON, 'utf8'))
} else if (fs.existsSync(LANES_DEFAULT_PATH)) {
    Lanes = JSON.parse(fs.readFileSync(LANES_DEFAULT_PATH, 'utf8'))
} else {
    Lanes = []
}
const concurrency = Number(argVal('--concurrency') ?? 8)
const timeoutMs = Number(argVal('--timeout') ?? 120000)
const outPath = argVal('--out') || `tmp/vision-video-jury-probe-${NOW}.json`

if (Lanes.length === 0) {
    console.error(`No lanes found. Provide --lanes=CSV or ensure ${LANES_DEFAULT_PATH} exists.`)
    process.exit(2)
}
if (!fs.existsSync(VIDEO_PATH)) {
    console.error(`Test MP4 not found: ${VIDEO_PATH}`)
    console.error('  Generate via `ffmpeg -y -f lavfi -i testsrc2=size=320x240:rate=15 -t 3 tmp/vp-test-mp4.mp4`.')
    process.exit(2)
}

const videoB64 = fs.readFileSync(VIDEO_PATH).toString('base64')
process.stderr.write(
    `[video-jury-probe] video=${VIDEO_PATH} (${videoB64.length} b64 bytes) lanes=${Lanes.length} concurrency=${concurrency} timeout=${timeoutMs}ms\n`
)
;(async () => {
    const results = await parallelPool(Lanes, concurrency, async (lane, i) => {
        const r = await probeLane(lane, videoB64, timeoutMs)
        const flash = r.ok ? 'OK' : 'FAIL'
        process.stderr.write(
            `[${(i + 1).toString().padStart(3)}/${Lanes.length}] ${lane.padEnd(52)} ${r.verdict.padEnd(26)} status=${r.status} ${r.elapsedMs}ms (${flash})\n`
        )
        return r
    })
    const summary = {
        generatedAt: new Date().toISOString(),
        router: ROUTER,
        concurrency,
        timeoutMs,
        videoPath: VIDEO_PATH,
        promptText: PROMPT_TEXT,
        lanes: Lanes,
        timeElapsedTotal: results.reduce((a, r) => a + (r.elapsedMs || 0), 0),
        results
    }
    fs.writeFileSync(outPath, JSON.stringify(summary, null, 2))
    const verdictCounts = results.reduce((m, r) => {
        m[r.verdict] = (m[r.verdict] || 0) + 1
        return m
    }, {})
    const passing = results.filter((r) => r.verdict === 'VIDEO_ON' || r.verdict === 'VIDEO_PARTIAL')
    const passingPath = outPath
        .replace(/vision-video-jury-probe-/, 'vision-video-jury-passing-')
        .replace('.json', '-passing.json')
    fs.writeFileSync(
        passingPath,
        JSON.stringify(
            {
                generatedAt: new Date().toISOString(),
                count: passing.length,
                passing: passing.map((r) => ({
                    lane: r.lane,
                    bareModel: r.bareModel,
                    provider: r.provider,
                    verdict: r.verdict,
                    elapsedMs: r.elapsedMs,
                    responseModel: r.responseModel
                }))
            },
            null,
            2
        )
    )
    console.log('\n=== vision-video-jury-probe summary ===')
    for (const v of Object.keys(verdictCounts).sort()) {
        console.log(`  ${v.padEnd(26)} ${verdictCounts[v]}`)
    }
    console.log(`\n${passing.length} lanes with verdict VIDEO_ON or VIDEO_PARTIAL:`)
    for (const r of passing.sort((a, b) => a.elapsedMs - b.elapsedMs)) {
        console.log(`  ${r.lane.padEnd(52)} ${r.verdict} ${r.elapsedMs}ms`)
    }
    console.log(`\nwrote ${outPath}`)
    console.log(`wrote ${passingPath}`)
})()
