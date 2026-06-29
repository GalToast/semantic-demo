import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

/**
 * @vitest-environment jsdom
 *
 * journeyStore mirror contract — Phase 3c
 *
 * Contract: every journeyStore mutation MUST keep the Svelte-side writable
 * (`journeyStore()` / `get(journeyStore)`) AND `appState.navState` in sync.
 * This is the analogue of state-class-migration-5-navigation.test.ts but
 * for the journey side. There is NO readLegacyJourneyField fallback chain
 * (the journeyStore was designed as a deliberate forward-only mirror, not a
 * legacy compatibility layer like navStore).
 *
 * Bridged fields:
 *   - mode (phase)              via setJourneyPhase
 *   - trailCursor               via addTrailStop / removeTrailStop / clearTrail
 *   - trailDepth                via setTrailDepth
 *   - threadSource              via setJourneyPhase + withJourneyNotify
 *   - lastTraversalReason       via withJourneyNotify
 *   - walkHistoryIndices        via addTrailStop / removeTrailStop / clearTrail  [GAP pre-fix]
 *   - focusedIndex              via setSelectedStop
 *   - trailSeedIndex            via setTrailSeedIndex
 *   - trailNeighborIndices      via setTrailNeighborIndices
 *   - threadCandidates          via setThreadCandidates / clearThreadCandidates
 */

// ── Mutable mock navState ─────────────────────────────────────────────────────

const _navState = vi.hoisted(() => ({
  mode: 'overview' as string,
  walkHistoryIndices: [] as number[],
  trailCursor: -1,
  trailDepth: 0,
  threadSource: 'geometric-fallback' as string,
  lastTraversalReason: null as any,
  threadCandidates: [] as any[],
  threadReasonByIndex: new Map(),
  focusedIndex: null as number | null,
  trailSeedIndex: null as number | null,
  trailNeighborIndices: [] as number[],
}));

// ── Mock appState (plain JS object — NO Svelte 5 $state runes) ─────────────────

vi.mock('@lib/state/app.svelte.ts', () => ({
  appState: {
    navState: _navState,
    // W11-T4 partition sub-records — production reads these at module-init.
    searchState: {
      currentSearchSummary: null,
      searchStatus: 'idle',
      searchError: null,
      searchRequestSequence: 0,
      searchAnchorIndex: null,
      searchPreviewIndex: null,
      searchGlowIndices: new Set(),
      searchGlowTopIndex: null,
      searchGlowActive: false,
      searchFocusTransitionToken: 0,
      isSearching: false,
      currentEmptyQuery: null,
      semanticTrailCue: 'idle',
      isCompactViewport: false,
      semanticGuideRequestSequence: 0,
      currentSemanticGuide: null,
      summaryCardTypeToken: 0,
      semanticSearchCacheDiagnostics: { hits: 0, misses: 0, stores: 0, evictions: 0, lastKey: null, lastSource: null, lastAgeMs: null },
      semanticSearchResultCache: new Map(),
      searchVisibleCount: 5
    },
    viewportState: {
      viewportWidth: 1280, viewportHeight: 800,
      isCompactViewport: false, isMobileViewport: false, isTabletViewport: false,
      devicePixelRatio: 1
    },
    focusState: {
      selectedPoint: null, inspectedThreadIndex: null, pinnedThreadIndex: null,
      threadInspectorPointerInside: false,
      pocketMotionByIndex: new Map(),
      pocketTransitionStartedAt: 0,
      infoPanelOpen: true, pocketListVisible: false, pocketRoleFilter: 'all',
      focusTransitionMode: 'idle', focusTransitionStartedAt: 0,
      nodesAreSettling: false,
      inspectedStrandDiagnostics: { active: false, source: '', index: null, focusedIndex: null, segmentCount: 0, braidCount: 0, endpointCount: 0 }
    },
    withMutation: (fn: () => unknown) => fn(),
  },
}));

// ── Imports (must come after the mock) ────────────────────────────────────────

import {
  journeyStore,
  setJourneyPhase,
  setTrailDepth,
  addTrailStop,
  removeTrailStop,
  clearTrail,
  setSelectedStop,
  setTrailSeedIndex,
  setTrailNeighborIndices,
  setThreadCandidates,
  clearThreadCandidates,
  resetJourney,
  type JourneyStoreState
} from '@lib/stores/journey.svelte';

