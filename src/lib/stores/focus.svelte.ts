/**
 * @lib/stores/focus.svelte.ts — Focus pocket, thread inspector, and selected card store
 *
 * Why a plain `writable` instead of `toStore(getter, setter)`:
 *   `toStore` replaces the writable's notifying `set` with the user's custom
 *   setter. In Svelte runtime this works because the render_effect re-reads the
 *   getter after mutations and calls the underlying writable's `set`. But in
 *   jsdom/vitest there is no render_effect, so `store.update()` writes to
 *   appState but subscribers never wake up — `get(store)` returns stale values.
 *
 *   A plain `writable` + `withFocusNotify()` wrapper fixes both: runtime
 *   subscribers are notified by the writable's own `.set()`, and test
 *   environments get synchronous notification too. (A3-1 fix pattern, canonical
 *   in search.svelte.ts and camera.svelte.ts.)
 */
import type {
  FocusState,
  FocusPocketNode,
  FocusTransitionMode,
  FocusOrbitSlackState
} from '@lib/types/state';
import { get, writable, type Readable } from 'svelte/store';
import { appState } from '@lib/state/app.svelte.ts';

// ── Initial State ────────────────────────────────────────────────────────────

/** Internal store state interface. */
export interface FocusStoreState extends FocusState {
  pocketMotionByIndex: Map<number, unknown>;
  pocketTransitionStartedAt: number;
  infoPanelOpen: boolean;
  pocketListVisible: boolean;
  selectedBusiness: any | null; // Keep for component compatibility
  strandContinuityPhase: 'idle' | 'exploring' | 'arrived' | 'departing';
}

const INITIAL_FOCUS: FocusStoreState = {
  pocketNodes: [],
  pocketMeta: null,
  pocketRoleByIndex: new Map(),
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
  pocketListVisible: false,
  settling: false,
  transitionMode: 'idle',
  transitionStartedAt: 0,
  orbitSlack: { phase: 'idle', reason: '', startedAt: 0, targetShift: 0, cameraShift: 0, distanceBefore: 0, distanceAfter: 0, maxDistance: 5.5, rotateSpeed: 0.6, panSpeed: 0.5 },
  threadInspector: { active: false, source: 'none', inspectedIndex: null, pinnedIndex: null, pointerInside: false, segmentCount: 0, braidCount: 0, endpointCount: 0 }
};

// ── Store ────────────────────────────────────────────────────────────────────

/** Read a fresh snapshot from the state kernel (appState). */
function _readFocusSnapshot(): FocusStoreState {
  return {
    ...INITIAL_FOCUS,
    pocketNodes: [...appState.navState.focusPocketIndices] as any[],
    pocketMeta: appState.navState.focusPocketMeta,
    pocketRoleByIndex: new Map(appState.navState.focusPocketRoleByIndex),
    selectedBusiness: appState.selectedPoint as any,
    inspectedStrandIndex: appState.inspectedThreadIndex,
    pinnedThreadIndex: appState.pinnedThreadIndex,
    semanticDiveMode: appState.navState.trailDepth === 2,
    nodesAreSettling: appState.nodesAreSettling,
    pocketMotionByIndex: new Map(appState.pocketMotionByIndex),
    pocketTransitionStartedAt: appState.pocketTransitionStartedAt,
    infoPanelOpen: appState.infoPanelOpen,
    pocketListVisible: appState.pocketListVisible,
    transitionMode: appState.focusTransitionMode as FocusTransitionMode,
    transitionStartedAt: appState.focusTransitionStartedAt,
    orbitSlack: { ...appState.focusOrbitSlackState } as FocusOrbitSlackState,
    threadInspector: {
      active: appState.inspectedStrandDiagnostics.active,
      source: appState.inspectedStrandDiagnostics.source,
      inspectedIndex: appState.inspectedThreadIndex,
      pinnedIndex: appState.pinnedThreadIndex,
      pointerInside: appState.threadInspectorPointerInside,
      segmentCount: appState.inspectedStrandDiagnostics.segmentCount,
      braidCount: appState.inspectedStrandDiagnostics.braidCount,
      endpointCount: appState.inspectedStrandDiagnostics.endpointCount
    }
  };
}

