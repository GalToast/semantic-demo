/**
 * component-SelectedMatchNarrative.test.ts — SelectedMatchNarrative.svelte behavioral contract.
 *
 * Renders the real component in jsdom and asserts the DOM structure:
 * conditional rendering, panel, label, copy, idPrefix support.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import SelectedMatchNarrative from '../../src/lib/components/focus/SelectedMatchNarrative.svelte'

afterEach(() => cleanup())

describe('SelectedMatchNarrative component', () => {
    it('renders nothing when showMatchPanel is false', () => {
        const { container } = render(SelectedMatchNarrative, {
            props: { matchNarrative: 'Some narrative', showMatchPanel: false }
        })
        expect(container.querySelector('.selected-match-panel')).toBeNull()
    })

    it('renders nothing when matchNarrative is empty', () => {
        const { container } = render(SelectedMatchNarrative, {
            props: { matchNarrative: '', showMatchPanel: true }
        })
        expect(container.querySelector('.selected-match-panel')).toBeNull()
    })

    it('renders the panel when both showMatchPanel and matchNarrative are set', () => {
        const { container } = render(SelectedMatchNarrative, {
            props: { matchNarrative: 'Great match because of X', showMatchPanel: true }
        })
        const panel = container.querySelector('.selected-match-panel')
        expect(panel).not.toBeNull()
    })

    it('displays the match narrative in the copy div', () => {
        const { container } = render(SelectedMatchNarrative, {
            props: { matchNarrative: 'Great match because of X', showMatchPanel: true }
        })
        const copy = container.querySelector('.selected-match-copy')
        expect(copy?.textContent).toBe('Great match because of X')
    })

    it('renders the "Why this listing" label', () => {
        const { container } = render(SelectedMatchNarrative, {
            props: { matchNarrative: 'Test', showMatchPanel: true }
        })
        const label = container.querySelector('.selected-match-label')
        expect(label?.textContent).toBe('Why this listing')
    })

    it('applies idPrefix to panel id when provided', () => {
        const { container } = render(SelectedMatchNarrative, {
            props: { matchNarrative: 'Test', showMatchPanel: true, idPrefix: 'focus-' }
        })
        expect(container.querySelector('#focus-selected-match-panel')).not.toBeNull()
    })

    it('applies idPrefix to label id when provided', () => {
        const { container } = render(SelectedMatchNarrative, {
            props: { matchNarrative: 'Test', showMatchPanel: true, idPrefix: 'focus-' }
        })
        expect(container.querySelector('#focus-selected-match-label')).not.toBeNull()
    })

    it('applies idPrefix to copy id when provided', () => {
        const { container } = render(SelectedMatchNarrative, {
            props: { matchNarrative: 'Test', showMatchPanel: true, idPrefix: 'focus-' }
        })
        expect(container.querySelector('#focus-selected-match-copy')).not.toBeNull()
    })

    it('uses empty idPrefix by default', () => {
        const { container } = render(SelectedMatchNarrative, {
            props: { matchNarrative: 'Test', showMatchPanel: true }
        })
        expect(container.querySelector('#selected-match-panel')).not.toBeNull()
        expect(container.querySelector('#selected-match-label')).not.toBeNull()
        expect(container.querySelector('#selected-match-copy')).not.toBeNull()
    })

    it('renders nothing when both conditions are false', () => {
        const { container } = render(SelectedMatchNarrative, {
            props: { matchNarrative: '', showMatchPanel: false }
        })
        expect(container.querySelector('.selected-match-panel')).toBeNull()
    })
})
