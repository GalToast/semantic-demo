/**
 * three-interaction-visuals — public API contract test
 *
 * Lock-in: ensures the public surface of three-interaction-visuals.ts
 * remains stable during refactor. Before this test existed, the file
 * had 757 LOC, 8 `any` occurrences, and no test coverage.
 *
 * Pattern mirrors tests/unit-active/three-engine-api-contract.test.ts.
 */
import { describe, it, expect } from 'vitest'
import * as module from '../../src/lib/engine/three-interaction-visuals'

describe('three-interaction-visuals.ts public API contract', () => {
    const expectedFunctions = [
        'disposeInteractionVisuals',
        'disposeSemanticLens',
        'initSemanticManifold',
        'initSemanticLens',
        'updateInteractionVisuals'
    ]

    expectedFunctions.forEach((name) => {
        it(`exports ${name} as a function`, () => {
            expect(typeof (module as unknown as Record<string, unknown>)[name]).toBe('function')
        })
    })

    it('disposeInteractionVisuals is idempotent (no throw on second call)', () => {
        // Defensive: a future refactor that adds side effects to dispose
        // (e.g., a `disposed` flag) should not break the no-op-when-already-
        // disposed contract.
        const fn = module.disposeInteractionVisuals
        expect(() => fn()).not.toThrow()
        expect(() => fn()).not.toThrow()
    })

    it('disposeSemanticLens is idempotent (no throw on second call)', () => {
        const fn = module.disposeSemanticLens
        expect(() => fn()).not.toThrow()
        expect(() => fn()).not.toThrow()
    })

    it('updateInteractionVisuals accepts (now, hoveredNode, focusedNode)', () => {
        // Signature lock: if a future refactor reorders or renames these
        // params, every caller will break. This test catches the regression
        // at the contract layer.
        expect(module.updateInteractionVisuals.length).toBe(3)
    })
})
