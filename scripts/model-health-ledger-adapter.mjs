#!/usr/bin/env node

/**
 * Pure adapter from phone-model-health's matrix shape to the evidence ledger.
 *
 * This module does not probe, read, or write files. Callers can pass its result
 * directly to buildLedger({ ...healthMatrixToLedgerInputs(matrix), now }).
 */

function normalizedStatus(value) {
    return typeof value === 'string' ? value.trim().toLowerCase().replaceAll('_', '-') : value ?? null
}

function normalizedError(status, error) {
    if (error != null) return error
    return normalizedStatus(status) === 'transport-error' ? 'transport_error' : null
}

function copyEvidence({ target, route, modelId, status, observedAt, statusCode, retryAfterMs, error, source, extra = {} }) {
    return {
        target,
        route,
        modelId,
        status: normalizedStatus(status),
        observedAt: observedAt ?? null,
        statusCode: statusCode ?? null,
        retryAfterMs: retryAfterMs ?? null,
        error: normalizedError(status, error),
        source,
        ...extra
    }
}

function validIdentity(value) {
    return typeof value === 'string' && value.trim().length > 0
}

function routeObservedAt(matrix, route) {
    return route.observedAt ?? matrix.generatedAt ?? null
}

/**
 * Convert a phone-model-health matrix to the three ledger rails it can prove.
 * Model IDs are taken only from route.modelIds and smoke[].model; no IDs are
 * inferred from counts, names, or provider metadata.
 */
export function healthMatrixToLedgerInputs(matrix = {}) {
    const inputs = { catalog: [], routeHealth: [], dataPlaneChat: [] }
    if (!matrix || !Array.isArray(matrix.routers)) return inputs

    for (const router of matrix.routers) {
        const target = router?.name
        if (!validIdentity(target) || !Array.isArray(router.routes)) continue

        for (const route of router.routes) {
            const routeName = route?.route
            if (!validIdentity(routeName)) continue
            const observedAt = routeObservedAt(matrix, route)
            const modelIds = Array.isArray(route.modelIds)
                ? [...new Set(route.modelIds.filter((modelId) => validIdentity(modelId)))]
                : []

            for (const modelId of modelIds) {
                const common = {
                    target,
                    route: routeName,
                    modelId,
                    status: route.status,
                    observedAt,
                    statusCode: route.statusCode,
                    retryAfterMs: route.retryAfterMs,
                    error: route.error
                }
                inputs.catalog.push(copyEvidence({ ...common, source: 'phone-model-health/catalog', extra: { modelIds } }))
                inputs.routeHealth.push(copyEvidence({ ...common, source: 'phone-model-health/route' }))
            }

            if (!Array.isArray(route.smoke)) continue
            for (const smoke of route.smoke) {
                const modelId = smoke?.model
                if (!validIdentity(modelId)) continue
                inputs.dataPlaneChat.push(copyEvidence({
                    target,
                    route: routeName,
                    modelId,
                    status: smoke.status === 'chat_ok' ? 'chat-proven' : smoke.status,
                    observedAt: smoke.observedAt ?? observedAt,
                    statusCode: smoke.statusCode,
                    retryAfterMs: smoke.retryAfterMs,
                    error: smoke.error,
                    source: 'phone-model-health/chat',
                    extra: {
                        reasoningSeen: smoke.reasoningSeen ?? false,
                        toolEvidence: smoke.toolEvidence ?? false,
                        contentPreview: smoke.contentPreview ?? null
                    }
                }))
            }
        }
    }

    return inputs
}

export default healthMatrixToLedgerInputs
