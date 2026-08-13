#!/usr/bin/env node

import assert from 'node:assert/strict'
import {
    buildPlan,
    buildRemotePaths,
    parseArgs,
    validateCatalogue
} from '../scripts/deploy-phone-model-catalog.mjs'

const options = parseArgs([
    '--catalog=tmp/catalog.json',
    '--projection=tmp/projection.json',
    '--serial=77aeb8a8',
    '--suffix=contract'
])
assert.equal(options.dryRun, true)
assert.equal(options.apply, false)

const catalog = {
    schemaVersion: 2,
    policy: { secretFree: true },
    models: [{ id: 'logfare/deepseek-v4-flash' }],
    routes: [{ route: 'local:127.0.0.1:/logfare/v1' }],
    summary: { phoneDispatchableModelCount: 1 },
    phoneProjection: { providers: { logfare: { apiKey: 'router', models: [] } } }
}
assert.deepEqual(validateCatalogue(catalog), { modelCount: 1, routeCount: 1, phoneDispatchableModelCount: 1 })
assert.throws(() => validateCatalogue({ ...catalog, phoneProjection: { apiKey: 'secret-value' } }), /secret-free|Credential-bearing|phoneProjection/)

const paths = buildRemotePaths(options)
assert.equal(paths.catalog.dest.endsWith('/root/.pi/agent/model-catalog.json'), true)
assert.equal(paths.projection.dest.endsWith('/root/.pi/agent/models.json'), true)
assert.equal(paths.catalog.staging.includes('77aeb8a8-contract'), true)

const plan = buildPlan({
    options,
    paths,
    catalogHash: 'a'.repeat(64),
    projectionHash: 'b'.repeat(64),
    catalogSummary: { modelCount: 1 },
    projectionSummary: { modelCount: 1 }
})
assert.equal(plan.some((step) => step.name === 'replace-catalogue' && step.mutates), true)
assert.equal(plan.some((step) => step.name === 'replace-projection' && step.mutates), true)
assert.equal(plan.at(-1).catalogHash, 'a'.repeat(64))
console.log('deploy-phone-model-catalog contract: ok')
