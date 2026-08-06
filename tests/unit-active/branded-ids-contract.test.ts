/**
 * branded-ids-contract.test.ts — contract for the LeadId / PointIndex branded types.
 *
 * Verifies:
 *   1. asLeadId / asPointIndex round-trip (runtime identity: branded types are
 *      the base type at runtime — this is the documented behavior).
 *   2. isLeadId / isPointIndex type guards behave correctly.
 *   3. Compile-time protection: a function typed to accept PointIndex rejects
 *      a raw number (via @ts-expect-error) — the whole point of branding.
 *   4. The boundary pattern is documented for future wiring (see the module
 *      header in src/lib/types/branded-ids.ts).
 */
import { describe, it, expect } from 'vitest'
import { asLeadId, asPointIndex, isLeadId, isPointIndex, type LeadId, type PointIndex } from '@lib/types/branded-ids'

describe('branded-ids', () => {
    it('asLeadId round-trips string and numeric lead ids', () => {
        expect(asLeadId('519')).toBe('519')
        expect(asLeadId(519)).toBe('519')
        const lead: LeadId = asLeadId('abc-123')
        expect(lead).toBe('abc-123')
    })

    it('asPointIndex round-trips numeric indices', () => {
        expect(asPointIndex(0)).toBe(0)
        expect(asPointIndex(8405)).toBe(8405)
        const idx: PointIndex = asPointIndex(123)
        expect(idx).toBe(123)
    })

    it('type guards classify correctly', () => {
        expect(isLeadId('519')).toBe(true)
        expect(isLeadId(519)).toBe(true)
        expect(isLeadId(null)).toBe(false)
        expect(isLeadId(undefined)).toBe(false)
        expect(isPointIndex(0)).toBe(true)
        expect(isPointIndex(1.5)).toBe(true) // finite numbers are point indices
        expect(isPointIndex(Number.NaN)).toBe(false)
        expect(isPointIndex(Number.POSITIVE_INFINITY)).toBe(false)
        expect(isPointIndex('5' as unknown)).toBe(false)
    })

    it('compile-time: a PointIndex-typed function rejects a raw number', () => {
        function takesPointIndex(index: PointIndex): number {
            return index
        }
        // @ts-expect-error — raw number is NOT a PointIndex; the brand prevents the mix-up
        takesPointIndex(5)
        // The sanctioned path compiles:
        expect(takesPointIndex(asPointIndex(5))).toBe(5)
    })

    it('compile-time: a LeadId-typed function rejects a raw string', () => {
        function takesLeadId(id: LeadId): string {
            return id
        }
        // @ts-expect-error — raw string is NOT a LeadId
        takesLeadId('519')
        expect(takesLeadId(asLeadId('519'))).toBe('519')
    })
})
