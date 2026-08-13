import { describe, it, expect, beforeEach } from 'vitest'
import { focusStore, setSelectedBusiness, clearPocketNodes, resetFocus } from '@lib/stores/focus.svelte'

/**
 * Stores-contract-coverage audit (2026-08-11) gap #3: `setSelectedBusiness`
 * was the single most important focus mutator with ZERO direct test — every
 * focus-mode entry (deep-link, click, trail-inspector) flows through it.
 *
 * This pins the behavioral contract WITHOUT touching lane-WIP: reads the
 * store getters only (the facade layer), test-only seam.
 */
describe('focusStore.setSelectedBusiness (stores-coverage gap #3)', () => {
    beforeEach(() => {
        // Reset to a known baseline each run.
        resetFocus()
    })

    const sampleBusiness = { lead_id: 1, name: 'Test Co' } as never

    it('selects: updates selectedBusiness + emits the mirror (facade read)', () => {
        setSelectedBusiness(sampleBusiness)
        const s = focusStore()
        // The store enriches/spreads the record (12+ fields observed) — assert
        // structural: the seed fields survive + selection is non-null.
        expect(s.selectedBusiness).not.toBeNull()
        expect((s.selectedBusiness as unknown as { lead_id?: number }).lead_id).toBe(1)
    })

    it('clearing to null nulls selectedBusiness (de-selection path)', () => {
        setSelectedBusiness(sampleBusiness)
        setSelectedBusiness(null)
        expect(focusStore().selectedBusiness).toBe(null)
    })

    it('resetFocus() clears a non-null selection (no leak across resets)', () => {
        setSelectedBusiness(sampleBusiness)
        expect(focusStore().selectedBusiness).not.toBeNull()
        resetFocus()
        expect(focusStore().selectedBusiness).toBe(null)
    })
})

describe('clearPocketNodes (supporting mutator)', () => {
    it('is callable + does not throw on empty pocket', () => {
        expect(typeof clearPocketNodes).toBe('function')
        expect(() => clearPocketNodes()).not.toThrow()
    })
})
