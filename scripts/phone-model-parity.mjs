#!/usr/bin/env node

/**
 * Build a secret-free laptop/phone model parity manifest.
 *
 * The manifest deliberately separates configured models from live catalogs. A
 * provider's /models response is useful discovery evidence, but it is not a
 * promise that a chat request or Pi tool loop will work.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const DEFAULT_LAPTOP_CONFIG = path.join(os.homedir(), '.pi', 'agent', 'models.json')
const DEFAULT_LAPTOP_ROUTER = 'http://127.0.0.1:8788'
const DEFAULT_PHONE_ROUTER = 'http://127.0.0.1:8789'
const DEFAULT_OUTPUT = path.join('tmp', 'phone-model-parity', 'latest.json')
const REQUEST_TIMEOUT_MS = 12000

const MODEL_FIELDS = [
    'id',
    'name',
    'reasoning',
    'contextWindow',
    'maxTokens',
    'input',
    'thinkingLevelMap',
    'reasoningEffort',
    'supportsReasoning',
    'supportsVision',
    'supportsTools'
]

function argValue(name, fallback = null) {
    const prefix = `--${name}=`
    const value = process.argv.find((arg) => arg.startsWith(prefix))
    return value ? value.slice(prefix.length) : fallback
}

function hasFlag(name) {
    return process.argv.includes(`--${name}`)
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function ensureParent(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function localOrExternal(baseUrl) {
    try {
        const url = new URL(baseUrl)
        return ['127.0.0.1', 'localhost', '::1'].includes(url.hostname) ? 'local' : 'external'
    } catch {
        return 'invalid'
    }
}

function safeBaseUrl(baseUrl) {
    try {
        const url = new URL(baseUrl)
        url.username = ''
        url.password = ''
        url.search = ''
        url.hash = ''
        return url.toString().replace(/\/$/, '')
    } catch {
        return '<invalid-url>'
    }
}

function routePath(baseUrl) {
    try {
        const url = new URL(baseUrl)
        return url.pathname.replace(/\/+$/, '') || '/'
    } catch {
        return '<invalid-path>'
    }
}

function routeCatalogUrl(routerBase, baseUrl) {
    const configuredPath = routePath(baseUrl)
    const router = new URL(routerBase)
    router.pathname = `${router.pathname.replace(/\/+$/, '')}${configuredPath}/models`.replace(/\/\//g, '/')
    router.search = ''
    router.hash = ''
    return router.toString()
}

function safeModel(model) {
    const result = {}
    for (const field of MODEL_FIELDS) {
        if (model?.[field] !== undefined) result[field] = model[field]
    }
    if (typeof result.id !== 'string' || !result.id) return null
    return result
}

function configuredProviders(config) {
    return Object.entries(config?.providers || {})
        .map(([provider, value]) => {
            const models = Array.isArray(value?.models) ? value.models.map(safeModel).filter(Boolean) : []
            return {
                provider,
                api: value?.api || null,
                baseUrl: safeBaseUrl(value?.baseUrl || ''),
                route: routePath(value?.baseUrl || ''),
                network: localOrExternal(value?.baseUrl || ''),
                models
            }
        })
        .filter((provider) => provider.route !== '<invalid-path>')
}

function modelIds(payload) {
    const data = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : []
    return [...new Set(data.map((item) => (typeof item === 'string' ? item : item?.id || item?.name || item?.model)).filter(Boolean))]
}

async function fetchRouterRoutes(routerBase) {
    if (localOrExternal(routerBase) !== 'local') return []
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
        const url = `${routerBase.replace(/\/$/, '')}/catalog`
        const response = await fetch(url, {
            headers: { accept: 'application/json' },
            signal: controller.signal
        })
        if (!response.ok) return []
        const payload = await response.json()
        return (Array.isArray(payload?.routes) ? payload.routes : [])
            .map((route) => {
                const baseUrl = route.baseUrl || `${routerBase.replace(/\/$/, '')}${route.routePrefix || ''}`
                return {
                    provider: route.providerId || route.providerKey || route.routePrefix || 'unknown',
                    api: route.api || 'openai-completions',
                    baseUrl: safeBaseUrl(baseUrl),
                    route: routePath(baseUrl),
                    network: 'local',
                    models: []
                }
            })
            .filter((route) => route.route !== '<invalid-path>')
    } catch {
        return []
    } finally {
        clearTimeout(timer)
    }
}

function mergeRouteProviders(discovered, configured) {
    const byRoute = new Map()
    for (const provider of discovered) {
        if (!byRoute.has(provider.route)) byRoute.set(provider.route, { ...provider, catalogProvider: provider.provider, models: [] })
    }
    for (const provider of configured) {
        const current = byRoute.get(provider.route)
        if (!current) {
            byRoute.set(provider.route, { ...provider, models: [...provider.models] })
            continue
        }
        current.catalogProvider ||= current.provider
        current.provider = provider.provider
        current.api = provider.api || current.api
        current.baseUrl = provider.baseUrl
        current.network = provider.network
        const models = new Map(current.models.map((model) => [model.id, model]))
        for (const model of provider.models) models.set(model.id, model)
        current.models = [...models.values()]
    }
    return [...byRoute.values()].sort((a, b) => a.route.localeCompare(b.route))
}

async function fetchCatalog(routerBase, provider) {
    if (provider.network !== 'local') {
        return {
            provider: provider.provider,
            route: provider.route,
            baseUrl: provider.baseUrl,
            status: 'skipped_external',
            statusCode: null,
            modelCount: 0,
            modelIds: [],
            error: 'External provider was not queried; parity probes are local-only.'
        }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    const url = routeCatalogUrl(routerBase, provider.baseUrl)
    try {
        const response = await fetch(url, {
            headers: { accept: 'application/json' },
            signal: controller.signal
        })
        const text = await response.text()
        let payload = null
        try {
            payload = text ? JSON.parse(text) : null
        } catch {
            payload = null
        }
        const ids = modelIds(payload)
        return {
            provider: provider.provider,
            route: provider.route,
            baseUrl: provider.baseUrl,
            status: response.ok ? 'catalog_visible' : 'catalog_error',
            statusCode: response.status,
            modelCount: ids.length,
            modelIds: ids,
            error: response.ok ? null : String(payload?.error?.message || text).slice(0, 240)
        }
    } catch (error) {
        return {
            provider: provider.provider,
            route: provider.route,
            baseUrl: provider.baseUrl,
            status: error?.name === 'AbortError' ? 'timeout' : 'transport_error',
            statusCode: null,
            modelCount: 0,
            modelIds: [],
            error: String(error?.message || error).slice(0, 240)
        }
    } finally {
        clearTimeout(timer)
    }
}

function providerByRoute(providers) {
    const map = new Map()
    for (const provider of providers) {
        if (!map.has(provider.route)) map.set(provider.route, provider)
    }
    return map
}

function catalogByRoute(catalogs) {
    const map = new Map()
    for (const catalog of catalogs) {
        if (!map.has(catalog.route)) map.set(catalog.route, catalog)
    }
    return map
}

function sortedUnique(values) {
    return [...new Set(values)].sort((a, b) => a.localeCompare(b))
}

function buildRouteParity(laptopProviders, phoneProviders, laptopCatalogs, phoneCatalogs) {
    const laptopCatalogByRoute = catalogByRoute(laptopCatalogs)
    const phoneCatalogByRoute = catalogByRoute(phoneCatalogs)
    const routes = sortedUnique([...laptopCatalogByRoute.keys(), ...phoneCatalogByRoute.keys()])
    const exactRouteParity = []
    const modelGaps = []

    for (const route of routes) {
        const laptop = laptopCatalogByRoute.get(route)
        const phone = phoneCatalogByRoute.get(route)
        const laptopIds = new Set(laptop?.modelIds || [])
        const phoneIds = new Set(phone?.modelIds || [])
        const intersection = sortedUnique([...laptopIds].filter((id) => phoneIds.has(id)))
        exactRouteParity.push({
            route,
            laptopStatus: laptop?.status || 'route_missing',
            phoneStatus: phone?.status || 'route_missing',
            laptopModelCount: laptop?.modelCount || 0,
            phoneModelCount: phone?.modelCount || 0,
            exactModelIntersectionCount: intersection.length
        })
        modelGaps.push({
            route,
            laptopOnly: sortedUnique([...laptopIds].filter((id) => !phoneIds.has(id))),
            phoneOnly: sortedUnique([...phoneIds].filter((id) => !laptopIds.has(id)))
        })
    }

    const configuredLaptop = laptopProviders.flatMap((provider) =>
        provider.models.map((model) => ({ route: provider.route, provider: provider.provider, model }))
    )
    const configuredPhone = phoneProviders.flatMap((provider) =>
        provider.models.map((model) => ({ route: provider.route, provider: provider.provider, model }))
    )
    const phoneCatalogSets = new Map(phoneCatalogs.map((catalog) => [catalog.route, new Set(catalog.modelIds)]))
    const phoneConfiguredKeys = new Set(configuredPhone.map((item) => `${item.route}\0${item.model.id}`))
    const laptopConfiguredKeys = new Set(configuredLaptop.map((item) => `${item.route}\0${item.model.id}`))

    return {
        exactRouteParity,
        modelGaps,
        configuredLaptopCount: configuredLaptop.length,
        configuredPhoneCount: configuredPhone.length,
        configuredLaptopMissingOnPhoneCatalog: configuredLaptop.filter(
            (item) => !phoneCatalogSets.get(item.route)?.has(item.model.id)
        ),
        configuredPhoneMissingOnLaptopCatalog: configuredPhone.filter(
            (item) => !new Set(laptopCatalogByRoute.get(item.route)?.modelIds || []).has(item.model.id)
        ),
        configuredExactIntersection: sortedUnique([...laptopConfiguredKeys].filter((key) => phoneConfiguredKeys.has(key)))
    }
}

function buildProjection(laptopProviders, phoneProviders, phoneCatalogs, phoneBaseUrl) {
    const phoneCatalogByRoute = catalogByRoute(phoneCatalogs)
    const targetByRoute = providerByRoute(phoneProviders)
    const projection = new Map()

    for (const provider of phoneProviders) {
        projection.set(provider.provider, {
            provider: provider.provider,
            api: provider.api || 'openai-completions',
            baseUrl: provider.baseUrl,
            apiKey: 'router',
            models: provider.models.map((model) => ({ ...model }))
        })
    }

    for (const source of laptopProviders) {
        const catalog = phoneCatalogByRoute.get(source.route)
        if (!catalog || catalog.status !== 'catalog_visible') continue
        const target = targetByRoute.get(source.route)
        const providerName = target?.provider || `phone-${source.route.replace(/[^a-z0-9]+/gi, '-')}`
        if (!projection.has(providerName)) {
            projection.set(providerName, {
                provider: providerName,
                api: 'openai-completions',
                baseUrl: `${phoneBaseUrl.replace(/\/$/, '')}${source.route}/v1`,
                apiKey: 'router',
                models: []
            })
        }
        const targetProjection = projection.get(providerName)
        const existingIds = new Set(targetProjection.models.map((model) => model.id))
        for (const model of source.models) {
            if (!catalog.modelIds.includes(model.id) || existingIds.has(model.id)) continue
            targetProjection.models.push({ ...model })
            existingIds.add(model.id)
        }
    }

    return {
        providers: Object.fromEntries(
            [...projection.values()]
                .filter((provider) => provider.models.length > 0)
                .sort((a, b) => a.provider.localeCompare(b.provider))
                .map((provider) => {
                    const { provider: name, ...config } = provider
                    return [name, config]
                })
        )
    }
}

export async function buildParityManifest({
    laptopConfigPath = DEFAULT_LAPTOP_CONFIG,
    phoneConfigPath = null,
    laptopRouter = DEFAULT_LAPTOP_ROUTER,
    phoneRouter = null,
    phoneBaseUrl = DEFAULT_PHONE_ROUTER
} = {}) {
    const laptopConfig = readJson(laptopConfigPath)
    const phoneConfig = phoneConfigPath && fs.existsSync(phoneConfigPath) ? readJson(phoneConfigPath) : { providers: {} }
    const laptopConfiguredProviders = configuredProviders(laptopConfig)
    const phoneConfiguredProviders = configuredProviders(phoneConfig)
    const [laptopDiscoveredRoutes, phoneDiscoveredRoutes] = await Promise.all([
        fetchRouterRoutes(laptopRouter),
        phoneRouter ? fetchRouterRoutes(phoneRouter) : Promise.resolve([])
    ])
    const laptopProviders = mergeRouteProviders(laptopDiscoveredRoutes, laptopConfiguredProviders)
    const phoneProviders = mergeRouteProviders(phoneDiscoveredRoutes, phoneConfiguredProviders)
    const laptopCatalogs = await Promise.all(laptopProviders.map((provider) => fetchCatalog(laptopRouter, provider)))
    const phoneCatalogs = phoneRouter
        ? await Promise.all(phoneProviders.map((provider) => fetchCatalog(phoneRouter, provider)))
        : []
    const parity = buildRouteParity(laptopProviders, phoneProviders, laptopCatalogs, phoneCatalogs)
    const projection = buildProjection(laptopProviders, phoneProviders, phoneCatalogs, phoneBaseUrl)

    return {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        policy: {
            secretFree: true,
            localCatalogsOnly: true,
            catalogVisibilityIsNotRouteProof: true,
            projectionCopiesConfiguredModelsOnly: true,
            projectionNeverCopiesCredentials: true
        },
        sources: {
            laptopConfig: path.resolve(laptopConfigPath),
            phoneConfig: phoneConfigPath ? path.resolve(phoneConfigPath) : null,
            laptopRouter: safeBaseUrl(laptopRouter),
            phoneRouter: phoneRouter ? safeBaseUrl(phoneRouter) : null,
            phoneBaseUrl: safeBaseUrl(phoneBaseUrl)
        },
        configured: {
            laptop: laptopProviders,
            phone: phoneProviders
        },
        catalogs: {
            laptop: laptopCatalogs,
            phone: phoneCatalogs
        },
        parity,
        phoneProjection: projection
    }
}

async function main() {
    const outputPath = path.resolve(argValue('output', DEFAULT_OUTPUT))
    const manifest = await buildParityManifest({
        laptopConfigPath: path.resolve(argValue('laptop-config', DEFAULT_LAPTOP_CONFIG)),
        phoneConfigPath: argValue('phone-config') ? path.resolve(argValue('phone-config')) : null,
        laptopRouter: argValue('laptop-router', DEFAULT_LAPTOP_ROUTER),
        phoneRouter: argValue('phone-router', null),
        phoneBaseUrl: argValue('phone-base-url', DEFAULT_PHONE_ROUTER)
    })
    ensureParent(outputPath)
    fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

    if (hasFlag('write-projection')) {
        const projectionPath = path.resolve(argValue('projection-output', path.join(path.dirname(outputPath), 'phone-models.projection.json')))
        ensureParent(projectionPath)
        fs.writeFileSync(projectionPath, `${JSON.stringify(manifest.phoneProjection, null, 2)}\n`, 'utf8')
    }

    console.log(
        JSON.stringify(
            {
                output: outputPath,
                laptopRoutes: manifest.catalogs.laptop.length,
                phoneRoutes: manifest.catalogs.phone.length,
                configuredExactIntersection: manifest.parity.configuredExactIntersection.length,
                laptopConfiguredMissingOnPhoneCatalog: manifest.parity.configuredLaptopMissingOnPhoneCatalog.length,
                phoneConfiguredMissingOnLaptopCatalog: manifest.parity.configuredPhoneMissingOnLaptopCatalog.length,
                projectionProviders: Object.keys(manifest.phoneProjection.providers).length,
                projectionModels: Object.values(manifest.phoneProjection.providers).reduce(
                    (total, provider) => total + provider.models.length,
                    0
                )
            },
            null,
            2
        )
    )
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null
if (invokedPath === import.meta.url) {
    main().catch((error) => {
        console.error(error?.stack || error)
        process.exitCode = 1
    })
}
