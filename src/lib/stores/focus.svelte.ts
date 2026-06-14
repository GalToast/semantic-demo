/**
 * @lib/stores/focus.svelte.ts — Focus pocket, thread inspector, and selected card store
 */
import type {
  FocusState,
  FocusPocketNode,
  FocusTransitionMode,
  ThreadInspectorState,
  FocusOrbitSlackState,
  FocusPocketMeta
} from '@lib/types/state';
import { get, type Readable, toStore } from 'svelte/store';
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

/** Reactive binding to the Svelte 5 state kernel. */
const _focusWritable = toStore(
  () => ({
    ...INITIAL_FOCUS,
    ...$state.snapshot(appState.navState),
    pocketNodes: [...appState.navState.focusPocketIndices] as any[],
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
    orbitSlack: $state.snapshot(appState.focusOrbitSlackState),
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
  }),
  (val) => appState.withMutation(() => {
    appState.navState.focusPocketIndices = val.pocketNodes;
    appState.selectedPoint = val.selectedBusiness;
    appState.inspectedThreadIndex = val.inspectedStrandIndex;
    appState.pinnedThreadIndex = val.pinnedThreadIndex;
    appState.nodesAreSettling = val.nodesAreSettling;
    appState.pocketMotionByIndex = val.pocketMotionByIndex;
    appState.pocketTransitionStartedAt = val.pocketTransitionStartedAt;
    appState.infoPanelOpen = val.infoPanelOpen;
    appState.pocketListVisible = val.pocketListVisible;
    appState.focusTransitionMode = val.transitionMode;
    appState.focusTransitionStartedAt = val.transitionStartedAt;
  })
);

/** FocusStore type: callable function + Readable + actions. */
export type FocusStoreApi = (() => FocusStoreState) &
  Readable<FocusStoreState> & {
    update(fn: (s: FocusStoreState) => FocusStoreState): void;
    set(value: FocusStoreState): void;
  };

function _createFocusStore(): FocusStoreApi {
  // Function call: returns fresh sync snapshot from kernel
  const fn = (() => ({
    ...INITIAL_FOCUS,
    ...$state.snapshot(appState.navState),
    pocketNodes: [...appState.navState.focusPocketIndices] as any[],
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
    orbitSlack: $state.snapshot(appState.focusOrbitSlackState),
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
  })) as unknown as FocusStoreApi;

  fn.subscribe = _focusWritable.subscribe as any;
  fn.update = _focusWritable.update as any;
  fn.set = _focusWritable.set as any;

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
  appState.withMutation(() => { appState.navState.focusPocketIndices = nodes as any; });
}

export function clearPocketNodes(): void {
  appState.withMutation(() => { appState.navState.focusPocketIndices = []; });
}

export function setPocketListVisible(visible: boolean): void {
  appState.withMutation(() => { appState.pocketListVisible = visible; });
}

export function pinThread(index: number): void {
  appState.withMutation(() => { appState.pinnedThreadIndex = index; });
}

export function unpinThread(): void {
  appState.withMutation(() => { appState.pinnedThreadIndex = null; });
}

export function clearThreadInspector(): void {
  appState.withMutation(() => {
    appState.inspectedThreadIndex = null;
    appState.inspectedStrandDiagnostics.active = false;
  });
}

export function updateThreadInspector(patch: any): void {
  appState.withMutation(() => {
    Object.assign(appState.inspectedStrandDiagnostics, patch);
  });
}

export function setSemanticDiveMode(active: boolean): void {
  // Usually tied to trail depth, but can be forced
  appState.withMutation(() => {
    if (active) appState.navState.trailDepth = 2;
    else if (appState.navState.trailDepth === 2) appState.navState.trailDepth = 1;
  });
}

export function setSelectedBusiness(business: any): void {
  appState.withMutation(() => { appState.selectedPoint = business; });
}

export function setInfoPanelOpen(open: boolean): void {
  appState.withMutation(() => { appState.infoPanelOpen = open; });
}

export function resetFocus(): void {
  appState.withMutation(() => {
    appState.navState.focusPocketIndices = [];
    appState.navState.focusPocketMeta = null;
    appState.selectedPoint = null;
    appState.inspectedThreadIndex = null;
    appState.pinnedThreadIndex = null;
    appState.infoPanelOpen = true;
    appState.pocketListVisible = false;
  });
}
