/**
 * @lib/stores/focus.svelte.ts — Focus pocket, thread inspector, and selected card store (Svelte 5 runes)
 *
 * Replaces:
 *   - js/modules/focus-pocket.js (state management portion)
 *   - js/modules/journey-selected-card.js (selected card state)
 *   - js/modules/thread-inspector.js (inspector state)
 *   - Focus/thread slices from js/state.js
 *
 * The focus store owns all state related to the currently focused node,
 * its constellation pocket, thread inspector, and anchor indicator.
 * Geometry/animation logic stays in the engine — this is the Svelte truth.
 */
import type {
  FocusState,
  FocusPocketNode,
  FocusTransitionMode,
  ThreadInspectorState,
  FocusOrbitSlackState
} from '@lib/types/state';
import { writable, get, type Readable } from 'svelte/store';

// ── Configuration Constants (from state.js) ──────────────────────────────────

export const FOCUS_CONFIG = {
  /** Number of segments for focus thread curves. */
  THREAD_SEGMENTS: 16,
  /** Duration of the focus transition settle (ms). */
  SETTLE_DURATION_MS: 1200,
  /** Duration of the selected card fade in/out (ms). */
  SELECTED_CARD_FADE_MS: 180,
  /** How long to wait before confirming a hover lock (ms). */
  HOVER_LOCK_CONFIRM_MS: 80,
  /** Sampling interval for hover detection (ms). */
  HOVER_SAMPLE_MS: 24,
  /** Duration of the trail peek on mobile (ms). */
  MOBILE_ROUTE_FIELD_PEEK_MS: 1550,
  /** Minimum dwell time before trail cue appears (ms). */
  SEARCH_TRAIL_CUE_MIN_DWELL_MS: 920,
  /** Max trail neighbors to include in route embodiment. */
  MAX_ROUTE_EMBODIMENT_INDICES: 6
} as const;

// ── Constellation Motifs (from state.js) ─────────────────────────────────────

export interface ConstellationMotif {
  readonly label: string;
  readonly directLift: number;
  readonly supportLift: number;
  readonly directPriority: number;
  readonly supportPriority: number;
  readonly braid: number;
}

export const FOCUS_CONSTELLATION_MOTIFS: Record<string, ConstellationMotif> = {
  rosette: {
    label: 'semantic rosette',
    directLift: 0.82,
    supportLift: 0.46,
    directPriority: 0.78,
    supportPriority: 0.36,
    braid: 0.72
  },
  lattice: {
    label: 'trade lattice',
    directLift: 0.58,
    supportLift: 0.3,
    directPriority: 0.72,
    supportPriority: 0.42,
    braid: 0.5
  },
  delta: {
    label: 'county delta',
    directLift: 0.7,
    supportLift: 0.38,
    directPriority: 0.74,
    supportPriority: 0.34,
    braid: 0.62
  },
  market: {
    label: 'market ring',
    directLift: 0.64,
    supportLift: 0.36,
    directPriority: 0.7,
    supportPriority: 0.32,
    braid: 0.58
  },
  civic: {
    label: 'civic orbit',
    directLift: 0.62,
    supportLift: 0.34,
    directPriority: 0.68,
    supportPriority: 0.3,
    braid: 0.54
  }
};

// ── Initial State ────────────────────────────────────────────────────────────

const INITIAL_ORBIT_SLACK: FocusOrbitSlackState = {
  phase: 'idle',
  reason: '',
  startedAt: 0,
  targetShift: 0,
  cameraShift: 0,
  distanceBefore: 0,
  distanceAfter: 0,
  maxDistance: 5.5,
  rotateSpeed: 0.6,
  panSpeed: 0.5
};

const INITIAL_THREAD_INSPECTOR: ThreadInspectorState = {
  active: false,
  source: 'none',
  inspectedIndex: null,
  pinnedIndex: null,
  pointerInside: false,
  segmentCount: 0,
  braidCount: 0,
  endpointCount: 0
};

