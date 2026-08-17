#!/usr/bin/env node
/**
 * deploy-sweep.mjs
 *
 * Consolidated deploy contracts — replaces
 * deploy-phone-model-catalog-contract.mjs (47 LOC) + deploy-phone-model-projection-contract.mjs (32 LOC).
 *
 * Run: node tests/deploy-sweep.mjs
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

// ── Sweep 1: deploy-phone-model-catalog-contract.mjs ───────────────────────────
console.log('\n=== deploy-phone-model-catalog ===')

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
assertEqual(options.dryRun, true, 'dryRun true')
assertEqual(options.apply, false, 'apply false')

const catalog = {
    schemaVersion: 2,
    policy: { secretFree: true },
    models: [{ id: 'logfare/deepseek-v4-flash' }],
    routes: [{ route: 'local:127.0.0.1:/logfare/v1' }],
    summary: { phoneDispatchableModelCount: 1 },
    phoneProjection: { providers: { logfare: { apiKey: 'router', models: [] } } }
}
assertDeepEqual(validateCatalogue(catalog), { modelCount: 1, routeCount: 1, phoneDispatchableModelCount: 1 }, 'validateCatalogue happy')
assertThrows(() => validateCatalogue({ ...catalog, phoneProjection: { apiKey: 'secret-value' } }), /secret-free|Credential-bearing|phoneProjection/, 'secret in phoneProjection rejected')

const paths = buildRemotePaths(options)
assert.ok(paths.catalog.dest.endsWith('/root/.pi/agent/model-catalog.json'), 'catalog dest path')
assert.ok(paths.projection.dest.endsWith('/root/.pi/agent/models.json'), 'projection dest path')
assert.ok(paths.catalog.staging.includes('77aeb8a8-contract'), 'staging includes serial-suffix')

const plan = buildPlan({
    options,
    paths,
    catalogHash: 'a'.repeat(64),
    projectionHash: 'b'.repeat(64),
    catalogSummary: { modelCount: 1 },
    projectionSummary: { modelCount: 1 }
})
assert.ok(plan.some((step) => step.name === 'replace-catalogue' && step.mutates), 'replace-catalogue mutates')
assert.ok(plan.some((step) => step.name === 'replace-projection' && step.mutates), 'replace-projection mutates')
assertEqual(plan.at(-1).catalogHash, 'a'.repeat(64), 'final catalogHash')
pass('deploy-phone-model-catalog contract')

// ── Sweep 2: deploy-phone-model-projection-contract.mjs ────────────────────────
console.log('\n=== deploy-phone-model-projection ===')

import { adbArgs, buildPlan as buildProjectionPlan, buildRemotePaths as buildProjectionPaths, buildSuArgs, parseArgs as parseProjectionArgs, validateProjection } from '../scripts/deploy-phone-model-projection.mjs'

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-phone-deploy-'))
const projectionPath = path.join(tempDir, 'projection.json')
const safeProjection = { providers: { phoneAgnes: { apiKey: 'router', baseUrl: 'http://127.0.0.1:8789/agnes/v1', models: [{ id: 'agnes-2.5-flash' }] } } }
fs.writeFileSync(projectionPath, JSON.stringify(safeProjection))

assertEqual(parseProjectionArgs([`--projection=${projectionPath}`, '--serial=77aeb8a8']).dryRun, true, 'projection dryRun')
assertEqual(parseProjectionArgs([`--projection=${projectionPath}`, '--serial=77aeb8a8', '--apply']).apply, true, 'projection apply')
assertThrows(() => parseProjectionArgs([`--projection=${projectionPath}`, '--serial=bad;serial']), /unsafe/, 'unsafe serial rejected')
assertThrows(() => validateProjection({ providers: { bad: { apiKey: 'sk-secret', baseUrl: 'http://127.0.0.1:8789/v1', models: [] } } }), /secret-free policy/, 'secret in projection rejected')
assertThrows(() => validateProjection({ providers: { external: { apiKey: 'router', baseUrl: 'https://example.invalid/v1', models: [] } } }), /external baseUrl/, 'external baseUrl rejected')
assertEqual(validateProjection(safeProjection).modelCount, 1, 'safe projection modelCount 1')

const projOptions = parseProjectionArgs([`--projection=${projectionPath}`, '--serial=77aeb8a8', '--suffix=test'])
const projPaths = buildProjectionPaths(projOptions)
assert.match(projPaths.dest, /root\/\.pi\/agent\/models\.json$/, 'projection dest match')
assert.match(projPaths.staging, /semantic-explorer-77aeb8a8-test\.json$/, 'projection staging match')
assert.ok(adbArgs(projOptions.serial, ['get-state']).includes('77aeb8a8'), 'adbArgs includes serial')
assert.ok(buildSuArgs(projOptions.serial, `sha256sum ${projPaths.dest}`).includes('77aeb8a8'), 'buildSuArgs includes serial')

const projPlan = buildProjectionPlan({ options: projOptions, paths: projPaths, localHash: 'a'.repeat(64), summary: { providerCount: 1, modelCount: 1 } })
assert.ok(projPlan.every((step) => step.execute === false), 'all steps not execute (dry run)')
assert.ok(projPlan.some((step) => step.name === 'atomic-replace' && step.mutates), 'atomic-replace mutates')
assertEqual(JSON.stringify(projPlan).includes('sk-secret'), false, 'no secret in plan')

fs.rmSync(tempDir, { recursive: true, force: true })
pass('deploy-phone-model-projection contract')

console.log(`\n=== deploy-sweep COMPLETE ===`)
console.log(`Passed: ${passed}, Failed: ${failures}`)
if (failures === 0) { console.log('All assertions verified.'); process.exit(0) }
else { console.error(`${failures} failure(s)`); process.exit(1) }
