#!/usr/bin/env node
/**
 * model-capability-status-sweep.mjs
 *
 * Consolidated capability-status contract — replaces
 * model-capability-status-contract.mjs (100 LOC → ~80 LOC).
 *
 * Run: node tests/model-capability-status-sweep.mjs
 */

'use strict'

import assert from 'node:assert/strict'
import { buildCapabilityStatus, markdownReport } from '../scripts/build-model-capability-status.mjs'

let failures = 0
let passed = 0

function pass(msg) { passed++; console.log(`  ✓ ${msg}`) }
function fail(msg) { failures++; console.error(`  ✗ ${msg}`) }
function assertEqual(actual, expected, msg) {
    if (actual !== expected) { fail(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`) }
    else { pass(msg) }
}

const catalog = {
    schemaVersion: 2,
    generatedAt: '2026-08-13T12:00:00.000Z',
    models: [
        {
            id: 'alpha',
            provider: 'openai',
            path: '/kilo/v1',
            metadata: {
                name: 'Alpha',
                reasoning: true,
                supportsVision: false,
                supportsTools: true,
                input: ['text'],
                thinkingLevelMap: { high: 'high', max: 'max' },
                metadataSource: 'fixture'
            },
            laptopCatalogVisible: true,
            phoneDispatch: null
        },
        {
            id: 'beta',
            provider: 'openai',
            path: '/kilo/v1',
            metadata: { name: 'Beta', supportsVision: true, input: ['text', 'image'] },
            laptopCatalogVisible: true,
            phoneDispatch: null
        },
        {
            id: 'gamma',
            provider: 'openai',
            path: '/missing/v1',
            metadata: { name: 'Gamma' },
            laptopCatalogVisible: false,
            phoneDispatch: null
        }
    ]
}

const health = {
    schemaVersion: 1,
    generatedAt: '2026-08-13T12:01:00.000Z',
    routers: [
        {
            name: 'laptop',
            routes: [
                {
                    provider: 'kilo',
                    route: '/kilo/v1',
                    status: 'catalog_visible',
                    statusCode: 200,
                    modelIds: ['alpha', 'beta'],
                    smoke: [
                        { model: 'alpha', status: 'chat_ok', statusCode: 200, elapsedMs: 12, toolEvidence: true, reasoningSeen: true },
                        { model: 'beta', status: 'cooldown', statusCode: 429, elapsedMs: 9, error: 'cooldown' }
                    ]
                }
            ]
        }
    ]
}

const status = buildCapabilityStatus({
    catalog,
    health,
    visionEvidence: {
        entries: [
            {
                target: 'laptop',
                route: '/kilo/v1',
                modelId: 'beta',
                capabilities: { vision: { status: 'vision-proven', observedAt: '2026-08-13T12:02:00.000Z' } }
            }
        ]
    }
})

const alpha = status.entries.find((entry) => entry.modelId === 'alpha').targets[0].capabilities
const beta = status.entries.find((entry) => entry.modelId === 'beta').targets[0].capabilities
const gamma = status.entries.find((entry) => entry.modelId === 'gamma')

assertEqual(alpha.catalog.status, 'catalog-visible', 'alpha catalog')
assertEqual(alpha.chat.status, 'chat-proven', 'alpha chat')
assertEqual(alpha.tool.status, 'tool-proven', 'alpha tool')
assertEqual(alpha.vision.status, 'not-tested', 'alpha vision')
assertEqual(beta.catalog.status, 'catalog-visible', 'beta catalog')
assertEqual(beta.chat.status, 'cooldown', 'beta chat')
assertEqual(beta.tool.status, 'not-tested', 'beta tool')
assertEqual(beta.vision.status, 'vision-proven', 'beta vision')
assert.deepEqual(gamma.targets, [], 'gamma no targets')
assertEqual(status.policy.nativePickerSchemaUnchanged, true, 'policy nativePickerSchemaUnchanged')
assertEqual(status.policy.noProviderCalls, true, 'policy noProviderCalls')
assertEqual(JSON.stringify(status).includes('toolEvidence'), false, 'no toolEvidence in JSON')
assertEqual(JSON.stringify(status).includes('sk-'), false, 'no sk- in JSON')
assert.match(markdownReport(status), /Catalog visibility is discovery evidence only/, 'markdown report matches')

console.log(`\n=== model-capability-status-sweep COMPLETE ===`)
console.log(`Passed: ${passed}, Failed: ${failures}`)
if (failures === 0) { console.log('All assertions verified.'); process.exit(0) }
else { console.error(`${failures} failure(s)`); process.exit(1) }