const INITIAL_FOCUS: FocusState = {
  pocketNodes: [],
  settling: false,
  transitionMode: 'idle',
  transitionStartedAt: 0,
  orbitSlack: { ...INITIAL_ORBIT_SLACK },
  threadInspector: { ...INITIAL_THREAD_INSPECTOR }
};

// ── Extended Focus Store ─────────────────────────────────────────────────────

export interface FocusStoreState extends FocusState {
  /** Motion data per pocket node index. */
  pocketMotionByIndex: Map<number, PocketMotionData>;
  /** Transition start timestamp. */
  pocketTransitionStartedAt: number;
  /** Whether nodes are currently settling into focus positions. */
  nodesAreSettling: boolean;
  /** Whether semantic dive mode is active (trailDepth === 2). */
  semanticDiveMode: boolean;
  /** Strand continuity state for trail walking. */
  strandContinuityPhase: 'idle' | 'preview' | 'pinned' | 'exploring' | 'arrived' | 'returning';
  /** Index of the currently inspected strand. */
  inspectedStrandIndex: number | null;
  /** Index of the pinned thread (click-locked). */
  pinnedThreadIndex: number | null;
  /** Whether the thread inspector pointer is inside the overlay. */
  threadInspectorPointerInside: boolean;
  /** Canvas thread inspection clear timer. */
  canvasThreadInspectionClearTimer: number | null;
  /** Selected business card data. */
  selectedBusiness: SelectedBusinessCard | null;
  /** Whether the info panel is open. */
  infoPanelOpen: boolean;
  /** Whether the a11y pocket list is visible (opt-in toggle). */
  pocketListVisible: boolean;
}

export interface PocketMotionData {
  role: string;
  delay: number;
  duration: number;
  speed: number;
  personality?: string;
  breatheAmp?: number;
  phase?: number;
}

export interface SelectedBusinessCard {
  index: number;
  name: string;
  category: string;
  city: string;
  status: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  /** Timestamp when the card was revealed. */
  revealedAt: number;
}

// ── Store ────────────────────────────────────────────────────────────────────

const _focusWritable = writable<FocusStoreState>({
  ...INITIAL_FOCUS,
  pocketMotionByIndex: new Map(),
  pocketTransitionStartedAt: 0,
  nodesAreSettling: false,
  semanticDiveMode: false,
  strandContinuityPhase: 'idle',
  inspectedStrandIndex: null,
  pinnedThreadIndex: null,
  threadInspectorPointerInside: false,
  canvasThreadInspectionClearTimer: null,
  selectedBusiness: null,
  infoPanelOpen: true,
  pocketListVisible: false
});

// ── FocusStore API ──────────────────────────────────────────────────────────
// focusStore is a hybrid: callable as focusStore() for Svelte 5 rune consumers,
// and satisfies Readable<FocusStoreState> + .update()/.set() for .ts orchestration consumers.

/** FocusStore type: callable function that also satisfies Readable + Writable-ish. */
export type FocusStoreApi = (() => FocusStoreState) &
  Readable<FocusStoreState> & {
    update(fn: (s: FocusStoreState) => FocusStoreState): void;
    set(value: FocusStoreState): void;
  };

function _createFocusStore(): FocusStoreApi {
  const fn = (() => get(_focusWritable)) as FocusStoreApi;

  // Satisfy Readable<FocusStoreState> so get(focusStore) from svelte/store works.
  fn.subscribe = _focusWritable.subscribe;

  // Writable-style update for focusStore.update(s => ({...s, ...}))
  fn.update = _focusWritable.update;

  // Writable-style set for focusStore.set(state)
  fn.set = _focusWritable.set;

  return fn;
}

/** Single reactive instance of the focus state. */
export const focusStore: FocusStoreApi = _createFocusStore();
/** Backwards-compatible alias. */
export const focusState: FocusStoreApi = focusStore;

