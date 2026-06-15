import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

/**
 * @vitest-environment jsdom
 */

// ── Mutable mock navState ─────────────────────────────────────────────────────

const _navState = vi.hoisted(() => ({
  mode: 'overview' as string,
  walkHistoryIndices: [] as number[],
  trailCursor: -1,
  trailDepth: 0,
  threadSource: 'geometric-fallback' as string,
  lastTraversalReason: null as any,
  threadCandidates: [] as any[],
  threadReasonByIndex: new Map(),
  focusedIndex: null as number | null,
  trailSeedIndex: null as number | null,
  trailNeighborIndices: [] as number[],
}));

// ── Mock appState (plain JS object — NO Svelte 5 $state runes) ─────────────────

vi.mock('@lib/state/app.svelte.ts', () => ({
  appState: {
    navState: _navState,
    withMutation: (fn: () => unknown) => fn(),
  },
}));

// ── Imports (must appear AFTER vi.mock) ──────────────────────────────────────

import {
  journeyStore,
  setJourneyPhase,
  setTrailDepth,
  addTrailStop,
  removeTrailStop,
  clearTrail,
  advanceTrailCursor,
  resetJourney,
  journeyPhase,
  trailDepth,
  currentJourneyIndex,
  JOURNEY_CONFIG,
  JOURNEY_COMPASS_PHASE_ORDER,
} from '@lib/stores/journey.svelte.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

function resetMockNavState() {
  _navState.mode = 'overview';
  _navState.walkHistoryIndices = [];
  _navState.trailCursor = -1;
  _navState.trailDepth = 0;
  _navState.threadSource = 'geometric-fallback';
  _navState.lastTraversalReason = null;
  _navState.threadCandidates = [];
  _navState.threadReasonByIndex = new Map();
  _navState.focusedIndex = null;
  _navState.trailSeedIndex = null;
  _navState.trailNeighborIndices = [];
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('journey store — T4 writable + withJourneyNotify migration', () => {
  beforeEach(() => {
    resetJourney();
    resetMockNavState();
  });

  it('journeyStore returns a valid JourneyStoreState snapshot', () => {
    const s = journeyStore();
    expect(s).toHaveProperty('phase');
    expect(s).toHaveProperty('trail');
    expect(s).toHaveProperty('walkHistoryIndices');
  });

  it('setJourneyPhase updates writable and appState.navState.mode', () => {
    setJourneyPhase('search');
    expect(get(journeyStore).phase).toBe('search');
    expect(_navState.mode).toBe('search');
    expect(journeyPhase()).toBe('search');
  });

  it('setTrailDepth updates depth + trailDepth and syncs appState', () => {
    setTrailDepth(2);
    expect(get(journeyStore).trailDepth).toBe(2);
    expect(get(journeyStore).depth).toBe(2);
    expect(trailDepth()).toBe(2);
    expect(_navState.trailDepth).toBe(2);
  });

  it('addTrailStop appends and advances cursor', () => {
    addTrailStop(42);
    const s = get(journeyStore);
    expect(s.walkHistoryIndices).toContain(42);
    expect(s.cursor).toBe(0);
    expect(s.trail).toHaveLength(1);
  });

  it('addTrailStop multiple times expands trail', () => {
    addTrailStop(1);
    addTrailStop(2);
    addTrailStop(3);
    const s = get(journeyStore);
    expect(s.walkHistoryIndices).toEqual([1, 2, 3]);
    expect(s.cursor).toBe(2);
  });

  it('removeTrailStop filters and adjusts cursor', () => {
    addTrailStop(1);
    addTrailStop(2);
    addTrailStop(3);
    removeTrailStop(2);
    const s = get(journeyStore);
    expect(s.walkHistoryIndices).toEqual([1, 3]);
    expect(s.cursor).toBe(1);
  });

  it('clearTrail empties everything and resets cursor', () => {
    addTrailStop(1);
    addTrailStop(2);
    clearTrail();
    const s = get(journeyStore);
    expect(s.walkHistoryIndices).toEqual([]);
    expect(s.trail).toEqual([]);
    expect(s.cursor).toBe(-1);
  });

  it('advanceTrailCursor moves within bounds', () => {
    addTrailStop(1);
    addTrailStop(2);
    addTrailStop(3);
    advanceTrailCursor(1);
    expect(get(journeyStore).cursor).toBe(2);
  });

  it('advanceTrailCursor clamps to max index', () => {
    addTrailStop(1);
    addTrailStop(2);
    advanceTrailCursor(100);
    expect(get(journeyStore).cursor).toBe(1);
  });

  it('advanceTrailCursor clamps to -1 on negative overshoot', () => {
    addTrailStop(1);
    advanceTrailCursor(-100);
    expect(get(journeyStore).cursor).toBe(-1);
  });

  it('currentJourneyIndex returns trail index at cursor', () => {
    addTrailStop(10);
    addTrailStop(20);
    expect(currentJourneyIndex()).toBe(20);
  });

  it('currentJourneyIndex returns null when cursor is -1', () => {
    expect(currentJourneyIndex()).toBeNull();
  });

  it('subscriber fires on addTrailStop via withJourneyNotify', () => {
    const cb = vi.fn();
    const unsub = journeyStore.subscribe(cb);
    addTrailStop(99);
    unsub();
    const last = cb.mock.calls[cb.mock.calls.length - 1][0];
    expect(last.walkHistoryIndices).toContain(99);
  });

  it('subscriber fires on setJourneyPhase', () => {
    const cb = vi.fn();
    const unsub = journeyStore.subscribe(cb);
    setJourneyPhase('focus');
    unsub();
    const last = cb.mock.calls[cb.mock.calls.length - 1][0];
    expect(last.phase).toBe('focus');
  });

  it('resetJourney restores defaults and syncs appState', () => {
    setJourneyPhase('focus');
    addTrailStop(1);
    setTrailDepth(2);
    resetJourney();
    expect(get(journeyStore).phase).toBe('overview');
    expect(get(journeyStore).walkHistoryIndices).toEqual([]);
    expect(get(journeyStore).trailDepth).toBe(0);
    expect(_navState.mode).toBe('overview');
    expect(_navState.trailDepth).toBe(0);
  });

  it('JOURNEY_CONFIG exposes positive constants', () => {
    expect(JOURNEY_CONFIG.MAP_HANDOFF_PRELUDE_MS).toBeGreaterThan(0);
    expect(JOURNEY_CONFIG.TERRAIN_LANDING_SETTLE_MS).toBeGreaterThan(0);
  });

  it('JOURNEY_COMPASS_PHASE_ORDER has 5 phases', () => {
    expect(JOURNEY_COMPASS_PHASE_ORDER).toHaveLength(5);
    expect(JOURNEY_COMPASS_PHASE_ORDER[0]).toBe('overview');
    expect(JOURNEY_COMPASS_PHASE_ORDER[4]).toBe('map');
  });
});
