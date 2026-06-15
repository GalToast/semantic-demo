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
import { get, type Readable, writable } from 'svelte/store';
// debugWarn removed — was unused in this store
import { appState } from '@lib/state/app.svelte.ts';

// ── Configuration Constants (from state.js) ──────────────────────────────────

export const JOURNEY_CONFIG = {
  /** Handoff prelude duration (ms). */
  MAP_HANDOFF_PRELUDE_MS: 430,
  /** Settle duration for terrain landing (ms). */
  TERRAIN_LANDING_SETTLE_MS: 1200,
  /** Long settle duration for deep focus transitions (ms). */
  TERRAIN_LANDING_SETTLE_LONG_MS: 1800,
  /** Delay before late trail refresh on map transition (ms). */
  MAP_TRAIL_REFRESH_LATE_DELAY_MS: 100
} as const;

/** Journey milestones in sequence. */
export const JOURNEY_COMPASS_PHASE_ORDER = ['overview', 'search', 'focus', 'inside', 'map'];

function valueArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value instanceof Map) return [...value.values()];
  if (value && typeof (value as Iterable<unknown>)[Symbol.iterator] === 'function') {
    return [...(value as Iterable<unknown>)];
  }
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function finiteIndexList(value: unknown): number[] {
  return valueArray(value)
    .map((index) => Number(index))
    .filter((index) => Number.isFinite(index));
}

function candidateIndex(candidate: unknown): number | null {
  if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
  if (!candidate || typeof candidate !== 'object') return null;
  const index = Number((candidate as { index?: unknown }).index);
  return Number.isFinite(index) ? index : null;
}

function candidateIndexList(value: unknown): number[] {
  return valueArray(value)
    .map(candidateIndex)
    .filter((index): index is number => index !== null);
}

// ── Initial State ────────────────────────────────────────────────────────────

/** Internal store state interface. */
export interface JourneyStoreState extends JourneyState {
  terrainHandoffPhase: 'idle' | 'prelude' | 'transition' | 'settle';
  routeExplorationPhase: 'idle' | 'searching' | 'focusing';
  routeChoreographyPhase: 'overview' | 'trail' | 'focus' | 'inside' | 'map';
  /** Direct trail depth accessor (mirrors navState.trailDepth). */
  trailDepth: number;
  /** Walk history indices (mirrors navState.walkHistoryIndices). */
  walkHistoryIndices: number[];
  /** Trail seed index (mirrors navState.trailSeedIndex). */
  trailSeedIndex: number | null;
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
  walkHistory: [],
  trailDepth: 0,
  walkHistoryIndices: [],
  trailSeedIndex: null
};

// ── Store ────────────────────────────────────────────────────────────────────

/**
 * Why a plain `writable` instead of `toStore(getter, setter)`:
 *   `toStore` creates a render_effect that only fires in the Svelte runtime
 *   (browser). In jsdom/vitest there is no render_effect, so store.update()
 *   writes to appState but subscribers never wake up — get(store) returns
 *   stale values. A plain `writable` + `withJourneyNotify()` fixes both:
 *   runtime subscribers are notified by the writable's own .set(), and test
 *   environments get synchronous notification too.
 */

/** Read the current journey state from appState (shared by initial value and callable getter). */
function _readJourneyFromAppState(): JourneyStoreState {
  const walkIndices = finiteIndexList(appState.navState.walkHistoryIndices);
  return {
    ...INITIAL_JOURNEY,
    ...$state.snapshot(appState.navState),
    phase: appState.navState.mode,
    trail: walkIndices.map(index => ({ index } as TrailStop)),
    cursor: appState.navState.trailCursor,
    depth: appState.navState.trailDepth,
    trailDepth: appState.navState.trailDepth,
    walkHistoryIndices: walkIndices,
    trailSeedIndex: appState.navState.trailSeedIndex ?? null,
    threadCandidates: valueArray(appState.navState.threadCandidates) as any[],
    threadReasonByIndex: new Map(appState.navState.threadReasonByIndex),
    threadSource: appState.navState.threadSource,
    lastTraversalReason: appState.navState.lastTraversalReason,
    terrainHandoffPhase: 'idle' as any,
    routeExplorationPhase: 'idle' as any,
    routeChoreographyPhase: 'overview' as any
  };
}

