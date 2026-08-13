#!/usr/bin/env node

/**
 * Run a bounded, secret-free health matrix against local model routers.
 * Catalog visibility, chat completion, reasoning metadata, and cooldowns are
 * intentionally reported as separate signals.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const DEFAULT_LAPTOP_ROUTER = 'http://127.0.0.1:8788'
const DEFAULT_PHONE_ROUTER = null
const DEFAULT_OUTPUT = path.join('tmp', 'phone-model-health', 'latest.json')
const DEFAULT_REPORT = path.join('tmp', 'phone-model-health', 'latest.md')
const DEFAULT_ROUTE_LIMIT = 8
const DEFAULT_MODEL_LIMIT = 1
const DEFAULT_CONCURRENCY = 2
const DEFAULT_TIMEOUT_MS = 8000
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1'])
const FREE_ROUTE_PROVIDERS = new Set(['agnes', 'cloudflare', 'logfare', 'modelscope', 'nvidia', 'zydit', 'zydit-v4', 'zyditv4'])

function numberArg(value, fallback, { min, max }) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return fallback
    return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

export function parseArgs(argv = process.argv.slice(2)) {
    const options = {
        laptopRouter: DEFAULT_LAPTOP_ROUTER,
        phoneRouter: DEFAULT_PHONE_ROUTER,
        output: DEFAULT_OUTPUT,
        report: null,
        smoke: false,
        includePaid: false,
        routeLimit: DEFAULT_ROUTE_LIMIT,
        modelLimit: DEFAULT_MODEL_LIMIT,
        concurrency: DEFAULT_CONCURRENCY,
        timeoutMs: DEFAULT_TIMEOUT_MS,
        providers: null,
        routes: null,
        help: false
    }

    for (const arg of argv) {
        if (arg === '--smoke') options.smoke = true
        else if (arg === '--include-paid') options.includePaid = true
        else if (arg === '--markdown') options.report = DEFAULT_REPORT
        else if (arg === '--help' || arg === '-h') options.help = true
        else if (arg.startsWith('--laptop-router=')) options.laptopRouter = arg.slice('--laptop-router='.length)
        else if (arg.startsWith('--phone-router=')) options.phoneRouter = arg.slice('--phone-router='.length)
        else if (arg.startsWith('--output=')) options.output = arg.slice('--output='.length)
        else if (arg.startsWith('--report=')) options.report = arg.slice('--report='.length)
        else if (arg.startsWith('--provider=')) options.providers = new Set(arg.slice('--provider='.length).split(',').filter(Boolean))
        else if (arg.startsWith('--route=')) options.routes = new Set(arg.slice('--route='.length).split(',').filter(Boolean))
        else if (arg.startsWith('--limit=')) options.routeLimit = numberArg(arg.slice('--limit='.length), DEFAULT_ROUTE_LIMIT, { min: 1, max: 32 })
        else if (arg.startsWith('--model-limit=')) options.modelLimit = numberArg(arg.slice('--model-limit='.length), DEFAULT_MODEL_LIMIT, { min: 1, max: 4 })
        else if (arg.startsWith('--concurrency=')) options.concurrency = numberArg(arg.slice('--concurrency='.length), DEFAULT_CONCURRENCY, { min: 1, max: 2 })
        else if (arg.startsWith('--timeout=')) options.timeoutMs = numberArg(arg.slice('--timeout='.length), DEFAULT_TIMEOUT_MS, { min: 250, max: DEFAULT_TIMEOUT_MS })
        else throw new Error(`Unknown argument: ${arg}`)
    }

    return options
}

function safeBaseUrl(value) {
    try {
        const url = new URL(String(value || ''))
        url.username = ''
        url.password = ''
        url.search = ''
        url.hash = ''
        return url.toString().replace(/\/$/, '')
    } catch {
        return '<invalid-url>'
    }
}

function isLocalUrl(value) {
    try {
        return LOCAL_HOSTS.has(new URL(value).hostname)
    } catch {
        return false
    }
}

function routePath(value) {
    try {
        const url = new URL(value)
        return url.pathname.replace(/\/+$/, '') || '/'
    } catch {
        return '<invalid-path>'
    }
}

export function scrubSecrets(value) {
    return String(value || '')
        .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer <redacted>')
        .replace(/(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}/gi, '<redacted-key>')
        .replace(/([?&](?:key|token|api_key|apikey|secret)=)[^&\s]+/gi, '$1<redacted>')
        .slice(0, 300)
}

function modelIds(payload) {
    const data = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : []
    return [...new Set(data.map((item) => (typeof item === 'string' ? item : item?.id || item?.name || item?.model)).filter(Boolean))]
}

function nestedNumber(payload, names) {
    if (!payload || typeof payload !== 'object') return null
    const queue = [payload]
    const visited = new Set()
    while (queue.length) {
        const current = queue.shift()
        if (!current || typeof current !== 'object' || visited.has(current)) continue
        visited.add(current)
        for (const name of names) {
            const value = current[name]
            if (Number.isFinite(Number(value))) return Number(value)
        }
        for (const value of Object.values(current)) if (value && typeof value === 'object') queue.push(value)
    }
    return null
}

function retryAfterMs(headers, payload) {
    const nextReady = nestedNumber(payload, ['nextReadyInMs', 'retryAfterMs', 'retry_after_ms'])
    if (nextReady !== null) return Math.max(0, Math.trunc(nextReady))
    const raw = headers?.get?.('retry-after')
    if (!raw) return null
    const seconds = Number(raw)
    if (Number.isFinite(seconds)) return Math.max(0, Math.trunc(seconds * 1000))
    const timestamp = Date.parse(raw)
    return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : null
}

function errorText(payload, text) {
    return scrubSecrets(payload?.error?.message || payload?.message || text || '')
}

async function requestJson(fetchImpl, url, { method = 'GET', body = null, timeoutMs }) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const started = Date.now()
    try {
        const response = await fetchImpl(url, {
            method,
            headers: body ? { 'content-type': 'application/json', accept: 'application/json' } : { accept: 'application/json' },
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal
        })
        const text = await response.text()
        let payload = null
        try {
            payload = text ? JSON.parse(text) : null
        } catch {
            payload = null
        }
        return {
            status: response.status,
            ok: response.ok,
            payload,
            text,
            headers: response.headers,
            elapsedMs: Date.now() - started
        }
    } catch (error) {
        return {
            status: null,
            ok: false,
            payload: null,
            text: '',
            headers: null,
            elapsedMs: Date.now() - started,
            error: error?.name === 'AbortError' ? 'timeout' : scrubSecrets(error?.message || error)
        }
    } finally {
        clearTimeout(timer)
    }
}

function classifyCatalog(request) {
    if (request.error === 'timeout') return 'timeout'
    if (request.status === 429) return 'cooldown'
    if (request.status === 200 && request.ok) return 'catalog_visible'
    if (request.status === null) return 'transport_error'
    return 'catalog_error'
}

function classifyChat(request) {
    if (request.error === 'timeout') return 'timeout'
    if (request.status === 429) return 'cooldown'
    if (request.status === 200 && request.ok && request.payload?.choices?.[0]) return 'chat_ok'
    if (request.status === null) return 'transport_error'
    return 'chat_error'
}

function reasoningSeen(choice) {
    const message = choice?.message || choice?.delta || {}
    return Boolean(message.reasoning_content || message.reasoning || choice?.reasoning_content || choice?.reasoning)
}

function toolEvidence(choice) {
    const message = choice?.message || choice?.delta || {}
    return Boolean((Array.isArray(message.tool_calls) && message.tool_calls.length) || message.function_call)
}

function isLikelyNonChat(id) {
    return /embedding|rerank|image|tts|audio|whisper|lyria|deplot|safety/i.test(id)
}

function isFreeModelId(id) {
    return /(?:^|[:/-])free(?:$|[-/:])/i.test(id) || /:free$/i.test(id) || /laguna-s-2\.1/i.test(id)
}

function selectSmokeModels(provider, ids, options) {
    const chatIds = ids.filter((id) => !isLikelyNonChat(id))
    if (options.includePaid) return chatIds.slice(0, options.modelLimit)
    if (FREE_ROUTE_PROVIDERS.has(provider)) return chatIds.slice(0, options.modelLimit)
    const freeIds = chatIds.filter(isFreeModelId)
    return freeIds.slice(0, options.modelLimit)
}

function routeFromCatalog(routerBase, route) {
    const prefix = route.routePrefix || route.route || ''
    const advertisedBaseUrl = route.baseUrl || `${routerBase.replace(/\/$/, '')}${prefix}`
    let baseUrl = advertisedBaseUrl
    try {
        const routerUrl = new URL(routerBase)
        const advertisedUrl = new URL(advertisedBaseUrl)
        if (LOCAL_HOSTS.has(advertisedUrl.hostname)) {
            routerUrl.pathname = advertisedUrl.pathname
            routerUrl.search = ''
            routerUrl.hash = ''
            baseUrl = routerUrl.toString()
        }
    } catch {
        baseUrl = `${routerBase.replace(/\/$/, '')}${prefix}`
    }
    return {
        provider: String(route.providerId || route.providerKey || route.provider || prefix || 'unknown'),
        route: routePath(baseUrl),
        baseUrl: safeBaseUrl(baseUrl)
    }
}

function selectedRoute(route, options) {
    if (options.providers && !options.providers.has(route.provider) && ![...options.providers].some((value) => route.route.includes(value))) return false
    if (options.routes && !options.routes.has(route.route) && ![...options.routes].some((value) => route.route.includes(value))) return false
    return true
}

async function mapWithConcurrency(items, concurrency, worker) {
    const results = new Array(items.length)
    let cursor = 0
    async function consume() {
        while (true) {
            const index = cursor++
            if (index >= items.length) return
            results[index] = await worker(items[index], index)
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, consume))
    return results
}

async function probeRoute(fetchImpl, router, route, options) {
    if (!isLocalUrl(route.baseUrl)) {
        return { provider: route.provider, route: route.route, baseUrl: route.baseUrl, status: 'skipped_external', modelCount: 0, modelSample: [], smoke: [] }
    }

    const catalogRequest = await requestJson(fetchImpl, `${route.baseUrl}/models`, { timeoutMs: options.timeoutMs })
    const catalogStatus = classifyCatalog(catalogRequest)
    const ids = modelIds(catalogRequest.payload)
    const result = {
        provider: route.provider,
        route: route.route,
        baseUrl: route.baseUrl,
        status: catalogStatus,
        statusCode: catalogRequest.status,
        elapsedMs: catalogRequest.elapsedMs,
        modelCount: ids.length,
        modelIds: ids,
        modelSample: ids.slice(0, 8),
        retryAfterMs: retryAfterMs(catalogRequest.headers, catalogRequest.payload),
        error: catalogStatus === 'catalog_visible' ? null : errorText(catalogRequest.payload, catalogRequest.text || catalogRequest.error),
        smokeSkippedReason: null,
        smoke: []
    }

    if (!options.smoke || catalogStatus !== 'catalog_visible') return result

    const candidates = selectSmokeModels(route.provider, ids, options)
    if (!candidates.length) {
        result.smokeSkippedReason = 'no-free-model-candidate'
        return result
    }
    result.smoke = await mapWithConcurrency(candidates, options.concurrency, async (model) => {
        const request = await requestJson(fetchImpl, `${route.baseUrl}/chat/completions`, {
            method: 'POST',
            body: { model, messages: [{ role: 'user', content: 'Reply with exactly: ok' }], max_tokens: 8, temperature: 0 },
            timeoutMs: options.timeoutMs
        })
        const choice = request.payload?.choices?.[0]
        const status = classifyChat(request)
        return {
            model,
            status,
            statusCode: request.status,
            elapsedMs: request.elapsedMs,
            reasoningSeen: reasoningSeen(choice),
            toolEvidence: toolEvidence(choice),
            contentPreview: scrubSecrets(choice?.message?.content || choice?.delta?.content || '').slice(0, 80),
            retryAfterMs: retryAfterMs(request.headers, request.payload),
            error: status === 'chat_ok' ? null : errorText(request.payload, request.text || request.error)
        }
    })
    return result
}

async function probeRouter(fetchImpl, router, options) {
    const catalogRequest = await requestJson(fetchImpl, `${router.baseUrl}/catalog`, { timeoutMs: options.timeoutMs })
    const routes = Array.isArray(catalogRequest.payload?.routes) ? catalogRequest.payload.routes.map((route) => routeFromCatalog(router.baseUrl, route)).filter((route) => route.route !== '<invalid-path>') : []
    const selected = routes.filter((route) => selectedRoute(route, options)).slice(0, options.routeLimit)
    const routerResult = {
        name: router.name,
        baseUrl: safeBaseUrl(router.baseUrl),
        catalogStatus: catalogRequest.error === 'timeout' ? 'timeout' : catalogRequest.ok ? 'catalog_visible' : 'catalog_error',
        catalogStatusCode: catalogRequest.status,
        catalogElapsedMs: catalogRequest.elapsedMs,
        routeCount: routes.length,
        selectedRouteCount: selected.length,
        error: catalogRequest.ok ? null : errorText(catalogRequest.payload, catalogRequest.text || catalogRequest.error),
        routes: []
    }
    if (!catalogRequest.ok) return routerResult
    routerResult.routes = await mapWithConcurrency(selected, options.concurrency, (route) => probeRoute(fetchImpl, router, route, options))
    return routerResult
}

export async function buildHealthMatrix({
    fetchImpl = globalThis.fetch,
    routers = [{ name: 'laptop', baseUrl: DEFAULT_LAPTOP_ROUTER }],
    smoke = false,
    includePaid = false,
    routeLimit = DEFAULT_ROUTE_LIMIT,
    modelLimit = DEFAULT_MODEL_LIMIT,
    concurrency = DEFAULT_CONCURRENCY,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    providers = null,
    routes = null
} = {}) {
    const options = {
        smoke: Boolean(smoke),
        includePaid: Boolean(includePaid),
        routeLimit: numberArg(routeLimit, DEFAULT_ROUTE_LIMIT, { min: 1, max: 32 }),
        modelLimit: numberArg(modelLimit, DEFAULT_MODEL_LIMIT, { min: 1, max: 4 }),
        concurrency: numberArg(concurrency, DEFAULT_CONCURRENCY, { min: 1, max: 2 }),
        timeoutMs: numberArg(timeoutMs, DEFAULT_TIMEOUT_MS, { min: 250, max: DEFAULT_TIMEOUT_MS }),
        providers: providers ? new Set(providers) : null,
        routes: routes ? new Set(routes) : null
    }
    const routerResults = await mapWithConcurrency(
        routers.map((router) => ({ name: router.name, baseUrl: safeBaseUrl(router.baseUrl) })),
        options.concurrency,
        (router) => probeRouter(fetchImpl, router, options)
    )
    const routeResults = routerResults.flatMap((router) => router.routes)
    const smokeResults = routeResults.flatMap((route) => route.smoke)
    return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        policy: {
            secretFree: true,
            defaultMode: 'catalog_only',
            smokeRequiresExplicitFlag: true,
            maxConcurrency: 2,
            maxTimeoutMs: DEFAULT_TIMEOUT_MS,
            automaticRetries: false,
            catalogVisibilityIsNotChatProof: true,
            modelIdsArePreservedForExactCapabilityMatching: true
        },
        options: {
            smoke: options.smoke,
            includePaid: options.includePaid,
            routeLimit: options.routeLimit,
            modelLimit: options.modelLimit,
            concurrency: options.concurrency,
            timeoutMs: options.timeoutMs
        },
        routers: routerResults,
        summary: {
            routers: routerResults.length,
            selectedRoutes: routeResults.length,
            catalogVisible: routeResults.filter((route) => route.status === 'catalog_visible').length,
            cooldowns: routeResults.filter((route) => route.status === 'cooldown').length + smokeResults.filter((smokeResult) => smokeResult.status === 'cooldown').length,
            chatOk: smokeResults.filter((smokeResult) => smokeResult.status === 'chat_ok').length,
            reasoningSeen: smokeResults.filter((smokeResult) => smokeResult.reasoningSeen).length,
            toolEvidence: smokeResults.filter((smokeResult) => smokeResult.toolEvidence).length,
            timeouts: routeResults.filter((route) => route.status === 'timeout').length + smokeResults.filter((smokeResult) => smokeResult.status === 'timeout').length
        }
    }
}

function markdownReport(matrix) {
    const lines = [
        '# Phone Model Health',
        '',
        `Generated: ${matrix.generatedAt}`,
        `Mode: ${matrix.options.smoke ? 'catalog + bounded chat smoke' : 'catalog only'}`,
        '',
        '| Router | Catalog | Selected routes | Visible | Cooldowns | Chat OK | Reasoning | Timeouts |',
        '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |'
    ]
    for (const router of matrix.routers) {
        const visible = router.routes.filter((route) => route.status === 'catalog_visible').length
        const cooldowns = router.routes.filter((route) => route.status === 'cooldown').length + router.routes.flatMap((route) => route.smoke).filter((result) => result.status === 'cooldown').length
        const smoke = router.routes.flatMap((route) => route.smoke)
        lines.push(`| ${router.name} | ${router.catalogStatus} | ${router.selectedRouteCount} | ${visible} | ${cooldowns} | ${smoke.filter((result) => result.status === 'chat_ok').length} | ${smoke.filter((result) => result.reasoningSeen).length} | ${router.routes.filter((route) => route.status === 'timeout').length + smoke.filter((result) => result.status === 'timeout').length} |`)
    }
    lines.push('', 'Catalog visibility is discovery evidence only; chat, reasoning, and tool signals are recorded separately.')
    return `${lines.join('\n')}\n`
}

function ensureParent(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

async function main() {
    const options = parseArgs()
    if (options.help) {
        console.log('Usage: node scripts/phone-model-health.mjs [--phone-router=URL] [--smoke] [--include-paid] [--limit=N] [--model-limit=N] [--markdown]')
        return
    }
    const routers = [{ name: 'laptop', baseUrl: options.laptopRouter }]
    if (options.phoneRouter) routers.push({ name: 'phone', baseUrl: options.phoneRouter })
    const matrix = await buildHealthMatrix({ ...options, routers })
    const outputPath = path.resolve(options.output)
    ensureParent(outputPath)
    fs.writeFileSync(outputPath, `${JSON.stringify(matrix, null, 2)}\n`, 'utf8')
    if (options.report) {
        const reportPath = path.resolve(options.report)
        ensureParent(reportPath)
        fs.writeFileSync(reportPath, markdownReport(matrix), 'utf8')
    }
    console.log(JSON.stringify({ output: outputPath, report: options.report ? path.resolve(options.report) : null, summary: matrix.summary }, null, 2))
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null
if (invokedPath === import.meta.url) main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1 })
