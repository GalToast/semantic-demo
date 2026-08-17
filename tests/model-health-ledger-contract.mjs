import assert from 'node:assert/strict'
import { buildLedger } from '../scripts/model-health-ledger.mjs'

const NOW = new Date('2026-08-16T12:00:00.000Z').getTime()

function makeCatalog(target, route, modelId, status = 'catalog-visible', observedAt = '2026-08-16T11:59:00.000Z', extra = {}) {
    return { target, route, modelId, status, observedAt, ...extra }
}

function makeRouteHealth(target, route, modelId, status = 'catalog_visible', statusCode = 200, observedAt = '2026-08-16T11:59:00.000Z', extra = {}) {
    return { target, route, modelId, status, statusCode, observedAt, ...extra }
}

function makeChatProof(target, route, modelId, status = 'chat-proven', statusCode = 200, observedAt = '2026-08-16T11:50:00.000Z', extra = {}) {
    return { target, route, modelId, status, statusCode, observedAt, ...extra }
}

function makeWorkerProof(target, route, modelId, status = 'proven', observedAt = '2026-08-16T11:50:00.000Z', extra = {}) {
    return { target, route, modelId, status, observedAt, ...extra }
}

function makeCapabilityProof(target, route, modelId, status = 'vision-proven', observedAt = '2026-08-16T11:50:00.000Z', extra = {}) {
    return { target, route, modelId, status, observedAt, ...extra }
}

// 1. exact model matching
{
    const ledger = buildLedger({
        catalog: [
            makeCatalog('laptop', '/kilo/v1', 'alpha', 'catalog-visible', '2026-08-16T11:59:00.000Z', { modelIds: ['alpha', 'beta'] }),
            makeCatalog('laptop', '/kilo/v1', 'beta', 'catalog-visible', '2026-08-16T11:59:00.000Z', { modelIds: ['alpha', 'beta'] })
        ],
        routeHealth: [
            makeRouteHealth('laptop', '/kilo/v1', 'alpha'),
            makeRouteHealth('laptop', '/kilo/v1', 'beta')
        ],
        dataPlaneChat: [
            makeChatProof('laptop', '/kilo/v1', 'alpha')
        ],
        now: NOW
    })

    const alphaKey = 'laptop\u0000/kilo/v1\u0000alpha'
    const betaKey = 'laptop\u0000/kilo/v1\u0000beta'

    assert.equal(ledger.entries[alphaKey].modelId, 'alpha')
    assert.equal(ledger.entries[alphaKey].rails.controlPlane.status, 'catalog-visible')
    assert.equal(ledger.entries[alphaKey].rails.dataPlaneChat.status, 'chat-proven')
    assert.equal(ledger.entries[alphaKey].deployability, 'deployable')

    assert.equal(ledger.entries[betaKey].deployability, 'ready-unverified')
}

// 2. newest evidence wins, even when inputs arrive out of order
{
    const ledger = buildLedger({
        catalog: [
            makeCatalog('laptop', '/kilo/v1', 'alpha', 'catalog-visible', '2026-08-16T11:59:00.000Z'),
            makeCatalog('laptop', '/kilo/v1', 'alpha', 'catalog-visible', '2026-08-16T11:00:00.000Z')
        ],
        now: NOW
    })

    const key = 'laptop\u0000/kilo/v1\u0000alpha'
    assert.equal(ledger.entries[key].rails.controlPlane.observedAt, '2026-08-16T11:59:00.000Z')
}

// 3. unknown route status cannot promote to deployable
{
    const ledger = buildLedger({
        catalog: [makeCatalog('laptop', '/kilo/v1', 'alpha')],
        routeHealth: [makeRouteHealth('laptop', '/kilo/v1', 'alpha', 'mystery', 200)],
        dataPlaneChat: [makeChatProof('laptop', '/kilo/v1', 'alpha')],
        now: NOW
    })

    const key = 'laptop\u0000/kilo/v1\u0000alpha'
    assert.equal(ledger.entries[key].deployability, 'unknown')
}

