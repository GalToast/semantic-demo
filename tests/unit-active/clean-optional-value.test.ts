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
      'NULL',
      'null',
      'Null'
    ]) {
      expect(cleanOptionalValue(value)).toBeNull()
    }
  })

  it('trims surrounding whitespace from real values', () => {
    expect(cleanOptionalValue('  hello  ')).toBe('hello')
    expect(cleanOptionalValue('  Montgomery  ')).toBe('Montgomery')
  })

  it('preserves real string values', () => {
    expect(cleanOptionalValue('Montgomery')).toBe('Montgomery')
    expect(cleanOptionalValue('Café Latte')).toBe('Café Latte')
    expect(cleanOptionalValue('123 Main St')).toBe('123 Main St')
    expect(cleanOptionalValue('café')).toBe('café')
  })

  it('coerces non-string inputs to trimmed string', () => {
    expect(cleanOptionalValue(42)).toBe('42')
    expect(cleanOptionalValue(true)).toBe('true')
  })
})
