/**
 * @lib/stores/search.svelte.ts — Search engine, tokenization, and result state store (Svelte 5 runes)
 *
 * Replaces:
 *   - js/modules/search-state.js (state management + orchestration)
 *   - js/modules/search-tokenizer.js (tokenization logic)
 *   - Search slices from js/state.js
 *
 * The search store owns the query, results, active result, and search lifecycle.
 * The actual search API calls live in the engine bridge; this store manages
 * the Svelte-side truth for search state.
 */
import type { SearchState, SearchResult, SearchSummary, SearchStatus } from '@lib/types/state';
import { writable, get, type Readable, type Subscriber, type Unsubscriber } from 'svelte/store';
import {
  tokenizeSearchText as tokenizeRaw,
  expandSearchIntent as expandRaw,
  countTokenMatches as countRaw,
  SEARCH_STOP_WORDS,
  type IntentExpansion,
  type TokenMatchResult
} from '@lib/search/tokenizer';
import { testCompatStore } from './test-compat.svelte';

// ── Re-export tokenizer functions (typed, no `any`) ──────────────────────────

export { tokenizeRaw as tokenizeSearchText, expandRaw as expandSearchIntent, countRaw as countTokenMatches };
export { SEARCH_STOP_WORDS };
export type { IntentExpansion, TokenMatchResult };

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_QUERY_LENGTH = 200;
const MIN_QUERY_LENGTH = 2;

// ── Initial State ────────────────────────────────────────────────────────────

const INITIAL_SEARCH_STATE: SearchState = {
  query: '',
  results: [],
  activeResultId: null,
  summary: null,
  status: 'idle',
  hasQuery: false,
  resultsRendered: false,
  degraded: false
};

// ── Extended Search Store ────────────────────────────────────────────────────

export interface SearchStoreState extends SearchState {
  /** Request sequence number (for cancelling stale requests). */
  requestSequence: number;
  /** Anchor index of the search results. */
  anchorIndex: number | null;
  /** Preview index (hovered result). */
  previewIndex: number | null;
  /** Indices that are glowing in the field. */
  glowIndices: Set<number>;
  /** Top glow index (first result). */
  glowTopIndex: number | null;
  /** Whether search glow is active. */
  glowActive: boolean;
  /** Search focus transition token (monotonically increasing). */
  focusTransitionToken: number;
  /** Semantic trail cue state. */
  trailCue: 'idle' | 'searching' | 'focusing';
  /** Whether search input is compact viewport. */
  isCompactViewport: boolean;
  /** Semantic guide abort controller (for cancelling guide requests). */
  semanticGuideRequestSequence: number;
  /** Current semantic guide text. */
  currentSemanticGuide: string | null;
  /** Summary card type token (for re-rendering). */
  summaryCardTypeToken: number;
}

// ── Store ────────────────────────────────────────────────────────────────────

const _searchWritable = writable<SearchStoreState>({
  ...INITIAL_SEARCH_STATE,
  requestSequence: 0,
  anchorIndex: null,
  previewIndex: null,
  glowIndices: new Set(),
  glowTopIndex: null,
  glowActive: false,
  focusTransitionToken: 0,
  trailCue: 'idle',
  isCompactViewport: false,
  semanticGuideRequestSequence: 0,
  currentSemanticGuide: null,
  summaryCardTypeToken: 0
});

// ── SearchStore API ─────────────────────────────────────────────────────────
// searchStore is a hybrid: satisfies Readable<SearchStoreState> + .update()/.set()
// for .ts orchestration consumers, while exposing state properties as getters
// so callers can use searchStore.status, searchStore.results, etc. directly.

/** SearchStore type: Readable + state properties + Writable-ish for svelte/store compatibility. */
export type SearchStoreApi = Readable<SearchStoreState> & SearchStoreState & {
  update(fn: (s: SearchStoreState) => SearchStoreState): void;
  set(value: SearchStoreState): void;
};

function _createSearchStore(): SearchStoreApi {
  const stateKeys = [
    'query', 'results', 'activeResultId', 'summary', 'status',
    'hasQuery', 'resultsRendered', 'degraded',
    'requestSequence', 'anchorIndex', 'previewIndex', 'glowIndices',
    'glowTopIndex', 'glowActive', 'focusTransitionToken', 'trailCue',
    'isCompactViewport', 'semanticGuideRequestSequence',
    'currentSemanticGuide', 'summaryCardTypeToken'
  ] as const;

  const api: Record<string, unknown> = {
    subscribe: (listener: Subscriber<SearchStoreState>): Unsubscriber => {
      return _searchWritable.subscribe(listener);
    },
    update: (updater: (s: SearchStoreState) => SearchStoreState): void => {
      _searchWritable.update(updater);
    },
    set: (value: SearchStoreState): void => {
      _searchWritable.set(value);
    }
  };

  // Create getter for each state property — reads snapshot from the writable
  for (const key of stateKeys) {
    Object.defineProperty(api, key, {
      get() {
        let snapshot: SearchStoreState | undefined;
        const unsub = _searchWritable.subscribe(v => { snapshot = v; });
        unsub();
        return (snapshot as any)?.[key];
      },
      enumerable: true,
      configurable: true
    });
  }

  return api as unknown as SearchStoreApi;
}

