/**
 * @lib/utils/disposable-registry.ts
 * Unified lifecycle tracking for timers,Clazz listeners, subscriptions and callbacks.
 *
 * Problem this solves: every leak in recent history was "started something,
 * forgot to stop it".  DisposableRegistry makes forgetting structurally
 * impossible because you register the cleanup at creation time and
 * disposeAll() handles the rest.
 *
 * Usage (imperative, for non-Svelte code):
 *
 *   const reg = new DisposableRegistry()
 *   reg.timer(setTimeout(fn, 1000))
 *   reg.listener(window, 'resize', onResize)
 *   reg.subscription(store.subscribe((s) => ...))
 *   // later...
 *   reg.disposeAll()
 *
 * Usage (Svelte 5 rune, inside .svelte or .svelte.ts):
 *
 *   import { disposable } from '@lib/utils/disposable.svelte'
 *
 *   let reg = disposable()
 *   $effect(() => {
 *       reg.timer(setTimeout(() => ..., 1000))
 *       reg.listener(window, 'resize', onResize)
 *       return () => reg.disposeAll()
 *   })
 */

export type DisposeFn = () => void
export type DisposeLike = DisposeFn | { dispose(): void }

function callDispose(d: DisposeLike): void {
    if (typeof d === 'function') {
        d()
    } else {
        // @ts-ignore -- defensive
        if (d && typeof d.dispose === 'function') {
            d.dispose()
        }
    }
}

export interface DisposableRegistryOptions {
    /** Label for debugging / leak traces */
    label?: string
    /** If true, warn in DEV when a new disposable is added after disposeAll() */
    warnAfterDispose?: boolean
}

export class DisposableRegistry {
    private items: DisposeLike[] = []
    private disposed = false
    private label: string
    private warnAfterDispose: boolean

    constructor(options: DisposableRegistryOptions = {}) {
        const { label = 'DisposableRegistry', warnAfterDispose = import.meta.env.DEV } = options
        this.label = label
        this.warnAfterDispose = warnAfterDispose
    }

    /** Register a raw cleanup function */
    add(dispose: DisposeFn): void
    add(disposable: { dispose(): void }): void
    add(disposable: DisposeLike): void
    add(fn: DisposeLike): void {
        if (this.disposed && this.warnAfterDispose) {
            // eslint-disable-next-line no-console
            console.warn(`[${this.label}] Adding disposable after disposeAll() — leak risk`, fn)
        }
        this.items.push(fn)
    }

    /** Track a setTimeout / setInterval id.  Clears it on disposeAll() */
    timer(id: number): void {
        this.add(() => {
            clearTimeout(id)
            clearInterval(id)
        })
    }

    /** Track a requestAnimationFrame id.  Cancels it on disposeAll() */
    raf(id: number): void {
        this.add(() => cancelAnimationFrame(id))
    }

    /** Track a DOM / EventTarget listener.  Removes it on disposeAll().
     *  Accepts any object with removeEventListener (e.g. Three.js OrbitControls). */
    listener(target: any, type: string, handler: EventListener, options?: EventListenerOptions | boolean): void {
        this.add(() => target.removeEventListener(type, handler, options))
    }

    /** Track a Svelte/Vanilla store subscription unsubscribe function */
    subscription(unsubscribe: DisposeFn): void {
        this.add(unsubscribe)
    }

    /** Track a one-off resource with a dispose() method (e.g. Three.js Object3D) */
    resource(obj: { dispose(): void }): void {
        this.items.push(obj)
    }

    /** Convenience: track multiple disposables at once */
    addMany(...disposables: DisposeLike[]): void {
        for (const d of disposables) {
            if (typeof d === 'function') {
                this.add(d)
            } else {
                this.add(d)
            }
        }
    }

    /**
     * Dispose everything, in reverse registration order (child-first cleanup).
     * Catches and swallows per-item errors to maximize cleanup reach.
     * Idempotent: calling multiple times is safe.
     */
    disposeAll(): void {
        if (this.disposed) return
        this.disposed = true

        // Reverse order: first-in-last-out (like a stack)
        const toDispose = this.items.reverse()
        this.items = [] // release refs before calling disposables

        for (const item of toDispose) {
            try {
                callDispose(item)
            } catch (err) {
                if (import.meta.env.DEV) {
                    // eslint-disable-next-line no-console
                    console.warn(`[${this.label}] Disposable threw during cleanup:`, err)
                }
            }
        }
    }

    /** Alias for disposeAll() — reads naturally in try/finally or onDestroy */
    dispose(): void {
        this.disposeAll()
    }

    /** True if disposeAll() has been called */
    get isDisposed(): boolean {
        return this.disposed
    }

    /** Number of active tracked disposables */
    get size(): number {
        return this.items.length
    }
}

/** Factory for a root registry — same as `new DisposableRegistry()` */
export function createDisposableRegistry(options?: DisposableRegistryOptions): DisposableRegistry {
    return new DisposableRegistry(options)
}

/** Global assertion helper for tests: after disposeAll, registry should be empty */
export function assertDisposed(registry: DisposableRegistry, label?: string): void {
    if (!registry.isDisposed) {
        throw new Error(
            `Expected ${label ?? 'DisposableRegistry'} to be disposed, but it was not. ` +
                `Remaining disposables: ${registry.size}`
        )
    }
}
