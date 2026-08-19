/**
 * component-SearchEmptyState.test.ts — SearchEmptyState.svelte behavioral contract.
 *
 * Renders the real component in jsdom and asserts the DOM structure:
 * empty state icon, title, note, suggestion chips, discovery tip.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import SearchEmptyState from '../../src/lib/components/search/SearchEmptyState.svelte'

afterEach(() => cleanup())

describe('SearchEmptyState component', () => {
    it('renders the empty state container', () => {
        const { container } = render(SearchEmptyState, {
            props: { query: 'HVAC', suggestions: [], onSuggestionClick: vi.fn() }
        })
        expect(container.querySelector('.search-empty-state')).not.toBeNull()
    })

    it('displays the query in the title', () => {
        const { container } = render(SearchEmptyState, {
            props: { query: 'plumbing', suggestions: [], onSuggestionClick: vi.fn() }
        })
        const title = container.querySelector('.search-empty-title')
        expect(title?.textContent).toContain('plumbing')
    })

    it('renders the search icon SVG', () => {
        const { container } = render(SearchEmptyState, {
            props: { query: 'test', suggestions: [], onSuggestionClick: vi.fn() }
        })
        const svg = container.querySelector('.search-empty-icon')
        expect(svg).not.toBeNull()
        expect(svg?.getAttribute('aria-hidden')).toBe('true')
    })

    it('renders the discovery tip', () => {
        const { container } = render(SearchEmptyState, {
            props: { query: 'test', suggestions: [], onSuggestionClick: vi.fn() }
        })
        const tip = container.querySelector('.discovery-tag')
        expect(tip?.textContent).toBe('Tip')
        const text = container.querySelector('.discovery-text')
        expect(text?.textContent).toContain('HVAC')
    })

    it('renders suggestion chips when provided', () => {
        const { container } = render(SearchEmptyState, {
            props: { query: 'test', suggestions: ['HVAC', 'Plumbing', 'Electrical'], onSuggestionClick: vi.fn() }
        })
        const chips = [...container.querySelectorAll('.search-suggestion-chip')]
        expect(chips).toHaveLength(3)
        expect(chips.map((c) => c.textContent)).toEqual(['HVAC', 'Plumbing', 'Electrical'])
    })

    it('renders no suggestion chips when suggestions is empty', () => {
        const { container } = render(SearchEmptyState, {
            props: { query: 'test', suggestions: [], onSuggestionClick: vi.fn() }
        })
        expect(container.querySelector('.search-suggestion-chip')).toBeNull()
    })

    it('calls onSuggestionClick with the chip text when clicked', async () => {
        const onSuggestionClick = vi.fn()
        const { container } = render(SearchEmptyState, {
            props: { query: 'test', suggestions: ['HVAC', 'Plumbing'], onSuggestionClick }
        })
        const chips = container.querySelectorAll('.search-suggestion-chip')
        await fireEvent.click(chips[0]!)
        expect(onSuggestionClick).toHaveBeenCalledWith('HVAC')
    })

    it('sets aria-label on suggestion chips', () => {
        const { container } = render(SearchEmptyState, {
            props: { query: 'test', suggestions: ['HVAC'], onSuggestionClick: vi.fn() }
        })
        const chip = container.querySelector('.search-suggestion-chip')
        expect(chip?.getAttribute('aria-label')).toBe('Try search for HVAC')
    })

    it('renders the note text', () => {
        const { container } = render(SearchEmptyState, {
            props: { query: 'test', suggestions: [], onSuggestionClick: vi.fn() }
        })
        const note = container.querySelector('.search-empty-note')
        expect(note?.textContent).toContain('Try clearing filters')
    })
})
