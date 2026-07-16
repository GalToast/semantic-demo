#!/usr/bin/env node
// scripts/vision-grader-inline.mjs — inline vision grader (NO agent loop).
//
// Sends images inline as image_url (data-URL base64) directly to the
// OpenAI-compat chat.completions endpoint. NO tool-use / no Pi harness loop.
// This is the bread-and-butter path for pure-VQA vision models (Llama-Vision,
// Nemotron-VL, NeVA, Kosmos-2, Fuyu, Phi-4-multimodal, Qwen3-VL, minimax-m3-NIM).
//
// MODES:
//   --mode=single   (DEFAULT) — sends ONE image per chat call (7 calls per model,
//                       accumulated into one report). Required for NIM Llama-Vision /
//                       Nemotron-VL ("At most 1 image(s) may be provided in one request").
//                       Slower but universal.
//   --mode=multi    — sends ALL 7 images in a single chat.completions call. Works for
//                       minimax-m3 on NIM (which accepts multi-image). Faster when
//                       supported. Skips surfaces entirely on hard-cap upstreams.
//
// Reasoning-split handling: some upstreams (ModelScope reasoning flag, Qwen3-VL) put
// the answer in `message.reasoning_content` instead of `message.content`. We prefer
// `content`, fall back to `reasoning_content`, and concatenate when both are short.
//
// The router endpoint per provider:
//   nvidia/<bare> modelscope/<bare> openrouter/<bare> kilo/<bare> mistral/<bare>
//   zen/<bare> logfare/<bare> cloudflare/<bare>  → http://127.0.0.1:8788/<prefix>/v1/chat/completions
//   agnes-2.0-flash (bare ref)                  → /agnes/v1
//
// Output: writes tmp/grade-phase2-inline-<slug>.md per model + summary JSON.

import fs from 'node:fs'
import path from 'node:path'

const ROUTER = process.env.KEY_ROUTER_URL || 'http://127.0.0.1:8788'
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

const IMAGES = [
    {
        path: 'tmp/phase2-desktop-overview-1280.small.png',
        name: 'Desktop overview @1280px',
        desc: 'header brand + 6 mode-chip rail + search over 3D mycelium canvas'
    },
    {
        path: 'tmp/phase2-search-coffee-1280.small.png',
        name: "Search 'coffee' @1280px",
        desc: 'results panel with count + result list + Show more button'
    },
    {
        path: 'tmp/phase2-focus-1280.small.png',
        name: 'Focus panel @1280px',
        desc: 'selected-business detail card + 3D canvas'
    },
    { path: 'tmp/phase2-map-1280.small.png', name: 'Map mode @1280px', desc: '2D map surface + filters + attribution' },
    { path: 'tmp/phase2-chips-820.small.png', name: 'Narrow desktop @820px', desc: 'header mode-chip rail' },
    {
        path: 'tmp/phase2-chips-768.small.png',
        name: '@768px header (icon-only chips)',
        desc: 'header icon-only-chip breakpoint'
    },
    { path: 'tmp/phase2-mobile-idle-375.small.png', name: 'Mobile idle @375px', desc: '2D placeholder path' }
]

const GRADER_SYSTEM = 'You are a senior UI/UX visual QA grader. You output only findings — no preamble.'

const singleImgPrompt = (
    im,
    i
) => `You grade ONE screenshot for the app "Semantic Explorer" (3D business-mycelium viz for Montgomery County TX businesses; desktop = WebGL canvas + header mode-chip rail; mobile = 2D placeholder).

Screenshot ${i + 1}: ${im.name} — ${im.desc}

Identify REAL issues VISIBLE in the pixels: horizontal overflow, text clipping (mid-word cuts), element overlap / z-index layering, off-screen / unreachable elements, unreadable text, empty / missing regions, misaligned / offset panels, loading-modal covering the actual surface.

Output ONLY this exact format (no preamble, no markdown bullets, no nested headers):

SEVERITY: High|Med|Low|None
ISSUES: <2-4 concrete sentences describing what's wrong, OR "None — surface renders cleanly" if no issues. Cite what you see.>

Severity: High = blocks usability, Med = visible flaw, Low = polish only.`

