/**
 * component-CompassDiveSurface.test.ts — CompassDiveSurface.svelte behavioral contract.
 *
 * Renders the real component in jsdom and asserts the DOM structure:
 * map-trail strip, county button, dive button, inside controls.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/svelte'
import CompassDiveSurface from '../../src/lib/components/journey/CompassDiveSurface.svelte'

afterEach(() => cleanup())

function renderSurface(overrides: Partial<{}> = {}) {
    const defaults = {
        showMapTrailStrip: false,
        stripAccessibleTitle: 'Map trail',
        showDiveButton: true,
        canDive: true,
        semanticDiveActive: false,
        showInsideControls: false,
        handleInsideCounty: vi.fn(),
        handleStepInside: vi.fn(),
        handleInsideNext: vi.fn(),
        handleInsideMap: vi.fn(),
        insideNextDisabled: false
    }
    return render(CompassDiveSurface, { props: { ...defaults, ...overrides } })
}

describe('CompassDiveSurface component', () => {
    it('renders the map-trail strip div', () => {
        const { container } = renderSurface({ showMapTrailStrip: true })
        expect(container.querySelector('#map-trail-strip')).not.toBeNull()
    })

    it('hides map-trail strip when showMapTrailStrip is false', () => {
        const { container } = renderSurface({ showMapTrailStrip: false })
        const strip = container.querySelector('#map-trail-strip')
        expect(strip?.hasAttribute('hidden')).toBe(true)
    })

    it('shows map-trail strip when showMapTrailStrip is true', () => {
        const { container } = renderSurface({ showMapTrailStrip: true })
        const strip = container.querySelector('#map-trail-strip')
        expect(strip?.hasAttribute('hidden')).toBe(false)
    })

    it('renders the county button', () => {
        const { container } = renderSurface({ showMapTrailStrip: true })
        const btn = container.querySelector('#btn-map-county')
        expect(btn).not.toBeNull()
        expect(btn?.textContent).toBe('County')
    })

    it('hides county button when showMapTrailStrip is false', () => {
        const { container } = renderSurface({ showMapTrailStrip: false })
        const btn = container.querySelector('#btn-map-county')
        expect(btn?.hasAttribute('hidden')).toBe(true)
    })

    it('renders the dive button', () => {
        const { container } = renderSurface({ showDiveButton: true })
        const btn = container.querySelector('#btn-focus-dive')
        expect(btn).not.toBeNull()
    })

    it('hides dive button when showDiveButton is false', () => {
        const { container } = renderSurface({ showDiveButton: false })
        const btn = container.querySelector('#btn-focus-dive')
        expect(btn?.hasAttribute('hidden')).toBe(true)
    })

    it('disables dive button when canDive is false', () => {
        const { container } = renderSurface({ canDive: false })
        const btn = container.querySelector('#btn-focus-dive')
        expect(btn?.hasAttribute('disabled')).toBe(true)
    })

    it('enables dive button when canDive is true', () => {
        const { container } = renderSurface({ canDive: true })
        const btn = container.querySelector('#btn-focus-dive')
        expect(btn?.hasAttribute('disabled')).toBe(false)
    })

    it('shows "Inside Neighborhood" label when semanticDiveActive is true', () => {
        const { container } = renderSurface({ semanticDiveActive: true })
        const label = container.querySelector('.focus-stage-dive-label')
        expect(label?.textContent).toBe('Inside Neighborhood')
    })

    it('shows "Explore Neighborhood" label when semanticDiveActive is false', () => {
        const { container } = renderSurface({ semanticDiveActive: false })
        const label = container.querySelector('.focus-stage-dive-label')
        expect(label?.textContent).toBe('Explore Neighborhood')
    })

    it('sets aria-pressed on dive button based on semanticDiveActive', () => {
        const { container } = renderSurface({ semanticDiveActive: true })
        const btn = container.querySelector('#btn-focus-dive')
        expect(btn?.getAttribute('aria-pressed')).toBe('true')
    })

    it('calls handleStepInside when dive button is clicked', async () => {
        const handleStepInside = vi.fn()
        const { container } = renderSurface({ handleStepInside })
        const btn = container.querySelector('#btn-focus-dive')!
        await fireEvent.click(btn)
        expect(handleStepInside).toHaveBeenCalledTimes(1)
    })

    it('renders inside controls when showInsideControls is true', () => {
        const { container } = renderSurface({ showInsideControls: true })
        expect(container.querySelector('#focus-stage-inside-controls')).not.toBeNull()
        expect(container.querySelector('#btn-inside-next')).not.toBeNull()
        expect(container.querySelector('#btn-inside-map')).not.toBeNull()
        expect(container.querySelector('#btn-inside-county')).not.toBeNull()
    })

    it('hides inside controls when showInsideControls is false', () => {
        const { container } = renderSurface({ showInsideControls: false })
        const controls = container.querySelector('#focus-stage-inside-controls')
        expect(controls?.hasAttribute('hidden')).toBe(true)
    })

    it('disables next button when insideNextDisabled is true', () => {
        const { container } = renderSurface({ showInsideControls: true, insideNextDisabled: true })
        const next = container.querySelector('#btn-inside-next')
        expect(next?.getAttribute('aria-disabled')).toBe('true')
    })

    it('calls handleInsideNext when next button is clicked', async () => {
        const handleInsideNext = vi.fn()
        const { container } = renderSurface({ showInsideControls: true, handleInsideNext })
        const btn = container.querySelector('#btn-inside-next')!
        await fireEvent.click(btn)
        expect(handleInsideNext).toHaveBeenCalledTimes(1)
    })

    it('calls handleInsideMap when map button is clicked', async () => {
        const handleInsideMap = vi.fn()
        const { container } = renderSurface({ showInsideControls: true, handleInsideMap })
        const btn = container.querySelector('#btn-inside-map')!
        await fireEvent.click(btn)
        expect(handleInsideMap).toHaveBeenCalledTimes(1)
    })

    it('calls handleInsideCounty when county button is clicked', async () => {
        const handleInsideCounty = vi.fn()
        const { container } = renderSurface({ showInsideControls: true, handleInsideCounty })
        const btn = container.querySelector('#btn-inside-county')!
        await fireEvent.click(btn)
        expect(handleInsideCounty).toHaveBeenCalledTimes(1)
    })

    it('has data-journey-action on county button', () => {
        const { container } = renderSurface({ showMapTrailStrip: true })
        const btn = container.querySelector('#btn-map-county')
        expect(btn?.getAttribute('data-journey-action')).toBe('county-overview')
    })

    it('has data-journey-action on dive button', () => {
        const { container } = renderSurface()
        const btn = container.querySelector('#btn-focus-dive')
        expect(btn?.getAttribute('data-journey-action')).toBe('enter-inside')
    })

    it('has data-journey-action on inside buttons', () => {
        const { container } = renderSurface({ showInsideControls: true })
        expect(container.querySelector('#btn-inside-next')?.getAttribute('data-journey-action')).toBe('next-stop')
        expect(container.querySelector('#btn-inside-map')?.getAttribute('data-journey-action')).toBe('open-map')
        expect(container.querySelector('#btn-inside-county')?.getAttribute('data-journey-action')).toBe(
            'county-overview'
        )
    })

    it('renders the focus-stage-kicker (hidden)', () => {
        const { container } = renderSurface()
        const kicker = container.querySelector('.focus-stage-kicker')
        expect(kicker).not.toBeNull()
        expect(kicker?.hasAttribute('hidden')).toBe(true)
    })

    it('renders inside status when showInsideControls is true', () => {
        const { container } = renderSurface({ showInsideControls: true })
        const status = container.querySelector('#focus-stage-inside-status')
        expect(status).not.toBeNull()
        expect(container.textContent).toContain('Inside neighborhood')
    })
})
