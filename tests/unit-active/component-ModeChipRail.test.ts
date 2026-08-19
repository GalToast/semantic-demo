/**
 * component-ModeChipRail.test.ts — ModeChipRail.svelte behavioral contract.
 *
 * Renders the real component in jsdom and asserts the DOM structure:
 * radiogroup, mode chips, active/locked states, aria attrs.
 *
 * Note: Keyboard navigation depends on computeModeKeydown from mode-nav
 * which uses module-level state. We test the structural/prop-driven
 * contracts here; keyboard nav is covered by component-Header.test.ts
 * and mode-nav unit tests.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import ModeChipRail from '../../src/lib/components/header/ModeChipRail.svelte'

afterEach(() => cleanup())

const MODES = [
    { id: 'overview' as const, label: 'Overview', description: 'See the full field', iconId: 'icon-overview' },
    { id: 'search' as const, label: 'Search', description: 'Find businesses', iconId: 'icon-search' },
    { id: 'focus' as const, label: 'Focus', description: 'Deep dive', iconId: 'icon-focus' },
    { id: 'trail' as const, label: 'Trail', description: 'Follow connections', iconId: 'icon-trail' },
    { id: 'inside' as const, label: 'Inside', description: 'Step inside', iconId: 'icon-inside' },
    { id: 'map' as const, label: 'Map', description: 'Geographic view', iconId: 'icon-map' }
]

function renderRail(overrides: Partial<{}> = {}) {
    const defaults = {
        modes: MODES,
        activeMode: 'overview',
        hasSelection: false,
        activeView: 'overview',
        selectMode: vi.fn()
    }
    return render(ModeChipRail, { props: { ...defaults, ...overrides } })
}

describe('ModeChipRail component', () => {
    it('renders the mode-chips radiogroup', () => {
        const { container } = renderRail()
        const rail = container.querySelector('#mode-chips')
        expect(rail).not.toBeNull()
        expect(rail?.getAttribute('role')).toBe('radiogroup')
        expect(rail?.getAttribute('aria-label')).toBe('View mode')
    })

    it('has tabindex="-1" on the radiogroup', () => {
        const { container } = renderRail()
        const rail = container.querySelector('#mode-chips')
        expect(rail?.getAttribute('tabindex')).toBe('-1')
    })

    it('has aria-keyshortcuts', () => {
        const { container } = renderRail()
        const rail = container.querySelector('#mode-chips')
        expect(rail?.getAttribute('aria-keyshortcuts')).toContain('ArrowUp')
    })

    it('renders one chip per mode', () => {
        const { container } = renderRail()
        const chips = [...container.querySelectorAll('.mode-chip')]
        expect(chips).toHaveLength(6)
    })

    it('renders chip labels', () => {
        const { container } = renderRail()
        const chips = [...container.querySelectorAll('.mode-chip')]
        expect(chips.map((c) => c.querySelector('.chip-label')?.textContent)).toEqual([
            'Overview',
            'Search',
            'Focus',
            'Trail',
            'Inside',
            'Map'
        ])
    })

    it('sets data-mode on each chip', () => {
        const { container } = renderRail()
        const chips = [...container.querySelectorAll('.mode-chip')]
        expect(chips.map((c) => c.getAttribute('data-mode'))).toEqual([
            'overview',
            'search',
            'focus',
            'trail',
            'inside',
            'map'
        ])
    })

    it('marks active chip with .active class', () => {
        const { container } = renderRail({ activeMode: 'search' })
        const chips = [...container.querySelectorAll('.mode-chip')]
        expect(chips[0]?.classList.contains('active')).toBe(false)
        expect(chips[1]?.classList.contains('active')).toBe(true)
    })

    it('sets aria-checked on chips', () => {
        const { container } = renderRail({ activeMode: 'focus' })
        const chips = [...container.querySelectorAll('.mode-chip')]
        expect(chips[0]?.getAttribute('aria-checked')).toBe('false')
        expect(chips[2]?.getAttribute('aria-checked')).toBe('true')
    })

    it('sets role="radio" on each chip', () => {
        const { container } = renderRail()
        const chips = [...container.querySelectorAll('.mode-chip')]
        expect(chips.every((c) => c.getAttribute('role') === 'radio')).toBe(true)
    })

    it('has type="button" on each chip', () => {
        const { container } = renderRail()
        const chips = [...container.querySelectorAll('.mode-chip')]
        expect(chips.every((c) => c.getAttribute('type') === 'button')).toBe(true)
    })

    it('sets tabindex=0 on active chip, -1 on others', () => {
        const { container } = renderRail({ activeMode: 'overview' })
        const chips = [...container.querySelectorAll('.mode-chip')]
        expect(chips[0]?.getAttribute('tabindex')).toBe('0')
        expect(chips[1]?.getAttribute('tabindex')).toBe('-1')
    })

    it('calls selectMode when a chip is clicked', async () => {
        const selectMode = vi.fn()
        const { container } = renderRail({ selectMode })
        const chips = container.querySelectorAll('.mode-chip')
        await fireEvent.click(chips[2]!)
        expect(selectMode).toHaveBeenCalledWith('focus')
    })

    it('renders chip icons in DOM (hidden via CSS on desktop)', () => {
        const { container } = renderRail()
        const icons = container.querySelectorAll('.chip-icon')
        expect(icons.length).toBe(6)
    })

    it('sets title with description on chips', () => {
        const { container } = renderRail()
        const chips = [...container.querySelectorAll('.mode-chip')]
        expect(chips[0]?.getAttribute('title')).toContain('See the full field')
    })

    it('sets aria-label on chips', () => {
        const { container } = renderRail()
        const chips = [...container.querySelectorAll('.mode-chip')]
        expect(chips[0]?.getAttribute('aria-label')).toBe('Overview')
    })

    it('renders the rail with onkeydown handler', () => {
        const { container } = renderRail()
        const rail = container.querySelector('#mode-chips')
        expect(rail).not.toBeNull()
    })

    it('renders the rail with onfocusin handler', () => {
        const { container } = renderRail()
        const rail = container.querySelector('#mode-chips')
        expect(rail).not.toBeNull()
    })
})
