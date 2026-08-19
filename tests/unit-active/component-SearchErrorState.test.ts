/**
 * component-SearchErrorState.test.ts — SearchErrorState.svelte behavioral contract.
 *
 * Renders the real component in jsdom and asserts the DOM structure:
 * ErrorState wrapper with search-specific prop derivation.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import SearchErrorState from '../../src/lib/components/search/SearchErrorState.svelte'

afterEach(() => cleanup())

const friendlyError = {
    title: 'No results found',
    detail: 'Try a different search term',
    technical: 'ERR_SEARCH_001'
}

describe('SearchErrorState component', () => {
    it('renders with null searchError and null friendlyError', () => {
        const { container } = render(SearchErrorState, {
            props: { searchError: null, friendlyError: null, onRetry: vi.fn(), onDismiss: vi.fn() }
        })
        // ErrorState card variant renders .search-error-state
        const block = container.querySelector('.search-error-state')
        expect(block).not.toBeNull()
    })

    it('renders with searchError and friendlyError', () => {
        const { container } = render(SearchErrorState, {
            props: {
                searchError: { type: 'search_failed', query: 'HVAC' },
                friendlyError,
                onRetry: vi.fn(),
                onDismiss: vi.fn()
            }
        })
        // ErrorState should show the friendly title
        expect(container.textContent).toContain('No results found')
        expect(container.textContent).toContain('Try a different search term')
    })

    it('falls back to default title when friendlyError is null', () => {
        const { container } = render(SearchErrorState, {
            props: {
                searchError: { message: 'boom' },
                friendlyError: null,
                onRetry: vi.fn(),
                onDismiss: vi.fn()
            }
        })
        expect(container.textContent).toContain('Something went wrong')
    })

    it('passes retryAriaLabel with search query', () => {
        const { container } = render(SearchErrorState, {
            props: {
                searchError: { query: 'plumbing' },
                friendlyError: null,
                onRetry: vi.fn(),
                onDismiss: vi.fn()
            }
        })
        // ErrorState renders a retry button with the aria-label
        const retryBtn = container.querySelector('button[aria-label*="plumbing"]')
        expect(retryBtn).not.toBeNull()
    })

    it('passes dismissAriaLabel', () => {
        const { container } = render(SearchErrorState, {
            props: {
                searchError: { query: 'plumbing' },
                friendlyError: null,
                onRetry: vi.fn(),
                onDismiss: vi.fn()
            }
        })
        const dismissBtn = container.querySelector('button[aria-label*="Clear search"]')
        expect(dismissBtn).not.toBeNull()
    })

    it('calls onRetry when retry button is clicked', async () => {
        const onRetry = vi.fn()
        const { container } = render(SearchErrorState, {
            props: {
                searchError: { query: 'HVAC' },
                friendlyError: null,
                onRetry,
                onDismiss: vi.fn()
            }
        })
        const retryBtn = container.querySelector('button[aria-label*="HVAC"]')!
        await retryBtn.click()
        expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('calls onDismiss when dismiss button is clicked', async () => {
        const onDismiss = vi.fn()
        const { container } = render(SearchErrorState, {
            props: {
                searchError: { query: 'HVAC' },
                friendlyError: null,
                onRetry: vi.fn(),
                onDismiss
            }
        })
        const dismissBtn = container.querySelector('button[aria-label*="Clear search"]')!
        await dismissBtn.click()
        expect(onDismiss).toHaveBeenCalledTimes(1)
    })

    it('passes technicalTestId to ErrorState', () => {
        const { container } = render(SearchErrorState, {
            props: {
                searchError: { query: 'HVAC' },
                friendlyError: { title: 'Err', detail: 'Detail', technical: 'TECH_001' },
                onRetry: vi.fn(),
                onDismiss: vi.fn()
            }
        })
        // ErrorState card variant renders details[data-testid] for technical
        const technical = container.querySelector('details[data-testid="search-error-detail"]')
        expect(technical).not.toBeNull()
    })
})
