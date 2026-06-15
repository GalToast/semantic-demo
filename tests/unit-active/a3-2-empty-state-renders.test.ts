/**
 * A3-2: Search empty-state UI regression test
 *
 * Locks in the A3-2 fix to `src/lib/stores/lifecycle.ts:recordEmptySearch()`.
 *
 * The bug (pre-fix): `recordEmptySearch()` was clobbering the writable's
 * `summary` field to `null` synchronously after `setSearchResults([])` had
 * just populated it with a populated zero-result SearchSummary. Subscribers
 * of `$searchState` in `SearchResults.svelte` (which `isEmpty` at line 122
 * reads from) saw `summary = null`, so the elaborate `search-empty-state`
 * branch at `SearchResults.svelte:351-360` never fired — even though
 * `appState.currentSearchSummary` was still correctly populated.
 *
 * The fix removes the `summary: null,` line from `recordEmptySearch()`. The
 * function still updates `currentEmptyQuery` for downstream consumers but
 * no longer overwrites the populated empty-result summary on the writable.
 *
 * Pattern contract (mirrors the A3-1 + navigation T4 tests):
 *   - vi.hoisted() exposes a plain object the test can mutate
 *   - vi.mock() provides a stub for @lib/state/app.svelte.ts
 *   - Tests verify the writable's `summary` is preserved across the
 *     `recordEmptySearch` call (the actual A3-2 root cause)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Mock factory for appState (plain JS, no runes) ────────────────────────────

const mockState = vi.hoisted(() => ({
  currentSearchSummary: null as {
    query: string;
    totalMatches: number;
    totalSemanticMatches: number;
    visibleMatches: number;
    resultCount: number;
    topScore: number;
    anchorIndex: number | null;
    topIndex: number | null;
    resultIndices: number[];
    summaryType: string;
  } | null,
  navState: {
    focusedIndex: null as number | null,
    mode: 'idle' as string,
    trailDepth: 0,
    trailCursor: 0,
    walkHistoryIndices: [] as number[],
    walkHistoryPointers: [] as number[],
    trailNeighborIndices: [] as number[],
    focusPocketIndices: [] as number[],
    focusPocketMeta: null,
    focusPocketRoleByIndex: [] as [number, string][],
    pendingFocus: null
  },
  searchStatus: 'idle' as 'idle' | 'searching' | 'results' | 'error',
  searchRequestSequence: 0,
  searchAnchorIndex: null as number | null,
  searchPreviewIndex: null as number | null,
  searchGlowIndices: new Set<number>(),
  searchGlowTopIndex: null as number | null,
  searchGlowActive: false,
  currentEmptyQuery: null as string | null,
  searchFocusTransitionToken: 0,
  semanticTrailCue: 'idle' as 'idle' | 'searching' | 'focusing',
  isCompactViewport: false,
  semanticGuideRequestSequence: 0,
  currentSemanticGuide: null as string | null,
  summaryCardTypeToken: 0
}));

vi.mock('@lib/state/app.svelte.ts', () => ({
  appState: {
    get currentSearchSummary() { return mockState.currentSearchSummary; },
    set currentSearchSummary(v) { mockState.currentSearchSummary = v; },
    get navState() { return mockState.navState; },
    get searchStatus() { return mockState.searchStatus; },
    set searchStatus(v) { mockState.searchStatus = v; },
    get searchRequestSequence() { return mockState.searchRequestSequence; },
    set searchRequestSequence(v) { mockState.searchRequestSequence = v; },
    get searchAnchorIndex() { return mockState.searchAnchorIndex; },
    set searchAnchorIndex(v) { mockState.searchAnchorIndex = v; },
    get searchPreviewIndex() { return mockState.searchPreviewIndex; },
    set searchPreviewIndex(v) { mockState.searchPreviewIndex = v; },
    get searchGlowIndices() { return mockState.searchGlowIndices; },
    set searchGlowIndices(v) { mockState.searchGlowIndices = v; },
    get searchGlowTopIndex() { return mockState.searchGlowTopIndex; },
    set searchGlowTopIndex(v) { mockState.searchGlowTopIndex = v; },
    get searchGlowActive() { return mockState.searchGlowActive; },
    set searchGlowActive(v) { mockState.searchGlowActive = v; },
    get currentEmptyQuery() { return mockState.currentEmptyQuery; },
    set currentEmptyQuery(v) { mockState.currentEmptyQuery = v; },
    get searchFocusTransitionToken() { return mockState.searchFocusTransitionToken; },
    set searchFocusTransitionToken(v) { mockState.searchFocusTransitionToken = v; },
    get semanticTrailCue() { return mockState.semanticTrailCue; },
    set semanticTrailCue(v) { mockState.semanticTrailCue = v; },
    get isCompactViewport() { return mockState.isCompactViewport; },
    set isCompactViewport(v) { mockState.isCompactViewport = v; },
    get semanticGuideRequestSequence() { return mockState.semanticGuideRequestSequence; },
    set semanticGuideRequestSequence(v) { mockState.semanticGuideRequestSequence = v; },
    get currentSemanticGuide() { return mockState.currentSemanticGuide; },
    set currentSemanticGuide(v) { mockState.currentSemanticGuide = v; },
    get summaryCardTypeToken() { return mockState.summaryCardTypeToken; },
    set summaryCardTypeToken(v) { mockState.summaryCardTypeToken = v; },
    withMutation: <T>(fn: () => T): T => fn()
  }
}));

vi.mock('@lib/orchestration/event-bus', () => ({
  publish: () => undefined,
  subscribe: () => () => undefined,
  EVENTS: {
    SEARCH_SUCCESS: 'search:success',
    SEARCH_EMPTY: 'search:empty',
    SEARCH_CLEARED: 'search:cleared',
    SEARCH_FOCUS_REQUESTED: 'search:focus-requested',
    URL_SYNC_REQUESTED: 'url:sync-requested'
  }
}));

// Stub out the focus and journey stores — lifecycle.ts imports both at
// module load but recordEmptySearch (the A3-2 fix subject) only touches
// search state. We provide no-op exports so the import graph resolves
// without requiring the full focus/journey snapshot machinery.
vi.mock('@lib/stores/focus.svelte', () => ({
  setSemanticDiveMode: () => undefined,
  focusStore: { subscribe: () => () => undefined, set: () => undefined, update: () => undefined },
  resetFocus: () => undefined
}));

vi.mock('@lib/stores/journey.svelte', () => ({
  resetJourney: () => undefined,
  setTrailDepth: () => undefined,
  journeyStore: { subscribe: () => () => undefined, set: () => undefined, update: () => undefined }
}));

// Import the store AFTER the mock is set up so it sees the stubbed appState.
import { setSearchResults, setSearchQuery, searchStore } from '@lib/stores/search';
import { recordEmptySearch } from '@lib/stores/lifecycle';

interface WritableSnapshot {
  summary: {
    query: string;
    resultCount: number;
    resultIndices: number[];
  } | null;
  currentEmptyQuery: string | null;
}

/**
 * Subscribe to the writable and read the latest emitted state.
 *
 * The actual A3-2 contract: `$searchState` in SearchResults.svelte auto-
 * subscribes to `_searchWritable` (the underlying writable that
 * `searchStore` exports). `recordEmptySearch` mutates the writable via
 * `searchStore.update(...)`, so we must observe the writable's emitted
 * state — not the callable form, which reads from `appState` directly
 * and may diverge.
 */
