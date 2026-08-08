/**
 * component-DemoChoreography.test.ts — DemoChoreography.svelte behavioral
 * contract. Mounts the real component in jsdom and asserts the actual DOM.
 * The shell renders only while the demo is active (phase not IDLE/COMPLETE/
 * CANCELLED) and not suppressed; force=true bypasses the shouldRunDemo gate
 * (the ?demo=force debug path) so the shell renders synchronously.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import DemoChoreography from '../../src/components/DemoChoreography.svelte'

afterEach(() => cleanup())

describe('DemoChoreography component', () => {
    beforeEach(async () => {
        const { appState } = await import('@lib/state/app.svelte')
        appState.demoPhase = 'OVERVIEW'
    })

    it('renders the guided-demo shell with live-region semantics while active', async () => {
        const { container } = render(DemoChoreography, { props: { force: true } })
        const root = container.querySelector('#demo-choreography')
        expect(root).not.toBeNull()
        expect(root?.getAttribute('aria-live')).toBe('polite')
        expect(root?.getAttribute('aria-label')).toBe('Guided demo')
    })

    it('renders the dismiss control with a11y label', async () => {
        const { container } = render(DemoChoreography, { props: { force: true } })
        const dismiss = container.querySelector('.demo-dismiss')
        expect(dismiss).not.toBeNull()
        expect(dismiss?.getAttribute('aria-label')).toBe('Dismiss demo')
    })

    it('renders status paragraph driven by the phase caption', async () => {
        const { container } = render(DemoChoreography, { props: { force: true } })
        const status = container.querySelector('.demo-status')
        expect(status).not.toBeNull()
    })
})
