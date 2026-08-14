/**
 * demo-choreography-exports.test.ts — assert-ABSENCE for the retired module.
 *
 * src/lib/engine/demo-choreography.ts was retired in the W20 sweep. This test
 * guards that the file and its barrel re-exports are GONE so the module cannot
 * be silently re-imported. Mirrors the t1 absence-guard pattern
 * (tests/unit-active/t1-keyboard-help-replay-no-stack.test.ts).
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const DOOMED_PATH = resolve(__dirname, '../../src/lib/engine/demo-choreography.ts')
const BARREL_PATH = resolve(__dirname, '../../src/lib/engine/index.ts')

function readBarrel(): string {
    return readFileSync(BARREL_PATH, 'utf-8')
}

describe('demo-choreography — retired module absence', () => {
    it('src/lib/engine/demo-choreography.ts no longer exists', () => {
        expect(existsSync(DOOMED_PATH), 'demo-choreography.ts should have been removed').toBe(false)
    })

    it('importing the doomed module path would fail', () => {
        // The retired lifecycle.ts dynamic-import (`import('@lib/engine/demo-choreography')`)
        // now resolves to a missing module. Assert the file is absent so a
        // re-add would surface as a hard failure rather than a silent no-op.
        expect(existsSync(DOOMED_PATH)).toBe(false)
    })

    it('barrel index.ts no longer re-exports the retired demo-choreography exports', () => {
        const barrel = readBarrel()
        expect(barrel).not.toContain("from './demo-choreography'")
        expect(barrel).not.toContain('clearDemoTimers')
        expect(barrel).not.toContain('runDemo')
        expect(barrel).not.toContain('cancelChoreography')
        expect(barrel).not.toContain('isMicroDemoRunning')
        expect(barrel).not.toContain('resetRetryState')
        expect(barrel).not.toContain('DemoChoreographyPhase')
    })
})
