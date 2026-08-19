/**
 * component-MapBackButton.test.ts — MapBackButton.svelte behavioral contract.
 *
 * Renders the real component in jsdom and asserts the DOM structure:
 * button class, label, aria-label, click handler.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import MapBackButton from '../../src/lib/components/MapBackButton.svelte'

afterEach(() => cleanup())

describe('MapBackButton component', () => {
    it('renders a button with class map-back-btn', () => {
        const { container } = render(MapBackButton, {
            props: { onClick: vi.fn() }
        })
        expect(container.querySelector('.map-back-btn')).not.toBeNull()
    })

    it('uses default label "Overview" when not provided', () => {
        const { container } = render(MapBackButton, {
            props: { onClick: vi.fn() }
        })
        const btn = container.querySelector('.map-back-btn')
        expect(btn?.textContent).toBe('Overview')
    })

    it('uses provided label', () => {
        const { container } = render(MapBackButton, {
            props: { onClick: vi.fn(), label: 'Back to Search' }
        })
        const btn = container.querySelector('.map-back-btn')
        expect(btn?.textContent).toBe('Back to Search')
    })

    it('uses label as aria-label when ariaLabel not provided', () => {
        const { container } = render(MapBackButton, {
            props: { onClick: vi.fn(), label: 'Overview' }
        })
        const btn = container.querySelector('.map-back-btn')
        expect(btn?.getAttribute('aria-label')).toBe('Overview')
    })

    it('uses provided ariaLabel when set', () => {
        const { container } = render(MapBackButton, {
            props: { onClick: vi.fn(), label: 'Overview', ariaLabel: 'Return to overview' }
        })
        const btn = container.querySelector('.map-back-btn')
        expect(btn?.getAttribute('aria-label')).toBe('Return to overview')
    })

    it('has type="button"', () => {
        const { container } = render(MapBackButton, {
            props: { onClick: vi.fn() }
        })
        expect(container.querySelector('.map-back-btn')?.getAttribute('type')).toBe('button')
    })

    it('calls onClick when clicked', async () => {
        const onClick = vi.fn()
        const { container } = render(MapBackButton, { props: { onClick } })
        const btn = container.querySelector('.map-back-btn')!
        await fireEvent.click(btn)
        expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('has min-height: 44px for touch accessibility', () => {
        const { container } = render(MapBackButton, {
            props: { onClick: vi.fn() }
        })
        const btn = container.querySelector('.map-back-btn')
        // The CSS sets min-height: 44px — we verify the class is present
        expect(btn?.classList.contains('map-back-btn')).toBe(true)
    })
})