/** Single reactive instance of the search state. */
export const searchStore: SearchStoreApi = _createSearchStore();

/** Backwards-compatible alias. */
export const searchState: SearchStoreApi = searchStore;

/** Visible count of search results (for "Show more" pagination). */
const _searchVisibleCountWritable = writable(10);
export const searchVisibleCount = () => get(_searchVisibleCountWritable);
export const setSearchVisibleCount = (count: number) => { _searchVisibleCountWritable.set(count); };

// ── Derived Getters ──────────────────────────────────────────────────────────

export const hasResults = () => get(_searchWritable).results.length > 0;
export const activeResult = () => {
  const state = get(_searchWritable);
  return state.results.find((r: SearchResult) => r.id === state.activeResultId) ?? null;
};
export const isSearching = () => get(_searchWritable).status === 'searching';
export const searchQuery = () => get(_searchWritable).query;

export function searchStatus(): SearchStatus {
  const state = get(_searchWritable);
  if (state.status !== 'idle') return state.status;
  const testState = testCompatStore();
  if (testState.loadingPhase === 'searching') return 'searching';
  if (testState.loadingPhase === 'error') return 'error';
  if (testState.loadingPhase === 'empty') return 'empty';
  return 'idle';
}

export function searchSummary(): SearchSummary | null {
  const state = get(_searchWritable);
  if (state.summary) return state.summary;
  const testState = testCompatStore();
  if (testState.loadingPhase === 'results') {
    return { query: '', resultCount: 0, resultIndices: [], topScore: 0, anchorIndex: null, summaryType: 'semantic' };
  }
  return null;
}

export const searchAnchorIndex = () => get(_searchWritable).anchorIndex;
export const searchGlowActive = () => get(_searchWritable).glowActive;

// ── Query Validation ─────────────────────────────────────────────────────────

/** Validate a search query. Returns null if valid, or an error message. */
export function validateSearchQuery(query: string): string | null {
  const trimmed = query.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length < MIN_QUERY_LENGTH) return `Type at least ${MIN_QUERY_LENGTH} characters to search`;
  if (trimmed.length > MAX_QUERY_LENGTH) return 'Search query is too long. Try a shorter phrase.';
  return null;
}

// ── Actions: Query ───────────────────────────────────────────────────────────

/** Set the search query string. */
export function setSearchQuery(query: string): void {
  _searchWritable.update(s => ({ ...s, query, hasQuery: query.length > 0 }));
}

// ── Actions: Results ─────────────────────────────────────────────────────────

/** Set search results. */
export function setSearchResults(results: readonly SearchResult[]): void {
  const hasResults = results.length > 0;
  _searchWritable.update(s => ({ ...s, results, status: hasResults ? 'results' : 'empty', resultsRendered: hasResults }));
}

/** Set the search status. */
export function setSearchStatus(status: SearchStatus): void {
  _searchWritable.update(s => ({ ...s, status }));
}

/** Set the active (selected) result. */
export function setActiveResult(id: string | null): void {
  _searchWritable.update(s => ({ ...s, activeResultId: id }));
}

/** Set the search summary. */
export function setSearchSummary(summary: SearchSummary | null): void {
  _searchWritable.update(s => ({ ...s, summary, status: summary ? 'results' : s.status }));
}

// ── Actions: Glow ────────────────────────────────────────────────────────────

/** Set the glow indices and activate search glow. */
export function setSearchGlow(indices: number[], topIndex: number | null = null): void {
  _searchWritable.update(s => ({
    ...s,
    glowIndices: new Set(indices),
    glowTopIndex: topIndex ?? indices[0] ?? null,
    glowActive: indices.length > 0
  }));
}

/** Clear search glow. */
export function clearSearchGlow(): void {
  _searchWritable.update(s => ({ ...s, glowIndices: new Set(), glowTopIndex: null, glowActive: false }));
}

// ── Actions: Preview ─────────────────────────────────────────────────────────

/** Set the preview index (hovered result). */
export function setSearchPreview(index: number | null): void {
  _searchWritable.update(s => ({ ...s, previewIndex: index }));
}