/** Reactive binding to the Svelte 5 state kernel. */
const _focusWritable = writable<FocusStoreState>(_readFocusSnapshot());

/**
 * Push mutations to both `_focusWritable` and `appState`.
 * The writable notifies subscribers; the appState sync keeps the kernel
 * in sync for legacy readers and the engine bridge.
 */
function withFocusNotify(updater: (s: FocusStoreState) => FocusStoreState): void {
  const current = get(_focusWritable);
  const next = updater(current);
  _focusWritable.set(next);
  // Sync all bridged properties back to appState
  appState.withMutation(() => {
    appState.navState.focusPocketIndices = next.pocketNodes;
    appState.navState.focusPocketRoleByIndex = next.pocketRoleByIndex;
    appState.navState.focusPocketMeta = next.pocketMeta as any;
    appState.selectedPoint = next.selectedBusiness;
    appState.inspectedThreadIndex = next.inspectedStrandIndex;
    appState.pinnedThreadIndex = next.pinnedThreadIndex;
    appState.nodesAreSettling = next.nodesAreSettling;
    appState.pocketMotionByIndex = next.pocketMotionByIndex;
    appState.pocketTransitionStartedAt = next.pocketTransitionStartedAt;
    appState.infoPanelOpen = next.infoPanelOpen;
    appState.pocketListVisible = next.pocketListVisible;
    appState.focusTransitionMode = next.transitionMode;
    appState.focusTransitionStartedAt = next.transitionStartedAt;
    // Reverse-map semanticDiveMode → navState.trailDepth
    if (next.semanticDiveMode !== current.semanticDiveMode) {
      if (next.semanticDiveMode) appState.navState.trailDepth = 2;
      else if (appState.navState.trailDepth === 2) appState.navState.trailDepth = 1;
    }
    // Sync thread inspector diagnostics
    appState.inspectedStrandDiagnostics.active = next.threadInspector.active;
    appState.inspectedStrandDiagnostics.source = next.threadInspector.source;
    appState.inspectedStrandDiagnostics.segmentCount = next.threadInspector.segmentCount;
    appState.inspectedStrandDiagnostics.braidCount = next.threadInspector.braidCount;
    appState.inspectedStrandDiagnostics.endpointCount = next.threadInspector.endpointCount;
    appState.threadInspectorPointerInside = next.threadInspector.pointerInside;
  });
}

/**
 * Write focus-pocket fields to both the focus writable and appState in one call.
 *
 * Mirrors the discipline of `writeNavStateMirror`: callers must never mutate
 * `appState.navState.focusPocket*` directly — instead pass a patch here so the
 * writable + appState stay in sync and subscribers are notified.
 *
 * Uses `withFocusNotify` which bumps `_focusWritable`, syncs all bridged fields
 * (including pocketNodes/pocketRoleByIndex/pocketMeta) back to appState, and
 * triggers Svelte subscriber notifications.
 */
export function writeFocusPocketMirror(
  patch: Partial<Pick<FocusStoreState, 'pocketNodes' | 'pocketMeta' | 'pocketRoleByIndex'>>,
): void {
  withFocusNotify((s) => ({ ...s, ...patch }));
}

/** FocusStore type: callable function + Readable + actions. */
export type FocusStoreApi = (() => FocusStoreState) &
  Readable<FocusStoreState> & {
    update(fn: (s: FocusStoreState) => FocusStoreState): void;
    set(value: FocusStoreState): void;
  };

