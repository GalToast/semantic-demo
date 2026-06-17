/**
 * @lib/stores/engine.svelte.ts — Engine lifecycle status store (Svelte 5 runes)
 *
 * Single source of truth for the engine's lifecycle status.
 * Replaces the mutable `ctx.status` field on the legacy BridgeContext.
 *
 * Status transitions:
 *   idle → loading → ready
 *                      → degraded (if WebGL unavailable)
 *   ready → destroyed → idle
 *   degraded → destroyed → idle
 */

import { state } from 'svelte/reactivity'

// ── Types ────────────────────────────────────────────────────────────────────

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'degraded' | 'destroyed'

// ── State ────────────────────────────────────────────────────────────────────

let _status = state<EngineStatus>('idle')

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Update the engine status.
 *
 * @param next - The new status value.
 */
export function setEngineStatus(next: EngineStatus): void {
    _status.current = next
}

/**
 * Get the current engine status (non-reactive read).
 *
 * @returns The current status.
 */
export function getEngineStatus(): EngineStatus {
    return _status.current
}
