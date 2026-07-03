/**
 * component-SearchInput.test.ts — Component test foundation for SearchInput.svelte
 *
 * Verifies:
 *  1. Renders an input element with id="search-input"
 *  2. Input has role="combobox" for ARIA combobox pattern
 *  3. Input has aria-expanded attribute (boolean for suggestion visibility)
 *  4. Input has aria-label="Search businesses" for screen readers
 *  5. Input has aria-controls pointing to search-result-list
 *  6. Input has placeholder text
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import SearchInput from '../../src/components/SearchInput.svelte'

const SEARCH_INPUT_SOURCE = resolve(__dirname, '../../src/components/SearchInput.svelte')

describe('SearchInput component', () => {
    it('renders an input with id="search-input"', () => {
        const { container } = render(SearchInput)
        const input = container.querySelector('#search-input')
        expect(input).toBeTruthy()
        expect(input!.tagName).toBe('INPUT')
    })

    it('input has role="combobox" for ARIA pattern', () => {
        const { container } = render(SearchInput)
        const input = container.querySelector('#search-input')
        expect(input!.getAttribute('role')).toBe('combobox')
    })

    it('input has aria-expanded attribute', () => {
        const { container } = render(SearchInput)
        const input = container.querySelector('#search-input')
        expect(input!.hasAttribute('aria-expanded')).toBe(true)
    })

    it('input has aria-label="Search businesses"', () => {
        const { container } = render(SearchInput)
        const input = container.querySelector('#search-input')
        expect(input!.getAttribute('aria-label')).toBe('Search businesses')
    })

    it('input has aria-controls="search-result-list"', () => {
        const { container } = render(SearchInput)
        const input = container.querySelector('#search-input')
        expect(input!.getAttribute('aria-controls')).toBe('search-result-list')
    })

    it('input has placeholder text', () => {
        const { container } = render(SearchInput)
        const input = container.querySelector('#search-input') as HTMLInputElement
        expect(input.placeholder).toBeTruthy()
        expect(input.placeholder.length).toBeGreaterThan(0)
    })

    it('W48-G: handleKeydown routes Enter to dispatchSearch + moves focus to first result', () => {
        // Regression: previously the keydown handler only handled Escape
        // and ArrowDown. Enter did nothing because the input isn't in a
        // <form>. Users typing-then-Enter saw no immediate action — they
        // had to wait the 300ms debounce.
        const src = readFileSync(SEARCH_INPUT_SOURCE, 'utf-8')
        expect(src).toMatch(/e\.key === 'Enter'/)
        // Enter must clear the debounce so the search fires immediately,
        // not after the 300ms debounce timer.
        expect(src).toMatch(/e\.key === 'Enter'[\s\S]*?clearTimeout\(debounceTimer\)/)
        // And it must fire dispatchSearch synchronously.
        expect(src).toMatch(/e\.key === 'Enter'[\s\S]*?dispatchSearch\(q\)/)
        // Finally it should move focus to the first result, matching the
        // WAI-ARIA combobox/listbox pattern (Enter submits + activates).
        expect(src).toMatch(/e\.key === 'Enter'[\s\S]*?data-order="0"[\s\S]*?first\?\.focus/)
    })
})
