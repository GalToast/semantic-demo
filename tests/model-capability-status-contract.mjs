import assert from 'node:assert/strict'
import { buildCapabilityStatus, markdownReport } from '../scripts/build-model-capability-status.mjs'

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

assert.equal(alpha.catalog.status, 'catalog-visible')
assert.equal(alpha.chat.status, 'chat-proven')
assert.equal(alpha.tool.status, 'tool-proven')
assert.equal(alpha.vision.status, 'not-tested')
assert.equal(beta.catalog.status, 'catalog-visible')
assert.equal(beta.chat.status, 'cooldown')
assert.equal(beta.tool.status, 'not-tested')
assert.equal(beta.vision.status, 'vision-proven')
assert.deepEqual(gamma.targets, [])
assert.equal(status.policy.nativePickerSchemaUnchanged, true)
assert.equal(status.policy.noProviderCalls, true)
assert.equal(JSON.stringify(status).includes('toolEvidence'), false)
assert.equal(JSON.stringify(status).includes('sk-'), false)
assert.match(markdownReport(status), /Catalog visibility is discovery evidence only/)

console.log('model-capability-status-contract: ok')