function _createFocusStore(): FocusStoreApi {
  // Function call: returns fresh snapshot from the writable (kept in sync
  // by withFocusNotify for every appState bridge mutation).
  const fn = (() => get(_focusWritable)) as unknown as FocusStoreApi;

  fn.subscribe = _focusWritable.subscribe as any;
  fn.update = (updater: (s: FocusStoreState) => FocusStoreState) => withFocusNotify(updater);
  fn.set = (value: FocusStoreState) => {
    _focusWritable.set(value);
    // Sync all bridged properties back to appState (same as withFocusNotify)
    appState.withMutation(() => {
      appState.navState.focusPocketIndices = value.pocketNodes;
      appState.navState.focusPocketRoleByIndex = value.pocketRoleByIndex;
      appState.navState.focusPocketMeta = value.pocketMeta as any;
      appState.selectedPoint = value.selectedBusiness;
      appState.inspectedThreadIndex = value.inspectedStrandIndex;
      appState.pinnedThreadIndex = value.pinnedThreadIndex;
      appState.nodesAreSettling = value.nodesAreSettling;
      appState.pocketMotionByIndex = value.pocketMotionByIndex;
      appState.pocketTransitionStartedAt = value.pocketTransitionStartedAt;
      appState.infoPanelOpen = value.infoPanelOpen;
      appState.pocketListVisible = value.pocketListVisible;
      appState.focusTransitionMode = value.transitionMode;
      appState.focusTransitionStartedAt = value.transitionStartedAt;
      appState.inspectedStrandDiagnostics.active = value.threadInspector.active;
      appState.inspectedStrandDiagnostics.source = value.threadInspector.source;
      appState.inspectedStrandDiagnostics.segmentCount = value.threadInspector.segmentCount;
      appState.inspectedStrandDiagnostics.braidCount = value.threadInspector.braidCount;
      appState.inspectedStrandDiagnostics.endpointCount = value.threadInspector.endpointCount;
      appState.threadInspectorPointerInside = value.threadInspector.pointerInside;
    });
  };

  return fn;
}

/** Single reactive instance of the focus state. */
export const focusStore: FocusStoreApi = _createFocusStore();

// ── Derived Getters ──────────────────────────────────────────────────────────

export const pocketNodes = () => appState.navState.focusPocketIndices;
export const pocketMeta = () => appState.navState.focusPocketMeta;
export const selectedBusiness = () => appState.selectedPoint;
export const infoPanelOpen = () => appState.infoPanelOpen;
export const pocketListVisible = () => appState.pocketListVisible;
export const semanticDiveMode = () => appState.navState.trailDepth === 2;
export const nodesAreSettling = () => appState.nodesAreSettling;
export const inspectedStrandIndex = () => appState.inspectedThreadIndex;
export const pinnedThreadIndex = () => appState.pinnedThreadIndex;
export const threadInspector = () => focusStore().threadInspector;
export const threadInspectorActive = () => appState.inspectedStrandDiagnostics.active;

// ── Actions ──────────────────────────────────────────────────────────────────

export function setPocketNodes(nodes: readonly FocusPocketNode[]): void {
  withFocusNotify(s => ({ ...s, pocketNodes: nodes as any[] }));
}

export function clearPocketNodes(): void {
  withFocusNotify(s => ({ ...s, pocketNodes: [] }));
}

export function setPocketListVisible(visible: boolean): void {
  withFocusNotify(s => ({ ...s, pocketListVisible: visible }));
}

export function pinThread(index: number): void {
  withFocusNotify(s => ({ ...s, pinnedThreadIndex: index }));
}

export function unpinThread(): void {
  withFocusNotify(s => ({ ...s, pinnedThreadIndex: null }));
}

export function clearThreadInspector(): void {
  withFocusNotify(s => ({
    ...s,
    inspectedStrandIndex: null,
    threadInspector: { ...s.threadInspector, active: false }
  }));
}

export function updateThreadInspector(patch: any): void {
  withFocusNotify(s => ({
    ...s,
    threadInspector: { ...s.threadInspector, ...patch }
  }));
}

export function setSemanticDiveMode(active: boolean): void {
  withFocusNotify(s => ({ ...s, semanticDiveMode: active }));
}

export function setSelectedBusiness(business: any): void {
  withFocusNotify(s => ({ ...s, selectedBusiness: business }));
}

export function setInfoPanelOpen(open: boolean): void {
  withFocusNotify(s => ({ ...s, infoPanelOpen: open }));
}

export function resetFocus(): void {
  withFocusNotify(() => ({ ...INITIAL_FOCUS }));
}

// ── Re-exports ───────────────────────────────────────────────────────────────
/** Constellation motifs defined in the engine config. */
export { FOCUS_CONSTELLATION_MOTIFS } from '@lib/engine/config';
export type { ConstellationMotif } from '@lib/engine/config';
