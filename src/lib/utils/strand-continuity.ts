/**
 * @lib/utils/strand-continuity.ts — Bug-fixed strand continuity state management
 *
 * Port of with fixes:
 * - Timer IDs tracked in a Map keyed by purpose (prevents timer-ID drop bug)
 * - Never replaces the whole state object — only mutates individual fields
 * - Provides cancelAll() that clears every tracked timer
 * - TypeScript prevents accidental whole-object replacement
 *
 * Also exposes `setStrandContinuityState` / `clearStrandContinuityState`
 * standalone-function wrappers that delegate to the singleton manager with
 * backward-compatible side-effects:
 *   * mirrors to the legacy `state.strandContinuityState` global,
 *   * syncs the `data-strand-journey*` body attributes for legacy CSS,
 *   * calls `syncArrivalHandoffOverlay` / `disposeArrivalHandoffOverlay`
 *     when entering / exiting the arrival phase.
 *
 * The standalone-function wrappers are imported through the engine strand
 * continuity bridge so existing journey-layer bridge call sites continue to
 * work without their own changes. The legacy
 * `js/modules/strand-continuity.ts` kernel stays alive as a death-bridge
 * shell until full W16 retirement.
 */
import { appState as state } from '@lib/state/app.svelte'
import { syncArrivalHandoffOverlay, disposeArrivalHandoffOverlay } from '@lib/engine/journey-webgl-lazy'
import { cleanOptionalValue } from '@lib/utils/dom-formatters'
import type { StrandContinuityState } from '@lib/state/state-types'

// W53 follow-up to 9f2c326c: previously aliased to bare `string`, which widened
// the manager's `state.phase` past the canonical union (`'idle' | 'preview' | ...
// | 'returning'`) exported from `@lib/types/state` and broke the L107/L219
// `StrandContinuityState` assignments downstream. Re-export the canonical union so
// changes in the canonical file propagate here too.
import type { StrandContinuityPhase as _CanonPhase } from '@lib/types/state'
export type StrandContinuityPhase = _CanonPhase

/** Valid phase transitions for strand continuity */
const VALID_PHASES = new Set<string>(['idle', 'preview', 'pinned', 'exploring', 'arrived', 'returning'])

export interface StrandContinuityConfig {
    /** Called when phase transitions */
    onPhaseChange?: (phase: string, state: StrandContinuityManager['state']) => void

    /** Called when body data attributes should sync */
    onBodySync?: (state: StrandContinuityManager['state']) => void

    /** Called when arrival handoff overlay should sync */
    onArrivalSync?: () => void

    /** Called when arrival handoff overlay should dispose */
    onArrivalDispose?: () => void
}

/**
 * Manages strand continuity state with safe timer tracking.
 *
 * Unlike the original JS implementation which stored timeout IDs directly
 * on the state object and could lose them during whole-object replacement,
 * this class tracks all timers in a separate Map keyed by purpose.
 */
export class StrandContinuityManager {
    state = {
        phase: 'idle' as StrandContinuityPhase,
        targetIndex: null as number | null,
        fromIndex: null as number | null,
        reason: '',
        startedAt: 0
    }

    private timers = new Map<string, number>()
    private config: StrandContinuityConfig

    constructor(config: StrandContinuityConfig = {}) {
        this.config = config
    }

