/**
 * @lib/stores/legend.svelte.ts — Legend panel visibility store
 *
 * Svelte 5 / Svelte-first port of the legend panel open state.
 * Manages whether the category legend panel is open.
 * Default: open on desktop (>768px), closed on mobile.
 */
import { appState } from '@lib/state/app.svelte.ts'
import type { Readable } from 'svelte/store'
import { debugError } from '@lib/utils/debug'

// ── Store ────────────────────────────────────────────────────────────────────

interface LegendStoreApi extends Readable<boolean> {
    update(_fn: (_v: boolean) => boolean): void
    set(_value: boolean): void
}

class LegendStore {
    // Use Svelte 5 reactive $state directly linked to appState.legendOpen
    get open(): boolean {
        return appState.legendOpen
    }

    set open(value: boolean) {
        appState.withMutation(() => {
            appState.legendOpen = value
        })
        this.notify()
    }

    // Backwards-compatibility subscribers
    private subscribers = new Set<(_v: boolean) => void>()

    /**
     * Subscribe method to meet Readable<boolean> contract.
     * Enables Svelte 4/5 `$store` prefix subscription syntax in legacy wrappers.
     */
    subscribe = (run: (_v: boolean) => void): (() => void) => {
        this.subscribers.add(run)
        run(this.open)
        return () => {
            this.subscribers.delete(run)
        }
    }

    /**
     * Run all current active subscribers synchronously when a value changes.
     */
    private notify(): void {
        for (const run of this.subscribers) {
            try {
                run(this.open)
            } catch (err) {
                debugError('[LegendStore] Subscription notification error:', err)
            }
        }
    }

    update(fn: (_v: boolean) => boolean): void {
        this.open = fn(this.open)
    }

    set(value: boolean): void {
        this.open = value
    }
}

const legendStoreImpl = new LegendStore()

/** Legend store: Readable<boolean> + update/set. */
export const legendOpen: LegendStoreApi = legendStoreImpl

// ── Actions ──────────────────────────────────────────────────────────────────

/** Toggle the legend panel open/closed. */
export function toggleLegend(): void {
    legendStoreImpl.open = !legendStoreImpl.open
}

/** Set the legend panel to a specific open/closed state. */
export function setLegendOpen(open: boolean): void {
    legendStoreImpl.open = open
}
