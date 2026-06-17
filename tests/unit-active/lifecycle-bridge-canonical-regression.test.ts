/**
 * lifecycle-bridge-canonical-regression.test.ts
 *
 * Locks the W19 Lane A rewire of `src/lib/engine/lifecycle-bridge.ts`.
 *
 * The rewire (committed in b13cfc2) changed the import source from the
 * legacy `../../../js/modules/lifecycle` to the canonical
 * `@lib/orchestration/lifecycle`. W19 was bitten twice by parallel-session
 * WIP resets silently reverting src/lib/* rewires; this test prevents the
 * same class of regression from reintroducing the legacy import path.
 *
 * Pattern follows `cursor-surface-preservation-regression.test.ts` (1439993)
 * and `demo-choreography-exports.test.ts` (Lane B canonical-import test).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ── Source file path ─────────────────────────────────────────────────────────

const SRC_PATH = resolve(__dirname, '../../src/lib/engine/lifecycle-bridge.ts')

function readSource(): string {
    return readFileSync(SRC_PATH, 'utf-8')
}

// ── The 13 symbols that lifecycle-bridge re-exports from the canonical ───────
//
// If a future change re-routes even one of these to a different source
// (e.g., a new barrel or a legacy back-door), the test catches it.

const CANONICAL_RE_EXPORTS = [
    'copyCurrentViewLink',
    'exploreInsideToNextStop',
    'hideSummaryCard',
    'probeSemanticLane',
    'refreshCompositionState',
    'resetExperienceState',
    'resetExplorationFocus',
    'resetNodePositions',
    'returnToOverview',
    'setSemanticDiveMode',
    'setTrailDepth',
    'switchView',
    'updateExplorationUi'
] as const

// ── Tests ───────────────────────────────────────────────────────────────────

describe('lifecycle-bridge canonical import (W19 Lane A rewire regression)', () => {
    it('imports from @lib/orchestration/lifecycle (the canonical path)', () => {
        const src = readSource()
        expect(src).toContain("from '@lib/orchestration/lifecycle'")
    })

    it('does NOT import from the legacy ../../../js/modules/lifecycle path', () => {
        const src = readSource()
        expect(src).not.toContain("from '../../../js/modules/lifecycle'")
    })

    it('does NOT import from ../../../js/modules/lifecycle.ts (defensive: .ts suffix variant)', () => {
        const src = readSource()
        expect(src).not.toContain("from '../../../js/modules/lifecycle.ts'")
    })

    it('re-exports all 13 canonical symbols from @lib/orchestration/lifecycle', () => {
        const src = readSource()
        for (const symbol of CANONICAL_RE_EXPORTS) {
            expect(src, `lifecycle-bridge must re-export "${symbol}" from @lib/orchestration/lifecycle`).toContain(
                symbol
            )
        }
    })

    it('has exactly one import statement targeting @lib/orchestration/lifecycle', () => {
        const src = readSource()
        const canonicalImportMatches = src.match(/from\s+['"]@lib\/orchestration\/lifecycle['"]/g)
        expect(canonicalImportMatches, 'expected exactly one canonical import statement').toHaveLength(1)
    })
})
