/**
 * loading-overlay-error-state.test.ts — Behavioral test for the role=alert
 * transition on `dataLoadState.status === 'error'`.
 *
 * Companion to `component-LoadingOverlay.test.ts` (which covers the structural
 * defaults: role="progressbar", aria-label="Loading semantic explorer", aria-valuenow,
 * data-loading-state="active"). This suite drives the store directly to assert
 * that the same overlay flips to role="alert" / aria-label="Loading failed —
 * Semantic Explorer" / data-loading-state="error" / aria-valuenow absent when the
 * data load errors.
 *
 * This used to require a Playwright journey test against a live vite+php stack,
 * but a Svelte 5 mount-rendering quirk under vite dev hid the #loading-overlay
 * div from DOM assertions (the component was reachable but its internal `{#if}`
 * gating interacted poorly with Svelte's pre-mount fragment ordering relative
 * to the static index.html placeholder of the same id — see
 * `tests/loading-overlay-error-state-journey.spec.js` for the playwright variant
 * we'd love to flip green later).
 *
 * Driving the store via a behavioral unit test gives deterministic coverage
 * today without depending on the full vite+php boot. It exercises the same
 * source code paths the journey would (template_effect → $derived → DOM
 * attribute updates) — just without booting the full app.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/svelte'
import LoadingOverlay from '../../src/components/LoadingOverlay.svelte'
import { dataLoadState } from '../../src/lib/data-store'

describe('LoadingOverlay error state (role=alert transition)', () => {
    beforeEach(() => {
        // Reset to a known initial state before each test. The LoadingOverlay
        // test file (structural) leaves the store at whatever value it last
        // set, so this is defensive.
        dataLoadState.set({
            status: 'loading',
            businessLoaded: false,
            threadsLoaded: false,
            error: null,
            progress: 0.5
        })
    })

    it('renders with role="progressbar" and aria-label="Loading semantic explorer" while loading', () => {
        const { container } = render(LoadingOverlay)
        const overlay = container.querySelector('#loading-overlay')
        expect(overlay).toBeTruthy()
        expect(overlay!.getAttribute('role')).toBe('progressbar')
        expect(overlay!.getAttribute('aria-label')).toBe('Loading semantic explorer')
        expect(overlay!.getAttribute('data-loading-state')).toBe('active')
        // role=progressbar MUST carry aria-valuenow
        expect(overlay!.getAttribute('aria-valuenow')).toMatch(/\d+/)
        expect(overlay!.getAttribute('aria-valuemin')).toBe('0')
        expect(overlay!.getAttribute('aria-valuemax')).toBe('100')
    })

    it('flips to role="alert" and surfaces friendly error copy when status="error"', async () => {
        const { container } = render(LoadingOverlay)
        // Sanity: start as progressbar
        const overlay = container.querySelector('#loading-overlay')!
        expect(overlay.getAttribute('role')).toBe('progressbar')

        // Drive the error state via the same writable the live app uses.
        dataLoadState.set({
            status: 'error',
            businessLoaded: false,
            threadsLoaded: false,
            error: 'Data file missing',
            progress: 0
        })

        // Svelte 5 effects need a microtask flush to apply to the DOM.
        await Promise.resolve()
        await Promise.resolve()

        // On error the overlay switches to alert so screen readers announce the
        // failure; the raw/technical error is preserved in the details block.
        expect(overlay.getAttribute('role')).toBe('alert')
        expect(overlay.getAttribute('aria-label')).toBe('Loading failed — Semantic Explorer')
        expect(overlay.getAttribute('data-loading-state')).toBe('error')
        expect(overlay.getAttribute('aria-describedby')).toBe('loading-error-message')

        const errorMessage = overlay.querySelector('#loading-error-message')
        expect(errorMessage).toBeTruthy()
        expect(errorMessage!.getAttribute('role')).toBe('alert')
        expect(errorMessage!.getAttribute('aria-live')).toBe('assertive')
        expect(errorMessage!.textContent).toContain('Something went wrong')

        // Raw technical detail is surfaced in the disclosure for diagnostics.
        const technical = overlay.querySelector('.loading-error-technical code')
        expect(technical).toBeTruthy()
        expect(technical!.textContent).toContain('Data file missing')
    })

    it('shows the error copy (kicker=Semantic Explorer, title=Unable to load, note=error message) on status="error"', async () => {
        const { container } = render(LoadingOverlay)
        dataLoadState.set({
            status: 'error',
            businessLoaded: false,
            threadsLoaded: false,
            error: 'Worker build failed',
            progress: 0
        })
        await Promise.resolve()
        await Promise.resolve()
        const overlay = container.querySelector('#loading-overlay')!
        expect(overlay.querySelector('.loading-kicker')?.textContent).toContain('Semantic Explorer')
        expect(overlay.querySelector('.loading-title')?.textContent).toContain('Unable to load')
        // W48-H: the note now shows the friendly normalized title + detail
        // (was: raw 'Worker build failed'). The raw message is preserved
        // in the <details> block.
        expect(overlay.querySelector('.loading-note')?.textContent).toContain('Something went wrong')
        expect(overlay.querySelector('.loading-note')?.textContent).toContain('Please try again')
        expect(overlay.querySelector('.loading-error-technical code')?.textContent).toBe('Worker build failed')
        // Retry button is rendered in error state.
        expect(overlay.querySelector('.loading-retry-btn')).toBeTruthy()
    })
})
