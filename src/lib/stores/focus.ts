/**
 * @lib/stores/focus.ts — Focus pocket and thread inspector state store
 */
import { writable, derived, get } from 'svelte/store';
import type {
  FocusState,
  FocusPocketNode,
  FocusTransitionMode,
  ThreadInspectorState,
  FocusOrbitSlackState,
  FocusAnchorIndicator
} from '@lib/types/state';

// ── Initial state ─────────────────────────────────────────────────────────────

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
  threadInspector: { ...INITIAL_THREAD_INSPECTOR },
  anchorIndicator: {
    active: false,
    position: null,
    pulsePhase: 0
  }
};

// ── Stores ────────────────────────────────────────────────────────────────────

export const focusState = writable<FocusState>({ ...INITIAL_FOCUS });

// ── Derived ───────────────────────────────────────────────────────────────────

export const focusPocketNodes = derived(focusState, ($f) => $f.pocketNodes);
export const focusTransitionMode = derived(focusState, ($f) => $f.transitionMode);
export const isSettling = derived(focusState, ($f) => $f.settling);
export const threadInspector = derived(focusState, ($f) => $f.threadInspector);
export const threadInspectorActive = derived(focusState, ($f) => $f.threadInspector.active);
export const orbitSlack = derived(focusState, ($f) => $f.orbitSlack);
export const anchorIndicator = derived(focusState, ($f) => $f.anchorIndicator);

// ── Actions ───────────────────────────────────────────────────────────────────

export function setFocusTransition(mode: FocusTransitionMode): void {
  focusState.update((s) => ({
    ...s,
    transitionMode: mode,
    transitionStartedAt: mode !== 'idle' ? performance.now() : s.transitionStartedAt
  }));
}

export function setPocketNodes(nodes: readonly FocusPocketNode[]): void {
  focusState.update((s) => ({ ...s, pocketNodes: nodes }));
}

export function clearPocketNodes(): void {
  focusState.update((s) => ({ ...s, pocketNodes: [] }));
}

export function setSettling(settling: boolean): void {
  focusState.update((s) => ({ ...s, settling }));
}

export function updateThreadInspector(
  patch: Partial<ThreadInspectorState>
): void {
  focusState.update((s) => ({
    ...s,
    threadInspector: { ...s.threadInspector, ...patch }
  }));
}

export function clearThreadInspector(): void {
  focusState.update((s) => ({
    ...s,
    threadInspector: { ...INITIAL_THREAD_INSPECTOR }
  }));
}

export function updateOrbitSlack(patch: Partial<FocusOrbitSlackState>): void {
  focusState.update((s) => ({
    ...s,
    orbitSlack: { ...s.orbitSlack, ...patch }
  }));
}

export function resetOrbitSlack(): void {
  focusState.update((s) => ({
    ...s,
    orbitSlack: { ...INITIAL_ORBIT_SLACK }
  }));
}

export function setAnchorIndicator(
  indicator: Partial<FocusAnchorIndicator>
): void {
  focusState.update((s) => ({
    ...s,
    anchorIndicator: { ...s.anchorIndicator, ...indicator }
  }));
}

export function resetFocus(): void {
  focusState.set({ ...INITIAL_FOCUS });
}
