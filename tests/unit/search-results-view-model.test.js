import { describe, it, expect } from 'vitest';
import { buildSearchResultProps } from '../../js/modules/view-models/search-results-view-model.js';

describe('buildSearchResultProps', () => {
    const mockFormatters = {
        getSearchResultStrength: () => 75,
        getSearchResultStrengthLabel: (o, s) => `${s}% Match`,
        buildSearchRankLabel: () => '#1 Result',
        getSearchResultCardClasses: (o, anchor) => `card ${anchor ? 'anchor' : ''}`,
        buildSearchResultSnippet: () => 'Test snippet',
        describeCluster: (c) => c ? 'Retail' : '',
        formatBusinessName: (n) => n ? n.toUpperCase() : 'UNKNOWN'
    };

    const mockRenderContext = {
        trimmedQuery: 'test',
        topIndex: 0,
        anchorIndex: 1,
        topScore: 100
    };

    it('builds standard props correctly', () => {
        const result = {
            index: 5,
            point: {
                name: 'Test Store',
                city: 'Conroe ',
                website: 'test.com',
                cluster: 1
            }
        };

        const props = buildSearchResultProps(result, 2, mockRenderContext, mockFormatters);

        expect(props.index).toBe(5);
        expect(props.order).toBe(2);
        expect(props.strength).toBe(75);
        expect(props.strengthLabel).toBe('75% Match');
        expect(props.businessName).toBe('TEST STORE');
        expect(props.contextText).toBe('Retail \u00B7 Conroe');
        expect(props.badges).toEqual(['website']);
    });

    it('handles missing point data gracefully', () => {
        const result = {
            index: 1,
            point: null
        };

        const props = buildSearchResultProps(result, 0, mockRenderContext, mockFormatters);
        
        expect(props.cardClasses).toBe('card anchor'); // index matches anchorIndex 1
        expect(props.businessName).toBe('UNKNOWN');
        expect(props.contextText).toBe('Location unknown');
        expect(props.badges).toEqual([]);
    });
});
