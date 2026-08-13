#!/usr/bin/env node

/**
 * Build the canonical, secret-free model catalogue used by the laptop and
 * phone Pi installations.
 *
 * The catalogue is intentionally broader than models.json. It preserves all
 * model records found in the local harness registries and live local-router
 * catalogues, including failed or phone-unavailable routes. The generated Pi
 * projection contains only models that the phone router currently exposes.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const DEFAULT_LAPTOP_ROUTER = 'http://127.0.0.1:8788'
const DEFAULT_PHONE_PROBE_ROUTER = 'http://127.0.0.1:18789'
const DEFAULT_PHONE_DEVICE_ROUTER = 'http://127.0.0.1:8789'
const DEFAULT_OUTPUT = path.join('tmp', 'phone-model-parity', 'canonical-model-catalog.json')
const DEFAULT_PROJECTION_OUTPUT = path.join('tmp', 'phone-model-parity', 'phone-models.projection.json')
const REQUEST_TIMEOUT_MS = 12000

const MODEL_FIELDS = [
    'id',
    'name',
    'description',
    'reasoning',
    'supportsReasoning',
    'supportsReasoningEffort',
    'supportsVision',
    'supportsTools',
    'contextWindow',
    'maxTokens',
    'input',
    'thinkingLevelMap',
    'reasoningEffort',
    'metadataSource',
    'metadataConfidence',
    'metadataLastVerified',
    'tier',
    'free',
    'cost',
    'intelligenceScore',
    'codingScore',
    'normalizedModel'
]

const SAFE_GENERATION_FIELDS = [
    'contextWindowSize',
    'max_tokens',
    'timeout',
    'reasoning',
    'thinkingConfig',
    'schemaCompliance',
    'samplingParams'
]

const SENSITIVE_KEY = /^(?:api[_-]?key|authorization|cookie|credential|headers?|password|secret|token|private[_-]?key|options?|env)$/i
const SECRET_PATTERN = /(?:bearer\s+\S{12,}|sk-[a-z0-9]{16,}|rk-[a-z0-9]{16,}|pk-[a-z0-9]{16,}|AIza[a-z0-9]{20,}|gh[pousr]_[a-z0-9]{20,}|xox[baprs]-[a-z0-9-]{20,})/i

function argValue(name, fallback = null) {
    const prefix = `--${name}=`
    const value = process.argv.find((arg) => arg.startsWith(prefix))
    return value ? value.slice(prefix.length) : fallback
}

function hasFlag(name) {
    return process.argv.includes(`--${name}`)
}

function ensureParent(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function relativeHomePath(filePath) {
    const home = os.homedir().replace(/\\/g, '/')
    const normalized = path.resolve(filePath).replace(/\\/g, '/')
    if (normalized.toLowerCase().startsWith(`${home.toLowerCase()}/`)) {
        return `~/${normalized.slice(home.length + 1)}`
    }
    return normalized
}

function safeValue(value, depth = 0) {
    if (depth > 8 || value === null || value === undefined) return value
    if (typeof value === 'string') return SECRET_PATTERN.test(value) ? '<redacted>' : value
    if (typeof value !== 'object') return value
    if (Array.isArray(value)) return value.map((item) => safeValue(item, depth + 1))

    const result = {}
    for (const [key, nested] of Object.entries(value)) {
        if (SENSITIVE_KEY.test(key)) continue
        result[key] = safeValue(nested, depth + 1)
    }
    return result
}

function safeBaseUrl(value) {
    if (typeof value !== 'string' || !value) return null
    try {
        const url = new URL(value)
        url.username = ''
        url.password = ''
        url.search = ''
        url.hash = ''
        return url.toString().replace(/\/$/, '')
    } catch {
        return null
    }
}

function routePath(value) {
    const safeUrl = safeBaseUrl(value)
    if (!safeUrl) return null
    return new URL(safeUrl).pathname.replace(/\/+$/, '') || '/'
}

function routeNetwork(value) {
    const safeUrl = safeBaseUrl(value)
    if (!safeUrl) return 'unresolved'
    const url = new URL(safeUrl)
    return ['127.0.0.1', 'localhost', '::1'].includes(url.hostname) ? 'local' : 'external'
}

function canonicalProvider(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
}

function routeKey(baseUrl, provider) {
    const safeUrl = safeBaseUrl(baseUrl)
    if (!safeUrl) return `unresolved:${canonicalProvider(provider) || 'unknown'}`
    const url = new URL(safeUrl)
    return `${routeNetwork(safeUrl)}:${url.hostname.toLowerCase()}:${url.pathname.replace(/\/+$/, '').toLowerCase() || '/'}`
}

function sourceModelMetadata(record) {
    const metadata = {}
    for (const field of MODEL_FIELDS) {
        if (record?.[field] !== undefined) metadata[field] = safeValue(record[field])
    }
    if (typeof record?.envKey === 'string' && /^[A-Z][A-Z0-9_]+$/.test(record.envKey)) {
        metadata.credentialEnv = record.envKey
    }
    if (record?.generationConfig && typeof record.generationConfig === 'object') {
        const generation = {}
        for (const field of SAFE_GENERATION_FIELDS) {
            if (record.generationConfig[field] !== undefined) generation[field] = safeValue(record.generationConfig[field])
        }
        if (Object.keys(generation).length) metadata.generationConfig = generation
    }
    if (record?.compat && typeof record.compat === 'object') {
        const compat = {}
        for (const field of ['supportsReasoningEffort', 'supportsStore', 'supportsDeveloperRole', 'supportsStrictMode', 'maxTokensField']) {
            if (record.compat[field] !== undefined) compat[field] = safeValue(record.compat[field])
        }
        if (Object.keys(compat).length) metadata.compat = compat
    }
    return metadata
}

function pickBaseUrl(record, context = {}) {
    return (
        record?.baseUrl ||
        record?.base_url ||
        record?.endpoint ||
        context.baseUrl ||
        context.base_url ||
        context.options?.baseURL ||
        context.options?.baseUrl ||
        null
    )
}

function makeSourceRecord(source, providerKey, record, context = {}) {
    if (!record || typeof record !== 'object') return null
    const id = String(record.id || record.modelId || record.model || record.name || '').trim()
    if (!id) return null

    const provider = String(record.provider || context.provider || providerKey || 'unknown').trim() || 'unknown'
    const baseUrl = safeBaseUrl(pickBaseUrl(record, context))
    return {
        id,
        provider,
        api: record.api || context.api || null,
        baseUrl,
        route: routeKey(baseUrl, provider),
        network: routeNetwork(baseUrl),
        path: routePath(baseUrl),
        metadata: sourceModelMetadata({ ...context, ...record }),
        sourceId: source.id,
        sourceKind: source.kind,
        sourceProvider: providerKey || null,
        configured: true
    }
}

function asRecordList(value) {
    if (Array.isArray(value)) return value
    if (value && typeof value === 'object') {
        return Object.entries(value).map(([id, model]) => ({
            ...(model && typeof model === 'object' ? model : {}),
            id: model && typeof model === 'object' && model.id ? model.id : id
        }))
    }
    return []
}

function extractSourceRecords(source, payload) {
    if (!payload || typeof payload !== 'object') return []
    const records = []

    if (source.kind === 'model-providers') {
        for (const [providerKey, models] of Object.entries(payload.modelProviders || {})) {
            for (const record of asRecordList(models)) {
                const normalized = makeSourceRecord(source, providerKey, record, { provider: providerKey })
                if (normalized) records.push(normalized)
            }
        }
    } else if (source.kind === 'pi-models') {
        for (const [providerKey, config] of Object.entries(payload.providers || {})) {
            for (const record of asRecordList(config?.models)) {
                const normalized = makeSourceRecord(source, providerKey, record, config)
                if (normalized) records.push(normalized)
            }
        }
    } else if (source.kind === 'models-store') {
        for (const [providerKey, config] of Object.entries(payload)) {
            for (const record of asRecordList(config?.models)) {
                const normalized = makeSourceRecord(source, providerKey, record, config)
                if (normalized) records.push(normalized)
            }
        }
    } else if (source.kind === 'opencode') {
        for (const [providerKey, config] of Object.entries(payload.provider || {})) {
            for (const [modelId, modelConfig] of Object.entries(config?.models || {})) {
                const record = {
                    ...(modelConfig && typeof modelConfig === 'object' ? modelConfig : {}),
                    id: modelId,
                    provider: providerKey,
                    baseUrl: modelConfig?.baseUrl || config.baseUrl || config.options?.baseURL || config.options?.baseUrl,
                    api: modelConfig?.api || config.api
                }
                const normalized = makeSourceRecord(source, providerKey, record, config)
                if (normalized) records.push(normalized)
            }
        }
    } else if (source.kind === 'cline') {
        for (const [providerKey, config] of Object.entries(payload.providers || {})) {
            for (const record of asRecordList(config?.models)) {
                const normalized = makeSourceRecord(source, providerKey, record, config)
                if (normalized) records.push(normalized)
            }
        }
    }

    return records
}

export function defaultSourceSpecs(home = os.homedir()) {
    return [
        { id: 'qwen-settings', label: 'Qwen settings model registry', kind: 'model-providers', filePath: path.join(home, '.qwen', 'settings.json') },
        { id: 'pi-model-providers', label: 'Pi generated provider registry', kind: 'model-providers', filePath: path.join(home, '.pi', 'agent', 'model-providers.json') },
        { id: 'pi-models', label: 'Pi native picker registry', kind: 'pi-models', filePath: path.join(home, '.pi', 'agent', 'models.json') },
        { id: 'pi-models-store', label: 'Pi model cache', kind: 'models-store', filePath: path.join(home, '.pi', 'agent', 'models-store.json') },
        { id: 'opencode-config-main', label: 'OpenCode config', kind: 'opencode', filePath: path.join(home, '.config', 'opencode', 'opencode.json') },
        { id: 'opencode-config-roaming', label: 'OpenCode roaming config', kind: 'opencode', filePath: path.join(home, 'AppData', 'Roaming', 'opencode', 'opencode.json') },
        { id: 'opencode-config-legacy', label: 'OpenCode legacy config', kind: 'opencode', filePath: path.join(home, '.opencode', 'opencode.json') },
        { id: 'cline-providers', label: 'Cline provider settings', kind: 'cline', filePath: path.join(home, '.cline', 'data', 'settings', 'providers.json') }
    ]
}

export function loadSources(sourceSpecs) {
    return sourceSpecs.map((source) => {
        const descriptor = {
            id: source.id,
            label: source.label,
            kind: source.kind,
            location: relativeHomePath(source.filePath),
            exists: fs.existsSync(source.filePath),
            recordCount: 0,
            providerCount: 0,
            parseError: null
        }
        if (!descriptor.exists) return { ...descriptor, records: [] }

        try {
            const payload = readJson(source.filePath)
            const records = extractSourceRecords(source, payload)
            const providerKeys = new Set(records.map((record) => record.sourceProvider).filter(Boolean))
            return { ...descriptor, records, recordCount: records.length, providerCount: providerKeys.size }
        } catch (error) {
            return { ...descriptor, records: [], parseError: String(error?.message || error).slice(0, 240) }
        }
    })
}

async function fetchJson(url, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
        const response = await fetch(url, { headers: { accept: 'application/json' }, signal: controller.signal })
        const text = await response.text()
        let payload = null
        try {
            payload = text ? JSON.parse(text) : null
        } catch {
            payload = null
        }
        return { response, payload, text }
    } finally {
        clearTimeout(timer)
    }
}

function joinRouterPath(routerBase, routePathValue, suffix = '') {
    const router = new URL(routerBase)
    const prefix = router.pathname.replace(/\/+$/, '')
    const route = String(routePathValue || '/').replace(/^\/+/, '')
    router.pathname = `${prefix}/${route}${suffix}`.replace(/\/+/g, '/')
    router.search = ''
    router.hash = ''
    return router.toString()
}

function modelIds(payload) {
    const values = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : []
    return [...new Set(values.map((item) => (typeof item === 'string' ? item : item?.id || item?.model || item?.name)).filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

function routerRouteBase(route, routerBase) {
    const explicit = route?.baseUrl || route?.base_url
    if (safeBaseUrl(explicit)) return safeBaseUrl(explicit)
    const prefix = route?.routePrefix || route?.path || route?.prefix
    return prefix ? joinRouterPath(routerBase, prefix) : null
}

async function fetchLiveRouter(routerBase, label) {
    const result = { label, router: safeBaseUrl(routerBase), status: 'unprobed', statusCode: null, error: null, routes: [] }
    if (!routerBase) return result

    try {
        const catalog = await fetchJson(`${String(routerBase).replace(/\/$/, '')}/catalog`)
        result.statusCode = catalog.response.status
        if (!catalog.response.ok) {
            result.status = 'catalog_error'
            result.error = String(catalog.payload?.error?.message || catalog.text || `HTTP ${catalog.response.status}`).slice(0, 240)
            return result
        }
        result.status = 'catalog_visible'
        const routes = Array.isArray(catalog.payload?.routes) ? catalog.payload.routes : []
        result.routes = await Promise.all(routes.map(async (route) => {
            const baseUrl = routerRouteBase(route, routerBase)
            const provider = String(route.providerId || route.providerKey || route.provider || route.routePrefix || 'unknown')
            const pathValue = routePath(baseUrl) || String(route.routePrefix || route.path || '/')
            const entry = {
                provider,
                api: route.api || 'openai-completions',
                baseUrl,
                path: pathValue,
                route: routeKey(baseUrl, provider),
                network: routeNetwork(baseUrl),
                status: 'unprobed',
                statusCode: null,
                modelIds: [],
                error: null
            }
            if (!baseUrl) {
                entry.status = 'invalid_route'
                entry.error = 'Router catalog route has no usable base URL.'
                return entry
            }
            try {
                const models = await fetchJson(joinRouterPath(routerBase, pathValue, '/models'))
                entry.statusCode = models.response.status
                entry.modelIds = modelIds(models.payload)
                entry.status = models.response.ok ? 'catalog_visible' : 'catalog_error'
                if (!models.response.ok) entry.error = String(models.payload?.error?.message || models.text || `HTTP ${models.response.status}`).slice(0, 240)
            } catch (error) {
                entry.status = error?.name === 'AbortError' ? 'timeout' : 'transport_error'
                entry.error = String(error?.message || error).slice(0, 240)
            }
            return entry
        }))
        return result
    } catch (error) {
        result.status = error?.name === 'AbortError' ? 'timeout' : 'transport_error'
        result.error = String(error?.message || error).slice(0, 240)
        return result
    }
}

function mergeMetadata(existing, incoming) {
    const result = { ...existing }
    for (const [key, value] of Object.entries(incoming || {})) {
        if (value === undefined || value === null) continue
        if (result[key] === undefined || result[key] === null || result[key] === '') result[key] = value
    }
    return result
}

function addModel(modelMap, record) {
    const key = `${record.route}\u0000${record.id}`
    const existing = modelMap.get(key)
    if (!existing) {
        modelMap.set(key, {
            id: record.id,
            provider: record.provider,
            api: record.api || null,
            baseUrl: record.baseUrl,
            route: record.route,
            path: record.path,
            network: record.network,
            metadata: { ...record.metadata },
            sources: record.sourceId ? [record.sourceId] : [],
            sourceProviders: record.sourceProvider ? [record.sourceProvider] : [],
            configured: Boolean(record.configured),
            laptopCatalogVisible: Boolean(record.laptopCatalogVisible)
        })
        return modelMap.get(key)
    }
    existing.metadata = mergeMetadata(existing.metadata, record.metadata)
    existing.provider ||= record.provider
    existing.api ||= record.api || null
    existing.baseUrl ||= record.baseUrl
    existing.path ||= record.path
    existing.network ||= record.network
    existing.configured ||= Boolean(record.configured)
    existing.laptopCatalogVisible ||= Boolean(record.laptopCatalogVisible)
    if (record.sourceId && !existing.sources.includes(record.sourceId)) existing.sources.push(record.sourceId)
    if (record.sourceProvider && !existing.sourceProviders.includes(record.sourceProvider)) existing.sourceProviders.push(record.sourceProvider)
    return existing
}

function addLiveRecords(modelMap, liveRouter, sourceId) {
    for (const route of liveRouter?.routes || []) {
        for (const id of route.modelIds || []) {
            addModel(modelMap, {
                id,
                provider: route.provider,
                api: route.api,
                baseUrl: route.baseUrl,
                route: route.route,
                path: route.path,
                network: route.network,
                metadata: { liveCatalog: true },
                sourceId,
                sourceProvider: route.provider,
                configured: false,
                laptopCatalogVisible: liveRouter.label === 'laptop'
            })
        }
    }
}

function findPhoneRoute(model, phoneRoutes) {
    const sourcePath = String(model.path || '').toLowerCase()
    const exact = phoneRoutes.find((route) => sourcePath && String(route.path || '').toLowerCase() === sourcePath)
    if (exact) return { route: exact, match: 'path' }

    const sourceProvider = canonicalProvider(model.provider)
    const sourceProviders = new Set((model.sourceProviders || []).map(canonicalProvider).filter(Boolean))
    const providerMatch = phoneRoutes.find((route) => {
        const target = canonicalProvider(route.provider)
        return target && (target === sourceProvider || sourceProviders.has(target))
    })
    return providerMatch ? { route: providerMatch, match: 'provider' } : null
}

function deviceRouterBase(deviceRouter, routePathValue) {
    return joinRouterPath(deviceRouter, routePathValue)
}

function projectionModel(model) {
    const result = { id: model.id }
    for (const field of MODEL_FIELDS) {
        if (model.metadata?.[field] === undefined) continue
        if (field === 'cost' && model.metadata.cost && typeof model.metadata.cost === 'object') {
            const requiredCostFields = ['input', 'output', 'cacheRead', 'cacheWrite']
            const hasCompleteCost = requiredCostFields.every(
                (key) => typeof model.metadata.cost[key] === 'number' && Number.isFinite(model.metadata.cost[key])
            )
            if (hasCompleteCost) {
                result.cost = Object.fromEntries(requiredCostFields.map((key) => [key, model.metadata.cost[key]]))
            }
            continue
        }
        result[field] = model.metadata[field]
    }
    if (!result.name) result.name = model.id
    return result
}

function buildPhoneProjection(models, phoneRoutes, deviceRouter) {
    const providers = new Map()
    const dispatch = new Map()

    for (const model of models) {
        const match = findPhoneRoute(model, phoneRoutes)
        const live = match?.route
        const dispatchable = Boolean(live && live.status === 'catalog_visible' && live.modelIds.includes(model.id))
        model.phoneDispatch = dispatchable
            ? {
                  provider: live.provider,
                  route: live.route,
                  baseUrl: deviceRouterBase(deviceRouter, live.path),
                  match: match.match,
                  catalogVisible: true
              }
            : null
        if (!dispatchable) continue

        if (!providers.has(live.route)) {
            providers.set(live.route, {
                provider: live.provider,
                api: live.api || 'openai-completions',
                baseUrl: deviceRouterBase(deviceRouter, live.path),
                apiKey: 'router',
                models: new Map()
            })
        }
        providers.get(live.route).models.set(model.id, projectionModel(model))
        dispatch.set(`${live.route}\u0000${model.id}`, model)
    }

    return {
        providers: Object.fromEntries(
            [...providers.values()]
                .sort((a, b) => a.provider.localeCompare(b.provider))
                .map((provider) => [
                    provider.provider,
                    {
                        api: provider.api,
                        baseUrl: provider.baseUrl,
                        apiKey: provider.apiKey,
                        models: [...provider.models.values()].sort((a, b) => a.id.localeCompare(b.id))
                    }
                ])
        ),
        summary: {
            providerCount: providers.size,
            modelCount: dispatch.size
        }
    }
}

function buildRoutes(models, laptopLive, phoneLive) {
    const routeMap = new Map()
    for (const model of models) {
        if (!routeMap.has(model.route)) {
            routeMap.set(model.route, {
                route: model.route,
                provider: model.provider,
                baseUrl: model.baseUrl,
                path: model.path,
                network: model.network,
                configuredModelCount: 0,
                uniqueModelCount: 0,
                sourceIds: new Set()
            })
        }
        const route = routeMap.get(model.route)
        if (model.configured) route.configuredModelCount += 1
        route.uniqueModelCount += 1
        for (const sourceId of model.sources) route.sourceIds.add(sourceId)
    }

    for (const route of [...(laptopLive?.routes || []), ...(phoneLive?.routes || [])]) {
        if (!routeMap.has(route.route)) {
            routeMap.set(route.route, {
                route: route.route,
                provider: route.provider,
                baseUrl: route.baseUrl,
                path: route.path,
                network: route.network,
                configuredModelCount: 0,
                uniqueModelCount: 0,
                sourceIds: new Set()
            })
        }
    }

    const laptopByRoute = new Map((laptopLive?.routes || []).map((route) => [route.route, route]))
    const phoneByRoute = new Map((phoneLive?.routes || []).map((route) => [route.route, route]))
    return [...routeMap.values()]
        .map((route) => ({
            ...route,
            sourceIds: [...route.sourceIds].sort(),
            laptopLive: laptopByRoute.get(route.route) || null,
            phoneLive: phoneByRoute.get(route.route) || null
        }))
        .sort((a, b) => a.route.localeCompare(b.route))
}

export function buildCatalogueFromInputs({ sources, laptopLive = null, phoneLive = null, phoneDeviceRouter = DEFAULT_PHONE_DEVICE_ROUTER }) {
    const modelMap = new Map()
    for (const source of sources || []) {
        for (const record of source.records || []) addModel(modelMap, record)
    }
    addLiveRecords(modelMap, laptopLive, 'laptop-router-catalog')
    addLiveRecords(modelMap, phoneLive, 'phone-router-catalog')

    const models = [...modelMap.values()].sort((a, b) => `${a.route}:${a.id}`.localeCompare(`${b.route}:${b.id}`))
    const phoneRoutes = phoneLive?.routes || []
    const phoneProjectionBundle = buildPhoneProjection(models, phoneRoutes, phoneDeviceRouter)
    const phoneProjection = { providers: phoneProjectionBundle.providers }
    const phoneProjectionSummary = phoneProjectionBundle.summary
    const routes = buildRoutes(models, laptopLive, phoneLive)
    const phoneDispatchable = models.filter((model) => model.phoneDispatch).length
    const laptopConfigured = models.filter((model) => model.configured).length
    const laptopLiveVisible = models.filter((model) => model.laptopCatalogVisible).length

    const manifest = {
        schemaVersion: 2,
        generatedAt: new Date().toISOString(),
        policy: {
            secretFree: true,
            sourceRecordsAreUnioned: true,
            failedRoutesRemainVisible: true,
            phoneDispatchRequiresLivePhoneCatalog: true,
            phoneProjectionUsesRouterCredentialSentinel: true,
            rawCredentialsCopied: false
        },
        sources: (sources || []).map(({ records, ...descriptor }) => descriptor),
        live: {
            laptop: laptopLive,
            phone: phoneLive,
            phoneDeviceRouter: safeBaseUrl(phoneDeviceRouter)
        },
        summary: {
            sourceCount: (sources || []).length,
            sourceRecordCount: (sources || []).reduce((total, source) => total + (source.records?.length || 0), 0),
            uniqueRouteModelCount: models.length,
            uniqueModelIdCount: new Set(models.map((model) => model.id)).size,
            routeCount: routes.length,
            configuredModelCount: laptopConfigured,
            laptopCatalogModelCount: laptopLiveVisible,
            phoneDispatchableModelCount: phoneDispatchable,
            phoneUnavailableModelCount: models.length - phoneDispatchable,
            phoneProjectionProviderCount: phoneProjectionSummary.providerCount,
            phoneProjectionModelCount: phoneProjectionSummary.modelCount
        },
        routes,
        models,
        phoneProjectionSummary,
        phoneProjection
    }

    assertSecretFree(manifest)
    return manifest
}

export async function buildCanonicalCatalogue({
    sourceSpecs = defaultSourceSpecs(),
    laptopRouter = DEFAULT_LAPTOP_ROUTER,
    phoneProbeRouter = DEFAULT_PHONE_PROBE_ROUTER,
    phoneDeviceRouter = DEFAULT_PHONE_DEVICE_ROUTER
} = {}) {
    const sources = loadSources(sourceSpecs)
    const [laptopLive, phoneLive] = await Promise.all([
        fetchLiveRouter(laptopRouter, 'laptop'),
        fetchLiveRouter(phoneProbeRouter, 'phone')
    ])
    return buildCatalogueFromInputs({ sources, laptopLive, phoneLive, phoneDeviceRouter })
}

export function assertSecretFree(value, location = '$') {
    if (value === null || value === undefined) return true
    if (typeof value === 'string') {
        if (SECRET_PATTERN.test(value)) throw new Error(`Secret-like value found at ${location}`)
        return true
    }
    if (Array.isArray(value)) {
        value.forEach((item, index) => assertSecretFree(item, `${location}[${index}]`))
        return true
    }
    if (typeof value === 'object') {
        for (const [key, nested] of Object.entries(value)) {
            if (/^(?:apiKey|env|options|headers|authorization|password|secret|token)$/i.test(key) && nested !== 'router') {
                throw new Error(`Credential-bearing field found at ${location}.${key}`)
            }
            assertSecretFree(nested, `${location}.${key}`)
        }
    }
    return true
}

async function main() {
    const output = path.resolve(argValue('output', DEFAULT_OUTPUT))
    const projectionOutput = path.resolve(argValue('projection-output', DEFAULT_PROJECTION_OUTPUT))
    const manifest = await buildCanonicalCatalogue({
        sourceSpecs: defaultSourceSpecs(os.homedir()),
        laptopRouter: argValue('laptop-router', DEFAULT_LAPTOP_ROUTER),
        phoneProbeRouter: argValue('phone-probe-router', DEFAULT_PHONE_PROBE_ROUTER),
        phoneDeviceRouter: argValue('phone-device-router', DEFAULT_PHONE_DEVICE_ROUTER)
    })

    ensureParent(output)
    fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    if (hasFlag('write-projection')) {
        ensureParent(projectionOutput)
        fs.writeFileSync(projectionOutput, `${JSON.stringify(manifest.phoneProjection, null, 2)}\n`, 'utf8')
    }

    console.log(
        JSON.stringify(
            {
                output,
                projectionOutput: hasFlag('write-projection') ? projectionOutput : null,
                summary: manifest.summary,
                sourceErrors: manifest.sources.filter((source) => source.parseError).map((source) => ({ id: source.id, error: source.parseError }))
            },
            null,
            2
        )
    )
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null
if (invokedPath === import.meta.url) main().catch((error) => {
    console.error(error?.stack || error)
    process.exitCode = 1
})
