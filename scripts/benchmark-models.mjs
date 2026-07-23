#!/usr/bin/env node
/**
 * Model latency benchmark v2 — auto-discovers models from each route's /models
 * endpoint, tests the most promising coding-relevant ones, and ranks by latency.
 *
 * Usage: node tmp/benchmark-models.mjs [--full] [--route=<route>]
 *   --full     Test ALL models (default: test curated subset only)
 *   --route=x  Only test models from route x (e.g., logfare, opencode-zen)
 */

import http from 'node:http'
import { URL } from 'node:url'

const ROUTER = 'http://127.0.0.1:8788'
const PROMPT = 'Reply with exactly: BENCH_OK. Do not call any tools.'
const TIMEOUT_MS = 30000

// Routes to benchmark
const ROUTES = ['/logfare/v1', '/opencode-zen/v1', '/nvidia/v1', '/cloudflare/v1', '/mistral/v1']

// Curated set of coding-relevant models to test (modelId as the route expects it)
// These are hand-picked for coding capability. Use --full to test everything.
const CURATED = {
    '/logfare/v1': [
        'deepseek-v4-pro',
        'deepseek-v4-flash',
        'kimi-k2.7-code',
        'kimi-k2.6',
        'minimax-m3',
        'glm-5.2',
        'qwen-3.8-max',
        'kiro-auto'
    ],
    '/opencode-zen/v1': [
        'deepseek-v4-pro',
        'deepseek-v4-flash',
        'deepseek-v4-flash-free',
        'mimo-v2.5-free',
        'kimi-k2.7-code',
        'kimi-k2.6',
        'minimax-m3',
        'glm-5.2',
        'qwen3.6-plus',
        'big-pickle',
        'nemotron-3-ultra-free',
        'north-mini-code-free',
        'laguna-s-2.1-free'
    ],
    '/nvidia/v1': [
        'deepseek-ai/deepseek-v4-flash',
        'deepseek-ai/deepseek-v4-pro',
        'z-ai/glm-5.2',
        'mistralai/mistral-medium-3.5-128b',
        'mistralai/mistral-small-4-119b-2603',
        'poolside/laguna-xs-2.1',
        'stepfun-ai/step-3.7-flash',
        'qwen/qwen3-coder-480b-a35b-instruct'
    ],
    '/cloudflare/v1': [
        '@cf/moonshotai/kimi-k2.6',
        '@cf/qwen/qwen3-30b-a3b-fp8',
        '@cf/qwen/qwq-32b',
        '@cf/qwen/qwen2.5-coder-32b-instruct',
        '@cf/openai/gpt-oss-120b',
        '@cf/openai/gpt-oss-20b',
        '@cf/zai-org/glm-4.7-flash',
        '@cf/mistralai/mistral-small-3.1-24b-instruct',
        '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
    ],
    '/mistral/v1': [
        'mistral-medium-2505',
        'mistral-medium-2508',
        'mistral-small-2603',
        'codestral-2508',
        'devstral-2512',
        'open-mistral-nemo'
    ]
}

function fetchModels(route) {
    return new Promise((resolve) => {
        const url = new URL(ROUTER + route + '/models')
        http.get(url, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }, (res) => {
            let data = ''
            res.on('data', (c) => (data += c))
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data).data?.map((m) => m.id) || [])
                } catch {
                    resolve([])
                }
            })
        }).on('error', () => resolve([]))
    })
}

function makeRequest(route, modelId, prompt) {
    return new Promise((resolve) => {
        const url = new URL(ROUTER + route + '/chat/completions')
        const body = JSON.stringify({
            model: modelId,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 50,
            stream: false
        })
        const startTime = Date.now()
        let firstByteTime = null

        const req = http.request(
            url,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
                timeout: TIMEOUT_MS
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
                        resolve({
                            route: route.replace('/v1', ''),
                            model: modelId,
                            status: res.statusCode,
                            ttft_ms: ttft,
                            total_ms: total,
                            tokens: json.usage?.completion_tokens || 0,
                            content: json.choices?.[0]?.message?.content?.trim().slice(0, 25) || '(empty)',
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
                total_ms: TIMEOUT_MS,
                tokens: 0,
                content: '(timeout)',
                error: `${TIMEOUT_MS / 1000}s timeout`
            })
        })
        req.write(body)
        req.end()
    })
}

async function main() {
    const args = process.argv.slice(2)
    const full = args.includes('--full')
    const routeFilter = args.find((a) => a.startsWith('--route='))?.split('=')[1]

    console.log('=== Model Latency Benchmark v2 ===')
    console.log(`Prompt: "${PROMPT}" | Timeout: ${TIMEOUT_MS / 1000}s | Mode: ${full ? 'full' : 'curated'}\n`)

    // Build test list
    const tests = []
    for (const route of ROUTES) {
        if (routeFilter && !route.includes(routeFilter)) continue
        const models = CURATED[route] || []
        const available = await fetchModels(route)
        for (const modelId of models) {
            if (available.includes(modelId) || full) {
                tests.push({ route, modelId })
            }
        }
    }

    console.log(`Testing ${tests.length} models across ${new Set(tests.map((t) => t.route)).size} routes...\n`)

    // Sequential to avoid 502 from parallel flooding
    const results = []
    for (const t of tests) {
        const r = await makeRequest(t.route, t.modelId, PROMPT)
        results.push(r)
        process.stderr.write(`${r.error ? '❌' : '✅'} ${r.route}/${r.model} — ${r.total_ms}ms\n`)
    }

    // Sort: working models by speed, errors last
    results.sort((a, b) => {
        if (a.error && !b.error) return 1
        if (!a.error && b.error) return -1
        return a.total_ms - b.total_ms
    })

    // Print table
    const W = { model: 48, status: 7, ttft: 8, total: 8, tokens: 7, content: 25 }
    console.log('\n' + '─'.repeat(110))
    console.log(
        'Model'.padEnd(W.model) +
            'Status'.padEnd(W.status) +
            'TTFT'.padStart(W.ttft) +
            'Total'.padStart(W.total) +
            'Tokens'.padStart(W.tokens) +
            '  Response'
    )
    console.log('─'.repeat(110))
    for (const r of results) {
        const ttft = r.ttft_ms ? r.ttft_ms + 'ms' : '—'
        const content = r.error ? `❌ ${r.error.slice(0, W.content)}` : `✅ ${r.content}`
        console.log(
            `${r.route}/${r.model}`.slice(0, W.model).padEnd(W.model) +
                String(r.status).padEnd(W.status) +
                ttft.padStart(W.ttft) +
                (r.total_ms + 'ms').padStart(W.total) +
                String(r.tokens).padStart(W.tokens) +
                '  ' +
                content
        )
    }

    // Summary stats
    const working = results.filter((r) => !r.error)
    console.log(
        `\n${working.length}/${results.length} models responded. ` +
            `Fastest: ${working[0]?.total_ms}ms (${working[0]?.route}/${working[0]?.model}). ` +
            `Median: ${working.length ? working[Math.floor(working.length / 2)].total_ms : '?'}ms.`
    )
}

main().catch(console.error)
