/**
 * @lib/stores/demo.svelte.ts — Micro-demo state machine store (Svelte 5 runes)
 *
 * State machine: IDLE→GLIDING→ARRIVED→CARD_VISIBLE→PULLBACK→WIDE_VIEW→RETURNING→COMPLETE/CANCELLED
 *
 * Fixes the timer-ID drop bug from the original JS implementation:
 * - Uses a Map<string, number> keyed by purpose for timer tracking
 * - Provides cancelAll() that clears every tracked timer
 * - TypeScript prevents accidental whole-object replacement
 */
import { writable, derived, get, type Writable, type Readable } from 'svelte/store';
import type { DemoState, DemoPhase } from '@lib/types/state';
import { seededUnit } from '@lib/utils/seeded-random';
import { debugWarn } from '@lib/utils/diagnostic-adapter';

// ── Constants ────────────────────────────────────────────────────────────────

/** Minimum delay before first demo attempt (ms). */
export const DEMO_START_DELAY_MS = 25_000;
/** Maximum retry attempts for demo start. */
export const MAX_START_RETRIES = 100;

/** Hardcoded showcase pool of node indices. */
const SHOWCASE_POOL: readonly number[] = [50, 707, 1525, 2908, 3899, 4102, 6684, 7938];

// ── Phase timing targets (from AGENTS.md) ────────────────────────────────────

export const DEMO_TIMING = {
  GLIDING_MS: 1400,
  ARRIVED_HOLD_MS: 120,
  CARD_VISIBLE_MS: 1800,
  PULLBACK_MS: 1200,
  WIDE_VIEW_HOLD_MS: 350,
  RETURNING_MS: 1000,
  COMPLETE_MS: 0
} as const;

/** Total demo duration in ms (sum of active phases + holds). */
export const DEMO_TOTAL_DURATION_MS =
  DEMO_TIMING.GLIDING_MS +
  DEMO_TIMING.ARRIVED_HOLD_MS +
  DEMO_TIMING.CARD_VISIBLE_MS +
  DEMO_TIMING.PULLBACK_MS +
  DEMO_TIMING.WIDE_VIEW_HOLD_MS +
  DEMO_TIMING.RETURNING_MS;

// ── Valid Transitions ────────────────────────────────────────────────────────

