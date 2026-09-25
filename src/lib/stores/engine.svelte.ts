/**
 * @lib/stores/engine.svelte.ts — Engine lifecycle status store
 *
 * Single source of truth for the engine's lifecycle status.
 * Replaces the mutable ctx.status field on the legacy BridgeContext.
 */

import { writable, type Readable } from 'svelte/store'

// ── Types ────────────────────────────────────────────────────────────────────

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'degraded' | 'destroyed'

// ── State ────────────────────────────────────────────────────────────────────

const _engineStatus = writable<EngineStatus>('idle')

// ── Public API ───────────────────────────────────────────────────────────────

/** Reactive readable store for engine status. */
export const engineStatusStore: Readable<EngineStatus> = _engineStatus

/**
 * Update the engine status.
 */
export function setEngineStatus(next: EngineStatus): void {
    _engineStatus.set(next)
}

/**
 * Get the current engine status (non-reactive read).
 */
export function getEngineStatus(): EngineStatus {
    let current: EngineStatus = 'idle'
    _engineStatus.subscribe((v) => {
        current = v
    })()
    return current
}
