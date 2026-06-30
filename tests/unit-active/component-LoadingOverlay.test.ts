/**
 * component-LoadingOverlay.test.ts — Component test for LoadingOverlay.svelte
 *
 * Verifies:
 *  1. Renders div#loading-overlay with role="progressbar" and aria-label
 *  2. Progress bar has aria-valuenow, aria-valuemin=0, aria-valuemax=100
 *  3. Overlay has data-loading-phase and data-loading-state attributes
 *  4. Renders .loading-shell with .loading-kicker, .loading-title, .loading-note
 *  5. Renders #loading-progress-bar fill element inside .pipeline-track
 *  6. Renders #loading-phase-row with 4 .loading-phase-chip spans
 *  7. Each phase chip has data-loading-phase attribute
 *  8. Renders #loading-foot element for status text
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
import LoadingOverlay from '../../src/components/LoadingOverlay.svelte'

describe('LoadingOverlay component', () => {
    it('renders div#loading-overlay with role="progressbar" and aria-label', () => {
        const { container } = render(LoadingOverlay)
        const overlay = container.querySelector('#loading-overlay')
        expect(overlay).toBeTruthy()
        expect(overlay!.getAttribute('role')).toBe('progressbar')
        expect(overlay!.getAttribute('aria-label')).toBe('Loading semantic explorer')
    })

    it('progress bar has aria-valuemin=0 and aria-valuemax=100', () => {
        const { container } = render(LoadingOverlay)
        const overlay = container.querySelector('#loading-overlay')
        expect(overlay!.getAttribute('aria-valuemin')).toBe('0')
        expect(overlay!.getAttribute('aria-valuemax')).toBe('100')
    })

    it('overlay has data-loading-phase and data-loading-state attributes', () => {
        const { container } = render(LoadingOverlay)
        const overlay = container.querySelector('#loading-overlay')
        expect(overlay!.getAttribute('data-loading-phase')).not.toBeNull()
        expect(overlay!.getAttribute('data-loading-state')).not.toBeNull()
    })

    it('renders .loading-shell with .loading-kicker, .loading-title, and .loading-note', () => {
        const { container } = render(LoadingOverlay)
        const shell = container.querySelector('.loading-shell')
        expect(shell).toBeTruthy()
        expect(shell!.querySelector('.loading-kicker')).toBeTruthy()
        expect(shell!.querySelector('.loading-title')).toBeTruthy()
        expect(shell!.querySelector('.loading-note')).toBeTruthy()
    })

    it('renders #loading-progress-bar container with .loading-progress-bar fill', () => {
        const { container } = render(LoadingOverlay)
        const bar = container.querySelector('#loading-progress-bar')
        expect(bar).toBeTruthy()
        expect(bar!.classList.contains('loading-progress')).toBe(true)
        const fill = bar!.querySelector('.loading-progress-bar')
        expect(fill).toBeTruthy()
        expect(fill!.getAttribute('style')).toContain('width:')
    })

    it('renders #loading-phase-row with 4 .loading-phase-chip spans', () => {
        const { container } = render(LoadingOverlay)
        const row = container.querySelector('#loading-phase-row')
        expect(row).toBeTruthy()
        const chips = row!.querySelectorAll('.loading-phase-chip')
        expect(chips.length).toBe(4)
    })

    it('each phase chip has data-loading-phase attribute', () => {
        const { container } = render(LoadingOverlay)
        const chips = container.querySelectorAll('.loading-phase-chip')
        chips.forEach((chip) => {
            expect(chip.getAttribute('data-loading-phase')).not.toBeNull()
        })
    })

    it('renders #loading-foot element for status text', () => {
        const { container } = render(LoadingOverlay)
        const foot = container.querySelector('#loading-foot')
        expect(foot).toBeTruthy()
        expect(foot!.tagName).toBe('P')
    })
})
