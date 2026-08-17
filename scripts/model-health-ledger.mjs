#!/usr/bin/env node

const DEFAULT_TTLS = {
    controlPlaneMs: 15 * 60 * 1000,
    routeHealthMs: 5 * 60 * 1000,
    dataPlaneChatMs: 30 * 60 * 1000,
    capabilityProofMs: 24 * 60 * 60 * 1000
}

const SECRET_PATTERN = /(?:bearer\s+\S{12,}|sk-[a-z0-9]{16,}|rk-[a-z0-9]{16,}|pk-[a-z0-9]{16,}|AIza[a-z0-9]{20,}|gh[pousr]_[a-z0-9]{20,}|xox[baprs]-[a-z0-9-]{20,})/i
const SENSITIVE_KEY = /^(?:api[_-]?key|authorization|cookie|credential|headers?|password|secret|token|private[_-]?key|options?|env)$/i

function makeKey(target, route, modelId) {
    return `${target}\u0000${route}\u0000${modelId}`
}

function toMs(value) {
    if (!value) return null
    const d = new Date(value)
    return Number.isFinite(d.getTime()) ? d.getTime() : null
}

function isFresh(observedAtMs, ttlMs, now) {
    return observedAtMs != null && observedAtMs <= now && (now - observedAtMs) < ttlMs
}

function normalizeStatus(status) {
    return typeof status === 'string' ? status.trim().toLowerCase().replaceAll('_', '-') : status
}

function clone(value) {
    return JSON.parse(JSON.stringify(value))
}

function sanitize(value) {
    if (typeof value === 'string') {
        return SECRET_PATTERN.test(value) ? '<redacted>' : value
    }
    if (!value || typeof value !== 'object') return value
    if (Array.isArray(value)) return value.map(sanitize)

    const result = {}
    for (const [k, v] of Object.entries(value)) {
        if (SENSITIVE_KEY.test(k)) continue
        result[k] = sanitize(v)
    }
    return result
}

function classifyRailStatus(status, statusCode, error) {
    const normalizedStatus = normalizeStatus(status)
    const normalizedStatusCode = Number.isFinite(Number(statusCode)) ? Number(statusCode) : null
    if (normalizedStatus === 'cooldown' || normalizedStatusCode === 429) return 'cooldown'
    if ([401, 402, 403, 404, 410].includes(normalizedStatusCode)) return 'blocked'
    if (normalizedStatus === 'timeout' || (normalizedStatusCode && normalizedStatusCode >= 500 && normalizedStatusCode < 600) || error === 'transport_error') return 'degraded'
    if (normalizedStatus === 'empty-200') return 'degraded'
    if (normalizedStatus === 'chat-ok' || normalizedStatus === 'catalog-visible' || normalizedStatus === 'healthy' || normalizedStatus === 'ok' || normalizedStatus === 'proven' || normalizedStatus?.endsWith?.('-proven')) return 'proven'
    return normalizedStatus
}

function deriveDeployability(rails, freshness, ttl, overrides) {
    const override = normalizeStatus(overrides?.deployability)
    const safeOverrides = new Set(['blocked', 'cooldown', 'degraded', 'stale', 'ready-unverified', 'unknown', 'unlaunchable'])
    if (safeOverrides.has(override)) return override

    const control = rails.controlPlane
    const route = rails.routeHealth
    const chat = rails.dataPlaneChat
    const worker = rails.workerProof
    const capability = rails.capabilityProof

    const routeStatus = route ? classifyRailStatus(route.status, route.statusCode, route.error) : null
    const chatStatus = chat ? classifyRailStatus(chat.status, chat.statusCode, chat.error) : null
    const workerStatus = worker ? classifyRailStatus(worker.status, worker.statusCode, worker.error) : null

    if (routeStatus === 'cooldown' && freshness.routeHealth) return 'cooldown'
    if (routeStatus === 'blocked') return 'blocked'
    if (chatStatus === 'cooldown' && freshness.dataPlaneChat) return 'cooldown'

    // Registration/configuration + exact catalog visibility
    if (!control) return 'unknown'
    if (!freshness.controlPlane) return 'stale'
    if (control.status !== 'catalog-visible') return 'unknown'
    if (control.configured === false) return 'unknown'
    if (Array.isArray(control.modelIds) && !control.modelIds.includes(control.modelId)) return 'unknown'

    // Healthy route required
    if (!route) return 'stale'
    if (!freshness.routeHealth) return 'stale'
    if (routeStatus === 'degraded') return 'degraded'
    if (routeStatus !== 'proven') return 'unknown'

    // Recent chat or real worker proof required
    const hasProof = (freshness.dataPlaneChat && chatStatus === 'proven') || (freshness.workerProof && workerStatus === 'proven')
    if (!hasProof) {
        if ((chat && !freshness.dataPlaneChat) || (worker && !freshness.workerProof)) return 'stale'
        return 'ready-unverified'
    }

    // Stale capability proof must not promote
    if (capability && !freshness.capabilityProof) return 'stale'

    return 'deployable'
}

