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
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import SearchInput from '../../src/components/SearchInput.svelte';

describe('SearchInput component', () => {
    it('renders an input with id="search-input"', () => {
        const { container } = render(SearchInput);
        const input = container.querySelector('#search-input');
        expect(input).toBeTruthy();
        expect(input!.tagName).toBe('INPUT');
    });

    it('input has role="combobox" for ARIA pattern', () => {
        const { container } = render(SearchInput);
        const input = container.querySelector('#search-input');
        expect(input!.getAttribute('role')).toBe('combobox');
    });

    it('input has aria-expanded attribute', () => {
        const { container } = render(SearchInput);
        const input = container.querySelector('#search-input');
        expect(input!.hasAttribute('aria-expanded')).toBe(true);
    });

    it('input has aria-label="Search businesses"', () => {
        const { container } = render(SearchInput);
        const input = container.querySelector('#search-input');
        expect(input!.getAttribute('aria-label')).toBe('Search businesses');
    });

    it('input has aria-controls="search-result-list"', () => {
        const { container } = render(SearchInput);
        const input = container.querySelector('#search-input');
        expect(input!.getAttribute('aria-controls')).toBe('search-result-list');
    });

    it('input has placeholder text', () => {
        const { container } = render(SearchInput);
        const input = container.querySelector('#search-input') as HTMLInputElement;
        expect(input.placeholder).toBeTruthy();
        expect(input.placeholder.length).toBeGreaterThan(0);
    });
});
