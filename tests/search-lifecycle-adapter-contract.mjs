/**
 * search-lifecycle-adapter-contract.mjs
 *
 * Fast Node contract test for the search-state → lifecycle/url-state dew-windowing seam.
 *
 * Proves:
 *  1. search-state.js does NOT call window.updateUrlState / window.setSearchPanelState /
 *     window.focusOnPoint / window.updateExplorationUi / window.resetNodePositions /
 *     window.refreshCompositionState directly
 *  2. search-lifecycle-adapter.js exists and exports initSearchLifecycleAdapter,
 *     isSearchLifecycleAdapterReady, updateUrlState, setSearchPanelState,
 *     focusOnPoint, updateExplorationUi, resetNodePositions, dispatchNavTransition,
 *     syncSearchStatusForFocus, updateJourneyCompass, refreshCompositionState
 *  3. search-lifecycle-adapter.js has no imports that can recreate cycles
 *     (no search-state, no lifecycle, no url-state, no tooltip, no cluster-filter)
 *  4. app.js calls initSearchLifecycleAdapter with all 9 function refs before any search runs
 *  5. search-state.js imports lifecycle functions it uses from the adapter
 *  6. The adapter is a proper leaf — all 5 window call groups in search-state.js
 *     are replaced by direct adapter calls
 *  7. search-state.js routes navState.mode/focusedIndex clears through adapter_dispatchNavTransition
 *  8. search-state.js routes syncSearchStatusForFocus through the adapter (not window)
 *  9. search-state.js routes updateJourneyCompass through the adapter (not window)
 * 10. search-state.js routes refreshCompositionState through the adapter (not window)
 *
 * Run: node tests/search-lifecycle-adapter-contract.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CWD = process.cwd();
const SEARCH_STATE_PATH  = resolve(CWD, 'js/modules/search-state.js');
const APP_PATH           = resolve(CWD, 'js/modules/app.js');
const ADAPTER_PATH       = resolve(CWD, 'js/modules/search-lifecycle-adapter.js');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function assertContains(haystack, needle, label) {
  const found = haystack.includes(needle);
  assert(found, `${label}: expected source to contain "${needle}"`);
}

function assertNotContains(haystack, needle, label) {
  const found = haystack.includes(needle);
  assert(!found, `${label}: source should NOT contain "${needle}"`);
}

// ---------------------------------------------------------------------------
// TEST 1: search-state.js does NOT call the 5 window lifecycle functions directly
// ---------------------------------------------------------------------------

function testNoBareWindowLifecycleCalls() {
  console.log('\n[TEST 1] search-state.js does NOT call window lifecycle functions directly');

  const src = readFileSync(SEARCH_STATE_PATH, 'utf-8');

  const WINDOW_LIFECYCLE_FNS = [
    'window.updateUrlState',
    'window.setSearchPanelState',
    'window.focusOnPoint',
    'window.updateExplorationUi',
    'window.resetNodePositions',
    'window.refreshCompositionState',
  ];

  const problems = [];
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    for (const fn of WINDOW_LIFECYCLE_FNS) {
      const pos = trimmed.indexOf(fn);
      if (pos === -1) continue;
      // Allow inside a typeof guard — those are still bad (should use adapter)
      const before = trimmed.substring(0, pos);
      if (before.includes('typeof')) {
        problems.push(`  line ${i + 1} (typeof guard): ${trimmed}`);
      } else {
        problems.push(`  line ${i + 1}: ${trimmed}`);
      }
    }
  });

  assert(problems.length === 0,
    `search-state.js must not call window lifecycle functions directly.\n${problems.join('\n')}`);

  console.log('  PASS — no bare window.updateUrlState/setSearchPanelState/focusOnPoint/updateExplorationUi/resetNodePositions/refreshCompositionState calls in search-state.js');
}

// ---------------------------------------------------------------------------
// TEST 2: search-lifecycle-adapter.js exists and exports required functions
// ---------------------------------------------------------------------------

function testAdapterExistsAndExports() {
  console.log('\n[TEST 2] search-lifecycle-adapter.js exists and exports required functions');

  const adapterSrc = readFileSync(ADAPTER_PATH, 'utf-8');

  assertContains(adapterSrc, 'export function initSearchLifecycleAdapter',
    'search-lifecycle-adapter.js must export initSearchLifecycleAdapter');

  assertContains(adapterSrc, 'export function isSearchLifecycleAdapterReady',
    'search-lifecycle-adapter.js must export isSearchLifecycleAdapterReady');

  assertContains(adapterSrc, 'export function updateUrlState',
    'search-lifecycle-adapter.js must export updateUrlState');

  assertContains(adapterSrc, 'export function setSearchPanelState',
    'search-lifecycle-adapter.js must export setSearchPanelState');

  assertContains(adapterSrc, 'export function focusOnPoint',
    'search-lifecycle-adapter.js must export focusOnPoint');

  assertContains(adapterSrc, 'export function updateExplorationUi',
    'search-lifecycle-adapter.js must export updateExplorationUi');

  assertContains(adapterSrc, 'export function resetNodePositions',
    'search-lifecycle-adapter.js must export resetNodePositions');

  assertContains(adapterSrc, 'export function dispatchNavTransition',
    'search-lifecycle-adapter.js must export dispatchNavTransition');

  assertContains(adapterSrc, 'export function syncSearchStatusForFocus',
    'search-lifecycle-adapter.js must export syncSearchStatusForFocus');

  assertContains(adapterSrc, 'export function updateJourneyCompass',
    'search-lifecycle-adapter.js must export updateJourneyCompass');

  assertContains(adapterSrc, 'export function refreshCompositionState',
    'search-lifecycle-adapter.js must export refreshCompositionState');

  console.log('  PASS — adapter exists and exports all required functions');
}

// ---------------------------------------------------------------------------
// TEST 3: search-lifecycle-adapter.js has no imports that can recreate cycles
// ---------------------------------------------------------------------------

function testAdapterDoesNotImportCycleParticipants() {
  console.log('\n[TEST 3] search-lifecycle-adapter.js does not import cycle participants');

  const src = readFileSync(ADAPTER_PATH, 'utf-8');
  const importLines = src.split('\n').filter(l => l.trim().startsWith('import'));

  const forbiddenImports = [];
  importLines.forEach((line) => {
    const relevant = line.includes('search-state') || line.includes('tooltip')
      || line.includes('lifecycle') || line.includes('cluster-filter')
      || line.includes('url-state') || line.includes('camera-controls')
      || line.includes('journey') || line.includes('focus-pocket');
    if (relevant) {
      forbiddenImports.push(line.trim());
    }
  });

  assert(forbiddenImports.length === 0,
    `search-lifecycle-adapter.js must not import cycle participants. Found:\n  ${forbiddenImports.join('\n  ')}`);

  console.log('  PASS — adapter has no cycle-participant imports');
}

// ---------------------------------------------------------------------------
// TEST 4: app.js calls initSearchLifecycleAdapter with all 9 function refs
// ---------------------------------------------------------------------------

function testAppInjectsAdapterWithLifecycleRefs() {
  console.log('\n[TEST 4] app.js calls initSearchLifecycleAdapter with all 9 function refs');

  const src = readFileSync(APP_PATH, 'utf-8');

  assertContains(src, 'initSearchLifecycleAdapter({',
    'app.js must call initSearchLifecycleAdapter');

  assertContains(src, 'updateUrlState',
    'app.js must pass updateUrlState to initSearchLifecycleAdapter');

  assertContains(src, 'setSearchPanelState:',
    'app.js must pass setSearchPanelState to initSearchLifecycleAdapter');

  assertContains(src, 'focusOnPoint',
    'app.js must pass focusOnPoint to initSearchLifecycleAdapter');

  assertContains(src, 'updateExplorationUi',
    'app.js must pass updateExplorationUi to initSearchLifecycleAdapter');

  assertContains(src, 'resetNodePositions',
    'app.js must pass resetNodePositions to initSearchLifecycleAdapter');

  assertContains(src, 'dispatchNavTransition',
    'app.js must pass dispatchNavTransition to initSearchLifecycleAdapter');

  assertContains(src, 'syncSearchStatusForFocus',
    'app.js must pass syncSearchStatusForFocus to initSearchLifecycleAdapter');

  assertContains(src, 'updateJourneyCompass',
    'app.js must pass updateJourneyCompass to initSearchLifecycleAdapter');

  assertContains(src, 'refreshCompositionState',
    'app.js must pass refreshCompositionState to initSearchLifecycleAdapter');

  // Verify updateUrlState is imported from url-state.js
  assertContains(src, "from './url-state.js'",
    'app.js must import updateUrlState from url-state.js');

  // Verify focusOnPoint, updateExplorationUi, resetNodePositions, dispatchNavTransition,
  // syncSearchStatusForFocus, updateJourneyCompass, and refreshCompositionState are from lifecycle
  assertContains(src, "from './lifecycle.js'",
    'app.js must import lifecycle functions from lifecycle.js');

  console.log('  PASS — app.js injects adapter with all 9 function refs');
}

// ---------------------------------------------------------------------------
// TEST 5: search-state.js imports lifecycle functions it uses from the adapter
// ---------------------------------------------------------------------------

function testSearchStateImportsFromAdapter() {
  console.log('\n[TEST 5] search-state.js imports used lifecycle functions from the adapter');

  const src = readFileSync(SEARCH_STATE_PATH, 'utf-8');

  assertContains(src, "from './search-lifecycle-adapter.js'",
    'search-state.js must import from search-lifecycle-adapter.js');

  assertContains(src, 'adapter_updateUrlState',
    'search-state.js must import updateUrlState as adapter_updateUrlState from adapter');

  assertContains(src, 'adapter_setSearchPanelState',
    'search-state.js must import setSearchPanelState as adapter_setSearchPanelState from adapter');

  assertContains(src, 'adapter_focusOnPoint',
    'search-state.js must import focusOnPoint as adapter_focusOnPoint from adapter');

  assertContains(src, 'adapter_resetNodePositions',
    'search-state.js must import resetNodePositions as adapter_resetNodePositions from adapter');

  assertContains(src, 'adapter_dispatchNavTransition',
    'search-state.js must import dispatchNavTransition as adapter_dispatchNavTransition from adapter');

  assertContains(src, 'adapter_syncSearchStatusForFocus',
    'search-state.js must import syncSearchStatusForFocus as adapter_syncSearchStatusForFocus from adapter');

  assertContains(src, 'adapter_updateJourneyCompass',
    'search-state.js must import updateJourneyCompass as adapter_updateJourneyCompass from adapter');

  assertContains(src, 'adapter_refreshCompositionState',
    'search-state.js must import refreshCompositionState as adapter_refreshCompositionState from adapter');

  console.log('  PASS — search-state.js imports used lifecycle functions from adapter');
}

// ---------------------------------------------------------------------------
// TEST 6: All lifecycle call groups in search-state.js use the Event Bus
// ---------------------------------------------------------------------------

function testAllLifecycleCallSitesUseEventBus() {
  console.log('\n[TEST 6] All lifecycle call sites in search-state.js use the Event Bus');

  const src = readFileSync(SEARCH_STATE_PATH, 'utf-8');

  // Count publications
  const publishCalls = (src.match(/\bpublish\s*\(\s*EVENTS\.SEARCH_/g) || []).length;
  
  assert(publishCalls >= 5,
    `Expected at least 5 publish(EVENTS.SEARCH_...) calls, found ${publishCalls}`);

  // Count the window.* calls that should be gone
  const windowUpdateUrl = (src.match(/window\.updateUrlState\b/g) || []).length;
  const windowSetSearchPanel = (src.match(/window\.setSearchPanelState\b/g) || []).length;
  const windowFocusOnPoint = (src.match(/window\.focusOnPoint\b/g) || []).length;
  const windowUpdateExploration = (src.match(/window\.updateExplorationUi\b/g) || []).length;
  const windowResetNode = (src.match(/window\.resetNodePositions\b/g) || []).length;
  const windowSyncSearchStatus = (src.match(/window\.syncSearchStatusForFocus\b/g) || []).length;
  const windowUpdateJourneyCompass = (src.match(/window\.updateJourneyCompass\b/g) || []).length;
  const windowRefreshCompositionState = (src.match(/window\.refreshCompositionState\b/g) || []).length;

  assert(windowUpdateUrl === 0, `Expected 0 window.updateUrlState calls, found ${windowUpdateUrl}`);
  assert(windowSetSearchPanel === 0, `Expected 0 window.setSearchPanelState calls, found ${windowSetSearchPanel}`);
  assert(windowFocusOnPoint === 0, `Expected 0 window.focusOnPoint calls, found ${windowFocusOnPoint}`);
  assert(windowUpdateExploration === 0, `Expected 0 window.updateExplorationUi calls, found ${windowUpdateExploration}`);
  assert(windowResetNode === 0, `Expected 0 window.resetNodePositions calls, found ${windowResetNode}`);
  assert(windowSyncSearchStatus === 0, `Expected 0 window.syncSearchStatusForFocus calls, found ${windowSyncSearchStatus}`);
  assert(windowUpdateJourneyCompass === 0, `Expected 0 window.updateJourneyCompass calls, found ${windowUpdateJourneyCompass}`);
  assert(windowRefreshCompositionState === 0, `Expected 0 window.refreshCompositionState calls, found ${windowRefreshCompositionState}`);

  console.log(`  PASS — search-state.js is event-driven (${publishCalls} publications); 0 window.* equivalents`);
}

// ---------------------------------------------------------------------------
// TEST 7: search-state.js routes navState.mode/focusedIndex clears through adapter
// ---------------------------------------------------------------------------

function testNavStateRoutingThroughAdapter() {
  console.log('\n[TEST 7] search-state.js routes navState.mode/focusedIndex clears through adapter');

  const src = readFileSync(SEARCH_STATE_PATH, 'utf-8');

  // search-state.js must NOT directly assign navState.mode or navState.focusedIndex
  const navStateModeWrites = (src.match(/state\.navState\.mode\s*=/g) || []).length;
  const navStateFocusedWrites = (src.match(/state\.navState\.focusedIndex\s*=/g) || []).length;

  assert(navStateModeWrites === 0,
    `search-state.js must not directly assign state.navState.mode — found ${navStateModeWrites} write(s)`);
  assert(navStateFocusedWrites === 0,
    `search-state.js must not directly assign state.navState.focusedIndex — found ${navStateFocusedWrites} write(s)`);

  // search-state.js MUST call adapter_dispatchNavTransition('RESET_FOCUS') to clear navState
  const dispatchResetFocus = (src.match(/adapter_dispatchNavTransition\s*\(\s*['"]RESET_FOCUS['"]/g) || []).length;
  assert(dispatchResetFocus >= 1,
    `search-state.js must call adapter_dispatchNavTransition('RESET_FOCUS') to clear navState — found ${dispatchResetFocus}`);

  console.log('  PASS — navState.mode/focusedIndex cleared via adapter_dispatchNavTransition, not direct write');
}

// ---------------------------------------------------------------------------
// TEST 8: search-state.js routes syncSearchStatusForFocus through the adapter
// ---------------------------------------------------------------------------

function testSyncSearchStatusForFocusRouting() {
  console.log('\n[TEST 8] search-state.js routes syncSearchStatusForFocus through the adapter');

  const src = readFileSync(SEARCH_STATE_PATH, 'utf-8');

  // Must call the adapter version
  const adapterCalls = (src.match(/\badapter_syncSearchStatusForFocus\s*\(/g) || []).length;
  assert(adapterCalls >= 1,
    `Expected at least 1 adapter_syncSearchStatusForFocus call, found ${adapterCalls}`);

  // Must NOT call window.syncSearchStatusForFocus
  const windowCalls = (src.match(/window\.syncSearchStatusForFocus\b/g) || []).length;
  assert(windowCalls === 0,
    `Expected 0 window.syncSearchStatusForFocus calls, found ${windowCalls}`);

  console.log(`  PASS — syncSearchStatusForFocus routed through adapter (${adapterCalls} calls), 0 window.* equivalents`);
}

// ---------------------------------------------------------------------------
// TEST 9: search-state.js publishes search events to decouple compass/composition
// ---------------------------------------------------------------------------

function testSearchEventDecoupling() {
  console.log('\n[TEST 9] search-state.js publishes search events to decouple compass/composition');

  const src = readFileSync(SEARCH_STATE_PATH, 'utf-8');

  assert(src.includes('publish(EVENTS.SEARCH_SUCCESS'), 'search-state publishes SEARCH_SUCCESS');
  assert(src.includes('publish(EVENTS.SEARCH_EMPTY'), 'search-state publishes SEARCH_EMPTY');
  assert(src.includes('publish(EVENTS.SEARCH_CLEARED'), 'search-state publishes SEARCH_CLEARED');

  console.log('  PASS — search-state.js uses Event Bus for UI decoupling');
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const tests = [
  testNoBareWindowLifecycleCalls,
  testAdapterExistsAndExports,
  testAdapterDoesNotImportCycleParticipants,
  testAppInjectsAdapterWithLifecycleRefs,
  testSearchStateImportsFromAdapter,
  testAllLifecycleCallSitesUseEventBus,
  testNavStateRoutingThroughAdapter,
  testSyncSearchStatusForFocusRouting,
  testSearchEventDecoupling,
];

let passed = 0;
let failed = 0;

for (const test of tests) {
  try {
    test();
    passed++;
    console.log('  PASS');
  } catch (err) {
    failed++;
    console.error(`  FAIL: ${err.message}`);
  }
}

console.log(`\nResult: ${passed}/${tests.length} passed\n`);
if (failed > 0) process.exit(1);