describe('journeyStore mirror contract — Phase 3c', () => {
  beforeEach(() => {
    // Reset mock navState before each test.
    _navState.mode = 'overview';
    _navState.walkHistoryIndices = [];
    _navState.trailCursor = -1;
    _navState.trailDepth = 0;
    _navState.threadSource = 'geometric-fallback';
    _navState.lastTraversalReason = null;
    _navState.threadCandidates = [];
    _navState.focusedIndex = null;
    _navState.trailSeedIndex = null;
    _navState.trailNeighborIndices = [];
    // Reset the writable to initial state.
    journeyStore.set({
      ...get(journeyStore),
      phase: 'overview',
      trail: [],
      cursor: -1,
      walkHistoryIndices: [],
      trailDepth: 0,
      trailSeedIndex: null,
      threadCandidates: [],
    } as JourneyStoreState);
  });

  // ── mode / phase ────────────────────────────────────────────────────────────

  it('setJourneyPhase mirrors mode to appState.navState.mode', () => {
    setJourneyPhase('search');
    expect(get(journeyStore).phase).toBe('search');
    expect(_navState.mode).toBe('search');
  });

  it('setJourneyPhase to focus mirrors correctly', () => {
    setJourneyPhase('focus');
    expect(get(journeyStore).phase).toBe('focus');
    expect(_navState.mode).toBe('focus');
  });

  // ── trailDepth ──────────────────────────────────────────────────────────────

  it('setTrailDepth mirrors trailDepth to appState.navState.trailDepth', () => {
    setTrailDepth(3);
    expect(get(journeyStore).trailDepth).toBe(3);
    expect(_navState.trailDepth).toBe(3);
  });

  // ── walkHistoryIndices (the gap) ────────────────────────────────────────────

  it('addTrailStop mirrors walkHistoryIndices to appState.navState.walkHistoryIndices', () => {
    addTrailStop(10);
    expect(get(journeyStore).walkHistoryIndices).toContain(10);
    expect(_navState.walkHistoryIndices).toContain(10);
  });

  it('addTrailStop x3 mirrors full array to appState', () => {
    addTrailStop(1);
    addTrailStop(2);
    addTrailStop(3);
    expect(_navState.walkHistoryIndices).toEqual([1, 2, 3]);
  });

  it('removeTrailStop mirrors filtered array to appState', () => {
    addTrailStop(1);
    addTrailStop(2);
    addTrailStop(3);
    removeTrailStop(2);
    expect(_navState.walkHistoryIndices).toEqual([1, 3]);
  });

  it('clearTrail mirrors empty array to appState', () => {
    addTrailStop(1);
    addTrailStop(2);
    clearTrail();
    expect(_navState.walkHistoryIndices).toEqual([]);
  });

  // ── focusedIndex (direct appState mutation) ─────────────────────────────────

  it('setSelectedStop writes focusedIndex to appState', () => {
    setSelectedStop(42);
    expect(_navState.focusedIndex).toBe(42);
  });

  // ── trailSeedIndex (direct appState mutation) ───────────────────────────────

  it('setTrailSeedIndex writes trailSeedIndex to appState', () => {
    setTrailSeedIndex(7);
    expect(_navState.trailSeedIndex).toBe(7);
  });

  // ── trailNeighborIndices (direct appState mutation) ─────────────────────────

  it('setTrailNeighborIndices writes indices to appState', () => {
    setTrailNeighborIndices([5, 6, 7]);
    expect(_navState.trailNeighborIndices).toEqual([5, 6, 7]);
  });

  // ── threadCandidates (split bridge) ─────────────────────────────────────────

  it('setThreadCandidates writes candidates to appState', () => {
    setThreadCandidates([1, 2, 3]);
    expect(_navState.threadCandidates.length).toBe(3);
    expect(_navState.threadCandidates.map((c: any) => c.index)).toEqual([1, 2, 3]);
  });

  it('clearThreadCandidates clears candidates in appState', () => {
    setThreadCandidates([1, 2]);
    clearThreadCandidates();
    expect(_navState.threadCandidates).toEqual([]);
  });

  // ── resetJourney ────────────────────────────────────────────────────────────

  it('resetJourney mirrors full reset to appState', () => {
    setJourneyPhase('focus');
    addTrailStop(1);
    setTrailDepth(5);
    resetJourney();
    expect(_navState.mode).toBe('overview');
    expect(_navState.walkHistoryIndices).toEqual([]);
    expect(_navState.trailCursor).toBe(-1);
    expect(_navState.trailDepth).toBe(0);
  });
});