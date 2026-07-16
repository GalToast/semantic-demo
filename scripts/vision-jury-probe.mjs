#!/usr/bin/env node
// scripts/vision-jury-probe.mjs — parallel-dispatch multi-model vision-jury probe.
//
// Probes a curated set of vision-capable router lanes for VISION_ON/4 verdicts
// using the SAME 16x16 4-quadrant ground-truth PNG as scripts/vision-probe.mjs
// (top-left=RED, top-right=GREEN, bottom-left=BLUE, bottom-right=YELLOW; expected
// colors read in TL/TR/BL/BR order). Default lane list draws from the canonical
// vision-route inventory (`tmp/vision-route-inventory.json` produced by
// scripts/vision-route-inventory.mjs) — kept tighter than the inferred 479 to
// a curated ~60 best-per-provider set so the whole probe fits in ~5 min wall
// at concurrency 8 instead of ~3-4 hours sequential.
//
// Usage:
//   node scripts/vision-jury-probe.mjs                       # default curated set
//   node scripts/vision-jury-probe.mjs --lanes=a,b,c         # explicit CSV
//   node scripts/vision-jury-probe.mjs --concurrency=4 --timeout=90000
//   node scripts/vision-jury-probe.mjs --out=tmp/vpjury.json
//
// Output: tmp/vision-jury-probe-<stamp>.json + tmp/vision-jury-passing-<stamp>.json
// (the passing-only file is the canonical VISION_ON jury roster).

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
    freemodel: '/freemodel/v1'
}

const IMG_PATH = process.env.GROUNDTRUTH_PNG || 'tmp/vision-probe-groundtruth.png'
const EXPECTED = ['red', 'green', 'blue', 'yellow']
const PROMPT_TEXT =
    'Read the image file. It is a 16x16 image with 4 colored quadrants: top-left=RED, top-right=GREEN, bottom-left=BLUE, bottom-right=YELLOW. Name the color seen in TL, TR, BL, BR quadrant in that exact order. Reply with ONLY 4 color words separated by commas, no other text. Colors from the set {red, green, blue, yellow}.'

