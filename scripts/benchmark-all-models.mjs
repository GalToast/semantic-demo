#!/usr/bin/env node
/**
 * Model latency benchmark v3 — comprehensive: tests ALL models from ALL routes.
 * Uses max_tokens=500 (reasoning models need room), temperature=0, sequential requests.
 * Filters out non-chat models (embed, OCR, vision, audio, image, moderation).
 *
 * Usage: node scripts/benchmark-all-models.mjs [--route=<route>] [--timeout=<ms>] [--full]
 *   --route=x    Only test route x
 *   --timeout=n  Per-model timeout in ms (default 15000)
 *   --full       Skip dedup, test every route/model combo (default: dedup by model name)
 *
 * Output: TSV to stdout (clean, parseable), progress+summary to stderr.
 * Full JSON results written to tmp/benchmark-results.json
 */

import http from 'node:http'
import { URL } from 'node:url'
import fs from 'node:fs'

const ROUTER = 'http://127.0.0.1:8788'
const PROMPT = 'Reply with exactly: BENCH_OK. Do not call any tools.'
const DEFAULT_TIMEOUT = 15000

const ROUTES = [
    '/logfare/v1',
    '/opencode-zen/v1',
    '/nvidia/v1',
    '/cloudflare/v1',
    '/mistral/v1',
    '/kilo/v1',
    '/openrouter/v1',
    '/zydit/v1',
    '/neuralwatt/v1',
    '/llm7/v1',
    '/agnes/v1',
    '/zenmux/v1',
    '/modelscope/v1'
]
// NOTE: /freemodel/v1 is excluded — its /models endpoint hangs (8s+ timeout, 0 models returned)

// Non-chat model patterns to skip
const NON_CHAT =
    /embed|ocr|voxtral|moderation|tts|transcribe|whisper|deplot|bge-|starcoder|gpt-image|gemini-veo|firefly-video|flux-kontext|realtime|speech|music|video|image-edit|image-gen|sora|dall-e|stable-diffusion|midjourney/i

function fetchModels(route) {
    return new Promise((resolve) => {
        http.get(
            ROUTER + route + '/models',
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 10000
            },
            (res) => {
                let data = ''
                res.on('data', (c) => (data += c))
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data).data?.map((m) => m.id) || [])
                    } catch {
                        resolve([])
                    }
                })
            }
        ).on('error', () => resolve([]))
    })
}

function makeRequest(route, modelId, timeoutMs) {
    return new Promise((resolve) => {
        const url = new URL(ROUTER + route + '/chat/completions')
        const body = JSON.stringify({
            model: modelId,
            messages: [{ role: 'user', content: PROMPT }],
            max_tokens: 500,
            stream: false,
            temperature: 0
        })
        const startTime = Date.now()
        let firstByteTime = null

        const req = http.request(
            url,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
                timeout: timeoutMs
            },
            (res) => {
                let data = ''
                res.on('data', (chunk) => {
                    if (!firstByteTime) firstByteTime = Date.now()
                    data += chunk
                })
                res.on('end', () => {
                    const total = Date.now() - startTime
                    const ttft = firstByteTime ? firstByteTime - startTime : null
                    try {
                        const json = JSON.parse(data)
                        const content = json.choices?.[0]?.message?.content?.trim() || '(empty)'
                        const reasoning = json.choices?.[0]?.message?.reasoning_content?.trim()?.slice(0, 30) || ''
                        resolve({
                            route: route.replace('/v1', ''),
                            model: modelId,
                            status: res.statusCode,
                            ttft_ms: ttft,
                            total_ms: total,
                            tokens: json.usage?.completion_tokens || 0,
                            content: content.slice(0, 20),
                            has_reasoning: !!reasoning,
                            finish_reason: json.choices?.[0]?.finish_reason || '',
                            error: json.error?.message || (res.statusCode >= 400 ? `HTTP ${res.statusCode}` : null)
                        })
                    } catch {
                        resolve({
                            route: route.replace('/v1', ''),
                            model: modelId,
                            status: res.statusCode,
                            ttft_ms: ttft,
                            total_ms: total,
                            tokens: 0,
                            content: '(parse error)',
                            has_reasoning: false,
                            finish_reason: '',
                            error: data.slice(0, 60)
                        })
                    }
                })
            }
        )
        req.on('error', (e) =>
            resolve({
                route: route.replace('/v1', ''),
                model: modelId,
                status: 0,
                ttft_ms: null,
                total_ms: Date.now() - startTime,
                tokens: 0,
                content: '(error)',
                has_reasoning: false,
                finish_reason: '',
                error: e.message
            })
        )
        req.on('timeout', () => {
            req.destroy()
            resolve({
                route: route.replace('/v1', ''),
                model: modelId,
                status: 0,
                ttft_ms: null,
                total_ms: timeoutMs,
                tokens: 0,
                content: '(timeout)',
                has_reasoning: false,
                finish_reason: '',
                error: `${timeoutMs / 1000}s timeout`
            })
        })
        req.write(body)
        req.end()
    })
}

