/**
 * @lib/engine/three-engine-timers.ts — Timer/RAF helper functions
 *
 * Phase 2 of the decomposition plan (docs/three-engine-decomposition-plan.ts).
 * Extracted from three-engine-core.ts to isolate render-loop timer bookkeeping.
 *
 * These helpers read/write `engineState` directly (rafId, idleFrameTimerId,
 * webglRestoreTimer) and are the only module that touches RAF/timer lifecycle.
 */

import { engineState } from './three-engine-state'
import { DisposableRegistry } from '@lib/utils/disposable-registry'

// ── Module-level constants ──────────────────────────────────────────────────

const IDLE_STATIC_FRAME_INTERVAL_MS = 125

// ── Animate callback injection ───────────────────────────────────────────────
//
// scheduleNextAnimationFrame() needs to schedule the `animate` callback, but
// `animate` is defined in three-engine-core.ts. To avoid a circular import,
// core sets this reference once at module-init time. The function pointer is
// stable (function declaration), so a single assignment is sufficient.
//
// Use a property on the hoisted function to store the callback, avoiding a
// module-level `let`/`const` temporal dead zone. The engine's circular import
// graph can re-enter this module during initialization, so any top-level
// variable declared in this module would be uninitialized when
// three-engine-core.ts calls setAnimateFn(animate).
export function setAnimateFn(fn: () => void): void {
    ;(setAnimateFn as unknown as { __fn?: () => void }).__fn = fn
}

function animate(): void {
    const fn = (setAnimateFn as unknown as { __fn?: () => void }).__fn
    if (fn) fn()
}

// ── Yield helper for breaking up long tasks (W5-T1b / W8) ──────────────────────
//
// Uses setTimeout(0) instead of requestIdleCallback: during engine init the
// main thread is busy with GPU work, so requestIdleCallback's 50ms timeout
// adds latency without actually yielding earlier. setTimeout(0) is the
// fastest path to the event loop.

export function yieldToBrowser(_timeoutMs = 50): Promise<void> {
    if (typeof window === 'undefined') return Promise.resolve()
    return new Promise<void>((resolve) => {
        const reg = new DisposableRegistry({ label: 'three-engine-timers-yield' })
        reg.schedule(0, resolve)
    })
}

export function scheduleNextAnimationFrame(continuous: boolean): void {
    if (engineState.rafId !== null || engineState.idleFrameTimerId !== null) return
    if (continuous) {
        engineState.rafId = window.requestAnimationFrame(animate)
        return
    }
    engineState.idleFrameTimerId = window.setTimeout(() => {
        engineState.idleFrameTimerId = null
        if (engineState.rafId === null) engineState.rafId = window.requestAnimationFrame(animate)
    }, IDLE_STATIC_FRAME_INTERVAL_MS)
}

export function pauseRenderLoopTimers(options: { clearRestoreTimer?: boolean } = {}): void {
    if (engineState.rafId !== null) {
        window.cancelAnimationFrame(engineState.rafId)
        engineState.rafId = null
    }
    if (options.clearRestoreTimer && engineState.webglRestoreTimer) {
        window.clearTimeout(engineState.webglRestoreTimer)
        engineState.webglRestoreTimer = null
    }
    if (engineState.idleFrameTimerId !== null) {
        window.clearTimeout(engineState.idleFrameTimerId)
        engineState.idleFrameTimerId = null
    }
}
