/**
 * @lib/stores/search.svelte.ts — Search engine, tokenization, and result state store (Svelte 5 runes)
 */
import type { SearchState, SearchResult, SearchSummary, SearchStatus } from '@lib/types/state';
import { type Readable, writable } from 'svelte/store';
import {
  tokenizeSearchText as tokenizeRaw,
  expandSearchIntent as expandRaw,
  countTokenMatches as countRaw,
  SEARCH_STOP_WORDS,
  type IntentExpansion,
  type TokenMatchResult
} from '@lib/search/tokenizer';
import { testCompatStore } from './test-compat.svelte';
import { performSearch } from '@lib/search-engine';
import { appState } from '@lib/state/app.svelte.ts';
import { publish, EVENTS } from '@lib/orchestration/event-bus';

// ── Rerank Feature Flag ─────────────────────────────────────────────────────

/**
 * A/B test toggle for NIM rerank. Off by default.
 */
export const searchUseRerank = writable(false);

// ── Re-export tokenizer functions ───────────────────────────────────────────

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
  /** Last empty query recorded. */
  currentEmptyQuery: string | null;
  /** Search focus transition token. */
  focusTransitionToken: number;
  /** Semantic trail cue state. */
  trailCue: 'idle' | 'searching' | 'focusing';
  /** Whether search input is compact viewport. */
  isCompactViewport: boolean;
  /** Semantic guide abort controller. */
  semanticGuideRequestSequence: number;
  /** Current semantic guide text. */
  currentSemanticGuide: string | null;
  /** Summary card type token. */
  summaryCardTypeToken: number;
}

// ── Store ────────────────────────────────────────────────────────────────────

/**
 * Reactive bridge to the Svelte 5 state kernel.
 *
 * Why a plain `writable` instead of `toStore(getter, setter)`:
 *   `toStore` returns the user's custom `set` as the store's `.set`, and the
 *   only path that actually notifies subscribers is the inner `render_effect`
 *   it wires up to re-run when the getter's dependencies change. That works
 *   in production (the real `appState` is a Svelte 5 `$state` class whose
 *   reads register reactive deps), but it means subscriber notifications are
 *   implicit and depend on reactivity tracking. For actions like
 *   `setSearchResults` that fire during synchronous URL→input→results
 *   hydration, we want explicit, deterministic notification that does not
 *   rely on the render_effect picking up the change. A plain `writable` does
 *   exactly that: `withSearchNotify` reads a fresh snapshot after every
 *   `appState` mutation and calls `_searchWritable.set(fresh)`, which goes
 *   through `safe_not_equal` and notifies every subscriber. The fresh
 *   snapshot is always a new object literal, so referential equality
 *   confirms a change.
 *
 * The callable `searchStore()` path is unaffected — it still reads from
 * `appState` directly via the snapshot getter, so callers that want a
 * current read never have to wait for a notification.
 */
const _searchWritable = writable<SearchStoreState>({
  ...INITIAL_SEARCH_STATE,
  requestSequence: 0,
  anchorIndex: null,
  previewIndex: null,
  glowIndices: new Set<number>(),
  glowTopIndex: null,
  glowActive: false,
  currentEmptyQuery: null,
  focusTransitionToken: 0,
  trailCue: 'idle',
  isCompactViewport: false,
  semanticGuideRequestSequence: 0,
  currentSemanticGuide: null,
  summaryCardTypeToken: 0
});

/** SearchStore type: callable function + Readable + actions. */
export type SearchStoreApi = (() => SearchStoreState) &
  Readable<SearchStoreState> & {
    update(fn: (s: SearchStoreState) => SearchStoreState): void;
    set(value: SearchStoreState): void;
  };

