/**
 * @lib/stores/engine.svelte.ts — Engine lifecycle status store (Svelte 5 Runes)
 *
 * Single source of truth for the engine's lifecycle status.
 * Migrated to Svelte 5 runes with backward compatibility for legacy subscribers.
 */

import type { Readable } from 'svelte/store'

// ── Types ────────────────────────────────────────────────────────────────────

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'degraded' | 'destroyed'

// ── State Class ──────────────────────────────────────────────────────────────

class EngineStatusState {
    status = $state<EngineStatus>('idle')
    private subscribers = new Set<(v: EngineStatus) => void>()

    set(next: EngineStatus): void {
        this.status = next
        this.notify()
    }

    get(): EngineStatus {
        return this.status
    }

    subscribe(run: (v: EngineStatus) => void): () => void {
        this.subscribers.add(run)
        // Svelte 4 Readable contract: subscribe is executed immediately with the current value
        run(this.status)
        return () => {
            this.subscribers.delete(run)
        }
    }

    private notify(): void {
        for (const run of this.subscribers) {
            run(this.status)
        }
    }
}

const _engineStatus = new EngineStatusState()

// ── Public API ───────────────────────────────────────────────────────────────

/** Reactive readable store for engine status. */
export const engineStatusStore: Readable<EngineStatus> = {
    subscribe: (run) => _engineStatus.subscribe(run)
}

/**
 * Update the engine status.
 */
export function setEngineStatus(next: EngineStatus): void {
    _engineStatus.set(next)
}

/**
 * Get the current engine status (reactive/non-reactive safe read).
 */
export function getEngineStatus(): EngineStatus {
    return _engineStatus.get()
}
