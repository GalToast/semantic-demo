/**
 * tests/ui-perfection-contract.mjs
 *
 * Contract test for perceptual UI improvements at the store level:
 * 1. Non-destructive skeleton loading (status transitions preserve data).
 * 2. Smart-pagination reveal (visible-count state management).
 *
 * These behaviors were previously tested via DOM-manipulation functions
 * (beginSemanticSearchUiState / finishSemanticSearchSuccessState /
 * renderSearchResultItems) that no longer exist. The UI layer is now in
 * Svelte components; this contract tests the store-level state contracts
 * that those components rely on.
 */

// ── Shim global DOM before imports (search-trail-cue-renderer references document) ──

globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  body: { dataset: {} },
  createElement: () => ({ style: {}, appendChild: () => {}, setAttribute: () => {} })
};
const _sessionStore = new Map();
globalThis.sessionStorage = {
  removeItem: (k) => { _sessionStore.delete(k); },
  getItem: (k) => _sessionStore.get(k) ?? null,
  setItem: (k, v) => { _sessionStore.set(k, String(v)); }
};
globalThis.window = { requestAnimationFrame: (cb) => cb() };

import { state, withStateMutation } from './helpers/canonical-state.mjs';
import {
  setSearchQuery,
  setSearchStatus,
  setSearchResults,
  setSearchError,
  clearSearch,
  searchState,
  searchStatus,
  searchResults,
  searchVisibleCount,
  setSearchVisibleCount,
  searchQuery,
  hasSearchQuery,
  hasResults,
  isSearching,
  getSearchSummary,
  setActiveResult,
  validateSearchQuery
} from '../src/lib/stores/search.svelte.ts';

function assert(condition, message) {
  if (!condition) throw new Error('ASSERTION FAILED: ' + message);
}

async function main() {
  console.log('================================================================');
  console.log('UI Perfection Contract (Store-Level)');
  console.log('================================================================');

  // ── Setup: initialize appState search fields ──────────────────────────────

  withStateMutation(() => {
    state.searchResults = [];
    state.searchState = {
      currentSearchSummary: null,
      searchStatus: 'idle',
      searchError: null,
      isSearching: false,
      searchRequestSequence: 0,
      searchAnchorIndex: null,
      searchPreviewIndex: null,
      searchGlowIndices: new Set(),
      searchGlowTopIndex: null,
      searchGlowActive: false,
      currentEmptyQuery: null,
      searchFocusTransitionToken: 0,
      semanticTrailCue: 'idle',
      isCompactViewport: false,
      semanticGuideRequestSequence: 0,
      currentSemanticGuide: null,
      summaryCardTypeToken: 0
    };
  });

  // ── Test 1: Non-destructive Skeleton Loading (store state transitions) ────

  console.log('[TEST] Non-destructive Skeleton Loading (store transitions)');

  // Set initial query + status (simulates user typing)
  setSearchQuery('New Query');
  assert(searchQuery() === 'New Query', 'searchQuery() should return the set query');
  assert(hasSearchQuery(), 'hasSearchQuery() should return true');

  // Set searching status — the store should report isSearching=true
  // but NOT clear the query or results
  setSearchStatus('searching');
  assert(isSearching(), 'isSearching() should return true when searching');
  assert(searchQuery() === 'New Query', 'Query should persist during searching');

  // Simulate results arriving — status transitions to 'results',
  // query preserved (non-destructive)
  const sampleResults = [
    { id: '10', name: 'Biz Alpha', index: 10, score: 1.0, category: 'Retail', snippet: 'A retail shop' },
    { id: '20', name: 'Biz Beta', index: 20, score: 0.9, category: 'Service', snippet: 'A service shop' }
  ];
  setSearchResults(sampleResults);
  assert(searchStatus() === 'results', 'searchStatus() should be results after setSearchResults');
  assert(hasResults(), 'hasResults() should return true');
  assert(searchQuery() === 'New Query', 'Query should persist through search completion');

  console.log('  OK — store transitions preserve query across searching→results');

  // ── Test 2: Error state preserves query ──────────────────────────────────

  console.log('[TEST] Error state preserves query for retry');

  setSearchQuery('Another Query');
  setSearchStatus('searching');
  assert(isSearching(), 'Should be searching');

  setSearchError('Another Query', new Error('Network failure'));
  assert(searchStatus() === 'error', 'searchStatus() should be error after setSearchError');
  assert(searchQuery() === 'Another Query', 'Query should persist through error state');

  console.log('  OK — error state preserves query');

  // ── Test 3: Smart Pagination (visible count state) ────────────────────────

  console.log('[TEST] Smart Pagination Reveal (visible-count state)');

  // Default visible count
  const defaultCount = searchVisibleCount();
  assert(defaultCount >= 10, `Default visible count should be >= 10, got ${defaultCount}`);

  // Set a custom visible count (simulates "Show More" click)
  const before = searchVisibleCount();
  setSearchVisibleCount(before + 5);
  assert(searchVisibleCount() === before + 5, `Visible count should update to ${before + 5}`);

  // Reset
  setSearchVisibleCount(before);

  console.log('  OK — visible count state management works');

  // ── Test 4: clearSearch resets everything ─────────────────────────────────

  console.log('[TEST] clearSearch resets all search state');

  setSearchQuery('Will Clear');
  setSearchStatus('results');
  setSearchResults(sampleResults);

  clearSearch();

  assert(searchStatus() === 'idle', 'searchStatus() should be idle after clearSearch');
  assert(!hasResults(), 'hasResults() should be false after clearSearch');
  assert(!isSearching(), 'isSearching() should be false after clearSearch');
  assert(getSearchSummary() === null, 'getSearchSummary() should be null after clearSearch');

  console.log('  OK — clearSearch fully resets state');

  // ── Test 5: validateSearchQuery ───────────────────────────────────────────

  console.log('[TEST] validateSearchQuery edge cases');

  assert(validateSearchQuery('').valid === false, 'Empty query should be invalid');
  assert(validateSearchQuery('a').valid === false, 'Single-char query should be too short');
  assert(validateSearchQuery('ab').valid === true, 'Two-char query should be valid');
  assert(validateSearchQuery('ab').query === 'ab', 'Two-char query should normalize to itself');
  assert(validateSearchQuery('  hello  ').query === 'hello', 'Whitespace should be trimmed');

  console.log('  OK — query validation works');

  // ── Test 6: Store snapshot consistency ────────────────────────────────────

  console.log('[TEST] Store snapshot reflects mutations');

  withStateMutation(() => {
    state.searchState.currentSearchSummary = null;
    state.searchState.searchStatus = 'idle';
    state.searchState.isSearching = false;
  });

  setSearchQuery('Snapshot Test');
  setSearchStatus('searching');

  // The searchStore() call returns a snapshot built from appState
  const snapshot = searchState();
  assert(snapshot.query === 'Snapshot Test', 'Store snapshot query should match');
  assert(snapshot.status === 'searching', 'Store snapshot status should match');

  console.log('  OK — store snapshot consistent with appState');

  // ── Cleanup ───────────────────────────────────────────────────────────────

  clearSearch();

  console.log('\n================================================================');
  console.log('ALL UI PERFECTION CHECKS PASSED (Store-Level)');
  console.log('================================================================');
}

main().catch(err => {
  console.error('\nUI PERFECTION TEST FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
});