// ── Actions: Trail Cue ───────────────────────────────────────────────────────

/** Set the semantic trail cue state. */
export function setTrailCue(cue: SearchStoreState['trailCue']): void {
  _searchWritable.update(s => ({ ...s, trailCue: cue }));

  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.semanticTrailCue = cue;
  }
}

// ── Actions: Request Lifecycle ───────────────────────────────────────────────

/** Increment the request sequence (cancels stale requests). */
export function incrementRequestSequence(): number {
  let result = 0;
  _searchWritable.update(s => {
    const next = s.requestSequence + 1;
    result = next;
    return { ...s, requestSequence: next };
  });
  return result;
}

/** Check if the given sequence is still current. */
export function isRequestCurrent(sequence: number): boolean {
  return get(_searchWritable).requestSequence === sequence;
}

/** Increment the focus transition token. */
export function incrementFocusTransitionToken(): number {
  let result = 0;
  _searchWritable.update(s => {
    const next = s.focusTransitionToken + 1;
    result = next;
    return { ...s, focusTransitionToken: next };
  });
  return result;
}

// ── Actions: Semantic Guide ──────────────────────────────────────────────────

/** Set the current semantic guide text. */
export function setSemanticGuide(guide: string | null): void {
  _searchWritable.update(s => ({
    ...s,
    currentSemanticGuide: guide,
    semanticGuideRequestSequence: s.semanticGuideRequestSequence + 1
  }));
}

// ── Actions: Degraded State ──────────────────────────────────────────────────

/** Set the search as degraded (API failure). */
export function setDegraded(degraded: boolean): void {
  _searchWritable.update(s => ({ ...s, degraded }));
}

// ── Actions: Compact Viewport ────────────────────────────────────────────────

/** Set whether the search viewport is compact. */
export function setCompactViewport(compact: boolean): void {
  _searchWritable.update(s => ({ ...s, isCompactViewport: compact }));
}

// ── Actions: Summary Card ────────────────────────────────────────────────────

/** Bump the summary card type token (triggers re-render). */
export function bumpSummaryCardTypeToken(): void {
  _searchWritable.update(s => ({ ...s, summaryCardTypeToken: s.summaryCardTypeToken + 1 }));
}

// ── Full Clear ───────────────────────────────────────────────────────────────

/** Clear all search state (full reset). */
export function clearSearch(): void {
  _searchWritable.set({
    ...INITIAL_SEARCH_STATE,
    requestSequence: 0,
    anchorIndex: null,
    previewIndex: null,
    glowIndices: new Set(),
    glowTopIndex: null,
    glowActive: false,
    focusTransitionToken: 0,
    trailCue: 'idle',
    isCompactViewport: false,
    semanticGuideRequestSequence: 0,
    currentSemanticGuide: null,
    summaryCardTypeToken: 0
  });
}

/** Clear search results but preserve the query. */
export function clearSearchResults(): void {
  _searchWritable.update(s => ({
    ...s,
    results: [],
    activeResultId: null,
    summary: null,
    status: 'idle',
    resultsRendered: false,
    anchorIndex: null,
    previewIndex: null,
    glowIndices: new Set(),
    glowTopIndex: null,
    glowActive: false
  }));
}

// ── Semantic Search Service Helpers ──────────────────────────────────────────

/**
 * Map raw semantic search service results to typed SearchResult[].
 * Pure function — no store dependency.
 */
export function mapSemanticSearchResults(
  serviceResults: Array<{
    index: number;
    name?: string;
    score?: number;
    category?: string;
    snippet?: string;
    lead_id?: string;
    id?: string;
  }>
): SearchResult[] {
  return serviceResults.map((r) => ({
    id: String(r.id ?? r.lead_id ?? r.index),
    name: String(r.name ?? 'Unknown'),
    index: Number(r.index),
    score: Number(r.score ?? 0),
    category: String(r.category ?? ''),
    snippet: String(r.snippet ?? '')
  }));
}

/**
 * Compute the total matches from a service payload.
 * Pure function — no store dependency.
 */
export function getSemanticSearchTotalMatches(
  payload: { total?: number; count?: number } | null,
  results: readonly SearchResult[]
): number {
  if (payload?.total !== undefined) return Number(payload.total);
  if (payload?.count !== undefined) return Number(payload.count);
  return results.length;
}

/**
 * Extract service results from the payload.
 * Pure function — no store dependency.
 */
export function getSemanticSearchServiceResults(
  payload: { results?: unknown[]; data?: unknown[] } | null
): Array<Record<string, unknown>> {
  if (!payload) return [];
  const raw = (payload.results ?? payload.data ?? []) as unknown[];
  return raw.filter(Boolean) as Array<Record<string, unknown>>;
}