// 4. HTTP 429 is a cooldown even when the caller did not normalize the status
{
    const ledger = buildLedger({
        routeHealth: [makeRouteHealth('laptop', '/kilo/v1', 'alpha', 'error', 429)],
        now: NOW
    })

    const key = 'laptop\u0000/kilo/v1\u0000alpha'
    assert.equal(ledger.entries[key].deployability, 'cooldown')
}

// 5. manual overrides may suppress, but never promote, evidence
{
    const key = 'laptop\u0000/kilo/v1\u0000alpha'
    const ledger = buildLedger({
        catalog: [makeCatalog('laptop', '/kilo/v1', 'alpha')],
        routeHealth: [makeRouteHealth('laptop', '/kilo/v1', 'alpha')],
        manualOverrides: { [key]: { deployability: 'deployable' } },
        now: NOW
    })

    assert.equal(ledger.entries[key].deployability, 'ready-unverified')
}

// 6. stale cooldown evidence is not an active cooldown forever
{
    const ledger = buildLedger({
        catalog: [makeCatalog('laptop', '/kilo/v1', 'alpha')],
        routeHealth: [makeRouteHealth('laptop', '/kilo/v1', 'alpha', 'cooldown', 429, '2026-08-16T10:00:00.000Z')],
        now: NOW
    })

    const key = 'laptop\u0000/kilo/v1\u0000alpha'
    assert.equal(ledger.entries[key].deployability, 'stale')
}

// 7. future-dated evidence is not fresh
{
    const ledger = buildLedger({
        catalog: [makeCatalog('laptop', '/kilo/v1', 'alpha', 'catalog-visible', '2026-08-16T13:00:00.000Z')],
        routeHealth: [makeRouteHealth('laptop', '/kilo/v1', 'alpha', 'catalog_visible', 200, '2026-08-16T13:00:00.000Z')],
        dataPlaneChat: [makeChatProof('laptop', '/kilo/v1', 'alpha', 'chat-proven', 200, '2026-08-16T13:00:00.000Z')],
        now: NOW
    })

    const key = 'laptop\u0000/kilo/v1\u0000alpha'
    assert.equal(ledger.entries[key].deployability, 'stale')
}

// 8. malformed evidence cannot create an "undefined" ledger key
{
    const ledger = buildLedger({
        catalog: [null, { target: 'laptop', route: '/kilo/v1' }],
        now: NOW
    })

    assert.deepEqual(Object.keys(ledger.entries), [])
}

// 9. catalog-only not deployable
{
    const ledger = buildLedger({
        catalog: [makeCatalog('laptop', '/kilo/v1', 'alpha')],
        routeHealth: [makeRouteHealth('laptop', '/kilo/v1', 'alpha')],
        now: NOW
    })

    const key = 'laptop\u0000/kilo/v1\u0000alpha'
    assert.equal(ledger.entries[key].deployability, 'ready-unverified')
}

// 10. fresh chat proof deployable
{
    const ledger = buildLedger({
        catalog: [makeCatalog('laptop', '/kilo/v1', 'alpha')],
        routeHealth: [makeRouteHealth('laptop', '/kilo/v1', 'alpha')],
        dataPlaneChat: [makeChatProof('laptop', '/kilo/v1', 'alpha')],
        now: NOW
    })

    const key = 'laptop\u0000/kilo/v1\u0000alpha'
    assert.equal(ledger.entries[key].deployability, 'deployable')
}

// 11. TTL expiry to stale
{
    const oldObserved = '2026-08-16T10:00:00.000Z'
    const ledger = buildLedger({
        catalog: [makeCatalog('laptop', '/kilo/v1', 'alpha', 'catalog-visible', oldObserved)],
        routeHealth: [makeRouteHealth('laptop', '/kilo/v1', 'alpha', 'catalog_visible', 200, oldObserved)],
        dataPlaneChat: [makeChatProof('laptop', '/kilo/v1', 'alpha', 'chat-proven', 200, oldObserved)],
        now: NOW
    })

    const key = 'laptop\u0000/kilo/v1\u0000alpha'
    assert.equal(ledger.entries[key].deployability, 'stale')
}

