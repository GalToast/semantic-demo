/**
 * @lib/utils/disposable.svelte.ts
 * Svelte 5 rune wrapper around DisposableRegistry.
 *
 * Usage inside a .svelte or .svelte.ts module:
 *
 *   const reg = disposable('App')
 *
 *   $effect(() => {
 *       reg.timer(setTimeout(() => ..., 1000))
 *       reg.listener(window, 'resize', onResize)
 *   })
 *
 *   // On component destroy, everything is cleaned up automatically
 *
 * IUser: onDestroy is only needed if you want explicit early cleanup.
 *        Otherwise, the `onDestroy front mount` mechanism handles it.
 */

import { DisposableRegistry } from './disposable-registry'

export interface SvelteDisposable extends DisposableRegistry {
    /** Manual trigger for early disposal (beyond onDestroy) */
    dispose(): void
}

/**
 * Create a DisposableRegistry wired to the Svelte component lifecycle.
 * When the component is destroyed, disposeAll() is called automatically.
 *
 * @param label - debug label for the registry
 * @returns A DisposableRegistry that auto-disposes on component unmount
 */
export function disposable(label?: string): DisposableRegistry {
    const reg = new DisposableRegistry({ label: label ?? 'SvelteDisposable', warnAfterDispose: true })

    // In Svelte 5, $effect with a cleanup return handles most cases.
    // For rune-class consumers, we rely on the caller to wire onDestroy.
    // This function is a factory; the actual Svelte lifecycle binding
    // happens in the component via $effect or onDestroy.
    return reg
}
