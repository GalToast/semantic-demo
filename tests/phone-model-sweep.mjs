#!/usr/bin/env node
/**
 * phone-model-sweep.mjs
 *
 * Consolidated phone-model contracts — replaces
 * phone-model-health-contract.mjs (80 LOC) + phone-model-parity-contract.mjs (90 LOC).
 *
 * Run: node tests/phone-model-sweep.mjs
 */

'use strict'

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

let failures = 0
let passed = 0

function pass(msg) { passed++; console.log(`  ✓ ${msg}`) }
function fail(msg) { failures++; console.error(`  ✗ ${msg}`) }
function assertEqual(actual, expected, msg) {
    if (actual !== expected) { fail(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`) }
    else { pass(msg) }
}
function assertDeepEqual(actual, expected, msg) {
    try { assert.deepEqual(actual, expected); pass(msg) }
    catch (e) { fail(`${msg}: ${e.message}`) }
}
function assertThrows(fn, msg) {
    try { fn(); fail(`${msg}: expected throw, none happened`) }
    catch { pass(msg) }
}

// ── Sweep 1: phone-model-health-contract.mjs ───────────────────────────────────
console.log('\n=== phone-model-health ===')

import { buildHealthMatrix, parseArgs, scrubSecrets } from '../scripts/phone-model-health.mjs'

assertEqual(parseArgs(['--concurrency=99', '--timeout=99999']).concurrency, 2, 'concurrency capped at 2')
assertEqual(parseArgs(['--concurrency=0', '--timeout=1']).timeoutMs, 250, 'timeout floored at 250')
assertEqual(parseArgs(['--smoke']).includePaid, false, 'smoke excludes paid by default')
assertEqual(parseArgs(['--smoke', '--include-paid']).includePaid, true, 'smoke+include-paid includes paid')
assertEqual(scrubSecrets('Bearer sk-super-secret-token and ?api_key=abc123'), 'Bearer <redacted> and ?api_key=<redacted>', 'scrubSecrets')

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
assertEqual(catalogOnly.summary.chatOk, 0, 'catalogOnly chatOk 0')
assertEqual(catalogOnly.summary.selectedRoutes, 3, 'catalogOnly selectedRoutes 3')
assertEqual(catalogOnly.routers[0].routes.find((route) => route.provider === 'kilo').status, 'cooldown', 'kilo status cooldown')
assertEqual(catalogOnly.routers[0].routes.find((route) => route.provider === 'kilo').retryAfterMs, 1234, 'kilo retryAfterMs')
assertEqual(catalogOnly.routers[0].routes.find((route) => route.provider === 'timeout').status, 'timeout', 'timeout status')

const withSmoke = await buildHealthMatrix({
    fetchImpl,
    routers: [{ name: 'phone', baseUrl: 'http://127.0.0.1:18789' }],
    routeLimit: 1,
    modelLimit: 1,
    concurrency: 2,
    timeoutMs: 8000,
    smoke: true
})
assertEqual(withSmoke.summary.chatOk, 1, 'withSmoke chatOk 1')
assertEqual(withSmoke.summary.reasoningSeen, 1, 'withSmoke reasoningSeen 1')
assertDeepEqual(withSmoke.routers[0].routes[0].modelIds, ['agnes-2.5-flash'], 'withSmoke modelIds')
assert.ok(calls >= 5, 'calls >= 5')
assert.ok(maxActive <= 2, 'maxActive <= 2')
assertEqual(JSON.stringify(withSmoke).includes('sk-secret-token'), false, 'no secret in withSmoke')

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
assertEqual(paidCatalog.routers[0].routes[0].smokeSkippedReason, 'no-free-model-candidate', 'paid catalog skipped')

// ── Sweep 2: phone-model-parity-contract.mjs ───────────────────────────────────
console.log('\n=== phone-model-parity ===')

import { buildParityManifest } from '../scripts/phone-model-parity.mjs'

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-phone-parity-'))
const laptopConfigPath = path.join(tempDir, 'laptop.json')
const phoneConfigPath = path.join(tempDir, 'phone.json')

fs.writeFileSync(
    laptopConfigPath,
    JSON.stringify({
        providers: {
            laptopAgnes: {
                api: 'openai-completions',
                baseUrl: 'http://127.0.0.1:8788/agnes/v1',
                apiKey: 'must-not-appear',
                models: [
                    { id: 'agnes-2.5-flash', name: 'Agnes', reasoning: true, contextWindow: 1000, maxTokens: 100 }
                ]
            },
            external: {
                baseUrl: 'https://example.invalid/v1',
                apiKey: 'must-not-appear-either',
                models: [{ id: 'outside-model', contextWindow: 1000 }]
            }
        }
    })
)
fs.writeFileSync(
    phoneConfigPath,
    JSON.stringify({
        providers: {
            phoneAgnes: {
                api: 'openai-completions',
                baseUrl: 'http://127.0.0.1:8789/agnes/v1',
                apiKey: 'router',
                models: [{ id: 'agnes-2.5-flash', name: 'Phone Agnes' }]
            }
        }
    })
)

const originalFetch = globalThis.fetch
globalThis.fetch = async (url) => {
    const textUrl = String(url)
    if (textUrl.endsWith('/catalog')) {
        return new Response(
            JSON.stringify({
                routes: [
                    {
                        providerId: 'agnes',
                        routePrefix: '/agnes/v1',
                        baseUrl: `${new URL(textUrl).origin}/agnes/v1`,
                        api: 'openai-completions'
                    }
                ]
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
        )
    }
    assert.match(textUrl, /127\.0\.0\.1:878[89]\/agnes\/v1\/models$/)
    return new Response(JSON.stringify({ data: [{ id: 'agnes-2.5-flash' }, { id: 'catalog-only' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
    })
}

try {
    const manifest = await buildParityManifest({
        laptopConfigPath,
        phoneConfigPath,
        laptopRouter: 'http://127.0.0.1:8788',
        phoneRouter: 'http://127.0.0.1:8789'
    })
    const serialized = JSON.stringify(manifest)
    assertEqual(serialized.includes('must-not-appear'), false, 'no laptop apiKey in manifest')
    assertEqual(serialized.includes('must-not-appear-either'), false, 'no external apiKey in manifest')
    assertEqual(manifest.parity.configuredExactIntersection.length, 1, 'exact intersection length 1')
    assertEqual(manifest.parity.configuredLaptopMissingOnPhoneCatalog.length, 1, 'laptop missing on phone length 1')
    assertEqual(manifest.phoneProjection.providers.phoneAgnes.models[0].id, 'agnes-2.5-flash', 'phone projection model')
    assertEqual(manifest.phoneProjection.providers.phoneAgnes.apiKey, 'router', 'phone projection apiKey')
    assertEqual(manifest.catalogs.laptop.find((item) => item.provider === 'external').status, 'skipped_external', 'external skipped')
} finally {
    globalThis.fetch = originalFetch
    fs.rmSync(tempDir, { recursive: true, force: true })
}

console.log(`\n=== phone-model-sweep COMPLETE ===`)
console.log(`Passed: ${passed}, Failed: ${failures}`)
if (failures === 0) { console.log('All assertions verified.'); process.exit(0) }
else { console.error(`${failures} failure(s)`); process.exit(1) }
