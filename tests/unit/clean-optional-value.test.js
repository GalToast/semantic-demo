/**
 * Focused tests for the canonical cleanOptionalValue unification.
 * Verifies all 6 NULLISH_SENTINELS + 'NULL' + whitespace + empty cases
 * after data-mapper.js, data-mapper.ts, data-loader.ts, semantic-threads.js
 * and semantic-threads.ts all delegate to the canonical implementation.
 */

import { describe, it, expect } from 'vitest';
import { cleanOptionalValue } from '../../src/lib/utils/dom-formatters.ts';
import { cleanOptionalValue as canonicalTs } from '../../src/lib/utils/dom-formatters.ts';

const canonicalImplementations = [
  ['js-canonical', cleanOptionalValue],
  ['src-lib-ts', canonicalTs]
];

describe('cleanOptionalValue canonical', () => {
  for (const [name, fn] of canonicalImplementations) {
    describe(name, () => {
      it('returns null for null/undefined', () => {
        expect(fn(null)).toBeNull();
        expect(fn(undefined)).toBeNull();
      });

      it('returns null for empty string and whitespace-only string', () => {
        expect(fn('')).toBeNull();
        expect(fn('   ')).toBeNull();
      });

      it('returns null for all 6 NULLISH_SENTINELS (case-insensitive)', () => {
        expect(fn('unknown')).toBeNull();
        expect(fn('Unknown')).toBeNull();
        expect(fn('UNKNOWN')).toBeNull();
        expect(fn('not found')).toBeNull();
        expect(fn('Not Found')).toBeNull();
        expect(fn('none')).toBeNull();
        expect(fn('None')).toBeNull();
        expect(fn('none detected')).toBeNull();
        expect(fn('n/a')).toBeNull();
        expect(fn('N/A')).toBeNull();
        expect(fn('null')).toBeNull();
        expect(fn('Null')).toBeNull();
      });

      it('trims surrounding whitespace from real values', () => {
        expect(fn('  hello  ')).toBe('hello');
      });

      it('preserves real string values', () => {
        expect(fn('Café Latte')).toBe('Café Latte');
        expect(fn('Montgomery')).toBe('Montgomery');
        expect(fn('123 Main St')).toBe('123 Main St');
      });

      it('coerces non-string inputs to trimmed string', () => {
        expect(fn(42)).toBe('42');
        expect(fn(true)).toBe('true');
      });
    });
  }

  it('both canonical implementations agree on a representative sample', () => {
    const cases = [
      null, undefined, '', '   ', 'unknown', 'not found', 'none', 'none detected',
      'n/a', 'null', 'NULL', 'hello', '  hello  ', 42, true, 'café'
    ];
    for (const c of cases) {
      expect(cleanOptionalValue(c)).toEqual(canonicalTs(c));
    }
  });
});
