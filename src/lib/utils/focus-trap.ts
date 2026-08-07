/**
 * @lib/utils/focus-trap.ts — Focus trap for accessibility
 *
 * Constrains Tab key cycling within a set of container selectors
 * so modal/overlay UIs remain keyboard-accessible.
 *
 * (ported from the original focus-trap utility — see git history for provenance)
 */

/** CSS selector string matching all standard focusable elements. */
export const FOCUSABLE_SELECTORS = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled]):not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"])',
    'select:not([disabled])',
    '[tabindex="0"]'
].join(', ')

const trapStack: string[][] = []
let isTrapping = false

/**
 * Maximum nesting depth for the focus-trap stack. Guards against unbounded
 * growth from a push/pop imbalance (a trap pushed but never popped). Legitimate
 * UI only stacks a handful of dialog layers, so 8 is generous headroom.
 */
const MAX_TRAP_DEPTH = 8

/**
 * Pushes a new focus-trap layer onto the stack. When active,
 * pressing Tab will loop focus within visible focusable elements
 * across all active trap layers.
 */
export function setupFocusTrap(containerSelectors: string | string[]): void {
    if (!Array.isArray(containerSelectors)) {
        containerSelectors = [containerSelectors]
    }

    if (trapStack.length >= MAX_TRAP_DEPTH) {
        // w23 a11y M4: refuse to grow the stack past the guard instead of
        // leaking layers (the listener would stay installed forever).
        console.warn(
            `[focus-trap] ignoring setupFocusTrap at depth ${trapStack.length} (MAX_TRAP_DEPTH=${MAX_TRAP_DEPTH}) — possible push/pop imbalance`
        )
        return
    }

    trapStack.push(containerSelectors)

    if (trapStack.length === 1) {
        // First trap layer — install the document-level listener
        document.addEventListener('keydown', handleKeydown)
        isTrapping = true
    }
}

/**
 * Pops the most recent focus-trap layer from the stack. When the
 * stack becomes empty, the document-level keydown listener is removed.
 */
export function releaseFocusTrap(): void {
    if (trapStack.length === 0) {
        // w23 a11y M4: popping an empty stack hides a push/pop imbalance;
        // warn instead of silently no-oping so the leak is detectable.
        console.warn('[focus-trap] releaseFocusTrap() called on an empty stack')
        return
    }

    trapStack.pop()

    if (trapStack.length === 0 && isTrapping) {
        document.removeEventListener('keydown', handleKeydown)
        isTrapping = false
    }
}

function handleKeydown(e: KeyboardEvent): void {
    if (e.isComposing) return
    if (e.key !== 'Tab') return
    if (trapStack.length === 0) return

    const focusableEls: Element[] = []

    for (const selectors of trapStack) {
        for (const selector of selectors) {
            const containers = document.querySelectorAll(selector)
            for (const container of containers) {
                if (container.hasAttribute('hidden') || window.getComputedStyle(container).display === 'none') {
                    continue
                }

                const els = Array.from(container.querySelectorAll(FOCUSABLE_SELECTORS))
                for (const el of els) {
                    const rect = el.getBoundingClientRect()
                    if (
                        rect.width > 0 &&
                        rect.height > 0 &&
                        !el.hasAttribute('hidden') &&
                        window.getComputedStyle(el).visibility !== 'hidden'
                    ) {
                        focusableEls.push(el)
                    }
                }
            }
        }
    }

    if (focusableEls.length === 0) return

    const first = focusableEls[0]!
    const last = focusableEls[focusableEls.length - 1]!
    const activeIndex = focusableEls.indexOf(document.activeElement as Element)

    if (activeIndex === -1) {
        e.preventDefault()
        ;(first as HTMLElement).focus()
        return
    }

    if (e.shiftKey) {
        if (activeIndex === 0) {
            e.preventDefault()
            ;(last as HTMLElement).focus()
        }
    } else {
        if (activeIndex === focusableEls.length - 1) {
            e.preventDefault()
            ;(first as HTMLElement).focus()
        }
    }
}
