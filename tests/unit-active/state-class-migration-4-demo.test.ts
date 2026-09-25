/**
 * state-class-migration-4-demo.test.ts
 *
 * Regression test for src/lib/stores/demo.svelte.ts (writable + withDemoNotify).
 * Validates:
 *   1. The writable .set() / .update() / subscribe() path works in vitest/jsdom
 *   2. Store actions (setDemoPhase, startDemo, cancelDemo, …) bridge to appState.demoPhase
 *   3. Subscribers receive notifications through the writable's .set()
 *   4. Getters (demoPhase, isDemoActive, isDemoRunning) reflect appState
 *   5. resetDemo() restores initial state and the start-guard, clearing appState
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── Local type replica ───────────────────────────────────────────────────────
type DemoPhase =
  | 'IDLE'
  | 'GLIDING'
  | 'ARRIVED'
  | 'CARD_VISIBLE'
  | 'PULLBACK'
  | 'WIDE_VIEW'
  | 'RETURNING'
  | 'COMPLETE'
  | 'CANCELLED';

interface DemoStoreState {
  phase: DemoPhase;
  startTime: number;
  lastPhaseChangeAt: number;
}

// ── Hoisted mock state ───────────────────────────────────────────────────────

const _demoState = vi.hoisted(() => ({
  demoPhase: 'IDLE' as DemoPhase,
}));

vi.mock('@lib/state/app.svelte.ts', () => ({
  appState: {
    get demoPhase() {
      return _demoState.demoPhase;
    },
    set demoPhase(v: DemoPhase) {
      _demoState.demoPhase = v;
    },
    withMutation: (fn: () => unknown) => fn(),
  },
}));

// ── Imports (must come after vi.mock) ─────────────────────────────────────────

import {
  demoStore,
  demoState,
  demoPhase,
  isDemoActive,
  isDemoRunning,
  demoNodeIndex,
  setDemoPhase,
  startDemo,
  cancelDemo,
  transitionDemo,
  markDemoCompleted,
  markDemoSessionSkipped,
  resetDemo,
  hasDemoBeenSeen,
  isDemoSuppressedThisSession,
  shouldRunDemo,
  findDemoNode,
  DEMO_TIMING,
  DEMO_LIFETIME_KEY,
  DEMO_SESSION_KEY,
} from '../../src/lib/stores/demo.svelte.ts';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeState(overrides: Partial<DemoStoreState> = {}): DemoStoreState {
  return {
    phase: 'IDLE',
    startTime: 0,
    lastPhaseChangeAt: 0,
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Demo store — state-class appState regression', () => {
  beforeEach(() => {
    resetDemo();
    _demoState.demoPhase = 'IDLE';

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(DEMO_LIFETIME_KEY);
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(DEMO_SESSION_KEY);
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 1. Store API shape & identity ─────────────────────────────────────

  it('demoState is the same object reference as demoStore', () => {
    expect(demoState).toBe(demoStore);
  });

  it('demoStore() returns a valid DemoStoreState', () => {
    const s = demoStore();
    expect(s).toHaveProperty('phase');
    expect(s).toHaveProperty('startTime');
    expect(s).toHaveProperty('lastPhaseChangeAt');
    expect(s.phase).toBe('IDLE');
  });

  // ── 2. Writable / local path ────────────────────────────────────────────

  it('demoStore.set() mutates the local writable', () => {
    demoStore.set(makeState({ phase: 'GLIDING' }));
    expect(demoStore().phase).toBe('GLIDING');
  });

  it('demoStore.update() transforms the local writable', () => {
    demoStore.update((s: DemoStoreState) => ({ ...s, phase: 'WIDE_VIEW' }));
    expect(demoStore().phase).toBe('WIDE_VIEW');
  });

  // ── 3. Bridge to appState via store actions ─────────────────────────────

  it('setDemoPhase pushes the new phase to appState', () => {
    setDemoPhase('PULLBACK');
    expect(_demoState.demoPhase).toBe('PULLBACK');
  });

  it('startDemo pushes GLIDING to appState', () => {
    startDemo();
    expect(_demoState.demoPhase).toBe('GLIDING');
  });

  it('cancelDemo pushes CANCELLED to appState', () => {
    cancelDemo();
    expect(_demoState.demoPhase).toBe('CANCELLED');
  });

  it('markDemoCompleted pushes COMPLETE to appState', () => {
    markDemoCompleted();
    expect(_demoState.demoPhase).toBe('COMPLETE');
  });

  it('markDemoSessionSkipped pushes IDLE to appState', () => {
    markDemoSessionSkipped();
    expect(_demoState.demoPhase).toBe('IDLE');
  });

  it('demoPhase() reads directly from appState', () => {
    _demoState.demoPhase = 'ARRIVED';
    expect(demoPhase()).toBe('ARRIVED');
  });

  it('writable phase stays in sync with setDemoPhase', () => {
    setDemoPhase('RETURNING');
    expect(demoStore().phase).toBe('RETURNING');
  });

  // ── 4. Subscriber notifications ───────────────────────────────────────

  it('subscribe fires when demoStore.set() is called', () => {
    const cb = vi.fn();
    const unsub = demoStore.subscribe(cb);
    demoStore.set(makeState({ phase: 'CARD_VISIBLE' }));
    unsub();

    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: 'CARD_VISIBLE' })
    );
  });

  it('subscribe fires when demoStore.update() is called', () => {
    const cb = vi.fn();
    const unsub = demoStore.subscribe(cb);
    demoStore.update((s: DemoStoreState) => ({ ...s, phase: 'RETURNING' }));
    unsub();

    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: 'RETURNING' })
    );
  });

  it('withDemoNotify wrapper fires subscriber via setDemoPhase', () => {
    const cb = vi.fn();
    const unsub = demoStore.subscribe(cb);
    setDemoPhase('WIDE_VIEW');
    unsub();

    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'WIDE_VIEW' })
    );
  });

  // ── 5. isDemoActive / isDemoRunning getters ─────────────────────────────

  it('isDemoActive() is false when appState phase is IDLE', () => {
    _demoState.demoPhase = 'IDLE';
    expect(isDemoActive()).toBe(false);
  });

  it('isDemoActive() is false when appState phase is COMPLETE', () => {
    _demoState.demoPhase = 'COMPLETE';
    expect(isDemoActive()).toBe(false);
  });

  it('isDemoActive() is false when appState phase is CANCELLED', () => {
    _demoState.demoPhase = 'CANCELLED';
    expect(isDemoActive()).toBe(false);
  });

  it('isDemoActive() is true during non-terminal phases', () => {
    const activePhases: DemoPhase[] = ['GLIDING', 'ARRIVED', 'CARD_VISIBLE', 'PULLBACK', 'WIDE_VIEW', 'RETURNING'];
    for (const phase of activePhases) {
      _demoState.demoPhase = phase;
      expect(isDemoActive()).toBe(true);
    }
  });

  it('isDemoRunning() mirrors isDemoActive()', () => {
    _demoState.demoPhase = 'PULLBACK';
    expect(isDemoRunning()).toBe(true);
  });

  it('isDemoActive reflects live changes from setDemoPhase', () => {
    resetDemo();
    expect(isDemoActive()).toBe(false);
    setDemoPhase('GLIDING');
    expect(isDemoActive()).toBe(true);
  });

  // ── 6. Reset ────────────────────────────────────────────────────────────

  it('resetDemo returns writable to IDLE with zeroed fields', () => {
    setDemoPhase('WIDE_VIEW');
    resetDemo();
    expect(demoStore().phase).toBe('IDLE');
    expect(demoStore().startTime).toBe(0);
    expect(demoStore().lastPhaseChangeAt).toBe(0);
  });

  it('resetDemo resets appState.demoPhase to IDLE', () => {
    setDemoPhase('RETURNING');
    resetDemo();
    expect(_demoState.demoPhase).toBe('IDLE');
  });

  it('resetDemo resets the start guard so startDemo can be called again', () => {
    expect(startDemo()).toBe(true);
    expect(_demoState.demoPhase).toBe('GLIDING');

    expect(startDemo()).toBe(false);

    resetDemo();
    expect(startDemo()).toBe(true);
    expect(_demoState.demoPhase).toBe('GLIDING');
  });

  // ── 7. Storage helpers ──────────────────────────────────────────────────

  it('hasDemoBeenSeen returns false when localStorage key is absent', () => {
    if (typeof localStorage === 'undefined') {
      expect(hasDemoBeenSeen()).toBe(false);
      return;
    }
    localStorage.removeItem(DEMO_LIFETIME_KEY);
    expect(hasDemoBeenSeen()).toBe(false);
  });

  it('hasDemoBeenSeen returns true when localStorage key is set', () => {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(DEMO_LIFETIME_KEY, '1');
    expect(hasDemoBeenSeen()).toBe(true);
  });

  it('isDemoSuppressedThisSession is driven by sessionStorage', () => {
    if (typeof sessionStorage === 'undefined') {
      expect(isDemoSuppressedThisSession()).toBe(false);
      return;
    }
    sessionStorage.setItem(DEMO_SESSION_KEY, '1');
    expect(isDemoSuppressedThisSession()).toBe(true);
  });

  it('startDemo sets the sessionStorage suppression key', () => {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.removeItem(DEMO_SESSION_KEY);
    startDemo();
    expect(sessionStorage.getItem(DEMO_SESSION_KEY)).toBe('1');
  });

  // ── 8. Constants & misc helpers ─────────────────────────────────────────

  it('DEMO_TIMING exposes numeric durations', () => {
    expect(DEMO_TIMING.GLIDE_DURATION_MS).toBeGreaterThan(0);
    expect(DEMO_TIMING.CARD_VISIBLE_MS).toBeGreaterThan(0);
  });

  it('findDemoNode returns null', () => {
    expect(findDemoNode()).toBeNull();
  });

  it('shouldRunDemo returns true', () => {
    expect(shouldRunDemo()).toBe(true);
  });

  it('demoNodeIndex returns null', () => {
    expect(demoNodeIndex()).toBeNull();
  });

  it('transitionDemo is an alias for setDemoPhase', () => {
    transitionDemo('PULLBACK');
    expect(_demoState.demoPhase).toBe('PULLBACK');
  });
});
