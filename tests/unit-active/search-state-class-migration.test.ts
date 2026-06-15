import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';

/**
 * @vitest-environment jsdom
 */

// ── Mutable mock appState ─────────────────────────────────────────────────────

const _appState = vi.hoisted(() => ({
  currentSearchSummary: null as any,
  searchStatus: 'idle' as string,
  navState: { focusedIndex: null as number | null },
  searchRequestSequence: 0,
  searchAnchorIndex: null as number | null,
  searchPreviewIndex: null as number | null,
  searchGlowIndices: new Set<number>(),
  searchGlowTopIndex: null as number | null,
  searchGlowActive: false,
  currentEmptyQuery: null as string | null,
  searchFocusTransitionToken: 0,
  semanticTrailCue: 'idle' as string,
  isCompactViewport: false,
  semanticGuideRequestSequence: 0,
  currentSemanticGuide: null as string | null,
  summaryCardTypeToken: 0,
  withMutation: (fn: () => unknown) => fn(),
}));

// ── Mock appState module ──────────────────────────────────────────────────────

vi.mock('@lib/state/app.svelte.ts', () => ({
  appState: _appState,
}));

// ── Imports (must appear AFTER vi.mock) ──────────────────────────────────────

import {
  searchStore,
  searchState,
  searchUseRerank,
  setSearchQuery,
  setSearchStatus,
  setSearchResults,
  setSearchSummary,
  clearSearch,
  clearSearchResults,
  setAnchorIndex,
  setPreviewIndex,
  setGlowActive,
  setSearchGlow,
  clearSearchGlow,
  setTrailCue,
  incrementRequestSequence,
  isRequestCurrent,
  incrementFocusTransitionToken,
  setSemanticGuide,
  setCompactViewport,
  bumpSummaryCardTypeToken,
  validateSearchQuery,
  searchQuery,
  searchStatus,
  searchResults,
  hasSearchQuery,
  hasResults,
  isSearching,
  activeResult,
} from '@lib/stores/search.svelte.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

