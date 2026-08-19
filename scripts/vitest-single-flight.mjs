import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..')
const DEFAULT_LOCK_PATH = path.join(PROJECT_ROOT, 'tmp', 'vitest.single-flight.lock')

function lockPathFromEnv() {
    return process.env.SEMANTIC_VITEST_LOCK_PATH
        ? path.resolve(process.env.SEMANTIC_VITEST_LOCK_PATH)
        : DEFAULT_LOCK_PATH
}

function readOwner(lockPath) {
    try {
        return JSON.parse(fs.readFileSync(lockPath, 'utf8'))
    } catch (error) {
        if (error?.code === 'ENOENT') return null
        return { malformed: true, error: error instanceof Error ? error.message : String(error) }
    }
}

function ownerProcessIsAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return false

    try {
        process.kill(pid, 0)
        return true
    } catch (error) {
        // Windows can report EPERM for a process we cannot inspect. It is still
        // live, so do not treat that lock as stale.
        return error?.code === 'EPERM'
    }
}

function formatOwner(owner, lockPath) {
    if (!owner || owner.malformed) {
        return `[vitest-single-flight] refusing to start: lock file is unreadable at ${lockPath}`
    }

    const started = owner.startedAt ? ` started ${owner.startedAt}` : ''
    const command = owner.command ? ` command=${owner.command}` : ''
    return `[vitest-single-flight] another Vitest run owns ${lockPath} (pid=${owner.pid ?? 'unknown'}${started}).${command}`
}

function writeLock(lockPath, owner) {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true })
    const fd = fs.openSync(lockPath, 'wx')
    try {
        fs.writeFileSync(fd, `${JSON.stringify(owner)}${os.EOL}`, 'utf8')
    } finally {
        fs.closeSync(fd)
    }
}

function removeIfOwned(lockPath, pid) {
    const owner = readOwner(lockPath)
    if (owner?.pid !== pid) return

    try {
        fs.unlinkSync(lockPath)
    } catch (error) {
        if (error?.code !== 'ENOENT') throw error
    }
}

/**
 * Acquire the repo-wide Vitest lock. The config imports this for every normal
 * project Vitest invocation, including direct `npx vitest run` commands.
 *
 * @param {{lockPath?: string}} [options]
 * @returns {{lockPath: string, release: () => void}}
 */
export function acquireVitestSingleFlight(options = {}) {
    const lockPath = path.resolve(options.lockPath ?? lockPathFromEnv())
    const owner = {
        pid: process.pid,
        startedAt: new Date().toISOString(),
        cwd: process.cwd(),
        command: process.argv.slice(1).join(' ')
    }

    for (;;) {
        try {
            writeLock(lockPath, owner)
            break
        } catch (error) {
            if (error?.code !== 'EEXIST') throw error

            const existing = readOwner(lockPath)
            if (!existing || existing.malformed) {
                throw new Error(formatOwner(existing, lockPath), { cause: error })
            }
            if (ownerProcessIsAlive(existing.pid)) {
                throw new Error(formatOwner(existing, lockPath), { cause: error })
            }

            // The previous owner is gone. Reclaim only that stale lock, then
            // retry the atomic create so concurrent reclaimers cannot overlap.
            try {
                fs.unlinkSync(lockPath)
            } catch (unlinkError) {
                if (unlinkError?.code !== 'ENOENT') {
                    throw new Error(`Unable to reclaim stale Vitest lock at ${lockPath}`, { cause: unlinkError })
                }
            }
        }
    }

    let released = false
    const release = () => {
        if (released) return
        released = true
        removeIfOwned(lockPath, process.pid)
        process.removeListener('SIGINT', onSignal)
        process.removeListener('SIGTERM', onSignal)
    }
    const onSignal = (signal) => {
        release()
        process.exit(128 + (signal === 'SIGINT' ? 2 : 15))
    }

    process.once('exit', release)
    process.once('SIGINT', onSignal)
    process.once('SIGTERM', onSignal)

    return { lockPath, release }
}

export { DEFAULT_LOCK_PATH }
