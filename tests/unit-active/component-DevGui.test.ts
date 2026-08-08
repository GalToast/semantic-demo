/**
 * component-DevGui.test.ts — DevGui.svelte a11y/structure behavioral contract.
 *
 * The component lazily imports lil-gui inside onMount when visible=true; we
 * mock lil-gui so the shell structure can be asserted without a real GUI
 * (jsdom lacks the canvas/dom APIs lil-gui touches).
 */
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/svelte'
import DevGui from '../../src/components/DevGui.svelte'

vi.mock('lil-gui', () => {
    return { default: class FakeGui { add() { return this } addFolder() { return this } name() { return this } onChange() { return this } open() {} close() {} destroy() {} } }
})

describe('DevGui component shell', () => {
    it('renders complementary region with developer-tools label when visible', () => {
        const { container } = render(DevGui, { props: { visible: true } })
        const region = container.querySelector('[role="complementary"]')
        expect(region).not.toBeNull()
        expect(region?.getAttribute('aria-label')).toBe('Developer tools')
    })

    it('renders nothing when visible is false', () => {
        const { container } = render(DevGui, { props: { visible: false } })
        expect(container.querySelector('[role="complementary"]')).toBeNull()
    })
})
