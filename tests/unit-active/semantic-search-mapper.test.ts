import { describe, expect, it } from 'vitest'
import {
    PAGE_SIZE,
    getPayloadResults,
    mapServiceRow,
    normalizeSearchLimit,
    normalizeSearchOffset,
    normalizeSearchPage
} from '../../src/lib/search/semantic-search-mapper'

describe('semantic-search-mapper: getPayloadResults', () => {
    it('returns [] for null / non-object / empty inputs', () => {
        expect(getPayloadResults(null)).toEqual([])
        expect(getPayloadResults(undefined)).toEqual([])
        expect(getPayloadResults(42)).toEqual([])
        expect(getPayloadResults('nope')).toEqual([])
        expect(getPayloadResults([])).toEqual([])
        expect(getPayloadResults({})).toEqual([])
    })

    it('prefers the results key over data and ignores falsy entries', () => {
        expect(getPayloadResults({ results: [1, 2, 3] })).toEqual([1, 2, 3])
        expect(getPayloadResults({ data: ['x'] })).toEqual(['x'])
        // `results` wins when both present
        expect(getPayloadResults({ results: ['r'], data: ['d'] })).toEqual(['r'])
        // falsy entries are filtered out
        expect(getPayloadResults({ results: [0, '', null, false, 'keep', {}] })).toEqual(['keep', {}])
    })

    it('returns [] when the candidate key is not an array', () => {
        expect(getPayloadResults({ results: null })).toEqual([])
        expect(getPayloadResults({ results: 'not-an-array' })).toEqual([])
        expect(getPayloadResults({ data: 123 })).toEqual([])
    })
})

describe('semantic-search-mapper: mapServiceRow', () => {
    it('returns null when the row is missing both name and lead_id', () => {
        expect(mapServiceRow(null as unknown as Record<string, unknown>, 0)).toBeNull()
        expect(mapServiceRow({}, 0)).toBeNull()
        expect(mapServiceRow({ category: 'Food' }, 0)).toBeNull()
        expect(mapServiceRow({ name: '', lead_id: '' }, 0)).toBeNull()
    })

    it('maps a lead_id-only row with sensible defaults', () => {
        const r = mapServiceRow({ lead_id: '5' }, 3)
        expect(r).not.toBeNull()
        expect(r!.id).toBe('5')
        expect(r!.name).toBe('5')
        expect(r!.index).toBe(3)
        expect(r!.score).toBe(0)
        expect(r!.category).toBe('')
        expect(r!.snippet).toBe('')
        // no name → point.name undefined
        expect(r!.point!.name).toBeUndefined()
    })

    it('maps a name-only row and prefers lead_id for id when present', () => {
        const r = mapServiceRow({ name: 'Acme', lead_id: '9' }, 1)
        expect(r!.id).toBe('9')
        expect(r!.name).toBe('Acme')
        expect(r!.point!.name).toBe('Acme')
        // lead_id flows into point so deep-link anchor restore by lead_id works
        expect(r!.point!.lead_id).toBe('9')
    })

    it('picks score from score then semantic_score, defaulting to 0', () => {
        // F-search-8 normalization: raw scores are percentage-like and get
        // Math.min(1, raw/100) so multi-token matches saturate at 1.0.
        expect(mapServiceRow({ name: 'A', score: 2 }, 0)!.score).toBe(0.02)
        expect(mapServiceRow({ name: 'A', semantic_score: 5 }, 0)!.score).toBe(0.05)
        expect(mapServiceRow({ name: 'A', score: 0, semantic_score: 7 }, 0)!.score).toBe(0)
        expect(mapServiceRow({ name: 'A' }, 0)!.score).toBe(0)
    })

    it('chooses snippet by public_note > public_detail > address priority', () => {
        expect(mapServiceRow({ name: 'A', address: 'addr' }, 0)!.snippet).toBe('addr')
        expect(mapServiceRow({ name: 'A', public_detail: 'det', address: 'addr' }, 0)!.snippet).toBe('det')
        expect(
            mapServiceRow({ name: 'A', public_note: 'note', public_detail: 'det', address: 'addr' }, 0)!.snippet
        ).toBe('note')
    })

    it('passes through optional point contact fields only when present', () => {
        const r = mapServiceRow({ name: 'B', city: 'Conroe', website: 'w', email: 'e', phone: 'p' }, 0)
        expect(r!.point!.city).toBe('Conroe')
        expect(r!.point!.website).toBe('w')
        expect(r!.point!.email).toBe('e')
        expect(r!.point!.phone).toBe('p')
        expect(r!.point!.what).toBeUndefined()
    })

    it('coerces every exposed field to a string and number', () => {
        const r = mapServiceRow(
            { name: 123 as unknown as string, lead_id: 7 as unknown as string, category: null as unknown as string },
            0
        )
        expect(typeof r!.id).toBe('string')
        expect(typeof r!.name).toBe('string')
        expect(typeof r!.category).toBe('string')
        expect(typeof r!.score).toBe('number')
    })
})

describe('semantic-search-mapper: pagination normalizers', () => {
    it('normalizeSearchPage floors and clamps to >= 0, and handles non-finite', () => {
        expect(normalizeSearchPage(0)).toBe(0)
        expect(normalizeSearchPage(2.9)).toBe(2)
        expect(normalizeSearchPage(5)).toBe(5)
        expect(normalizeSearchPage(-3)).toBe(0)
        expect(normalizeSearchPage(Number!.NaN)).toBe(0)
        expect(normalizeSearchPage(Number!.POSITIVE_INFINITY)).toBe(0)
    })

    it('normalizeSearchOffset uses explicit offset when > 0, else page*PAGE_SIZE', () => {
        expect(normalizeSearchOffset(0, 10)).toBe(10)
        expect(normalizeSearchOffset(2, 0)).toBe(2 * PAGE_SIZE)
        expect(normalizeSearchOffset(0, 0)).toBe(0)
        expect(normalizeSearchOffset(3, 0)).toBe(3 * PAGE_SIZE)
        // non-finite / negative offset collapse to 0, then page math applies
        expect(normalizeSearchOffset(2, Number!.NaN)).toBe(2 * PAGE_SIZE)
        expect(normalizeSearchOffset(0, -5)).toBe(0)
        expect(normalizeSearchOffset(Number!.NaN, 0)).toBe(0)
    })

    it('normalizeSearchLimit clamps to >= 1 and floors, defaulting to PAGE_SIZE for non-finite', () => {
        expect(normalizeSearchLimit(50)).toBe(50)
        expect(normalizeSearchLimit(0)).toBe(1)
        expect(normalizeSearchLimit(0.5)).toBe(1)
        expect(normalizeSearchLimit(-3)).toBe(1)
        expect(normalizeSearchLimit(Number!.NaN)).toBe(PAGE_SIZE)
        expect(normalizeSearchLimit(Number!.POSITIVE_INFINITY)).toBe(PAGE_SIZE)
    })

    it('exposes the shared PAGE_SIZE constant', () => {
        expect(PAGE_SIZE).toBe(18)
    })
})
