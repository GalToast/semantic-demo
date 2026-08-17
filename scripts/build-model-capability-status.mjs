#!/usr/bin/env node

/**
 * Build a secret-free capability-status companion for the native Pi picker.
 *
 * Native models.json remains schema-pure. This sidecar joins the canonical
 * catalogue with an explicitly generated health matrix, preserving the
 * difference between declared capability, catalog visibility, and proof from
 * a bounded probe.
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const DEFAULT_CATALOG = path.join('tmp', 'phone-model-parity', 'canonical-model-catalog.json')
const DEFAULT_HEALTH = path.join('tmp', 'phone-model-health', 'latest.json')
const DEFAULT_OUTPUT = path.join('tmp', 'phone-model-health', 'capability-status.json')
const DEFAULT_REPORT = path.join('tmp', 'phone-model-health', 'capability-status.md')

const SENSITIVE_KEY = /^(?:api[_-]?key|authorization|cookie|credential|headers?|password|secret|token|private[_-]?key|options?|env)$/i
const SECRET_PATTERN = /(?:bearer\s+\S{12,}|sk-[a-z0-9]{16,}|rk-[a-z0-9]{16,}|pk-[a-z0-9]{16,}|AIza[a-z0-9]{20,}|gh[pousr]_[a-z0-9]{20,}|xox[baprs]-[a-z0-9-]{20,})/i

const STATUS_FIELDS = ['catalog', 'chat', 'tool', 'vision']
const LEDGER_DEPLOYABILITIES = new Set([
    'deployable',
    'ready-unverified',
    'stale',
    'cooldown',
    'degraded',
    'blocked',
    'unlaunchable',
    'unknown'
])

function argValue(name, fallback = null) {
    const prefix = `--${name}=`
    const value = process.argv.find((arg) => arg.startsWith(prefix))
    return value ? value.slice(prefix.length) : fallback
}

function hasFlag(name) {
    return process.argv.includes(`--${name}`)
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'))
}

function ensureParent(filePath) {
    fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true })
}

function routePath(value) {
    const raw = String(value || '')
    if (raw.startsWith('/')) return raw.replace(/\/+$/, '') || '/'
    try {
        return new URL(raw).pathname.replace(/\/+$/, '') || '/'
    } catch {
        return raw || '<unknown-route>'
    }
}

function modelRoutePath(model) {
    return routePath(model.path || model.baseUrl)
}

function routeModelKey(target, route, modelId) {
    return `${target}\u0000${route}\u0000${modelId}`
}

function statusFromFailure(status) {
    if (status === 'cooldown') return 'cooldown'
    if (status === 'timeout') return 'timeout'
    if (status === 'transport_error') return 'transport-error'
    if (status === 'not_visible') return 'not-visible'
    if (status === 'catalog_error' || status === 'chat_error' || status === 'tool_error' || status === 'vision_error') return 'failed'
    return 'not-tested'
}

function evidence(status, source, extra = {}) {
    return { status, source, ...extra }
}

function routeCatalogEvidence(route, model, target, observedAt) {
    if (!route) return evidence('not-tested', 'health-matrix', { reason: 'route-not-selected' })
    if (route.status !== 'catalog_visible') {
        return evidence(statusFromFailure(route.status), 'health-matrix', {
            observedAt,
            statusCode: route.statusCode ?? null,
            elapsedMs: route.elapsedMs ?? null,
            retryAfterMs: route.retryAfterMs ?? null,
            error: route.error || null
        })
    }

    if (Array.isArray(route.modelIds)) {
        return evidence(route.modelIds.includes(model.id) ? 'catalog-visible' : 'not-visible', 'health-matrix', {
            observedAt,
            routeModelCount: route.modelIds.length
        })
    }

    // Older matrices did not preserve all IDs. These exact catalogue fields
    // are safe fallbacks, but remain explicitly marked as catalogue evidence.
    const exactFallback = target === 'laptop'
        ? model.laptopCatalogVisible === true
        : target === 'phone' && model.phoneDispatch?.catalogVisible === true
    return evidence(exactFallback ? 'catalog-visible' : 'not-tested', exactFallback ? 'canonical-catalog' : 'health-matrix', {
        observedAt,
        reason: exactFallback ? 'exact-catalogue-flag' : 'health-matrix-model-ids-missing'
    })
}

function smokeResult(route, modelId) {
    return (route?.smoke || []).find((result) => result.model === modelId) || null
}

function smokeEvidence(route, modelId, field, provenStatus, failurePrefix, observedAt) {
    const result = smokeResult(route, modelId)
    if (!result) return evidence('not-tested', 'health-matrix', { reason: 'explicit-smoke-not-run' })
    if (field === 'chat' && result.status === 'chat_ok') {
        return evidence(provenStatus, 'chat-smoke', {
            observedAt,
            statusCode: result.statusCode ?? null,
            elapsedMs: result.elapsedMs ?? null,
            reasoningSeen: result.reasoningSeen === true
        })
    }
    if (field === 'tool' && (result.toolProven === true || result.toolEvidence === true)) {
        return evidence(provenStatus, 'tool-smoke', {
            observedAt,
            statusCode: result.statusCode ?? null,
            elapsedMs: result.elapsedMs ?? null
        })
    }
    if (field === 'vision' && (result.visionProven === true || result.visionEvidence === true)) {
        return evidence(provenStatus, 'vision-smoke', {
            observedAt,
            statusCode: result.statusCode ?? null,
            elapsedMs: result.elapsedMs ?? null
        })
    }

    const explicitStatus = result[`${field}Status`] || (field === 'chat' ? result.status : null)
    return evidence(statusFromFailure(explicitStatus), `${failurePrefix}-smoke`, {
        observedAt,
        statusCode: result.statusCode ?? null,
        elapsedMs: result.elapsedMs ?? null,
        error: result.error || null
    })
}

function normalizeExternalEvidence(payload) {
    const entries = Array.isArray(payload?.entries)
        ? payload.entries
        : Array.isArray(payload?.models)
            ? payload.models
            : []
    const map = new Map()
    for (const entry of entries) {
        const target = String(entry.target || entry.router || entry.scope || 'laptop')
        const provider = String(entry.provider || entry.routeProvider || '')
        const route = routePath(entry.route || entry.path || '')
        const modelId = String(entry.modelId || entry.model || entry.id || '')
        if (!modelId) continue
        map.set(routeModelKey(target, route, modelId), { ...entry, target, provider, route, modelId })
    }
    return map
}

// Accept an optional schemaVersion-1 evidence ledger (the output shape of
// model-health-ledger.mjs). Only schemaVersion 1 is indexed; any other shape is
// treated as no ledger so a mismatched payload can never silently promote proof.
function normalizeLedger(ledger) {
    if (!ledger || typeof ledger !== 'object') return null
    if (ledger.schemaVersion !== 1) return null
    const map = new Map()
    const entries = ledger.entries && typeof ledger.entries === 'object' ? ledger.entries : {}
    for (const entry of Object.values(entries)) {
        if (!entry || typeof entry !== 'object') continue
        const target = String(entry.target || '')
        const route = routePath(entry.route || '')
        const modelId = String(entry.modelId || '')
        const rawDeployability = typeof entry.deployability === 'string' ? entry.deployability : null
        const deployability = LEDGER_DEPLOYABILITIES.has(rawDeployability) ? rawDeployability : 'unknown'
        if (!target || !route || !modelId || !deployability) continue
        const reason = LEDGER_DEPLOYABILITIES.has(rawDeployability)
            ? (typeof entry.deployabilityReason === 'string' ? entry.deployabilityReason : null)
            : 'ledger-deployability-invalid'
        map.set(routeModelKey(target, route, modelId), { deployability, deployabilityReason: reason })
    }
    return map
}

// Project a ledger deployability verdict onto a target. The sidecar never
// promotes evidence: it passes the ledger verdict through verbatim and treats
// any unmatched target as conservatively unknown. Only schemaVersion-1 ledger
// values reach this point, where 'deployable' is the single positive verdict and
// every other value (missing, stale, cooldown, blocked, ready-unverified, ...) is
// already non-deployable by construction.
function ledgerDeployability(ledgerMap, target, route, modelId) {
    if (!ledgerMap) return null
    const match = ledgerMap.get(routeModelKey(target, route, modelId))
    if (match) return { deployability: match.deployability, deployabilityReason: match.deployabilityReason }
    return { deployability: 'unknown', deployabilityReason: 'ledger-entry-missing' }
}

function externalCapabilityEvidence(map, target, route, modelId, field, observedAt) {
    const entry = map.get(routeModelKey(target, route, modelId))
    if (!entry) return null
    const raw = entry.capabilities?.[field] ?? entry[field]
    if (!raw) return null
    const rawStatus = typeof raw === 'string' ? raw : raw.status
    const status = rawStatus === 'proven' || rawStatus === `${field}-proven`
        ? `${field}-proven`
        : statusFromFailure(rawStatus)
    return evidence(status, 'external-evidence', {
        observedAt: raw.observedAt || entry.observedAt || observedAt,
        statusCode: raw.statusCode ?? entry.statusCode ?? null,
        elapsedMs: raw.elapsedMs ?? entry.elapsedMs ?? null,
        error: raw.error || entry.error || null
    })
}

function pickerMetadata(model) {
    const metadata = model.metadata || {}
    const result = { id: model.id, name: metadata.name || model.id }
    for (const field of [
        'reasoning',
        'supportsReasoning',
        'supportsReasoningEffort',
        'supportsVision',
        'supportsTools',
        'contextWindow',
        'maxTokens',
        'input',
        'thinkingLevelMap',
        'metadataSource',
        'metadataConfidence',
        'metadataLastVerified',
        'normalizedModel'
    ]) {
        if (metadata[field] !== undefined) result[field] = metadata[field]
    }
    return result
}

function collectHealthRoutes(health) {
    const routes = []
    for (const router of health?.routers || []) {
        const target = String(router.name || 'unknown')
        for (const route of router.routes || []) {
            routes.push({ target, route: { ...route, route: routePath(route.route) } })
        }
    }
    return routes
}

function buildTargetStatus(model, target, route, observedAt, externalEvidence, ledgerMap) {
    const routeName = routePath(model.path || model.baseUrl)
    const catalog = routeCatalogEvidence(route, model, target, observedAt)
    const chat = externalCapabilityEvidence(externalEvidence, target, routeName, model.id, 'chat', observedAt)
        || smokeEvidence(route, model.id, 'chat', 'chat-proven', 'chat', observedAt)
    const tool = externalCapabilityEvidence(externalEvidence, target, routeName, model.id, 'tool', observedAt)
        || smokeEvidence(route, model.id, 'tool', 'tool-proven', 'tool', observedAt)
    const vision = externalCapabilityEvidence(externalEvidence, target, routeName, model.id, 'vision', observedAt)
        || smokeEvidence(route, model.id, 'vision', 'vision-proven', 'vision', observedAt)
    const targetStatus = {
        target,
        route: routeName,
        routeProvider: route?.provider || null,
        capabilities: { catalog, chat, tool, vision }
    }
    // Deployability is a separate target-level projection from the ledger. It is
    // never merged into catalog/chat/tool/vision proof fields, and a missing
    // ledger (ledgerMap === null) leaves the field absent so existing callers are
    // unchanged.
    if (ledgerMap) {
        const projection = ledgerDeployability(ledgerMap, target, routeName, model.id)
        targetStatus.deployability = projection.deployability
        targetStatus.deployabilityReason = projection.deployabilityReason
    }
    return targetStatus
}

export function buildCapabilityStatus({ catalog, health, visionEvidence = null, ledger = null } = {}) {
    if (!catalog || !Array.isArray(catalog.models)) throw new Error('catalog.models must be an array')
    if (!health || !Array.isArray(health.routers)) throw new Error('health.routers must be an array')

    const observedAt = health.generatedAt || null
    const healthRoutes = collectHealthRoutes(health)
    const externalEvidence = normalizeExternalEvidence(visionEvidence)
    const ledgerMap = normalizeLedger(ledger)
    const entries = catalog.models.map((model) => {
        const route = modelRoutePath(model)
        const matchingRoutes = healthRoutes.filter((item) => item.route.route === route)
        const targets = matchingRoutes.map((item) => buildTargetStatus(model, item.target, item.route, observedAt, externalEvidence, ledgerMap))
        return {
            provider: model.provider || null,
            modelId: model.id,
            route,
            picker: pickerMetadata(model),
            targets
        }
    })

    const targetStatuses = entries.flatMap((entry) => entry.targets.flatMap((target) =>
        STATUS_FIELDS.map((field) => ({ field, status: target.capabilities[field].status }))
    ))
    const countStatuses = (field) => Object.fromEntries(
        [...new Set(targetStatuses.filter((item) => item.field === field).map((item) => item.status))]
            .sort()
            .map((status) => [status, targetStatuses.filter((item) => item.field === field && item.status === status).length])
    )

    const result = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        policy: {
            secretFree: true,
            nativePickerSchemaUnchanged: true,
            noProviderCalls: true,
            catalogVisibleRequiresExactModelId: true,
            chatProvenRequiresExplicitChatSmoke: true,
            toolProvenRequiresExplicitToolEvidence: true,
            visionProvenRequiresExplicitVisionEvidence: true,
            declaredCapabilityNeverPromotesProof: true,
            ledgerDeployabilityProjectedNotPromoted: true
        },
        sources: {
            catalogGeneratedAt: catalog.generatedAt || null,
            healthGeneratedAt: health.generatedAt || null,
            healthSchemaVersion: health.schemaVersion || null,
            externalEvidenceProvided: Boolean(visionEvidence),
            ledgerProvided: Boolean(ledger)
        },
        summary: {
            modelCount: entries.length,
            targetCount: entries.reduce((count, entry) => count + entry.targets.length, 0),
            catalog: countStatuses('catalog'),
            chat: countStatuses('chat'),
            tool: countStatuses('tool'),
            vision: countStatuses('vision')
        },
        entries
    }
    assertSecretFree(result)
    return result
}

function assertSecretFree(value, key = '') {
    if (typeof value === 'string') {
        if (SECRET_PATTERN.test(value)) throw new Error(`secret-like value found in capability status at ${key || '<root>'}`)
        return
    }
    if (!value || typeof value !== 'object') return
    for (const [childKey, childValue] of Object.entries(value)) {
        if (SENSITIVE_KEY.test(childKey)) throw new Error(`sensitive key found in capability status: ${key}.${childKey}`)
        assertSecretFree(childValue, key ? `${key}.${childKey}` : childKey)
    }
}

export function markdownReport(status) {
    const lines = [
        '# Model Capability Status',
        '',
        `Generated: ${status.generatedAt}`,
        `Models: ${status.summary.modelCount}`,
        `Targets: ${status.summary.targetCount}`,
        '',
        '| Capability | Status counts |',
        '| --- | --- |'
    ]
    for (const field of STATUS_FIELDS) {
        const counts = status.summary[field] || {}
        lines.push(`| ${field} | ${Object.entries(counts).map(([key, count]) => `${key}: ${count}`).join(', ') || 'none observed'} |`)
    }
    lines.push(
        '',
        'Catalog visibility is discovery evidence only. Chat, tool, and vision proof require their own explicit probes; declared picker metadata never promotes a capability to proven.'
    )
    return `${lines.join('\n')}\n`
}

function main() {
    const catalogPath = argValue('catalog', DEFAULT_CATALOG)
    const healthPath = argValue('health', DEFAULT_HEALTH)
    const evidencePath = argValue('vision-evidence', null)
    const ledgerPath = argValue('ledger', null)
    const outputPath = argValue('output', DEFAULT_OUTPUT)
    const reportPath = hasFlag('markdown') ? argValue('report', DEFAULT_REPORT) : argValue('report', null)
    const catalog = readJson(catalogPath)
    const health = readJson(healthPath)
    const visionEvidence = evidencePath ? readJson(evidencePath) : null
    const ledger = ledgerPath ? readJson(ledgerPath) : null
    const status = buildCapabilityStatus({ catalog, health, visionEvidence, ledger })
    ensureParent(outputPath)
    fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(status, null, 2)}\n`, 'utf8')
    if (reportPath) {
        ensureParent(reportPath)
        fs.writeFileSync(path.resolve(reportPath), markdownReport(status), 'utf8')
    }
    console.log(JSON.stringify({
        output: path.resolve(outputPath),
        report: reportPath ? path.resolve(reportPath) : null,
        summary: status.summary
    }, null, 2))
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null
if (invokedPath === import.meta.url) {
    try {
        main()
    } catch (error) {
        console.error(error?.stack || error)
        process.exitCode = 1
    }
}
