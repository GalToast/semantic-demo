/**
 * @lib/stores/journey.ts — Journey orchestration, trail, and thread walker store
 *
 * Replaces:
 *   - js/modules/journey.js (state management portion)
 *   - js/modules/journey-thread-settler.js (thread walker state)
 *   - js/modules/journey-thread-model.js (thread model state)
 *   - Journey slices from js/state.js
 *
 * The journey store owns the trail of visited nodes, walk history,
 * thread candidates, and journey phase lifecycle.
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

// ── Configuration Constants (from state.js) ──────────────────────────────────

export const JOURNEY_CONFIG = {
  /** Handoff prelude duration (ms). */
  MAP_HANDOFF_PRELUDE_MS: 430,
  /** View handoff out duration (ms). */
  VIEW_HANDOFF_OUT_MS: 1200,
  /** Terrain landing settle duration (ms). */
  TERRAIN_LANDING_SETTLE_MS: 1200,
  /** Long settle duration (ms). */
  TERRAIN_LANDING_SETTLE_LONG_MS: 1800,
  /** Duration to show view handoff dismiss (ms). */
  SHOW_VIEW_HANDOFF_DISMISS_MS: 2200,
  /** Late refresh delay for map trail (ms). */
  MAP_TRAIL_REFRESH_LATE_DELAY_MS: 100,
  /** Scene reveal duration (ms). */
  SCENE_REVEAL_DURATION_MS: 1650,
  /** Loading minimum visible duration (ms). */
  LOADING_MIN_VISIBLE_MS: 1320
} as const;

// ── Journey Phase Order (from state.js) ──────────────────────────────────────

export const JOURNEY_COMPASS_PHASE_ORDER: readonly string[] = [
  'overview', 'search', 'focus', 'inside', 'map'
];

// ── Initial State ────────────────────────────────────────────────────────────

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

// ── Extended Journey Store ───────────────────────────────────────────────────

export interface JourneyStoreState extends JourneyState {
  /** Trail seed index (the anchor node for trail generation). */
  trailSeedIndex: number | null;
  /** Trail neighbor indices (the neighbors along the trail). */
  trailNeighborIndices: readonly number[];
  /** Trail cursor (current position in the trail). */
  trailCursor: number;
  /** Trail depth (how deep into the trail the user has gone). */
  trailDepth: number;
  /** Walk history indices (flat array of visited node indices). */
  walkHistoryIndices: readonly number[];
  /** Thread candidates for the current focus. */
  threadCandidates: readonly number[];
  /** Thread reason by index (why each candidate was selected). */
  threadReasonByIndex: Map<number, string>;
  /** Thread source: 'semantic' | 'geometric-fallback'. */
  threadSource: string;
  /** Last traversal reason. */
  lastTraversalReason: string | null;
  /** Whether a terrain handoff is in progress. */
  terrainHandoffPhase: 'idle' | 'prelude' | 'transition' | 'settle';
  /** Route exploration state. */
  routeExplorationPhase: 'idle' | 'exploring' | 'user-control';
  /** Route choreography phase. */
  routeChoreographyPhase: string;
}

const INITIAL_STORE: JourneyStoreState = {
  ...INITIAL_JOURNEY,
  trailSeedIndex: null,
  trailNeighborIndices: [],
  trailCursor: -1,
  trailDepth: 0,
  walkHistoryIndices: [],
  threadCandidates: [],
  threadReasonByIndex: new Map(),
  threadSource: 'geometric-fallback',
  lastTraversalReason: null,
  terrainHandoffPhase: 'idle',
  routeExplorationPhase: 'idle',
  routeChoreographyPhase: 'overview'
};

// ── Store ────────────────────────────────────────────────────────────────────

export const journeyStore = writable<JourneyStoreState>({ ...INITIAL_STORE });
export const journeyState = journeyStore;

// ── Derived ──────────────────────────────────────────────────────────────────

export const journeyPhase = derived(journeyStore, ($j) => $j.phase);
export const journeyTrail = derived(journeyStore, ($j) => $j.trail);
export const compassState = derived(journeyStore, ($j) => $j.compass);
export const compassPhase = derived(journeyStore, ($j) => $j.compass.phase);
export const journeyNeighbors = derived(journeyStore, ($j) => $j.neighbors);
export const journeySelectedId = derived(journeyStore, ($j) => $j.selectedId);
export const walkHistory = derived(journeyStore, ($j) => $j.walkHistory);
export const trailDepth = derived(journeyStore, ($j) => $j.trailDepth);
export const trailSeedIndex = derived(journeyStore, ($j) => $j.trailSeedIndex);
export const trailNeighborIndices = derived(journeyStore, ($j) => $j.trailNeighborIndices);
export const threadCandidates = derived(journeyStore, ($j) => $j.threadCandidates);
export const threadSource = derived(journeyStore, ($j) => $j.threadSource);
export const walkHistoryIndices = derived(journeyStore, ($j) => $j.walkHistoryIndices);

// ── Compass State Machine ────────────────────────────────────────────────────

