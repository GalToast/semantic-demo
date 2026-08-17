/**
 * @vitest-environment node
 *
 * Regression tests for scripts/smoke-gate.mjs
 *
 * Guards the smoke-gate stage contract: each named stage must execute exactly
 * once, and no bare-node no-op (a `run('node', ...)` call that exits 0 on EOF
 * and reports a false PASS) may masquerade as a real stage.
 *
 * These checks are static (source inspection) so they run in milliseconds and
 * never trigger the full contract/unit suite.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PROJECT_ROOT = resolve('.')
const SCRIPT = resolve(PROJECT_ROOT, 'scripts', 'smoke-gate.mjs')
const SCRIPT_SRC = readFileSync(SCRIPT, 'utf-8')

describe('smoke-gate.mjs stage contract', () => {
    // ── 1. smoke-contracts stage runs exactly once ───────────────────────

    it('runs the smoke-contracts stage exactly once (no bare-node duplicate)', () => {
        const valid = SCRIPT_SRC.match(/run\('node tests\/run-all-contracts\.js --group=smoke'/g) ?? []
        expect(valid).toHaveLength(1)

        // The confirmed duplicate bare-node no-op (run('node', 'tests/...')) must be gone.
        const bareNode = SCRIPT_SRC.match(/run\('node',\s*'tests\/run-all-contracts\.js --group=smoke'/g) ?? []
        expect(bareNode).toHaveLength(0)
    })

    // ── 2. the three named gate stages are still present ─────────────────

    it('preserves the three named gate stages', () => {
        expect(SCRIPT_SRC).toContain("'static checks'")
        expect(SCRIPT_SRC).toContain("'smoke contracts'")
        expect(SCRIPT_SRC).toContain('unit-subset')
    })
})
