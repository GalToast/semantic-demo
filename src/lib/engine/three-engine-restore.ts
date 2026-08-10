/**
 * @lib/engine/three-engine-restore.ts — WebGL restore retry escalation
 *
 * Isolated from three-engine-core.ts. Owns the bounded context-restore re-init
 * state machine. Uses callback injection to avoid circular imports with the
 * init and render-loop modules (mirrors the setAnimateFn pattern in
 * three-engine-timers.ts).
 */

import { engineState } from './three-engine-state'
import { debugWarn, debugInfo, debugError } from '@lib/utils/debug'
import { setEngineStatus } from '@lib/stores/engine.svelte.ts'
import { setGraphicsMode } from '@lib/data-store'
import { removeWebGLFallbackNotice } from './renderer/webgl-fallback'

// ── Callback injection ──────────────────────────────────────────────────────

let _restoreInitFn: ((isRestoreAttempt: boolean) => Promise<boolean>) | null = null

/** Inject the engine init function so restore-owned re-inits can call it without importing three-engine-core. */
export function setRestoreInitFn(fn: (isRestoreAttempt: boolean) => Promise<boolean>): void {
    _restoreInitFn = fn
}

let _restoreAnimateCb: (() => void) | null = null

/** Inject the animate callback so the restore backoff timer can wake the loop. */
export function setRestoreAnimateCb(cb: () => void): void {
    _restoreAnimateCb = cb
}

let _restoreSuccessCb: (() => void) | null = null

/** Inject the success callback so restore can start the loop after a successful re-init. */
export function setRestoreSuccessCb(cb: () => void): void {
    _restoreSuccessCb = cb
}

// ── Module-level state ──────────────────────────────────────────────────────

/** Retry counter for bounded context-restore re-init attempts. */
let _restoreRetryCount = 0
let _restoreRetryTimer: number | null = null
const _RESTORE_MAX_RETRIES = 2
const _RESTORE_BACKOFF_MS = [1000, 3000]
const _RESTORE_WATCHDOG_MS = 15000

/**
 * Generation token for the restore state machine (renderer-wave audit
 * 2026-08-07). Bumped by a manual re-init and by teardown so stale async
 * settles, backoff timers, and watchdog callbacks from a superseded cycle
 * become no-ops (they can no longer resurrect the loop or corrupt a scene
 * the manual init just built). Escalation deliberately does NOT bump it: a
 * late success from the in-flight attempt must still be able to reconcile
 * the breaker/status it tripped.
 */
let _restoreGeneration = 0
/** Per-cycle escalation guard — the toast + degraded transition fire once. */
let _restoreEscalated = false

// ── Public API for init / teardown ─────────────────────────────────────────

/** Reset the restore machine for a fresh manual init (called from initThreeJSInternal). */
export function resetRestoreMachineForManualInit(): void {
    _restoreGeneration++
    _restoreEscalated = false
    _restoreRetryCount = 0
    _clearRetryTimer()
    if (engineState.webglRestoreTimer) {
        window.clearTimeout(engineState.webglRestoreTimer)
        engineState.webglRestoreTimer = null
    }
}

/** Snapshot the current generation token for the init stale-cycle guard. */
export function snapshotRestoreGeneration(): number {
    return _restoreGeneration
}

/** Return true if the snapshot is stale (a newer manual init / teardown superseded it). */
export function isStaleRestoreGeneration(snapshot: number): boolean {
    return snapshot !== _restoreGeneration
}

// ── Internal helpers ────────────────────────────────────────────────────────

function _armRestoreWatchdog() {
    if (typeof window === 'undefined') return
    const generation = _restoreGeneration
    if (engineState.webglRestoreTimer !== null) {
        window.clearTimeout(engineState.webglRestoreTimer)
    }
    engineState.webglRestoreTimer = window.setTimeout(() => {
        engineState.webglRestoreTimer = null
        // Stale watchdog (manual init / teardown superseded this cycle): no-op.
        if (generation !== _restoreGeneration) return
        debugError('[three-engine] WebGL restore watchdog expired — escalating to fallback')
        _escalateRestoreFailure()
    }, _RESTORE_WATCHDOG_MS)
}

export { _armRestoreWatchdog }

function _clearRetryTimer() {
    if (_restoreRetryTimer !== null) {
        window.clearTimeout(_restoreRetryTimer)
        _restoreRetryTimer = null
    }
}

/**
 * Invalidate the entire restore retry machine — clears timers/watchdog, resets
 * counters, bumps the generation token. Idempotent; safe to call multiple times
 * across teardown paths (deinit → cancelAnimate + destroyEngine).
 */