const _journeyWritable = writable<JourneyStoreState>(_readJourneyFromAppState());

/**
 * Push journey mutations to both `_journeyWritable` and `appState`.
 * The writable notifies subscribers; the appState mutation keeps the kernel
 * in sync. The 5 bridged properties are: mode, trailCursor, trailDepth,
 * threadSource, lastTraversalReason.
 */
function withJourneyNotify(updater: (s: JourneyStoreState) => JourneyStoreState): void {
  const current = get(_journeyWritable);
  const next = updater(current);
  // depth and trailDepth are aliases in the journey state. The W11-T4
  // migration kept them as separate fields to preserve the legacy
  // contract (some callers set only one), but the parity layer reads
  // `journey.depth` while tests tend to set `trailDepth`. Normalize
  // here so the writable stays internally consistent regardless of
  // which alias the caller mutated. `trailDepth` is treated as the
  // canonical value (matches the appState sync below) — any user-set
  // `depth` that disagrees with `trailDepth` is overridden.
  const normalized = {
    ...next,
    depth: next.trailDepth,
    trailDepth: next.trailDepth,
  };
  _journeyWritable.set(normalized);
  appState.withMutation(() => {
    appState.navState.mode = normalized.phase;
    appState.navState.trailCursor = normalized.cursor;
    appState.navState.trailDepth = normalized.trailDepth;
    appState.navState.threadSource = normalized.threadSource;
    appState.navState.lastTraversalReason = normalized.lastTraversalReason;
  });
}

/** JourneyStore type: callable function + Readable + actions. */
export type JourneyStoreApi = (() => JourneyStoreState) &
  Readable<JourneyStoreState> & {
    update(fn: (s: JourneyStoreState) => JourneyStoreState): void;
    set(value: JourneyStoreState): void;
  };

function _createJourneyStore(): JourneyStoreApi {
  // Function call: returns fresh snapshot from the writable (kept in sync
  // by withJourneyNotify for every appState bridge mutation). Matches the
  // focus store pattern: the writable is the Svelte-side source of truth,
  // so consumers see the latest user-provided state including fields like
  // `compass` that withJourneyNotify does not mirror back to appState.
  const fn = (() => get(_journeyWritable)) as unknown as JourneyStoreApi;

  fn.subscribe = _journeyWritable.subscribe as any;
  // Wrap update/set to also sync appState via withJourneyNotify, so the
  // callable getter (which reads appState) returns fresh values immediately.
  fn.update = ((updater: (s: JourneyStoreState) => JourneyStoreState) => {
    withJourneyNotify(updater);
  }) as any;
  fn.set = ((value: JourneyStoreState) => {
    withJourneyNotify(() => value);
  }) as any;

  return fn;
}

/** Single reactive instance of the journey state. */
export const journeyStore: JourneyStoreApi = _createJourneyStore();
/** Backwards-compatible alias. */
export const journeyState: JourneyStoreApi = journeyStore;

// ── Derived Getters ──────────────────────────────────────────────────────────

export const journeyPhase = () => appState.navState.mode;
export const journeyTrail = () => finiteIndexList(appState.navState.walkHistoryIndices).map(index => ({ index } as TrailStop));
export const compassState = () => ({ phase: appState.navState.mode, action: null }) as unknown as CompassState;
export const compassPhase = () => 'idle';
export const journeyNeighbors = () => finiteIndexList(appState.navState.trailNeighborIndices);
export const journeySelectedId = () => {
  const focused = appState.navState.focusedIndex;
  return focused === null ? null : String(focused);
};
export const walkHistory = () =>
  finiteIndexList(appState.navState.walkHistoryIndices).map<WalkHistoryEntry>(index => ({
    fromIndex: -1,
    toIndex: index,
    reason: '',
    timestamp: Date.now()
  }));
