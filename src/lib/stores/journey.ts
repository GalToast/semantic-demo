/**
 * @lib/stores/journey.ts — Journey phase, trail, and compass state store
 *
 * Typed compass state machine: idle→checking→synthesizing→active|interrupted→idle
 */
import { writable, derived, get } from 'svelte/store';
import type {
  JourneyState,
  JourneyPhase,
  CompassState,
  CompassPhase,
  CompassAction,
  TrailStop,
  NeighborEntry,
  WalkHistoryEntry
} from '@lib/types/state';

// ── Initial state ─────────────────────────────────────────────────────────────

const INITIAL_COMPASS: CompassState = {
  phase: 'idle',
  currentAction: 'none',
  previousAction: 'none',
  lastTransitionAt: 0
};

const INITIAL_JOURNEY: JourneyState = {
  phase: 'idle',
  trail: [],
  selectedId: null,
  selectedStopIndex: null,
  neighbors: [],
  compass: { ...INITIAL_COMPASS },
  walkHistory: []
};

// ── Stores ────────────────────────────────────────────────────────────────────

export const journeyState = writable<JourneyState>({ ...INITIAL_JOURNEY });

// ── Derived ───────────────────────────────────────────────────────────────────

export const journeyPhase = derived(journeyState, ($j) => $j.phase);
export const journeyTrail = derived(journeyState, ($j) => $j.trail);
export const compassState = derived(journeyState, ($j) => $j.compass);
export const compassPhase = derived(journeyState, ($j) => $j.compass.phase);
export const journeyNeighbors = derived(journeyState, ($j) => $j.neighbors);
export const journeySelectedId = derived(journeyState, ($j) => $j.selectedId);
export const walkHistory = derived(journeyState, ($j) => $j.walkHistory);

// ── Compass State Machine ─────────────────────────────────────────────────────

const COMPASS_TRANSITIONS: Record<CompassPhase, CompassPhase[]> = {
  idle: ['checking'],
  checking: ['synthesizing', 'interrupted'],
  synthesizing: ['active', 'interrupted'],
  active: ['checking', 'interrupted', 'idle'],
  interrupted: ['idle', 'checking']
};

function canTransition(from: CompassPhase, to: CompassPhase): boolean {
  return COMPASS_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Transition the compass state machine.
 * Returns true if the transition was valid.
 */
export function transitionCompass(
  to: CompassPhase,
  action?: CompassAction
): boolean {
  const current = get(journeyState);
  const from = current.compass.phase;

  if (!canTransition(from, to)) {
    console.warn(`[Compass] Invalid transition: ${from} → ${to}`);
    return false;
  }

  journeyState.update((s) => ({
    ...s,
    compass: {
      phase: to,
      currentAction: action ?? s.compass.currentAction,
      previousAction: s.compass.currentAction,
      lastTransitionAt: performance.now()
    }
  }));

  // Update body data attribute for CSS coexistence
  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.journeyCompass = to;
  }

  return true;
}

// ── Journey Actions ───────────────────────────────────────────────────────────

export function setJourneyPhase(phase: JourneyPhase): void {
  journeyState.update((s) => ({ ...s, phase }));
  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.journeyPhase = phase;
  }
}

export function addTrailStop(stop: TrailStop): void {
  journeyState.update((s) => ({
    ...s,
    trail: [...s.trail, stop]
  }));
}

export function removeTrailStop(index: number): void {
  journeyState.update((s) => ({
    ...s,
    trail: s.trail.filter((_, i) => i !== index)
  }));
}

export function clearTrail(): void {
  journeyState.update((s) => ({ ...s, trail: [], selectedStopIndex: null }));
}

export function setSelectedStop(index: number | null): void {
  journeyState.update((s) => ({ ...s, selectedStopIndex: index }));
}

export function setNeighbors(neighbors: readonly NeighborEntry[]): void {
  journeyState.update((s) => ({ ...s, neighbors }));
}

export function addWalkHistory(entry: WalkHistoryEntry): void {
  journeyState.update((s) => ({
    ...s,
    walkHistory: [...s.walkHistory, entry]
  }));
}

export function clearWalkHistory(): void {
  journeyState.update((s) => ({ ...s, walkHistory: [] }));
}

export function resetJourney(): void {
  journeyState.set({ ...INITIAL_JOURNEY });
  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.journeyPhase = 'idle';
    document.body.dataset.journeyCompass = 'idle';
  }
}
