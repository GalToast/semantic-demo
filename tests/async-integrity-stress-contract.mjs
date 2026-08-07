/**
 * tests/async-integrity-stress-contract.mjs
 *
 * Stress test for search race conditions and rapid view transitions.
 *
 * Uses the current runSearch(query, signal) API (replaces the former
 * search() export). Mocks global fetch to simulate overlapping slow/fast
 * responses and verifies the race-condition guard (request sequence
 * tracking via incrementRequestSequence + isRequestCurrent) prevents
 * a stale early request from overwriting a later one.
 */

// ── Shim global DOM before imports (search-trail-cue-renderer references document) ──

globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  body: { dataset: {} },
  createElement: () => ({ style: {}, appendChild: () => {}, setAttribute: () => {} })
};
globalThis.sessionStorage = { removeItem: () => {}, getItem: () => null, setItem: () => {} };
globalThis.window = { requestAnimationFrame: (cb) => cb() };

import { state, withStateMutation } from './helpers/canonical-state.mjs';
import { runSearch, searchState, searchStatus, searchQuery, searchResults, getSearchSummary, clearSearch } from '../src/lib/stores/search.svelte.ts';

function assert(condition, message) {
  if (!condition) throw new Error('ASSERTION FAILED: ' + message);
}

async function main() {
  console.log('================================================================');
  console.log('Async Integrity Stress Contract');
  console.log('================================================================');

  // ── Setup: initialize appState search fields ──────────────────────────────

  withStateMutation(() => {
    state.points = [{ lead_id: 'LI_001', name: 'Biz B', index: 0 }];
    state.pointIndexByLeadId = new Map([['LI_001', 0]]);
    state.searchResults = [];
    state.semanticLaneState = 'healthy';
    state.navState = { focusedIndex: null };
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

  // ── Simulate rapid search "Query Alpha" then "Query Bravo" ─────────────────

  console.log('[TEST] Rapid Search Overlap (Alpha -> Bravo)');

  const originalFetch = globalThis.fetch;

  // Mock fetch with artificial delay
  // Alpha is slow and returns empty results
  // Bravo is faster and returns actual results
  globalThis.fetch = async (url) => {
    if (typeof url === 'string' && url.includes('Alpha')) {
      await new Promise(r => setTimeout(r, 150)); // Alpha is slow
      return {
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          ok: true,
          query: 'Query Alpha',
          results: [] // Alpha has no results
        }))
      };
    }
    if (typeof url === 'string' && url.includes('Bravo')) {
      await new Promise(r => setTimeout(r, 50)); // Bravo is faster but still delayed
      return {
        ok: true,
        text: () => Promise.resolve(JSON.stringify({
          ok: true,
          query: 'Query Bravo',
          results: [{ lead_id: 'LI_001', score: 1 }]
        }))
      };
    }
    // Fallback for any other fetch
    return originalFetch ? originalFetch(url) : { ok: false, text: () => Promise.resolve('{}') };
  };

  // Start Alpha and Bravo with separate AbortControllers
  const ctrlA = new AbortController();
  const ctrlB = new AbortController();

  const promiseA = runSearch('Query Alpha', ctrlA.signal);
  // Wait a tiny bit then start Bravo
  await new Promise(r => setTimeout(r, 20));
  const promiseB = runSearch('Query Bravo', ctrlB.signal);

  await Promise.all([promiseA, promiseB]);

  // The race-condition guard (incrementRequestSequence + isRequestCurrent)
  // must ensure that Bravo's results win, not Alpha's stale empty results.
  const summary = getSearchSummary();
  assert(summary !== null, 'Search summary should not be null');
  assert(summary.query === 'Query Bravo',
    `Expected Query Bravo, found ${summary.query}`);

  console.log('  OK — stale empty result for Alpha did not clobber search Bravo');

  // ── Cleanup ───────────────────────────────────────────────────────────────

  globalThis.fetch = originalFetch;
  clearSearch();

  console.log('\n================================================================');
  console.log('ALL ASYNC INTEGRITY CHECKS PASSED');
  console.log('================================================================');
}

main().catch(err => {
  console.error('\nSTRESS TEST FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
});
