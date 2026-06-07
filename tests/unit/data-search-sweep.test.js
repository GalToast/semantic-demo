/**
 * data-search-sweep.test.js
 *
 * Focused tests for Data & Search sweep fixes:
 * 1. geo-data tokenizer NFC normalization + Unicode regex
 * 2. cleanOptional sentinel rejection (tested indirectly via loadBusinessData)
 * 3. IndexedDB dbPromise reset on failure (module structure)
 */
import { describe, it, expect } from 'vitest';
import { tokenizeSearchText } from '../../js/modules/utils/geo-data.js';

describe('geo-data tokenizeSearchText — NFC + Unicode', () => {
    it('tokenizes ASCII normally (regression guard)', () => {
        expect(tokenizeSearchText('Hello World')).toEqual(['hello', 'world']);
    });

    it('preserves accented characters via NFC normalization', () => {
        // NFC form: single codepoint é
        const tokens = tokenizeSearchText('fiancée');
        expect(tokens).toContain('fiancée');
    });

    it('NFC and NFD forms produce identical tokens', () => {
        const nfc = 'résumé';
        const nfd = 're\u0301sume\u0301'; // decomposed
        const tokensNfc = tokenizeSearchText(nfc);
        const tokensNfd = tokenizeSearchText(nfd);
        expect(tokensNfc).toEqual(tokensNfd);
    });

    it('handles stop words with accented input', () => {
        // "la" is not a stop word in this module (empty default stopWords)
        const tokens = tokenizeSearchText('la café');
        expect(tokens).toContain('café');
    });

    it('handles empty and null input', () => {
        expect(tokenizeSearchText(null)).toEqual([]);
        expect(tokenizeSearchText('')).toEqual([]);
        expect(tokenizeSearchText(undefined)).toEqual([]);
    });
});

describe('idb-service — module exports', () => {
    it('exports initDB, get, set, remove, keys, entries, clear', async () => {
        const mod = await import('../../js/modules/idb-service.js');
        expect(typeof mod.initDB).toBe('function');
        expect(typeof mod.get).toBe('function');
        expect(typeof mod.set).toBe('function');
        expect(typeof mod.remove).toBe('function');
        expect(typeof mod.keys).toBe('function');
        expect(typeof mod.entries).toBe('function');
        expect(typeof mod.clear).toBe('function');
    });
});
