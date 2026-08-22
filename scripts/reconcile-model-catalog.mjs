#!/usr/bin/env node

/**
 * Reconcile the runtime model-catalogue surfaces that feed the Pi picker.
 *
 * This is intentionally a read-only audit. It compares:
 *   1. the parent-router route/model cache,
 *   2. the generated Pi catalogue manifest, and
 *   3. optional picker registries.
 *
 * Catalogue presence is discovery evidence, not chat or tool health proof.
 * The report keeps those concepts separate so a stale or failed layer cannot
 * silently look healthy to the next consumer.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_ROUTER_BASE = 'http://127.0.0.1:8788'
const DEFAULT_MAX_AGE_MS = 10 * 60 * 1000
const MAX_ISSUES = 500

function argValue(argv, name, fallback = null) {
    const prefix = '--' + name + '='
    const value = argv.find((arg) => arg.startsWith(prefix))
    return value ? value.slice(prefix.length) : fallback
}

function hasFlag(argv, name) {
    return argv.includes('--' + name)
}

function parseNumber(value, fallback) {
    const number = Number(value)
    return Number.isFinite(number) && number >= 0 ? number : fallback
}

export function parseArgs(argv = process.argv.slice(2)) {
    return {
        manifest: argValue(argv, 'manifest', path.join(os.homedir(), '.pi', 'agent', 'model-catalog-manifest.json')),
        cache: argValue(argv, 'cache', path.join(os.homedir(), '.pi', 'agent', '.cache', 'router-catalog-cache.json')),
        pickerModels: argValue(argv, 'picker-models', path.join(os.homedir(), '.pi', 'agent', 'models.json')),
        pickerProviders: argValue(argv, 'picker-providers', path.join(os.homedir(), '.pi', 'agent', 'model-providers.json')),
        router: argValue(argv, 'router', DEFAULT_ROUTER_BASE),
        maxAgeMs: parseNumber(argValue(argv, 'max-age-ms', String(DEFAULT_MAX_AGE_MS)), DEFAULT_MAX_AGE_MS),
        now: argValue(argv, 'now', null),
        output: argValue(argv, 'output', null),
        format: argValue(argv, 'format', hasFlag(argv, 'json') ? 'json' : 'markdown'),
        strict: hasFlag(argv, 'strict'),
        help: hasFlag(argv, 'help') || hasFlag(argv, 'h')
    }
}

export function normalizeModelId(value) {
    return String(value ?? '').trim().toLowerCase()
}

export function normalizeRoutePath(value) {
    if (value === null || value === undefined || value === '') return null
    let raw = String(value).trim()
    try {
        if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = new URL(raw).pathname
    } catch {
        return null
    }
    raw = raw.split('?')[0].split('#')[0].replace(/\/+$/, '')
    raw = raw.replace(/\/models$/i, '')
    if (!raw) return '/'
    return (raw.startsWith('/') ? raw : '/' + raw).toLowerCase()
}

function routePathFrom(value) {
    if (!value || typeof value !== 'object') return null
    return normalizeRoutePath(value.baseUrl || value.base_url || value.routePrefix || value.path || value.prefix)
}

function timestamp(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value < 100000000000 ? value * 1000 : value
    }
    if (typeof value === 'string' && value.trim()) {
        const parsed = Date.parse(value)
        return Number.isFinite(parsed) ? parsed : null
    }
    return null
}

export function freshness(value, now = Date.now(), maxAgeMs = DEFAULT_MAX_AGE_MS) {
    const at = timestamp(value)
    if (at === null) return { state: 'unknown', ageMs: null, at: null }
    const ageMs = Math.max(0, now - at)
    return {
        state: ageMs <= maxAgeMs ? 'fresh' : 'stale',
        ageMs,
        at: new Date(at).toISOString()
    }
}

function modelId(value) {
    if (typeof value === 'string') return value.trim()
    if (!value || typeof value !== 'object') return ''
    return String(value.id || value.model || value.modelId || value.name || '').trim()
}

export function extractModelIds(payload) {
    const values = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.models)
            ? payload.models
            : []
    return [...new Set(values.map(modelId).filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

function asModelRecords(value) {
    if (Array.isArray(value)) {
        return value.map((item) => (typeof item === 'string' ? { id: item } : item)).filter(Boolean)
    }
    if (value && typeof value === 'object') {
        return Object.entries(value).map(([id, item]) => ({
            ...(item && typeof item === 'object' ? item : {}),
            id: item && typeof item === 'object' && item.id ? item.id : id
        }))
    }
    return []
}

function cacheEntries(cache) {
    return cache && typeof cache.entries === 'object' && cache.entries ? cache.entries : {}
}

function findRootCacheEntry(entries) {
    return Object.entries(entries).find(([url, entry]) => normalizeRoutePath(url) === '/catalog' && entry && typeof entry === 'object') || null
}

function urlPath(value) {
    try {
        return new URL(value).pathname
    } catch {
        return ''
    }
}

function cacheRouteEntries(entries) {
    return Object.entries(entries)
        .filter(([url]) => normalizeRoutePath(url) && normalizeRoutePath(url) !== '/catalog' && /\/models$/i.test(urlPath(url)))
        .map(([url, entry]) => {
            const body = entry?.body
            const ids = extractModelIds(body)
            const at = entry?.fetchedAt ?? entry?.fetched_at ?? entry?.timestamp ?? entry?.updatedAt
            return {
                url,
                routePath: normalizeRoutePath(url),
                modelIds: ids,
                modelKeys: new Set(ids.map(normalizeModelId)),
                fetchedAt: timestamp(at),
                bodyValid: Boolean(body && typeof body === 'object'),
                hasError: Boolean(body && typeof body === 'object' && (body.error || body.ok === false))
            }
        })
}

function manifestRecords(manifest) {
    const records = []
    for (const provider of Array.isArray(manifest?.providers) ? manifest.providers : []) {
        const routePath = routePathFrom(provider)
        const models = asModelRecords(provider.models)
        for (const model of models) {
            const id = modelId(model)
            if (!id || model.status === 'retired') continue
            records.push({
                provider: String(provider.provider || 'unknown'),
                routePath,
                id,
                key: normalizeModelId(id),
                status: model.status || provider.catalog_status || 'unknown',
                checkedAt: model.last_checked_at || model.last_seen_at || provider.checked_at || null
            })
        }
    }
    return records
}

function pickerRecords(source) {
    const payload = source?.payload
    const providerMap = payload?.providers || payload?.modelProviders || {}
    const records = []

    for (const [providerKey, rawConfig] of Object.entries(providerMap)) {
        const config = Array.isArray(rawConfig) ? {} : (rawConfig && typeof rawConfig === 'object' ? rawConfig : {})
        const modelsValue = Array.isArray(rawConfig) ? rawConfig : (rawConfig?.models ?? rawConfig)
        for (const model of asModelRecords(modelsValue)) {
            const id = modelId(model)
            if (!id) continue
            const baseUrl = model.baseUrl || model.base_url || config.baseUrl || config.base_url || config.options?.baseURL || config.options?.baseUrl
            records.push({
                source: source.id,
                provider: String(model.provider || providerKey),
                routePath: normalizeRoutePath(baseUrl),
                id,
                key: normalizeModelId(id)
            })
        }
    }

    return records
}

function createRoute(routePath) {
    return {
        routePath: routePath || '/unknown',
        provider: null,
        rootDeclared: false,
        rootStatus: null,
        cache: null,
        manifestIds: new Map(),
        pickerIds: new Map()
    }
}

function routeHealth(route) {
    const status = route.rootStatus && typeof route.rootStatus === 'object' ? route.rootStatus : {}
    if (!route.rootDeclared) {
        if (route.cache) return 'catalog_only'
        if (route.manifestIds.size || route.pickerIds.size) return 'manifest_only'
        return 'unconfigured'
    }
    if (status.routeBackoff === true) return 'backoff'
    if (Number(status.blockingCoolingRecords || 0) > 0) return 'cooling'
    if (status.keyConfigured === false || Number(status.keys || status.activeKeys || 0) === 0) return 'unconfigured'
    if (!route.cache || !route.cache.bodyValid || route.cache.hasError) return 'catalog_failed'
    if (route.cache.freshness.state === 'stale') return 'catalog_stale'
    return 'cataloged'
}

function modelKeyVariants(value, provider) {
    const key = normalizeModelId(value)
    if (!key) return []
    const variants = new Set([key])
    const providerKey = normalizeModelId(provider)
    if (providerKey && key.startsWith(providerKey + '/')) variants.add(key.slice(providerKey.length + 1))
    return [...variants]
}

function modelFailureEvidence(route, cacheModelIds) {
    const failures = Array.isArray(route.rootStatus?.recentFailures) ? route.rootStatus.recentFailures : []
    const cacheKeys = new Set(cacheModelIds.map(normalizeModelId))
    const byKey = new Map()
    const unknownScope = []

    for (const failure of failures) {
        const rawModel = failure?.model || failure?.modelId || failure?.requestedModel || null
        const evidence = {
            at: failure?.at || null,
            status: failure?.status || null,
            phase: failure?.phase || null,
            keyCooldown: Boolean(failure?.keyCooldown),
            routeBackoff: Boolean(failure?.routeBackoff)
        }
        const variants = modelKeyVariants(rawModel, route.provider)
        if (!variants.length) {
            unknownScope.push(evidence)
            continue
        }
        for (const key of variants) {
            if (!byKey.has(key)) byKey.set(key, { id: rawModel, evidence: [] })
            byKey.get(key).evidence.push(evidence)
        }
    }

    const matched = new Map()
    const matchedValues = new Set()
    for (const key of cacheKeys) {
        const value = byKey.get(key)
        if (value) {
            matched.set(key, value)
            matchedValues.add(value)
        }
    }
    const unmatched = [...new Set([...byKey.values()].filter((value) => !matchedValues.has(value)))]
    const modelHealth = cacheModelIds.map((id) => {
        const key = normalizeModelId(id)
        const failure = matched.get(key)
        return {
            id,
            state: failure ? 'recent_failure' : 'cataloged',
            recentFailureCount: failure?.evidence.length || 0,
            recentFailures: failure?.evidence || []
        }
    })
    for (const value of unmatched) {
        modelHealth.push({
            id: value.id,
            state: 'recent_failure_not_in_cache',
            recentFailureCount: value.evidence.length,
            recentFailures: value.evidence
        })
    }

    return {
        modelHealth: modelHealth.sort((a, b) => a.id.localeCompare(b.id)),
        matched,
        unmatched,
        unknownScope,
        recentFailureCount: failures.length
    }
}

function addIssue(issues, issue) {
    issues.push({
        severity: issue.severity || 'info',
        code: issue.code,
        routePath: issue.routePath || null,
        provider: issue.provider || null,
        modelId: issue.modelId || null,
        detail: issue.detail || null
    })
}

function issueRank(issue) {
    return issue.severity === 'error' ? 0 : issue.severity === 'warn' ? 1 : 2
}

export function reconcileRuntimeCatalogue({
    manifest = null,
    cache = null,
    pickerSources = [],
    now = Date.now(),
    maxAgeMs = DEFAULT_MAX_AGE_MS,
    inputPaths = {},
    inputErrors = {}
} = {}) {
    const entries = cacheEntries(cache)
    const rootEntryPair = findRootCacheEntry(entries)
    const rootEntry = rootEntryPair?.[1] || null
    const rootFreshness = freshness(rootEntry?.fetchedAt, now, maxAgeMs)
    const routes = new Map()

    const ensureRoute = (routePath) => {
        const key = routePath || '/unknown'
        if (!routes.has(key)) routes.set(key, createRoute(key))
        return routes.get(key)
    }

    for (const declaration of Array.isArray(rootEntry?.body?.routes) ? rootEntry.body.routes : []) {
        const route = ensureRoute(routePathFrom(declaration))
        route.rootDeclared = true
        route.provider ||= String(declaration.providerId || declaration.providerKey || declaration.provider || 'unknown')
        route.rootStatus = declaration.status || null
    }

    for (const entry of cacheRouteEntries(entries)) {
        const route = ensureRoute(entry.routePath)
        const candidate = {
            ...entry,
            freshness: freshness(entry.fetchedAt, now, maxAgeMs)
        }
        if (!route.cache || (candidate.fetchedAt || 0) > (route.cache.fetchedAt || 0)) route.cache = candidate
    }

    const manifestItems = manifestRecords(manifest)
    for (const item of manifestItems) {
        const route = ensureRoute(item.routePath)
        route.provider ||= item.provider
        route.manifestIds.set(item.key, item)
    }

    const pickerItems = pickerSources.flatMap(pickerRecords)
    for (const item of pickerItems) {
        const route = ensureRoute(item.routePath)
        route.provider ||= item.provider
        if (!route.pickerIds.has(item.source)) route.pickerIds.set(item.source, new Map())
        route.pickerIds.get(item.source).set(item.key, item)
    }

    const issues = []
    const manifestFreshness = freshness(manifest?.generated_at, now, maxAgeMs)
    if (!manifest && !inputErrors.manifest) addIssue(issues, { severity: 'error', code: 'manifest_missing', detail: 'Pi catalogue manifest could not be loaded.' })
    else if (manifestFreshness.state === 'stale') addIssue(issues, { severity: 'warn', code: 'manifest_stale', detail: 'Pi catalogue manifest is older than the freshness budget.' })
    if (!cache && !inputErrors.cache) addIssue(issues, { severity: 'error', code: 'cache_missing', detail: 'Shared router catalogue cache could not be loaded.' })
    else if (rootFreshness.state === 'stale') addIssue(issues, { severity: 'warn', code: 'root_cache_stale', detail: 'Shared router root catalogue entry is older than the freshness budget.' })
    if (inputErrors.manifest) addIssue(issues, { severity: 'error', code: 'manifest_' + inputErrors.manifest, detail: 'Manifest input is ' + inputErrors.manifest + '.' })
    if (inputErrors.cache) addIssue(issues, { severity: 'error', code: 'cache_' + inputErrors.cache, detail: 'Cache input is ' + inputErrors.cache + '.' })

    const routeOutput = [...routes.values()]
        .sort((a, b) => a.routePath.localeCompare(b.routePath))
        .map((route) => {
            const healthState = routeHealth({
                ...route,
                cache: route.cache
                    ? { ...route.cache, freshness: freshness(route.cache.fetchedAt, now, maxAgeMs) }
                    : null
            })
            const cacheKeys = route.cache?.modelKeys || new Set()
            const manifestKeys = new Set(route.manifestIds.keys())
            const pickerKeys = new Set([...route.pickerIds.values()].flatMap((items) => [...items.keys()]))
            const modelFailures = modelFailureEvidence(route, route.cache?.modelIds || [])
            const modelHealth = modelFailures.modelHealth.map((model) => (
                model.state === 'cataloged' && healthState !== 'cataloged'
                    ? { ...model, state: healthState }
                    : model
            ))

            if (healthState === 'catalog_failed') {
                addIssue(issues, {
                    severity: 'error',
                    code: 'route_catalog_failed',
                    routePath: route.routePath,
                    provider: route.provider,
                    detail: 'Route is declared by the router but its cached model catalogue is missing or invalid.'
                })
            } else if (healthState === 'catalog_stale') {
                addIssue(issues, {
                    severity: 'warn',
                    code: 'route_catalog_stale',
                    routePath: route.routePath,
                    provider: route.provider,
                    detail: 'Route model catalogue is outside the freshness budget.'
                })
            }
            for (const failure of new Set(modelFailures.matched.values())) {
                addIssue(issues, {
                    severity: 'warn',
                    code: 'model_recent_failure',
                    routePath: route.routePath,
                    provider: route.provider,
                    modelId: failure.id,
                    detail: 'Recent failure evidence is scoped to this model; sibling models remain independently classified.'
                })
            }
            for (const failure of modelFailures.unmatched) {
                addIssue(issues, {
                    severity: 'warn',
                    code: 'model_recent_failure_not_in_cache',
                    routePath: route.routePath,
                    provider: route.provider,
                    modelId: failure.id,
                    detail: 'Recent failure names a model that is not present in the cached route catalogue.'
                })
            }
            if (modelFailures.unknownScope.length) {
                addIssue(issues, {
                    severity: 'warn',
                    code: 'route_unknown_scope_failure',
                    routePath: route.routePath,
                    provider: route.provider,
                    detail: 'Recent route failure evidence did not identify a model; no sibling models were marked degraded.'
                })
            }

            for (const [key, item] of route.manifestIds) {
                if (!cacheKeys.has(key)) {
                    addIssue(issues, {
                        severity: healthState === 'cataloged' ? 'warn' : 'info',
                        code: 'manifest_model_missing_from_cache',
                        routePath: route.routePath,
                        provider: item.provider,
                        modelId: item.id,
                        detail: 'Manifest model is not present in the current cached route catalogue.'
                    })
                }
            }
            for (const key of cacheKeys) {
                if (!manifestKeys.has(key)) {
                    const id = route.cache.modelIds.find((value) => normalizeModelId(value) === key)
                    addIssue(issues, {
                        severity: 'info',
                        code: 'cache_model_missing_from_manifest',
                        routePath: route.routePath,
                        provider: route.provider,
                        modelId: id,
                        detail: 'Live route cache exposes a model absent from the generated Pi manifest.'
                    })
                }
            }
            for (const [source, items] of route.pickerIds) {
                for (const [key, item] of items) {
                    if (!manifestKeys.has(key)) {
                        addIssue(issues, {
                            severity: 'warn',
                            code: 'picker_model_missing_from_manifest',
                            routePath: route.routePath,
                            provider: item.provider,
                            modelId: item.id,
                            detail: source + ' picker registry contains a model absent from the generated manifest.'
                        })
                    }
                    if (!cacheKeys.has(key)) {
                        addIssue(issues, {
                            severity: healthState === 'cataloged' ? 'warn' : 'info',
                            code: 'picker_model_missing_from_cache',
                            routePath: route.routePath,
                            provider: item.provider,
                            modelId: item.id,
                            detail: source + ' picker registry contains a model absent from the current cached route catalogue.'
                        })
                    }
                }
            }

            return {
                routePath: route.routePath,
                provider: route.provider,
                rootDeclared: route.rootDeclared,
                healthState,
                routePressure: {
                    recentFailureCount: modelFailures.recentFailureCount,
                    modelSpecificFailureCount: modelFailures.matched.size,
                    unknownScopeFailureCount: modelFailures.unknownScope.length,
                    providerCoolingRecords: Number(route.rootStatus?.providerCoolingRecords || 0),
                    blockingCoolingRecords: Number(route.rootStatus?.blockingCoolingRecords || 0)
                },
                cacheFreshness: route.cache ? freshness(route.cache.fetchedAt, now, maxAgeMs) : { state: 'missing', ageMs: null, at: null },
                cacheModelCount: route.cache?.modelIds.length || 0,
                manifestModelCount: manifestKeys.size,
                pickerModelCount: pickerKeys.size,
                pickerSources: [...route.pickerIds.keys()].sort(),
                modelHealth
            }
        })

    const sortedIssues = issues
        .sort((a, b) => issueRank(a) - issueRank(b) || String(a.code).localeCompare(String(b.code)) || String(a.modelId || '').localeCompare(String(b.modelId || '')))
    const visibleIssues = sortedIssues.slice(0, MAX_ISSUES)
    const healthCounts = {}
    for (const route of routeOutput) healthCounts[route.healthState] = (healthCounts[route.healthState] || 0) + 1

    return {
        schemaVersion: 1,
        generatedAt: new Date(now).toISOString(),
        policy: {
            readOnly: true,
            cataloguePresenceIsNotChatProof: true,
            exactModelIdEvidenceIsCaseInsensitiveForAudit: true,
            secretsCopied: false
        },
        inputs: {
            ...inputPaths,
            router: inputPaths.router || DEFAULT_ROUTER_BASE,
            maxAgeMs
        },
        surfaces: {
            manifest: {
                generatedAt: manifest?.generated_at || null,
                freshness: manifestFreshness,
                providerCount: Array.isArray(manifest?.providers) ? manifest.providers.length : 0,
                modelCount: manifestItems.length
            },
            routerCache: {
                version: cache?._v ?? null,
                rootFetchedAt: rootEntry?.fetchedAt ? new Date(rootEntry.fetchedAt).toISOString() : null,
                rootFreshness,
                routeEntryCount: cacheRouteEntries(entries).length
            },
            picker: pickerSources.map((source) => ({
                id: source.id,
                path: source.path || null,
                modelCount: pickerItems.filter((item) => item.source === source.id).length,
                loaded: Boolean(source.payload)
            }))
        },
        routes: routeOutput,
        issues: visibleIssues,
        summary: {
            routeCount: routeOutput.length,
            healthCounts,
            issueCount: sortedIssues.length,
            visibleIssueCount: visibleIssues.length,
            omittedIssueCount: Math.max(0, sortedIssues.length - visibleIssues.length),
            errorCount: sortedIssues.filter((issue) => issue.severity === 'error').length,
            warningCount: sortedIssues.filter((issue) => issue.severity === 'warn').length,
            infoCount: sortedIssues.filter((issue) => issue.severity === 'info').length
        }
    }
}

function readJsonFile(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return { payload: null, error: 'missing' }
    try {
        return { payload: JSON.parse(fs.readFileSync(filePath, 'utf8')), error: null }
    } catch {
        return { payload: null, error: 'invalid-json' }
    }
}

function helpText() {
    return [
        'Read-only runtime model catalogue reconciliation.',
        '',
        'Usage:',
        '  node scripts/reconcile-model-catalog.mjs [options]',
        '',
        'Options:',
        '  --format=markdown|json   Output format; markdown is the default.',
        '  --output=PATH            Write the report instead of stdout.',
        '  --max-age-ms=NUMBER      Freshness budget; defaults to 600000.',
        '  --strict                 Exit 1 when any error is present.',
        '  --manifest=PATH          Pi model-catalog-manifest.json path.',
        '  --cache=PATH             Shared router-catalog-cache.json path.',
        '  --picker-models=PATH     Pi models.json path.',
        '  --picker-providers=PATH  Pi model-providers.json path.',
        '  --help                   Show this help.'
    ].join('\n')
}

export function formatMarkdown(report) {
    const lines = [
        '# Runtime model catalogue reconciliation',
        '',
        'Generated: ' + report.generatedAt,
        'Freshness budget: ' + report.inputs.maxAgeMs + ' ms',
        '',
        '## Summary',
        '',
        '| Metric | Value |',
        '| --- | ---: |',
        '| Routes | ' + report.summary.routeCount + ' |',
        '| Errors | ' + report.summary.errorCount + ' |',
        '| Warnings | ' + report.summary.warningCount + ' |',
        '| Informational differences | ' + report.summary.infoCount + ' |',
        '| Omitted issue rows | ' + report.summary.omittedIssueCount + ' |',
        '',
        '## Surfaces',
        '',
        '| Surface | Freshness | Models |',
        '| --- | --- | ---: |',
        '| Pi manifest | ' + report.surfaces.manifest.freshness.state + ' | ' + report.surfaces.manifest.modelCount + ' |',
        '| Router root/cache | ' + report.surfaces.routerCache.rootFreshness.state + ' | ' + report.surfaces.routerCache.routeEntryCount + ' route entries |',
        ...report.surfaces.picker.map((source) => '| Picker ' + source.id + ' | ' + (source.loaded ? 'loaded' : 'missing') + ' | ' + source.modelCount + ' |'),
        '',
        '## Routes',
        '',
        '| Route | Provider | State | Cache | Manifest | Picker |',
        '| --- | --- | --- | --- | ---: | ---: |',
        ...report.routes.map((route) => '| ' + route.routePath + ' | ' + (route.provider || 'unknown') + ' | ' + route.healthState + ' | ' + route.cacheFreshness.state + ' | ' + route.manifestModelCount + ' | ' + route.pickerModelCount + ' |'),
        '',
        '## Issues',
        '',
        '| Severity | Code | Route | Model | Detail |',
        '| --- | --- | --- | --- | --- |',
        ...report.issues.map((issue) => '| ' + issue.severity + ' | ' + issue.code + ' | ' + (issue.routePath || '') + ' | ' + (issue.modelId || '') + ' | ' + (issue.detail || '') + ' |')
    ]
    return lines.join('\n') + '\n'
}

async function main() {
    const options = parseArgs()
    if (options.help) {
        console.log(helpText())
        return
    }
    const manifest = readJsonFile(options.manifest)
    const cache = readJsonFile(options.cache)
    const pickerSources = [
        { id: 'models.json', path: options.pickerModels, ...readJsonFile(options.pickerModels) },
        { id: 'model-providers.json', path: options.pickerProviders, ...readJsonFile(options.pickerProviders) }
    ]
    const now = options.now ? timestamp(options.now) || Date.now() : Date.now()
    const report = reconcileRuntimeCatalogue({
        manifest: manifest.payload,
        cache: cache.payload,
        pickerSources,
        now,
        maxAgeMs: options.maxAgeMs,
        inputPaths: {
            manifest: options.manifest,
            cache: options.cache,
            pickerModels: options.pickerModels,
            pickerProviders: options.pickerProviders,
            router: options.router
        },
        inputErrors: {
            manifest: manifest.error,
            cache: cache.error
        }
    })
    const output = options.format === 'json' ? JSON.stringify(report, null, 2) + '\n' : formatMarkdown(report)
    if (options.output) {
        fs.mkdirSync(path.dirname(path.resolve(options.output)), { recursive: true })
        fs.writeFileSync(path.resolve(options.output), output, 'utf8')
    } else {
        process.stdout.write(output)
    }
    if (options.strict && report.summary.errorCount > 0) process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
    main().catch((error) => {
        console.error(error?.stack || error)
        process.exitCode = 1
    })
}
