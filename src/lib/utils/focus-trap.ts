/**
 * @lib/utils/focus-trap.ts — Focus trap for accessibility
 *
 * Constrains Tab key cycling within a set of container selectors
 * so modal/overlay UIs remain keyboard-accessible.
 *
 * Port of
 */

/** CSS selector string matching all standard focusable elements. */
export const FOCUSABLE_SELECTORS = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex="0"]'
].join(', ')

let activeTrapContainers: string[] = []
let isTrapping = false

/**
 * Initializes a focus trap constrained to the given DOM selectors.
 * When active, pressing Tab will loop focus within the first visible
 * focusable element and the last visible focusable element inside the selectors.
 */
export function setupFocusTrap(containerSelectors: string | string[]): void {
    if (!Array.isArray(containerSelectors)) {
        containerSelectors = [containerSelectors]
    }

    activeTrapContainers = containerSelectors

    if (!isTrapping) {
        document.addEventListener('keydown', handleKeydown)
        isTrapping = true
    }
}

/**
 * Releases the active focus trap, restoring natural tab order.
 */
export function releaseFocusTrap(): void {
    activeTrapContainers = []
    if (isTrapping) {
        document.removeEventListener('keydown', handleKeydown)
        isTrapping = false
    }
}

function handleKeydown(e: KeyboardEvent): void {
    if (e.isComposing) return
    if (e.key !== 'Tab') return
    if (activeTrapContainers.length === 0) return

    const focusableEls: Element[] = []

    for (const selector of activeTrapContainers) {
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