export const trailDepth = () => appState.navState.trailDepth;
export const trailSeedIndex = () => appState.navState.trailSeedIndex;
export const trailNeighborIndices = () => finiteIndexList(appState.navState.trailNeighborIndices);
export const threadCandidates = (): ReadonlyArray<number> => candidateIndexList(appState.navState.threadCandidates);
export const threadSource = () => appState.navState.threadSource;
export const walkHistoryIndices = () => finiteIndexList(appState.navState.walkHistoryIndices);

/** Returns the current point index at the journey cursor. */
export function currentJourneyIndex(): number | null {
  const s = journeyStore();
  if (s.cursor < 0 || s.cursor >= s.trail.length) return null;
  return s.trail[s.cursor]?.index ?? null;
}

// ── Actions ──────────────────────────────────────────────────────────────────

export function setJourneyPhase(phase: JourneyPhase): void {
  withJourneyNotify(s => ({ ...s, phase: phase as any }));
}

export function setTrailDepth(depth: number): void {
  withJourneyNotify(s => ({ ...s, depth, trailDepth: depth }));
}

export function addWalkHistoryIndex(index: number): void {
  withJourneyNotify(s => {
    if (s.walkHistoryIndices.includes(index)) return s;
    const walkHistoryIndices = [...s.walkHistoryIndices, index];
    return {
      ...s,
      walkHistoryIndices,
      trail: walkHistoryIndices.map(i => ({ index: i } as TrailStop)),
      cursor: walkHistoryIndices.length - 1
    };
  });
}

export function transitionCompass(phase: string): void {
  // Compass phase is typically tied to nav mode or a sub-state.
  // For now, we'll map it to nav mode if it matches a milestone.
  if ((JOURNEY_COMPASS_PHASE_ORDER as readonly string[]).includes(phase)) {
    withJourneyNotify(s => ({ ...s, phase: phase as any }));
  }
}

export function addTrailStop(stop: TrailStop | number): void {
  const index = typeof stop === 'number' ? stop : stop.index;
  withJourneyNotify(s => {
    const walkHistoryIndices = [...s.walkHistoryIndices, index];
    return {
      ...s,
      walkHistoryIndices,
      trail: walkHistoryIndices.map(i => ({ index: i } as TrailStop)),
      cursor: walkHistoryIndices.length - 1
    };
  });
}

export function removeTrailStop(index: number): void {
  withJourneyNotify(s => {
    const walkHistoryIndices = s.walkHistoryIndices.filter(i => i !== index);
    return {
      ...s,
      walkHistoryIndices,
      trail: walkHistoryIndices.map(i => ({ index: i } as TrailStop)),
      cursor: Math.min(s.cursor, walkHistoryIndices.length - 1)
    };
  });
}

export function clearTrail(): void {
  withJourneyNotify(s => ({
    ...s,
    walkHistoryIndices: [],
    trail: [],
    cursor: -1
  }));
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
  withJourneyNotify(s => {
    const max = s.walkHistoryIndices.length - 1;
    return { ...s, cursor: Math.max(-1, Math.min(max, s.cursor + delta)) };
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
  _journeyWritable.update(s => ({ ...s, threadCandidates: [...candidates] }));
  appState.withMutation(() => { appState.navState.threadCandidates = [...candidates]; });
}

export function clearThreadCandidates(): void {
  _journeyWritable.update(s => ({ ...s, threadCandidates: [] }));
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
  _journeyWritable.set({ ...INITIAL_JOURNEY });
  appState.withMutation(() => {
    appState.navState.mode = 'overview';
    appState.navState.walkHistoryIndices = [];
    appState.navState.trailCursor = -1;
    appState.navState.trailDepth = 0;
  });
}