async function main() {
    const args = process.argv.slice(2)
    const routeFilter = args.find((a) => a.startsWith('--route='))?.split('=')[1]
    const timeoutArg = args.find((a) => a.startsWith('--timeout='))?.split('=')[1]
    const full = args.includes('--full')
    const timeoutMs = timeoutArg ? parseInt(timeoutArg) : DEFAULT_TIMEOUT

    process.stderr.write(`# Model Latency Benchmark v3 — ${new Date().toISOString()}\n`)
    process.stderr.write(
        `# Prompt: "${PROMPT}" | max_tokens=500 | temp=0 | timeout=${timeoutMs / 1000}s | dedup=${!full}\n\n`
    )

    // Discover all models — SEQUENTIAL to avoid one hanging route blocking all
    const allModels = []
    let skipped = 0
    for (const route of ROUTES) {
        if (routeFilter && !route.includes(routeFilter)) continue
        const models = await fetchModels(route)
        for (const modelId of models) {
            if (NON_CHAT.test(modelId)) {
                skipped++
                continue
            }
            allModels.push({ route, modelId })
        }
        process.stderr.write(`Discovered ${models.length} from ${route}\n`)
    }

    // Dedup by model name (keep first route found)
    let testList = allModels
    if (!full) {
        const seen = new Map()
        for (const m of allModels) {
            if (!seen.has(m.modelId)) seen.set(m.modelId, m)
        }
        testList = [...seen.values()]
    }
    process.stderr.write(`\n# Testing ${testList.length} models (${skipped} non-chat skipped, dedup=${!full})\n\n`)

    // TSV header to stdout (clean parseable output)
    process.stdout.write(
        'route\tmodel\tstatus\tttft_ms\ttotal_ms\ttokens\tfinish_reason\thas_reasoning\tcontent\terror\n'
    )

    // Run sequentially
    const results = []
    for (let i = 0; i < testList.length; i++) {
        const t = testList[i]
        const r = await makeRequest(t.route, t.modelId, timeoutMs)
        results.push(r)
        process.stderr.write(
            `[${i + 1}/${testList.length}] ${r.error ? '\u274c' : '\u2705'} ${r.route}/${r.model} \u2014 ${r.total_ms}ms\n`
        )
        // TSV line to stdout only
        process.stdout.write(
            `${r.route}\t${r.model}\t${r.status}\t${r.ttft_ms ?? ''}\t${r.total_ms}\t${r.tokens}\t${r.finish_reason}\t${r.has_reasoning}\t${r.content}\t${r.error ?? ''}\n`
        )
    }

    // Summary to stderr (keep stdout clean for TSV parsing)
    const working = results.filter((r) => !r.error)
    const failed = results.filter((r) => r.error)
    process.stderr.write(`\n# Summary: ${working.length}/${results.length} responded, ${failed.length} failed\n`)
    if (working.length > 0) {
        working.sort((a, b) => a.total_ms - b.total_ms)
        process.stderr.write(`# Fastest: ${working[0].total_ms}ms (${working[0].route}/${working[0].model})\n`)
        process.stderr.write(`# Median: ${working[Math.floor(working.length / 2)].total_ms}ms\n`)
        process.stderr.write(`# P90: ${working[Math.floor(working.length * 0.9)].total_ms}ms\n`)
    }

    // Write full JSON results
    const outPath = 'tmp/benchmark-results.json'
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2))
    process.stderr.write(`\nFull JSON results: ${outPath}\n`)
}

main().catch(console.error)
