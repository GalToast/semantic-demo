/**
 * component-PlaceholderCategoryLegend.test.ts — PlaceholderCategoryLegend.svelte behavioral contract.
 *
 * Renders the real component in jsdom and asserts the DOM structure:
 * legend list, items, dots with color, labels, aria-label.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import PlaceholderCategoryLegend from '../../src/lib/components/PlaceholderCategoryLegend.svelte'

afterEach(() => cleanup())

const CATEGORIES = [
    { name: 'HVAC', color: '#ff6b6b' },
    { name: 'Plumbing', color: '#4ecdc4' },
    { name: 'Electrical', color: '#ffe66d' }
]

describe('PlaceholderCategoryLegend component', () => {
    it('renders a ul with class placeholder-legend', () => {
        const { container } = render(PlaceholderCategoryLegend, {
            props: { categories: CATEGORIES }
        })
        const legend = container.querySelector('ul.placeholder-legend')
        expect(legend).not.toBeNull()
    })

    it('has aria-label on the legend', () => {
        const { container } = render(PlaceholderCategoryLegend, {
            props: { categories: CATEGORIES }
        })
        const legend = container.querySelector('ul.placeholder-legend')
        expect(legend?.getAttribute('aria-label')).toBe('Business categories in the dataset')
    })

    it('has data-testid="placeholder-legend"', () => {
        const { container } = render(PlaceholderCategoryLegend, {
            props: { categories: CATEGORIES }
        })
        expect(container.querySelector('[data-testid="placeholder-legend"]')).not.toBeNull()
    })

    it('renders one li per category', () => {
        const { container } = render(PlaceholderCategoryLegend, {
            props: { categories: CATEGORIES }
        })
        const items = [...container.querySelectorAll('.placeholder-legend-item')]
        expect(items).toHaveLength(3)
    })

    it('renders category labels', () => {
        const { container } = render(PlaceholderCategoryLegend, {
            props: { categories: CATEGORIES }
        })
        const labels = [...container.querySelectorAll('.placeholder-legend-label')]
        expect(labels.map((l) => l.textContent)).toEqual(['HVAC', 'Plumbing', 'Electrical'])
    })

    it('applies category color to the dot', () => {
        const { container } = render(PlaceholderCategoryLegend, {
            props: { categories: CATEGORIES }
        })
        const dots = [...container.querySelectorAll('.placeholder-legend-dot')]
        expect(dots[0]?.style.backgroundColor).toBe('rgb(255, 107, 107)')
        expect(dots[1]?.style.backgroundColor).toBe('rgb(78, 205, 196)')
    })

    it('marks dots as aria-hidden', () => {
        const { container } = render(PlaceholderCategoryLegend, {
            props: { categories: CATEGORIES }
        })
        const dot = container.querySelector('.placeholder-legend-dot')
        expect(dot?.getAttribute('aria-hidden')).toBe('true')
    })

    it('renders nothing when categories is empty', () => {
        const { container } = render(PlaceholderCategoryLegend, {
            props: { categories: [] }
        })
        expect(container.querySelector('.placeholder-legend-item')).toBeNull()
    })
})
