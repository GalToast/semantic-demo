#!/usr/bin/env node

/**
 * Verify the relationship between the canonical model catalogue and the
 * schema-pure native Pi projection. This is intentionally read-only and
 * provider-free so it can be used as a deployment/preflight gate without
 * adding work to Pi startup.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { assertSecretFree } from './build-model-catalog.mjs'
import { buildRemotePaths, validateCatalogue } from './deploy-phone-model-catalog.mjs'
import { validateProjection } from './deploy-phone-model-projection.mjs'

const DEFAULT_CATALOG = path.join('tmp', 'phone-model-parity', 'canonical-model-catalog.json')
const DEFAULT_PROJECTION = path.join('tmp', 'phone-model-parity', 'phone-models.projection.json')
const DEFAULT_ROOTFS = '/data/data/com.termux/files/usr/var/lib/proot-distro/containers/ubuntu/rootfs'
const DEFAULT_CATALOG_REMOTE_PATH = '/root/.pi/agent/model-catalog.json'
const DEFAULT_PROJECTION_REMOTE_PATH = '/root/.pi/agent/models.json'

const PROJECTION_ROOT_KEYS = new Set(['providers'])
const PROJECTION_PROVIDER_KEYS = new Set(['api', 'baseUrl', 'apiKey', 'models'])

function assertSafeToken(value, label) {
    if (!value || !/^[A-Za-z0-9._:-]+$/.test(value)) throw new Error(`${label} contains unsafe characters`)
    return value
}

function assertSafeRemotePath(value, label) {
    if (!value || !value.startsWith('/') || value.includes('..') || !/^\/[A-Za-z0-9._~\/:\-]+$/.test(value)) {
        throw new Error(`${label} must be an absolute, shell-safe path without '..'`)
    }
    return value.replace(/\/{2,}/g, '/')
}

export function parseArgs(argv = process.argv.slice(2)) {
    const options = {
        catalog: DEFAULT_CATALOG,
        projection: DEFAULT_PROJECTION,
        serial: null,
        rootfs: DEFAULT_ROOTFS,
        catalogRemotePath: DEFAULT_CATALOG_REMOTE_PATH,
        projectionRemotePath: DEFAULT_PROJECTION_REMOTE_PATH,
        adb: 'adb.exe',
        help: false
    }

    for (const arg of argv) {
        if (arg.startsWith('--catalog=')) options.catalog = arg.slice('--catalog='.length)
        else if (arg.startsWith('--projection=')) options.projection = arg.slice('--projection='.length)
        else if (arg.startsWith('--serial=')) options.serial = arg.slice('--serial='.length)
        else if (arg.startsWith('--rootfs=')) options.rootfs = arg.slice('--rootfs='.length)
        else if (arg.startsWith('--catalog-remote-path=')) options.catalogRemotePath = arg.slice('--catalog-remote-path='.length)
        else if (arg.startsWith('--projection-remote-path=')) options.projectionRemotePath = arg.slice('--projection-remote-path='.length)
        else if (arg.startsWith('--adb=')) options.adb = arg.slice('--adb='.length)
        else if (arg === '--help' || arg === '-h') options.help = true
        else throw new Error(`Unknown argument: ${arg}`)
    }

    if (options.help) return options
    if (options.serial) assertSafeToken(options.serial, 'serial')
    assertSafeRemotePath(options.rootfs, 'rootfs')
    assertSafeRemotePath(options.catalogRemotePath, 'catalog remote path')
    assertSafeRemotePath(options.projectionRemotePath, 'projection remote path')
    return options
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function hashFile(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function sortedObject(value) {
    if (Array.isArray(value)) return value.map(sortedObject)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, sortedObject(nested)]))
}

function equivalentJson(left, right) {
    return JSON.stringify(sortedObject(left)) === JSON.stringify(sortedObject(right))
}

function assertProjectionShape(projection) {
    const rootKeys = Object.keys(projection).sort()
    const expectedRootKeys = [...PROJECTION_ROOT_KEYS].sort()
    if (JSON.stringify(rootKeys) !== JSON.stringify(expectedRootKeys)) {
        throw new Error(`Projection must be schema-pure; root keys are ${rootKeys.join(', ') || '<none>'}, expected providers`)
    }

    for (const [provider, config] of Object.entries(projection.providers)) {
        if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error(`Provider ${provider} has an invalid config`)
        const extraKeys = Object.keys(config).filter((key) => !PROJECTION_PROVIDER_KEYS.has(key))
        if (extraKeys.length) throw new Error(`Provider ${provider} has non-native projection keys: ${extraKeys.join(', ')}`)
    }
}

function phoneDispatchKey(provider, modelId) {
    return `${provider}\u0000${modelId}`
}

function expectedDispatchRecords(catalog) {
    const records = catalog.models.filter((model) => model.phoneDispatch && typeof model.phoneDispatch === 'object')
    const invalid = records.filter((model) => model.phoneDispatch.catalogVisible !== true)
    if (invalid.length) throw new Error(`Catalogue contains ${invalid.length} dispatch records that are not catalog-visible`)

    const routesByModel = new Map()
    for (const model of records) {
        const dispatch = model.phoneDispatch
        const identity = phoneDispatchKey(dispatch.provider, model.id)
        const route = `${dispatch.route}\u0000${dispatch.baseUrl || ''}`
        const routes = routesByModel.get(identity) || new Set()
        routes.add(route)
        routesByModel.set(identity, routes)
    }
    const ambiguous = [...routesByModel].filter(([, routes]) => routes.size > 1)
    if (ambiguous.length) {
        const examples = ambiguous.slice(0, 3).map(([identity]) => identity.replace('\u0000', '/')).join(', ')
        throw new Error(`Catalogue contains ambiguous phone dispatch routes for ${ambiguous.length} provider/model identities${examples ? ` (${examples})` : ''}`)
    }
    return records
}

function expectedDispatchEntries(dispatchRecords) {
    return new Set(dispatchRecords.map((model) => phoneDispatchKey(model.phoneDispatch.provider, model.id)))
}

function actualProjectionEntries(projection) {
    const entries = new Set()
    for (const [provider, config] of Object.entries(projection.providers)) {
        for (const model of config.models || []) entries.add(phoneDispatchKey(provider, model.id))
    }
    return entries
}

function sortedDifference(left, right) {
    return [...left].filter((value) => !right.has(value)).sort()
}

export function validateAuthority(catalog, projection) {
    const catalogSummary = validateCatalogue(catalog)
    const projectionSummary = validateProjection(projection)
    assertSecretFree(projection)
    assertProjectionShape(projection)

    if (!equivalentJson(catalog.phoneProjection, projection)) {
        throw new Error('Projection file does not match catalog.phoneProjection; rebuild the canonical catalogue before deploying')
    }

    const dispatchRecords = expectedDispatchRecords(catalog)
    const expected = expectedDispatchEntries(dispatchRecords)
    const actual = actualProjectionEntries(projection)
    const missing = sortedDifference(expected, actual)
    const stale = sortedDifference(actual, expected)
    if (missing.length || stale.length) {
        const details = [
            missing.length ? `missing ${missing.length} dispatch entries` : '',
            stale.length ? `stale ${stale.length} projection entries` : ''
        ].filter(Boolean).join('; ')
        throw new Error(`Projection/catalog dispatch drift: ${details}`)
    }

    if (catalog.summary?.phoneDispatchableModelCount !== dispatchRecords.length) {
        throw new Error(`Catalogue summary phoneDispatchableModelCount=${catalog.summary?.phoneDispatchableModelCount} does not match ${dispatchRecords.length} dispatch records`)
    }
    if (catalog.summary?.phoneProjectionModelCount !== expected.size) {
        throw new Error(`Catalogue summary phoneProjectionModelCount=${catalog.summary?.phoneProjectionModelCount} does not match ${expected.size} unique picker entries`)
    }
    if (catalog.summary?.phoneProjectionModelCount !== projectionSummary.modelCount) {
        throw new Error(`Catalogue summary phoneProjectionModelCount=${catalog.summary?.phoneProjectionModelCount} does not match ${projectionSummary.modelCount}`)
    }

    return {
        catalog: catalogSummary,
        projection: projectionSummary,
        dispatchRecordCount: dispatchRecords.length,
        dispatchEntryCount: expected.size,
        providerCount: projectionSummary.providerCount,
        projectionMatchesCanonical: true
    }
}

function scrub(value) {
    return String(value || '')
        .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer <redacted>')
        .replace(/(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}/gi, '<redacted-key>')
        .replace(/AIza[A-Za-z0-9_-]{20,}/gi, '<redacted-key>')
        .replace(/gh[pousr]_[A-Za-z0-9_-]{20,}/gi, '<redacted-key>')
        .replace(/xox[baprs]-[A-Za-z0-9-]{20,}/gi, '<redacted-key>')
        .replace(/([?&](?:key|token|api_key|apikey|secret)=)[^&\s]+/gi, '$1<redacted>')
        .slice(0, 400)
}

function parseHash(output) {
    const match = String(output).trim().match(/^([a-f0-9]{64})\s+/i)
    return match ? match[1].toLowerCase() : null
}

function runCommand(adb, args) {
    const result = spawnSync(adb, args, { encoding: 'utf8', maxBuffer: 200000 })
    if (result.error || result.status !== 0) throw new Error(scrub(result.stderr || result.error?.message || `adb exited ${result.status}`))
    return result.stdout || ''
}

export function verifyRemoteHashes({ options, catalogHash, projectionHash, runner = runCommand }) {
    if (!options.serial) return null
    const paths = buildRemotePaths({
        rootfs: options.rootfs,
        catalogRemotePath: options.catalogRemotePath,
        projectionRemotePath: options.projectionRemotePath,
        serial: options.serial,
        suffix: 'verify'
    })
    const adb = (args) => runner(options.adb, args)
    const state = adb(['-s', options.serial, 'get-state']).trim()
    if (state !== 'device') throw new Error(`ADB device ${options.serial} is not ready: ${scrub(state)}`)
    const remoteCatalogHash = parseHash(adb(['-s', options.serial, 'shell', 'su', '-c', `sha256sum ${paths.catalog.dest}`]))
    const remoteProjectionHash = parseHash(adb(['-s', options.serial, 'shell', 'su', '-c', `sha256sum ${paths.projection.dest}`]))
    if (remoteCatalogHash !== catalogHash || remoteProjectionHash !== projectionHash) {
        throw new Error(`Remote catalogue drift: catalog ${remoteCatalogHash || '<unparseable>'}, projection ${remoteProjectionHash || '<unparseable>'}`)
    }
    return { serial: options.serial, catalogHash: remoteCatalogHash, projectionHash: remoteProjectionHash, matched: true }
}

export function verifyFiles({ catalogPath, projectionPath, serial = null, options = {}, runner } = {}) {
    const catalog = readJson(catalogPath)
    const projection = readJson(projectionPath)
    const authority = validateAuthority(catalog, projection)
    const catalogHash = hashFile(catalogPath)
    const projectionHash = hashFile(projectionPath)
    const remote = serial ? verifyRemoteHashes({ options: { ...options, serial }, catalogHash, projectionHash, runner }) : null
    return {
        catalogPath: path.resolve(catalogPath),
        projectionPath: path.resolve(projectionPath),
        catalogHash,
        projectionHash,
        authority,
        remote
    }
}

async function main() {
    const options = parseArgs()
    if (options.help) {
        console.log('Usage: node scripts/verify-model-catalog.mjs [--catalog=PATH] [--projection=PATH] [--serial=ADB_SERIAL] [--rootfs=PHONE_ROOTFS]')
        return
    }

    const result = verifyFiles({
        catalogPath: options.catalog,
        projectionPath: options.projection,
        serial: options.serial,
        options,
    })
    console.log(JSON.stringify(result, null, 2))
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null
if (invokedPath === import.meta.url) main().catch((error) => {
    console.error(error?.stack || error)
    process.exitCode = 1
})
