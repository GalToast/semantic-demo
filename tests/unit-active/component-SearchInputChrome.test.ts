/**
 * component-SearchInputChrome.test.ts — SearchInputChrome.svelte behavioral contract.
 *
 * Renders the real component in jsdom and asserts the DOM structure:
 * search label, lane pill, input wrap, back button, icon, shortcut hint,
 * clear button, cancel button, status messages.
 *
 * Note: SearchInputChrome uses Svelte snippets (children prop) for the
 * input element. We pass a minimal snippet to test the chrome wrapper.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import SearchInputChrome from '../../src/lib/components/search/SearchInputChrome.svelte'

afterEach(() => cleanup())

// Minimal snippet that renders an input element
const inputSnippet = ({}: any) => {
    // Svelte 5 snippet rendering in tests — we pass a function that returns
    // the input element markup. In the test environment, the snippet is
    // rendered via {@render children()}.
    return {
        type: 'input',
        props: { type: 'search', placeholder: 'Search businesses', 'data-testid': 'search-input' }
    }
}

function renderChrome(overrides: Partial<{}> = {}) {
    const defaults = {
        children: inputSnippet,
        hasQuery: false,
        showLoading: false,
        status: 'idle',
        hasResults: false,
        searchActive: false,
        onClear: vi.fn(),
        onClearQuery: vi.fn(),
        onCancel: vi.fn()
    }
    return render(SearchInputChrome, { props: { ...defaults, ...overrides } })
}

describe('SearchInputChrome component', () => {
    it('renders the search label', () => {
        const { container } = renderChrome()
        const label = container.querySelector('.search-label')
        expect(label).not.toBeNull()
        expect(container.querySelector('.search-label-text')?.textContent).toBe('Search')
    })

    it('renders the semantic lane pill', () => {
        const { container } = renderChrome()
        const pill = container.querySelector('#semantic-lane-pill')
        expect(pill).not.toBeNull()
        expect(pill?.getAttribute('data-state')).toBe('healthy')
        expect(pill?.querySelector('.lane-pill-dot')).not.toBeNull()
    })

    it('renders the search input wrap', () => {
        const { container } = renderChrome()
        const wrap = container.querySelector('.search-input-wrap')
        expect(wrap).not.toBeNull()
    })

    it('renders the search icon', () => {
        const { container } = renderChrome()
        const icon = container.querySelector('.search-icon')
        expect(icon).not.toBeNull()
        expect(icon?.getAttribute('aria-hidden')).toBe('true')
    })

    it('renders the shortcut hint', () => {
        const { container } = renderChrome()
        const hint = container.querySelector('.search-shortcut-hint')
        expect(hint).not.toBeNull()
        expect(hint?.textContent).toBe('/')
        expect(hint?.getAttribute('aria-hidden')).toBe('true')
    })

    it('hides clear button when hasQuery is false', () => {
        const { container } = renderChrome({ hasQuery: false })
        const clearBtn = container.querySelector('#search-clear-btn')
        expect(clearBtn?.hasAttribute('hidden')).toBe(true)
    })

    it('shows clear button when hasQuery is true', () => {
        const { container } = renderChrome({ hasQuery: true })
        const clearBtn = container.querySelector('#search-clear-btn')
        expect(clearBtn?.hasAttribute('hidden')).toBe(false)
    })

    it('renders cancel button when showLoading is true', () => {
        const { container } = renderChrome({ showLoading: true })
        const cancelBtn = container.querySelector('#search-cancel-btn')
        expect(cancelBtn).not.toBeNull()
        expect(cancelBtn?.textContent).toBe('Cancel')
    })

    it('does not render cancel button when showLoading is false', () => {
        const { container } = renderChrome({ showLoading: false })
        expect(container.querySelector('#search-cancel-btn')).toBeNull()
    })

    it('renders back button (hidden in idle via CSS)', () => {
        const { container } = renderChrome()
        const backBtn = container.querySelector('.search-back-btn')
        expect(backBtn).not.toBeNull()
        expect(backBtn?.getAttribute('aria-label')).toBe('Back to overview')
    })

    it('shows back button when searchActive is true', () => {
        const { container } = renderChrome({ searchActive: true })
        const wrap = container.querySelector('.search-input-wrap')
        expect(wrap?.classList.contains('search-active')).toBe(true)
    })

    it('applies searching class when showLoading is true', () => {
        const { container } = renderChrome({ showLoading: true })
        const wrap = container.querySelector('.search-input-wrap')
        expect(wrap?.classList.contains('searching')).toBe(true)
    })

    it('renders status div', () => {
        const { container } = renderChrome()
        const status = container.querySelector('#search-status')
        expect(status).not.toBeNull()
        expect(status?.getAttribute('role')).toBe('status')
        expect(status?.getAttribute('aria-live')).toBe('polite')
    })

    it('hides status div when status is idle', () => {
        const { container } = renderChrome({ status: 'idle' })
        const status = container.querySelector('#search-status')
        expect(status?.hasAttribute('hidden')).toBe(true)
    })

    it('shows status div when status is error', () => {
        const { container } = renderChrome({ status: 'error' })
        const status = container.querySelector('#search-status')
        expect(status?.hasAttribute('hidden')).toBe(false)
        expect(container.textContent).toContain('Search is unavailable right now')
    })

    it('shows status div when status is empty', () => {
        const { container } = renderChrome({ status: 'empty' })
        const status = container.querySelector('#search-status')
        expect(status?.hasAttribute('hidden')).toBe(false)
        expect(container.textContent).toContain('No matching businesses found')
    })

    it('renders spinner', () => {
        const { container } = renderChrome({ status: 'searching' })
        const spinner = container.querySelector('#search-spinner')
        expect(spinner).not.toBeNull()
        // Spinner aria-hidden is set to true when status is NOT 'searching'
        // When status IS 'searching', aria-hidden is false
        expect(spinner?.getAttribute('aria-hidden')).toBe('false')
    })

    it('calls onClear when back button is clicked', async () => {
        const onClear = vi.fn()
        const { container } = renderChrome({ searchActive: true, onClear })
        const backBtn = container.querySelector('.search-back-btn')!
        await fireEvent.click(backBtn)
        expect(onClear).toHaveBeenCalledTimes(1)
    })

    it('calls onClearQuery when clear button is clicked', async () => {
        const onClearQuery = vi.fn()
        const { container } = renderChrome({ hasQuery: true, onClearQuery })
        const clearBtn = container.querySelector('#search-clear-btn')!
        await fireEvent.click(clearBtn)
        expect(onClearQuery).toHaveBeenCalledTimes(1)
    })

    it('calls onCancel when cancel button is clicked', async () => {
        const onCancel = vi.fn()
        const { container } = renderChrome({ showLoading: true, onCancel })
        const cancelBtn = container.querySelector('#search-cancel-btn')!
        await fireEvent.click(cancelBtn)
        expect(onCancel).toHaveBeenCalledTimes(1)
    })

    it('hides status when hasResults is true', () => {
        const { container } = renderChrome({ status: 'results', hasResults: true })
        const status = container.querySelector('#search-status')
        expect(status?.hasAttribute('hidden')).toBe(true)
    })
})
