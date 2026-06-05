// @ts-check
// Svelte islands mount into slot <div>s that may be conditionally rendered
// by their parent Svelte component. This helper polls for the slot to appear
// in the DOM and invokes the mount callback when it does. It also handles
// the document-loading case by deferring to DOMContentLoaded first.

export const MOUNT_FLAG = 'svelteMounted';

/**
 * @param {string} slotId
 * @param {() => boolean} mountFn Returns true once mounted successfully.
 */
export function awaitSlot(slotId, mountFn) {
    if (typeof document === 'undefined') return;

    const tryMount = () => {
        if (mountFn()) return true;
        return false;
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (tryMount()) return;
            observeUntilMounted();
        }, { once: true });
        return;
    }

    if (tryMount()) return;
    observeUntilMounted();

    function observeUntilMounted() {
        const observer = new MutationObserver(() => {
            if (tryMount()) observer.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
}
