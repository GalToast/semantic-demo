/**
 * semantic-guide-payload-contract.mjs
 *
 * Fast Node contract test for js/modules/semantic-guide-payload.js
 *
 * Proves the payload builders no longer read raw global state — all state
 * access is routed through semantic-guide-payload-adapter.js boundary.
 *
 * Runs in Node with minimal globals. No Playwright, no live network.
 *
 * Usage:
 *   node tests/semantic-guide-payload-contract.mjs
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SEMDEMO_ROOT = path.resolve(process.cwd());
const PAYLOAD_PATH = path.join(SEMDEMO_ROOT, 'js/modules/semantic-guide-payload.ts');
const ADAPTER_PATH = path.join(SEMDEMO_ROOT, 'js/modules/semantic-guide-payload-adapter.ts');

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function assertNotContains(haystack, needle, label) {
  const found = haystack.includes(needle);
  assert(!found, `${label}: source should NOT contain "${needle}", but it was found`);
}

// ---------------------------------------------------------------------------
// Test 1: Static source — semantic-guide-payload.js does NOT import state directly
// ---------------------------------------------------------------------------

async function testPayloadDoesNotImportState() {
  console.log('\n[STATIC] semantic-guide-payload.js — no direct state import');

  const fs = await import('node:fs');
  const srcCode = fs.readFileSync(PAYLOAD_PATH, 'utf-8');

  // Must NOT have: import { state } from '../state'
  assertNotContains(srcCode, "import { state } from '../state.ts'", 'payload imports state directly');
  assertNotContains(srcCode, 'from "../state.js"', 'payload imports state via relative path');

  console.log('  OK semantic-guide-payload.js does not import state directly');
}

// ---------------------------------------------------------------------------
// Test 2: Static source — semantic-guide-payload.js delegates to adapter
// ---------------------------------------------------------------------------

async function testPayloadDelegatesToAdapter() {
  console.log('\n[STATIC] semantic-guide-payload.js — delegates to adapter');

  const fs = await import('node:fs');
  const srcCode = fs.readFileSync(PAYLOAD_PATH, 'utf-8');

  // Must import from semantic-guide-payload-adapter
  assert(
    srcCode.includes("from './semantic-guide-payload-adapter.ts'"),
    'payload imports from semantic-guide-payload-adapter'
  );

  // Must import getSearchContextSnapshot, getPoints, getResultContextMap
  assert(
    srcCode.includes('getSearchContextSnapshot'),
    'payload uses getSearchContextSnapshot from adapter'
  );
  assert(
    srcCode.includes('getPoints'),
    'payload uses getPoints from adapter'
  );
  assert(
    srcCode.includes('getResultContextMap'),
    'payload uses getResultContextMap from adapter'
  );

  console.log('  OK semantic-guide-payload.js delegates state reads to adapter');
}

// ---------------------------------------------------------------------------
// Test 3: Static source — adapter covers all state fields needed by payload
// ---------------------------------------------------------------------------

async function testAdapterCoversAllStateFields() {
  console.log('\n[STATIC] adapter — covers all payload state fields');

  const fs = await import('node:fs');
  const adapterSrc = fs.readFileSync(ADAPTER_PATH, 'utf-8');

  // Adapter must access state.semanticResultContextByLeadId
  assert(
    adapterSrc.includes('semanticResultContextByLeadId'),
    'adapter accesses semanticResultContextByLeadId'
  );

  // Adapter must access state.currentSearchSummary
  assert(
    adapterSrc.includes('currentSearchSummary'),
    'adapter accesses currentSearchSummary'
  );

  // Adapter must access state.currentView
  assert(
    adapterSrc.includes('currentView'),
    'adapter accesses currentView'
  );

  // Adapter must access state.points
  assert(
    adapterSrc.includes('state.points'),
    'adapter accesses state.points'
  );

  console.log('  OK adapter covers all state fields needed by payload builders');
}

// ---------------------------------------------------------------------------
// Test 4: Runtime — adapter returns correct snapshot structure
// ---------------------------------------------------------------------------

async function testAdapterSnapshotStructure() {
  console.log('\n[RUNTIME] adapter — snapshot structure is complete');

  const {
    getSearchContextSnapshot,
    getPoints,
    getResultContextMap,
    buildSemanticGuidePayloadResult,
    mapResultIndicesToPayloadResults,
    getAnchorPoint
  } = await import('../js/modules/semantic-guide-payload-adapter.ts');

  // getSearchContextSnapshot returns an object with currentSearchSummary and currentView
  const snap = getSearchContextSnapshot();
  assert(
    'currentSearchSummary' in snap,
    'snapshot has currentSearchSummary field'
  );
  assert(
    'currentView' in snap,
    'snapshot has currentView field'
  );

  // getPoints returns array
  const points = getPoints();
  assert(Array.isArray(points), 'getPoints returns array');

  // getResultContextMap returns Map
  const ctxMap = getResultContextMap();
  assert(ctxMap instanceof Map, 'getResultContextMap returns Map');

  console.log('  OK adapter snapshot structure verified at runtime');
}

// ---------------------------------------------------------------------------
// Test 5: Runtime — buildSemanticGuidePayloadResult via adapter works with provided snapshot
// ---------------------------------------------------------------------------

async function testBuildResultWithProvidedSnapshot() {
  console.log('\n[RUNTIME] buildSemanticGuidePayloadResult — works with provided snapshot');

  const { buildSemanticGuidePayloadResult } = await import('../js/modules/semantic-guide-payload-adapter.ts');

  // Simulate a snapshot with points and context
  const fakePoints = [
    { lead_id: 'LI_001', name: 'Biz A', city: 'Austin', cluster: 1, status: 'active', what: 'Note A' },
    { lead_id: 'LI_002', name: 'Biz B', city: 'Boston', cluster: 2, status: 'inactive', what: 'Note B' },
  ];
  const fakeContextMap = new Map([
    ['LI_001', { city: 'Austin', public_note: 'Great biz', public_detail: 'Details A', address: '123 A St', naics: '1234' }],
    ['LI_002', { city: 'Boston', public_note: 'Old biz', public_detail: 'Details B', address: '456 B Ave', naics: '5678' }],
  ]);

  const result0 = buildSemanticGuidePayloadResult(0, fakePoints, fakeContextMap);
  assert(result0 !== null, 'result returned for valid index');
  assert(result0.lead_id === 'LI_001', 'result has correct lead_id');
  assert(result0.name === 'Biz A', 'result has formatted name');
  assert(result0.city === 'Austin', 'result has city from context');
  assert(result0.cluster_label !== undefined, 'result has cluster_label');
  assert(result0.status !== undefined, 'result has status');
  assert(result0.public_note === 'Great biz', 'result has public_note from context');

  const result1 = buildSemanticGuidePayloadResult(1, fakePoints, fakeContextMap);
  assert(result1.lead_id === 'LI_002', 'result for second index has correct lead_id');
  assert(result1.city === 'Boston', 'result has city from context for index 1');

  // Out-of-range index returns null
  const resultBad = buildSemanticGuidePayloadResult(99, fakePoints, fakeContextMap);
  assert(resultBad === null, 'out-of-range index returns null');

  // Null points returns null
  const resultNoPoints = buildSemanticGuidePayloadResult(0, null, fakeContextMap);
  assert(resultNoPoints === null, 'null points returns null');

  console.log('  OK buildSemanticGuidePayloadResult works with provided snapshot');
}

// ---------------------------------------------------------------------------
// Test 6: Runtime — mapResultIndicesToPayloadResults via adapter
// ---------------------------------------------------------------------------

async function testMapResultIndicesToPayloadResults() {
  console.log('\n[RUNTIME] mapResultIndicesToPayloadResults — works via adapter');

  const { mapResultIndicesToPayloadResults } = await import('../js/modules/semantic-guide-payload-adapter.ts');

  const fakePoints = [
    { lead_id: 'LI_001', name: 'Biz A', city: 'Austin', cluster: 1, status: 'active', what: 'Note A' },
    { lead_id: 'LI_002', name: 'Biz B', city: 'Boston', cluster: 2, status: 'inactive', what: 'Note B' },
    { lead_id: 'LI_003', name: 'Biz C', city: 'Chicago', cluster: 3, status: 'active', what: 'Note C' },
  ];
  const fakeContextMap = new Map([
    ['LI_001', { city: 'Austin', public_note: 'Note1' }],
    ['LI_002', { city: 'Boston', public_note: 'Note2' }],
    ['LI_003', { city: 'Chicago', public_note: 'Note3' }],
  ]);

  const results = mapResultIndicesToPayloadResults([0, 1, 2], fakePoints, fakeContextMap);
  assert(results.length === 3, 'returns 3 results for 3 indices');
  assert(results[0].lead_id === 'LI_001', 'first result correct');
  assert(results[1].lead_id === 'LI_002', 'second result correct');
  assert(results[2].lead_id === 'LI_003', 'third result correct');

  // Limits to 6
  const manyIndices = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  // Provide enough points so all 6 sliced indices return a result
  const manyPoints = Array.from({ length: 9 }, (_, i) => ({
    lead_id: `LI_00${i}`, name: `Biz ${i}`, city: 'City', cluster: 1, status: 'active', what: 'Note'
  }));
  const limited = mapResultIndicesToPayloadResults(manyIndices, manyPoints, fakeContextMap);
  assert(limited.length === 6, 'limits to 6 results');

  // Empty indices returns empty array
  const empty = mapResultIndicesToPayloadResults([], fakePoints, fakeContextMap);
  assert(empty.length === 0, 'empty indices returns empty array');

  console.log('  OK mapResultIndicesToPayloadResults works correctly via adapter');
}

// ---------------------------------------------------------------------------
// Test 7: Runtime — getAnchorPoint via adapter
// ---------------------------------------------------------------------------

async function testGetAnchorPointViaAdapter() {
  console.log('\n[RUNTIME] getAnchorPoint — works via adapter');

  const { getAnchorPoint } = await import('../js/modules/semantic-guide-payload-adapter.ts');

  const fakePoints = [
    { lead_id: 'LI_001', name: 'Biz A' },
    { lead_id: 'LI_002', name: 'Biz B' },
    { lead_id: 'LI_003', name: 'Biz C' },
  ];

  const summary1 = { anchorIndex: 1 };
  const anchor1 = getAnchorPoint(summary1, fakePoints);
  assert(anchor1 !== null, 'anchor returned for valid index');
  assert(anchor1.lead_id === 'LI_002', 'anchor has correct lead_id');

  const summaryBad = { anchorIndex: 99 };
  const anchorBad = getAnchorPoint(summaryBad, fakePoints);
  assert(anchorBad === null, 'null anchor for out-of-range index');

  const summaryNull = { anchorIndex: null };
  const anchorNull = getAnchorPoint(summaryNull, fakePoints);
  assert(anchorNull === null, 'null anchor for null index');

  const summaryNoKey = {};
  const anchorNoKey = getAnchorPoint(summaryNoKey, fakePoints);
  assert(anchorNoKey === null, 'null anchor for missing anchorIndex key');

  console.log('  OK getAnchorPoint works correctly via adapter');
}

// ---------------------------------------------------------------------------
// Test 8: Runtime — payload helpers honor explicit summary arguments
// ---------------------------------------------------------------------------

async function testPayloadHelpersHonorExplicitSummary() {
  console.log('\n[RUNTIME] payload helpers — honor explicit summary arguments');

  const { state, withStateMutation } = await import('../js/state.ts');
  const {
    getSemanticGuidePayloadResults,
    getSemanticGuideAnchorPoint
  } = await import('../js/modules/semantic-guide-payload.ts');

  const originalPoints = state.points;
  const originalSummary = state.currentSearchSummary;
  const originalContextMap = state.semanticResultContextByLeadId;

  withStateMutation(() => {
    state.points = [
      { lead_id: 'LI_001', name: 'Global Summary Biz', city: 'Austin', cluster: 1, status: 'active', what: 'Global' },
      { lead_id: 'LI_002', name: 'Explicit Summary Biz', city: 'Boston', cluster: 2, status: 'active', what: 'Explicit' },
    ];
    state.semanticResultContextByLeadId = new Map();
    state.currentSearchSummary = { query: 'global', resultIndices: [0], anchorIndex: 0 };
  });

  const explicitSummary = { query: 'explicit', resultIndices: [1], anchorIndex: 1 };
  const results = getSemanticGuidePayloadResults(explicitSummary);
  const anchor = getSemanticGuideAnchorPoint(explicitSummary);

  assert(results.length === 1, 'explicit summary returns one result');
  assert(results[0].lead_id === 'LI_002', 'explicit summary result index is honored');
  assert(anchor?.lead_id === 'LI_002', 'explicit summary anchor index is honored');

  withStateMutation(() => {
    state.points = originalPoints;
    state.currentSearchSummary = originalSummary;
    state.semanticResultContextByLeadId = originalContextMap;
  });

  console.log('  OK payload helpers honor explicit summary arguments');
}

// ---------------------------------------------------------------------------
// Test 8: Runtime — getSearchContextSnapshot returns current state
// ---------------------------------------------------------------------------

async function testSearchContextSnapshotReturnsCurrentState() {
  console.log('\n[RUNTIME] getSearchContextSnapshot — returns current state values');

  const { state, withStateMutation } = await import('../js/state.ts');
  const { getSearchContextSnapshot } = await import('../js/modules/semantic-guide-payload-adapter.ts');

  // Set up state
  const originalSummary = state.currentSearchSummary;
  const originalView = state.currentView;

  withStateMutation(() => {
    state.currentSearchSummary = { query: 'test search', resultIndices: [0, 1] };
    state.currentView = 'galaxy';
  });

  const snap = getSearchContextSnapshot();
  assert(snap.currentSearchSummary === state.currentSearchSummary, 'snapshot reflects currentSearchSummary');
  assert(snap.currentView === state.currentView, 'snapshot reflects currentView');

  // Restore
  withStateMutation(() => {
    state.currentSearchSummary = originalSummary;
    state.currentView = originalView;
  });

  console.log('  OK getSearchContextSnapshot returns current state values');
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

async function main() {
  console.log('================================================================');
  console.log('semantic-guide-payload-contract.mjs');
  console.log('Contract test: payload builders route state through adapter');
  console.log('================================================================');

  try {
    await testPayloadDoesNotImportState();
    await testPayloadDelegatesToAdapter();
    await testAdapterCoversAllStateFields();
    await testAdapterSnapshotStructure();
    await testBuildResultWithProvidedSnapshot();
    await testMapResultIndicesToPayloadResults();
    await testGetAnchorPointViaAdapter();
    await testPayloadHelpersHonorExplicitSummary();
    await testSearchContextSnapshotReturnsCurrentState();

    console.log('\n================================================================');
    console.log('ALL TESTS PASSED');
    console.log('================================================================');
    process.exit(0);
  } catch (err) {
    console.error('\nTEST FAILED:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();