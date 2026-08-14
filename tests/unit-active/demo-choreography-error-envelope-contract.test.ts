/**
 * demo-choreography-error-envelope-contract.test.ts — assert-ABSENCE.
 *
 * The W47 error-envelope contract locked the try/catch shape of functions
 * inside src/lib/engine/demo-choreography.ts. That module is retired. This
 * test asserts the source file is gone (and the barrel no longer references
 * it) so the structural contract can neither be satisfied nor silently
 * regressed by a re-import. Mirrors t1 absence-guard
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

describe('demo-choreography — retired error-envelope contract absence', () => {
    it('src/lib/engine/demo-choreography.ts no longer exists', () => {
        expect(
            existsSync(DOOMED_PATH),
            'demo-choreography.ts should have been removed (W47 contract retired with it)'
        ).toBe(false)
    })

    it('the W47 source-read path no longer resolves', () => {
        // The old contract read this file to assert try/catch envelopes. With
        // the module retired, the read target must not exist.
        expect(existsSync(DOOMED_PATH)).toBe(false)
    })

    it('barrel index.ts no longer references the doomed module', () => {
        const barrel = readFileSync(BARREL_PATH, 'utf-8')
        expect(barrel).not.toContain('./demo-choreography')
    })
})