// ── Derived Getters ──────────────────────────────────────────────────────────

export const focusPocketNodes = () => get(_focusWritable).pocketNodes;
export const focusTransitionMode = () => get(_focusWritable).transitionMode;
export const isSettling = () => get(_focusWritable).settling;
export const threadInspector = () => get(_focusWritable).threadInspector;
export const threadInspectorActive = () => get(_focusWritable).threadInspector.active;
export const orbitSlack = () => get(_focusWritable).orbitSlack;
export const selectedBusiness = () => get(_focusWritable).selectedBusiness;
export const infoPanelOpen = () => get(_focusWritable).infoPanelOpen;
export const semanticDiveMode = () => get(_focusWritable).semanticDiveMode;
export const inspectedStrandIndex = () => get(_focusWritable).inspectedStrandIndex;

// ── Actions: Focus Transition ────────────────────────────────────────────────

export function setFocusTransition(mode: FocusTransitionMode): void {
  _focusWritable.update(s => ({
    ...s,
    transitionMode: mode,
    transitionStartedAt: mode !== 'idle' ? performance.now() : s.transitionStartedAt
  }));

  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.focusTransition = mode;
  }
}

// ── Actions: Pocket Nodes ────────────────────────────────────────────────────

export function setPocketNodes(nodes: readonly FocusPocketNode[]): void {
  _focusWritable.update(s => ({ ...s, pocketNodes: nodes as FocusPocketNode[] }));
}

export function clearPocketNodes(): void {
  _focusWritable.update(s => ({
    ...s,
    pocketNodes: [],
    pocketMotionByIndex: new Map(),
    pocketListVisible: false
  }));
}

export function setPocketListVisible(visible: boolean): void {
  _focusWritable.update(s => ({ ...s, pocketListVisible: visible }));
}

export function setSettling(settling: boolean): void {
  _focusWritable.update(s => ({ ...s, settling }));
}

// ── Actions: Pocket Motion ───────────────────────────────────────────────────

export function setPocketMotionForIndex(index: number, motion: PocketMotionData): void {
  _focusWritable.update(s => {
    const newMap = new Map(s.pocketMotionByIndex);
    newMap.set(index, motion);
    return { ...s, pocketMotionByIndex: newMap };
  });
}

export function clearPocketMotionByIndex(): void {
  _focusWritable.update(s => ({ ...s, pocketMotionByIndex: new Map() }));
}

// ── Actions: Thread Inspector ────────────────────────────────────────────────

export function updateThreadInspector(
  patch: Partial<ThreadInspectorState>
): void {
  _focusWritable.update(s => ({ ...s, threadInspector: { ...s.threadInspector, ...patch } }));

  if (typeof document !== 'undefined' && document.body) {
    const nextActive = patch.active ?? get(_focusWritable).threadInspector.active;
    const nextSource = patch.source ?? get(_focusWritable).threadInspector.source;
    const nextInspected = patch.inspectedIndex ?? get(_focusWritable).threadInspector.inspectedIndex;
    document.body.dataset.threadInspectSurface = nextActive ? (nextSource || 'rail') : 'idle';
    if (nextActive) {
      document.body.dataset.threadInspect = 'active';
      if (nextInspected !== null && Number.isFinite(nextInspected)) {
        document.body.dataset.inspectedThreadIndex = String(nextInspected);
      }
    } else {
      document.body.removeAttribute('data-thread-inspect');
      document.body.removeAttribute('data-inspected-thread-index');
    }
  }
}

export function clearThreadInspector(): void {
  _focusWritable.update(s => ({
    ...s,
    threadInspector: { ...INITIAL_THREAD_INSPECTOR },
    inspectedStrandIndex: null,
    pinnedThreadIndex: null,
    threadInspectorPointerInside: false
  }));

  if (typeof document !== 'undefined' && document.body) {
    document.body.removeAttribute('data-thread-inspect');
    document.body.removeAttribute('data-inspected-thread-index');
    document.body.dataset.threadInspectSurface = 'idle';
  }
}

