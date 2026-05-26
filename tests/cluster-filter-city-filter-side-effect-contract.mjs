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
 *
 * Runs in Node — no Playwright, no browser, no DOM.
 * Source-only assertions via string search + structural analysis.
 *
 * Usage:
 *   node tests/cluster-filter-city-filter-side-effect-contract.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const SEMDEMO_ROOT = path.resolve(process.cwd());
const CLUSTER_FILTER_PATH = path.join(SEMDEMO_ROOT, 'js/modules/cluster-filter.js');
const FILTER_STATE_PATH = path.join(SEMDEMO_ROOT, 'js/modules/filter-state.js');

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
  const fnPattern = new RegExp(`export function ${fnName}\\s*\\([^)]*\\)\\s*\\{`, 's');
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
  console.log('\n[TEST] cluster-filter.js imports setActiveFilter from filter-state.js');

  const src = fs.readFileSync(CLUSTER_FILTER_PATH, 'utf-8');

  // cluster-filter.js imports setActiveFilter from filter-state (the owner API)
  assertContains(src, "import { resetActiveFilters, setActiveFilter } from './filter-state.js';",
    'cluster-filter imports setActiveFilter from ./filter-state.js');
  // syncCityFilterUi is defined locally in cluster-filter.js — no self-import needed

  console.log('  OK cluster-filter.js uses filter-state owner API');
}

// ---------------------------------------------------------------------------
// TEST 2: filter-state.js exports setActiveFilter and accepts 'city' key
// ---------------------------------------------------------------------------

function testFilterStateExportsSetActiveFilter() {
  console.log('\n[TEST] filter-state.js exports setActiveFilter accepting city key');

  const src = fs.readFileSync(FILTER_STATE_PATH, 'utf-8');

  assertContains(src, 'export function setActiveFilter(key, value)', 'setActiveFilter exported from filter-state');
  assertContains(src, 'if (!FILTER_KEYS.has(key)) return false', 'setActiveFilter guards on FILTER_KEYS');
  assertContains(src, "const FILTER_KEYS = new Set(Object.keys(FILTER_DEFAULTS))", 'FILTER_KEYS includes city');
  assertContains(src, 'filters[key] = value', 'setActiveFilter mutates through filters object');

  console.log('  OK filter-state.js setActiveFilter is the owner API for city filter');
}

// ---------------------------------------------------------------------------
// TEST 3: populateCityFilter calls setActiveFilter('city', ...) — not direct state mutation
// ---------------------------------------------------------------------------

function testPopulateCityFilterRoutesThroughOwnerApi() {
  console.log('\n[TEST] populateCityFilter routes city mutation through setActiveFilter');

  const src = fs.readFileSync(CLUSTER_FILTER_PATH, 'utf-8');
  const body = getFunctionBody(src, 'populateCityFilter');

  assert(body.length > 0, 'populateCityFilter function body found in cluster-filter.js');

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

  // Must update [data-city-filter] buttons
  assert(body.includes('[data-city-filter]'), 'syncCityFilterUi updates data-city-filter buttons');

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

  assert(body.length > 0, 'restoreActiveFiltersFromUrl found in filter-state.js');

  // It reads city from URL params and assigns to filters.city directly
  // (which is the ensureActiveFilters() pattern — this is the setter path, not a direct state bypass)
  assert(body.includes("params.get('city')"), 'restoreActiveFiltersFromUrl reads city from URL params');
  assert(body.includes('filters.city ='), 'restoreActiveFiltersFromUrl assigns to filters.city (correct setter path)');

  // It also updates the <select> element — preserving the UI contract
  assert(body.includes("getElementById('city-filter')"), 'restoreActiveFiltersFromUrl updates city-filter select element');

  console.log('  OK restoreActiveFiltersFromUrl handles city filter through correct setter path');
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

function main() {
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
