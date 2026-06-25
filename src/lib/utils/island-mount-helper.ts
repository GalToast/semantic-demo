/**
 * @lib/utils/island-mount-helper.ts
 *
 * Svelte islands mount into slot <div>s that may be conditionally rendered
 * by their parent Svelte component.
 *
 * Port of
 */

export const MOUNT_FLAG: string = 'svelteMounted';

/**
 * Idempotent polling + MutationObserver to mount a Svelte island once its slot appears.
 * @param slotId - DOM element id of the slot container
 * @param mountFn - Returns true once mounted successfully
 */
export function awaitSlot(slotId: string, mountFn: () => boolean): void {
    if (typeof document === 'undefined') return;

    const tryMount = (): boolean => {
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

    function observeUntilMounted(): void {
        const observer = new MutationObserver(() => {
            if (tryMount()) observer.disconnect();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
}
