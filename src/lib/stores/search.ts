/**
 * @lib/stores/search.ts — Search state store
 *
 * Replaces the search slice from state.js.
 */
import { writable, derived } from 'svelte/store';
import type { SearchState, SearchResult, SearchSummary, SearchStatus } from '@lib/types/state';

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

export const searchState = writable<SearchState>({ ...INITIAL_SEARCH_STATE });

// ── Derived convenience stores ────────────────────────────────────────────────

export const hasResults = derived(searchState, ($s) => $s.results.length > 0);
export const activeResult = derived(searchState, ($s) =>
  $s.results.find((r) => r.id === $s.activeResultId) ?? null
);
export const isSearching = derived(searchState, ($s) => $s.status === 'searching');
export const searchQuery = derived(searchState, ($s) => $s.query);
export const searchStatus = derived(searchState, ($s) => $s.status);
export const searchSummary = derived(searchState, ($s) => $s.summary);

// ── Actions ───────────────────────────────────────────────────────────────────

export function setSearchQuery(query: string): void {
  searchState.update((s) => ({
    ...s,
    query,
    hasQuery: query.length > 0
  }));
}

export function setSearchResults(results: readonly SearchResult[]): void {
  searchState.update((s) => ({
    ...s,
    results,
    status: results.length > 0 ? 'results' : 'empty',
    resultsRendered: results.length > 0
  }));
}

export function setSearchStatus(status: SearchStatus): void {
  searchState.update((s) => ({ ...s, status }));
}

export function setActiveResult(id: string | null): void {
  searchState.update((s) => ({ ...s, activeResultId: id }));
}

export function setSearchSummary(summary: SearchSummary | null): void {
  searchState.update((s) => ({
    ...s,
    summary,
    status: summary ? 'results' : s.status
  }));
}

export function clearSearch(): void {
  searchState.set({ ...INITIAL_SEARCH_STATE });
}
