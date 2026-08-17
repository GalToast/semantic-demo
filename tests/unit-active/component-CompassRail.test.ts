/**
 * component-CompassRail.test.ts — direct coverage for the legacy CompassRail
 * activation path.
 *
 * The rail is intentionally desktop-suppressed in the browser journey, so
 * this component test exercises its own onclick -> selectMode -> nav dispatch
 * path without pretending the hidden rail is user-visible.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render } from '@testing-library/svelte'
import CompassRail from '../../src/components/CompassRail.svelte'
import { appState } from '../../src/lib/state/app.svelte.ts'
import { dispatchNavTransition, NAV_TRANSITION_ACTIONS } from '../../src/lib/stores/navigation.svelte.ts'

function resetNavigation(): void {
    dispatchNavTransition(NAV_TRANSITION_ACTIONS.RETURN_OVERVIEW)
}

describe('CompassRail component', () => {
    beforeEach(() => {
        resetNavigation()
    })

    afterEach(() => {
        resetNavigation()
    })

    it('does not render the rail when visible is false', () => {
        const { container } = render(CompassRail, { props: { visible: false } })

        expect(container.querySelector('#compass-rail')).toBeNull()
    })

    it('renders six semantic journey buttons when visible', () => {
        const { container } = render(CompassRail, { props: { visible: true } })
        const rail = container.querySelector('#compass-rail')

        expect(rail).toBeTruthy()
        expect(rail?.getAttribute('aria-label')).toBe('Journey compass')

        const buttons = [...container.querySelectorAll<HTMLButtonElement>('#compass-rail .compass-step')]
        expect(buttons).toHaveLength(6)
        expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
            'Navigate to Overview',
            'Navigate to Search',
            'Navigate to Focus',
            'Navigate to Trail',
            'Navigate to Inside',
            'Navigate to Map'
        ])
    })

    it('activates Search through the component handler and canonical nav state', () => {
        const { container } = render(CompassRail, { props: { visible: true } })
        const searchButton = container.querySelector<HTMLButtonElement>(
            '#compass-rail .compass-step[aria-label="Navigate to Search"]'
        )

        expect(searchButton).toBeTruthy()
        searchButton?.click()

        expect(appState.navState.mode).toBe('search')
        expect(appState.navState.surface).toBe('search')
    })
})