const DEFAULT_LANES = [
    // NIM VISION family — known VISION_ON + newly-probe candidates from inventory
    'nvidia:adept/fuyu-8b',
    'nvidia:microsoft/kosmos-2',
    'nvidia:microsoft/phi-3-vision-128k-instruct',
    'nvidia:nvidia/llama-3.1-nemotron-nano-vl-8b-v1',
    'nvidia:nvidia/nemotron-nano-12b-v2-vl',
    'nvidia:nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
    'nvidia:meta/llama-3.2-11b-vision-instruct',
    'nvidia:meta/llama-3.2-90b-vision-instruct',
    'nvidia:google/gemma-3-12b-it',
    'nvidia:google/gemma-3-4b-it',
    'nvidia:google/gemma-3n-e2b-it',
    'nvidia:google/gemma-3n-e4b-it',
    'nvidia:google/gemma-4-31b-it',
    'nvidia:google/deplot',
    'nvidia:google/diffusiongemma-26b-a4b-it',
    'nvidia:minimaxai/minimax-m3',
    // ModelScope — proven Qwen-VL + newly-found InternVL + ERNIE-VL + Qwen-VL-Thinking
    'modelscope:OpenGVLab/InternVL3_5-241B-A28B',
    'modelscope:PaddlePaddle/ERNIE-4.5-VL-28B-A3B-PT',
    'modelscope:Qwen/Qwen3-VL-8B-Instruct',
    'modelscope:Qwen/Qwen3-VL-8B-Thinking',
    'modelscope:Qwen/Qwen3-VL-235B-A22B-Instruct',
    'modelscope:MusePublic/Qwen-Image-Edit',
    // Agnes — proven 2.0-flash + newly-named video + image flash variants
    'agnes:agnes-2.0-flash',
    'agnes:agnes-video-v2.0',
    'agnes:agnes-image-2.1-flash',
    'agnes:agnes-image-2.0-flash',
    // Mistral — capabilities.vision=true for medium 25xx; pixtral 12B documented
    'mistral:mistral-medium-2505',
    'mistral:mistral-medium-2508',
    'mistral:mistral-small-2603',
    'mistral:mistral-small-latest',
    'mistral:magistral-medium-2509',
    'mistral:magistral-medium-latest',
    // OpenRouter — multimodal best (video+audio in meta/muse-spark-1.1) plus GPT-5.6 vision
    'openrouter:meta/muse-spark-1.1',
    'openrouter:moonshotai/kimi-k3',
    'openrouter:openai/gpt-5.6-luna-pro',
    'openrouter:openai/gpt-5.6-terra-pro',
    'openrouter:openai/gpt-5.6-sol-pro',
    'openrouter:openai/gpt-5.6-luna',
    'openrouter:openai/gpt-5.6-terra',
    'openrouter:openai/gpt-5.6-sol',
    // opencode-zen — claude-opus-4-7 / sonnet-5 / haiku-4-5 + gemini 3.x + gpt-5.x
    'opencode-zen:claude-opus-4-8',
    'opencode-zen:claude-opus-4-7',
    'opencode-zen:claude-sonnet-5',
    'opencode-zen:claude-haiku-4-5',
    'opencode-zen:gemini-3.5-flash',
    'opencode-zen:gemini-3.1-pro',
    // Kilo auto family (claude/gpt fallback aggregation)
    'kilo:kilo-auto/frontier',
    'kilo:kilo-auto/balanced',
    'kilo:kilo-auto/efficient',
    // Cloudflare Workers — kimi / gpt-oss / glm / nemotron / gemma / mistral-small / llama-4-scout
    'cloudflare:@cf/moonshotai/kimi-k2.6',
    'cloudflare:@cf/openai/gpt-oss-120b',
    'cloudflare:@cf/openai/gpt-oss-20b',
    'cloudflare:@cf/zai-org/glm-4.7-flash',
    'cloudflare:@cf/nvidia/nemotron-3-120b-a12b',
    'cloudflare:@cf/google/gemma-4-26b-a4b-it',
    'cloudflare:@cf/mistralai/mistral-small-3.1-24b-instruct',
    'cloudflare:@cf/meta/llama-4-scout-17b-16e-instruct',
    // FreeModel — gpt-5.6 free-tier variants + gpt-5.5
    'freemodel:gpt-5.6-luna',
    'freemodel:gpt-5.6-sol',
    'freemodel:gpt-5.6-terra',
    'freemodel:gpt-5.5'
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
        return {
            ok: res.ok,
            status: res.status,
            elapsedMs,
            text,
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

function matchColors(content) {
    if (!content) return { expected: EXPECTED, found: [], matched: 0, verdict: 'NO_RESPONSE' }
    const s = content.toLowerCase()
    // greedily find color tokens; only count tokens from the expected set
    const tokens = s.split(/[^a-z]+/).filter(Boolean)
    let cursor = 0
    const found = []
    for (const t of tokens) {
        const x = t.trim()
        if (['red', 'green', 'blue', 'yellow'].includes(x)) {
            found.push(x)
        }
    }
    let matched = 0
    for (let i = 0; i < Math.min(found.length, EXPECTED.length); i++) {
        if (found[i] === EXPECTED[i]) matched++
    }
    let verdict
    if (matched >= 3) verdict = 'VISION_ON'
    else if (matched === 2) verdict = 'PARTIAL'
    else if (matched === 1) verdict = 'WEAK_PARTIAL'
    else if (found.length > 0) verdict = 'WRONG_ORDER'
    else if (s.includes('cannot') || s.includes("can't") || s.includes('not able')) {
        if (/image|video|see/i.test(content)) verdict = 'NO_VISION'
        else verdict = 'NO_RESPONSE'
    } else if (s.includes('sorry') || s.includes('unable')) {
        verdict = 'NO_RESPONSE'
    } else {
        verdict = 'GENERIC_OR_HALLUCINATED'
    }
    return { expected: EXPECTED, found, matched, verdict }
}

async function probeLane(lane, imgB64, timeoutMs) {
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
            found: [],
            matched: 0
        }
    }
    const dataUrl = `data:image/png;base64,${imgB64}`
    const userContent = [
        { type: 'text', text: PROMPT_TEXT },
        { type: 'image_url', image_url: { url: dataUrl } }
    ]
    const body = {
        model: route.bareModel,
        temperature: 0,
        max_tokens: 200,
        messages: [{ role: 'user', content: userContent }]
    }
    if (route.provider === 'modelscope') {
        body.include_reasoning = true
        body.reasoning_split = true
    }
    const r = await postJson(route.url, body, timeoutMs)
    const content = contentOf(r.json, r.text ? r.text.slice(0, 300) : '')
    const m = matchColors(content)
    return {
        lane,
        provider: route.provider,
        bareModel: route.bareModel,
        ok: r.ok,
        status: r.status,
        elapsedMs: r.elapsedMs,
        verdict: m.verdict,
        found: m.found,
        matched: m.matched,
        content: content.slice(0, 300),
        error: r.error,
        responseModel: r.json?.model ?? null,
        finishReason: r.json?.choices?.[0]?.finish_reason ?? null
    }
}

