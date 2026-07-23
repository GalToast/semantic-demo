/**
 * search-results-arrow-keys-render-contract.test.ts
 *
 * A2-8: Search results must not create one Tab stop per result.
 * The list should expose a single active result to Tab and use
 * arrow keys for intra-list movement (WAI-ARIA listbox pattern).
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SEARCH_RESULTS = resolve(import.meta.dirname, '../../src/components/SearchResults.svelte')
const SEARCH_RESULT_LIST = resolve(import.meta.dirname, '../../src/lib/components/search/SearchResultList.svelte')
const SEARCH_RESULT_ITEM = resolve(import.meta.dirname, '../../src/components/SearchResultItem.svelte')

function readSource(): string {
    return readFileSync(SEARCH_RESULTS, 'utf-8')
}

function readResultList(): string {
    return readFileSync(SEARCH_RESULT_LIST, 'utf-8')
}

describe('A2-8: search results arrow-key navigation', () => {
    const src = readSource()

    it('tracks the active result index via a derived value', () => {
        expect(src).toContain('activeIndex')
        expect(src).toMatch(/let\s+activeIndex\s*=\s*\$derived\.by/)
    })

    it('exposes only the active result as a tab stop (roving tabindex)', () => {
        const childSrc = readFileSync(SEARCH_RESULT_ITEM, 'utf8')
        expect(childSrc).toMatch(/tabindex=\{active \? 0 : -1\}/)
    })

    it('uses listbox/option ARIA roles on the container and results', () => {
        const resultListSrc = readResultList()
        expect(resultListSrc).toContain('role="listbox"')
        const childSrc = readFileSync(SEARCH_RESULT_ITEM, 'utf8')
        expect(childSrc).toContain('role="option"')
    })

    it('declares aria-activedescendant on the listbox container', () => {
        const resultListSrc = readResultList()
        expect(resultListSrc).toContain('aria-activedescendant=')
    })

    it('marks each option with aria-selected', () => {
        const childSrc = readFileSync(SEARCH_RESULT_ITEM, 'utf8')
        expect(childSrc).toContain('aria-selected={active}')
    })

    it('has a keydown handler on the results list container', () => {
        const resultListSrc = readResultList()
        expect(resultListSrc).toContain('onkeydown={onContainerKeyDown}')
    })

    it('keydown handler covers ArrowDown, ArrowUp, ArrowRight, ArrowLeft', () => {
        expect(src).toContain('ArrowDown')
        expect(src).toContain('ArrowUp')
        expect(src).toContain('ArrowRight')
        expect(src).toContain('ArrowLeft')
    })

    it('keydown handler covers Home and End keys', () => {
        expect(src).toContain("'Home'")
        expect(src).toContain("'End'")
    })

    it('keydown handler triggers click on Enter/Space', () => {
        expect(src).toContain("'Enter'")
        expect(src).toContain("' '")
        expect(src).toContain('handleResultClick')
    })

    it('keydown handler clears search on Escape', () => {
        expect(src).toContain("'Escape'")
        expect(src).toContain('onClear')
    })

    it('declares aria-keyshortcuts on the listbox container', () => {
        const resultListSrc = readResultList()
        expect(resultListSrc).toContain('aria-keyshortcuts=')
        expect(resultListSrc).toMatch(/aria-keyshortcuts="ArrowDown ArrowUp/)
    })

    it('applies visual focus indicator via active class on focused result', () => {
        const childSrc = readFileSync(SEARCH_RESULT_ITEM, 'utf8')
        expect(childSrc).toMatch(/active \? ' active' : ''/)
    })

    it('does not trap Tab — lets it move to the next landmark', () => {
        expect(src).toContain('Do NOT preventDefault for Tab')
    })
})
