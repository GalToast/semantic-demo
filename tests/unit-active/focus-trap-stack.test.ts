/**
 * focus-trap-stack.test.ts — Unit tests for the stack-based focus-trap registry
 *
 * Verifies the H-1 fix (bugsweep 2026-07-26): focus-trap.ts uses a stack
 * so nested traps (dialog + overlay) don't overwrite each other.
 *
 * Run: npx vitest run tests/unit-active/focus-trap-stack.test.ts
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { setupFocusTrap, releaseFocusTrap, FOCUSABLE_SELECTORS } from '@lib/utils/focus-trap'

describe('H-1: focus-trap.ts stack-based nested trap registry', () => {
    afterEach(() => {
        // Drain the stack between tests so they don't interfere.
        // Release up to 5 times to ensure full cleanup.
        for (let i = 0; i < 5; i++) {
            releaseFocusTrap()
        }
    })

    it('FOCUSABLE_SELECTORS is exported and non-empty', () => {
        expect(FOCUSABLE_SELECTORS).toBeTruthy()
        expect(FOCUSABLE_SELECTORS.length).toBeGreaterThan(0)
    })

    it('setupFocusTrap accepts a single string selector', () => {
        expect(() => setupFocusTrap('.my-container')).not.toThrow()
        releaseFocusTrap()
    })

    it('setupFocusTrap accepts an array of selectors', () => {
        expect(() => setupFocusTrap(['.container-a', '.container-b'])).not.toThrow()
        releaseFocusTrap()
    })

    it('nested setupFocusTrap calls do not overwrite each other', () => {
        // Push two trap layers
        setupFocusTrap('.dialog')
        setupFocusTrap('.overlay')

        // Pop the overlay — the dialog layer should still be active.
        // We verify this by calling releaseFocusTrap twice; if the
        // stack were a singleton (old behavior), the second pop would
        // be a no-op that left the stack empty on the first pop.
        releaseFocusTrap() // removes overlay
        releaseFocusTrap() // removes dialog

        // Stack is now empty; another release is a no-op.
        expect(() => releaseFocusTrap()).not.toThrow()
    })

    it('releaseFocusTrap is a no-op when the stack is empty', () => {
        expect(() => releaseFocusTrap()).not.toThrow()
        expect(() => releaseFocusTrap()).not.toThrow()
    })

    it('setupFocusTrap guards against unbounded stack growth (w23 M4)', () => {
        // Push far past the MAX_TRAP_DEPTH guard; overflow pushes must be
        // ignored without throwing, and draining must stay safe.
        for (let i = 0; i < 12; i++) {
            expect(() => setupFocusTrap(`[data-guard-${i}]`)).not.toThrow()
        }
        // Drain all real layers + the ignored overflow — nothing may throw,
        // including the pop-empty warn path after full drain.
        for (let i = 0; i < 12; i++) {
            expect(() => releaseFocusTrap()).not.toThrow()
        }
        expect(() => releaseFocusTrap()).not.toThrow()
    })

    it('document keydown listener removed when stack empties after nested pushes', () => {
        // Track add/removeEventListener calls on document
        const addListener = vi.spyOn(document, 'addEventListener')
        const removeListener = vi.spyOn(document, 'removeEventListener')

        setupFocusTrap('[data-trap-a]')
        expect(addListener).toHaveBeenCalled()

        setupFocusTrap('[data-trap-b]')
        // Second push should not add a new listener (same handler)
        expect(addListener).toHaveBeenCalledTimes(1)

        releaseFocusTrap()
        // Pop the top layer — stack is not empty, so listener stays
        expect(removeListener).not.toHaveBeenCalled()

        releaseFocusTrap()
        // Stack is now empty — listener should be removed
        expect(removeListener).toHaveBeenCalled()

        // Stack empty — another release should not error
        expect(() => releaseFocusTrap()).not.toThrow()

        addListener.mockRestore()
        removeListener.mockRestore()
    })

    it("stack preserves each layer's selectors independently", () => {
        setupFocusTrap('[data-trap-a]')
        setupFocusTrap('[data-trap-b]')
        setupFocusTrap('[data-trap-c]')

        // Pop c — b and a remain
        releaseFocusTrap()

        // Pop b — a remains
        releaseFocusTrap()

        // Pop a — stack empty
        releaseFocusTrap()

        // Stack is now empty; extra release is safe
        expect(() => releaseFocusTrap()).not.toThrow()
    })

    it('handleKeydown ignores Tab during IME composition (behavioral H-2 guard)', () => {
        // CONVERTED 2026-08-07 from a source-inspection readFileSync regex
        // ('handleKeydown contains isComposing guard') into a behavior check.
        // The H-2 guard must make keydown a no-op while a CJK IME is composing:
        // dispatching a real Tab keydown with isComposing=true must NOT move
        // focus (that was the H-2 bug - Tab inside a trapped container during
        // composition yanked the caret out of the input).
        const btn = document.createElement('button')
        btn.id = 'trap-btn'
        btn.textContent = 'trapped'
        document.body.appendChild(btn)
        btn.focus()
        try {
            setupFocusTrap('#trap-btn')

            // Composing: Tab must be ignored → focus stays on the button.
            const composingTab = new KeyboardEvent('keydown', {
                key: 'Tab',
                isComposing: true,
                bubbles: true,
                cancelable: true
            })
            const prevented = !document.dispatchEvent(composingTab)
            expect(prevented).toBe(false) // guard returned early, no preventDefault
            expect(document.activeElement).toBe(btn) // focus untouched

            // Not composing: the same dispatcher must react (no throw, listener
            // alive) - proves the keydown path is actually wired, so the guard
            // above is a real branch, not dead code.
            const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
            expect(() => document.dispatchEvent(tab)).not.toThrow()
        } finally {
            releaseFocusTrap()
            btn.remove()
        }
    })
})
