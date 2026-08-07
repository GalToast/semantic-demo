/**
 * search-results-arrow-keys-render-contract.test.ts
 *
 * A2-8: Search results must not create one Tab stop per result.
 * The list should expose a single active result to Tab and use
 * arrow keys for intra-list movement. The container is role="list"
 * (NOT listbox) with a roving-tabindex result button as the focus
 * mechanism — the ARIA sweep F3 pattern (see SearchResultList/Item).
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
        // Anchor to the live button tag — the legacy comment pin also contains
        // the ternary literal as text (ARIA sweep F3 pinned the old literals).
        const buttonTag = childSrc.match(/type="button"[^>]*>/)
        expect(buttonTag).not.toBeNull()
        expect(buttonTag![0]).toMatch(/tabindex=\{active \? 0 : -1\}/)
        expect(buttonTag![0].match(/tabindex=/g) || []).toHaveLength(1)
    })

    it('uses list semantics: container role="list", items are plain (no option role)', () => {
        const resultListSrc = readResultList()
        expect(resultListSrc).toMatch(/id="search-result-list"[^>]*role="list"/)
        const childSrc = readFileSync(SEARCH_RESULT_ITEM, 'utf8')
        const itemDiv = childSrc.match(/class="search-result-listitem"[^>]*>/)
        expect(itemDiv).not.toBeNull()
        expect(itemDiv![0]).not.toContain('role=')
        expect(itemDiv![0]).not.toContain('aria-selected')
    })

    it('does NOT declare aria-activedescendant on the container', () => {
        // The old literal survives only in the legacy comment pin — anchor the
        // absence check to the live container tag (role="list", no activedescendant).
        const resultListSrc = readResultList()
        const liveTag = resultListSrc.match(/id="search-result-list"[^>]*>/)
        expect(liveTag).not.toBeNull()
        expect(liveTag![0]).not.toContain('aria-activedescendant')
    })

    it('items carry no aria-selected (button roving tabindex is the focus mechanism)', () => {
        const childSrc = readFileSync(SEARCH_RESULT_ITEM, 'utf8')
        const itemDiv = childSrc.match(/class="search-result-listitem"[^>]*>/)
        expect(itemDiv).not.toBeNull()
        expect(itemDiv![0]).not.toContain('aria-selected')
        expect(childSrc).toMatch(/type="button"[\s\S]*?tabindex=\{active \? 0 : -1\}/)
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

    it('declares aria-keyshortcuts on the results list container', () => {
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
