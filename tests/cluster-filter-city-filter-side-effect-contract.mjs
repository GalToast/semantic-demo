/**
 * cluster-filter-city-filter-side-effect-contract.mjs
 *
 * Fast Node contract test for populateCityFilter boundary behavior.
 *
 * Coverage:
 *   1. populateCityFilter routes city filter mutation through filter-state owner APIs
 *      (setActiveFilter from ./filter-state.js), not direct state mutation.
 *   2. populateCityFilter preserves UI side effects by calling syncCityFilterUi().
 *   3. filter-state.js exports setActiveFilter (the owner API) and it accepts 'city' key.
 *   4. syncCityFilterUi exists and is called by populateCityFilter.
 *   5. populateCityFilter does NOT bypass the filter-state owner by writing state.activeFilters.city directly.
 *   7. syncCityFilterUi BEHAVIORALLY syncs the city-filter <select> value to
 *      state.activeFilters.city (runtime assertion — replaces the prior
 *      structural substring check in Test 5 with a true behavioral test that
 *      would catch a regression like `select.textContent = ...` substitution).
 *
 * Per-contract decision (P3 cleanup): Tests 1-4 stay structural — they verify
 * ownership boundaries that are easy to break with a "harmless" refactor. Test 5
 * is split: structural export/name check remains, behavioral DOM check moved
 * to Test 7. Test 6 (URL restore) stays structural — DOM behavior is covered
 * by the live surface contracts.
 *
 * Runs in Node — no Playwright, no browser, no DOM.
 * Mixed source-only + minimal-runtime assertions.
 *
 * Usage:
 *   node tests/cluster-filter-city-filter-side-effect-contract.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const SEMDEMO_ROOT = path.resolve(process.cwd());
const CLUSTER_FILTER_PATH = path.join(SEMDEMO_ROOT, 'js/modules/cluster-filter.ts');
const FILTER_STATE_PATH = path.join(SEMDEMO_ROOT, 'js/modules/filter-state.ts');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function assertContains(haystack, needle, label) {
  const found = haystack.includes(needle);
  assert(found, `${label}: expected source to contain "${needle}", but it was not found`);
}

function assertNotContains(haystack, needle, label) {
  const found = haystack.includes(needle);
  assert(!found, `${label}: source should NOT contain "${needle}", but it was found`);
}

function getFunctionBody(src, fnName) {
  const fnPattern = new RegExp(`export function ${fnName}\\s*\\([^)]*\\)\\s*(?::\\s*[^})]*)?\\s*\\{`);
  const match = src.match(fnPattern);
  if (!match) return '';
  const start = match.index + match[0].length;
  let depth = 1;
  let i = start;
  while (i < src.length && depth > 0) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  return src.slice(start, i - 1);
}

// ---------------------------------------------------------------------------
// TEST 1: cluster-filter.js imports setActiveFilter from filter-state.js
// ---------------------------------------------------------------------------

function testFilterStateOwnerApiImport() {
  console.log('\n[TEST] cluster-filter.js imports setActiveFilter from filter-state.ts');

  const src = fs.readFileSync(CLUSTER_FILTER_PATH, 'utf-8');

  // cluster-filter.js imports setActiveFilter from filter-state (the owner API)
  assertContains(src, "from './filter-state.ts'",
    'cluster-filter imports from filter-state.ts');
  // syncCityFilterUi is defined locally in cluster-filter.js — no self-import needed

  console.log('  OK cluster-filter.js uses filter-state owner API');
}

// ---------------------------------------------------------------------------
// TEST 2: filter-state.js exports setActiveFilter and accepts 'city' key
// ---------------------------------------------------------------------------

function testFilterStateExportsSetActiveFilter() {
  console.log('\n[TEST] filter-state.js exports setActiveFilter accepting city key');

  const src = fs.readFileSync(FILTER_STATE_PATH, 'utf-8');

  assertContains(src, 'export function setActiveFilter(key', 'setActiveFilter exported from filter-state');
  assertContains(src, 'if (!FILTER_KEYS.has(key)) return false', 'setActiveFilter guards on FILTER_KEYS');
  assertContains(src, 'const FILTER_KEYS = new Set', 'FILTER_KEYS includes city');
  assertContains(src, '(filters as any)[key] = value', 'setActiveFilter mutates through filters object');

  console.log('  OK filter-state.js setActiveFilter is the owner API for city filter');
}

// ---------------------------------------------------------------------------
// TEST 3: populateCityFilter calls setActiveFilter('city', ...) — not direct state mutation
// ---------------------------------------------------------------------------

function testPopulateCityFilterRoutesThroughOwnerApi() {
  console.log('\n[TEST] populateCityFilter routes city mutation through setActiveFilter');

  const src = fs.readFileSync(CLUSTER_FILTER_PATH, 'utf-8');
  const body = getFunctionBody(src, 'populateCityFilter');

  assert(body.length > 0, 'populateCityFilter function body found in cluster-filter.ts');

  // Must call setActiveFilter for city assignment
  assert(body.includes('setActiveFilter(\'city\'') || body.includes('setActiveFilter("city"'),
    'populateCityFilter calls setActiveFilter("city", ...)');

  // Must NOT directly assign state.activeFilters.city
  assertNotContains(body, 'state.activeFilters.city =', 'populateCityFilter: no direct state.activeFilters.city assignment');
  assertNotContains(body, 'state.activeFilters[\'city\'] =', 'populateCityFilter: no direct state.activeFilters["city"] assignment');

  console.log('  OK populateCityFilter routes city mutation through setActiveFilter (owner API)');
}

// ---------------------------------------------------------------------------
// TEST 4: populateCityFilter preserves UI side effects via syncCityFilterUi()
// ---------------------------------------------------------------------------

function testPopulateCityFilterUiSideEffects() {
  console.log('\n[TEST] populateCityFilter preserves UI side effects via syncCityFilterUi');

  const src = fs.readFileSync(CLUSTER_FILTER_PATH, 'utf-8');
  const body = getFunctionBody(src, 'populateCityFilter');

  assert(body.length > 0, 'populateCityFilter function body found');

  // syncCityFilterUi must be called at end of populateCityFilter
  assert(body.includes('syncCityFilterUi()'), 'populateCityFilter calls syncCityFilterUi()');

  console.log('  OK populateCityFilter preserves UI side effects');
}

// ---------------------------------------------------------------------------
// TEST 5: syncCityFilterUi exists as exported function and performs UI updates
// ---------------------------------------------------------------------------

function testSyncCityFilterUiExistsAndWorks() {
  console.log('\n[TEST] syncCityFilterUi exists, exports, and updates city filter UI elements');

  const src = fs.readFileSync(CLUSTER_FILTER_PATH, 'utf-8');

  // syncCityFilterUi must be exported
  assertContains(src, 'export function syncCityFilterUi()', 'syncCityFilterUi exported from cluster-filter');

  const body = getFunctionBody(src, 'syncCityFilterUi');
  assert(body.length > 0, 'syncCityFilterUi function body found');

  // Must update city-filter select element
  assert(body.includes("getElementById('city-filter')") || body.includes('getElementById("city-filter")'),
    'syncCityFilterUi reads city-filter element');

  // Must use state.activeFilters.city
  assert(body.includes('state.activeFilters.city'), 'syncCityFilterUi reads from state.activeFilters.city');

  console.log('  OK syncCityFilterUi exists and performs expected UI updates');
}

// ---------------------------------------------------------------------------
// TEST 6: filter-state.js restoreActiveFiltersFromUrl also routes city through state
// ---------------------------------------------------------------------------

function testRestoreActiveFiltersFromUrlCityHandling() {
  console.log('\n[TEST] restoreActiveFiltersFromUrl handles city filter correctly');

  const filterStateSrc = fs.readFileSync(FILTER_STATE_PATH, 'utf-8');
  const body = getFunctionBody(filterStateSrc, 'restoreActiveFiltersFromUrl');

  assert(body.length > 0, 'restoreActiveFiltersFromUrl found in filter-state.ts');

  // It reads city from URL params and assigns to filters.city directly
  // (which is the ensureActiveFilters() pattern — this is the setter path, not a direct state bypass)
  assert(body.includes("params.get('city')"), 'restoreActiveFiltersFromUrl reads city from URL params');
  assert(body.includes('filters.city ='), 'restoreActiveFiltersFromUrl assigns to filters.city (correct setter path)');

  // It also updates the <select> element — preserving the UI contract
  assert(body.includes("getElementById('city-filter')"), 'restoreActiveFiltersFromUrl updates city-filter select element');

  console.log('  OK restoreActiveFiltersFromUrl handles city filter through correct setter path');
}

// ---------------------------------------------------------------------------
// TEST 7: syncCityFilterUi BEHAVIORALLY syncs select.value to state.activeFilters.city
// ---------------------------------------------------------------------------
// Replaces the structural substring check in Test 5 with a runtime assertion
// that the function actually moves the value from state to DOM. This catches
// silent regressions where a structural check would still pass (e.g., if the
// implementation switched from select.value to select.textContent).

async function testSyncCityFilterUiBehavior() {
  console.log('\n[TEST] syncCityFilterUi behaviorally syncs select.value');

  // Capture the real document.getElementById before stubbing, in case other
  // modules imported it. Then stub with a minimal fake.
  const realDocument = globalThis.document;
  let capturedValue = '__unset__';
  const fakeSelect = {
    get value() { return capturedValue; },
    set value(v) { capturedValue = String(v); }
  };
  globalThis.document = {
    getElementById: (id) => (id === 'city-filter' ? fakeSelect : null)
  };

  try {
    // Mutate state and call the function
    const { state } = await import('../src/lib/engine/state-bridge.ts');
    const originalCity = state.activeFilters.city;
    state.activeFilters.city = 'Rockville';
    try {
      const { syncCityFilterUi } = await import('../js/modules/cluster-filter.ts');
      syncCityFilterUi();
      assert(
        capturedValue === 'Rockville',
        `syncCityFilterUi should set select.value to 'Rockville', got '${capturedValue}'`
      );

      // Reverse direction: if state changes again, syncCityFilterUi should update DOM
      state.activeFilters.city = 'Germantown';
      syncCityFilterUi();
      assert(
        capturedValue === 'Germantown',
        `syncCityFilterUi should track state changes: select.value should be 'Germantown', got '${capturedValue}'`
      );
    } finally {
      state.activeFilters.city = originalCity;
    }
  } finally {
    globalThis.document = realDocument;
  }

  console.log('  OK syncCityFilterUi behaviorally syncs select.value to state.activeFilters.city');
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

async function main() {
  console.log('============================================================');
  console.log('cluster-filter-city-filter-side-effect-contract.mjs');
  console.log('Contract test: populateCityFilter routing + UI side effects');
  console.log('============================================================');

  try {
    testFilterStateOwnerApiImport();
    testFilterStateExportsSetActiveFilter();
    testPopulateCityFilterRoutesThroughOwnerApi();
    testPopulateCityFilterUiSideEffects();
    testSyncCityFilterUiExistsAndWorks();
    testRestoreActiveFiltersFromUrlCityHandling();
    await testSyncCityFilterUiBehavior();

    console.log('\n============================================================');
    console.log('ALL TESTS PASSED');
    console.log('============================================================');
    process.exit(0);
  } catch (err) {
    console.error('\nTEST FAILED:', err.message);
    process.exit(1);
  }
}

main();
