import { describe, it, expect, beforeEach } from 'vitest';
import {
    isNumericOnlySearchQuery,
    resultMatchesNumericSearchQuery,
    mapSemanticSearchServiceResult,
    mapSemanticSearchResults,
    hydrateSemanticResultContexts
} from '../../js/modules/search-mapper.js';
import { state } from '../../js/state';

describe('search-mapper', () => {
    beforeEach(() => {
        // Reset state for each test
        state.points = [
            { lead_id: 101, name: 'Alpha Corp', lat: 30.1, lng: -95.1 },
            { lead_id: 102, name: 'Beta LLC', lat: 30.2, lng: -95.2 },
            { lead_id: 103, name: 'Gamma Inc', lat: 30.3, lng: -95.3, filterFlags: 1 } // example filtered point
        ];
        state.pointIndexByLeadId = new Map([
            ['101', 0],
            ['102', 1],
            ['103', 2]
        ]);
        state.activeClusterFilter = null;
        state.activeFilters = { status: 'all', city: 'all' };
        state.semanticResultContextByLeadId = new Map();
    });

    describe('isNumericOnlySearchQuery', () => {
        it('returns true for phone numbers and zip codes (3-10 digits)', () => {
            expect(isNumericOnlySearchQuery('123')).toBe(true);
            expect(isNumericOnlySearchQuery('12345')).toBe(true);
            expect(isNumericOnlySearchQuery('(555) 123-4567')).toBe(true);
            expect(isNumericOnlySearchQuery('+1 55 123 456')).toBe(true); // 11 digits, but wait! The logic says digits.length <= 10. Let's verify.
        });

        it('returns false for mixed alphanumeric or too few/many digits', () => {
            expect(isNumericOnlySearchQuery('12')).toBe(false); // Too short
            expect(isNumericOnlySearchQuery('12345678901')).toBe(false); // Too long
            expect(isNumericOnlySearchQuery('123 Main St')).toBe(false); // Alphanumeric
        });
    });

    describe('resultMatchesNumericSearchQuery', () => {
        it('matches numeric query against lead_id, phone, lat, lng', () => {
            const result = {
                point: { lead_id: 102, phone: '555-1234', lat: 30.222, lng: -95.222 }
            };
            expect(resultMatchesNumericSearchQuery(result, '102')).toBe(true);
            expect(resultMatchesNumericSearchQuery(result, '555')).toBe(true);
            expect(resultMatchesNumericSearchQuery(result, '302')).toBe(true); // matches lat digits '30222'
        });

        it('matches numeric query against address and naics context', () => {
            const result = {
                point: { lead_id: 102 },
                address: '1234 Elm St',
                naics: '54321'
            };
            expect(resultMatchesNumericSearchQuery(result, '1234')).toBe(true);
            expect(resultMatchesNumericSearchQuery(result, '54321')).toBe(true);
        });

        it('returns false if no match', () => {
            const result = {
                point: { lead_id: 102, phone: '555-1234' },
                address: 'Elm St'
            };
            expect(resultMatchesNumericSearchQuery(result, '999')).toBe(false);
        });
    });

    describe('mapSemanticSearchServiceResult', () => {
        it('maps valid service result to application model', () => {
            const row = {
                lead_id: '101',
                score: 0.95,
                public_note: 'A note',
                address: 'An address'
            };
            const mapped = mapSemanticSearchServiceResult(row);
            expect(mapped).not.toBeNull();
            expect(mapped.point.name).toBe('Alpha Corp');
            expect(mapped.score).toBe(0.95);
            expect(mapped.publicNote).toBe('A note');
            expect(mapped.address).toBe('An address');
        });

        it('uses row-level display names without mutating global point state', () => {
            const row = {
                lead_id: '101',
                name: '1845 Solutions',
                score: 0.95
            };
            const mapped = mapSemanticSearchServiceResult(row);
            expect(mapped).not.toBeNull();
            expect(mapped.point.name).toBe('1845 Solutions');
            expect(state.points[0].name).toBe('Alpha Corp');
        });

        it('maps static-dev mock rows to matching real points instead of fake display names', () => {
            state.points = [
                { lead_id: 101, name: 'Alpha Corp', what: 'Consulting', lat: 30.1, lng: -95.1 },
                { lead_id: 102, name: 'Blue Willow Coffee', what: 'Coffee shop', lat: 30.2, lng: -95.2 },
                { lead_id: 103, name: 'Gamma Inc', what: 'Contractor', lat: 30.3, lng: -95.3 }
            ];
            state.pointIndexByLeadId = new Map([
                ['101', 0],
                ['102', 1],
                ['103', 2]
            ]);

            const results = mapSemanticSearchResults([
                { lead_id: 'mock-coffee-1', name: 'Third Gen Coffee', city: 'The Woodlands', score: 0.95 },
                { lead_id: 'mock-coffee-2', name: 'Blue Door Coffee', city: 'Conroe', score: 0.9 }
            ]);

            expect(results).toHaveLength(2);
            expect(results[0].index).toBe(1);
            expect(results[1].index).toBe(1);
            expect(results[0].point.name).toBe('Blue Willow Coffee');
            expect(results[1].point.name).toBe('Blue Willow Coffee');
            expect(state.points[0].name).toBe('Alpha Corp');
        });

        it('returns null if point is not in pointIndexByLeadId', () => {
            const row = { lead_id: '999', score: 0.95 };
            expect(mapSemanticSearchServiceResult(row)).toBeNull();
        });

        // The exact behavior of isPointVisible depends on geo-data.js which isn't mocked here,
        // but assuming default behavior where points are visible if no activeFilters match.
    });

    describe('hydrateSemanticResultContexts', () => {
        it('hydrates context map in global state', () => {
            const results = [
                {
                    point: { lead_id: '101', name: 'Alpha Corp', city: 'Conroe' },
                    publicNote: 'Note',
                    publicDetail: 'Detail',
                    address: 'Addr',
                    naics: '123'
                }
            ];
            hydrateSemanticResultContexts(results);
            expect(state.semanticResultContextByLeadId.has('101')).toBe(true);
            expect(state.semanticResultContextByLeadId.get('101').name).toBe('Alpha Corp');
        });
    });
});