function _resetRestoreMachine() {
    _clearRetryTimer()
    _restoreRetryCount = 0
    _restoreEscalated = false
    _restoreGeneration++
    if (engineState.webglRestoreTimer) {
        window.clearTimeout(engineState.webglRestoreTimer)
        engineState.webglRestoreTimer = null
    }
}

/**
 * Public teardown hook for lifecycle.ts → destroyEngine().
 * A pending retry timer must not fire 1-3s after the engine is destroyed
 * (P1-1: production teardown never invalidated the retry machine).
 */
export function invalidateRestoreMachine() {
    _resetRestoreMachine()
}

function _escalateRestoreFailure() {
    // Idempotent per cycle: the watchdog and the retry-exhaustion path can
    // both call this; the first one wins and the second becomes a no-op
    // (no duplicate toast / status transition).
    if (_restoreEscalated) return
    _restoreEscalated = true
    _restoreRetryCount = 0
    _clearRetryTimer()
    if (engineState.webglRestoreTimer) {
        window.clearTimeout(engineState.webglRestoreTimer)
        engineState.webglRestoreTimer = null
    }
    engineState.circuitBreakerTripped = true
    debugError('[three-engine] WebGL restore failed after all retries — falling back to degraded state')
    setEngineStatus('degraded')
    setGraphicsMode('fallback')
    // Honest wording: this module does not perform any map/fallback route
    // switch — it only degrades engine state. Reload is the real recovery.
    engineState.uiFeedback?.showExperienceToast(
        'Graphics unavailable',
        'The 3D view could not be restored. Reload the page to retry.'
    )
}

export function _restoreReinitWithRetry() {
    _restoreReinitWithRetryInner()
}

function _restoreReinitWithRetryInner() {
    const attemptGeneration = _restoreGeneration
    // Route through the injected init callback with an explicit restore marker —
    // never infer ownership from a mutable global, so a concurrent public
    // initThreeJS() while this awaits is always classified as a manual init.
    void _restoreInitFn?.(true)
        .then((result) => {
            // Superseded by a manual re-init / teardown while we were building.
            if (attemptGeneration !== _restoreGeneration) return
            // initThreeJS returns false when buildThreeSceneOrFallback fails
            // (no GPU path available); treat as failure for retry purposes.
            if (result === false) {
                throw new Error('initThreeJS returned false (buildThreeSceneOrFallback failed)')
            }
            // Success — cycle complete. If the watchdog escalated while the
            // async restore was still building, the breaker was raised only by
            // that watchdog and the scene is now live, so clear it and restore
            // a truthful engine status (the earlier 'degraded' is stale).
            const wasEscalated = _restoreEscalated
            _restoreEscalated = false
            _restoreRetryCount = 0
            _clearRetryTimer()
            // P2-3: clear stale fallback notice from a prior failed attempt
            // whose N+1 retry succeeded (notice over a live 3D scene).
            removeWebGLFallbackNotice()
            if (wasEscalated) {
                engineState.circuitBreakerTripped = false
                setEngineStatus('ready')
                setGraphicsMode('webgl')
                debugInfo('[three-engine] WebGL restore succeeded after watchdog escalation — reconciled state')
            }
            _restoreSuccessCb?.()
        })
        .catch((err) => {
            debugError('[three-engine] WebGL restore re-init failed:', err)
            // Superseded by a manual re-init / teardown: never resurrect the loop.
            if (attemptGeneration !== _restoreGeneration) return
            // Already escalated (the watchdog gave up): do not re-arm retries
            // or emit a duplicate fallback toast.
            if (_restoreEscalated) return
            _restoreRetryCount++
            if (_restoreRetryCount <= _RESTORE_MAX_RETRIES) {
                const delay = _RESTORE_BACKOFF_MS[_restoreRetryCount - 1] ?? 3000
                debugWarn(`[three-engine] WebGL restore retry ${_restoreRetryCount}/${_RESTORE_MAX_RETRIES} in ${delay}ms`)
                _clearRetryTimer()
                const backoffGeneration = _restoreGeneration
                _restoreRetryTimer = window.setTimeout(() => {
                    _restoreRetryTimer = null
                    // Backoff was pending while a manual init / teardown
                    // superseded us — the re-arm must not fire.
                    if (backoffGeneration !== _restoreGeneration) return
                    // Re-arm the restore flag + watchdog for this retry attempt
                    engineState.webglNeedsRestoreReinit = true
                    _armRestoreWatchdog()
                    _restoreAnimateCb?.()
                }, delay)
            } else {
                _escalateRestoreFailure()
            }
        })
}
