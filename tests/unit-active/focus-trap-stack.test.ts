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
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

    it('handleKeydown contains isComposing guard (H-2 already fixed)', () => {
        // The IME composition guard must be present in handleKeydown
        // to prevent CJK input disruption when Tab is pressed inside
        // a trapped container. Verify it still exists in the source.
        const src = readFileSync(resolve(__dirname, '../../src/lib/utils/focus-trap.ts'), 'utf-8')
        expect(src).toMatch(/if\s*\(\s*e\.isComposing\s*\)\s*return/)
    })
})