const multiImgPrompt = `Grade these 7 UI screenshots for "Semantic Explorer" — 3D business-mycelium visualization for Montgomery County TX businesses (desktop = WebGL 3D canvas + header mode-chip rail; mobile = 2D placeholder).

The 7 screenshots are attached in order 1 through 7. For EACH screenshot identify REAL issues VISIBLE in the pixels: horizontal overflow, text clipping (mid-word cuts), element overlap / z-index layering, off-screen / unreachable elements, unreadable text, empty / missing regions, misaligned / offset panels, loading-modal covering the actual surface.

Surface legend (screenshot index → name → description):
${IMAGES.map((im, i) => `  ${i + 1}. ${im.name} — ${im.desc}`).join('\n')}

OUTPUT FORMAT (markdown only):

## Findings Table
| Surface | Issues Found | Severity (High/Med/Low/None) | Evidence (what you see) |
|---|---|---|---|
... one row per screenshot, in order 1 through 7 ...

## TOP 3 most-severe issues across all surfaces
1. ...
2. ...
3. ...

RULES: Only CONCRETE issues you can SEE in pixels. Clean surface → "None". Severity High = blocks usability, Med = visible flaw, Low = polish only. Don't invent issues. If a splash/loading-modal blocks the surface, flag High+loading instead of guessing.`

function asRow(im, i, content) {
    const m = String(content).match(/SEVERITY:\s*(High|Med|Low|None)[\s\S]*?ISSUES:\s*([\s\S]+?)(?:\n\s*\n|\n*$|$)/i)
    if (m)
        return `| ${i + 1}. ${im.name} | ${m[2].trim().replace(/\s+/g, ' ').slice(0, 280)} | ${m[1]} | (from model) |`
    return `| ${i + 1}. ${im.name} | ${(String(content).replace(/\s+/g, ' ').trim() || '(no reply)').slice(0, 280)} | ? | (raw reply) |`
}

async function fetchOnce(url, body, timeoutMs) {
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
        const txt = await res.text()
        const elapsedMs = Date.now() - started
        if (!res.ok) return { ok: false, status: res.status, elapsedMs, error: txt.slice(0, 500) }
        let json
        try {
            json = JSON.parse(txt)
        } catch {
            json = null
        }
        const base = json?.choices?.[0]?.message?.content ?? json?.choices?.[0]?.delta?.content ?? ''
        const reasoning =
            json?.choices?.[0]?.message?.reasoning_content ?? json?.choices?.[0]?.delta?.reasoning_content ?? ''
        let content = base && base.length > 40 ? base : reasoning
        if (reasoning && base && base.length <= 40) content = (reasoning + '\n\n--- final ---\n' + base).trim()
        return {
            ok: true,
            status: res.status,
            elapsedMs,
            content: content || '',
            finishReason: json?.choices?.[0]?.finish_reason ?? null,
            responseModel: json?.model ?? null
        }
    } catch (e) {
        return { ok: false, status: null, error: e?.name === 'AbortError' ? 'timeout' : e?.message || String(e) }
    } finally {
        clearTimeout(t)
    }
}

function resolveRoute(modelRef) {
    let provider, bareModel
    if (modelRef === 'agnes-2.0-flash') {
        provider = 'agnes'
        bareModel = 'agnes-2.0-flash'
    } else {
        const slash = modelRef.indexOf('/')
        provider = modelRef.slice(0, slash)
        bareModel = modelRef.slice(slash + 1)
    }
    const prefix = PROVIDER_PREFIX[provider]
    if (!prefix) return { error: `unknown provider prefix for "${provider}"` }
    return { url: `${ROUTER}${prefix}/chat/completions`, bareModel }
}

function writeReport(modelRef, meta, content) {
    const slug = modelRef.replace(/[^A-Za-z0-9._-]+/g, '_')
    const outPath = `tmp/grade-phase2-inline-${slug}.md`
    fs.writeFileSync(outPath, content)
    process.stderr.write(`    ✓ wrote ${outPath} (${content.length} bytes)\n`)
    return { ok: true, status: 200, contentLen: content.length, outPath, ...meta }
}