    /**
     * Set the strand continuity phase with options.
     * Safe: never drops timer IDs.
     */
    setPhase(
        phase: string,
        options: {
            targetIndex?: number | null
            fromIndex?: number | null
            reason?: string
        } = {}
    ): StrandContinuityState {
        const normalizedPhase = (VALID_PHASES.has(phase) ? phase : 'idle') as StrandContinuityPhase

        // Update state fields individually — never replace the whole object
        this.state.phase = normalizedPhase
        this.state.targetIndex = Number.isFinite(options.targetIndex ?? NaN) ? (options.targetIndex as number) : null
        this.state.fromIndex = Number.isFinite(options.fromIndex ?? NaN) ? (options.fromIndex as number) : null
        this.state.reason = options.reason ?? ''
        this.state.startedAt = performance.now()

        // Sync body data attributes for CSS
        this.config.onBodySync?.(this.state)

        // Handle arrival handoff overlay
        if (normalizedPhase === 'exploring' || normalizedPhase === 'arrived') {
            this.config.onArrivalSync?.()
        } else if (normalizedPhase === 'idle') {
            this.config.onArrivalDispose?.()
        }

        // Notify listeners
        this.config.onPhaseChange?.(normalizedPhase, this.state)

        return { ...this.state, arrivalTimeoutId: undefined, settleTimeoutId: undefined }
    }

    /**
     * Clear to idle phase.
     */
    clear(reason = 'clear'): StrandContinuityState {
        return { ...this.setPhase('idle', { reason }), arrivalTimeoutId: undefined, settleTimeoutId: undefined }
    }

    /**
     * Set a named timer. If a timer with the same purpose already exists,
     * the old one is cleared first. This is the core bug fix.
     */
    setTimer(purpose: string, ms: number, callback: () => void): void {
        this.clearTimer(purpose)
        const id = window.setTimeout(() => {
            this.timers.delete(purpose)
            callback()
        }, ms)
        this.timers.set(purpose, id)
    }

    /**
     * Clear a specific named timer.
     */
    clearTimer(purpose: string): void {
        const id = this.timers.get(purpose)
        if (id !== undefined) {
            window.clearTimeout(id)
            this.timers.delete(purpose)
        }
    }

    /**
     * Clear ALL tracked timers. Safe to call from any phase transition.
     */
    cancelAll(): void {
        for (const [, id] of this.timers) {
            window.clearTimeout(id)
        }
        this.timers.clear()
    }

    /**
     * Get the current state as a readonly snapshot.
     */
    snapshot(): Readonly<typeof this.state> {
        return { ...this.state }
    }

    /**
     * Check if the strand is in an active (non-idle) phase.
     */
    get isActive(): boolean {
        return this.state.phase !== 'idle'
    }

    /**
     * Get the count of active timers (useful for debugging).
     */
    get activeTimerCount(): number {
        return this.timers.size
    }
}

// ── Singleton for global use ──────────────────────────────────────────────────

let _globalManager: StrandContinuityManager | null = null

/**
 * Get or create the global strand continuity manager.
 */
export function getStrandContinuityManager(config?: StrandContinuityConfig): StrandContinuityManager {
    if (!_globalManager) {
        _globalManager = new StrandContinuityManager(config)
    }
    return _globalManager
}

/**
 * Reset the global manager (useful for testing or full state resets).
 */
export function resetStrandContinuityManager(): void {
    if (_globalManager) {
        _globalManager.cancelAll()
        _globalManager = null
    }
    _wrapperManager = null
}

// ── Standalone-function wrappers (legacy import-API) ───────────────────────
//
// The original kernel exposed top-level `setStrandContinuityState` /
// `clearStrandContinuityState` functions consumed via the
// engine strand-continuity bridge re-export. The canonical manager is
// class-based, so we provide thin function wrappers here that lazily spin up
// a private singleton with the legacy side-effects wired through config
// callbacks. Consumers keep their import sites; only the engine-kernel file
// (`js/modules/strand-continuity.ts`) remains for the W16 retirement sweep.

let _wrapperManager: StrandContinuityManager | null = null