const COMPASS_TRANSITIONS: Record<CompassPhase, readonly CompassPhase[]> = {
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
  const current = get(journeyStore);
  const from = current.compass.phase;

  if (!canTransition(from, to)) {
    console.warn(`[Compass] Invalid transition: ${from} → ${to}`);
    return false;
  }

  journeyStore.update((s) => ({
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

// ── Journey Phase Actions ────────────────────────────────────────────────────

/** Set the journey phase and sync the body data attribute. */
export function setJourneyPhase(phase: JourneyPhase): void {
  journeyStore.update((s) => ({ ...s, phase }));
  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.journeyPhase = phase;
  }
}

// ── Trail Actions ────────────────────────────────────────────────────────────

/** Add a trail stop. */
export function addTrailStop(stop: TrailStop): void {
  journeyStore.update((s) => ({
    ...s,
    trail: [...s.trail, stop]
  }));
}

/** Remove a trail stop by index. */
export function removeTrailStop(index: number): void {
  journeyStore.update((s) => ({
    ...s,
    trail: s.trail.filter((_, i) => i !== index)
  }));
}

/** Clear the trail and reset trail state. */
export function clearTrail(): void {
  journeyStore.update((s) => ({
    ...s,
    trail: [],
    selectedStopIndex: null,
    trailSeedIndex: null,
    trailNeighborIndices: [],
    trailCursor: -1,
    trailDepth: 0
  }));
}

/** Set the selected trail stop index. */
export function setSelectedStop(index: number | null): void {
  journeyStore.update((s) => ({ ...s, selectedStopIndex: index }));
}

/** Set the trail seed index. */
export function setTrailSeedIndex(index: number | null): void {
  journeyStore.update((s) => ({ ...s, trailSeedIndex: index }));
}

/** Set trail neighbor indices. */
export function setTrailNeighborIndices(indices: readonly number[]): void {
  journeyStore.update((s) => ({ ...s, trailNeighborIndices: indices }));
}

/** Advance the trail cursor. */
export function advanceTrailCursor(): void {
  journeyStore.update((s) => ({
    ...s,
    trailCursor: s.trailCursor + 1
  }));
}

/** Set the trail depth (0 = overview, 1 = focus, 2 = inside). */
export function setTrailDepth(depth: number): void {
  journeyStore.update((s) => ({ ...s, trailDepth: depth }));
}

// ── Neighbor Actions ─────────────────────────────────────────────────────────

/** Set the neighbor list. */
export function setNeighbors(neighbors: readonly NeighborEntry[]): void {
  journeyStore.update((s) => ({ ...s, neighbors }));
}

// ── Walk History Actions ─────────────────────────────────────────────────────

/** Add a walk history entry. */
export function addWalkHistory(entry: WalkHistoryEntry): void {
  journeyStore.update((s) => ({
    ...s,
    walkHistory: [...s.walkHistory, entry]
  }));
}

/** Add a walk history index (simplified). */
export function addWalkHistoryIndex(index: number): void {
  journeyStore.update((s) => ({
    ...s,
    walkHistoryIndices: [...s.walkHistoryIndices, index]
  }));
}

/** Clear walk history. */
export function clearWalkHistory(): void {
  journeyStore.update((s) => ({
    ...s,
    walkHistory: [],
    walkHistoryIndices: []
  }));
}

// ── Thread Candidate Actions ─────────────────────────────────────────────────

/** Set the thread candidates for the current focus. */
export function setThreadCandidates(
  candidates: readonly number[],
  source: string = 'geometric-fallback',
  reasonByIndex?: Map<number, string>
): void {
  journeyStore.update((s) => ({
    ...s,
    threadCandidates: candidates,
    threadSource: source,
    threadReasonByIndex: reasonByIndex ?? s.threadReasonByIndex
  }));
}

/** Clear thread candidates. */
export function clearThreadCandidates(): void {
  journeyStore.update((s) => ({
    ...s,
    threadCandidates: [],
    threadReasonByIndex: new Map()
  }));
}

// ── Terrain Handoff Actions ──────────────────────────────────────────────────

/** Set the terrain handoff phase. */
export function setTerrainHandoffPhase(
  phase: JourneyStoreState['terrainHandoffPhase']
): void {
  journeyStore.update((s) => ({ ...s, terrainHandoffPhase: phase }));

  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.terrainHandoff = phase;
  }
}

// ── Route Exploration Actions ────────────────────────────────────────────────

/** Set the route exploration phase. */
export function setRouteExplorationPhase(
  phase: JourneyStoreState['routeExplorationPhase'],
  reason: string = ''
): void {
  journeyStore.update((s) => ({
    ...s,
    routeExplorationPhase: phase,
    lastTraversalReason: reason || s.lastTraversalReason
  }));
}

// ── Selection Actions ────────────────────────────────────────────────────────

/** Set the selected trail stop by ID. */
export function setSelectedId(id: string | null): void {
  journeyStore.update((s) => ({ ...s, selectedId: id }));
}

// ── Full Reset ───────────────────────────────────────────────────────────────

/** Reset the journey store to initial state. */
export function resetJourney(): void {
  journeyStore.set({ ...INITIAL_STORE });
  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.journeyPhase = 'idle';
    document.body.dataset.journeyCompass = 'idle';
    document.body.dataset.terrainHandoff = 'idle';
  }
}
