/**
 * component-CompassStepIndicators.test.ts — CompassStepIndicators.svelte behavioral contract.
 *
 * Renders the real component in jsdom and asserts the DOM structure:
 * step pills, current/done classes, data-journey-step, aria-label, title.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import CompassStepIndicators from '../../src/lib/components/journey/CompassStepIndicators.svelte'

afterEach(() => cleanup())

const ORDER = ['overview', 'search', 'focus', 'trail', 'inside', 'map'] as const
const DESCRIPTIONS: Record<string, string> = {
    overview: 'See the full business field',
    search: 'Find businesses by name or category',
    focus: 'Explore a single business in depth',
    trail: 'Follow a thread of related businesses',
    inside: 'Step inside a business detail view',
    map: 'View businesses on a geographic map'
}

describe('CompassStepIndicators component', () => {
    it('renders one pill per phase in order', () => {
        const { container } = render(CompassStepIndicators, {
            props: { phase: 'overview', order: ORDER, descriptions: DESCRIPTIONS }
        })
        const pills = [...container.querySelectorAll('.journey-compass-step')]
        expect(pills).toHaveLength(6)
        expect(pills.map((p) => p.getAttribute('data-journey-step'))).toEqual([...ORDER])
    })

    it('marks the current phase with .current class', () => {
        const { container } = render(CompassStepIndicators, {
            props: { phase: 'focus', order: ORDER, descriptions: DESCRIPTIONS }
        })
        const current = container.querySelector('.journey-compass-step.current')
        expect(current).not.toBeNull()
        expect(current?.getAttribute('data-journey-step')).toBe('focus')
    })

    it('marks earlier phases with .done class', () => {
        const { container } = render(CompassStepIndicators, {
            props: { phase: 'trail', order: ORDER, descriptions: DESCRIPTIONS }
        })
        // trail is at index 3; overview(0), search(1), focus(2) are all before it
        const done = [...container.querySelectorAll('.journey-compass-step.done')]
        expect(done).toHaveLength(3)
        expect(done.map((d) => d.getAttribute('data-journey-step'))).toEqual(['overview', 'search', 'focus'])
    })

    it('does not mark later phases as done', () => {
        // When phase is the first in the order, nothing is done yet
        const { container } = render(CompassStepIndicators, {
            props: { phase: 'overview', order: ORDER, descriptions: DESCRIPTIONS }
        })
        const done = [...container.querySelectorAll('.journey-compass-step.done')]
        expect(done).toHaveLength(0)
    })

    it('does not mark the current phase as done', () => {
        const { container } = render(CompassStepIndicators, {
            props: { phase: 'focus', order: ORDER, descriptions: DESCRIPTIONS }
        })
        const current = container.querySelector('.journey-compass-step.current')
        expect(current?.classList.contains('done')).toBe(false)
    })

    it('sets aria-label with step number, phase, and description', () => {
        const { container } = render(CompassStepIndicators, {
            props: { phase: 'overview', order: ORDER, descriptions: DESCRIPTIONS }
        })
        const first = container.querySelector('.journey-compass-step')
        expect(first?.getAttribute('aria-label')).toBe('1. overview: See the full business field')
    })

    it('sets title attribute to the description', () => {
        const { container } = render(CompassStepIndicators, {
            props: { phase: 'overview', order: ORDER, descriptions: DESCRIPTIONS }
        })
        const first = container.querySelector('.journey-compass-step')
        expect(first?.getAttribute('title')).toBe('See the full business field')
    })

    it('falls back to phase name when description is missing', () => {
        const { container } = render(CompassStepIndicators, {
            props: { phase: 'unknown', order: ['unknown'], descriptions: {} }
        })
        const pill = container.querySelector('.journey-compass-step')
        expect(pill?.getAttribute('aria-label')).toBe('1. unknown: unknown')
        expect(pill?.getAttribute('title')).toBe('unknown')
    })

    it('renders nothing when order is empty', () => {
        const { container } = render(CompassStepIndicators, {
            props: { phase: 'overview', order: [], descriptions: DESCRIPTIONS }
        })
        expect(container.querySelector('.journey-compass-step')).toBeNull()
    })
})
