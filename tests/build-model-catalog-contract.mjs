#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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

    assert.equal(manifest.policy.secretFree, true)
    assert.equal(manifest.summary.sourceRecordCount, 2)
    assert.equal(manifest.summary.uniqueRouteModelCount, 2)
    assert.equal(manifest.summary.phoneDispatchableModelCount, 1)
    assert.equal(manifest.summary.phoneProjectionModelCount, 1)
    assert.equal(manifest.models.filter((model) => model.id === 'deepseek-v4-flash').length, 2)

    const phoneProvider = manifest.phoneProjection.providers.logfare
    assert.ok(phoneProvider)
    assert.equal(phoneProvider.apiKey, 'router')
    assert.equal(phoneProvider.baseUrl, 'http://127.0.0.1:8789/logfare/v1')
    assert.deepEqual(phoneProvider.models.map((model) => model.id), ['deepseek-v4-flash'])
    assert.equal(phoneProvider.models[0].cost, undefined)

    const directModel = manifest.models.find((model) => model.network === 'external')
    assert.ok(directModel)
    assert.equal(directModel.phoneDispatch, null)
    assert.equal(directModel.metadata.credentialEnv, undefined)

    assert.doesNotThrow(() => assertSecretFree(manifest))
    assert.equal(JSON.stringify(manifest).includes('must-not-be-copied'), false)
    console.log('build-model-catalog contract: ok')
} finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
}