function _createSearchStore(): SearchStoreApi {
  // Function call: returns fresh sync snapshot from kernel
  const fn = (() => ({
    ...INITIAL_SEARCH_STATE,
    query: appState.currentSearchSummary?.query ?? '',
    results: (appState.currentSearchSummary?.resultIndices as any) ?? [],
    activeResultId: appState.navState.focusedIndex !== null ? String(appState.navState.focusedIndex) : null,
    summary: appState.currentSearchSummary ? { ...$state.snapshot(appState.currentSearchSummary) } : null,
    status: appState.searchStatus,
    hasQuery: (appState.currentSearchSummary?.query ?? '').length > 0,
    resultsRendered: (appState.currentSearchSummary?.resultIndices as any)?.length > 0,
    requestSequence: appState.searchRequestSequence,
    anchorIndex: appState.searchAnchorIndex,
    previewIndex: appState.searchPreviewIndex,
    glowIndices: $state.snapshot(appState.searchGlowIndices),
    glowTopIndex: appState.searchGlowTopIndex,
    glowActive: appState.searchGlowActive,
    currentEmptyQuery: appState.currentEmptyQuery,
    focusTransitionToken: appState.searchFocusTransitionToken,
    trailCue: appState.semanticTrailCue as any,
    isCompactViewport: appState.isCompactViewport,
    semanticGuideRequestSequence: appState.semanticGuideRequestSequence,
    currentSemanticGuide: appState.currentSemanticGuide as string | null,
    summaryCardTypeToken: appState.summaryCardTypeToken
  })) as unknown as SearchStoreApi;

  fn.subscribe = _searchWritable.subscribe as any;
  fn.update = _searchWritable.update as any;
  fn.set = _searchWritable.set as any;

  return fn;
}

/** Single reactive instance of the search state. */
export const searchStore: SearchStoreApi = _createSearchStore();

/** Backwards-compatible alias. */
export const searchState: SearchStoreApi = searchStore;

// ── Derived Getters ──────────────────────────────────────────────────────────

export const searchQuery = () => appState.currentSearchSummary?.query ?? '';
export const searchStatus = () => appState.searchStatus;
export const searchResults = () => appState.currentSearchSummary?.resultIndices ?? [];
export const hasSearchQuery = () => (appState.currentSearchSummary?.query ?? '').length > 0;
export const hasResults = () => (appState.currentSearchSummary?.resultIndices?.length ?? 0) > 0;
export const isSearching = () => appState.searchStatus === 'searching';
export const searchSummary = () => appState.currentSearchSummary;
export const activeResult = () => (
  appState.navState.focusedIndex !== null ? String(appState.navState.focusedIndex) : null
);

/** Returns the current search summary, or null. */
export function getSearchSummary(): SearchSummary | null {
  if (appState.currentSearchSummary) return appState.currentSearchSummary as SearchSummary;
  const testState = testCompatStore();
  // @ts-ignore
  return (testState?.searchState?.summary as SearchSummary) ?? null;
}

// ── Actions ──────────────────────────────────────────────────────────────────

/**
 * Wrap an appState mutation so the Svelte store facade wakes its subscribers.
 *
 * The `toStore(getter, setter)` bridge in this file does NOT auto-notify
 * subscribers when the underlying Svelte 5 `appState` class is mutated
 * externally. Without this wrapper, `SearchResults.svelte` and every other
 * `$searchState`-prefixed consumer stays stale after a search fires. This
 * is the A3-1 regression root cause: `?q=restaurant` updates the store
 * query, but the result list never repaints because the facade never
 * propagates the new `resultIndices` to its subscribers.
 *
 * Always prefer this over calling `appState.withMutation` directly inside
 * the action functions below.
 */
