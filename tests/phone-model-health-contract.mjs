import assert from 'node:assert/strict'
import { buildHealthMatrix, parseArgs, scrubSecrets } from '../scripts/phone-model-health.mjs'

assert.equal(parseArgs(['--concurrency=99', '--timeout=99999']).concurrency, 2)
assert.equal(parseArgs(['--concurrency=0', '--timeout=1']).timeoutMs, 250)
assert.equal(parseArgs(['--smoke']).includePaid, false)
assert.equal(parseArgs(['--smoke', '--include-paid']).includePaid, true)
assert.equal(scrubSecrets('Bearer sk-super-secret-token and ?api_key=abc123'), 'Bearer <redacted> and ?api_key=<redacted>')

let calls = 0
let active = 0
let maxActive = 0
const fetchImpl = async (url) => {
    calls += 1
    active += 1
    maxActive = Math.max(maxActive, active)
    try {
        if (String(url).endsWith('/catalog')) {
            return new Response(JSON.stringify({ routes: [
                { providerId: 'agnes', routePrefix: '/agnes/v1' },
                { providerId: 'kilo', routePrefix: '/kilo/v1' },
                { providerId: 'timeout', routePrefix: '/timeout/v1' }
            ] }), { status: 200 })
        }
        if (String(url).endsWith('/agnes/v1/models')) return new Response(JSON.stringify({ data: [{ id: 'agnes-2.5-flash' }] }), { status: 200 })
        if (String(url).endsWith('/kilo/v1/models')) return new Response(JSON.stringify({ error: { message: 'cooldown with sk-secret-token', nextReadyInMs: 1234 } }), { status: 429, headers: { 'retry-after': '2' } })
        if (String(url).endsWith('/timeout/v1/models')) {
            const error = new Error('timeout')
            error.name = 'AbortError'
            throw error
        }
        if (String(url).endsWith('/agnes/v1/chat/completions')) return new Response(JSON.stringify({ choices: [{ message: { content: 'ok', reasoning_content: 'thought' } }] }), { status: 200 })
        throw new Error(`unexpected ${url}`)
    } finally {
        active -= 1
    }
}

const catalogOnly = await buildHealthMatrix({
    fetchImpl,
    routers: [{ name: 'phone', baseUrl: 'http://127.0.0.1:18789' }],
    routeLimit: 3,
    concurrency: 2,
    timeoutMs: 8000
})
assert.equal(catalogOnly.summary.chatOk, 0)
assert.equal(catalogOnly.summary.selectedRoutes, 3)
assert.equal(catalogOnly.routers[0].routes.find((route) => route.provider === 'kilo').status, 'cooldown')
assert.equal(catalogOnly.routers[0].routes.find((route) => route.provider === 'kilo').retryAfterMs, 1234)
assert.equal(catalogOnly.routers[0].routes.find((route) => route.provider === 'timeout').status, 'timeout')

const withSmoke = await buildHealthMatrix({
    fetchImpl,
    routers: [{ name: 'phone', baseUrl: 'http://127.0.0.1:18789' }],
    routeLimit: 1,
    modelLimit: 1,
    concurrency: 2,
    timeoutMs: 8000,
    smoke: true
})
assert.equal(withSmoke.summary.chatOk, 1)
assert.equal(withSmoke.summary.reasoningSeen, 1)
assert.deepEqual(withSmoke.routers[0].routes[0].modelIds, ['agnes-2.5-flash'])
assert.ok(calls >= 5)
assert.ok(maxActive <= 2)
assert.equal(JSON.stringify(withSmoke).includes('sk-secret-token'), false)

const paidCatalog = await buildHealthMatrix({
    fetchImpl: async (url) => {
        if (String(url).endsWith('/catalog')) return new Response(JSON.stringify({ routes: [{ providerId: 'kilo', routePrefix: '/kilo/v1' }] }), { status: 200 })
        if (String(url).endsWith('/kilo/v1/models')) return new Response(JSON.stringify({ data: [{ id: 'kilo-auto/frontier' }] }), { status: 200 })
        throw new Error('paid model must not be probed without --include-paid')
    },
    routers: [{ name: 'phone', baseUrl: 'http://127.0.0.1:18789' }],
    routeLimit: 1,
    smoke: true
})
assert.equal(paidCatalog.routers[0].routes[0].smokeSkippedReason, 'no-free-model-candidate')

console.log('phone-model-health-contract: ok')
