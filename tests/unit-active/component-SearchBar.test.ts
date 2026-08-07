/**
 * component-SearchBar.test.ts — Component test for SearchBar.svelte
 *
 * Verifies:
 *  1. Renders div.search-container with role="search"
 *  2. Container has aria-label="Search businesses in the semantic field"
 *  3. Renders SearchInput sub-component (input#search-input present)
 *  4. SearchResults is lazy-loaded: absent on default, present when search active
 *  5. Default state: container is not expanded
 *  6. When expanded=true prop, container gets .expanded class
 *  7. When panelContained=true prop, container gets .info-panel-contained class
 *  8. Container does not have .searching class by default
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, waitFor } from '@testing-library/svelte'
import SearchBar from '../../src/components/SearchBar.svelte'
import { syncTestStateFromBody } from '../../src/lib/stores/test-compat.svelte'

describe('SearchBar component', () => {
    it('renders div.search-container with role="search"', () => {
        const { container } = render(SearchBar)
        const search = container.querySelector('.search-container')
        expect(search).toBeTruthy()
        expect(search!.getAttribute('role')).toBe('search')
    })

    it('container has aria-label="Search businesses in the semantic field"', () => {
        const { container } = render(SearchBar)
        const search = container.querySelector('.search-container')
        expect(search!.getAttribute('aria-label')).toBe('Search businesses')
    })

    afterEach(() => {
        delete document.body.dataset.loadingPhase
        syncTestStateFromBody()
    })

    it('renders SearchInput sub-component (#search-input present)', () => {
        const { container } = render(SearchBar)
        const input = container.querySelector('#search-input')
        expect(input).toBeTruthy()
    })

    it('lazy-renders SearchResults sub-component when search state is active (#search-results present)', async () => {
        document.body.dataset.loadingPhase = 'searching'
        syncTestStateFromBody()
        const { container } = render(SearchBar)
        // Poll for SearchResults to appear (Svelte reactivity + lazy import).
        // Using waitFor directly replaces a fixed 50ms timer that was flaky
        // under full suite load; waitFor polls every ~50ms by default.
        await waitFor(() => expect(container.querySelector('#search-results')).toBeTruthy(), { timeout: 30000 })
    })

    it('search-results absent on default render (lazy-loaded)', () => {
        const { container } = render(SearchBar)
        const results = container.querySelector('#search-results')
        expect(results).toBeNull()
    })

    it('default state: container is not expanded', () => {
        const { container } = render(SearchBar)
        const search = container.querySelector('.search-container')
        expect(search!.classList.contains('expanded')).toBe(false)
    })

    it('when expanded=true prop, container gets .expanded class', () => {
        const { container } = render(SearchBar, { props: { expanded: true } })
        const search = container.querySelector('.search-container')
        expect(search!.classList.contains('expanded')).toBe(true)
    })

    it('when panelContained=true prop, container gets .info-panel-contained class', () => {
        const { container } = render(SearchBar, { props: { panelContained: true } })
        const search = container.querySelector('.search-container')
        expect(search!.classList.contains('info-panel-contained')).toBe(true)
    })

    it('container does not have .searching class by default', () => {
        const { container } = render(SearchBar)
        const search = container.querySelector('.search-container')
        expect(search!.classList.contains('searching')).toBe(false)
    })

    it('mock-banner is event-driven, not timer-polling (behavioral regression, M10)', async () => {
        // CONVERTED 2026-08-07 from a source-inspection readFileSync-regex
        // assert into a real timer-behavior check. The banner must react to
        // event-bus publishes with ZERO polling timers running.
        vi.useFakeTimers()
        const { publish, EVENTS } = await import('@lib/orchestration/event-bus')
        const { container } = render(SearchBar)
        await vi.runAllTimersAsync()
        expect(container.querySelector('[data-testid="mock-banner"]')).toBeNull()
        expect(vi.getTimerCount()).toBe(0) // no idle polling interval

        publish(EVENTS.SEARCH_MOCK_FALLBACK, { query: 'coffee', count: 20 })
        await vi.runAllTimersAsync()
        expect(container.querySelector('[data-testid="mock-banner"]')).toBeTruthy()
        // After the banner shows, an event-driven impl must not leave a timer
        // running (a polling impl would — that was the original bug).
        expect(vi.getTimerCount()).toBe(0)

        publish(EVENTS.SEARCH_SUCCESS, { query: 'coffee' })
        await vi.runAllTimersAsync()
        expect(container.querySelector('[data-testid="mock-banner"]')).toBeNull()
        expect(vi.getTimerCount()).toBe(0)
        vi.useRealTimers()
    })

    it('publishing SEARCH_MOCK_FALLBACK shows the mock-banner, SEARCH_SUCCESS hides it (M10)', async () => {
        const { publish, EVENTS } = await import('../../src/lib/orchestration/event-bus')
        const { container } = render(SearchBar)
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(container.querySelector('[data-testid="mock-banner"]')).toBeNull()

        publish(EVENTS.SEARCH_MOCK_FALLBACK, { query: 'coffee', count: 20 })
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(container.querySelector('[data-testid="mock-banner"]')).toBeTruthy()

        publish(EVENTS.SEARCH_SUCCESS, { query: 'coffee' })
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(container.querySelector('[data-testid="mock-banner"]')).toBeNull()
    })

    it('publishing SEARCH_DEGRADED does NOT show mock-banner (M10 fix — DEGRADED is 8406 local-index, not mock)', async () => {
        const { publish, EVENTS } = await import('../../src/lib/orchestration/event-bus')
        const { container } = render(SearchBar)
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(container.querySelector('[data-testid="mock-banner"]')).toBeNull()

        publish(EVENTS.SEARCH_DEGRADED, { query: 'coffee' })
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(container.querySelector('[data-testid="mock-banner"]')).toBeNull()
    })
})
