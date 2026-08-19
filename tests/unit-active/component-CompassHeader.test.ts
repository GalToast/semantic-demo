/**
 * component-CompassHeader.test.ts — CompassHeader.svelte behavioral contract.
 *
 * Renders the real component in jsdom and asserts the DOM structure:
 * kicker, title, note blocks; sr-only toggle on title.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import CompassHeader from '../../src/lib/components/journey/CompassHeader.svelte'

afterEach(() => cleanup())

describe('CompassHeader component', () => {
    it('renders kicker, title, and note with default fallbacks', () => {
        const { container } = render(CompassHeader, {
            props: { kicker: '', title: '', note: '', visibleTitle: '', titleSrOnlyText: '' }
        })
        const kicker = container.querySelector('#journey-compass-kicker')
        expect(kicker).not.toBeNull()
        expect(kicker?.textContent).toBe('Journey')

        const title = container.querySelector('#journey-compass-title')
        expect(title).not.toBeNull()
        expect(title?.textContent).toBe('')

        const note = container.querySelector('#journey-compass-note')
        expect(note).not.toBeNull()
        expect(note?.textContent).toBe('Search to open a trail.')
    })

    it('renders provided kicker, title, and note', () => {
        const { container } = render(CompassHeader, {
            props: {
                kicker: 'Explore',
                title: 'Semantic Explorer',
                note: 'Find businesses',
                visibleTitle: 'Semantic Explorer',
                titleSrOnlyText: 'Semantic Explorer title'
            }
        })
        expect(container.querySelector('#journey-compass-kicker')?.textContent).toBe('Explore')
        expect(container.querySelector('#journey-compass-title')?.textContent).toBe('Semantic Explorer')
        expect(container.querySelector('#journey-compass-note')?.textContent).toBe('Find businesses')
    })

    it('applies sr-only class when visibleTitle is empty', () => {
        const { container } = render(CompassHeader, {
            props: { kicker: '', title: 'Hidden Title', note: '', visibleTitle: '', titleSrOnlyText: 'Hidden Title' }
        })
        const title = container.querySelector('#journey-compass-title')
        expect(title?.classList.contains('sr-only')).toBe(true)
    })

    it('does not apply sr-only class when visibleTitle is set', () => {
        const { container } = render(CompassHeader, {
            props: { kicker: '', title: 'Shown', note: '', visibleTitle: 'Shown', titleSrOnlyText: '' }
        })
        const title = container.querySelector('#journey-compass-title')
        expect(title?.classList.contains('sr-only')).toBe(false)
    })

    it('prefers visibleTitle over title when both are set', () => {
        const { container } = render(CompassHeader, {
            props: { kicker: '', title: 'Raw Title', note: '', visibleTitle: 'Visible Title', titleSrOnlyText: '' }
        })
        expect(container.querySelector('#journey-compass-title')?.textContent).toBe('Visible Title')
    })

    it('falls back to titleSrOnlyText when both title and visibleTitle are empty', () => {
        const { container } = render(CompassHeader, {
            props: { kicker: '', title: '', note: '', visibleTitle: '', titleSrOnlyText: 'Screen Reader Title' }
        })
        expect(container.querySelector('#journey-compass-title')?.textContent).toBe('Screen Reader Title')
    })
})
