/**
 * @lib/stores/journey.svelte.ts — Journey orchestration, trail, and thread walker store (writable store)
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
import { type Readable, writable, get } from 'svelte/store';
import { debugWarn } from '@lib/utils/diagnostic-adapter';

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

// ── Store ────────────────────────────────────────────────────────────────────

const _journeyWritable = writable<JourneyStoreState>({
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
});

// ── JourneyStore API ────────────────────────────────────────────────────────
// journeyStore is a hybrid: callable as journeyStore() for convenience,
// and satisfies Readable<JourneyStoreState> + .update()/.set() for .ts orchestration consumers.

/** JourneyStore type: callable function that also satisfies Readable + Writable-ish. */
export type JourneyStoreApi = (() => JourneyStoreState) &
  Readable<JourneyStoreState> & {
    update(fn: (s: JourneyStoreState) => JourneyStoreState): void;
    set(value: JourneyStoreState): void;
  };

/** Backward-compat alias used by barrel exports. */
export type JourneyStoreState_ = JourneyStoreApi;

function _createJourneyStore(): JourneyStoreApi {
  const fn = (() => get(_journeyWritable)) as JourneyStoreApi;

  // Satisfy Readable<JourneyStoreState> so get(journeyStore) from svelte/store works.
  fn.subscribe = _journeyWritable.subscribe;

  // Writable-style update for journeyStore.update(s => ({...s, ...}))
  fn.update = _journeyWritable.update;

  // Writable-style set for journeyStore.set(state)
  fn.set = _journeyWritable.set;

  return fn;
}

/** Single reactive instance of the journey state. */
export const journeyStore: JourneyStoreApi = _createJourneyStore();
/** Backwards-compatible alias. */
export const journeyState: JourneyStoreApi = journeyStore;

// ── Derived Getters ──────────────────────────────────────────────────────────

export const journeyPhase = () => get(_journeyWritable).phase;
export const journeyTrail = () => get(_journeyWritable).trail;
export const compassState = () => get(_journeyWritable).compass;
export const compassPhase = () => get(_journeyWritable).compass.phase;
export const journeyNeighbors = () => get(_journeyWritable).neighbors;
export const journeySelectedId = () => get(_journeyWritable).selectedId;
export const walkHistory = () => get(_journeyWritable).walkHistory;
export const trailDepth = () => get(_journeyWritable).trailDepth;
export const trailSeedIndex = () => get(_journeyWritable).trailSeedIndex;
export const trailNeighborIndices = () => get(_journeyWritable).trailNeighborIndices;
export const threadCandidates = () => get(_journeyWritable).threadCandidates;
export const threadSource = () => get(_journeyWritable).threadSource;
export const walkHistoryIndices = () => get(_journeyWritable).walkHistoryIndices;

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
  const from = get(_journeyWritable).compass.phase;

  if (!canTransition(from, to)) {
    debugWarn(`[Compass] Invalid transition: ${from} → ${to}`);
    return false;
  }

  _journeyWritable.update(s => ({
    ...s,
    compass: {
      phase: to,
      currentAction: action ?? s.compass.currentAction,
      previousAction: s.compass.currentAction,
      lastTransitionAt: performance.now()
    }
  }));

  return true;
}

// ── Journey Phase Actions ────────────────────────────────────────────────────

/** Set the journey phase; parity-attrs owns body data-* sync. */
export function setJourneyPhase(phase: JourneyPhase): void {
  _journeyWritable.update(s => ({ ...s, phase }));
}

// ── Trail Actions ────────────────────────────────────────────────────────────

/** Add a trail stop. */
export function addTrailStop(stop: TrailStop): void {
  _journeyWritable.update(s => ({ ...s, trail: [...s.trail, stop] }));
}

/** Remove a trail stop by index. */
export function removeTrailStop(index: number): void {
  _journeyWritable.update(s => ({ ...s, trail: s.trail.filter((_, i) => i !== index) }));
}

/** Clear the trail and reset trail state. */
export function clearTrail(): void {
  _journeyWritable.update(s => ({
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
  _journeyWritable.update(s => ({ ...s, selectedStopIndex: index }));
}

/** Set the trail seed index. */
export function setTrailSeedIndex(index: number | null): void {
  _journeyWritable.update(s => ({ ...s, trailSeedIndex: index }));
}

/** Set trail neighbor indices. */
export function setTrailNeighborIndices(indices: readonly number[]): void {
  _journeyWritable.update(s => ({ ...s, trailNeighborIndices: indices }));
}

/** Advance the trail cursor. */
export function advanceTrailCursor(): void {
  _journeyWritable.update(s => ({ ...s, trailCursor: s.trailCursor + 1 }));
}

/** Set the trail depth (0 = overview, 1 = focus, 2 = inside). */
export function setTrailDepth(depth: number): void {
  _journeyWritable.update(s => ({ ...s, trailDepth: depth }));
}

// ── Neighbor Actions ─────────────────────────────────────────────────────────

/** Set the neighbor list. */
export function setNeighbors(neighbors: readonly NeighborEntry[]): void {
  _journeyWritable.update(s => ({ ...s, neighbors }));
}

// ── Walk History Actions ─────────────────────────────────────────────────────

/** Add a walk history entry. */
export function addWalkHistory(entry: WalkHistoryEntry): void {
  _journeyWritable.update(s => ({ ...s, walkHistory: [...s.walkHistory, entry] }));
}

/** Add a walk history index (simplified). */
export function addWalkHistoryIndex(index: number): void {
  _journeyWritable.update(s => ({ ...s, walkHistoryIndices: [...s.walkHistoryIndices, index] }));
}

/** Clear walk history. */
export function clearWalkHistory(): void {
  _journeyWritable.update(s => ({
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
  _journeyWritable.update(s => ({
    ...s,
    threadCandidates: candidates,
    threadSource: source,
    ...(reasonByIndex ? { threadReasonByIndex: reasonByIndex } : {})
  }));
}

/** Clear thread candidates. */
export function clearThreadCandidates(): void {
  _journeyWritable.update(s => ({
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
  _journeyWritable.update(s => ({ ...s, terrainHandoffPhase: phase }));
}

// ── Route Exploration Actions ────────────────────────────────────────────────

/** Set the route exploration phase. */
export function setRouteExplorationPhase(
  phase: JourneyStoreState['routeExplorationPhase'],
  reason: string = ''
): void {
  _journeyWritable.update(s => ({
    ...s,
    routeExplorationPhase: phase,
    ...(reason ? { lastTraversalReason: reason } : {})
  }));
}

// ── Selection Actions ────────────────────────────────────────────────────────

/** Set the selected trail stop by ID. */
export function setSelectedId(id: string | null): void {
  _journeyWritable.update(s => ({ ...s, selectedId: id }));
}

// ── Full Reset ───────────────────────────────────────────────────────────────

/** Reset the journey store to initial state. */
export function resetJourney(): void {
  _journeyWritable.set({
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
  });
}