async function parallelPool(items, concurrency, runner) {
    const queue = items.map((it, i) => ({ it, i }))
    const results = []
    const inFlight = []
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
const Lanes = lanesArg
    ? lanesArg
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
    : DEFAULT_LANES
const concurrency = Number(argVal('--concurrency') ?? 8)
const timeoutMs = Number(argVal('--timeout') ?? 90000)
const outPath = argVal('--out') || `tmp/vision-jury-probe-${NOW}.json`

if (!fs.existsSync(IMG_PATH)) {
    console.error(`Ground-truth PNG not found: ${IMG_PATH}`)
    console.error('  Generate via `node scripts/vision-probe.mjs` once (it writes tmp/vision-probe-groundtruth.png).')
    process.exit(2)
}

const imgB64 = fs.readFileSync(IMG_PATH).toString('base64')
process.stderr.write(
    `[jury-probe] image=${IMG_PATH} lanes=${Lanes.length} concurrency=${concurrency} timeout=${timeoutMs}ms\n`
)
;(async () => {
    const results = await parallelPool(Lanes, concurrency, async (lane, i) => {
        const tBefore = Date.now()
        const r = await probeLane(lane, imgB64, timeoutMs)
        const flash = r.ok ? 'OK' : 'FAIL'
        process.stderr.write(
            `[${(i + 1).toString().padStart(3)}/${Lanes.length}] ${lane.padEnd(50)} ${r.verdict.padEnd(22)} status=${r.status} ${r.elapsedMs}ms matched=${r.matched} (${flash})\n`
        )
        return r
    })
    const summary = {
        generatedAt: new Date().toISOString(),
        router: ROUTER,
        concurrency,
        timeoutMs,
        pngPath: IMG_PATH,
        expectedColors: EXPECTED,
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
    const passing = results.filter((r) => r.verdict === 'VISION_ON' || r.verdict === 'PARTIAL')
    const passingPath = outPath.replace(/vision-jury-probe-/, 'vision-jury-passing-').replace('.json', '-passing.json')
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
                    matched: r.matched,
                    found: r.found,
                    elapsedMs: r.elapsedMs,
                    responseModel: r.responseModel
                }))
            },
            null,
            2
        )
    )
    console.log('\n=== vision-jury-probe summary ===')
    for (const v of Object.keys(verdictCounts).sort()) {
        console.log(`  ${v.padEnd(22)} ${verdictCounts[v]}`)
    }
    console.log(`\n${passing.length} lanes with verdict VISION_ON or PARTIAL:`)
    for (const r of passing) {
        console.log(`  ${r.lane.padEnd(50)} ${r.verdict} matched=${r.matched}/4 ${r.elapsedMs}ms`)
    }
    console.log(`\nwrote ${outPath}`)
    console.log(`wrote ${passingPath}`)
})()
