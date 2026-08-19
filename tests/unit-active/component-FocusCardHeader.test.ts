/**
 * component-FocusCardHeader.test.ts — FocusCardHeader.svelte behavioral contract.
 *
 * Renders the real component in jsdom and asserts the DOM structure:
 * hero header, name, subtitle, role badge, meta strip with idPrefix support.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import FocusCardHeader from '../../src/lib/components/focus/FocusCardHeader.svelte'

afterEach(() => cleanup())

const MODEL = {
    name: 'Test Business',
    what: 'HVAC Services',
    role: 'Service Provider',
    filedAs: 'DBA Test',
    showFiledAs: true,
    theme: 'Home Services',
    status: 'Active',
    isPopulated: true
}

describe('FocusCardHeader component', () => {
    it('renders the hero with class selected-hero', () => {
        const { container } = render(FocusCardHeader, {
            props: { viewModel: MODEL, selectedCity: 'Houston' }
        })
        expect(container.querySelector('.selected-hero')).not.toBeNull()
    })

    it('renders the business name in an h3', () => {
        const { container } = render(FocusCardHeader, {
            props: { viewModel: MODEL, selectedCity: 'Houston' }
        })
        const name = container.querySelector('#selected-name')
        expect(name?.textContent).toBe('Test Business')
        expect(name?.getAttribute('aria-label')).toBe('Test Business')
        expect(name?.getAttribute('title')).toBe('Test Business')
    })

    it('renders the subtitle (what line)', () => {
        const { container } = render(FocusCardHeader, {
            props: { viewModel: MODEL, selectedCity: 'Houston' }
        })
        const subtitle = container.querySelector('#selected-what')
        expect(subtitle?.textContent).toBe('HVAC Services')
    })

    it('renders the role badge', () => {
        const { container } = render(FocusCardHeader, {
            props: { viewModel: MODEL, selectedCity: 'Houston' }
        })
        const badge = container.querySelector('#selected-role-badge')
        expect(badge?.textContent).toBe('Service Provider')
    })

    it('renders filed-as when showFiledAs is true', () => {
        const { container } = render(FocusCardHeader, {
            props: { viewModel: MODEL, selectedCity: 'Houston' }
        })
        const filedAs = container.querySelector('#selected-filed-as')
        expect(filedAs?.textContent).toBe('DBA Test')
    })

    it('does not render filed-as when showFiledAs is false', () => {
        const { container } = render(FocusCardHeader, {
            props: { viewModel: { ...MODEL, showFiledAs: false }, selectedCity: 'Houston' }
        })
        expect(container.querySelector('#selected-filed-as')).toBeNull()
    })

    it('applies idPrefix to all ids', () => {
        const { container } = render(FocusCardHeader, {
            props: { viewModel: MODEL, selectedCity: 'Houston', idPrefix: 'fc-' }
        })
        expect(container.querySelector('#fc-selected-name')).not.toBeNull()
        expect(container.querySelector('#fc-selected-what')).not.toBeNull()
        expect(container.querySelector('#fc-selected-role-badge')).not.toBeNull()
        expect(container.querySelector('#fc-selected-meta-strip')).not.toBeNull()
    })

    it('renders meta strip with city, theme, and status chips when isPopulated', () => {
        const { container } = render(FocusCardHeader, {
            props: { viewModel: MODEL, selectedCity: 'Houston' }
        })
        const chips = [...container.querySelectorAll('.focus-stage-chip')]
        expect(chips.map((c) => c.textContent)).toEqual(['Houston', 'Home Services', 'Active'])
    })

    it('renders meta strip div but no chips when isPopulated is false', () => {
        const { container } = render(FocusCardHeader, {
            props: { viewModel: { ...MODEL, isPopulated: false }, selectedCity: 'Houston' }
        })
        // The meta strip div always renders, but chips are gated by isPopulated
        const strip = container.querySelector('#selected-meta-strip')
        expect(strip).not.toBeNull()
        expect(strip?.querySelector('.focus-stage-chip')).toBeNull()
    })

    it('falls back to empty string when name is missing', () => {
        const { container } = render(FocusCardHeader, {
            props: { viewModel: { ...MODEL, name: '' }, selectedCity: 'Houston' }
        })
        const name = container.querySelector('#selected-name')
        expect(name?.textContent).toBe('')
    })
})