async function gradeOne(modelRef, timeoutMs, mode) {
    const route = resolveRoute(modelRef)
    if (route.error) return { ok: false, error: route.error }
    const { url, bareModel } = route

    for (const im of IMAGES) {
        if (!fs.existsSync(im.path)) return { ok: false, error: `missing image: ${im.path}` }
    }

    process.stderr.write(`[grade ${mode}] ${modelRef} → ${url}\n`)

    if (mode === 'multi') {
        const userContent = [{ type: 'text', text: multiImgPrompt }]
        for (let i = 0; i < IMAGES.length; i++) {
            const buf = fs.readFileSync(IMAGES[i].path)
            userContent.push({ type: 'text', text: `--- Screenshot ${i + 1}: ${IMAGES[i].name} ---` })
            userContent.push({
                type: 'image_url',
                image_url: { url: `data:image/png;base64,${buf.toString('base64')}` }
            })
        }
        const body = {
            model: bareModel,
            temperature: 0,
            max_tokens: 4000,
            messages: [
                { role: 'system', content: GRADER_SYSTEM },
                { role: 'user', content: userContent }
            ]
        }
        const r = await fetchOnce(url, body, timeoutMs)
        if (!r.ok || !r.content || r.content.length < 80) {
            return {
                ok: false,
                status: r.status,
                elapsedMs: r.elapsedMs,
                error: r.error || `empty content (len=${r.content?.length ?? 0})`
            }
        }
        const content = `<!-- inline-multi-image: ${modelRef}  responseModel: ${r.responseModel}  finishReason: ${r.finishReason}  latency: ${r.elapsedMs}ms -->\n\n${r.content}`
        return writeReport(
            modelRef,
            { elapsedMs: r.elapsedMs, responseModel: r.responseModel, finishReason: r.finishReason },
            content
        )
    }

    // single-image mode (default): loop 7 calls, build a single report
    let rows = ''
    let totalLatency = 0
    let perImageErrors = 0
    for (let i = 0; i < IMAGES.length; i++) {
        const im = IMAGES[i]
        const buf = fs.readFileSync(im.path)
        const userContent = [
            { type: 'text', text: singleImgPrompt(im, i) },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${buf.toString('base64')}` } }
        ]
        const body = {
            model: bareModel,
            temperature: 0,
            max_tokens: 800,
            messages: [
                { role: 'system', content: GRADER_SYSTEM },
                { role: 'user', content: userContent }
            ]
        }
        const r = await fetchOnce(url, body, timeoutMs)
        if (r.elapsedMs) totalLatency += r.elapsedMs
        if (!r.ok || !r.content || r.content.length < 40) {
            rows += `| ${i + 1}. ${im.name} | (call failed: ${r.error || 'empty content'}) | - | - |\n`
            perImageErrors++
            process.stderr.write(`    ${i + 1}/${IMAGES.length} ${im.name} → ERROR ${r.error || 'empty'}\n`)
            continue
        }
        rows += asRow(im, i, r.content) + '\n'
        process.stderr.write(
            `    ${i + 1}/${IMAGES.length} ${im.name} → ${r.content.length} chars in ${r.elapsedMs}ms\n`
        )
    }
    const content = `<!-- inline single-image: ${modelRef}  totalLatency: ${totalLatency}ms  perImageErrors: ${perImageErrors}/${IMAGES.length} -->\n\n## Findings Table (single-image mode — 1 image/call)\n\n| Surface | Issues Found | Severity | Evidence/Notes |\n|---|---|---|---|\n${rows}\n\n## Notes\n- 1 image per chat.completions call (NIM Llama-Vision / Nemotron-VL hard cap).\n- Total per-surface latency sum: ${totalLatency}ms.\n- perImageErrors: ${perImageErrors}/${IMAGES.length}.\n`
    return writeReport(modelRef, { elapsedMs: totalLatency, responseModel: null, finishReason: 'multi-turn' }, content)
}

// ---- arg parse ----
const argv = process.argv.slice(2)
const argVal = (s) => {
    const a = argv.find((x) => x.startsWith(s + '='))
    return a ? a.slice(s.length + 1) : null
}
const modelsArg = argVal('--models')
const timeoutMs = Number(argVal('--timeout') ?? 180000)
const mode = argVal('--mode') || 'single' // single = default (NIM 1-image cap)
if (!modelsArg) {
    console.error(
        'Usage: node scripts/vision-grader-inline.mjs --models=<CSV> [--mode=single|multi] [--timeout=180000]'
    )
    console.error('Default mode=single (1 image per call). Use --mode=multi for minimax-m3 on NIM.')
    process.exit(2)
}
const models = modelsArg.split(',').filter(Boolean)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

;(async () => {
    const results = []
    for (const m of models) {
        const r = await gradeOne(m, timeoutMs, mode)
        results.push({ model: m, ...r })
        await sleep(500)
    }
    const summaryPath = `tmp/grade-phase2-inline-summary-${mode}.json`
    fs.writeFileSync(
        summaryPath,
        JSON.stringify({ generatedAt: new Date().toISOString(), mode, models: results }, null, 2)
    )
    console.log('=== inline grader summary ===')
    for (const r of results) {
        const mark = r.ok ? '✓' : '✗'
        console.log(
            `${mark} ${r.model.padEnd(48)} status=${r.status ?? '-'}  len=${r.contentLen ?? '-'}  ${r.error ? `err=${r.error}` : ''}`
        )
    }
    console.log(`wrote ${summaryPath}`)
})()
