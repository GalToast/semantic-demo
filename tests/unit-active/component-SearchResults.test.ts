/**
 * component-SearchResults.test.ts — Component test for SearchResults.svelte
 *
 * Uses source-inspection (readFileSync + string assertions) to verify the
 * a11y/structure contract. The component imports from multiple stores
 * (searchState, navigation, filter) which hit circular dependency chains
 * in the vitest environment, preventing a full render().
 *
 * Verifies:
 *  1. Root wrapper #search-results with .search-results-wrapper class
 *  2. Loading state .search-loading with spinner and text
 *  3. Error state .search-error-state with role="status" aria-live="polite"
 *  4. Empty state .search-empty-state with role="status" aria-live="polite"
 *  5. Results count #search-results-count with role="status" aria-live="polite"
 *  6. Result list #search-result-list with role="listbox" and aria-label
 *  7. Show-more button .search-show-more-btn with aria-expanded="false"
 *  8. Keyboard aria-keyshortcuts on result list container
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const SEARCH_RESULTS_PATH = resolve(__dirname, '../../src/components/SearchResults.svelte');

function readSource(): string {
    return readFileSync(SEARCH_RESULTS_PATH, 'utf-8');
}

describe('SearchResults component', () => {
    let source: string;

    beforeAll(() => {
        source = readSource();
    });

    it('root wrapper #search-results with .search-results-wrapper class', () => {
        expect(source).toContain('id="search-results"');
        expect(source).toContain('class="search-results-wrapper"');
    });

    it('loading state .search-loading with spinner and text', () => {
        expect(source).toContain('class="search-loading"');
        expect(source).toContain('class="search-loading-spinner"');
        expect(source).toContain('class="search-loading-text"');
        expect(source).toContain('Searching...');
    });

    it('error state .search-error-state with role="status" and aria-live="polite"', () => {
        expect(source).toContain('class="search-error-state" role="status" aria-live="polite"');
        expect(source).toContain('search-error-kicker');
        expect(source).toContain('Retry needed');
    });

    it('empty state .search-empty-state with role="status" and aria-live="polite"', () => {
        expect(source).toContain('class="search-empty-state');
        expect(source).toContain('role="status" aria-live="polite"');
        expect(source).toContain('search-empty-title');
        expect(source).toContain('No results found');
    });

    it('results count #search-results-count with role="status" and aria-live="polite"', () => {
        expect(source).toContain('id="search-results-count"');
        expect(source).toContain('role="status" aria-live="polite"');
        expect(source).toContain('aria-atomic="true"');
    });

    it('result list #search-result-list with role="listbox" and aria-label', () => {
        expect(source).toContain('id="search-result-list"');
        expect(source).toContain('class="search-result-list"');
        expect(source).toContain('role="listbox"');
        expect(source).toContain('aria-label="Search result businesses"');
    });

    it('show-more button .search-show-more-btn with aria-expanded="false"', () => {
        expect(source).toContain('class="search-show-more-btn"');
        expect(source).toContain('aria-expanded="false"');
        expect(source).toContain('aria-controls="search-result-list"');
        expect(source).toContain('aria-describedby="search-results-count"');
    });

    it('keyboard aria-keyshortcuts on result list container', () => {
        expect(source).toContain('aria-keyshortcuts="ArrowDown ArrowUp ArrowLeft ArrowRight Home End Enter Escape"');
    });
});
