/**
 * component-FocusCard.test.ts — FocusCard.svelte behavioral contract.
 *
 * Mounts the real component in jsdom and asserts the actual DOM structure.
 * cardVisible = visible && isFocusedReactive (navState-driven); the default
 * store state renders the EMPTY state (#selected-empty), which is the
 * observable shell contract.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import FocusCard from '../../src/components/FocusCard.svelte'

afterEach(() => cleanup())

describe('FocusCard component', () => {
    it('renders nothing when not focused (even when visible)', () => {
        const { container } = render(FocusCard, { props: { visible: true } })
        // Not focused → card gated off entirely.
        expect(container.querySelector('#focus-card-selected')).toBeNull()
    })

    it('renders empty-state region with guidance when visible and focused', async () => {
        const { appState } = await import('@lib/state/app.svelte')
        // Direct store mutation is the established test pattern (see
        // canvas-keyboard-nav.test.ts).
        appState.navState.focusedIndex = 0
        appState.navState.mode = 'focus'
        appState.navState.surface = 'focus'

        const { container } = render(FocusCard, { props: { visible: true } })
        const root = container.querySelector('#focus-card-selected')
        expect(root).not.toBeNull()
        expect(root?.getAttribute('aria-label')).toBe('Selected business')
        expect(root?.getAttribute('role')).toBe('region')
        const empty = container.querySelector('#selected-empty')
        expect(empty).not.toBeNull()
        const headline = container.querySelector('.selected-empty-headline')
        expect(headline?.textContent).toContain('Select a business')
        const sub = container.querySelector('.selected-empty-sub')
        expect(sub?.textContent).toContain('Click a business on the map to explore')
        const icon = container.querySelector('.empty-icon')
        expect(icon?.getAttribute('aria-hidden')).toBe('true')
    })

    it('uses tap-to-explore copy on the mobile/placeholder2d fallback (no impossible map instruction)', async () => {
        // Mobile cold-load path: the 2D placeholder is active and there is no
        // interactive map to click. The empty-state copy must not instruct the
        // user to "click the map".
        const { setRenderKind } = await import('@lib/orchestration/parity-attrs.svelte')
        setRenderKind('placeholder2d')
        const { appState } = await import('@lib/state/app.svelte')
        appState.navState.focusedIndex = 0
        appState.navState.mode = 'focus'
        appState.navState.surface = 'focus'

        const { container } = render(FocusCard, { props: { visible: true } })
        const sub = container.querySelector('.selected-empty-sub')
        expect(sub?.textContent).toContain('Tap a business')
        expect(sub?.textContent).not.toContain('on the map')
    })
})
