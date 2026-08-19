/**
 * component-HelpDialog.test.ts — HelpDialog.svelte behavioral contract.
 *
 * Renders the real component in jsdom and asserts the DOM structure:
 * dialog element, inner content, close button, toggleHelpDialog export.
 *
 * Note: HelpDialog has heavy store dependencies (engineReady, viewport,
 * focus coordinator, onboarding storage, deep-link). This test focuses on
 * the DOM structure and the exported toggleHelpDialog() method.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/svelte'
import HelpDialog from '../../src/lib/components/header/HelpDialog.svelte'

afterEach(() => cleanup())

describe('HelpDialog component', () => {
    it('renders a dialog element with class help-dialog', () => {
        const { container } = render(HelpDialog)
        const dialog = container.querySelector('dialog.help-dialog')
        expect(dialog).not.toBeNull()
    })

    it('has aria-labelledby pointing to help-title', () => {
        const { container } = render(HelpDialog)
        const dialog = container.querySelector('dialog')
        expect(dialog?.getAttribute('aria-labelledby')).toBe('help-title')
    })

    it('has aria-describedby pointing to help-desc', () => {
        const { container } = render(HelpDialog)
        const dialog = container.querySelector('dialog')
        expect(dialog?.getAttribute('aria-describedby')).toBe('help-desc')
    })

    it('renders the help title', () => {
        const { container } = render(HelpDialog)
        const title = container.querySelector('#help-title')
        expect(title?.textContent).toContain('Explore Montgomery County businesses visually')
    })

    it('renders the help description with business count', () => {
        const { container } = render(HelpDialog)
        const desc = container.querySelector('#help-desc')
        expect(desc?.textContent).toContain('8,406 local businesses')
    })

    it('renders the steps list', () => {
        const { container } = render(HelpDialog)
        const steps = container.querySelector('.help-dialog-steps')
        expect(steps).not.toBeNull()
        expect(steps?.getAttribute('aria-label')).toBe('Quick start steps')
        const items = [...steps.querySelectorAll('li')]
        expect(items.length).toBeGreaterThanOrEqual(4)
    })

    it('renders the hint paragraph with keyboard shortcut', () => {
        const { container } = render(HelpDialog)
        const hint = container.querySelector('.help-dialog-hint')
        expect(hint).not.toBeNull()
        expect(hint?.textContent).toContain('?')
    })

    it('renders the close button', () => {
        const { container } = render(HelpDialog)
        const closeBtn = container.querySelector('.help-dialog-close')
        expect(closeBtn).not.toBeNull()
        expect(closeBtn?.textContent).toBe('Got it')
        expect(closeBtn?.getAttribute('type')).toBe('button')
    })

    it('renders the help-dialog-inner container', () => {
        const { container } = render(HelpDialog)
        expect(container.querySelector('.help-dialog-inner')).not.toBeNull()
    })

    it('exports toggleHelpDialog function', () => {
        const { component } = render(HelpDialog)
        expect(typeof (component as any).toggleHelpDialog).toBe('function')
    })
})
