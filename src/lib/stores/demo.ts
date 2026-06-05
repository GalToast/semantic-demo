/**
 * @lib/stores/demo.ts — Micro-demo state machine store
 *
 * State machine: IDLE→GLIDING→ARRIVED→CARD_VISIBLE→PULLBACK→WIDE_VIEW→RETURNING→COMPLETE/CANCELLED
 *
 * Fixes the timer-ID drop bug from the original JS implementation:
 * - Uses a Map<string, number> keyed by purpose for timer tracking
 * - Provides cancelAll() that clears every tracked timer
 * - TypeScript prevents accidental whole-object replacement
 */
import { writable, derived, get } from 'svelte/store';
import type { DemoState, DemoPhase } from '@lib/types/state';

// ── Valid transitions ─────────────────────────────────────────────────────────

const DEMO_TRANSITIONS: Record<DemoPhase, DemoPhase[]> = {
  IDLE: ['GLIDING', 'CANCELLED'],
  GLIDING: ['ARRIVED', 'CANCELLED'],
  ARRIVED: ['CARD_VISIBLE', 'CANCELLED'],
  CARD_VISIBLE: ['PULLBACK', 'CANCELLED'],
  PULLBACK: ['WIDE_VIEW', 'CANCELLED'],
  WIDE_VIEW: ['RETURNING', 'CANCELLED'],
  RETURNING: ['COMPLETE', 'CANCELLED'],
  COMPLETE: ['IDLE'],
  CANCELLED: ['IDLE']
};

// ── Timer tracking (bug fix) ──────────────────────────────────────────────────

const timers = new Map<string, number>();

/**
 * Set a named timer. If a timer with the same purpose already exists,
 * the old one is cleared first. This prevents timer-ID drops.
 */
export function setDemoTimer(purpose: string, ms: number, callback: () => void): void {
  clearDemoTimer(purpose);
  const id = window.setTimeout(() => {
    timers.delete(purpose);
    callback();
  }, ms);
  timers.set(purpose, id);
}

/**
 * Clear a specific named timer.
 */
export function clearDemoTimer(purpose: string): void {
  const id = timers.get(purpose);
  if (id !== undefined) {
    window.clearTimeout(id);
    timers.delete(purpose);
  }
}

/**
 * Clear ALL tracked demo timers. Safe to call from any phase transition.
 */
export function cancelAllDemoTimers(): void {
  for (const [purpose, id] of timers) {
    window.clearTimeout(id);
  }
  timers.clear();
}

// ── Store ─────────────────────────────────────────────────────────────────────

const INITIAL_DEMO: DemoState = {
  phase: 'IDLE',
  startedAt: 0,
  selectedNodeIndex: null,
  timers: new Map()
};

export const demoState = writable<DemoState>({
  ...INITIAL_DEMO,
  timers // shared reference for the class
});

// ── Derived ───────────────────────────────────────────────────────────────────

export const demoPhase = derived(demoState, ($d) => $d.phase);
export const isDemoActive = derived(demoState, ($d) =>
  $d.phase !== 'IDLE' && $d.phase !== 'COMPLETE' && $d.phase !== 'CANCELLED'
);
export const demoNodeIndex = derived(demoState, ($d) => $d.selectedNodeIndex);

// ── Actions ───────────────────────────────────────────────────────────────────

/**
 * Transition the demo state machine. Returns true if valid.
 */
export function transitionDemo(
  to: DemoPhase,
  overrides?: { selectedNodeIndex?: number }
): boolean {
  const current = get(demoState);
  const from = current.phase;

  if (!DEMO_TRANSITIONS[from]?.includes(to)) {
    console.warn(`[Demo] Invalid transition: ${from} → ${to}`);
    return false;
  }

  // On any terminal transition, cancel all tracked timers
  if (to === 'CANCELLED' || to === 'COMPLETE' || to === 'IDLE') {
    cancelAllDemoTimers();
  }

  // Sync body data attribute for CSS
  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.demoPhase = to;
  }

  demoState.update((s) => ({
    ...s,
    phase: to,
    startedAt: to === 'IDLE' ? 0 : s.startedAt || performance.now(),
    selectedNodeIndex: overrides?.selectedNodeIndex ?? s.selectedNodeIndex
  }));

  return true;
}

/**
 * Start the demo from IDLE.
 */
export function startDemo(nodeIndex: number): boolean {
  const current = get(demoState);
  if (current.phase !== 'IDLE') return false;

  demoState.set({
    phase: 'IDLE',
    startedAt: performance.now(),
    selectedNodeIndex: nodeIndex,
    timers: new Map()
  });

  return transitionDemo('GLIDING');
}

/**
 * Cancel the demo from any active phase.
 */
export function cancelDemo(): boolean {
  return transitionDemo('CANCELLED');
}

/**
 * Reset the demo store to initial state.
 */
export function resetDemo(): void {
  cancelAllDemoTimers();
  demoState.set({ ...INITIAL_DEMO, timers: new Map() });
  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.demoPhase = 'IDLE';
  }
}