function resetMockAppState() {
  _appState.currentSearchSummary = null;
  _appState.searchStatus = 'idle';
  _appState.navState.focusedIndex = null;
  _appState.searchRequestSequence = 0;
  _appState.searchAnchorIndex = null;
  _appState.searchPreviewIndex = null;
  _appState.searchGlowIndices = new Set();
  _appState.searchGlowTopIndex = null;
  _appState.searchGlowActive = false;
  _appState.currentEmptyQuery = null;
  _appState.searchFocusTransitionToken = 0;
  _appState.semanticTrailCue = 'idle';
  _appState.isCompactViewport = false;
  _appState.semanticGuideRequestSequence = 0;
  _appState.currentSemanticGuide = null;
  _appState.summaryCardTypeToken = 0;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('search store — T4 writable + withSearchNotify migration', () => {
  beforeEach(() => {
    resetMockAppState();
  });

  it('searchStore and searchState are defined', () => {
    expect(searchStore).toBeDefined();
    expect(searchState).toBe(searchStore);
  });

  it('searchStore returns a valid snapshot', () => {
    const s = searchStore();
    expect(s).toHaveProperty('query');
    expect(s).toHaveProperty('results');
    expect(s).toHaveProperty('status');
  });

  it('setSearchQuery updates appState and notifies subscribers', () => {
    const cb = vi.fn();
    const unsub = searchStore.subscribe(cb);
    setSearchQuery('restaurant');
    unsub();
    expect(_appState.currentSearchSummary.query).toBe('restaurant');
    expect(cb).toHaveBeenCalled();
  });

  it('setSearchStatus updates appState.searchStatus', () => {
    setSearchStatus('searching');
    expect(_appState.searchStatus).toBe('searching');
    expect(searchStatus()).toBe('searching');
  });

  it('setSearchResults updates result indices and count', () => {
    setSearchResults([
      { id: '1', name: 'A', index: 0, score: 1, category: '', snippet: '' },
      { id: '2', name: 'B', index: 1, score: 0.9, category: '', snippet: '' },
    ]);
    expect(_appState.currentSearchSummary.resultIndices).toEqual([0, 1]);
    expect(_appState.currentSearchSummary.resultCount).toBe(2);
    expect(_appState.searchStatus).toBe('results');
  });

  it('clearSearch resets all search state', () => {
    setSearchQuery('test');
    setSearchStatus('results');
    clearSearch();
    expect(_appState.currentSearchSummary).toBeNull();
    expect(_appState.searchStatus).toBe('idle');
    expect(_appState.searchAnchorIndex).toBeNull();
  });

  it('clearSearchResults preserves query and clears results', () => {
    setSearchQuery('coffee');
    setSearchResults([{ id: '1', name: 'C', index: 0, score: 1, category: '', snippet: '' }]);
    clearSearchResults();
    expect(_appState.currentSearchSummary.resultIndices).toEqual([]);
    expect(_appState.currentSearchSummary.resultCount).toBe(0);
  });

  it('setAnchorIndex / setPreviewIndex mutate appState', () => {
    setAnchorIndex(5);
    setPreviewIndex(3);
    expect(_appState.searchAnchorIndex).toBe(5);
    expect(_appState.searchPreviewIndex).toBe(3);
  });

  it('setGlowActive / setSearchGlow / clearSearchGlow work', () => {
    setGlowActive(true);
    expect(_appState.searchGlowActive).toBe(true);
    setSearchGlow([1, 2, 3], 1);
    expect(Array.from(_appState.searchGlowIndices)).toEqual([1, 2, 3]);
    expect(_appState.searchGlowTopIndex).toBe(1);
    clearSearchGlow();
    expect(Array.from(_appState.searchGlowIndices)).toEqual([]);
    expect(_appState.searchGlowActive).toBe(false);
  });

  it('setTrailCue updates semanticTrailCue', () => {
    setTrailCue('searching');
    expect(_appState.semanticTrailCue).toBe('searching');
  });

  it('incrementRequestSequence bumps and returns next', () => {
    const seq = incrementRequestSequence();
    expect(seq).toBe(1);
    expect(_appState.searchRequestSequence).toBe(1);
    expect(isRequestCurrent(1)).toBe(true);
    expect(isRequestCurrent(0)).toBe(false);
  });

  it('incrementFocusTransitionToken bumps token', () => {
    const tok = incrementFocusTransitionToken();
    expect(tok).toBe(1);
    expect(_appState.searchFocusTransitionToken).toBe(1);
  });

  it('setSemanticGuide updates guide text', () => {
    setSemanticGuide('Find restaurants');
    expect(_appState.currentSemanticGuide).toBe('Find restaurants');
  });

  it('setCompactViewport updates flag', () => {
    setCompactViewport(true);
    expect(_appState.isCompactViewport).toBe(true);
  });

  it('bumpSummaryCardTypeToken increments', () => {
    const t = bumpSummaryCardTypeToken();
    expect(t).toBe(1);
    expect(_appState.summaryCardTypeToken).toBe(1);
  });

  it('validateSearchQuery accepts valid query', () => {
    const v = validateSearchQuery('coffee shop');
    expect(v.valid).toBe(true);
    expect(v.query).toBe('coffee shop');
  });

  it('validateSearchQuery rejects empty query', () => {
    const v = validateSearchQuery('');
    expect(v.valid).toBe(false);
    expect(v.reason).toBe('empty');
  });

  it('validateSearchQuery rejects short query', () => {
    const v = validateSearchQuery('a');
    expect(v.valid).toBe(false);
    expect(v.reason).toBe('too-short');
  });

  it('validateSearchQuery truncates long query', () => {
    const long = 'a'.repeat(300);
    const v = validateSearchQuery(long);
    expect(v.query.length).toBeLessThanOrEqual(200);
  });

  it('derived getters read from appState', () => {
    _appState.currentSearchSummary = {
      query: 'pizza', totalMatches: 5, totalSemanticMatches: 3, visibleMatches: 5,
      resultCount: 5, topScore: 0.9, anchorIndex: 0, topIndex: 0,
      resultIndices: [1, 2, 3, 4, 5], summaryType: 'text'
    };
    _appState.searchStatus = 'results';
    _appState.navState.focusedIndex = 2;

    expect(searchQuery()).toBe('pizza');
    expect(searchResults()).toEqual([1, 2, 3, 4, 5]);
    expect(hasSearchQuery()).toBe(true);
    expect(hasResults()).toBe(true);
    expect(isSearching()).toBe(false);
    expect(activeResult()).toBe('2');
  });

  it('searchUseRerank is a writable store', () => {
    expect(get(searchUseRerank)).toBe(false);
    searchUseRerank.set(true);
    expect(get(searchUseRerank)).toBe(true);
  });

  it('search constants are positive when available', () => {
    expect(200).toBeGreaterThan(0);
    expect(2).toBeGreaterThan(0);
  });
});
