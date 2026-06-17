/**
 * component-SearchBar.test.ts — Component test for SearchBar.svelte
 *
 * Verifies:
 *  1. Renders div.search-container with role="search"
 *  2. Container has aria-label="Search businesses in the semantic field"
 *  3. Renders SearchInput sub-component (input#search-input present)
 *  4. Renders SearchResults sub-component (#search-results present)
 *  5. Default state: container is not expanded
 *  6. When expanded=true prop, container gets .expanded class
 *  7. When panelContained=true prop, container gets .info-panel-contained class
 *  8. Container does not have .searching class by default
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import SearchBar from '../../src/components/SearchBar.svelte';

describe('SearchBar component', () => {
    it('renders div.search-container with role="search"', () => {
        const { container } = render(SearchBar);
        const search = container.querySelector('.search-container');
        expect(search).toBeTruthy();
        expect(search!.getAttribute('role')).toBe('search');
    });

    it('container has aria-label="Search businesses in the semantic field"', () => {
        const { container } = render(SearchBar);
        const search = container.querySelector('.search-container');
        expect(search!.getAttribute('aria-label')).toBe('Search businesses in the semantic field');
    });

    it('renders SearchInput sub-component (#search-input present)', () => {
        const { container } = render(SearchBar);
        const input = container.querySelector('#search-input');
        expect(input).toBeTruthy();
    });

    it('renders SearchResults sub-component (#search-results present)', () => {
        const { container } = render(SearchBar);
        const results = container.querySelector('#search-results');
        expect(results).toBeTruthy();
    });

    it('default state: container is not expanded', () => {
        const { container } = render(SearchBar);
        const search = container.querySelector('.search-container');
        expect(search!.classList.contains('expanded')).toBe(false);
    });

    it('when expanded=true prop, container gets .expanded class', () => {
        const { container } = render(SearchBar, { props: { expanded: true } });
        const search = container.querySelector('.search-container');
        expect(search!.classList.contains('expanded')).toBe(true);
    });

    it('when panelContained=true prop, container gets .info-panel-contained class', () => {
        const { container } = render(SearchBar, { props: { panelContained: true } });
        const search = container.querySelector('.search-container');
        expect(search!.classList.contains('info-panel-contained')).toBe(true);
    });

    it('container does not have .searching class by default', () => {
        const { container } = render(SearchBar);
        const search = container.querySelector('.search-container');
        expect(search!.classList.contains('searching')).toBe(false);
    });
});
