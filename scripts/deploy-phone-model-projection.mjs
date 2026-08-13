#!/usr/bin/env node

/**
 * Dry-run-first, exact-device deployment for a generated phone model projection.
 * The phone router lives inside the Ubuntu proot rootfs, so the default target
 * is the rootfs copy read by chrooted Pi processes.
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const DEFAULT_ROOTFS = '/data/data/com.termux/files/usr/var/lib/proot-distro/containers/ubuntu/rootfs'
const DEFAULT_REMOTE_PATH = '/root/.pi/agent/models.json'

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
    const options = { projection: null, serial: null, rootfs: DEFAULT_ROOTFS, remotePath: DEFAULT_REMOTE_PATH, adb: 'adb.exe', apply: false, dryRun: true, suffix: new Date().toISOString().replace(/[:.]/g, '-') }
    for (const arg of argv) {
        if (arg === '--apply') { options.apply = true; options.dryRun = false }
        else if (arg === '--dry-run') { options.apply = false; options.dryRun = true }
        else if (arg.startsWith('--projection=')) options.projection = arg.slice('--projection='.length)
        else if (arg.startsWith('--serial=')) options.serial = arg.slice('--serial='.length)
        else if (arg.startsWith('--rootfs=')) options.rootfs = arg.slice('--rootfs='.length)
        else if (arg.startsWith('--remote-path=')) options.remotePath = arg.slice('--remote-path='.length)
        else if (arg.startsWith('--adb=')) options.adb = arg.slice('--adb='.length)
        else if (arg.startsWith('--suffix=')) options.suffix = arg.slice('--suffix='.length)
        else if (arg === '--help' || arg === '-h') options.help = true
        else throw new Error(`Unknown argument: ${arg}`)
    }
    if (options.help) return options
    if (!options.projection) throw new Error('--projection=PATH is required')
    assertSafeToken(options.serial, 'serial')
    assertSafeRemotePath(options.rootfs, 'rootfs')
    assertSafeRemotePath(options.remotePath, 'remote path')
    assertSafeToken(options.suffix, 'suffix')
    return options
}

export function validateProjection(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !payload.providers || typeof payload.providers !== 'object') {
        throw new Error('Projection must contain a providers object')
    }
    const providers = Object.entries(payload.providers)
    if (!providers.length) throw new Error('Projection must contain at least one provider')
    let modelCount = 0
    for (const [provider, config] of providers) {
        if (!config || config.apiKey !== 'router') throw new Error('Projection violates secret-free policy: every provider must use apiKey "router"')
        try {
            const url = new URL(config.baseUrl)
            if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname)) throw new Error('external baseUrl')
        } catch {
            throw new Error(`Provider ${provider} has an invalid or external baseUrl`)
        }
        if (!Array.isArray(config.models)) throw new Error(`Provider ${provider} must contain a models array`)
        for (const model of config.models) if (!model || typeof model.id !== 'string' || !model.id) throw new Error(`Provider ${provider} contains an invalid model`) 
        modelCount += config.models.length
    }
    return { providerCount: providers.length, modelCount }
}

export function buildRemotePaths({ rootfs, remotePath, serial, suffix }) {
    const parent = remotePath.slice(0, remotePath.lastIndexOf('/')) || '/'
    const file = remotePath.slice(remotePath.lastIndexOf('/') + 1)
    const root = rootfs.replace(/\/$/, '')
    const dest = `${root}${remotePath}`
    const next = `${root}${parent}/${file}.next`
    const backup = `${root}${remotePath}.pre-parity-${suffix}`
    const staging = `/data/local/tmp/semantic-explorer-${assertSafeToken(serial, 'serial')}-${suffix}.json`
    return { dest, next, backup, staging }
}

export function adbArgs(serial, args) {
    assertSafeToken(serial, 'serial')
    return ['-s', serial, ...args]
}

export function buildSuArgs(serial, command) {
    if (!command || /['\n\r]/.test(command)) throw new Error('Remote command contains unsafe quoting')
    return adbArgs(serial, ['shell', 'su', '-c', command])
}

export function buildPlan({ options, paths, localHash, summary }) {
    const step = (name, args, mutates = false) => ({ name, args, mutates, execute: options.apply })
    return [
        step('verify-device', adbArgs(options.serial, ['get-state'])),
        step('check-existing-destination', buildSuArgs(options.serial, `test -f ${paths.dest}`)),
        step('backup-existing-destination', buildSuArgs(options.serial, `cp ${paths.dest} ${paths.backup}`), true),
        step('push-staging-file', adbArgs(options.serial, ['push', path.resolve(options.projection), paths.staging]), true),
        step('copy-staging-to-next', buildSuArgs(options.serial, `cp ${paths.staging} ${paths.next}`), true),
        step('restrict-next-file', buildSuArgs(options.serial, `chmod 600 ${paths.next}`), true),
        step('atomic-replace', buildSuArgs(options.serial, `mv -f ${paths.next} ${paths.dest}`), true),
        step('verify-remote-hash', buildSuArgs(options.serial, `sha256sum ${paths.dest}`)),
        step('cleanup-staging-file', buildSuArgs(options.serial, `rm -f ${paths.staging}`), true),
        { name: 'summary', execute: false, mutates: false, summary, localHash }
    ]
}

function localHash(filePath) {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
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

export function executeDeployment({ options, paths, expectedHash, runner = runCommand }) {
    const run = (args, extra) => runner(options.adb, args, extra)
    const state = run(adbArgs(options.serial, ['get-state'])).stdout.trim()
    if (state !== 'device') throw new Error(`ADB device ${options.serial} is not ready: ${scrub(state)}`)

    const existing = run(buildSuArgs(options.serial, `test -f ${paths.dest}`), { allowFailure: true })
    if (existing.status !== 0 && existing.status !== 1) throw new Error(`Could not inspect the remote destination: ${scrub(existing.stderr || existing.stdout)}`)
    let backupCreated = false
    if (existing.status === 0) {
        run(buildSuArgs(options.serial, `cp ${paths.dest} ${paths.backup}`))
        backupCreated = true
    }
    try {
        run(adbArgs(options.serial, ['push', path.resolve(options.projection), paths.staging]))
        run(buildSuArgs(options.serial, `cp ${paths.staging} ${paths.next}`))
        run(buildSuArgs(options.serial, `chmod 600 ${paths.next}`))
        run(buildSuArgs(options.serial, `mv -f ${paths.next} ${paths.dest}`))
        const remoteHash = parseHash(run(buildSuArgs(options.serial, `sha256sum ${paths.dest}`)).stdout)
        if (remoteHash !== expectedHash) {
            if (backupCreated) run(buildSuArgs(options.serial, `mv -f ${paths.backup} ${paths.dest}`), { allowFailure: true })
            else run(buildSuArgs(options.serial, `rm -f ${paths.dest}`), { allowFailure: true })
            throw new Error(`Remote hash mismatch; expected ${expectedHash}, received ${remoteHash || '<unparseable>'}`)
        }
    } finally {
        run(buildSuArgs(options.serial, `rm -f ${paths.staging} ${paths.next}`), { allowFailure: true })
    }
    return { applied: true, remoteHash: expectedHash, backup: backupCreated ? paths.backup : null }
}

async function main() {
    const options = parseArgs()
    if (options.help) {
        console.log('Usage: node scripts/deploy-phone-model-projection.mjs --projection=PATH --serial=ADB_SERIAL [--apply] [--rootfs=PHONE_ROOTFS]')
        return
    }
    const payload = JSON.parse(fs.readFileSync(options.projection, 'utf8'))
    const summary = validateProjection(payload)
    const hash = localHash(options.projection)
    const paths = buildRemotePaths({ ...options, suffix: options.suffix })
    const plan = buildPlan({ options, paths, localHash: hash, summary })
    if (options.dryRun) {
        console.log(JSON.stringify({ mode: 'dry-run', projection: path.resolve(options.projection), serial: options.serial, paths, summary, localHash: hash, steps: plan.map(({ name, mutates, execute }) => ({ name, mutates, execute })) }, null, 2))
        return
    }
    console.log(JSON.stringify({ mode: 'apply', projection: path.resolve(options.projection), serial: options.serial, summary, localHash: hash }, null, 2))
    console.log(JSON.stringify(executeDeployment({ options, paths, expectedHash: hash }), null, 2))
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null
if (invokedPath === import.meta.url) main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1 })