/** Pin a thread for click-lock inspection. */
export function pinThread(index: number): void {
  _focusWritable.update(s => ({
    ...s,
    pinnedThreadIndex: index,
    inspectedStrandIndex: index,
    threadInspector: {
      ...s.threadInspector,
      active: true,
      inspectedIndex: index,
      pinnedIndex: index
    }
  }));
  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.threadInspect = 'active';
    document.body.dataset.threadInspectSurface = 'pinned';
    document.body.dataset.inspectedThreadIndex = String(index);
  }
}

/** Unpin the currently pinned thread. */
export function unpinThread(): void {
  _focusWritable.update(s => ({
    ...s,
    pinnedThreadIndex: null,
    threadInspector: {
      ...s.threadInspector,
      pinnedIndex: null
    }
  }));
  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.threadInspectSurface = get(_focusWritable).threadInspector.active ? 'rail' : 'idle';
  }
}

// ── Actions: Orbit Slack ─────────────────────────────────────────────────────

export function updateOrbitSlack(patch: Partial<FocusOrbitSlackState>): void {
  _focusWritable.update(s => ({ ...s, orbitSlack: { ...s.orbitSlack, ...patch } }));
}

export function resetOrbitSlack(): void {
  _focusWritable.update(s => ({ ...s, orbitSlack: { ...INITIAL_ORBIT_SLACK } }));
}

// ── Actions: Selected Business ───────────────────────────────────────────────

/** Set the currently selected business card. */
export function setSelectedBusiness(
  business: Omit<SelectedBusinessCard, 'revealedAt'> | null
): void {
  _focusWritable.update(s => ({
    ...s,
    selectedBusiness: business
      ? { ...business, revealedAt: performance.now() }
      : null
  }));

  // Sync body data attribute
  if (typeof document !== 'undefined' && document.body) {
    if (business) {
      document.body.dataset.selectedBusiness = String(business.index);
    } else {
      document.body.removeAttribute('data-selected-business');
    }
  }
}

// ── Actions: Info Panel ──────────────────────────────────────────────────────

export function setInfoPanelOpen(open: boolean): void {
  _focusWritable.update(s => ({ ...s, infoPanelOpen: open }));

  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.infoPanel = open ? 'open' : 'closed';
  }
}

// ── Actions: Semantic Dive Mode ──────────────────────────────────────────────

export function setSemanticDiveMode(active: boolean): void {
  _focusWritable.update(s => ({ ...s, semanticDiveMode: active }));

  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.semanticDive = active ? 'active' : 'inactive';
  }
}

// ── Actions: Strand Continuity ───────────────────────────────────────────────

export function setStrandContinuityPhase(
  phase: FocusStoreState['strandContinuityPhase']
): void {
  _focusWritable.update(s => ({ ...s, strandContinuityPhase: phase }));
}

// ── Actions: Settling State ──────────────────────────────────────────────────

export function setNodesAreSettling(settling: boolean): void {
  _focusWritable.update(s => ({ ...s, nodesAreSettling: settling }));
}

// ── Full Reset ───────────────────────────────────────────────────────────────

export function resetFocus(): void {
  _focusWritable.set({
    ...INITIAL_FOCUS,
    pocketMotionByIndex: new Map(),
    pocketTransitionStartedAt: 0,
    nodesAreSettling: false,
    semanticDiveMode: false,
    strandContinuityPhase: 'idle',
    inspectedStrandIndex: null,
    pinnedThreadIndex: null,
    threadInspectorPointerInside: false,
    canvasThreadInspectionClearTimer: null,
    selectedBusiness: null,
    infoPanelOpen: true,
    pocketListVisible: false
  });
  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.focusTransition = '';
    document.body.dataset.semanticDive = 'inactive';
    document.body.removeAttribute('data-selected-business');
  }
}
