import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BusinessRecord } from '@lib/types/business'

// Isolate pure logic: local-search-index depends only on getBusinessRecords().
vi.mock('@lib/data-store', () => ({
    getBusinessRecords: vi.fn(() => [])
}))

import { getBusinessRecords } from '@lib/data-store'
import {
    buildLocalIndex,
    expandFuzzyMatches,
    getLocalIndex,
    getSearchEngineEmptyStateSuggestions,
    levenshteinCapped,
    localHitsToResults,
    performLocalIndexSearch,
    scoreRecord,
    shouldPreferLiveSearch,
    tokenize
} from '../../src/lib/search/local-search-index'

function rec(partial: Partial<BusinessRecord>): BusinessRecord {
    return {
        id: partial.id ?? 'id-1',
        lead_id: partial.lead_id ?? 'lead-1',
        name: partial.name ?? '',
        what: partial.what ?? '',
        public_note: partial.public_note ?? '',
        public_detail: partial.public_detail ?? '',
        status: partial.status ?? 'active',
        category: partial.category ?? '',
        cluster: partial.cluster ?? 0,
        city: partial.city ?? '',
        zip: partial.zip ?? '',
        website: partial.website ?? null,
        email: partial.email ?? null,
        phone: partial.phone ?? null,
        geocoded: partial.geocoded ?? false
    } as BusinessRecord
}

describe('local-search-index: tokenize', () => {
    it('handles empty / null / undefined / whitespace input', () => {
        expect(tokenize(null)).toEqual([])
        expect(tokenize(undefined)).toEqual([])
        expect(tokenize('')).toEqual([])
        expect(tokenize('   ')).toEqual([])
        expect(tokenize('\t\n ')).toEqual([])
    })

    it('lowercases and strips punctuation, keeping numbers and single chars', () => {
        expect(tokenize('Hello World')).toEqual(['hello', 'world'])
        expect(tokenize('AT&T')).toEqual(['at', 't'])
        expect(tokenize('shop 123')).toEqual(['shop', '123'])
        expect(tokenize('a')).toEqual(['a'])
        expect(tokenize("O'Brien")).toEqual(['o', 'brien'])
        expect(tokenize('foo/bar_baz qux')).toEqual(['foo', 'bar', 'baz', 'qux'])
    })

    it('keeps duplicate tokens (no dedup) and does NOT normalize accented chars (strips them)', () => {
        expect(tokenize('dog dog cat')).toEqual(['dog', 'dog', 'cat'])
        // non-ASCII letters are removed by the [^a-z0-9\s] strip, not folded
        expect(tokenize('café')).toEqual(['caf'])
        expect(tokenize('Café')).toEqual(['caf'])
        expect(tokenize('naïve')).toEqual(['na', 've'])
    })
})

describe('local-search-index: buildLocalIndex', () => {
    it('returns an empty map for empty records', () => {
        expect(buildLocalIndex([]).size).toBe(0)
    })

    it('indexes name/what/category/city tokens with field tags', () => {
        const idx = buildLocalIndex([
            rec({ name: 'Coffee Shop', what: 'beans', category: 'Food', city: 'Conroe' })
        ])
        expect(idx.get('coffee')).toEqual([{ recordIndex: 0, field: 'name' }])
        expect(idx.get('shop')).toEqual([{ recordIndex: 0, field: 'name' }])
        expect(idx.get('beans')).toEqual([{ recordIndex: 0, field: 'what' }])
        expect(idx.get('food')).toEqual([{ recordIndex: 0, field: 'category' }])
        expect(idx.get('conroe')).toEqual([{ recordIndex: 0, field: 'city' }])
    })

    it('dedupes repeated tokens within the same field of one record', () => {
        const idx = buildLocalIndex([rec({ name: 'Pizza Pizza' })])
        const bucket = idx.get('pizza')
        expect(bucket).toBeDefined()
        expect(bucket!.length).toBe(1)
        expect(bucket![0]).toEqual({ recordIndex: 0, field: 'name' })
    })

    it('indexes only the fields that are present', () => {
        const idx = buildLocalIndex([rec({ name: 'Solo' })])
        expect(idx.get('solo')).toEqual([{ recordIndex: 0, field: 'name' }])
        expect(idx.get('food')).toBeUndefined()
    })
})