function withSearchNotify<T>(fn: () => T): T {
  const result = appState.withMutation(fn);
  // Re-read the latest snapshot through the store getter so the toStore
  // setter is bypassed (calling _searchWritable.set() recursively would
  // re-enter the toStore setter and infinite-loop).
  const fresh = (() => ({
    ...INITIAL_SEARCH_STATE,
    query: appState.currentSearchSummary?.query ?? '',
    results: (appState.currentSearchSummary?.resultIndices as any) ?? [],
    activeResultId: appState.navState.focusedIndex !== null ? String(appState.navState.focusedIndex) : null,
    summary: appState.currentSearchSummary ? { ...appState.currentSearchSummary } : null,
    status: appState.searchStatus,
    hasQuery: (appState.currentSearchSummary?.query ?? '').length > 0,
    resultsRendered: (appState.currentSearchSummary?.resultIndices as any)?.length > 0,
    requestSequence: appState.searchRequestSequence,
    anchorIndex: appState.searchAnchorIndex,
    previewIndex: appState.searchPreviewIndex,
    glowIndices: appState.searchGlowIndices instanceof Set
      ? new Set(appState.searchGlowIndices)
      : appState.searchGlowIndices,
    glowTopIndex: appState.searchGlowTopIndex,
    glowActive: appState.searchGlowActive,
    currentEmptyQuery: appState.currentEmptyQuery,
    focusTransitionToken: appState.searchFocusTransitionToken,
    trailCue: appState.semanticTrailCue as any,
    isCompactViewport: appState.isCompactViewport,
    semanticGuideRequestSequence: appState.semanticGuideRequestSequence,
    currentSemanticGuide: appState.currentSemanticGuide as string | null,
    summaryCardTypeToken: appState.summaryCardTypeToken
  }))();
  _searchWritable.set(fresh as unknown as SearchStoreState);
  return result;
}

export function setSearchQuery(query: string): void {
  withSearchNotify(() => {
    if (!appState.currentSearchSummary) {
      appState.currentSearchSummary = {
        query: '', totalMatches: 0, totalSemanticMatches: 0, visibleMatches: 0,
        resultCount: 0, topScore: 0, anchorIndex: null, topIndex: null,
        resultIndices: [], summaryType: 'text'
      };
    }
    appState.currentSearchSummary.query = query;
  });
}

export function setSearchStatus(status: SearchStatus): void {
  withSearchNotify(() => { appState.searchStatus = status; });
}

export function setSearchSummary(summary: SearchSummary | null): void {
  withSearchNotify(() => {
    appState.currentSearchSummary = summary as any;
    if (summary) appState.searchStatus = 'results';
  });
}

export function setAnchorIndex(index: number | null): void {
  withSearchNotify(() => { appState.searchAnchorIndex = index; });
}

export function setPreviewIndex(index: number | null): void {
  withSearchNotify(() => { appState.searchPreviewIndex = index; });
}

export function setGlowIndices(indices: Set<number>): void {
  withSearchNotify(() => { appState.searchGlowIndices = indices; });
}

export function setGlowActive(active: boolean): void {
  withSearchNotify(() => { appState.searchGlowActive = active; });
}

export function setSearchGlow(indices: readonly number[], topIndex: number | null = indices[0] ?? null): void {
  withSearchNotify(() => {
    appState.searchGlowIndices = new Set(indices);
    appState.searchGlowTopIndex = topIndex;
    appState.searchGlowActive = indices.length > 0;
  });
}

export function clearSearchGlow(): void {
  withSearchNotify(() => {
    appState.searchGlowIndices = new Set();
    appState.searchGlowTopIndex = null;
    appState.searchGlowActive = false;
  });
}

export function setTrailCue(cue: SearchStoreState['trailCue']): void {
  withSearchNotify(() => { appState.semanticTrailCue = cue; });
}

export function incrementRequestSequence(): number {
  let next = 0;
  withSearchNotify(() => {
    appState.searchRequestSequence += 1;
    next = appState.searchRequestSequence;
  });
  return next;
}

export function isRequestCurrent(sequence: number): boolean {
  return appState.searchRequestSequence === sequence;
}