const DEMO_TRANSITIONS: Record<DemoPhase, readonly DemoPhase[]> = {
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

// ── Timer Tracking (bug fix) ─────────────────────────────────────────────────

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

/** Clear a specific named timer. */
export function clearDemoTimer(purpose: string): void {
  const id = timers.get(purpose);
  if (id !== undefined) {
    window.clearTimeout(id);
    timers.delete(purpose);
  }
}

/** Clear ALL tracked demo timers. Safe to call from any phase transition. */
export function cancelAllDemoTimers(): void {
  for (const [, id] of timers) {
    window.clearTimeout(id);
  }
  timers.clear();
}

/** Get the number of active demo timers (diagnostic). */
export function getActiveDemoTimerCount(): number {
  return timers.size;
}

// ── Showcase Pool Helpers ────────────────────────────────────────────────────

/** Get a shuffled copy of the showcase pool. */
function getShuffledPool(): number[] {
  const shuffled = [...SHOWCASE_POOL];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(seededUnit(i, 0xD3A0) * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
}

/**
 * Find the best demo node from the showcase pool.
 * Validates: point exists, not disqualified, name has >= 3 chars.
 * Returns null if no valid node found.
 */
export function findDemoNode(
  points: readonly { status?: string; name?: string }[] | null
): number | null {
  if (!points || !points.length) return null;

  const shuffled = getShuffledPool();
  for (const idx of shuffled) {
    const point = points[idx];
    if (!point) continue;
    if (point.status === 'disqualified') continue;
    const name = (point.name || '').trim();
    if (!name || name.length < 3) continue;
    return idx;
  }

  // Fallback: scan all points
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    if (!point) continue;
    if (point.status === 'disqualified') continue;
    const name = (point.name || '').trim();
    if (!name || name.length < 3) continue;
    return i;
  }

  return null;
}

// ── Session/Lifetime Guards ──────────────────────────────────────────────────

/** localStorage key: lifetime per-browser flag. */
export const DEMO_LIFETIME_KEY = 'moco_mycelium_demo_v1';
/** sessionStorage key: per-session guard. */
export const DEMO_SESSION_KEY = 'moco_mycelium_demo_session_v1';

/** Whether the demo has been seen (lifetime). */
export function hasDemoBeenSeen(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(DEMO_LIFETIME_KEY) !== null;
}

/** Whether the demo was suppressed this session. */
export function isDemoSuppressedThisSession(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  return sessionStorage.getItem(DEMO_SESSION_KEY) !== null;
}

/** Mark the demo as completed (lifetime). */
export function markDemoCompleted(): void {
  try {
    localStorage.setItem(DEMO_LIFETIME_KEY, new Date().toISOString());
  } catch { /* storage full — ignore */ }
}

/** Mark the demo as skipped for this session. */
export function markDemoSessionSkipped(reason: string = 'unknown'): void {
  try {
    sessionStorage.setItem(DEMO_SESSION_KEY, reason);
  } catch { /* storage full — ignore */ }
}

// ── Store ────────────────────────────────────────────────────────────────────

const INITIAL_DEMO: DemoState = {
  phase: 'IDLE',
  startedAt: 0,
  selectedNodeIndex: null,
  timers: new Map()
};

export const demoState: Writable<DemoState> = writable({
  ...INITIAL_DEMO,
  timers // shared reference
});

// ── Derived ──────────────────────────────────────────────────────────────────

export const demoPhase: Readable<DemoPhase> = derived(demoState, s => s.phase);
export const isDemoActive: Readable<boolean> = derived(
  demoState,
  s => s.phase !== 'IDLE' && s.phase !== 'COMPLETE' && s.phase !== 'CANCELLED'
);
export const demoNodeIndex: Readable<number | null> = derived(demoState, s => s.selectedNodeIndex);
export const isDemoRunning = isDemoActive;

// ── Actions ──────────────────────────────────────────────────────────────────

/**
 * Transition the demo state machine. Returns true if valid.
 */
export function transitionDemo(
  to: DemoPhase,
  overrides?: { selectedNodeIndex?: number }
): boolean {
  const from = get(demoState).phase;

  if (!DEMO_TRANSITIONS[from]?.includes(to)) {
    debugWarn(`[Demo] Invalid transition: ${from} → ${to}`);
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

  demoState.update(s => ({
    ...s,
    phase: to,
    startedAt: to === 'IDLE' ? 0 : (s.startedAt || performance.now()),
    selectedNodeIndex: overrides?.selectedNodeIndex !== undefined ? overrides.selectedNodeIndex : s.selectedNodeIndex
  }));

  return true;
}

/**
 * Start the demo from IDLE.
 * Returns true if started successfully.
 */
export function startDemo(nodeIndex: number): boolean {
  if (get(demoState).phase !== 'IDLE') return false;

  demoState.set({ ...INITIAL_DEMO, startedAt: performance.now(), selectedNodeIndex: nodeIndex, timers: new Map() });

  return transitionDemo('GLIDING');
}

/** Cancel the demo from any active phase.
 *
 * Mirrors the legacy `cancelChoreography` guard in
 * `js/modules/micro-demo-choreography.ts` — silently no-ops when the demo
 * is already in a terminal state (IDLE / COMPLETE / CANCELLED) so callers
 * (e.g. the dismiss button) don't fire the `Invalid transition` warning
 * when the user clicks after auto-completion.
 */
export function cancelDemo(): boolean {
  const current = get(demoState).phase;
  if (current === 'IDLE' || current === 'COMPLETE' || current === 'CANCELLED') {
    return false;
  }
  return transitionDemo('CANCELLED');
}

/** Reset the demo store to initial state. */
export function resetDemo(): void {
  cancelAllDemoTimers();
  demoState.set({ ...INITIAL_DEMO, timers: new Map() });
  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.demoPhase = 'IDLE';
    document.body.removeAttribute('data-demo-active');
  }
}

/**
 * Check if the demo should run (eligibility).
 * Checks URL params, session guard, and conditions.
 */
export function shouldRunDemo(): boolean {
  if (typeof window === 'undefined') return false;

  const params = new URLSearchParams(window.location.search);
  const forceDemo = params.get('demo') === 'force';
  const suppressDemo = params.get('nodemo') === '1';

  if (suppressDemo) return false;
  if (!forceDemo && isDemoSuppressedThisSession()) return false;
  if (!forceDemo && hasDemoBeenSeen()) return false;

  return true;
}
