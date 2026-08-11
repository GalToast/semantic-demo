/**
 * Pin journey-coverage gap #3 (src/lib/journey/focus-ui.ts DOM-mutation
 * functions). Public contract: updateFocusNeighborRail() and
 * updateTraversalUi() must be exported, typed as functions, and callable
 * without throwing on the cold-start baseline (no rail/controls elements
 * present). focus-ui.ts is LANE-ACTIVE — import only, do not edit src/.
 */
import { describe, it, expect } from 'vitest'
import { updateFocusNeighborRail, updateTraversalUi } from '@lib/journey/focus-ui'

describe('focus-ui rail + traversal API contract (journey gap #3)', () => {
    it('updateFocusNeighborRail is exported as a function', () => {
        expect(typeof updateFocusNeighborRail).toBe('function')
    })

    it('updateTraversalUi is exported as a function', () => {
        expect(typeof updateTraversalUi).toBe('function')
    })

    it('updateFocusNeighborRail is callable on the cold-start baseline (no rail DOM)', () => {
        // Baseline: fresh jsdom body has no #focus-stage-neighbors-aux, so the
        // function short-circuits at the early-return guard. It must not throw.
        expect(() => updateFocusNeighborRail()).not.toThrow()
    })

    it('updateTraversalUi is callable on the cold-start baseline (no controls DOM)', () => {
        // Baseline: fresh jsdom body has no #trail-controls / #btn-prev-node, so
        // the function short-circuits at the early-return guard. It must not throw.
        expect(() => updateTraversalUi()).not.toThrow()
    })
})
