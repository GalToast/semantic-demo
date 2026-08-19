/**
 * component-FilterChipGroup.test.ts — FilterChipGroup.svelte behavioral contract.
 *
 * Renders the real component in jsdom and asserts the DOM structure:
 * filter group, title, chips, active state, click handling, keyboard nav.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import FilterChipGroup from '../../src/lib/components/filters/FilterChipGroup.svelte'

afterEach(() => cleanup())

const OPTIONS = [
    { id: 'hvac', label: 'HVAC' },
    { id: 'plumbing', label: 'Plumbing' },
    { id: 'electrical', label: 'Electrical' }
]

function renderGroup(overrides: Partial<{}> = {}) {
    const defaults = {
        title: 'Services',
        options: OPTIONS,
        dataAttr: 'service-filter',
        isActive: (_id: string) => false,
        onToggle: vi.fn()
    }
    return render(FilterChipGroup, { props: { ...defaults, ...overrides } })
}

describe('FilterChipGroup component', () => {
    it('renders a div with class filter-group', () => {
        const { container } = renderGroup()
        expect(container.querySelector('.filter-group')).not.toBeNull()
    })

    it('renders the title as an h4', () => {
        const { container } = renderGroup({ title: 'Services' })
        const title = container.querySelector('.filter-group-title')
        expect(title?.textContent).toBe('Services')
    })

    it('renders one chip per option', () => {
        const { container } = renderGroup()
        const chips = [...container.querySelectorAll('.filter-chip')]
        expect(chips).toHaveLength(3)
    })

    it('renders chip labels', () => {
        const { container } = renderGroup()
        const chips = [...container.querySelectorAll('.filter-chip')]
        expect(chips.map((c) => c.textContent)).toEqual(['HVAC', 'Plumbing', 'Electrical'])
    })

    it('sets data attribute on each chip', () => {
        const { container } = renderGroup({ dataAttr: 'service-filter' })
        const chips = [...container.querySelectorAll('.filter-chip')]
        expect(chips[0]?.getAttribute('data-service-filter')).toBe('hvac')
        expect(chips[1]?.getAttribute('data-service-filter')).toBe('plumbing')
    })

    it('marks active chips with .active class', () => {
        const { container } = renderGroup({
            isActive: (id: string) => id === 'plumbing'
        })
        const chips = [...container.querySelectorAll('.filter-chip')]
        expect(chips[0]?.classList.contains('active')).toBe(false)
        expect(chips[1]?.classList.contains('active')).toBe(true)
    })

    it('sets aria-pressed based on active state', () => {
        const { container } = renderGroup({
            isActive: (id: string) => id === 'hvac'
        })
        const chips = [...container.querySelectorAll('.filter-chip')]
        expect(chips[0]?.getAttribute('aria-pressed')).toBe('true')
        expect(chips[1]?.getAttribute('aria-pressed')).toBe('false')
    })

    it('has type="button" on all chips', () => {
        const { container } = renderGroup()
        const chips = [...container.querySelectorAll('.filter-chip')]
        expect(chips.every((c) => c.getAttribute('type') === 'button')).toBe(true)
    })

    it('calls onToggle with the chip id when clicked', async () => {
        const onToggle = vi.fn()
        const { container } = renderGroup({ onToggle })
        const chips = container.querySelectorAll('.filter-chip')
        await fireEvent.click(chips[0]!)
        expect(onToggle).toHaveBeenCalledWith('hvac')
    })

    it('supports keyboard navigation with arrow keys', async () => {
        const { container } = renderGroup()
        const chips = container.querySelectorAll('.filter-chip')
        // Focus first chip, press ArrowRight
        chips[0]!.focus()
        await fireEvent.keyDown(chips[0]!, { key: 'ArrowRight' })
        // The second chip should receive focus (handled by handleChipKeydown)
        expect(document.activeElement).toBe(chips[1])
    })

    it('wraps around with ArrowRight on last chip', async () => {
        const { container } = renderGroup()
        const chips = container.querySelectorAll('.filter-chip')
        chips[2]!.focus()
        await fireEvent.keyDown(chips[2]!, { key: 'ArrowRight' })
        expect(document.activeElement).toBe(chips[0])
    })

    it('supports ArrowLeft navigation', async () => {
        const { container } = renderGroup()
        const chips = container.querySelectorAll('.filter-chip')
        chips[1]!.focus()
        await fireEvent.keyDown(chips[1]!, { key: 'ArrowLeft' })
        expect(document.activeElement).toBe(chips[0])
    })
})
