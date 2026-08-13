#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseArgs, validateAuthority, verifyRemoteHashes } from '../scripts/verify-model-catalog.mjs'

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-model-authority-'))
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
    assert.deepEqual(parseArgs([]), {
        catalog: path.join('tmp', 'phone-model-parity', 'canonical-model-catalog.json'),
        projection: path.join('tmp', 'phone-model-parity', 'phone-models.projection.json'),
        serial: null,
        rootfs: '/data/data/com.termux/files/usr/var/lib/proot-distro/containers/ubuntu/rootfs',
        catalogRemotePath: '/root/.pi/agent/model-catalog.json',
        projectionRemotePath: '/root/.pi/agent/models.json',
        adb: 'adb.exe',
        help: false
    })
    assert.throws(() => parseArgs(['--serial=bad;serial']), /unsafe/)
    assert.deepEqual(validateAuthority(catalog, projection), {
        catalog: { modelCount: 3, routeCount: 1, phoneDispatchableModelCount: 2 },
        projection: { providerCount: 1, modelCount: 1 },
        dispatchRecordCount: 2,
        dispatchEntryCount: 1,
        providerCount: 1,
        projectionMatchesCanonical: true
    })

    assert.throws(
        () => validateAuthority(catalog, { ...projection, summary: { modelCount: 1 } }),
        /schema-pure|root keys/
    )
    assert.throws(
        () => validateAuthority(catalog, { providers: { logfare: { ...provider, models: [] } } }),
        /Projection\/catalog dispatch drift|does not match/
    )
    assert.throws(
        () => validateAuthority({
            ...catalog,
            models: catalog.models.map((model, index) => index === 1
                ? { ...model, phoneDispatch: { ...model.phoneDispatch, route: 'local:127.0.0.1:/logfare-alias/v1' } }
                : model)
        }, projection),
        /ambiguous phone dispatch routes/
    )
    assert.throws(
        () => validateAuthority({
            ...catalog,
            models: catalog.models.map((model, index) => index === 0
                ? { ...model, phoneDispatch: { ...model.phoneDispatch, catalogVisible: false } }
                : model)
        }, projection),
        /not catalog-visible/
    )
    assert.throws(
        () => validateAuthority({ ...catalog, summary: { ...catalog.summary, phoneDispatchableModelCount: 3 } }, projection),
        /phoneDispatchableModelCount/
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
    assert.equal(remoteResult.matched, true)
    assert.equal(remoteCalls.length, 3)
    assert.equal(remoteCalls.some(({ args }) => args.includes('rm')), false)
    console.log('verify-model-catalog contract: ok')
} finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
}
