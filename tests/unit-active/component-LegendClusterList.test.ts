/**
 * component-LegendClusterList.test.ts — LegendClusterList.svelte behavioral contract.
 *
 * Renders the real component in jsdom and asserts the DOM structure:
 * filtered badge, All/Reset controls, cluster buttons with swatch/label/count,
 * keyboard navigation, aria-pressed, inactive state.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import LegendClusterList from '../../src/lib/components/LegendClusterList.svelte'

afterEach(() => cleanup())

const CLUSTERS = [
    { index: 0, name: 'HVAC', count: 142, color: '#ff6b6b' },
    { index: 1, name: 'Plumbing', count: 89, color: '#4ecdc4' },
    { index: 2, name: 'Electrical', count: 67, color: '#ffe66d' }
]

function renderList(overrides: Partial<{}> = {}) {
    const defaults = {
        clusterEntries: CLUSTERS,
        activeClusterFilter: null,
        isFocusable: true,
        filtered: false,
        onSelect: vi.fn(),
        onReset: vi.fn()
    }
    return render(LegendClusterList, { props: { ...defaults, ...overrides } })
}

describe('LegendClusterList component', () => {
    it('renders the legend list with role="group"', () => {
        const { container } = renderList()
        const list = container.querySelector('.legend-list')
        expect(list).not.toBeNull()
        expect(list?.getAttribute('role')).toBe('group')
        expect(list?.getAttribute('aria-label')).toContain('Business categories')
    })

    it('renders one button per cluster', () => {
        const { container } = renderList()
        const buttons = [...container.querySelectorAll('.legend-item')]
        expect(buttons).toHaveLength(3)
    })

    it('renders cluster names as labels', () => {
        const { container } = renderList()
        const labels = [...container.querySelectorAll('.legend-label')]
        expect(labels.map((l) => l.textContent)).toEqual(['HVAC', 'Plumbing', 'Electrical'])
    })

    it('renders cluster counts', () => {
        const { container } = renderList()
        const counts = [...container.querySelectorAll('.legend-count')]
        expect(counts.map((c) => c.textContent)).toEqual(['142', '89', '67'])
    })

    it('applies cluster color to swatch', () => {
        const { container } = renderList()
        const swatches = [...container.querySelectorAll('.legend-swatch')]
        expect(swatches[0]?.style.backgroundColor).toBe('rgb(255, 107, 107)')
        expect(swatches[1]?.style.backgroundColor).toBe('rgb(78, 205, 196)')
    })

    it('renders All button when no filter active', () => {
        const { container } = renderList({ activeClusterFilter: null })
        const allBtn = container.querySelector('.legend-control-btn')
        expect(allBtn).not.toBeNull()
        expect(allBtn?.textContent).toBe('All')
    })

    it('renders Reset button when filtered is true', () => {
        const { container } = renderList({ filtered: true })
        const resetBtn = container.querySelector('.legend-control-reset')
        expect(resetBtn).not.toBeNull()
        expect(resetBtn?.textContent).toBe('Reset')
    })

    it('does not render Reset button when filtered is false', () => {
        const { container } = renderList({ filtered: false })
        expect(container.querySelector('.legend-control-reset')).toBeNull()
    })

    it('renders filtered badge when filtered is true', () => {
        const { container } = renderList({ filtered: true })
        const badge = container.querySelector('.legend-filtered-badge')
        expect(badge).not.toBeNull()
        expect(badge?.textContent).toBe('filtered')
    })

    it('does not render filtered badge when filtered is false', () => {
        const { container } = renderList({ filtered: false })
        expect(container.querySelector('.legend-filtered-badge')).toBeNull()
    })

    it('marks active cluster with aria-pressed="true"', () => {
        const { container } = renderList({ activeClusterFilter: '1' })
        const buttons = [...container.querySelectorAll('.legend-item')]
        expect(buttons[0]?.getAttribute('aria-pressed')).toBe('false')
        expect(buttons[1]?.getAttribute('aria-pressed')).toBe('true')
        expect(buttons[2]?.getAttribute('aria-pressed')).toBe('false')
    })

    it('applies inactive class to non-active clusters when filter is set', () => {
        const { container } = renderList({ activeClusterFilter: '0' })
        const buttons = [...container.querySelectorAll('.legend-item')]
        expect(buttons[0]?.classList.contains('inactive')).toBe(false)
        expect(buttons[1]?.classList.contains('inactive')).toBe(true)
    })

    it('does not apply inactive class when no filter is active', () => {
        const { container } = renderList({ activeClusterFilter: null })
        const buttons = [...container.querySelectorAll('.legend-item')]
        expect(buttons.every((b) => !b.classList.contains('inactive'))).toBe(true)
    })

    it('has type="button" on all cluster buttons', () => {
        const { container } = renderList()
        const buttons = [...container.querySelectorAll('.legend-item')]
        expect(buttons.every((b) => b.getAttribute('type') === 'button')).toBe(true)
    })

    it('calls onSelect with name and index when a cluster is clicked', async () => {
        const onSelect = vi.fn()
        const { container } = renderList({ onSelect })
        const buttons = container.querySelectorAll('.legend-item')
        await fireEvent.click(buttons[1]!)
        expect(onSelect).toHaveBeenCalledWith('Plumbing', 1)
    })

    it('calls onReset when All button is clicked', async () => {
        const onReset = vi.fn()
        const { container } = renderList({ onReset })
        const allBtn = container.querySelector('.legend-control-btn')!
        await fireEvent.click(allBtn)
        expect(onReset).toHaveBeenCalledTimes(1)
    })

    it('calls onReset when Reset button is clicked', async () => {
        const onReset = vi.fn()
        const { container } = renderList({ filtered: true, onReset })
        const resetBtn = container.querySelector('.legend-control-reset')!
        await fireEvent.click(resetBtn)
        expect(onReset).toHaveBeenCalledTimes(1)
    })

    it('sets tabindex based on isFocusable and activeButtonIndex', () => {
        const { container } = renderList({ isFocusable: true })
        const buttons = [...container.querySelectorAll('.legend-item')]
        // First button should have tabindex=0 (activeButtonIndex starts at 0)
        expect(buttons[0]?.getAttribute('tabindex')).toBe('0')
        expect(buttons[1]?.getAttribute('tabindex')).toBe('-1')
    })

    it('sets all tabindex=-1 when isFocusable is false', () => {
        const { container } = renderList({ isFocusable: false })
        const buttons = [...container.querySelectorAll('.legend-item')]
        expect(buttons.every((b) => b.getAttribute('tabindex') === '-1')).toBe(true)
    })

    it('supports ArrowDown keyboard navigation', async () => {
        const { container } = renderList({ isFocusable: true })
        const buttons = container.querySelectorAll('.legend-item')
        await fireEvent.keyDown(buttons[0]!, { key: 'ArrowDown' })
        // activeButtonIndex should move to 1, button[1] should get focus
        expect(buttons[1]?.getAttribute('tabindex')).toBe('0')
    })

    it('supports ArrowUp keyboard navigation', async () => {
        const { container } = renderList({ isFocusable: true })
        const buttons = container.querySelectorAll('.legend-item')
        // Move to second button first
        await fireEvent.keyDown(buttons[0]!, { key: 'ArrowDown' })
        // Then ArrowUp should go back
        await fireEvent.keyDown(buttons[1]!, { key: 'ArrowUp' })
        expect(buttons[0]?.getAttribute('tabindex')).toBe('0')
    })

    it('supports Home key to focus first button', async () => {
        const { container } = renderList({ isFocusable: true })
        const buttons = container.querySelectorAll('.legend-item')
        await fireEvent.keyDown(buttons[0]!, { key: 'ArrowDown' })
        await fireEvent.keyDown(buttons[1]!, { key: 'Home' })
        expect(buttons[0]?.getAttribute('tabindex')).toBe('0')
    })

    it('supports End key to focus last button', async () => {
        const { container } = renderList({ isFocusable: true })
        const buttons = container.querySelectorAll('.legend-item')
        await fireEvent.keyDown(buttons[0]!, { key: 'End' })
        expect(buttons[2]?.getAttribute('tabindex')).toBe('0')
    })

    it('renders nothing when clusterEntries is empty', () => {
        const { container } = renderList({ clusterEntries: [] })
        expect(container.querySelector('.legend-item')).toBeNull()
    })

    it('has swatch title attribute', () => {
        const { container } = renderList()
        const swatch = container.querySelector('.legend-swatch')
        expect(swatch?.getAttribute('title')).toContain('color-coded')
    })
})
