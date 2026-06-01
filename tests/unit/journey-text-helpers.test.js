import { describe, it, expect, vi } from 'vitest';
import { truncateMicrocopy, getSharedTrailTopicLabel } from '../../js/modules/journey-text-helpers.js';

vi.mock('../../js/modules/utils/dom-formatters.js', () => ({
    cleanOptionalValue: vi.fn((v) => (v == null || String(v).trim() === '' || String(v).trim() === '-') ? '' : String(v).trim())
}));

describe('journey-text-helpers', () => {
    describe('truncateMicrocopy', () => {
        it('returns empty string for null/undefined/empty', () => {
            expect(truncateMicrocopy(null)).toBe('');
            expect(truncateMicrocopy(undefined)).toBe('');
            expect(truncateMicrocopy('')).toBe('');
        });

        it('returns text unchanged when under max length', () => {
            expect(truncateMicrocopy('short text')).toBe('short text');
        });

        it('truncates long text with ellipsis', () => {
            const longText = 'This is a very long piece of text that goes well beyond the default seventy-four character maximum limit';
            const result = truncateMicrocopy(longText);
            expect(result.endsWith('...')).toBe(true);
            expect(result.length).toBeLessThanOrEqual(78); // max + '...'
        });

        it('respects custom max length', () => {
            const text = 'Some text that is medium length and needs truncation at a specific point';
            const result = truncateMicrocopy(text, 20);
            expect(result.endsWith('...')).toBe(true);
            expect(result.length).toBeLessThanOrEqual(24);
        });

        it('cuts at word boundary when possible', () => {
            const text = 'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12 word13 word14';
            const result = truncateMicrocopy(text, 30);
            expect(result.endsWith('...')).toBe(true);
            // The text before "..." should be complete words separated by spaces
            const beforeEllipsis = result.replace('...', '');
            const words = beforeEllipsis.split(' ');
            // Each piece between spaces should be a full "wordN" token
            words.forEach(w => expect(w).toMatch(/^word\d+$/));
        });
    });

    describe('getSharedTrailTopicLabel', () => {
        it('returns null when either point is null', () => {
            expect(getSharedTrailTopicLabel(null, { name: 'B', what: 'coffee' })).toBeNull();
            expect(getSharedTrailTopicLabel({ name: 'A', what: 'coffee' }, null)).toBeNull();
        });

        it('returns "coffee trail" when both points mention coffee', () => {
            const a = { name: 'Coffee Bean', what: 'serves coffee' };
            const b = { name: 'The Coffee Place', what: 'drinks' };
            expect(getSharedTrailTopicLabel(a, b)).toBe('coffee trail');
        });

        it('returns shared what when both have the same what text', () => {
            const a = { name: 'A', what: 'auto repair' };
            const b = { name: 'B', what: 'Auto Repair' };
            expect(getSharedTrailTopicLabel(a, b)).toBe('auto repair');
        });

        it('returns null when what texts differ', () => {
            const a = { name: 'A', what: 'plumbing' };
            const b = { name: 'B', what: 'landscaping' };
            expect(getSharedTrailTopicLabel(a, b)).toBeNull();
        });

        it('returns null for generic what values', () => {
            const a = { name: 'A', what: 'local business' };
            const b = { name: 'B', what: 'Local Business' };
            expect(getSharedTrailTopicLabel(a, b)).toBeNull();

            const c = { name: 'C', what: 'Montgomery County Business' };
            const d = { name: 'D', what: 'montgomery county business' };
            expect(getSharedTrailTopicLabel(c, d)).toBeNull();
        });
    });
});
