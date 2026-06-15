import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

/**
 * @vitest-environment jsdom
 */

// ── Mutable mock navState (shared by appState mock) ───────────────────────────

const _navState = vi.hoisted(() => ({
  focusPocketIndices: [] as any[],
  focusPocketMeta: null as any,
  trailDepth: 0,
  mode: 'overview',
  walkHistoryIndices: [] as number[],
  trailCursor: -1,
  threadCandidates: [] as any[],
  threadReasonByIndex: new Map(),
  threadSource: 'geometric-fallback',
  lastTraversalReason: null as any,
  trailNeighborIndices: [] as number[],
  focusedIndex: null as number | null,
  trailSeedIndex: null as number | null,
}));

const _inspectedStrandDiagnostics = vi.hoisted(() => ({
  active: false,
  source: 'none',
  segmentCount: 0,
  braidCount: 0,
  endpointCount: 0,
}));

// ── Mock appState (plain JS object — NO Svelte 5 $state runes) ─────────────────

vi.mock('@lib/state/app.svelte.ts', () => ({
  appState: {
    navState: _navState,
    selectedPoint: null as any,
    inspectedThreadIndex: null as number | null,
    pinnedThreadIndex: null as number | null,
    nodesAreSettling: false,
    pocketMotionByIndex: new Map(),
    pocketTransitionStartedAt: 0,
    infoPanelOpen: true,
    pocketListVisible: false,
    focusTransitionMode: 'idle' as string,
    focusTransitionStartedAt: 0,
    inspectedStrandDiagnostics: _inspectedStrandDiagnostics,
    threadInspectorPointerInside: false,
    withMutation: (fn: () => unknown) => fn(),
  },
}));

// ── Imports (must appear AFTER vi.mock) ──────────────────────────────────────

import {
  focusStore,
  setPocketListVisible,
  setSelectedBusiness,
  setInfoPanelOpen,
  pinThread,
  unpinThread,
  clearThreadInspector,
  setSemanticDiveMode,
  resetFocus,
  pocketNodes,
  pocketMeta,
  selectedBusiness,
  infoPanelOpen,
  pocketListVisible,
  inspectedStrandIndex,
  pinnedThreadIndex,
  threadInspectorActive,
  semanticDiveMode,
  nodesAreSettling,
} from '@lib/stores/focus.svelte.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

function resetMockNavState() {
  _navState.focusPocketIndices = [];
  _navState.focusPocketMeta = null;
  _navState.trailDepth = 0;
  _navState.mode = 'overview';
  _navState.walkHistoryIndices = [];
  _navState.trailCursor = -1;
  _navState.threadCandidates = [];
  _navState.threadReasonByIndex = new Map();
  _navState.threadSource = 'geometric-fallback';
  _navState.lastTraversalReason = null;
  _navState.trailNeighborIndices = [];
  _navState.focusedIndex = null;
  _navState.trailSeedIndex = null;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('focus store — T4 writable + withFocusNotify migration', () => {
  beforeEach(() => {
    resetFocus();
    resetMockNavState();
  });

  it('focusStore returns a valid FocusStoreState snapshot', () => {
    const s = focusStore();
    expect(s).toHaveProperty('pocketNodes');
    expect(s).toHaveProperty('infoPanelOpen');
    expect(s).toHaveProperty('threadInspector');
  });

  it('setPocketListVisible updates writable and appState', () => {
    setPocketListVisible(true);
    expect(get(focusStore).pocketListVisible).toBe(true);
    expect(pocketListVisible()).toBe(true);
  });

  it('setSelectedBusiness updates writable and appState', () => {
    const biz = { id: 123 };
    setSelectedBusiness(biz);
    expect(selectedBusiness()).toBe(biz);
    expect(get(focusStore).selectedBusiness).toBe(biz);
  });

  it('setInfoPanelOpen updates state', () => {
    setInfoPanelOpen(false);
    expect(infoPanelOpen()).toBe(false);
    expect(get(focusStore).infoPanelOpen).toBe(false);
  });

  it('pinThread / unpinThread mutate pinnedThreadIndex', () => {
    pinThread(5);
    expect(pinnedThreadIndex()).toBe(5);
    expect(get(focusStore).pinnedThreadIndex).toBe(5);
    unpinThread();
    expect(pinnedThreadIndex()).toBeNull();
  });

  it('clearThreadInspector resets inspectedStrandIndex and active flag', () => {
    pinThread(3);
    clearThreadInspector();
    expect(inspectedStrandIndex()).toBeNull();
    expect(threadInspectorActive()).toBe(false);
  });

  it('setSemanticDiveMode true sets navState.trailDepth to 2', () => {
    setSemanticDiveMode(true);
    expect(semanticDiveMode()).toBe(true);
    expect(_navState.trailDepth).toBe(2);
  });

  it('setSemanticDiveMode false leaves trailDepth if not 2', () => {
    _navState.trailDepth = 1;
    setSemanticDiveMode(false);
    expect(semanticDiveMode()).toBe(false);
    expect(_navState.trailDepth).toBe(1);
  });

  it('subscriber fires on setPocketListVisible via withFocusNotify', () => {
    const cb = vi.fn();
    const unsub = focusStore.subscribe(cb);
    setPocketListVisible(true);
    unsub();
    const last = cb.mock.calls[cb.mock.calls.length - 1][0];
    expect(last.pocketListVisible).toBe(true);
  });

  it('subscriber fires on setSelectedBusiness', () => {
    const cb = vi.fn();
    const unsub = focusStore.subscribe(cb);
    setSelectedBusiness({ name: 'Test' });
    unsub();
    const last = cb.mock.calls[cb.mock.calls.length - 1][0];
    expect(last.selectedBusiness).toEqual({ name: 'Test' });
  });

  it('resetFocus restores defaults and syncs to appState', () => {
    setPocketListVisible(true);
    setSelectedBusiness({ id: 1 });
    setInfoPanelOpen(false);
    resetFocus();
    expect(get(focusStore).pocketListVisible).toBe(false);
    expect(get(focusStore).selectedBusiness).toBeNull();
    expect(get(focusStore).infoPanelOpen).toBe(true);
    expect(pinnedThreadIndex()).toBeNull();
  });

  it('derived getters read from appState/navState', () => {
    _navState.focusPocketIndices = [1, 2, 3];
    expect(pocketNodes()).toEqual([1, 2, 3]);
    _navState.focusPocketMeta = { label: 'A' };
    expect(pocketMeta()).toEqual({ label: 'A' });
    expect(nodesAreSettling()).toBe(false);
  });
});
