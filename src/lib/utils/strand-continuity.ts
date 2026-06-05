/**
 * @lib/utils/strand-continuity.ts — Bug-fixed strand continuity state management
 *
 * Port of js/modules/strand-continuity.js with fixes:
 * - Timer IDs tracked in a Map keyed by purpose (prevents timer-ID drop bug)
 * - Never replaces the whole state object — only mutates individual fields
 * - Provides cancelAll() that clears every tracked timer
 * - TypeScript prevents accidental whole-object replacement
 */
import type { StrandContinuityPhase } from '@lib/types/state';

/** Valid phase transitions for strand continuity */
const VALID_PHASES = new Set<StrandContinuityPhase>([
  'idle',
  'preview',
  'pinned',
  'exploring',
  'arrived',
  'returning'
]);

/** Timer purposes used during strand continuity */
const TIMER_PURPOSES = {
  ARRIVAL: 'arrival',
  SETTLE: 'settle',
  TIMEOUT: 'timeout',
  RETURN: 'return'
} as const;

export interface StrandContinuityConfig {
  /** Called when phase transitions */
  onPhaseChange?: (
    phase: StrandContinuityPhase,
    state: StrandContinuityManager['state']
  ) => void;

  /** Called when body data attributes should sync */
  onBodySync?: (state: StrandContinuityManager['state']) => void;

  /** Called when arrival handoff overlay should sync */
  onArrivalSync?: () => void;

  /** Called when arrival handoff overlay should dispose */
  onArrivalDispose?: () => void;
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
  };

  private timers = new Map<string, number>();
  private config: StrandContinuityConfig;

  constructor(config: StrandContinuityConfig = {}) {
    this.config = config;
  }

  /**
   * Set the strand continuity phase with options.
   * Safe: never drops timer IDs.
   */
  setPhase(
    phase: StrandContinuityPhase,
    options: {
      targetIndex?: number | null;
      fromIndex?: number | null;
      reason?: string;
    } = {}
  ): typeof this.state {
    const normalizedPhase = VALID_PHASES.has(phase) ? phase : 'idle';

    // Update state fields individually — never replace the whole object
    this.state.phase = normalizedPhase;
    this.state.targetIndex = Number.isFinite(options.targetIndex ?? NaN)
      ? (options.targetIndex as number)
      : null;
    this.state.fromIndex = Number.isFinite(options.fromIndex ?? NaN)
      ? (options.fromIndex as number)
      : null;
    this.state.reason = options.reason ?? '';
    this.state.startedAt = performance.now();

    // Sync body data attributes for CSS
    this.config.onBodySync?.(this.state);

    // Handle arrival handoff overlay
    if (normalizedPhase === 'exploring' || normalizedPhase === 'arrived') {
      this.config.onArrivalSync?.();
    } else if (normalizedPhase === 'idle') {
      this.config.onArrivalDispose?.();
    }

    // Notify listeners
    this.config.onPhaseChange?.(normalizedPhase, this.state);

    return { ...this.state };
  }

  /**
   * Clear to idle phase.
   */
  clear(reason = 'clear'): typeof this.state {
    return this.setPhase('idle', { reason });
  }

  /**
   * Set a named timer. If a timer with the same purpose already exists,
   * the old one is cleared first. This is the core bug fix.
   */
  setTimer(purpose: string, ms: number, callback: () => void): void {
    this.clearTimer(purpose);
    const id = window.setTimeout(() => {
      this.timers.delete(purpose);
      callback();
    }, ms);
    this.timers.set(purpose, id);
  }

  /**
   * Clear a specific named timer.
   */
  clearTimer(purpose: string): void {
    const id = this.timers.get(purpose);
    if (id !== undefined) {
      window.clearTimeout(id);
      this.timers.delete(purpose);
    }
  }

  /**
   * Clear ALL tracked timers. Safe to call from any phase transition.
   */
  cancelAll(): void {
    for (const [, id] of this.timers) {
      window.clearTimeout(id);
    }
    this.timers.clear();
  }

  /**
   * Get the current state as a readonly snapshot.
   */
  snapshot(): Readonly<typeof this.state> {
    return { ...this.state };
  }

  /**
   * Check if the strand is in an active (non-idle) phase.
   */
  get isActive(): boolean {
    return this.state.phase !== 'idle';
  }

  /**
   * Get the count of active timers (useful for debugging).
   */
  get activeTimerCount(): number {
    return this.timers.size;
  }
}

// ── Singleton for global use ──────────────────────────────────────────────────

let _globalManager: StrandContinuityManager | null = null;

/**
 * Get or create the global strand continuity manager.
 */
export function getStrandContinuityManager(
  config?: StrandContinuityConfig
): StrandContinuityManager {
  if (!_globalManager) {
    _globalManager = new StrandContinuityManager(config);
  }
  return _globalManager;
}

/**
 * Reset the global manager (useful for testing or full state resets).
 */
export function resetStrandContinuityManager(): void {
  if (_globalManager) {
    _globalManager.cancelAll();
    _globalManager = null;
  }
}
