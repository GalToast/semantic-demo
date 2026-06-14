/**
 * @lib/stores/demo.svelte.ts — Micro-demo state machine store (Svelte 5 runes)
 */
import { get, type Readable, toStore } from 'svelte/store';
import { appState } from '@lib/state/app.svelte.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DemoPhase =
  | 'IDLE'
  | 'GLIDING'
  | 'ARRIVED'
  | 'CARD_VISIBLE'
  | 'PULLBACK'
  | 'WIDE_VIEW'
  | 'RETURNING'
  | 'COMPLETE'
  | 'CANCELLED';

export interface DemoStoreState {
  phase: DemoPhase;
  startTime: number;
  lastPhaseChangeAt: number;
}

// ── Constants ────────────────────────────────────────────────────────────────

export const DEMO_TIMING = {
  GLIDE_DURATION_MS: 2400,
  CARD_VISIBLE_MS: 3200,
  PULLBACK_DURATION_MS: 1800,
  WIDE_VIEW_MS: 4000,
  RETURN_DURATION_MS: 2200
} as const;

export const DEMO_START_DELAY_MS = 1500;
export const DEMO_TOTAL_DURATION_MS =
  DEMO_TIMING.GLIDE_DURATION_MS +
  DEMO_TIMING.CARD_VISIBLE_MS +
  DEMO_TIMING.PULLBACK_DURATION_MS +
  DEMO_TIMING.WIDE_VIEW_MS +
  DEMO_TIMING.RETURN_DURATION_MS;
export const DEMO_LIFETIME_KEY = 'moco_mycelium_demo_v1';
export const DEMO_SESSION_KEY = 'moco_mycelium_demo_session_v1';
export const MAX_START_RETRIES = 3;
const activeDemoTimers = new Set<ReturnType<typeof setTimeout>>();

// ── Initial State ────────────────────────────────────────────────────────────

const INITIAL_DEMO: DemoStoreState = {
  phase: 'IDLE',
  startTime: 0,
  lastPhaseChangeAt: 0
};

// ── Store ────────────────────────────────────────────────────────────────────

/** Reactive binding to the Svelte 5 state kernel. */
const _demoWritable = toStore(
  () => ({
    ...INITIAL_DEMO,
    phase: appState.demoPhase as DemoPhase
  }),
  (val) => appState.withMutation(() => {
    appState.demoPhase = val.phase;
  })
);

/**
 * Demo store: callable as `demo()` for direct state access,
 * and satisfies `Readable<DemoStoreState>` + `.update()`/`.set()` for store consumers.
 */
export type DemoStoreApi = (() => DemoStoreState) &
  Readable<DemoStoreState> & {
    update(fn: (s: DemoStoreState) => DemoStoreState): void;
    set(value: DemoStoreState): void;
  };

function _createDemoStore(): DemoStoreApi {
  const fn = (() => ({
    ...INITIAL_DEMO,
    phase: appState.demoPhase as DemoPhase
  })) as unknown as DemoStoreApi;

  fn.subscribe = _demoWritable.subscribe as any;
  fn.update = _demoWritable.update as any;
  fn.set = _demoWritable.set as any;

  return fn;
}

/** Single reactive instance of the micro-demo state. */
export const demoStore: DemoStoreApi = _createDemoStore();
/** Backwards-compatible alias. */
export const demoState: DemoStoreApi = demoStore;

// ── Derived Getters ──────────────────────────────────────────────────────────

export const demoPhase = () => appState.demoPhase as DemoPhase;
export const isDemoRunning = () => isDemoActive();
export const demoNodeIndex = () => null;
export const isDemoActive = () => {
  const phase = appState.demoPhase;
  return phase !== 'IDLE' && phase !== 'COMPLETE' && phase !== 'CANCELLED';
};

// ── Helper Actions ───────────────────────────────────────────────────────────

export function setDemoPhase(phase: DemoPhase): void {
  appState.withMutation(() => { appState.demoPhase = phase; });
}

export function startDemo(): void {
  appState.withMutation(() => {
    appState.demoPhase = 'GLIDING';
    // Logic for start time can be added if needed in kernel
  });
}

export function cancelDemo(): void {
  appState.withMutation(() => { appState.demoPhase = 'CANCELLED'; });
}

export function transitionDemo(nextPhase: DemoPhase): void {
  setDemoPhase(nextPhase);
}

export function setDemoTimer(id: any): void {
  if (id !== null && id !== undefined) activeDemoTimers.add(id);
}

export function clearDemoTimer(id: any): void {
  if (id !== null && id !== undefined) {
    clearTimeout(id);
    activeDemoTimers.delete(id);
  }
}

export function cancelAllDemoTimers(): void {
  for (const id of activeDemoTimers) clearTimeout(id);
  activeDemoTimers.clear();
}

export function getActiveDemoTimerCount(): number {
  return activeDemoTimers.size;
}

export function findDemoNode(): number | null {
  return null; // Mock or implementation
}

export function shouldRunDemo(): boolean {
  return true; // Mock or implementation
}

export function hasDemoBeenSeen(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(DEMO_LIFETIME_KEY) === '1';
}

export function isDemoSuppressedThisSession(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  return sessionStorage.getItem(DEMO_SESSION_KEY) === '1';
}

export function markDemoCompleted(): void {
  setDemoPhase('COMPLETE');
}

export function markDemoSessionSkipped(): void {
  setDemoPhase('IDLE');
}

export function resetDemo(): void {
  appState.withMutation(() => { appState.demoPhase = 'IDLE'; });
}
