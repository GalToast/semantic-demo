/**
 * Focused parity tests for the special-character preprocessing and
 * Intl.Segmenter fallback added to the TS tokenizer paths. Mirrors the
 * .js canonical behavior so the .js, .ts-shadow, and src/lib ports stay
 * in agreement.
 *
 * Note: the canonical tokenizeSearchText filters out tokens of length 1
 * (e.g., the surviving "t" from "AT&T" is dropped). Test expectations
 * account for that.
 */

import { describe, it, expect } from 'vitest';
import { tokenizeSearchText as jsTokenize } from '../../js/modules/search-tokenizer.js';
import { tokenizeSearchText as shadowTokenize } from '../../js/modules/search-tokenizer.ts';
import { tokenizeSearchText as srcTokenize } from '../../src/lib/search/tokenizer.ts';

const allTokenizers = [
  ['js-canonical', jsTokenize],
  ['js-ts-shadow', shadowTokenize],
  ['src-lib-port', srcTokenize]
];

describe('tokenizer special-char parity', () => {
  for (const [name, tokenize] of allTokenizers) {
    describe(name, () => {
      it('strips smart/straight quotes and joins "O\'Brien" as one token', () => {
        // "O'Brien" → "OBrien" (quotes stripped) → one word "obrien"
        expect(tokenize("O'Brien")).toEqual(['obrien']);
      });

      it('splits "co-op" on hyphen to two tokens', () => {
        // Hyphen replaced with space, then Intl.Segmenter/word regex
        // keeps "co" and "op" as separate words.
        expect(tokenize('co-op')).toEqual(['co', 'op']);
      });

      it('keeps length-2+ tokens after slash and underscore split', () => {
        // "foo/bar_baz qux" → "foo bar baz qux" → all survive (length > 1)
        expect(tokenize('foo/bar_baz qux')).toEqual(['foo', 'bar', 'baz', 'qux']);
      });

      it('drops length-1 token after ampersand split', () => {
        // "AT&T" → "AT T" → "at" is a stop word, "t" is length 1 → []
        expect(tokenize('AT&T')).toEqual([]);
      });

      it('strips "@" and "#" prefixes; "1" is dropped as length-1', () => {
        // "#1 Roofing @Montgomery" → "1 Roofing Montgomery"
        // → "roofing" and "montgomery" survive; "1" is length 1
        const tokens = tokenize('#1 Roofing @Montgomery');
        expect(tokens).toContain('roofing');
        expect(tokens).toContain('montgomery');
        expect(tokens).not.toContain('1');
      });

      it('joins multi-word "Smith\'s Bakery" without the apostrophe', () => {
        const tokens = tokenize("Smith's Bakery");
        expect(tokens).toEqual(['smiths', 'bakery']);
      });
    });
  }

  it('all three implementations agree on the canonical O\'Brien case', () => {
    expect(jsTokenize("O'Brien")).toEqual(shadowTokenize("O'Brien"));
    expect(jsTokenize("O'Brien")).toEqual(srcTokenize("O'Brien"));
  });

  it('all three implementations agree on the canonical co-op case', () => {
    expect(jsTokenize('co-op')).toEqual(shadowTokenize('co-op'));
    expect(jsTokenize('co-op')).toEqual(srcTokenize('co-op'));
  });

  it('all three implementations agree on a multi-special-char business name', () => {
    // "O'Brien & Co." exercises quote strip, ampersand, period, length filter
    const a = jsTokenize("O'Brien & Co.");
    const b = shadowTokenize("O'Brien & Co.");
    const c = srcTokenize("O'Brien & Co.");
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });
});