// 12. cooldown suppression/status
{
    const ledger = buildLedger({
        routeHealth: [
            makeRouteHealth('laptop', '/kilo/v1', 'alpha', 'cooldown', 429, '2026-08-16T11:59:00.000Z', { retryAfterMs: 1234 })
        ],
        now: NOW
    })

    const key = 'laptop\u0000/kilo/v1\u0000alpha'
    assert.equal(ledger.entries[key].deployability, 'cooldown')
    assert.equal(ledger.entries[key].rails.routeHealth.retryAfterMs, 1234)
}

// 13. blocked errors
{
    const ledger = buildLedger({
        routeHealth: [
            makeRouteHealth('laptop', '/kilo/v1', 'alpha', 'not_visible', 404, '2026-08-16T11:59:00.000Z')
        ],
        now: NOW
    })

    const key = 'laptop\u0000/kilo/v1\u0000alpha'
    assert.equal(ledger.entries[key].deployability, 'blocked')
}

// 14. empty-200
{
    const ledger = buildLedger({
        catalog: [makeCatalog('laptop', '/kilo/v1', 'alpha')],
        routeHealth: [makeRouteHealth('laptop', '/kilo/v1', 'alpha', 'empty-200', 200, '2026-08-16T11:59:00.000Z')],
        now: NOW
    })

    const key = 'laptop\u0000/kilo/v1\u0000alpha'
    assert.equal(ledger.entries[key].deployability, 'degraded')
}

// 15. worker proof
{
    const ledger = buildLedger({
        catalog: [makeCatalog('laptop', '/kilo/v1', 'alpha')],
        routeHealth: [makeRouteHealth('laptop', '/kilo/v1', 'alpha')],
        workerProof: [makeWorkerProof('laptop', '/kilo/v1', 'alpha', 'proven', '2026-08-16T11:50:00.000Z')],
        now: NOW
    })

    const key = 'laptop\u0000/kilo/v1\u0000alpha'
    assert.equal(ledger.entries[key].deployability, 'deployable')
}

// 16. secret-free output
{
    const ledger = buildLedger({
        catalog: [
            makeCatalog('laptop', '/kilo/v1', 'alpha', 'catalog-visible', '2026-08-16T11:59:00.000Z', {
                apiKey: 'sk-secret-token',
                authorization: 'Bearer abc123'
            })
        ],
        routeHealth: [makeRouteHealth('laptop', '/kilo/v1', 'alpha')],
        now: NOW
    })

    assert.equal(JSON.stringify(ledger).includes('sk-secret-token'), false)
    assert.equal(JSON.stringify(ledger).includes('abc123'), false)
    assert.equal(ledger.entries['laptop\u0000/kilo/v1\u0000alpha'].rails.controlPlane.apiKey, undefined)
    assert.equal(ledger.entries['laptop\u0000/kilo/v1\u0000alpha'].rails.controlPlane.authorization, undefined)
}

// 17. input immutability
{
    const catalogInput = [makeCatalog('laptop', '/kilo/v1', 'alpha')]
    const routeInput = [makeRouteHealth('laptop', '/kilo/v1', 'alpha')]
    const chatInput = [makeChatProof('laptop', '/kilo/v1', 'alpha')]
    const workerInput = [makeWorkerProof('laptop', '/kilo/v1', 'alpha')]
    const capabilityInput = [makeCapabilityProof('laptop', '/kilo/v1', 'alpha')]

    buildLedger({
        catalog: catalogInput,
        routeHealth: routeInput,
        dataPlaneChat: chatInput,
        workerProof: workerInput,
        capabilityProof: capabilityInput,
        now: NOW
    })

    assert.deepEqual(catalogInput, [makeCatalog('laptop', '/kilo/v1', 'alpha')])
    assert.deepEqual(routeInput, [makeRouteHealth('laptop', '/kilo/v1', 'alpha')])
    assert.deepEqual(chatInput, [makeChatProof('laptop', '/kilo/v1', 'alpha')])
    assert.deepEqual(workerInput, [makeWorkerProof('laptop', '/kilo/v1', 'alpha')])
    assert.deepEqual(capabilityInput, [makeCapabilityProof('laptop', '/kilo/v1', 'alpha')])
}

console.log('model-health-ledger-contract: ok')
