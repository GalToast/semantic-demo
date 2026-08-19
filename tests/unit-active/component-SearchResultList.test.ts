/**
 * component-SearchResultList.test.ts — SearchResultList.svelte behavioral contract.
 *
 * Renders the real component in jsdom and asserts the DOM structure:
 * inline error banner, results count, list container, show-more button.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import SearchResultList from '../../src/lib/components/search/SearchResultList.svelte'

afterEach(() => cleanup())

const mockResult = (index: number) => ({
    index,
    lead_id: 100 + index,
    name: `Business ${index}`,
    category: 'HVAC',
    city: 'Houston',
    state: 'TX',
    similarity: 0.95,
    snippet: 'Great HVAC services'
})

function renderList(overrides: Partial<{}> = {}) {
    const defaults = {
        resultSlice: [mockResult(0), mockResult(1)],
        activeIndex: 0,
        renderContext: { trimmedQuery: 'hvac' },
        total: 5,
        visibleCount: 2,
        showMore: true,
        remaining: 3,
        isPeek: false,
        isInlineError: false,
        friendlyError: null,
        searchError: null,
        onContainerKeyDown: vi.fn(),
        onShowMore: vi.fn(),
        onResultClick: vi.fn(),
        onRetry: vi.fn()
    }
    return render(SearchResultList, { props: { ...defaults, ...overrides } })
}

describe('SearchResultList component', () => {
    it('renders the list container with role="list"', () => {
        const { container } = renderList()
        const list = container.querySelector('#search-result-list')
        expect(list).not.toBeNull()
        expect(list?.getAttribute('role')).toBe('list')
        expect(list?.getAttribute('aria-label')).toBe('Search result businesses')
    })

    it('renders results count with "X of Y" format', () => {
        const { container } = renderList({ total: 5, visibleCount: 2 })
        const count = container.querySelector('#search-results-count')
        expect(count?.textContent).toContain('2 of 5')
    })

    it('renders "All N matches" when all results visible', () => {
        const { container } = renderList({ total: 2, visibleCount: 2, showMore: false, remaining: 0 })
        const count = container.querySelector('#search-results-count')
        expect(count?.textContent).toContain('All 2')
    })

    it('renders "Top match" when total is 1', () => {
        const { container } = renderList({ total: 1, visibleCount: 1, showMore: false, remaining: 0 })
        const count = container.querySelector('#search-results-count')
        expect(count?.textContent).toContain('Top match')
    })

    it('renders show-more button when showMore is true', () => {
        const { container } = renderList({ showMore: true, remaining: 3 })
        const btn = container.querySelector('.search-show-more-btn')
        expect(btn).not.toBeNull()
        expect(btn?.textContent).toContain('Show 3 more results')
        expect(btn?.getAttribute('aria-label')).toBe('Show 3 more search results')
    })

    it('does not render show-more button when showMore is false', () => {
        const { container } = renderList({ showMore: false })
        expect(container.querySelector('.search-show-more-btn')).toBeNull()
    })

    it('calls onShowMore when show-more button is clicked', async () => {
        const onShowMore = vi.fn()
        const { container } = renderList({ showMore: true, remaining: 2, onShowMore })
        const btn = container.querySelector('.search-show-more-btn')!
        await fireEvent.click(btn)
        expect(onShowMore).toHaveBeenCalledTimes(1)
    })

    it('renders inline error banner when isInlineError is true', () => {
        const { container } = renderList({
            isInlineError: true,
            friendlyError: { title: 'Recovering', detail: 'Try again', technical: null },
            searchError: { query: 'hvac' }
        })
        const banner = container.querySelector('.search-error-inline-retry')
        expect(banner).not.toBeNull()
        expect(container.textContent).toContain('Recovering')
        expect(container.textContent).toContain('hvac')
    })

    it('does not render inline error banner when isInlineError is false', () => {
        const { container } = renderList({ isInlineError: false })
        expect(container.querySelector('.search-error-inline-retry')).toBeNull()
    })

    it('calls onRetry when retry button in inline error is clicked', async () => {
        const onRetry = vi.fn()
        const { container } = renderList({
            isInlineError: true,
            friendlyError: { title: 'Recovering', detail: null, technical: null },
            searchError: { query: 'hvac' },
            onRetry
        })
        const retryBtn = container.querySelector('.search-error-retry-btn')!
        await fireEvent.click(retryBtn)
        expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('renders result items', () => {
        const { container } = renderList()
        // SearchResultItem renders a button for each result
        const items = container.querySelectorAll('[id^="search-result-option-"]')
        expect(items.length).toBeGreaterThan(0)
    })

    it('calls onResultClick when a result button is clicked', async () => {
        const onResultClick = vi.fn()
        const { container } = renderList({ onResultClick })
        // SearchResultItem renders a button for each result
        const btn = container.querySelector('#search-result-list button')
        expect(btn).not.toBeNull()
        await fireEvent.click(btn!)
        expect(onResultClick).toHaveBeenCalled()
    })

    it('has tabindex="-1" on the list container', () => {
        const { container } = renderList()
        const list = container.querySelector('#search-result-list')
        expect(list?.getAttribute('tabindex')).toBe('-1')
    })

    it('has aria-keyshortcuts on the list container', () => {
        const { container } = renderList()
        const list = container.querySelector('#search-result-list')
        expect(list?.getAttribute('aria-keyshortcuts')).toBe('ArrowDown ArrowUp Home End Enter Escape')
    })

    it('renders empty list when resultSlice is empty', () => {
        const { container } = renderList({ resultSlice: [] })
        const items = container.querySelectorAll('[id^="search-result-option-"]')
        expect(items.length).toBe(0)
    })
})
