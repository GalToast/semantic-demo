export const FOCUSABLE_SELECTORS = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
].join(', ');

let activeTrapContainers = [];
let isTrapping = false;

/**
 * Initializes a focus trap constrained to the given DOM selectors.
 * When active, pressing Tab will loop focus within the first visible 
 * focusable element and the last visible focusable element inside the selectors.
 * 
 * @param {string[]} containerSelectors Array of CSS selectors for container elements
 */
export function setupFocusTrap(containerSelectors) {
    if (!Array.isArray(containerSelectors)) {
        containerSelectors = [containerSelectors];
    }
    
    activeTrapContainers = containerSelectors;
    
    if (!isTrapping) {
        document.addEventListener('keydown', handleKeydown);
        isTrapping = true;
    }
}

/**
 * Releases the active focus trap, restoring natural tab order.
 */
export function releaseFocusTrap() {
    activeTrapContainers = [];
    if (isTrapping) {
        document.removeEventListener('keydown', handleKeydown);
        isTrapping = false;
    }
}

function handleKeydown(e) {
    if (e.key !== 'Tab') return;
    if (activeTrapContainers.length === 0) return;
    
    const focusableEls = [];
    
    for (const selector of activeTrapContainers) {
        const containers = document.querySelectorAll(selector);
        for (const container of containers) {
            if (container.hasAttribute('hidden') || window.getComputedStyle(container).display === 'none') {
                continue;
            }
            
            const els = Array.from(container.querySelectorAll(FOCUSABLE_SELECTORS));
            for (const el of els) {
                // Ensure element is visible before adding it to trap list
                const rect = el.getBoundingClientRect();
                if (
                    rect.width > 0 && 
                    rect.height > 0 && 
                    !el.hasAttribute('hidden') && 
                    window.getComputedStyle(el).visibility !== 'hidden'
                ) {
                    focusableEls.push(el);
                }
            }
        }
    }
    
    if (focusableEls.length === 0) return;
    
    const first = focusableEls[0];
    const last = focusableEls[focusableEls.length - 1];
    const activeIndex = focusableEls.indexOf(document.activeElement);
    
    // If focus is somehow outside the trap (e.g. they clicked canvas then pressed Tab)
    if (activeIndex === -1) {
        e.preventDefault();
        first.focus();
        return;
    }
    
    if (e.shiftKey) {
        if (activeIndex === 0) {
            e.preventDefault();
            last.focus();
        }
    } else {
        if (activeIndex === focusableEls.length - 1) {
            e.preventDefault();
            first.focus();
        }
    }
}
