#!/usr/bin/env node
/**
 * model-catalog-sweep.mjs
 *
 * Consolidated catalog build + verify contracts — replaces
 * build-model-catalog-contract.mjs (130 LOC) + verify-model-catalog-contract.mjs (126 LOC).
 *
 * Run: node tests/model-catalog-sweep.mjs
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

// ── Sweep 1: build-model-catalog-contract.mjs ──────────────────────────────────
console.log('\n=== build-model-catalog ===')

import {
    assertSecretFree,
    buildCatalogueFromInputs,
    loadSources
} from '../scripts/build-model-catalog.mjs'

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-model-catalog-'))
try {
    const qwenPath = path.join(tempDir, 'settings.json')
    fs.writeFileSync(
        qwenPath,
        JSON.stringify({
            modelProviders: {
                openai: [
                    {
                        id: 'deepseek-v4-flash',
                        name: 'DeepSeek V4 Flash',
                        provider: 'logfare',
                        baseUrl: 'http://127.0.0.1:8788/logfare/v1',
                        envKey: 'LOGFARE_API_KEY',
                        reasoning: true,
                        supportsVision: true,
                        contextWindow: 1000000,
                        cost: {
                            input: 0.2,
                            output: 0.8,
                            cacheRead: null,
                            cacheWrite: null
                        }
                    }
                ]
            }
        })
    )

    const directPath = path.join(tempDir, 'opencode.json')
    fs.writeFileSync(
        directPath,
        JSON.stringify({
            provider: {
                freeinference: {
                    models: {
                        'deepseek-v4-flash': {
                            name: 'Direct DeepSeek V4 Flash',
                            reasoning: true
                        }
                    },
                    options: {
                        baseURL: 'https://freeinference.org/v1',
                        apiKey: 'must-not-be-copied'
                    }
                }
            }
        })
    )

    const sources = loadSources([
        { id: 'qwen-fixture', label: 'Qwen fixture', kind: 'model-providers', filePath: qwenPath },
        { id: 'opencode-fixture', label: 'OpenCode fixture', kind: 'opencode', filePath: directPath }
    ])

    const laptopLive = {
        label: 'laptop',
        status: 'catalog_visible',
        routes: [
            {
                provider: 'logfare',
                api: 'openai-completions',
                baseUrl: 'http://127.0.0.1:8788/logfare/v1',
                path: '/logfare/v1',
                route: 'local:127.0.0.1:/logfare/v1',
                status: 'catalog_visible',
                modelIds: ['deepseek-v4-flash']
            }
        ]
    }
    const phoneLive = {
        label: 'phone',
        status: 'catalog_visible',
        routes: [
            {
                provider: 'logfare',
                api: 'openai-completions',
                baseUrl: 'http://127.0.0.1:18789/logfare/v1',
                path: '/logfare/v1',
                route: 'local:127.0.0.1:/logfare/v1',
                status: 'catalog_visible',
                modelIds: ['deepseek-v4-flash']
            }
        ]
    }

    const manifest = buildCatalogueFromInputs({
        sources,
        laptopLive,
        phoneLive,
        phoneDeviceRouter: 'http://127.0.0.1:8789'
    })

    assertEqual(manifest.policy.secretFree, true, 'policy secretFree')
    assertEqual(manifest.summary.sourceRecordCount, 2, 'sourceRecordCount 2')
    assertEqual(manifest.summary.uniqueRouteModelCount, 2, 'uniqueRouteModelCount 2')
    assertEqual(manifest.summary.phoneDispatchableModelCount, 1, 'phoneDispatchableModelCount 1')
    assertEqual(manifest.summary.phoneProjectionModelCount, 1, 'phoneProjectionModelCount 1')
    assert.equal(manifest.models.filter((model) => model.id === 'deepseek-v4-flash').length, 2, 'deepseek-v4-flash count 2')

    const phoneProvider = manifest.phoneProjection.providers.logfare
    assert.ok(phoneProvider, 'phoneProjection has logfare provider')
    assertEqual(phoneProvider.apiKey, 'router', 'phone provider apiKey router')
    assertEqual(phoneProvider.baseUrl, 'http://127.0.0.1:8789/logfare/v1', 'phone provider baseUrl')
    assertDeepEqual(phoneProvider.models.map((model) => model.id), ['deepseek-v4-flash'], 'phone models')
    assertEqual(phoneProvider.models[0].cost, undefined, 'phone model cost undefined')

    const directModel = manifest.models.find((model) => model.network === 'external')
    assert.ok(directModel, 'external model exists')
    assertEqual(directModel.phoneDispatch, null, 'external model no phoneDispatch')
    assertEqual(directModel.metadata.credentialEnv, undefined, 'external model no credentialEnv')

    assert.doesNotThrow(() => assertSecretFree(manifest), 'assertSecretFree passes')
    assertEqual(JSON.stringify(manifest).includes('must-not-be-copied'), false, 'no secret in manifest')
    pass('build-model-catalog contract')
} finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
}

// ── Sweep 2: verify-model-catalog-contract.mjs ─────────────────────────────────
console.log('\n=== verify-model-catalog ===')

import { parseArgs, validateAuthority, verifyRemoteHashes } from '../scripts/verify-model-catalog.mjs'

const tempDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-model-authority-'))
const provider = {
    api: 'openai-completions',
    baseUrl: 'http://127.0.0.1:8789/logfare/v1',
    apiKey: 'router',
    models: [{ id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' }]
}
const projection = { providers: { logfare: provider } }
const catalog = {
    schemaVersion: 2,
    policy: { secretFree: true },
    models: [
        {
            id: 'deepseek-v4-flash',
            phoneDispatch: {
                provider: 'logfare',
                route: 'local:127.0.0.1:/logfare/v1',
                baseUrl: provider.baseUrl,
                match: 'path',
                catalogVisible: true
            }
        },
        {
            id: 'deepseek-v4-flash',
            phoneDispatch: {
                provider: 'logfare',
                route: 'local:127.0.0.1:/logfare/v1',
                baseUrl: provider.baseUrl,
                match: 'provider',
                catalogVisible: true
            }
        },
        { id: 'laptop-only-model', phoneDispatch: null }
    ],
    routes: [{ route: 'local:127.0.0.1:/logfare/v1' }],
    summary: {
        phoneDispatchableModelCount: 2,
        phoneProjectionModelCount: 1
    },
    phoneProjection: projection
}

try {
    assertDeepEqual(parseArgs([]), {
        catalog: path.join('tmp', 'phone-model-parity', 'canonical-model-catalog.json'),
        projection: path.join('tmp', 'phone-model-parity', 'phone-models.projection.json'),
        serial: null,
        rootfs: '/data/data/com.termux/files/usr/var/lib/proot-distro/containers/ubuntu/rootfs',
        catalogRemotePath: '/root/.pi/agent/model-catalog.json',
        projectionRemotePath: '/root/.pi/agent/models.json',
        adb: 'adb.exe',
        help: false
    }, 'parseArgs default')
    assertThrows(() => parseArgs(['--serial=bad;serial']), /unsafe/, 'unsafe serial rejected')

    assertDeepEqual(validateAuthority(catalog, projection), {
        catalog: { modelCount: 3, routeCount: 1, phoneDispatchableModelCount: 2 },
        projection: { providerCount: 1, modelCount: 1 },
        dispatchRecordCount: 2,
        dispatchEntryCount: 1,
        providerCount: 1,
        projectionMatchesCanonical: true
    }, 'validateAuthority happy path')

    assertThrows(
        () => validateAuthority(catalog, { ...projection, summary: { modelCount: 1 } }),
        /schema-pure|root keys/,
        'schema-pure validation'
    )
    assertThrows(
        () => validateAuthority(catalog, { providers: { logfare: { ...provider, models: [] } } }),
        /Projection\/catalog dispatch drift|does not match/,
        'dispatch drift detected'
    )
    assertThrows(
        () => validateAuthority({
            ...catalog,
            models: catalog.models.map((model, index) => index === 1
                ? { ...model, phoneDispatch: { ...model.phoneDispatch, route: 'local:127.0.0.1:/logfare-alias/v1' } }
                : model)
        }, projection),
        /ambiguous phone dispatch routes/,
        'ambiguous routes rejected'
    )
    assertThrows(
        () => validateAuthority({
            ...catalog,
            models: catalog.models.map((model, index) => index === 0
                ? { ...model, phoneDispatch: { ...model.phoneDispatch, catalogVisible: false } }
                : model)
        }, projection),
        /not catalog-visible/,
        'non-catalog-visible rejected'
    )
    assertThrows(
        () => validateAuthority({ ...catalog, summary: { ...catalog.summary, phoneDispatchableModelCount: 3 } }, projection),
        /phoneDispatchableModelCount/,
        'mismatched dispatch count rejected'
    )

    const remoteCalls = []
    const remoteResult = verifyRemoteHashes({
        options: {
            serial: '77aeb8a8',
            adb: 'adb.exe',
            rootfs: '/data/data/com.termux/files/usr/var/lib/proot-distro/containers/ubuntu/rootfs',
            catalogRemotePath: '/root/.pi/agent/model-catalog.json',
            projectionRemotePath: '/root/.pi/agent/models.json'
        },
        catalogHash: 'a'.repeat(64),
        projectionHash: 'b'.repeat(64),
        runner: (adb, args) => {
            remoteCalls.push({ adb, args })
            if (args.join(' ') === '-s 77aeb8a8 get-state') return 'device\n'
            return args.join(' ').includes('model-catalog.json') ? `${'a'.repeat(64)}  remote\n` : `${'b'.repeat(64)}  remote\n`
        }
    })
    assertEqual(remoteResult.matched, true, 'remote hashes matched')
    assertEqual(remoteCalls.length, 3, '3 remote calls')
    assertEqual(remoteCalls.some(({ args }) => args.includes('rm')), false, 'no rm calls')
    pass('verify-model-catalog contract')
} finally {
    fs.rmSync(tempDir2, { recursive: true, force: true })
}

console.log(`\n=== model-catalog-sweep COMPLETE ===`)
console.log(`Passed: ${passed}, Failed: ${failures}`)
if (failures === 0) { console.log('All assertions verified.'); process.exit(0) }
else { console.error(`${failures} failure(s)`); process.exit(1) }