export function incrementFocusTransitionToken(): number {
  let next = 0;
  withSearchNotify(() => {
    appState.searchFocusTransitionToken += 1;
    next = appState.searchFocusTransitionToken;
  });
  return next;
}

export function setSemanticGuide(text: string | null): void {
  withSearchNotify(() => { appState.currentSemanticGuide = text; });
}

export function setCompactViewport(value: boolean): void {
  withSearchNotify(() => { appState.isCompactViewport = value; });
}

export function bumpSummaryCardTypeToken(): number {
  let next = 0;
  withSearchNotify(() => {
    appState.summaryCardTypeToken += 1;
    next = appState.summaryCardTypeToken;
  });
  return next;
}

export function clearSearch(): void {
  withSearchNotify(() => {
    appState.currentSearchSummary = null;
    appState.searchStatus = 'idle';
    appState.searchAnchorIndex = null;
    appState.searchPreviewIndex = null;
    appState.searchGlowIndices = new Set();
    appState.searchGlowActive = false;
  });
}

/** Clear result payloads while preserving the current query text. */
export function clearSearchResults(): void {
  withSearchNotify(() => {
    if (appState.currentSearchSummary) {
      appState.currentSearchSummary.resultIndices = [];
      appState.currentSearchSummary.resultCount = 0;
      appState.currentSearchSummary.totalMatches = 0;
      appState.currentSearchSummary.totalSemanticMatches = 0;
      appState.currentSearchSummary.visibleMatches = 0;
      appState.currentSearchSummary.topScore = 0;
      appState.currentSearchSummary.anchorIndex = null;
      appState.currentSearchSummary.topIndex = null;
    }
    appState.searchStatus = (appState.currentSearchSummary?.query ?? '').trim() ? 'idle' : 'idle';
    appState.searchAnchorIndex = null;
    appState.searchPreviewIndex = null;
  });
}

/** Normalize and validate a user-entered search query. */
export function validateSearchQuery(query: string): { valid: boolean; query: string; reason?: string } {
  const normalized = String(query ?? '').trim().slice(0, MAX_QUERY_LENGTH);
  if (normalized.length === 0) return { valid: false, query: '', reason: 'empty' };
  if (normalized.length < MIN_QUERY_LENGTH) return { valid: false, query: normalized, reason: 'too-short' };
  return { valid: true, query: normalized };
}

export function setActiveResult(id: string | null): void {
  withSearchNotify(() => {
    appState.navState.focusedIndex = id ? Number(id) : null;
  });
}

export function setSearchVisibleCount(n: number): void {
  // Compatibility placeholder
}

export function setSearchResults(results: SearchResult[]): void {
  withSearchNotify(() => {
    if (!appState.currentSearchSummary) {
      appState.currentSearchSummary = {
        query: '', totalMatches: 0, totalSemanticMatches: 0, visibleMatches: 0,
        resultCount: 0, topScore: 0, anchorIndex: null, topIndex: null,
        resultIndices: [], summaryType: 'text'
      };
    }
    appState.currentSearchSummary.resultIndices = results.map(r => r.index);
    appState.currentSearchSummary.resultCount = results.length;
    appState.searchStatus = 'results';
  });
}

/**
 * Execute a search and update the store. Used by URL restoration and search input.
 */
export async function runSearch(
  query: string,
  signal: AbortSignal
): Promise<void> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    clearSearch();
    return;
  }

  setSearchQuery(trimmed);
  setSearchStatus('searching');
  incrementRequestSequence();

  try {
    const results = await performSearch(trimmed, signal);
    setSearchResults(results);
    if (results.length > 0) {
      publish(EVENTS.SEARCH_SUCCESS, { query: trimmed, count: results.length });
    } else {
      publish(EVENTS.SEARCH_EMPTY, { query: trimmed });
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    setSearchStatus('error');
  }
}

/** Utility to clean and cast search results from a service payload. */
export function castSearchResults(
  serviceResults: Array<{
    index: number | string;
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
