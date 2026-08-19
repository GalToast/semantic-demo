/**
 * component-CompassActionButton.test.ts — CompassActionButton.svelte behavioral contract.
 *
 * Renders the real component in jsdom and asserts the DOM structure:
 * button id, classes, data-*, aria-* attributes, onclick handler.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import CompassActionButton from '../../src/lib/components/journey/CompassActionButton.svelte'

afterEach(() => cleanup())

function renderButton(overrides: Partial<{}> = {}) {
    const defaults = {
        role: 'primary' as const,
        hidden: false,
        ariaDisabled: false,
        ariaHidden: 'false' as const,
        ariaLabel: 'Primary action',
        tabindex: 0,
        dataJourneyAction: 'primary',
        onclick: vi.fn()
    }
    return render(CompassActionButton, { props: { ...defaults, ...overrides } })
}

describe(' CompassActionButton component', () => {
    it('renders a button with the correct id', () => {
        const { container } = renderButton({ role: 'primary' })
        expect(container.querySelector('#btn-journey-primary')).not.toBeNull()
    })

    it('renders secondary with id btn-journey-secondary', () => {
        const { container } = renderButton({ role: 'secondary' })
        expect(container.querySelector('#btn-journey-secondary')).not.toBeNull()
    })

    it('renders tertiary with id btn-journey-tertiary', () => {
        const { container } = renderButton({ role: 'tertiary' })
        expect(container.querySelector('#btn-journey-tertiary')).not.toBeNull()
    })

    it('applies journey-compass-action class with role modifier', () => {
        const { container } = renderButton({ role: 'secondary' })
        const btn = container.querySelector('button')
        expect(btn?.classList.contains('journey-compass-action')).toBe(true)
        expect(btn?.classList.contains('secondary')).toBe(true)
    })

    it('sets data-journey-action attribute', () => {
        const { container } = renderButton({ dataJourneyAction: 'go-inside' })
        expect(container.querySelector('button')?.getAttribute('data-journey-action')).toBe('go-inside')
    })

    it('sets aria-label', () => {
        const { container } = renderButton({ ariaLabel: 'Step inside' })
        expect(container.querySelector('button')?.getAttribute('aria-label')).toBe('Step inside')
    })

    it('sets aria-hidden when hidden', () => {
        const { container } = renderButton({ ariaHidden: 'true' })
        expect(container.querySelector('button')?.getAttribute('aria-hidden')).toBe('true')
    })

    it('sets aria-disabled when disabled', () => {
        const { container } = renderButton({ ariaDisabled: true })
        expect(container.querySelector('button')?.getAttribute('aria-disabled')).toBe('true')
    })

    it('sets tabindex', () => {
        const { container } = renderButton({ tabindex: 3 })
        expect(container.querySelector('button')?.getAttribute('tabindex')).toBe('3')
    })

    it('sets hidden attribute when hidden prop is true', () => {
        const { container } = renderButton({ hidden: true })
        expect(container.querySelector('button')?.hasAttribute('hidden')).toBe(true)
    })

    it('does not set hidden attribute when hidden prop is false', () => {
        const { container } = renderButton({ hidden: false })
        expect(container.querySelector('button')?.hasAttribute('hidden')).toBe(false)
    })

    it('sets data-mobile-label when provided', () => {
        const { container } = renderButton({ dataMobileLabel: 'Go' })
        expect(container.querySelector('button')?.getAttribute('data-mobile-label')).toBe('Go')
    })

    it('does not set data-mobile-label when not provided', () => {
        const { container } = renderButton()
        expect(container.querySelector('button')?.getAttribute('data-mobile-label')).toBeNull()
    })

    it('sets aria-expanded when provided (tertiary)', () => {
        const { container } = renderButton({ role: 'tertiary', ariaExpanded: 'true' })
        expect(container.querySelector('button')?.getAttribute('aria-expanded')).toBe('true')
    })

    it('does not set aria-expanded when not provided', () => {
        const { container } = renderButton()
        expect(container.querySelector('button')?.getAttribute('aria-expanded')).toBeNull()
    })

    it('calls onclick when clicked', async () => {
        const onclick = vi.fn()
        const { container } = renderButton({ onclick })
        const btn = container.querySelector('button')!
        await fireEvent.click(btn)
        expect(onclick).toHaveBeenCalledTimes(1)
    })

    it('displays ariaLabel as button text', () => {
        const { container } = renderButton({ ariaLabel: 'Go Inside' })
        expect(container.querySelector('button')?.textContent).toBe('Go Inside')
    })
})
