/**
 * S4 (2026-08-19): thin-row enrichment merge unit gate.
 * Locks the Option-1 rules exactly as specified in
 * docs/feature-depth-enrichment-options.md (verified dry-run: 2,411/3,888 = 62%)
 * and implemented in src/lib/data-loader.ts (applyThinRowEnrichment +
 * enrichRecords, wired at src/lib/data-store.ts setLeadEnrichmentData).
 */
import { describe, expect, it } from 'vitest'
import { applyThinRowEnrichment, enrichRecords } from '@lib/data-loader'
import type { BusinessRecord } from '@lib/types/business'

const PLACEHOLDERS = ['Local business', 'Registry or thin business record', 'Montgomery County business', ''] as const

describe('applyThinRowEnrichment — what rescue (S4)', () => {
    for (const placeholder of PLACEHOLDERS) {
        it(`rescues the "placeholder" what from snapshot (${placeholder || '(empty)'})`, () => {
            const out = applyThinRowEnrichment(placeholder, null, {
                snapshot: 'Roofing contractor serving Conroe'
            })
            expect(out.what).toBe('Roofing contractor serving Conroe')
        })
    }

    it('keeps a real (non-placeholder) what untouched even with enrichment', () => {
        const out = applyThinRowEnrichment('Coffee shop', null, {
            snapshot: 'Best coffee in town'
        })
        expect(out.what).toBe('Coffee shop')
    })

    it.each(['Pending research', '-'])('keeps the placeholder when snapshot is a sentinel (%s)', (sentinel) => {
        const out = applyThinRowEnrichment('Local business', null, {
            snapshot: sentinel
        })
        expect(out.what).toBe('Local business')
    })

    it('keeps the placeholder when snapshot is missing/empty', () => {
        const out = applyThinRowEnrichment('Local business', null, {})
        expect(out.what).toBe('Local business')
    })
})

describe('applyThinRowEnrichment — naics (S4)', () => {
    it('adopts enrichment naics when record naics is empty', () => {
        const out = applyThinRowEnrichment('Local business', null, { naics: '238220' })
        expect(out.naics).toBe('238220')
    })

    it('never overwrites an existing naics', () => {
        const out = applyThinRowEnrichment('Coffee shop', '722515', { naics: '238220' })
        expect(out.naics).toBe('722515')
    })
})

describe('enrichRecords (S4) — batch merge via the runtime hook shape', () => {
    const base = (id: number, what: string): BusinessRecord =>
        ({
            lead_id: String(id),
            name: `Biz ${id}`,
            what,
            naics: null,
            city: 'Conroe',
            zip: '77301',
            website: null,
            email: null,
            phone: null,
            lat: 30.3,
            lng: -95.4,
            geocoded: true,
            status: 'active',
            category: '',
            cluster: 0,
            id: String(id),
            public_note: '',
            public_detail: ''
        }) as BusinessRecord

    it('is a no-op when enrichment is null or empty', () => {
        const recs = [base(1, 'Local business')]
        expect(enrichRecords(recs, null)).toBe(recs)
        expect(enrichRecords(recs, {})).toEqual(recs)
    })

    it('rescues matching thin rows and leaves unmatched rows untouched (identity)', () => {
        const recs = [base(1, 'Local business'), base(2, 'Local business')]
        const enrichment = { '1': { snapshot: 'Auto repair shop' } }
        const out = enrichRecords(recs, enrichment)
        expect(out[1]!.lead_id).toBe('2')
        expect(out[0].what).toBe('Auto repair shop')
        expect(out[1]).toBe(recs[1]) // untouched row keeps object identity
    })

    it('does not mutate the input records', () => {
        const recs = [base(1, 'Local business')]
        const before = recs[0].what
        enrichRecords(recs, { '1': { snapshot: 'Changed' } })
        expect(recs[0].what).toBe(before)
    })
})
