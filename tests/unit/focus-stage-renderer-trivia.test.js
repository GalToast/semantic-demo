import { describe, expect, it } from 'vitest';
import {
    getInterestingBusinessNote,
    rejectsTrivia,
    TRIVIA_BLOCKLIST
} from '../../js/modules/focus-stage-renderer.js';

describe('focus-stage trivia filter', () => {
    it('rejects every exact trivia placeholder', () => {
        for (const phrase of TRIVIA_BLOCKLIST.exact) {
            expect(rejectsTrivia(phrase), phrase).toBe(true);
            expect(getInterestingBusinessNote({ trivia: phrase }), phrase).toBeNull();
        }
    });

    it('rejects every generic trivia equality phrase', () => {
        for (const phrase of TRIVIA_BLOCKLIST.equals) {
            expect(rejectsTrivia(phrase), phrase).toBe(true);
            expect(getInterestingBusinessNote({ trivia: phrase }), phrase).toBeNull();
        }
    });

    it('rejects every internal trivia substring marker', () => {
        for (const marker of TRIVIA_BLOCKLIST.substrings) {
            const phrase = `Public note with ${marker} marker for suppression.`;
            expect(rejectsTrivia(phrase), marker).toBe(true);
            expect(getInterestingBusinessNote({ trivia: phrase }), marker).toBeNull();
        }
    });

    it('rejects every negative trivia prefix', () => {
        for (const prefix of TRIVIA_BLOCKLIST.prefixes) {
            const phrase = `${prefix}verified public story is available yet`;
            expect(rejectsTrivia(phrase), prefix).toBe(true);
            expect(getInterestingBusinessNote({ trivia: phrase }), prefix).toBeNull();
        }
    });

    it('keeps useful public trivia', () => {
        const trivia = 'Family-owned nursery known locally for native plants and seasonal workshops.';
        expect(rejectsTrivia(trivia)).toBe(false);
        expect(getInterestingBusinessNote({ trivia })).toBe(trivia);
    });
});
