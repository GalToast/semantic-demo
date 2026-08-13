import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { adbArgs, buildPlan, buildRemotePaths, buildSuArgs, parseArgs, validateProjection } from '../scripts/deploy-phone-model-projection.mjs'

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-phone-deploy-'))
const projectionPath = path.join(tempDir, 'projection.json')
const safeProjection = { providers: { phoneAgnes: { apiKey: 'router', baseUrl: 'http://127.0.0.1:8789/agnes/v1', models: [{ id: 'agnes-2.5-flash' }] } } }
fs.writeFileSync(projectionPath, JSON.stringify(safeProjection))

assert.equal(parseArgs([`--projection=${projectionPath}`, '--serial=77aeb8a8']).dryRun, true)
assert.equal(parseArgs([`--projection=${projectionPath}`, '--serial=77aeb8a8', '--apply']).apply, true)
assert.throws(() => parseArgs([`--projection=${projectionPath}`, '--serial=bad;serial']), /unsafe/)
assert.throws(() => validateProjection({ providers: { bad: { apiKey: 'sk-secret', baseUrl: 'http://127.0.0.1:8789/v1', models: [] } } }), /secret-free policy/)
assert.throws(() => validateProjection({ providers: { external: { apiKey: 'router', baseUrl: 'https://example.invalid/v1', models: [] } } }), /external baseUrl/)
assert.equal(validateProjection(safeProjection).modelCount, 1)

const options = parseArgs([`--projection=${projectionPath}`, '--serial=77aeb8a8', '--suffix=test'])
const paths = buildRemotePaths(options)
assert.match(paths.dest, /root\/\.pi\/agent\/models\.json$/)
assert.match(paths.staging, /semantic-explorer-77aeb8a8-test\.json$/)
assert.ok(adbArgs(options.serial, ['get-state']).includes('77aeb8a8'))
assert.ok(buildSuArgs(options.serial, `sha256sum ${paths.dest}`).includes('77aeb8a8'))

const plan = buildPlan({ options, paths, localHash: 'a'.repeat(64), summary: { providerCount: 1, modelCount: 1 } })
assert.ok(plan.every((step) => step.execute === false))
assert.ok(plan.some((step) => step.name === 'atomic-replace' && step.mutates))
assert.equal(JSON.stringify(plan).includes('sk-secret'), false)

fs.rmSync(tempDir, { recursive: true, force: true })
console.log('deploy-phone-model-projection-contract: ok')
