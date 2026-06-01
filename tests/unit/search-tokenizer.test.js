import { describe, it, expect } from 'vitest';
import { tokenizeSearchText, expandSearchIntent, countTokenMatches } from '../../js/modules/search-tokenizer.js';

describe('search-tokenizer', () => {
    describe('tokenizeSearchText', () => {
        it('tokenizes lowercasing and splitting by words', () => {
            expect(tokenizeSearchText('Hello World')).toEqual(['hello', 'world']);
        });

        it('removes stop words and short tokens', () => {
            // "a", "the", "in", "of" are stop words. tokens <= 1 char are removed.
            expect(tokenizeSearchText('a dog in the park')).toEqual(['dog', 'park']);
        });

        it('deduplicates tokens', () => {
            expect(tokenizeSearchText('dog dog dog cat')).toEqual(['dog', 'cat']);
        });

        it('handles empty or null input', () => {
            expect(tokenizeSearchText(null)).toEqual([]);
            expect(tokenizeSearchText('')).toEqual([]);
            expect(tokenizeSearchText(undefined)).toEqual([]);
        });
    });

    describe('expandSearchIntent', () => {
        it('expands known single token aliases (dog)', () => {
            // "dog" should expand to various pet related terms
            const result = expandSearchIntent('dog', ['dog']);
            expect(result).toContain('puppy');
            expect(result).toContain('vet');
            expect(result).toContain('boarding');
            expect(result).toContain('dog'); // Original token is preserved
        });

        it('expands known phrase aliases (places to take dogs)', () => {
            const result = expandSearchIntent('places to take dogs', ['places', 'take', 'dogs']);
            expect(result).toContain('park');
            expect(result).toContain('grooming');
        });

        it('does not expand unrelated tokens', () => {
            const result = expandSearchIntent('computer', ['computer']);
            expect(result).toEqual(['computer']);
        });
    });

    describe('countTokenMatches', () => {
        it('counts exact matches', () => {
            const { exact, prefix } = countTokenMatches(['dog', 'park', 'tx'], ['dog', 'tx']);
            expect(exact).toBe(2);
            expect(prefix).toBe(0);
        });

        it('counts prefix matches', () => {
            const { exact, prefix } = countTokenMatches(['veterinary', 'clinic'], ['vet']);
            expect(exact).toBe(0);
            expect(prefix).toBe(1);
        });

        it('handles token matching both ways (field prefixes query)', () => {
            const { exact, prefix } = countTokenMatches(['vet'], ['veterinary']);
            expect(exact).toBe(0);
            expect(prefix).toBe(1);
        });

        it('handles empty arrays', () => {
            const { exact, prefix } = countTokenMatches(null, null);
            expect(exact).toBe(0);
            expect(prefix).toBe(0);
        });
    });
});
