/**
 * @lib/stores/journey.svelte.ts — Journey orchestration, trail, and thread walker store
 */
import type {
  JourneyState,
  JourneyPhase,
  CompassState,
  CompassPhase,
  CompassAction,
  TrailStop,

  WalkHistoryEntry
} from '@lib/types/state';
import { type Readable, toStore } from 'svelte/store';
// debugWarn removed — was unused in this store
import { appState } from '@lib/state/app.svelte.ts';

// ── Configuration Constants (from state.js) ──────────────────────────────────

export const JOURNEY_CONFIG = {
  /** Handoff prelude duration (ms). */
  MAP_HANDOFF_PRELUDE_MS: 430,
  /** Settle duration for terrain landing (ms). */
  TERRAIN_LANDING_SETTLE_MS: 1200,
  /** Long settle duration for deep focus transitions (ms). */
  TERRAIN_LANDING_SETTLE_LONG_MS: 1800
} as const;

/** Journey milestones in sequence. */
export const JOURNEY_COMPASS_PHASE_ORDER = ['overview', 'search', 'focus', 'inside', 'map'];

// ── Initial State ────────────────────────────────────────────────────────────

/** Internal store state interface. */
export interface JourneyStoreState extends JourneyState {
  terrainHandoffPhase: 'idle' | 'prelude' | 'transition' | 'settle';
  routeExplorationPhase: 'idle' | 'searching' | 'focusing';
  routeChoreographyPhase: 'overview' | 'trail' | 'focus' | 'inside' | 'map';
}

const INITIAL_JOURNEY: JourneyStoreState = {
  phase: 'overview',
  trail: [],
  cursor: -1,
  depth: 0,
  threadCandidates: [],
  threadReasonByIndex: new Map(),
  threadSource: 'geometric-fallback',
  lastTraversalReason: null,
  terrainHandoffPhase: 'idle',
  routeExplorationPhase: 'idle',
  routeChoreographyPhase: 'overview',
  selectedId: null,
  selectedStopIndex: null,
  neighbors: [],
  compass: { phase: 'idle' as CompassPhase, currentAction: 'none' as CompassAction, previousAction: 'none' as CompassAction, lastTransitionAt: 0 },
  walkHistory: []
};

// ── Store ────────────────────────────────────────────────────────────────────

/** Reactive binding to the Svelte 5 state kernel. */
const _journeyWritable = toStore(
  () => ({
    ...INITIAL_JOURNEY,
    ...$state.snapshot(appState.navState),
    phase: appState.navState.mode,
    trail: [...appState.navState.walkHistoryIndices].map(index => ({ index } as TrailStop)),
    cursor: appState.navState.trailCursor,
    depth: appState.navState.trailDepth,
    threadCandidates: [...(appState.navState.threadCandidates as any[])].map(Number),
    threadReasonByIndex: new Map(appState.navState.threadReasonByIndex),
    threadSource: appState.navState.threadSource,
    lastTraversalReason: appState.navState.lastTraversalReason,
    terrainHandoffPhase: 'idle' as any,
    routeExplorationPhase: 'idle' as any,
    routeChoreographyPhase: 'overview' as any
  }),
  (val) => appState.withMutation(() => {
    appState.navState.mode = val.phase;
    appState.navState.trailCursor = val.cursor;
    appState.navState.trailDepth = val.depth;
    appState.navState.threadSource = val.threadSource;
    appState.navState.lastTraversalReason = val.lastTraversalReason;
  })
);

/** JourneyStore type: callable function + Readable + actions. */
export type JourneyStoreApi = (() => JourneyStoreState) &
  Readable<JourneyStoreState> & {
    update(fn: (s: JourneyStoreState) => JourneyStoreState): void;
    set(value: JourneyStoreState): void;
  };

function _createJourneyStore(): JourneyStoreApi {
  // Function call: returns fresh sync snapshot from kernel
  const fn = (() => ({
    ...INITIAL_JOURNEY,
    ...$state.snapshot(appState.navState),
    phase: appState.navState.mode,
    trail: [...appState.navState.walkHistoryIndices].map(index => ({ index } as TrailStop)),
    cursor: appState.navState.trailCursor,
    depth: appState.navState.trailDepth,
    threadCandidates: [...(appState.navState.threadCandidates as any[])].map(Number),
    threadReasonByIndex: new Map(appState.navState.threadReasonByIndex),
    threadSource: appState.navState.threadSource,
    lastTraversalReason: appState.navState.lastTraversalReason,
    terrainHandoffPhase: 'idle' as any,
    routeExplorationPhase: 'idle' as any,
    routeChoreographyPhase: 'overview' as any
  })) as unknown as JourneyStoreApi;

  fn.subscribe = _journeyWritable.subscribe as any;
  fn.update = _journeyWritable.update as any;
  fn.set = _journeyWritable.set as any;

  return fn;
}

/** Single reactive instance of the journey state. */
export const journeyStore: JourneyStoreApi = _createJourneyStore();
/** Backwards-compatible alias. */
export const journeyState: JourneyStoreApi = journeyStore;

// ── Derived Getters ──────────────────────────────────────────────────────────

