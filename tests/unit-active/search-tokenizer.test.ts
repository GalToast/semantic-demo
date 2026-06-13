import { describe, expect, it } from 'vitest'
import {
  countTokenMatches,
  expandSearchIntent,
  tokenizeSearchText
} from '../../src/lib/search/tokenizer'

describe('search tokenizer', () => {
  it('lowercases, removes stop words, filters one-character tokens, and deduplicates', () => {
    expect(tokenizeSearchText('Hello World')).toEqual(['hello', 'world'])
    expect(tokenizeSearchText('a dog in the park')).toEqual(['dog', 'park'])
    expect(tokenizeSearchText('dog dog dog cat')).toEqual(['dog', 'cat'])
    expect(tokenizeSearchText(null)).toEqual([])
    expect(tokenizeSearchText(undefined)).toEqual([])
    expect(tokenizeSearchText('')).toEqual([])
  })

  it('normalizes composed and decomposed accented text to the same token set', () => {
    expect(tokenizeSearchText('caf\u00e9')).toContain('café')
    expect(tokenizeSearchText('cafe\u0301')).toContain('café')
    expect(tokenizeSearchText('fianc\u00e9e')).toEqual(tokenizeSearchText('fiance\u0301e'))
  })

  it('handles business-name punctuation without leaking punctuation tokens', () => {
    expect(tokenizeSearchText("O'Brien")).toEqual(['obrien'])
    expect(tokenizeSearchText('co-op')).toEqual(['co', 'op'])
    expect(tokenizeSearchText('foo/bar_baz qux')).toEqual(['foo', 'bar', 'baz', 'qux'])
    expect(tokenizeSearchText('AT&T')).toEqual([])

    const roofingTokens = tokenizeSearchText('#1 Roofing @Montgomery')
    expect(roofingTokens).toContain('roofing')
    expect(roofingTokens).toContain('montgomery')
    expect(roofingTokens).not.toContain('1')
  })

  it('expands dog/pet intent aliases while preserving original tokens', () => {
    const singleToken = expandSearchIntent('dog', ['dog'])
    expect(singleToken).toEqual(expect.arrayContaining(['dog', 'puppy', 'vet', 'boarding']))

    const phrase = expandSearchIntent('places to take dogs', ['places', 'take', 'dogs'])
    expect(phrase).toEqual(expect.arrayContaining(['dogs', 'park', 'grooming']))

    expect(expandSearchIntent('computer', ['computer'])).toEqual(['computer'])
  })

  it('counts exact and bidirectional prefix matches', () => {
    expect(countTokenMatches(['dog', 'park', 'tx'], ['dog', 'tx'])).toEqual({ exact: 2, prefix: 0 })
    expect(countTokenMatches(['veterinary', 'clinic'], ['vet'])).toEqual({ exact: 0, prefix: 1 })
    expect(countTokenMatches(['vet'], ['veterinary'])).toEqual({ exact: 0, prefix: 1 })
    expect(countTokenMatches(null as unknown as string[], null as unknown as string[])).toEqual({ exact: 0, prefix: 0 })
  })
})
