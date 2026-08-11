import { describe, it, expect, beforeEach } from 'vitest'
import { searchUseRerank, tokenizeSearchText, expandSearchIntent, countTokenMatches, SEARCH_STOP_WORDS } from '@lib/stores/search.svelte.ts'
import { writable, get } from 'svelte/store'

describe('src/lib/stores/search.svelte.ts — search rerank exports contract', () => {
    beforeEach(() => {
        // Ensure isolated default state for the writable flag.
        searchUseRerank.set(false)
    })

    it('(a) searchUseRerank is a writable store with default false', () => {
        expect(typeof searchUseRerank.set).toBe('function')
        expect(get(searchUseRerank)).toBe(false)
    })

    it('(a) searchUseRerank.set(true) flips value', () => {
        searchUseRerank.set(true)
        expect(get(searchUseRerank)).toBe(true)
        // reset so later tests start from baseline
        searchUseRerank.set(false)
        expect(get(searchUseRerank)).toBe(false)
    })

    it('(b) tokenizeSearchText is a function and returns an array for a simple string', () => {
        expect(typeof tokenizeSearchText).toBe('function')
        const result = tokenizeSearchText('hello world')
        expect(Array.isArray(result)).toBe(true)
        // tokenizer drops stop words and returns unique lowercase tokens
        expect(result).toEqual(['hello', 'world'])
    })

    it('(c) countTokenMatches is a function', () => {
        expect(typeof countTokenMatches).toBe('function')
    })

    it('(d) SEARCH_STOP_WORDS is exported and non-empty', () => {
        expect(SEARCH_STOP_WORDS).toBeDefined()
        // tokenizer exports it as ReadonlySet<string>
        expect((SEARCH_STOP_WORDS as unknown as Set<string>).size).toBeGreaterThan(0)
    })

    it('(e) expandSearchIntent is a function', () => {
        expect(typeof expandSearchIntent).toBe('function')
    })
})
