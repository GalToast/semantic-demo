import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

/**
 * @vitest-environment jsdom
 *
 * Wave 21.1 Item 1 — Focus store consolidated test (separate file).
 * Extracted from focus-state-class-migration.test.ts to avoid parallel-worker
 * race conditions on a single mega-file.
 *
 * Run: npx vitest run tests/unit-active/state-class-migration-3-focus.test.ts
 */

// ── Hoisted mock state ───────────────────────────────────────────────────────

const _focusState = vi.hoisted(() => ({
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

// ── Mock factories ───────────────────────────────────────────────────────────

vi.mock('@lib/state/app.svelte.ts', () => ({
    appState: {
        navState: _focusState,
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
    _focusState.focusPocketIndices = [];
    _focusState.focusPocketMeta = null;
    _focusState.trailDepth = 0;
    _focusState.mode = 'overview';
    _focusState.walkHistoryIndices = [];
    _focusState.trailCursor = -1;
    _focusState.threadCandidates = [];
    _focusState.threadReasonByIndex = new Map();
    _focusState.threadSource = 'geometric-fallback';
    _focusState.lastTraversalReason = null;
    _focusState.trailNeighborIndices = [];
    _focusState.focusedIndex = null;
    _focusState.trailSeedIndex = null;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('focus store — state-class appState regression', () => {
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
        // setSelectedBusiness now requires BusinessRecordWithIndex; tests use
        // a minimal { id } shape and only assert identity. The cast preserves
        // the contract assertion (=== biz) while satisfying the typed
        // parameter.
        const biz = { id: 'stub-record' };
        setSelectedBusiness(biz as unknown as Parameters<typeof setSelectedBusiness>[0]);
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
        expect(_focusState.trailDepth).toBe(2);
    });

    it('setSemanticDiveMode false leaves trailDepth if not 2', () => {
        _focusState.trailDepth = 1;
        setSemanticDiveMode(false);
        expect(semanticDiveMode()).toBe(false);
        expect(_focusState.trailDepth).toBe(1);
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
        setSelectedBusiness({ id: '1' } as unknown as Parameters<typeof setSelectedBusiness>[0]);
        setInfoPanelOpen(false);
        resetFocus();
        expect(get(focusStore).pocketListVisible).toBe(false);
        expect(get(focusStore).selectedBusiness).toBeNull();
        expect(get(focusStore).infoPanelOpen).toBe(true);
        expect(pinnedThreadIndex()).toBeNull();
    });

    it('derived getters read from appState/navState', () => {
        _focusState.focusPocketIndices = [1, 2, 3];
        expect(pocketNodes()).toEqual([1, 2, 3]);
        _focusState.focusPocketMeta = { label: 'A' };
        expect(pocketMeta()).toEqual({ label: 'A' });
        expect(nodesAreSettling()).toBe(false);
    });
});
