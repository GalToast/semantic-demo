/**
 * @lib/stores/search.svelte.ts — Search engine, tokenization, and result state store (Svelte 5 runes)
 */
import type { SearchState, SearchResult, SearchSummary, SearchStatus } from '@lib/types/state';
import { get, type Readable, type Subscriber, type Unsubscriber, toStore, writable } from 'svelte/store';
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

/** Reactive binding to the Svelte 5 state kernel. */
const _searchWritable = toStore(
  () => ({
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
  }),
  (val) => appState.withMutation(() => {
    if (appState.currentSearchSummary) {
      appState.currentSearchSummary.query = val.query;
      if (val.summary) {
        appState.currentSearchSummary.resultCount = val.summary.resultCount;
        appState.currentSearchSummary.topScore = val.summary.topScore;
        appState.currentSearchSummary.summaryType = val.summary.summaryType;
      }
    }
    appState.searchRequestSequence = val.requestSequence;
    appState.searchAnchorIndex = val.anchorIndex;
    appState.searchPreviewIndex = val.previewIndex;
    appState.searchGlowIndices = val.glowIndices;
    appState.searchGlowTopIndex = val.glowTopIndex;
    appState.searchGlowActive = val.glowActive;
    appState.currentEmptyQuery = val.currentEmptyQuery;
    appState.searchFocusTransitionToken = val.focusTransitionToken;
    appState.searchStatus = val.status;
    appState.isCompactViewport = val.isCompactViewport;
    appState.semanticGuideRequestSequence = val.semanticGuideRequestSequence;
    appState.currentSemanticGuide = val.currentSemanticGuide;
    appState.summaryCardTypeToken = val.summaryCardTypeToken;
    appState.semanticTrailCue = val.trailCue;
  })
);

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

/** Returns the current search summary, or null. */
export function getSearchSummary(): SearchSummary | null {
  if (appState.currentSearchSummary) return appState.currentSearchSummary as SearchSummary;
  const testState = testCompatStore();
  // @ts-ignore
  return (testState?.searchState?.summary as SearchSummary) ?? null;
}

// ── Actions ──────────────────────────────────────────────────────────────────

export function setSearchQuery(query: string): void {
  appState.withMutation(() => {
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
  appState.withMutation(() => { appState.searchStatus = status; });
}

export function setSearchSummary(summary: SearchSummary | null): void {
  appState.withMutation(() => {
    appState.currentSearchSummary = summary as any;
    if (summary) appState.searchStatus = 'results';
  });
}

export function setAnchorIndex(index: number | null): void {
  appState.withMutation(() => { appState.searchAnchorIndex = index; });
}

export function setPreviewIndex(index: number | null): void {
  appState.withMutation(() => { appState.searchPreviewIndex = index; });
}

export function setGlowIndices(indices: Set<number>): void {
  appState.withMutation(() => { appState.searchGlowIndices = indices; });
}

export function setGlowActive(active: boolean): void {
  appState.withMutation(() => { appState.searchGlowActive = active; });
}

export function setSearchGlow(indices: readonly number[], topIndex: number | null = indices[0] ?? null): void {
  appState.withMutation(() => {
    appState.searchGlowIndices = new Set(indices);
    appState.searchGlowTopIndex = topIndex;
    appState.searchGlowActive = indices.length > 0;
  });
}

export function clearSearchGlow(): void {
  appState.withMutation(() => {
    appState.searchGlowIndices = new Set();
    appState.searchGlowTopIndex = null;
    appState.searchGlowActive = false;
  });
}

export function setTrailCue(cue: SearchStoreState['trailCue']): void {
  appState.withMutation(() => { appState.semanticTrailCue = cue; });
}

export function incrementRequestSequence(): number {
  let next = 0;
  appState.withMutation(() => {
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
  appState.withMutation(() => {
    appState.searchFocusTransitionToken += 1;
    next = appState.searchFocusTransitionToken;
  });
  return next;
}

export function setSemanticGuide(text: string | null): void {
  appState.withMutation(() => { appState.currentSemanticGuide = text; });
}

export function setCompactViewport(value: boolean): void {
  appState.withMutation(() => { appState.isCompactViewport = value; });
}

export function bumpSummaryCardTypeToken(): number {
  let next = 0;
  appState.withMutation(() => {
    appState.summaryCardTypeToken += 1;
    next = appState.summaryCardTypeToken;
  });
  return next;
}

export function clearSearch(): void {
  appState.withMutation(() => {
    appState.currentSearchSummary = null;
    appState.searchStatus = 'idle';
    appState.searchAnchorIndex = null;
    appState.searchPreviewIndex = null;
    appState.searchGlowIndices = new Set();
    appState.searchGlowActive = false;
  });
}

export function setActiveResult(id: string | null): void {
  appState.withMutation(() => {
    appState.navState.focusedIndex = id ? Number(id) : null;
  });
}

export function setSearchVisibleCount(n: number): void {
  // Compatibility placeholder
}

export function setSearchResults(results: SearchResult[]): void {
  appState.withMutation(() => {
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
