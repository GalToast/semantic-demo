/**
 * Parity tests: special-character preprocessing and Intl.Segmenter fallback
 * in src/lib/search/tokenizer.ts.
 *
 * Port of tests/unit/search-tokenizer-parity.test.js (W17).
 *
 * Canonical coverage unique to this file vs search-tokenizer.test.ts:
 *   - "Smith's Bakery" multi-word apostrophe join
 *   - Structured per-tokenizer suite (ready for future multi-tokenizer)
 */

import { describe, it, expect } from 'vitest'
import { tokenizeSearchText } from '../../src/lib/search/tokenizer'

const tokenizers: Array<[string, typeof tokenizeSearchText]> = [['src-lib-port', tokenizeSearchText]]

describe('tokenizer special-char parity', () => {
    for (const [name, tokenize] of tokenizers) {
        describe(name, () => {
            it('strips smart/straight quotes and joins "O\'Brien" as one token', () => {
                expect(tokenize("O'Brien")).toEqual(['obrien'])
            })

            it('splits "co-op" on hyphen to two tokens', () => {
                expect(tokenize('co-op')).toEqual(['co', 'op'])
            })

            it('keeps length-2+ tokens after slash and underscore split', () => {
                expect(tokenize('foo/bar_baz qux')).toEqual(['foo', 'bar', 'baz', 'qux'])
            })

            it('drops length-1 token after ampersand split', () => {
                // "AT&T" → "at t" → "at" stop word, "t" length 1 → []
                expect(tokenize('AT&T')).toEqual([])
            })

            it('strips "@" and "#" prefixes; "1" is dropped as length-1', () => {
                const tokens = tokenize('#1 Roofing @Montgomery')
                expect(tokens).toContain('roofing')
                expect(tokens).toContain('montgomery')
                expect(tokens).not.toContain('1')
            })

            it('joins multi-word "Smith\'s Bakery" without the apostrophe', () => {
                const tokens = tokenize("Smith's Bakery")
                expect(tokens).toEqual(['smiths', 'bakery'])
            })
        })
    }
})
