import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { acquireVitestSingleFlight } from '../../scripts/vitest-single-flight.mjs'

const tempRoots = []

afterEach(() => {
    for (const root of tempRoots.splice(0)) {
        fs.rmSync(root, { recursive: true, force: true })
    }
})

function makeLockPath() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'semantic-explorer-vitest-lock-'))
    tempRoots.push(root)
    return path.join(root, 'nested', 'vitest.lock')
}

describe('Vitest single-flight guard', () => {
    it('rejects a second live owner and releases its own lock', () => {
        const lockPath = makeLockPath()
        const first = acquireVitestSingleFlight({ lockPath })

        expect(() => acquireVitestSingleFlight({ lockPath })).toThrow(/another Vitest run owns/)
        expect(fs.existsSync(lockPath)).toBe(true)

        first.release()
        expect(fs.existsSync(lockPath)).toBe(false)
    })

    it('reclaims a lock whose recorded owner is no longer alive', () => {
        const lockPath = makeLockPath()
        fs.mkdirSync(path.dirname(lockPath), { recursive: true })
        fs.writeFileSync(
            lockPath,
            JSON.stringify({ pid: 4294967294, startedAt: '2000-01-01T00:00:00.000Z' }),
            'utf8'
        )

        const owner = acquireVitestSingleFlight({ lockPath })
        expect(JSON.parse(fs.readFileSync(lockPath, 'utf8')).pid).toBe(process.pid)
        owner.release()
        expect(fs.existsSync(lockPath)).toBe(false)
    })
})
