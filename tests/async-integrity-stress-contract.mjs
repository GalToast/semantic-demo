/**
 * tests/async-integrity-stress-contract.mjs
 *
 * Stress test for search race conditions and rapid view transitions.
 */

import { state, withStateMutation } from '../src/lib/engine/state-bridge.ts';

function assert(condition, message) {
  if (!condition) throw new Error('ASSERTION FAILED: ' + message);
}

async function main() {
  console.log('================================================================');
  console.log('Async Integrity Stress Contract');
  console.log('================================================================');

  // Shim DOM
  const makeEl = (id) => ({
      id,
      classList: { add: () => {}, remove: () => {}, toggle: () => {}, contains: () => false },
      appendChild: (c) => c,
      querySelectorAll: () => [],
      querySelector: (sel) => makeEl(sel),
      dataset: {},
      style: { setProperty: () => {}, removeProperty: () => {} },
      blur: () => {},
      value: '',
      setAttribute: () => {},
      getAttribute: () => null,
      removeAttribute: () => {},
      hidden: false,
      tagName: 'DIV'
  });

  globalThis.document = {
    getElementById: (id) => makeEl(id),
    querySelector: (sel) => makeEl(sel),
    querySelectorAll: (sel) => [],
    body: makeEl('body'),
    createElement: (tag) => makeEl(tag)
  };
  globalThis.sessionStorage = { removeItem: () => {}, getItem: () => null };

  const { search } = await import('../src/lib/stores/search.svelte.ts');

  // 1. Simulate rapid search "Query Alpha" then "Query Bravo"
  console.log('[TEST] Rapid Search Overlap (Alpha -> Bravo)');
  
  const originalFetch = globalThis.fetch;
  
  // Mock fetch with artificial delay
  globalThis.fetch = async (url) => {
    if (url.includes('Alpha')) {
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
    if (url.includes('Bravo')) {
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
  };

  // Mock results mapping
  withStateMutation(() => {
    state.points = [{ lead_id: 'LI_001', name: 'Biz B' }];
    state.pointIndexByLeadId = new Map([['LI_001', 0]]); 
    state.semanticLaneState = 'healthy';
    state.navState = { focusedIndex: null };
  });

  // Start Alpha
  const promiseA = search('Query Alpha');
  // Wait a tiny bit then start Bravo
  await new Promise(r => setTimeout(r, 20));
  const promiseB = search('Query Bravo');

  await Promise.all([promiseA, promiseB]);

  assert(state.currentSearchSummary !== null, 'Search summary should not be null');
  assert(state.currentSearchSummary.query === 'Query Bravo', 'Expected Query Bravo, found ' + state.currentSearchSummary.query);
  console.log('  OK — stale empty result for Alpha did not clobber search Bravo');

  // Restore fetch
  globalThis.fetch = originalFetch;

  console.log('\n================================================================');
  console.log('ALL ASYNC INTEGRITY CHECKS PASSED');
  console.log('================================================================');
}

main().catch(err => {
  console.error('\nSTRESS TEST FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
});