describe('local-search-index: levenshteinCapped', () => {
    it('returns 0 for identical strings and correct distance otherwise', () => {
        expect(levenshteinCapped('kitten', 'kitten', 5)).toBe(0)
        expect(levenshteinCapped('kitten', 'sitting', 5)).toBe(3)
        expect(levenshteinCapped('abc', 'abd', 5)).toBe(1)
    })

    it('handles empty strings', () => {
        expect(levenshteinCapped('', 'abc', 5)).toBe(3)
        expect(levenshteinCapped('abc', '', 5)).toBe(3)
        expect(levenshteinCapped('', '', 5)).toBe(0)
    })

    it('returns Infinity when length difference exceeds max, and early-exits', () => {
        expect(levenshteinCapped('abc', 'abcdefgh', 2)).toBe(Number.POSITIVE_INFINITY)
        expect(levenshteinCapped('abcdef', 'xyz', 1)).toBe(Number.POSITIVE_INFINITY)
        // within budget still computed
        expect(levenshteinCapped('cofee', 'coffee', 1)).toBe(1)
    })
})

describe('local-search-index: expandFuzzyMatches', () => {
    it('returns [] for tokens shorter than 3 chars', () => {
        const idx = buildLocalIndex([rec({ name: 'Coffee' })])
        expect(expandFuzzyMatches(idx, 'co')).toEqual([])
        expect(expandFuzzyMatches(idx, '')).toEqual([])
    })

    it('excludes exact (distance 0) tokens but includes within-budget fuzzy tokens', () => {
        const idx = buildLocalIndex([rec({ name: 'Coffee' }), rec({ name: 'Mocha' })])
        const out = expandFuzzyMatches(idx, 'cofee')
        const tokens = out.map((m) => m.fuzzyToken)
        expect(tokens).toContain('coffee')
        expect(tokens).not.toContain('mocha') // distance too large
        // the exact token 'cofee' is not in the index, so no distance-0 entry exists
        expect(out.every((m) => m.fuzzyToken !== 'cofee')).toBe(true)
    })

    it('respects the length-based distance threshold', () => {
        const idx = buildLocalIndex([rec({ name: 'restaurant' })]) // len 10 → maxDistance 2
        // 'restarant' (drop one char) is distance 1 → included
        expect(expandFuzzyMatches(idx, 'restarant').map((m) => m.fuzzyToken)).toContain('restaurant')
    })
})

describe('local-search-index: scoreRecord', () => {
    const base = rec({ name: 'Coffee Shop', what: 'best pizza', category: 'Food', city: 'Conroe' })

    it('scores an exact name match highest', () => {
        const s = scoreRecord(base, 'coffee shop', ['coffee', 'shop'])
        expect(s).not.toBeNull()
        expect(s!.score).toBeGreaterThan(0)
    })

    it('scores a name-prefix match', () => {
        const s = scoreRecord(base, 'coffee', ['coffee'])
        expect(s).not.toBeNull()
        // prefix is weaker than exact
        const exact = scoreRecord(base, 'coffee shop', ['coffee', 'shop'])
        expect(s!.score).toBeLessThan(exact!.score)
    })

    it('scores whole-word token matches in non-name fields', () => {
        const s = scoreRecord(base, 'pizza', ['pizza'])
        expect(s).not.toBeNull()
        expect(s!.score).toBeGreaterThan(0)
    })

    it('falls back to substring matches when no whole-word hit', () => {
        const s = scoreRecord(rec({ name: 'Zoogle', what: 'x', category: 'y', city: 'z' }), 'oog', ['oog'])
        expect(s).not.toBeNull()
    })

    it('returns null when nothing matches', () => {
        expect(scoreRecord(base, 'qzxwv', ['qzxwv'])).toBeNull()
        expect(scoreRecord(rec({ name: '', what: '', category: '', city: '' }), 'x', ['x'])).toBeNull()
    })
})