function deriveReason(rails, freshness, deployability) {
    if (deployability === 'cooldown') {
        if (rails.dataPlaneChat?.status === 'cooldown') return 'chat-cooldown'
        return 'route-cooldown'
    }
    if (deployability === 'blocked') return rails.routeHealth?.error || 'route-blocked'
    if (deployability === 'degraded') return 'route-degraded'
    if (deployability === 'stale') {
        if (rails.capabilityProof && !freshness.capabilityProof) return 'stale-capability-proof'
        return 'stale-evidence'
    }
    if (deployability === 'ready-unverified') return 'no-recent-chat-or-worker-proof'
    if (deployability === 'deployable') {
        if (freshness.workerProof) return 'fresh-worker-proven'
        return 'fresh-chat-proven'
    }
    return 'insufficient-data'
}

export function buildLedger({
    catalog = [],
    routeHealth = [],
    dataPlaneChat = [],
    workerProof = [],
    capabilityProof = [],
    manualOverrides = {},
    now = Date.now()
} = {}) {
    const entries = {}

    const collect = (items, railName) => {
        for (const item of items) {
            if (!item || typeof item !== 'object' || [item.target, item.route, item.modelId].some((value) => typeof value !== 'string' || !value)) continue
            const key = makeKey(item.target, item.route, item.modelId)
            if (!entries[key]) {
                entries[key] = { target: item.target, route: item.route, modelId: item.modelId, rails: {} }
            }
            const next = sanitize(clone(item))
            const current = entries[key].rails[railName]
            const currentObservedAt = toMs(current?.observedAt)
            const nextObservedAt = toMs(next?.observedAt)
            if (!current || (nextObservedAt != null && (currentObservedAt == null || nextObservedAt >= currentObservedAt))) {
                entries[key].rails[railName] = next
            }
        }
    }

    collect(catalog, 'controlPlane')
    collect(routeHealth, 'routeHealth')
    collect(dataPlaneChat, 'dataPlaneChat')
    collect(workerProof, 'workerProof')
    collect(capabilityProof, 'capabilityProof')

    for (const [key, entry] of Object.entries(entries)) {
        const overrides = manualOverrides?.[key] || {}
        const ttl = { ...DEFAULT_TTLS, ...(overrides.ttl || {}) }

        const freshness = {
            controlPlane: entry.rails.controlPlane ? isFresh(toMs(entry.rails.controlPlane.observedAt), ttl.controlPlaneMs, now) : false,
            routeHealth: entry.rails.routeHealth ? isFresh(toMs(entry.rails.routeHealth.observedAt), ttl.routeHealthMs, now) : false,
            dataPlaneChat: entry.rails.dataPlaneChat ? isFresh(toMs(entry.rails.dataPlaneChat.observedAt), ttl.dataPlaneChatMs, now) : false,
            workerProof: entry.rails.workerProof ? isFresh(toMs(entry.rails.workerProof.observedAt), ttl.dataPlaneChatMs, now) : false,
            capabilityProof: entry.rails.capabilityProof ? isFresh(toMs(entry.rails.capabilityProof.observedAt), ttl.capabilityProofMs, now) : false
        }

        entry.freshness = freshness
        entry.deployability = deriveDeployability(entry.rails, freshness, ttl, overrides)
        entry.deployabilityReason = deriveReason(entry.rails, freshness, entry.deployability)
    }

    return {
        schemaVersion: 1,
        generatedAt: new Date(now).toISOString(),
        entries
    }
}