export const journeyPhase = () => appState.navState.mode;
export const journeyTrail = () => [...appState.navState.walkHistoryIndices].map(index => ({ index } as TrailStop));
export const compassState = () => ({ phase: appState.navState.mode, action: null }) as unknown as CompassState;
export const compassPhase = () => 'idle';
export const journeyNeighbors = () => appState.navState.trailNeighborIndices;
export const journeySelectedId = () => {
  const focused = appState.navState.focusedIndex;
  return focused === null ? null : String(focused);
};
export const walkHistory = () =>
  [...appState.navState.walkHistoryIndices].map<WalkHistoryEntry>(index => ({
    fromIndex: -1,
    toIndex: index,
    reason: '',
    timestamp: Date.now()
  }));
export const trailDepth = () => appState.navState.trailDepth;
export const trailSeedIndex = () => appState.navState.trailSeedIndex;
export const trailNeighborIndices = () => appState.navState.trailNeighborIndices;
export const threadCandidates = (): ReadonlyArray<number> => [...appState.navState.threadCandidates].map(Number);
export const threadSource = () => appState.navState.threadSource;
export const walkHistoryIndices = () => appState.navState.walkHistoryIndices;

/** Returns the current point index at the journey cursor. */
export function currentJourneyIndex(): number | null {
  const s = journeyStore();
  if (s.cursor < 0 || s.cursor >= s.trail.length) return null;
  return s.trail[s.cursor]?.index ?? null;
}

// ── Actions ──────────────────────────────────────────────────────────────────

export function setJourneyPhase(phase: JourneyPhase): void {
  appState.withMutation(() => { appState.navState.mode = phase as any; });
}

export function setTrailDepth(depth: number): void {
  appState.withMutation(() => { appState.navState.trailDepth = depth; });
}

export function addWalkHistoryIndex(index: number): void {
  appState.withMutation(() => {
    const current = [...appState.navState.walkHistoryIndices];
    if (!current.includes(index)) {
      appState.navState.walkHistoryIndices = [...current, index];
    }
  });
}

export function transitionCompass(phase: string): void {
  // Compass phase is typically tied to nav mode or a sub-state.
  // For now, we'll map it to nav mode if it matches a milestone.
  if ((JOURNEY_COMPASS_PHASE_ORDER as readonly string[]).includes(phase)) {
    appState.withMutation(() => { appState.navState.mode = phase as any; });
  }
}

export function addTrailStop(stop: TrailStop | number): void {
  const index = typeof stop === 'number' ? stop : stop.index;
  appState.withMutation(() => {
    appState.navState.walkHistoryIndices = [...appState.navState.walkHistoryIndices, index];
    appState.navState.trailCursor = appState.navState.walkHistoryIndices.length - 1;
  });
}

export function removeTrailStop(index: number): void {
  appState.withMutation(() => {
    appState.navState.walkHistoryIndices = appState.navState.walkHistoryIndices.filter(i => i !== index);
    appState.navState.trailCursor = Math.min(appState.navState.trailCursor, appState.navState.walkHistoryIndices.length - 1);
  });
}

export function clearTrail(): void {
  appState.withMutation(() => {
    appState.navState.walkHistoryIndices = [];
    appState.navState.trailCursor = -1;
  });
}

export function setSelectedStop(index: number | null): void {
  appState.withMutation(() => { appState.navState.focusedIndex = index; });
}

export function setTrailSeedIndex(index: number | null): void {
  appState.withMutation(() => { appState.navState.trailSeedIndex = index; });
}

export function setTrailNeighborIndices(indices: readonly number[]): void {
  appState.withMutation(() => { appState.navState.trailNeighborIndices = [...indices]; });
}

export function advanceTrailCursor(delta = 1): void {
  appState.withMutation(() => {
    const max = appState.navState.walkHistoryIndices.length - 1;
    appState.navState.trailCursor = Math.max(-1, Math.min(max, appState.navState.trailCursor + delta));
  });
}

export function setNeighbors(indices: readonly number[]): void {
  setTrailNeighborIndices(indices);
}

export function addWalkHistory(entry: WalkHistoryEntry | number): void {
  addTrailStop(typeof entry === 'number' ? entry : entry.toIndex);
}

export function clearWalkHistory(): void {
  clearTrail();
}

export function setThreadCandidates(candidates: readonly number[]): void {
  appState.withMutation(() => { appState.navState.threadCandidates = [...candidates]; });
}

export function clearThreadCandidates(): void {
  appState.withMutation(() => { appState.navState.threadCandidates = []; });
}

export function setTerrainHandoffPhase(phase: JourneyStoreState['terrainHandoffPhase']): void {
  _journeyWritable.update(s => ({ ...s, terrainHandoffPhase: phase }));
}

export function setRouteExplorationPhase(phase: JourneyStoreState['routeExplorationPhase']): void {
  _journeyWritable.update(s => ({ ...s, routeExplorationPhase: phase }));
}

export function setSelectedId(id: string | null): void {
  const index = id === null ? null : Number(id);
  setSelectedStop(Number.isFinite(index) ? index : null);
}

export function resetJourney(): void {
  appState.withMutation(() => {
    appState.navState.mode = 'overview';
    appState.navState.walkHistoryIndices = [];
    appState.navState.trailCursor = -1;
    appState.navState.trailDepth = 0;
  });
}
