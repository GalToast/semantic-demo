import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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
    assert.equal(serialized.includes('must-not-appear'), false)
    assert.equal(serialized.includes('must-not-appear-either'), false)
    assert.equal(manifest.parity.configuredExactIntersection.length, 1)
    assert.equal(manifest.parity.configuredLaptopMissingOnPhoneCatalog.length, 1)
    assert.equal(manifest.phoneProjection.providers.phoneAgnes.models[0].id, 'agnes-2.5-flash')
    assert.equal(manifest.phoneProjection.providers.phoneAgnes.apiKey, 'router')
    assert.equal(manifest.catalogs.laptop.find((item) => item.provider === 'external').status, 'skipped_external')
} finally {
    globalThis.fetch = originalFetch
    fs.rmSync(tempDir, { recursive: true, force: true })
}

console.log('phone-model-parity-contract: ok')