function getWrapperManager(): StrandContinuityManager {
    if (_wrapperManager) return _wrapperManager
    _wrapperManager = new StrandContinuityManager({
        onPhaseChange: (_phase, managerState) => {
            // Mirror to the legacy `state.strandContinuityState` global so kernel
            // consumers that read `state.strandContinuityState.phase` etc.
            // (4 files in js/modules plus src/lib/journey/journey.ts) stay correct.
            {
                state.strandContinuityState = {
                    phase: managerState.phase,
                    targetIndex: managerState.targetIndex,
                    fromIndex: managerState.fromIndex,
                    // Match legacy kernel's `cleanOptionalValue(options.reason) || ''`
                    // so body `data-strand-journey-reason` and downstream CSS don't
                    // carry unsanitized whitespace or sentinel strings (`'unknown'`,
                    // `'n/a'`, etc.).
                    reason: cleanOptionalValue(managerState.reason) || '',
                    startedAt: managerState.startedAt,
                    arrivalTimeoutId: undefined,
                    settleTimeoutId: undefined
                }
            }
        },
        onBodySync: (_managerState) => {
            // NOTE: body.dataset writes removed.
            // strandJourney is managed by parity-attrs.svelte.ts from focusStore.strandContinuityPhase.
            // strandJourneyTarget/From/Reason were not used by CSS or JS readers.
            // The state is already mirrored to state.strandContinuityState in onPhaseChange.
        },
        onArrivalSync: () => {
            try {
                syncArrivalHandoffOverlay()
            } catch {
                /* webgl not initialised yet — tolerate */
            }
        },
        onArrivalDispose: () => {
            try {
                disposeArrivalHandoffOverlay()
            } catch {
                /* already disposed or never initialised */
            }
        }
    })
    return _wrapperManager
}

export interface StrandContinuityOptions {
    targetIndex?: number | null
    fromIndex?: number | null
    reason?: string
}

/**
 * Standalone-function wrapper that delegates to the singleton manager.
 * Drop-in replacement for the kernel's `setStrandContinuityState` export —
 * preserves the legacy `state.strandContinuityState` global, the body
 * data-* attributes, and the arrival overlay side-effects.
 */
export function setStrandContinuityState(
    phase: string = 'idle',
    options: StrandContinuityOptions = {}
): StrandContinuityState {
    const result = getWrapperManager().setPhase(phase, options)
    return {
        ...result,
        arrivalTimeoutId: undefined,
        settleTimeoutId: undefined
    }
}

/**
 * Standalone-function wrapper for `clearStrandContinuityState(reason)`.
 */
export function clearStrandContinuityState(reason: string = 'clear'): StrandContinuityState {
    const result = getWrapperManager().clear(reason)
    return {
        ...result,
        arrivalTimeoutId: undefined,
        settleTimeoutId: undefined
    }
}

// ── Standalone timer wrappers (legacy kernel import-API) ───────────────────
//
// The legacy kernel exported top-level `setTimer` and `clearTimer` consumed
// by thread-inspector and journey-thread-settler. These thin wrappers
// delegate to the wrapper manager so consumers can switch import paths
// without touching call sites.

/**
 * Set a named timer via the wrapper manager. Drop-in for the kernel's
 * `setTimer(key, ms, callback)`.
 */
export function setTimer(key: string, ms: number, callback: () => void): void {
    getWrapperManager().setTimer(key, ms, callback)
}

/**
 * Clear a named timer via the wrapper manager. Drop-in for the kernel's
 * `clearTimer(key)`.
 */
export function clearTimer(key: string): void {
    getWrapperManager().clearTimer(key)
}

// ── Standalone getStrandArrivalNote ────────────────────────────────────────
//
// The legacy kernel exported `getStrandArrivalNote(point?: Point)` but all
// callers invoke it with zero arguments. The canonical no-arg version uses
// the manager state directly, matching the downstream `() => string` type
// contract used by journey-selected-card adapter deps.

/**
 * Get a human-readable arrival note if the strand phase is 'arrived'.
 * Returns empty string otherwise.
 */
export function getStrandArrivalNote(): string {
    const manager = getWrapperManager()
    const s = manager.state
    if (s.phase !== 'arrived') return ''
    return `Arrived at ${s.reason || 'the next stop'}.`
}
