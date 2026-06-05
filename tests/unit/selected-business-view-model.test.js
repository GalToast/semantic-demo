import { describe, it, expect } from 'vitest';
import { buildSelectedBusinessProps } from '../../js/modules/view-models/selected-business-view-model.js';

describe('buildSelectedBusinessProps', () => {
    const mockFormatters = {
        getBusinessNamePresentation: (name) => {
            if (!name || name === '-') return { display: 'Unknown', raw: '', showRaw: false };
            if (name === 'slug-name-123') return { display: 'Slug Name 123', raw: 'slug-name-123', showRaw: true };
            return { display: name, raw: name, showRaw: false };
        },
        sanitizePublicFacingNote: (what) => what || '',
        describeCluster: (c) => `Cluster ${c}`,
        getPublicRecordStatusLabel: (s) => s === 'active' ? 'Active' : 'Unknown Status',
        COPY: {
            selectedEmptyName: 'Empty Name',
            selectedEmptyWhat: 'Empty What',
            selectedEmptyRole: 'Empty Role',
            selectedEmptyTheme: 'Empty Theme',
            selectedEmptyStatus: 'Empty Status',
            selectedEmptyMap: 'Empty Map',
            selectedEmptyThread: 'Empty Thread',
            selectedFiledAs: (raw) => `Filed specifically as ${raw}`
        }
    };

    const mockAdapter = {
        getSelectedBusinessRoleLabel: () => 'Test Role',
        getInterestingBusinessNote: () => 'Interesting fact',
        buildSelectedMatchNarrative: () => 'Match narrative',
        describeThreadLensForPoint: () => 'Thread lens'
    };

    it('handles null point safely', () => {
        const props = buildSelectedBusinessProps(null, {}, mockAdapter, mockFormatters);
        expect(props.name).toBe('Empty Name');
        expect(props.isPopulated).toBe(false);
    });

    it('handles missing name and missing coords', () => {
        const point = { cluster: 1, status: 'active' };
        const props = buildSelectedBusinessProps(point, {}, mockAdapter, mockFormatters);
        
        expect(props.name).toBe('Unknown');
        expect(props.showFiledAs).toBe(false);
        expect(props.mapText).toBe('No geocoded point');
        expect(props.status).toBe('Active');
    });

    it('handles slug names and shows filedAs', () => {
        const point = { name: 'slug-name-123', lat: 30.1, lng: -95.2 };
        const props = buildSelectedBusinessProps(point, {}, mockAdapter, mockFormatters);
        
        expect(props.name).toBe('Slug Name 123');
        expect(props.showFiledAs).toBe(true);
        expect(props.filedAs).toBe('Filed specifically as slug-name-123');
        expect(props.mapText).toBe('Mapped at 30.1000, -95.2000');
    });

    it('formats badges and facts', () => {
        const point = {
            name: 'Test Corp',
            weather_sensitive: true,
            sensitivity_flags: ['outdoor'],
            website: 'https://test.com',
            email: 'hello@test.com',
            phone: '555-1234'
        };
        const props = buildSelectedBusinessProps(point, {}, mockAdapter, mockFormatters);
        
        expect(props.sensitivityBadges.length).toBe(2);
        expect(props.sensitivityBadges[0].class).toBe('weather');
        expect(props.sensitivityBadges[1].text).toBe('outdoor');

        expect(props.facts.length).toBe(3);
        expect(props.facts.find(f => f.label === 'test.com')).toBeDefined();
        expect(props.facts.find(f => f.label === 'hello@test.com')).toBeDefined();
    });
});
