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
import { describe, it, expect, afterEach } from 'vitest'
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
        // Flush any microticks and paint timings in Vitest JS-DOM
        await new Promise((resolve) => setTimeout(resolve, 50))
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

    it('mock-banner is event-driven, not sessionStorage polling (timer-sprawl regression)', async () => {
        // Source-level regression: the previous implementation used a 750ms
        // setInterval to poll sessionStorage['api_unreachable']. That was
        // timer sprawl — a forever-running interval just to flip one boolean.
        // Now it reacts to SEARCH_DEGRADED / SEARCH_SUCCESS via the event bus.
        const { readFileSync } = await import('fs')
        const { resolve } = await import('path')
        const source = readFileSync(resolve(__dirname, '../../src/components/SearchBar.svelte'), 'utf-8')
        // Strip Svelte comments and JS comments so doc references don't trip the check
        const stripped = source.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\/[^\n]*/g, '')
        expect(stripped).not.toMatch(/setInterval\(/)
        expect(source).toMatch(/EVENTS\.SEARCH_DEGRADED/)
        expect(source).toMatch(/EVENTS\.SEARCH_SUCCESS/)
        // Banner copy must remain (this is a refactor, not a removal)
        expect(source).toMatch(/mock-banner/)
        expect(source).toMatch(/Showing demo data/)
    })

    it('publishing SEARCH_DEGRADED shows the mock-banner, SEARCH_SUCCESS hides it', async () => {
        const { publish, EVENTS } = await import('../../src/lib/orchestration/event-bus')
        const { container } = render(SearchBar)
        // After mount the banner should be hidden (no api_unreachable sessionStorage)
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(container.querySelector('[data-testid="mock-banner"]')).toBeNull()

        publish(EVENTS.SEARCH_DEGRADED, { query: 'coffee' })
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(container.querySelector('[data-testid="mock-banner"]')).toBeTruthy()

        publish(EVENTS.SEARCH_SUCCESS, { query: 'coffee' })
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(container.querySelector('[data-testid="mock-banner"]')).toBeNull()
    })
})
