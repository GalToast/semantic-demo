import { beforeEach, describe, expect, it } from 'vitest';
import {
    applyEmptySemanticSearchState,
    applySemanticSearchErrorState,
    renderSearchResultItems
} from '../../src/lib/search/results-ui.ts';

function makeResult(index, name, city, score = 1, extra = {}) {
    return {
        index,
        score,
        point: {
            name,
            city,
            what: 'Coffee shop',
            ...extra.point
        },
        publicNote: extra.publicNote || '',
        publicDetail: extra.publicDetail || ''
    };
}

function renderContext(overrides = {}) {
    return {
        trimmedQuery: 'coffee',
        topIndex: 2,
        anchorIndex: 2,
        topScore: 1,
        resultIndices: [2, 3, 4],
        ...overrides
    };
}

describe('search-results-ui.ts legacy DOM rendering', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <input id="search-input" value="coffee" />
            <button id="btn-synthesize" type="button"></button>
            <div class="search-container">
                <div id="search-results"></div>
                <div id="search-status"></div>
            </div>
            <div id="search-spinner"></div>
        `;
        document.body.removeAttribute('data-panel-surface-detail');
        sessionStorage.clear();
    });

    it('renders deduped legacy rows and expands via the show-more control', () => {
        const resultsEl = document.getElementById('search-results');
        const statusEl = document.getElementById('search-status');
        const results = [
            makeResult(1, 'Acme Coffee LLC', 'Conroe', 0.4),
            makeResult(2, 'Acme Coffee Inc', 'Conroe', 1),
            ...Array.from({ length: 10 }, (_, offset) =>
                makeResult(offset + 3, `Coffee Stop ${offset + 1}`, offset % 2 ? 'Willis' : 'Conroe', 0.9 - offset * 0.03)
            )
        ];

        renderSearchResultItems(resultsEl, results, renderContext(), statusEl);

        expect(resultsEl.dataset.legacyResultsSource).toBe('legacy');
        expect(resultsEl.dataset.legacyResultsCount).toBe('11');
        expect(resultsEl.dataset.legacyResultsAnchor).toBe('2');
        expect(resultsEl.querySelector('#search-result-1')).toBeNull();
        expect(resultsEl.querySelector('#search-result-2')).not.toBeNull();
        expect(resultsEl.querySelectorAll('.search-result-item')).toHaveLength(10);
        expect(resultsEl.querySelector('#search-results-count')?.textContent).toBe('10 of 11\u00B71 behind');

        const showMore = resultsEl.querySelector('[data-legacy-show-more="1"]');
        expect(showMore).not.toBeNull();
        showMore.click();

        expect(sessionStorage.getItem('searchVisibleCount')).toBe('11');
        expect(resultsEl.querySelectorAll('.search-result-item')).toHaveLength(11);
        expect(resultsEl.querySelector('#search-results-count')?.textContent).toBe('All 11 matches');
        expect(resultsEl.getAttribute('aria-hidden')).toBe('false');
    });

    it('clears stale legacy rows when the search result state becomes empty', () => {
        const resultsEl = document.getElementById('search-results');
        const statusEl = document.getElementById('search-status');

        renderSearchResultItems(
            resultsEl,
            [makeResult(2, 'Acme Coffee Inc', 'Conroe', 1)],
            renderContext(),
            statusEl
        );
        expect(resultsEl.querySelector('.search-result-item')).not.toBeNull();

        applyEmptySemanticSearchState(resultsEl, statusEl, 'zzzz');

        expect(resultsEl.querySelector('.search-result-item')).toBeNull();
        expect(resultsEl.querySelector('[data-legacy-search-results="1"]')).toBeNull();
        expect(resultsEl.dataset.legacyResultsSource).toBe('');
        expect(resultsEl.getAttribute('aria-hidden')).toBe('true');
        expect(statusEl.textContent).toBe('No matches found for "zzzz".');
    });

    it('renders a legacy full search error state for failed API searches', () => {
        const resultsEl = document.getElementById('search-results');
        const statusEl = document.getElementById('search-status');
        resultsEl._searchStateNamespace = {
            search: (query, options = {}) => {
                resultsEl.dataset.retryQuery = query;
                resultsEl.dataset.retryPreferCached = String(options.preferCachedResults);
            }
        };

        applySemanticSearchErrorState(resultsEl, statusEl, 'forced-surface-contract-search-error', new Error('forced-surface-contract-search-error'));

        const errorState = resultsEl.querySelector('.search-error-state');
        expect(errorState).not.toBeNull();
        expect(resultsEl.hidden).toBe(false);
        expect(resultsEl.classList.contains('active')).toBe(true);
        expect(resultsEl.getAttribute('aria-hidden')).toBe('false');
        expect(errorState?.querySelector('.search-error-kicker')?.textContent).toBe('Retry needed');
        expect(errorState?.querySelector('.search-error-text')?.textContent).toBe('We could not finish "forced-surface-contract-search-error" just now. Retry the live search or clear it and keep exploring.');
        expect(resultsEl.querySelector('.search-error-retry-btn')).not.toBeNull();
        expect(resultsEl.querySelector('.search-error-dismiss-btn')).not.toBeNull();

        resultsEl.querySelector('.search-error-retry-btn')?.click();
        expect(resultsEl.dataset.retryQuery).toBe('forced-surface-contract-search-error');
        expect(resultsEl.dataset.retryPreferCached).toBe('false');

        resultsEl.querySelector('.search-error-dismiss-btn')?.click();
        expect(resultsEl.querySelector('.search-error-state')).toBeNull();
        expect(resultsEl.classList.contains('active')).toBe(false);
        expect(resultsEl.getAttribute('aria-hidden')).toBe('true');
    });
});
