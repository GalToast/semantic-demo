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
 *       return () => reg.disposeAll()  // <-- Caller must wire cleanup
 *   })
 *
 * IMPORTANT: The disposable() factory does NOT auto-dispose. The caller
 * MUST wrap usage in $effect and return the cleanup function.
 */

import { DisposableRegistry } from './disposable-registry'

export interface SvelteDisposable extends DisposableRegistry {
    /** Manual trigger for early disposal (beyond onDestroy) */
    dispose(): void
}

/**
 * Create a DisposableRegistry for use in Svelte components.
 * 
 * ⚠️ IMPORTANT: This does NOT auto-dispose. The caller must wire cleanup:
 *
 *   $effect(() => {
 *       const reg = disposable('MyComponent')
 *       reg.timer(setTimeout(...))
 *       return () => reg.disposeAll()  // <-- Required for cleanup
 *   })
 *
 * @param label - debug label for the registry
 * @returns A DisposableRegistry instance (caller must manage lifecycle)
 */
export function disposable(label?: string): DisposableRegistry {
    const reg = new DisposableRegistry({ label: label ?? 'SvelteDisposable', warnAfterDispose: true })

    // Note: This factory does NOT wire auto-dispose. The caller must
    // wrap usage in $effect and return reg.disposeAll() for cleanup.
    // This design gives callers explicit control over lifecycle timing.
    return reg
}
