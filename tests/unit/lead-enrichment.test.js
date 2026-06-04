import { describe, it, expect, beforeEach } from 'vitest'
import { state } from '../../js/state.js'
import {
    getEnrichment,
    getEnrichmentField,
    getLeadOneLiner,
    getLeadAddress,
    getLeadQualityStars
} from '../../js/modules/lead-enrichment.js'

describe('lead-enrichment helper', () => {
    beforeEach(() => {
        state.leadEnrichment = {
            '1': {
                snapshot: 'IT security for local businesses',
                observations: 'Multi-location Conroe firm',
                business_overview: 'NAICS 541611 — IT consulting',
                address: '16601 Crosby St, Conroe, TX 77303',
                naics: '541611',
                lead_quality: 4
            },
            '2': {
                snapshot: 'We roast specialty coffee for offices',
                business_overview: null,
                lead_quality: 2
            },
            '3': {
                observations: 'Pet grooming in Willis'
            }
        }
    })

    describe('getEnrichment', () => {
        it('returns the enrichment for a known lead', () => {
            const enr = getEnrichment('1')
            expect(enr.snapshot).toBe('IT security for local businesses')
        })

        it('returns null for an unknown lead', () => {
            expect(getEnrichment('99999')).toBeNull()
        })

        it('returns null when state.leadEnrichment is not loaded', () => {
            state.leadEnrichment = null
            expect(getEnrichment('1')).toBeNull()
        })

        it('coerces numeric lead_id to string', () => {
            const enr = getEnrichment(1)
            expect(enr.snapshot).toBe('IT security for local businesses')
        })
    })

    describe('getEnrichmentField', () => {
        it('returns the field with fallback', () => {
            expect(getEnrichmentField('1', 'snapshot')).toBe('IT security for local businesses')
            expect(getEnrichmentField('1', 'naics', 'unknown')).toBe('541611')
        })

        it('returns fallback for missing field', () => {
            expect(getEnrichmentField('1', 'lead_quality', 0)).toBe(4)
            expect(getEnrichmentField('999', 'snapshot', 'default')).toBe('default')
        })
    })

    describe('getLeadOneLiner', () => {
        it('prefers snapshot over business_overview_extended over business_overview over observations over point.what', () => {
            const point = { lead_id: '1', what: 'database fallback' }
            expect(getLeadOneLiner(point)).toBe('IT security for local businesses')
        })

        it('falls back to business_overview_extended when snapshot is missing', () => {
            state.leadEnrichment['1'].snapshot = null
            state.leadEnrichment['1'].business_overview_extended = 'CRM analyst note'
            const point = { lead_id: '1', what: 'database fallback' }
            expect(getLeadOneLiner(point)).toBe('CRM analyst note')
        })

        it('falls back to point.what when no enrichment fields present', () => {
            const point = { lead_id: '999', what: 'Local business' }
            expect(getLeadOneLiner(point)).toBe('Local business')
        })

        it('returns null when all fields empty', () => {
            const point = { lead_id: '999', what: null }
            expect(getLeadOneLiner(point)).toBeNull()
        })
    })

    describe('getLeadAddress', () => {
        it('returns the street address from enrichment', () => {
            const point = { lead_id: '1' }
            expect(getLeadAddress(point)).toBe('16601 Crosby St, Conroe, TX 77303')
        })

        it('returns null when no enrichment has address', () => {
            const point = { lead_id: '2' }
            expect(getLeadAddress(point)).toBeNull()
        })
    })

    describe('getLeadQualityStars', () => {
        it('returns the star count', () => {
            expect(getLeadQualityStars({ lead_id: '1' })).toBe(4)
            expect(getLeadQualityStars({ lead_id: '2' })).toBe(2)
        })

        it('returns null when no lead_quality', () => {
            expect(getLeadQualityStars({ lead_id: '3' })).toBeNull()
            expect(getLeadQualityStars({ lead_id: '999' })).toBeNull()
        })

        it('caps at 4 stars', () => {
            state.leadEnrichment['1'].lead_quality = 7
            expect(getLeadQualityStars({ lead_id: '1' })).toBe(4)
        })
    })
})
