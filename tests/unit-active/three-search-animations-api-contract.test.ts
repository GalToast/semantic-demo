/**
 * three-search-animations — public API contract test
 *
 * Lock-in: ensures the public surface of three-search-animations.ts
 * remains stable during refactor. Before this test existed, the file
 * had 546 LOC, 16 `any` occurrences, and no test coverage.
 *
 * The 16 `any` in this file are concentrated in function parameters
 * (`anchorIndex: any`, `frameNow: any`). This contract test gives us
 * a safety net for tightening those parameters in a future bite.
 */
import { describe, it, expect } from 'vitest'
import * as module from '../../src/lib/engine/three-search-animations'

describe('three-search-animations.ts public API contract', () => {
    const expectedFunctions = [
        'triggerSearchHeroMoment',
        'triggerCorridorNodeGlow',
        'updateCorridorNodeGlow',
        'triggerSearchCorridorAnimation',
        'updateSearchCorridorAnimation',
        'disposeSearchCorridorAnimation',
        'disposeHeroAnimation'
    ]

    expectedFunctions.forEach((name) => {
        it(`exports ${name} as a function`, () => {
            expect(typeof (module as unknown as Record<string, unknown>)[name]).toBe('function')
        })
    })

    // ── Signature locks (catch reorders/renames in the tightening pass) ──────

    it('triggerSearchHeroMoment accepts (anchorIndex)', () => {
        expect(module.triggerSearchHeroMoment.length).toBe(1)
    })

    it('triggerCorridorNodeGlow accepts (anchorIndex, routeIndices?)', () => {
        // length 1 because routeIndices has a default value `= []`
        expect(module.triggerCorridorNodeGlow.length).toBe(1)
    })

    it('triggerSearchCorridorAnimation accepts (anchorIndex, routeIndices?)', () => {
        expect(module.triggerSearchCorridorAnimation.length).toBe(1)
    })

    it('updateCorridorNodeGlow accepts (frameNow)', () => {
        expect(module.updateCorridorNodeGlow.length).toBe(1)
    })

    it('updateSearchCorridorAnimation accepts (frameNow)', () => {
        expect(module.updateSearchCorridorAnimation.length).toBe(1)
    })

    // ── Idempotency (defensive against dispose side effects) ──────────────────

    it('disposeSearchCorridorAnimation is idempotent', () => {
        const fn = module.disposeSearchCorridorAnimation
        expect(() => fn()).not.toThrow()
        expect(() => fn()).not.toThrow()
    })

    it('disposeHeroAnimation is idempotent', () => {
        const fn = module.disposeHeroAnimation
        expect(() => fn()).not.toThrow()
        expect(() => fn()).not.toThrow()
    })
})
