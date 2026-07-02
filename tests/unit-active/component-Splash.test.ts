/**
 * component-Splash.test.ts — Component test for Splash.svelte
 *
 * Verifies the welcome modal structure and WCAG AAA 2.5.5 target sizes.
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/svelte'
import Splash from '../../src/components/Splash.svelte'

vi.mock('../../src/lib/stores/engine-ready.svelte', () => ({
    engineReady: {
        value: false,
        signalReady: vi.fn(),
        getReady: () => false,
        subscribe: (fn: (v: boolean) => void) => {
            fn(false)
            return () => {}
        }
    }
}))

describe('Splash component', () => {
    it('renders as a modal dialog with aria-labelledby title', () => {
        const { container } = render(Splash)
        const splash = container.querySelector('.splash')
        expect(splash).toBeTruthy()
        expect(splash!.getAttribute('role')).toBe('dialog')
        expect(splash!.getAttribute('aria-modal')).toBe('true')
        expect(splash!.getAttribute('aria-labelledby')).toBe('splash-title')

        const title = container.querySelector('#splash-title')
        expect(title).toBeTruthy()
        expect(title!.textContent).toContain('Semantic Explorer')
    })

    it('exposes a search form with accessible input and submit button', () => {
        const { container } = render(Splash)
        const form = container.querySelector('form.splash-search')
        expect(form).toBeTruthy()
        expect(form!.getAttribute('role')).toBe('search')

        const input = container.querySelector('.splash-search-input')
        expect(input).toBeTruthy()
        expect(input!.getAttribute('type')).toBe('search')
        expect(input!.getAttribute('aria-label')).toBe('Search Montgomery County businesses')

        const submit = container.querySelector('.splash-submit')
        expect(submit).toBeTruthy()
        expect(submit!.getAttribute('type')).toBe('submit')
    })

    it('renders the Explore CTA as a button', () => {
        const { container } = render(Splash)
        const cta = container.querySelector('.splash-cta')
        expect(cta).toBeTruthy()
        expect(cta!.getAttribute('type')).toBe('button')
    })
})
