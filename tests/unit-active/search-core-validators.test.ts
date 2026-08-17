/**
 * Unit tests for the two untested public validator/caster exports in
 * src/lib/stores/search-core.ts: validateSearchQuery and castSearchResults.
 *
 * Validates:
 * - validateSearchQuery: shape, empty/whitespace/short/valid/truncate/null
 * - castSearchResults: field mapping, id priority (id > lead_id > index),
 *   default values, index coercion from string to number, count preservation
 */
import { describe, it, expect } from 'vitest'
import { validateSearchQuery, castSearchResults } from '@lib/stores/search.svelte.ts'

describe('validateSearchQuery', () => {
    it('returns { valid: false, query: "", reason: "empty" } for an empty string', () => {
        const result = validateSearchQuery('')
        expect(result).toEqual({ valid: false, query: '', reason: 'empty' })
    })

    it('returns { valid: false, query: "", reason: "empty" } for whitespace-only input', () => {
        const result = validateSearchQuery('   ')
        expect(result).toEqual({ valid: false, query: '', reason: 'empty' })
    })

    it('returns { valid: false, query: normalized, reason: "too-short" } for a single character', () => {
        const result = validateSearchQuery('a')
        expect(result).toEqual({ valid: false, query: 'a', reason: 'too-short' })
    })

    it('returns valid:true for exactly two characters', () => {
        const result = validateSearchQuery('ab')
        expect(result).toEqual({ valid: true, query: 'ab' })
        expect(result).not.toHaveProperty('reason')
    })

    it('trims leading/trailing whitespace from valid queries', () => {
        const result = validateSearchQuery('  hello world  ')
        expect(result).toEqual({ valid: true, query: 'hello world' })
    })

    it('slices queries longer than MAX_QUERY_LENGTH (200) to 200 chars', () => {
        const long = 'x'.repeat(300)
        const result = validateSearchQuery(long)
        expect(result.valid).toBe(true)
        expect(result.query.length).toBe(200)
    })

    it('coerces null to empty (invalid)', () => {
        // @ts-expect-error testing runtime coercion
        const result = validateSearchQuery(null)
        expect(result).toEqual({ valid: false, query: '', reason: 'empty' })
    })

    it('coerces undefined to empty (invalid)', () => {
        // @ts-expect-error testing runtime coercion
        const result = validateSearchQuery(undefined)
        expect(result).toEqual({ valid: false, query: '', reason: 'empty' })
    })
})

describe('castSearchResults', () => {
    it('returns an empty array for an empty input array', () => {
        const result = castSearchResults([])
        expect(result).toEqual([])
    })

    it('preserves result count — maps 1:1', () => {
        const input = [{ index: 0 }, { index: 1 }, { index: 2 }]
        const result = castSearchResults(input)
        expect(result).toHaveLength(3)
    })

    it('sets id from r.id when present', () => {
        const result = castSearchResults([{ index: 5, id: 'abc' }])
        expect(result[0].id).toBe('abc')
    })

    it('falls back to r.lead_id when r.id is absent', () => {
        const result = castSearchResults([{ index: 5, lead_id: 'lead-12' }])
        expect(result[0].id).toBe('lead-12')
    })

    it('falls back to r.index (stringified) when both id and lead_id are absent', () => {
        const result = castSearchResults([{ index: 7 }])
        expect(result[0].id).toBe('7')
    })

    it('coerces numeric index to Number and string index to Number', () => {
        const resultNum = castSearchResults([{ index: 42 }])
        expect(typeof resultNum[0].index).toBe('number')
        expect(resultNum[0].index).toBe(42)

        const resultStr = castSearchResults([{ index: '99' }])
        expect(resultStr[0].index).toBe(99)
    })

    it('defaults name to "Unknown" when missing', () => {
        const result = castSearchResults([{ index: 0 }])
        expect(result[0].name).toBe('Unknown')
    })

    it('preserves an explicit name field', () => {
        const result = castSearchResults([{ index: 0, name: 'Test Co' }])
        expect(result[0].name).toBe('Test Co')
    })

    it('defaults score to 0 when missing', () => {
        const result = castSearchResults([{ index: 0 }])
        expect(result[0].score).toBe(0)
    })

    it('preserves an explicit score field', () => {
        const result = castSearchResults([{ index: 0, score: 0.85 }])
        expect(result[0].score).toBe(0.85)
    })

    it('defaults category to "" when missing', () => {
        const result = castSearchResults([{ index: 0 }])
        expect(result[0].category).toBe('')
    })

    it('preserves an explicit category field', () => {
        const result = castSearchResults([{ index: 0, category: 'Restaurant' }])
        expect(result[0].category).toBe('Restaurant')
    })

    it('defaults snippet to "" when missing', () => {
        const result = castSearchResults([{ index: 0 }])
        expect(result[0].snippet).toBe('')
    })

    it('preserves an explicit snippet field', () => {
        const result = castSearchResults([{ index: 0, snippet: 'Best pizza' }])
        expect(result[0].snippet).toBe('Best pizza')
    })

    it('produces the full SearchResult shape with all fields populated', () => {
        const input = [
            { index: 10, id: 'r1', name: 'Alpha', score: 0.9, category: 'Food', snippet: 'great' }
        ]
        const result = castSearchResults(input)
        expect(result).toEqual([
            {
                id: 'r1',
                name: 'Alpha',
                index: 10,
                score: 0.9,
                category: 'Food',
                snippet: 'great'
            }
        ])
    })

    it('casts lead_id as a string id, not number', () => {
        const result = castSearchResults([{ index: 0, lead_id: '42' }])
        expect(typeof result[0].id).toBe('string')
        expect(result[0].id).toBe('42')
    })
})
