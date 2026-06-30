import { describe, it, expect } from 'vitest'
import {
    pointHasGeocode,
    normalizeCityForFilter,
    isPointVisible,
    calculateSignalScore,
    highlightMatch,
    tokenizeSearchText,
    countTokenMatches,
    computeOverviewScatterOffsets
} from '../../src/lib/utils/geo-data'

describe('geo-data utilities', () => {
    describe('pointHasGeocode', () => {
        it('returns false for null/undefined', () => {
            expect(pointHasGeocode(null)).toBe(false)
            expect(pointHasGeocode(undefined)).toBe(false)
        })

        it('returns false for out-of-range lat/lng', () => {
            expect(pointHasGeocode({ lat: 40, lng: -95 })).toBe(false)
            expect(pointHasGeocode({ lat: 30, lng: -80 })).toBe(false)
        })

        it('returns true for valid Montgomery County coordinates', () => {
            expect(pointHasGeocode({ lat: 30.5, lng: -95.5 })).toBe(true)
        })
    })

    describe('normalizeCityForFilter', () => {
        it('normalizes known variants', () => {
            expect(normalizeCityForFilter('cleveland')).toBe('Cleveland')
            expect(normalizeCityForFilter('clevland')).toBe('Cleveland')
            expect(normalizeCityForFilter('cold spring')).toBe('Cold Spring')
            expect(normalizeCityForFilter('coldspring')).toBe('Cold Spring')
            expect(normalizeCityForFilter('cut and shoot')).toBe('Cut and Shoot')
        })

        it('rejects bad city names', () => {
            expect(normalizeCityForFilter('123')).toBe('Other / Unparsed')
            expect(normalizeCityForFilter('city (with parens)')).toBe('Other / Unparsed')
            expect(normalizeCityForFilter('montgomery county')).toBe('Other / Unparsed')
            expect(normalizeCityForFilter('a'.repeat(30))).toBe('Other / Unparsed')
        })
    })

    describe('calculateSignalScore', () => {
        it('returns 0 for null/undefined', () => {
            expect(calculateSignalScore(null)).toBe(0)
            expect(calculateSignalScore(undefined)).toBe(0)
        })

        it('sums signals correctly', () => {
            expect(calculateSignalScore({})).toBe(0)
            expect(calculateSignalScore({ website: 'http://example.com' })).toBe(1.35)
            expect(calculateSignalScore({ email: 'test@test.com' })).toBe(1.0)
            expect(calculateSignalScore({ phone: '555-5555' })).toBe(0.45)
            expect(calculateSignalScore({ status: 'active' })).toBe(0.55)
            expect(calculateSignalScore({ trivia: 'fun fact' })).toBe(0.35)
        })

        it('adds geocode bonus for valid coordinates', () => {
            expect(calculateSignalScore({ lat: 30, lng: -95 })).toBe(1.25)
        })
    })

    describe('highlightMatch', () => {
        it('returns empty string for empty input', () => {
            expect(highlightMatch(null, 'query')).toBe('')
            expect(highlightMatch('', 'query')).toBe('')
        })

        it('returns escaped text when no match', () => {
            expect(highlightMatch('Hello World', 'xyz')).toBe('Hello World')
        })

        it('wraps match in mark tag', () => {
            const result = highlightMatch('Hello World', 'world')
            expect(result).toContain('<mark class="search-result-match">')
            expect(result).toContain('</mark>')
            expect(result).toContain('World')
        })

        it('escapes HTML in input', () => {
            expect(highlightMatch('<script>alert(1)</script>', 'script')).not.toContain('<script>')
        })
    })

    describe('tokenizeSearchText', () => {
        it('tokenizes basic text', () => {
            expect(tokenizeSearchText('Hello World')).toEqual(['hello', 'world'])
        })

        it('removes stop words', () => {
            const stopWords = new Set(['the', 'and'])
            expect(tokenizeSearchText('the cat and dog', stopWords)).toEqual(['cat', 'dog'])
        })

        it('ignores tokens of length 1', () => {
            expect(tokenizeSearchText('a b c')).toEqual([])
        })

        it('handles unicode characters', () => {
            const result = tokenizeSearchText('café résumé')
            expect(result).toContain('café')
            expect(result).toContain('résumé')
        })
    })

    describe('countTokenMatches', () => {
        it('returns zero for empty inputs', () => {
            expect(countTokenMatches([], [])).toEqual({ exact: 0, prefix: 0 })
        })

        it('counts exact matches', () => {
            const field = ['coffee', 'shop', 'espresso']
            const query = ['coffee', 'latte']
            expect(countTokenMatches(field, query)).toEqual({ exact: 1, prefix: 0 })
        })

        it('counts prefix matches', () => {
            const field = ['coffeeshop', 'bakery']
            const query = ['coffe', 'bread']
            expect(countTokenMatches(field, query)).toEqual({ exact: 0, prefix: 1 })
        })
    })

    describe('isPointVisible', () => {
        const basePoints = [
            {
                lat: 30,
                lng: -95,
                cluster: '1',
                status: 'active',
                city: 'Cleveland',
                website: 'http://example.com',
                email: 'test@test.com'
            }
        ]

        it('matches when no filters active', () => {
            expect(
                isPointVisible(0, basePoints, null, {
                    status: 'all',
                    city: 'all',
                    website: false,
                    email: false,
                    geocoded: false
                })
            ).toBe(true)
        })

        it('filters by status', () => {
            expect(
                isPointVisible(0, basePoints, null, {
                    status: 'inactive',
                    city: 'all',
                    website: false,
                    email: false,
                    geocoded: false
                })
            ).toBe(false)
        })

        it('filters by city', () => {
            expect(
                isPointVisible(0, basePoints, null, {
                    status: 'all',
                    city: 'Houston',
                    website: false,
                    email: false,
                    geocoded: false
                })
            ).toBe(false)
        })

        it('filters by website presence', () => {
            const points = [{ ...basePoints[0], website: null }]
            expect(
                isPointVisible(0, points, null, {
                    status: 'all',
                    city: 'all',
                    website: true,
                    email: false,
                    geocoded: false
                })
            ).toBe(false)
        })
    })

    describe('computeOverviewScatterOffsets', () => {
        it('returns zero offsets for empty input', () => {
            // rawPositionsBuffer is now a required Float32Array (TS-enforced).
            // Empty buffer is fine — early-return guard handles sourcePoints.length < 2.
            expect(computeOverviewScatterOffsets([], new Float32Array(0))).toEqual([])
        })

        it('returns zero offsets for single point', () => {
            const result = computeOverviewScatterOffsets(
                [{ x: 1, y: 2, z: 3 }],
                new Float32Array([1, 2, 3])
            )
            expect(result).toHaveLength(1)
            expect(result[0]).toEqual({ x: 0, y: 0, z: 0 })
        })

        it('computes offsets for multiple points', () => {
            const points = [
                { x: 0, y: 0, z: 0 },
                { x: 0.5, y: 0.5, z: 0.5 },
                { x: 1, y: 1, z: 1 }
            ]
            const buffer = new Float32Array([0, 0, 0, 0.5, 0.5, 0.5, 1, 1, 1])
            const result = computeOverviewScatterOffsets(points, buffer)
            expect(result).toHaveLength(3)
            // Offsets should be finite numbers
            result.forEach((offset) => {
                expect(Number.isFinite(offset.x)).toBe(true)
                expect(Number.isFinite(offset.y)).toBe(true)
                expect(Number.isFinite(offset.z)).toBe(true)
            })
        })
    })
})
