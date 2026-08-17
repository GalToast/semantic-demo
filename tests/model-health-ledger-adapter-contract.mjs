import assert from 'node:assert/strict'
import { healthMatrixToLedgerInputs } from '../scripts/model-health-ledger-adapter.mjs'
import { buildLedger } from '../scripts/model-health-ledger.mjs'

const NOW = new Date('2026-08-16T12:00:00.000Z').getTime()
const observedAt = '2026-08-16T11:59:00.000Z'

const matrix = {
    schemaVersion: 1,
    generatedAt: observedAt,
    routers: [
        {
            name: 'laptop',
            routes: [
                {
                    provider: 'kilo',
                    route: '/kilo/v1',
                    status: 'catalog_visible',
                    statusCode: 200,
                    modelIds: ['alpha', 'beta', 'alpha'],
                    retryAfterMs: null,
                    error: null,
                    smoke: [
                        { model: 'alpha', status: 'chat_ok', statusCode: 200, reasoningSeen: true, toolEvidence: false, contentPreview: 'ok' },
                        { model: 'beta', status: 'cooldown', statusCode: 429, retryAfterMs: 5000, error: 'cooldown' }
                    ]
                },
                {
                    route: '/broken/v1',
                    status: 'transport_error',
                    statusCode: null,
                    modelIds: ['gamma'],
                    smoke: []
                }
            ]
        },
        { name: 'missing-routes' },
        { routes: [{ route: '/ignored/v1', modelIds: ['ignored'] }] }
    ]
}

// Exact model/route/target identity and deduplicated catalog model IDs.
{
    const inputs = healthMatrixToLedgerInputs(matrix)
    assert.equal(inputs.catalog.length, 3)
    assert.equal(inputs.routeHealth.length, 3)
    assert.equal(inputs.dataPlaneChat.length, 2)
    assert.deepEqual(inputs.catalog.map(({ target, route, modelId }) => `${target}\u0000${route}\u0000${modelId}`), [
        'laptop\u0000/kilo/v1\u0000alpha',
        'laptop\u0000/kilo/v1\u0000beta',
        'laptop\u0000/broken/v1\u0000gamma'
    ])
    assert.deepEqual(inputs.catalog[0].modelIds, ['alpha', 'beta'])
}

// Phone status spellings are normalized without collapsing rails.
{
    const inputs = healthMatrixToLedgerInputs(matrix)
    assert.equal(inputs.catalog[0].status, 'catalog-visible')
    assert.equal(inputs.routeHealth[0].status, 'catalog-visible')
    assert.equal(inputs.dataPlaneChat[0].status, 'chat-proven')
    assert.equal(inputs.dataPlaneChat[1].status, 'cooldown')
    assert.equal(inputs.dataPlaneChat[1].retryAfterMs, 5000)
    assert.equal(inputs.dataPlaneChat[0].reasoningSeen, true)
    assert.equal(inputs.dataPlaneChat[0].toolEvidence, false)
}

// The adapter composes with the ledger without duplicating deployability logic.
{
    const ledger = buildLedger({ ...healthMatrixToLedgerInputs(matrix), now: NOW })
    const alphaKey = 'laptop\u0000/kilo/v1\u0000alpha'
    const betaKey = 'laptop\u0000/kilo/v1\u0000beta'
    const gammaKey = 'laptop\u0000/broken/v1\u0000gamma'
    assert.equal(ledger.entries[alphaKey].deployability, 'deployable')
    assert.equal(ledger.entries[betaKey].deployability, 'cooldown')
    // A transport failure cannot prove catalog visibility, so the composite
    // verdict stays unknown even though the route rail retains the error.
    assert.equal(ledger.entries[gammaKey].deployability, 'unknown')
    assert.equal(ledger.entries[gammaKey].rails.routeHealth.error, 'transport_error')
}

// Smoke model IDs are explicit evidence; route model IDs are never inferred.
{
    const inputs = healthMatrixToLedgerInputs({
        generatedAt: observedAt,
        routers: [{
            name: 'laptop',
            routes: [{ route: '/kilo/v1', status: 'catalog_visible', modelIds: [], smoke: [{ model: 'explicit', status: 'chat_ok' }] }]
        }]
    })
    assert.equal(inputs.catalog.length, 0)
    assert.equal(inputs.routeHealth.length, 0)
    assert.equal(inputs.dataPlaneChat.length, 1)
    assert.equal(inputs.dataPlaneChat[0].modelId, 'explicit')
}

// Missing/malformed routers and routes are ignored, with no phantom keys.
{
    assert.deepEqual(healthMatrixToLedgerInputs(null), { catalog: [], routeHealth: [], dataPlaneChat: [] })
    assert.deepEqual(healthMatrixToLedgerInputs({ routers: [{ name: '', routes: [{ route: '/x', modelIds: ['x'] }] }] }), {
        catalog: [], routeHealth: [], dataPlaneChat: []
    })
}

// Input is not mutated and the adapter has no ambient/network behavior.
{
    const snapshot = JSON.parse(JSON.stringify(matrix))
    healthMatrixToLedgerInputs(matrix)
    assert.deepEqual(matrix, snapshot)
}

console.log('model-health-ledger-adapter-contract: ok')
