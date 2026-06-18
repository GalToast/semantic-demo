import { describe, it, expect, vi } from 'vitest';
import { truncateMicrocopy, getSharedTrailTopicLabel } from '../../src/lib/journey/text-helpers.ts';

vi.mock('../../src/lib/utils/dom-formatters.ts', () => ({
    cleanOptionalValue: vi.fn((v) => (v == null || String(v).trim() === '' || String(v).trim() === '-') ? '' : String(v).trim())
}));

describe('journey-text-helpers', () => {
    describe('truncateMicrocopy', () => {
        it('returns empty string for null/undefined/empty/dash', () => {
            expect(truncateMicrocopy(null)).toBe('');
            expect(truncateMicrocopy(undefined)).toBe('');
            expect(truncateMicrocopy('')).toBe('');
            expect(truncateMicrocopy('-')).toBe('');
        });

        it('returns sanitized text unchanged regardless of length', () => {
            const longText = 'This is a very long piece of text that goes well beyond the default seventy-four character maximum limit and would have been truncated by the previous implementation';
            expect(truncateMicrocopy(longText)).toBe(longText);
            expect(truncateMicrocopy(longText, 20)).toBe(longText);
            expect(truncateMicrocopy(longText, 30)).toBe(longText);
        });

        it('trims leading/trailing whitespace via cleanOptionalValue', () => {
            expect(truncateMicrocopy('  padded text  ')).toBe('padded text');
        });

        it('does not insert ellipsis anywhere (CSS does the visual clipping now)', () => {
            const longText = 'a'.repeat(500);
            const result = truncateMicrocopy(longText);
            expect(result).not.toContain('...');
            expect(result).not.toContain('…');
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
