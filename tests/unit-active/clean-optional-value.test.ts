import { describe, expect, it } from 'vitest'
import { cleanOptionalValue } from '../../src/lib/utils/dom-formatters'

describe('cleanOptionalValue', () => {
  it('returns null for nullish, empty, whitespace, and sentinel values', () => {
    for (const value of [
      null,
      undefined,
      '',
      '   ',
      'unknown',
      'Unknown',
      'not found',
      'none',
      'none detected',
      'n/a',
      'NULL'
    ]) {
      expect(cleanOptionalValue(value)).toBeNull()
    }
  })

  it('trims real values and coerces primitive values to strings', () => {
    expect(cleanOptionalValue('  Montgomery  ')).toBe('Montgomery')
    expect(cleanOptionalValue('Café Latte')).toBe('Café Latte')
    expect(cleanOptionalValue(42)).toBe('42')
    expect(cleanOptionalValue(true)).toBe('true')
  })
})