function readWritable(): WritableSnapshot {
  let last: WritableSnapshot = { summary: null, currentEmptyQuery: null };
  const unsub = searchStore.subscribe((s: unknown) => {
    const w = s as WritableSnapshot;
    last = {
      summary: w.summary ? { ...w.summary } : null,
      currentEmptyQuery: w.currentEmptyQuery ?? null
    };
  });
  unsub();
  return last;
}

describe('A3-2: search empty-state regression', () => {
  beforeEach(() => {
    mockState.currentSearchSummary = null;
    mockState.navState.focusedIndex = null;
    mockState.navState.mode = 'idle';
    mockState.navState.trailDepth = 0;
    mockState.navState.trailCursor = 0;
    mockState.navState.walkHistoryIndices = [];
    mockState.navState.walkHistoryPointers = [];
    mockState.navState.trailNeighborIndices = [];
    mockState.navState.focusPocketIndices = [];
    mockState.navState.focusPocketMeta = null;
    mockState.navState.focusPocketRoleByIndex = [];
    mockState.navState.pendingFocus = null;
    mockState.searchStatus = 'idle';
    mockState.searchRequestSequence = 0;
    mockState.searchAnchorIndex = null;
    mockState.searchPreviewIndex = null;
    mockState.searchGlowIndices = new Set();
    mockState.searchGlowTopIndex = null;
    mockState.searchGlowActive = false;
    mockState.currentEmptyQuery = null;
    mockState.searchFocusTransitionToken = 0;
    mockState.semanticTrailCue = 'idle';
    mockState.isCompactViewport = false;
    mockState.semanticGuideRequestSequence = 0;
    mockState.currentSemanticGuide = null;
    mockState.summaryCardTypeToken = 0;
  });

  // ── The actual A3-2 regression guard ──────────────────────────────────────
  it('recordEmptySearch preserves the empty-result summary (A3-2 regression guard)', () => {
    // Mimic the runSearch path: setSearchQuery + setSearchResults([])
    // populate the empty-result summary on the writable.
    setSearchQuery('xyz');
    setSearchResults([]);

    // Sanity: the populated empty-result summary must be present BEFORE
    // recordEmptySearch fires (this is the state that should survive).
    const before = readWritable();
    expect(before.summary).not.toBeNull();
    expect(before.summary?.query).toBe('xyz');
    expect(before.summary?.resultCount).toBe(0);
    expect(before.summary?.resultIndices).toEqual([]);

    // Now fire recordEmptySearch — this is the SEARCH_EMPTY trigger that
    // the A3-2 fix protects against clobbering the summary.
    recordEmptySearch('xyz');

    // The writable's summary must NOT be nullified by recordEmptySearch.
    // Pre-fix, `searchStore.update(s => ({...s, summary: null}))` would
    // clobber it; post-fix, only `currentEmptyQuery` is updated.
    const after = readWritable();
    expect(after.summary).not.toBeNull();
    expect(after.summary?.query).toBe('xyz');
    expect(after.summary?.resultCount).toBe(0);
    expect(after.summary?.resultIndices).toEqual([]);

    // currentEmptyQuery is still updated for downstream consumers.
    expect(after.currentEmptyQuery).toBe('xyz');
  });

  it('recordEmptySearch updates currentEmptyQuery even when summary is preserved', () => {
    setSearchQuery('abc');
    setSearchResults([]);

    recordEmptySearch('abc');
    const snap = readWritable();
    expect(snap.currentEmptyQuery).toBe('abc');
    expect(snap.summary).not.toBeNull();
  });

  it('recordEmptySearch with no query argument still preserves summary', () => {
    setSearchQuery('def');
    setSearchResults([]);

    // Pass undefined — the function defaults the query to null and must
    // still not clobber the summary.
    recordEmptySearch();

    const snap = readWritable();
    expect(snap.summary).not.toBeNull();
    expect(snap.summary?.query).toBe('def');
    expect(snap.currentEmptyQuery).toBeNull();
  });

  // ── Notify path: the writable subscriber path that SearchResults.svelte uses
  it('subscribers of the writable see the populated summary after recordEmptySearch (A3-2 guard)', () => {
    setSearchQuery('ghi');
    setSearchResults([]);

    // Capture the most recent notification after the lifecycle action.
    let lastSummary: unknown = 'sentinel';
    const unsub = searchStore.subscribe((s: unknown) => {
      lastSummary = (s as WritableSnapshot).summary;
    });

    // Sanity: initial subscribe delivers current state, which must be populated.
    expect(lastSummary).not.toBe('sentinel');
    expect(lastSummary).not.toBeNull();

    recordEmptySearch('ghi');

    // After the lifecycle action, the writable's summary must still be
    // populated. Pre-fix this would have been null.
    expect(lastSummary).not.toBeNull();

    unsub();
  });
});
