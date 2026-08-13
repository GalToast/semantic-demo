#!/usr/bin/env node

/**
 * Deploy the canonical catalogue and its phone Pi projection as one guarded
 * update. The phone target is the physical Ubuntu proot rootfs, not Termux's
 * separate home directory.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { assertSecretFree } from './build-model-catalog.mjs'
import { validateProjection } from './deploy-phone-model-projection.mjs'

const DEFAULT_ROOTFS = '/data/data/com.termux/files/usr/var/lib/proot-distro/containers/ubuntu/rootfs'
const DEFAULT_CATALOG_REMOTE_PATH = '/root/.pi/agent/model-catalog.json'
const DEFAULT_PROJECTION_REMOTE_PATH = '/root/.pi/agent/models.json'

function scrub(value) {
    return String(value || '')
        .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer <redacted>')
        .replace(/(?:sk|rk|pk)-[A-Za-z0-9_-]{8,}/gi, '<redacted-key>')
        .slice(0, 400)
}

function assertSafeToken(value, label) {
    if (!value || !/^[A-Za-z0-9._:-]+$/.test(value)) throw new Error(`${label} contains unsafe characters`)
    return value
}

function assertSafeRemotePath(value, label) {
    if (!value || !value.startsWith('/') || value.includes('..') || !/^\/[A-Za-z0-9._~\/:-]+$/.test(value)) {
        throw new Error(`${label} must be an absolute, shell-safe path without '..'`)
    }
    return value.replace(/\/{2,}/g, '/')
}

export function parseArgs(argv = process.argv.slice(2)) {
    const options = {
        catalog: null,
        projection: null,
        serial: null,
        rootfs: DEFAULT_ROOTFS,
        catalogRemotePath: DEFAULT_CATALOG_REMOTE_PATH,
        projectionRemotePath: DEFAULT_PROJECTION_REMOTE_PATH,
        adb: 'adb.exe',
        apply: false,
        dryRun: true,
        suffix: new Date().toISOString().replace(/[:.]/g, '-')
    }

    for (const arg of argv) {
        if (arg === '--apply') {
            options.apply = true
            options.dryRun = false
        } else if (arg === '--dry-run') {
            options.apply = false
            options.dryRun = true
        } else if (arg.startsWith('--catalog=')) options.catalog = arg.slice('--catalog='.length)
        else if (arg.startsWith('--projection=')) options.projection = arg.slice('--projection='.length)
        else if (arg.startsWith('--serial=')) options.serial = arg.slice('--serial='.length)
        else if (arg.startsWith('--rootfs=')) options.rootfs = arg.slice('--rootfs='.length)
        else if (arg.startsWith('--catalog-remote-path=')) options.catalogRemotePath = arg.slice('--catalog-remote-path='.length)
        else if (arg.startsWith('--projection-remote-path=')) options.projectionRemotePath = arg.slice('--projection-remote-path='.length)
        else if (arg.startsWith('--adb=')) options.adb = arg.slice('--adb='.length)
        else if (arg.startsWith('--suffix=')) options.suffix = arg.slice('--suffix='.length)
        else if (arg === '--help' || arg === '-h') options.help = true
        else throw new Error(`Unknown argument: ${arg}`)
    }

    if (options.help) return options
    if (!options.catalog || !options.projection) throw new Error('--catalog=PATH and --projection=PATH are required')
    assertSafeToken(options.serial, 'serial')
    assertSafeRemotePath(options.rootfs, 'rootfs')
    assertSafeRemotePath(options.catalogRemotePath, 'catalog remote path')
    assertSafeRemotePath(options.projectionRemotePath, 'projection remote path')
    assertSafeToken(options.suffix, 'suffix')
    return options
}

export function validateCatalogue(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Catalogue must be an object')
    if (payload.schemaVersion !== 2) throw new Error('Catalogue schemaVersion must be 2')
    if (payload.policy?.secretFree !== true) throw new Error('Catalogue violates the secret-free policy')
    if (!Array.isArray(payload.models) || !Array.isArray(payload.routes) || !payload.phoneProjection) {
        throw new Error('Catalogue must contain models, routes, and phoneProjection')
    }
    assertSecretFree(payload)
    return {
        modelCount: payload.models.length,
        routeCount: payload.routes.length,
        phoneDispatchableModelCount: payload.summary?.phoneDispatchableModelCount || 0
    }
}

function localHash(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function remotePaths({ rootfs, catalogRemotePath, projectionRemotePath, serial, suffix }) {
    const root = rootfs.replace(/\/$/, '')
    const catalogDest = `${root}${catalogRemotePath}`
    const projectionDest = `${root}${projectionRemotePath}`
    const catalogParent = catalogRemotePath.slice(0, catalogRemotePath.lastIndexOf('/')) || '/'
    const projectionParent = projectionRemotePath.slice(0, projectionRemotePath.lastIndexOf('/')) || '/'
    const catalogFile = catalogRemotePath.slice(catalogRemotePath.lastIndexOf('/') + 1)
    const projectionFile = projectionRemotePath.slice(projectionRemotePath.lastIndexOf('/') + 1)
    const stagingPrefix = `/data/local/tmp/semantic-explorer-catalog-${assertSafeToken(serial, 'serial')}-${suffix}`
    return {
        catalog: {
            dest: catalogDest,
            next: `${root}${catalogParent}/${catalogFile}.next`,
            backup: `${root}${catalogRemotePath}.pre-catalog-${suffix}`,
            staging: `${stagingPrefix}-catalog.json`
        },
        projection: {
            dest: projectionDest,
            next: `${root}${projectionParent}/${projectionFile}.next`,
            backup: `${root}${projectionRemotePath}.pre-catalog-${suffix}`,
            staging: `${stagingPrefix}-projection.json`
        }
    }
}

export function buildRemotePaths(options) {
    return remotePaths(options)
}

function adbArgs(serial, args) {
    assertSafeToken(serial, 'serial')
    return ['-s', serial, ...args]
}

function suArgs(serial, command) {
    if (!command || /['\n\r]/.test(command)) throw new Error('Remote command contains unsafe quoting')
    return adbArgs(serial, ['shell', 'su', '-c', command])
}

export function buildPlan({ options, paths, catalogHash, projectionHash, catalogSummary, projectionSummary }) {
    const step = (name, args, mutates = false) => ({ name, args, mutates, execute: options.apply })
    return [
        step('verify-device', adbArgs(options.serial, ['get-state'])),
        step('inspect-existing-catalogue', suArgs(options.serial, `test -f ${paths.catalog.dest}`)),
        step('inspect-existing-projection', suArgs(options.serial, `test -f ${paths.projection.dest}`)),
        step('push-catalog-staging', adbArgs(options.serial, ['push', path.resolve(options.catalog), paths.catalog.staging]), true),
        step('push-projection-staging', adbArgs(options.serial, ['push', path.resolve(options.projection), paths.projection.staging]), true),
        step('stage-catalog-next', suArgs(options.serial, `cp ${paths.catalog.staging} ${paths.catalog.next}`), true),
        step('stage-projection-next', suArgs(options.serial, `cp ${paths.projection.staging} ${paths.projection.next}`), true),
        step('restrict-staged-files', suArgs(options.serial, `chmod 600 ${paths.catalog.next} ${paths.projection.next}`), true),
        step('replace-catalogue', suArgs(options.serial, `mv -f ${paths.catalog.next} ${paths.catalog.dest}`), true),
        step('replace-projection', suArgs(options.serial, `mv -f ${paths.projection.next} ${paths.projection.dest}`), true),
        step('verify-catalogue-hash', suArgs(options.serial, `sha256sum ${paths.catalog.dest}`)),
        step('verify-projection-hash', suArgs(options.serial, `sha256sum ${paths.projection.dest}`)),
        step('cleanup-staging', suArgs(options.serial, `rm -f ${paths.catalog.staging} ${paths.projection.staging} ${paths.catalog.next} ${paths.projection.next}`), true),
        { name: 'summary', execute: false, mutates: false, catalogHash, projectionHash, catalogSummary, projectionSummary }
    ]
}

function runCommand(adb, args, { allowFailure = false } = {}) {
    const result = spawnSync(adb, args, { encoding: 'utf8', maxBuffer: 200000 })
    if (!allowFailure && (result.error || result.status !== 0)) throw new Error(scrub(result.stderr || result.error?.message || `adb exited ${result.status}`))
    return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' }
}

function parseHash(output) {
    const match = String(output).trim().match(/^([a-f0-9]{64})\s+/i)
    return match ? match[1].toLowerCase() : null
}

function inspectDestination(run, serial, destination) {
    const result = run(suArgs(serial, `test -f ${destination}`), { allowFailure: true })
    if (result.status !== 0 && result.status !== 1) throw new Error(`Could not inspect ${destination}: ${scrub(result.stderr || result.stdout)}`)
    return result.status === 0
}

export function executeDeployment({ options, paths, catalogHash, projectionHash, runner = runCommand }) {
    const run = (args, extra) => runner(options.adb, args, extra)
    const state = run(adbArgs(options.serial, ['get-state'])).stdout.trim()
    if (state !== 'device') throw new Error(`ADB device ${options.serial} is not ready: ${scrub(state)}`)

    const existingCatalog = inspectDestination(run, options.serial, paths.catalog.dest)
    const existingProjection = inspectDestination(run, options.serial, paths.projection.dest)
    if (existingCatalog) run(suArgs(options.serial, `cp ${paths.catalog.dest} ${paths.catalog.backup}`))
    if (existingProjection) run(suArgs(options.serial, `cp ${paths.projection.dest} ${paths.projection.backup}`))

    try {
        run(adbArgs(options.serial, ['push', path.resolve(options.catalog), paths.catalog.staging]))
        run(adbArgs(options.serial, ['push', path.resolve(options.projection), paths.projection.staging]))
        run(suArgs(options.serial, `cp ${paths.catalog.staging} ${paths.catalog.next}`))
        run(suArgs(options.serial, `cp ${paths.projection.staging} ${paths.projection.next}`))
        run(suArgs(options.serial, `chmod 600 ${paths.catalog.next} ${paths.projection.next}`))
        run(suArgs(options.serial, `mv -f ${paths.catalog.next} ${paths.catalog.dest}`))
        run(suArgs(options.serial, `mv -f ${paths.projection.next} ${paths.projection.dest}`))

        const actualCatalogHash = parseHash(run(suArgs(options.serial, `sha256sum ${paths.catalog.dest}`)).stdout)
        const actualProjectionHash = parseHash(run(suArgs(options.serial, `sha256sum ${paths.projection.dest}`)).stdout)
        if (actualCatalogHash !== catalogHash || actualProjectionHash !== projectionHash) {
            if (existingCatalog) run(suArgs(options.serial, `mv -f ${paths.catalog.backup} ${paths.catalog.dest}`), { allowFailure: true })
            else run(suArgs(options.serial, `rm -f ${paths.catalog.dest}`), { allowFailure: true })
            if (existingProjection) run(suArgs(options.serial, `mv -f ${paths.projection.backup} ${paths.projection.dest}`), { allowFailure: true })
            else run(suArgs(options.serial, `rm -f ${paths.projection.dest}`), { allowFailure: true })
            throw new Error(`Remote hash mismatch; catalogue ${actualCatalogHash || '<unparseable>'}, projection ${actualProjectionHash || '<unparseable>'}`)
        }
    } finally {
        run(suArgs(options.serial, `rm -f ${paths.catalog.staging} ${paths.projection.staging} ${paths.catalog.next} ${paths.projection.next}`), { allowFailure: true })
    }
    return {
        applied: true,
        catalogHash,
        projectionHash,
        catalogBackup: existingCatalog ? paths.catalog.backup : null,
        projectionBackup: existingProjection ? paths.projection.backup : null
    }
}

async function main() {
    const options = parseArgs()
    if (options.help) {
        console.log('Usage: node scripts/deploy-phone-model-catalog.mjs --catalog=PATH --projection=PATH --serial=ADB_SERIAL [--apply]')
        return
    }

    const catalog = JSON.parse(fs.readFileSync(options.catalog, 'utf8'))
    const projection = JSON.parse(fs.readFileSync(options.projection, 'utf8'))
    const catalogSummary = validateCatalogue(catalog)
    const projectionSummary = validateProjection(projection)
    const catalogHash = localHash(options.catalog)
    const projectionHash = localHash(options.projection)
    const paths = buildRemotePaths(options)
    const plan = buildPlan({ options, paths, catalogHash, projectionHash, catalogSummary, projectionSummary })

    if (options.dryRun) {
        console.log(JSON.stringify({
            mode: 'dry-run',
            catalog: path.resolve(options.catalog),
            projection: path.resolve(options.projection),
            serial: options.serial,
            paths,
            catalogSummary,
            projectionSummary,
            catalogHash,
            projectionHash,
            steps: plan.map(({ name, mutates, execute }) => ({ name, mutates, execute }))
        }, null, 2))
        return
    }

    console.log(JSON.stringify({ mode: 'apply', catalog: path.resolve(options.catalog), projection: path.resolve(options.projection), serial: options.serial, catalogSummary, projectionSummary, catalogHash, projectionHash }, null, 2))
    console.log(JSON.stringify(executeDeployment({ options, paths, catalogHash, projectionHash }), null, 2))
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null
if (invokedPath === import.meta.url) main().catch((error) => {
    console.error(error?.stack || error)
    process.exitCode = 1
})