describe('local-search-index: getLocalIndex / performLocalIndexSearch / localHitsToResults', () => {
    const records = [
        rec({ id: 'r0', lead_id: 'L0', name: 'Coffee Shop', what: 'beans', category: 'Food', city: 'Conroe' }),
        rec({ id: 'r1', lead_id: 'L1', name: 'Pizza Place', what: 'pizza', category: 'Food', city: 'Conroe' }),
        rec({ id: 'r2', lead_id: 'L2', name: 'Mocha Bar', what: 'coffee', category: 'Cafe', city: 'Montgomery' })
    ]

    beforeEach(() => {
        vi.mocked(getBusinessRecords).mockReturnValue(records)
    })

    it('getLocalIndex returns null when no records are loaded', () => {
        vi.mocked(getBusinessRecords).mockReturnValue([])
        expect(getLocalIndex()).toBeNull()
    })

    it('getLocalIndex builds and caches from the records array', () => {
        const a = getLocalIndex()
        const b = getLocalIndex()
        expect(a).not.toBeNull()
        expect(a!.index).toBe(b!.index) // Map is cached by reference identity
        expect(a!.index.get('coffee')).toBeDefined()
    })

    it('performLocalIndexSearch returns null without records and [] for empty query', () => {
        vi.mocked(getBusinessRecords).mockReturnValue([])
        expect(performLocalIndexSearch('coffee')).toBeNull()
        vi.mocked(getBusinessRecords).mockReturnValue(records)
        expect(performLocalIndexSearch('')).toEqual([])
        expect(performLocalIndexSearch('   ')).toEqual([])
    })

    it('performLocalIndexSearch ranks relevant records above others', () => {
        const hits = performLocalIndexSearch('coffee', 0, 18)
        expect(hits).not.toBeNull()
        // Coffee Shop (name) and Mocha Bar (what=coffee) should both be present
        const indices = hits!.map((h) => h.recordIndex).sort()
        expect(indices).toEqual([0, 2])
    })

    it('performLocalIndexSearch respects offset/limit slicing', () => {
        // query matching multiple: use a token present in several categories/names
        const hits = performLocalIndexSearch('food', 0, 1)
        expect(hits!.length).toBe(1)
        const hits2 = performLocalIndexSearch('food', 1, 1)
        expect(hits2!.length).toBe(1)
        expect(hits2![0].recordIndex).not.toBe(hits![0].recordIndex)
    })

    it('localHitsToResults maps hits to SearchResult with normalized score', () => {
        const hits = performLocalIndexSearch('coffee', 0, 18)!
        const results = localHitsToResults(hits)
        expect(results.length).toBeGreaterThan(0)
        for (const r of results) {
            expect(r).toHaveProperty('id')
            expect(r).toHaveProperty('name')
            expect(typeof r.score).toBe('number')
            expect(r.score).toBeGreaterThanOrEqual(0)
            expect(r.score).toBeLessThanOrEqual(1)
        }
    })
})

describe('local-search-index: empty-state suggestions + live-search flag', () => {
    it('returns top categories by frequency', () => {
        const records = [
            rec({ category: 'Food' }),
            rec({ category: 'Food' }),
            rec({ category: 'Cafe' }),
            rec({ category: '' })
        ]
        vi.mocked(getBusinessRecords).mockReturnValue(records)
        const suggestions = getSearchEngineEmptyStateSuggestions()
        expect(suggestions[0]).toBe('Food')
        expect(suggestions.length).toBeLessThanOrEqual(5)
    })

    it('returns [] for empty-state suggestions when no records', () => {
        vi.mocked(getBusinessRecords).mockReturnValue([])
        expect(getSearchEngineEmptyStateSuggestions()).toEqual([])
    })

    it('shouldPreferLiveSearch is false when the env flag is unset', () => {
        expect(shouldPreferLiveSearch()).toBe(false)
    })
})
