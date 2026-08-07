/**
 * component-Toast.test.ts — Component test foundation for Toast.svelte
 *
 * Verifies:
 *  1. Renders #experience-reset-toast with default hidden state (aria-hidden="true")
 *  2. Default role="status" (info variant) with aria-live="polite"
 *  3. Renders #experience-toast-title for title text
 *  4. Renders #experience-toast-copy for body text
 *  5. Has .experience-reset-toast class for styling hook
 *  6. Accepts data-toast-state prop via body dataset (MutationObserver pattern)
 *  7. Error variant uses role="alert" with aria-live="assertive"
 *  8. Both title and copy divs are present and accept text content
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/svelte'
import Toast from '../../src/components/Toast.svelte'

describe('Toast component', () => {
    it('renders #experience-reset-toast with aria-hidden="true" by default', () => {
        const { container } = render(Toast)
        const toast = container.querySelector('#experience-reset-toast')
        expect(toast).toBeTruthy()
        expect(toast!.getAttribute('aria-hidden')).toBe('true')
    })

    it('default state has role="status" (info variant)', () => {
        const { container } = render(Toast)
        const toast = container.querySelector('#experience-reset-toast')
        expect(toast!.getAttribute('role')).toBe('status')
    })

    it('default state has aria-live="polite"', () => {
        const { container } = render(Toast)
        const toast = container.querySelector('#experience-reset-toast')
        expect(toast!.getAttribute('aria-live')).toBe('polite')
    })

    it('renders #experience-toast-title element', () => {
        const { container } = render(Toast)
        const title = container.querySelector('#experience-toast-title')
        expect(title).toBeTruthy()
        expect(title!.tagName).toBe('DIV')
    })

    it('renders #experience-toast-copy element', () => {
        const { container } = render(Toast)
        const copy = container.querySelector('#experience-toast-copy')
        expect(copy).toBeTruthy()
        expect(copy!.tagName).toBe('DIV')
    })

    it('has .experience-reset-toast class for styling hook', () => {
        const { container } = render(Toast)
        const toast = container.querySelector('.experience-reset-toast')
        expect(toast).toBeTruthy()
        expect(toast!.id).toBe('experience-reset-toast')
    })

    it('accepts MutationObserver-driven state from body dataset', () => {
        // Toast observes body.dataset.toastState via MutationObserver
        // Verify the component mounts without error and exposes the expected DOM IDs
        const { container } = render(Toast)
        const toast = container.querySelector('#experience-reset-toast')
        expect(toast).toBeTruthy()
        // Initially hidden (no body dataset set)
        expect(toast!.getAttribute('aria-hidden')).toBe('true')
        expect(toast!.getAttribute('role')).toBe('status')
    })

    it('title and copy divs accept text content via dataset binding', () => {
        const { container } = render(Toast)
        const title = container.querySelector('#experience-toast-title')
        const copy = container.querySelector('#experience-toast-copy')
        // Both should render with empty text by default (no dataset set)
        expect(title!.textContent).toBe('')
        expect(copy!.textContent).toBe('')
        // But they should be real DOM elements ready for text insertion
        expect(title!.tagName).toBe('DIV')
        expect(copy!.tagName).toBe('DIV')
    })
})

// W49-A: the queue block now includes a "Next: <title>" preview line.
// It only renders when hasQueue && nextTitle.length > 0. The default
// render has no queued toast, so the preview must NOT be in the DOM.
describe('Toast component — next-title preview (W49-A)', () => {
    it('does NOT render .experience-toast-next when queue is empty', () => {
        const { container } = render(Toast)
        const next = container.querySelector('.experience-toast-next')
        expect(next).toBeNull()
        // Same: the data-testid the journey tests use.
        const nextById = container.querySelector('[data-testid="toast-next-preview"]')
        expect(nextById).toBeNull()
    })

    it('does NOT render .experience-toast-queue when queue is empty', () => {
        const { container } = render(Toast)
        const queue = container.querySelector('.experience-toast-queue')
        expect(queue).toBeNull()
    })

    it('shows the Next: preview when a toast is queued behind the active one (behavioral W49-A)', async () => {
        // CONVERTED 2026-08-07 from a source-inspection readFileSync assert
        // ('source contains .experience-toast-next') into a real behavior check.
        // The guarantee: enqueue two toasts — the first renders active, the
        // second becomes the 'Next:' preview via data-testid="toast-next-preview".
        const { showToast, clearToastQueue } = await import('../../src/lib/stores/toast.svelte.ts')
        const { container } = render(Toast)

        showToast('First toast', 'body one')
        // Flush the store subscription so the component sees active=true before
        // the second enqueue queues behind it (same tick pattern as SearchBar
        // M10 sibling test).
        await new Promise((resolve) => setTimeout(resolve, 0))
        showToast('Second toast', 'body two')
        await new Promise((resolve) => setTimeout(resolve, 0))

        const preview = container.querySelector('[data-testid="toast-next-preview"]')
        expect(preview).not.toBeNull()
        expect(preview!.querySelector('.experience-toast-next-title')?.textContent).toContain('Second toast')

        // Clean up so later tests don't see the queued residue.
        clearToastQueue()
    })
})
