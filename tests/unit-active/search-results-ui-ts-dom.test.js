import { beforeEach, describe, expect, it } from 'vitest'
import {
    applyEmptySemanticSearchState,
    applySemanticSearchErrorState,
    renderSearchResultItems,
    setSearchStateNamespace,
    dedupeNearDuplicateResults
} from '../../src/lib/search/results-ui.ts'

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
    }
}

function renderContext(overrides = {}) {
    return {
        trimmedQuery: 'coffee',
        topIndex: 2,
        anchorIndex: 2,
        topScore: 1,
        resultIndices: [2, 3, 4],
        ...overrides
    }
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
        `
        document.body.removeAttribute('data-panel-surface-detail')
        sessionStorage.clear()
    })

    it('legacy DOM render retired — SearchResults.svelte owns declarative rendering', () => {
        // Legacy imperative DOM render was retired (see results-ui.ts:531-539).
        // SearchResults.svelte + SearchResultItem.svelte now own #search-results
        // declaratively via searchState.results. The legacy function still publishes
        // events and updates state, but does not write to the DOM.
        const resultsEl = document.getElementById('search-results')
        const statusEl = document.getElementById('search-status')
        const results = [
            makeResult(1, 'Acme Coffee LLC', 'Conroe', 0.4),
            makeResult(2, 'Acme Coffee Inc', 'Conroe', 1),
            ...Array.from({ length: 10 }, (_, offset) =>
                makeResult(
                    offset + 3,
                    `Coffee Stop ${offset + 1}`,
                    offset % 2 ? 'Willis' : 'Conroe',
                    0.9 - offset * 0.03
                )
            )
        ]

        renderSearchResultItems(resultsEl, results, renderContext(), statusEl)

        // Legacy DOM attributes are no longer set — Svelte owns the DOM
        expect(resultsEl.dataset.legacyResultsSource).toBeUndefined()
        // But the function still updates appState
        expect(resultsEl.classList.contains('active')).toBe(true)
    })

    it('legacy clear retired — Svelte declarative rows replace imperative DOM', () => {
        const resultsEl = document.getElementById('search-results')
        const statusEl = document.getElementById('search-status')

        renderSearchResultItems(resultsEl, [makeResult(2, 'Acme Coffee Inc', 'Conroe', 1)], renderContext(), statusEl)
        // Legacy DOM items are no longer rendered — Svelte owns the DOM
        expect(resultsEl.querySelector('.search-result-item')).toBeNull()

        applyEmptySemanticSearchState(resultsEl, statusEl, 'zzzz')

        // Legacy clear still sets dataset and status text
        expect(resultsEl.dataset.legacyResultsSource).toBe('')
        expect(resultsEl.getAttribute('aria-hidden')).toBe('true')
        expect(statusEl.textContent).toBe('No matches found for "zzzz".')
    })

    it('renders a legacy full search error state for failed API searches', () => {
        const resultsEl = document.getElementById('search-results')
        const statusEl = document.getElementById('search-status')
        setSearchStateNamespace(resultsEl, {
            search: (query, options = {}) => {
                resultsEl.dataset.retryQuery = query
                resultsEl.dataset.retryPreferCached = String(options.preferCachedResults)
            }
        })

        applySemanticSearchErrorState(
            resultsEl,
            statusEl,
            'forced-surface-contract-search-error',
            new Error('forced-surface-contract-search-error')
        )

        const errorState = resultsEl.querySelector('.search-error-state')
        expect(errorState).not.toBeNull()
        expect(resultsEl.hidden).toBe(false)
        expect(resultsEl.classList.contains('active')).toBe(true)
        expect(resultsEl.getAttribute('aria-hidden')).toBe('false')
        expect(errorState?.querySelector('.search-error-kicker')?.textContent).toBe('Retry needed')
        expect(errorState?.querySelector('.search-error-text')?.textContent).toBe(
            'We could not finish "forced-surface-contract-search-error" just now. Retry the live search or clear it and keep exploring.'
        )
        expect(resultsEl.querySelector('.search-error-retry-btn')).not.toBeNull()
        expect(resultsEl.querySelector('.search-error-dismiss-btn')).not.toBeNull()

        resultsEl.querySelector('.search-error-retry-btn')?.click()
        expect(resultsEl.dataset.retryQuery).toBe('forced-surface-contract-search-error')
        expect(resultsEl.dataset.retryPreferCached).toBe('false')

        resultsEl.querySelector('.search-error-dismiss-btn')?.click()
        expect(resultsEl.querySelector('.search-error-state')).toBeNull()
        expect(resultsEl.classList.contains('active')).toBe(false)
        expect(resultsEl.getAttribute('aria-hidden')).toBe('true')
    })
})

describe('dedupeNearDuplicateResults', () => {
    it('keeps higher-score row when name+city are near-duplicates and preserves unique rows', () => {
        const results = [
            makeResult(10, 'Acme Coffee LLC', 'Conroe', 0.3),
            makeResult(20, 'Acme Coffee Inc', 'Conroe', 0.9),
            makeResult(30, 'Unique Bakery', 'Conroe', 0.8)
        ]
        const deduped = dedupeNearDuplicateResults(results)
        // Two rows: higher-score duplicate + unique
        expect(deduped).toHaveLength(2)
        // Higher-score row (index 20, score 0.9) retained
        expect(deduped[0].index).toBe(20)
        expect(deduped[0].score).toBe(0.9)
        // Unique row preserved
        expect(deduped[1].index).toBe(30)
        expect(deduped[1].score).toBe(0.8)
    })

    it('deduplicate-only pair collapses to one result', () => {
        const results = [
            makeResult(1, 'Best Diner LLC', 'Willis', 0.5),
            makeResult(2, 'Best Diner Inc', 'Willis', 0.7)
        ]
        const deduped = dedupeNearDuplicateResults(results)
        expect(deduped).toHaveLength(1)
        // Higher-score (index 2) wins
        expect(deduped[0].index).toBe(2)
        expect(deduped[0].score).toBe(0.7)
    })

    it('returns empty array unchanged', () => {
        expect(dedupeNearDuplicateResults([])).toEqual([])
    })

    it('returns single-element array unchanged', () => {
        const results = [makeResult(5, 'Solo Shop', 'Conroe', 0.6)]
        expect(dedupeNearDuplicateResults(results)).toHaveLength(1)
        expect(dedupeNearDuplicateResults(results)[0].index).toBe(5)
    })

    it('higher-score wins when duplicates appear in reverse order', () => {
        const results = [
            makeResult(7, 'Joe Coffee Inc', 'Conroe', 0.2),
            makeResult(8, 'Joe Coffee LLC', 'Conroe', 0.9),
            makeResult(9, 'Joe Coffee Co', 'Conroe', 0.5)
        ]
        const deduped = dedupeNearDuplicateResults(results)
        expect(deduped).toHaveLength(1)
        // Score 0.9 wins (index 8)
        expect(deduped[0].index).toBe(8)
        expect(deduped[0].score).toBe(0.9)
    })

    it('different cities are not deduplicated', () => {
        const results = [
            makeResult(1, 'Acme Coffee', 'Conroe', 0.8),
            makeResult(2, 'Acme Coffee', 'Willis', 0.9)
        ]
        const deduped = dedupeNearDuplicateResults(results)
        expect(deduped).toHaveLength(2)
    })

    it('preserves stable order of deduped results matching input order', () => {
        const results = [
            makeResult(1, 'Bakery', 'Conroe', 0.5),
            makeResult(2, 'Zebra Cafe', 'Willis', 0.9),
            makeResult(3, 'Bakery', 'Conroe', 0.8)
        ]
        const deduped = dedupeNearDuplicateResults(results)
        expect(deduped).toHaveLength(2)
        // First group by input order: Bakery (index 1, then replaced by index 3)
        expect(deduped[0].index).toBe(3)
        expect(deduped[0].score).toBe(0.8)
        // Second group: Zebra Cafe
        expect(deduped[1].index).toBe(2)
        expect(deduped[1].score).toBe(0.9)
    })
})
