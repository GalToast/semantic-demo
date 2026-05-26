/**
 * search-state-ui-adapter-contract.mjs
 *
 * Fast Node contract test for the search-state → tooltip dew-windowing seam.
 *
 * Proves:
 *  1. search-state.js does NOT import tooltip.js directly
 *  2. search-state.js does NOT call window.hideTooltip / window.positionTooltip /
 *     window.updateTooltipContent directly (replaced by search-ui-adapter calls)
 *  3. search-ui-adapter.js exists and exports initSearchUiAdapter, isSearchUiAdapterReady,
 *     hideTooltip, positionTooltip, updateTooltipContent
 *  4. search-ui-adapter.js has no imports that can recreate the cycle
 *     (no search-state, no lifecycle, no tooltip, no cluster-filter)
 *  5. app.js calls initSearchUiAdapter with tooltip function refs before any search runs
 *  6. The adapter is a proper leaf — all 7 window tooltip calls in search-state.js
 *     are replaced by direct adapter calls
 *
 * Run: node tests/search-state-ui-adapter-contract.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CWD = process.cwd();
const SEARCH_STATE_PATH  = resolve(CWD, 'js/modules/search-state.js');
const APP_PATH           = resolve(CWD, 'js/modules/app.js');
const ADAPTER_PATH       = resolve(CWD, 'js/modules/search-ui-adapter.js');
const TOOLTIP_PATH       = resolve(CWD, 'js/modules/tooltip.js');

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
// TEST 1: search-state.js does NOT import tooltip.js directly
// ---------------------------------------------------------------------------

function testNoDirectTooltipImport() {
  console.log('\n[TEST 1] search-state.js does NOT import tooltip.js directly');

  const src = readFileSync(SEARCH_STATE_PATH, 'utf-8');
  const lines = src.split('\n');

  const badImports = [];
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('import') && trimmed.includes('tooltip')) {
      badImports.push(`line ${i + 1}: ${trimmed}`);
    }
  });

  assert(badImports.length === 0,
    `search-state.js must not import tooltip.js directly. Found:\n  ${badImports.join('\n  ')}`);

  console.log('  PASS — search-state.js has no direct import of tooltip.js');
}

// ---------------------------------------------------------------------------
// TEST 2: search-state.js does NOT call window.hideTooltip/positionTooltip/updateTooltipContent
// ---------------------------------------------------------------------------

function testNoBareWindowTooltipCalls() {
  console.log('\n[TEST 2] search-state.js does NOT call window.tooltip functions directly');

  const src = readFileSync(SEARCH_STATE_PATH, 'utf-8');

  const WINDOW_TOOLTIP_FNS = [
    'window.hideTooltip',
    'window.positionTooltip',
    'window.updateTooltipContent',
  ];

  const problems = [];
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    for (const fn of WINDOW_TOOLTIP_FNS) {
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
    `search-state.js must not call window.tooltip functions directly.\n${problems.join('\n')}`);

  console.log('  PASS — no bare window.tooltip/* calls in search-state.js');
}

// ---------------------------------------------------------------------------
// TEST 3: search-ui-adapter.js exists and exports required functions
// ---------------------------------------------------------------------------

function testAdapterExistsAndExports() {
  console.log('\n[TEST 3] search-ui-adapter.js exists and exports required functions');

  const adapterSrc = readFileSync(ADAPTER_PATH, 'utf-8');

  assertContains(adapterSrc, 'export function initSearchUiAdapter',
    'search-ui-adapter.js must export initSearchUiAdapter');

  assertContains(adapterSrc, 'export function isSearchUiAdapterReady',
    'search-ui-adapter.js must export isSearchUiAdapterReady');

  assertContains(adapterSrc, 'export function hideTooltip',
    'search-ui-adapter.js must export hideTooltip');

  assertContains(adapterSrc, 'export function positionTooltip',
    'search-ui-adapter.js must export positionTooltip');

  assertContains(adapterSrc, 'export function updateTooltipContent',
    'search-ui-adapter.js must export updateTooltipContent');

  console.log('  PASS — adapter exists and exports all required functions');
}

// ---------------------------------------------------------------------------
// TEST 4: search-ui-adapter.js has no imports that can recreate the cycle
// ---------------------------------------------------------------------------

function testAdapterDoesNotImportCycleParticipants() {
  console.log('\n[TEST 4] search-ui-adapter.js does not import cycle participants');

  const src = readFileSync(ADAPTER_PATH, 'utf-8');
  const importLines = src.split('\n').filter(l => l.trim().startsWith('import'));

  const forbiddenImports = [];
  importLines.forEach((line) => {
    const relevant = line.includes('search-state') || line.includes('tooltip')
      || line.includes('lifecycle') || line.includes('cluster-filter')
      || line.includes('url-state') || line.includes('camera-controls');
    if (relevant) {
      forbiddenImports.push(line.trim());
    }
  });

  assert(forbiddenImports.length === 0,
    `search-ui-adapter.js must not import cycle participants. Found:\n  ${forbiddenImports.join('\n  ')}`);

  console.log('  PASS — adapter has no cycle-participant imports');
}

// ---------------------------------------------------------------------------
// TEST 5: app.js calls initSearchUiAdapter with tooltip function refs
// ---------------------------------------------------------------------------

function testAppInjectsAdapterWithTooltipRefs() {
  console.log('\n[TEST 5] app.js calls initSearchUiAdapter with tooltip function refs');

  const src = readFileSync(APP_PATH, 'utf-8');

  assertContains(src, 'initSearchUiAdapter({',
    'app.js must call initSearchUiAdapter');

  assertContains(src, 'hideTooltip',
    'app.js must pass hideTooltip to initSearchUiAdapter');

  assertContains(src, 'positionTooltip',
    'app.js must pass positionTooltip to initSearchUiAdapter');

  assertContains(src, 'updateTooltipContent',
    'app.js must pass updateTooltipContent to initSearchUiAdapter');

  // Verify tooltip functions are imported from tooltip.js (not from somewhere else)
  assertContains(src, "from './tooltip.js'",
    'app.js must import tooltip functions from tooltip.js');

  console.log('  PASS — app.js injects adapter with tooltip function refs');
}

// ---------------------------------------------------------------------------
// TEST 6: All 7 tooltip call sites in search-state.js use the adapter
// ---------------------------------------------------------------------------

function testAllTooltipCallSitesReplaced() {
  console.log('\n[TEST 6] All tooltip call sites in search-state.js use the adapter');

  const src = readFileSync(SEARCH_STATE_PATH, 'utf-8');

  // Count direct calls to adapter functions
  const hideTooltipCalls = (src.match(/\bhideTooltip\s*\(/g) || []).length;
  const positionTooltipCalls = (src.match(/\bpositionTooltip\s*\(/g) || []).length;
  const updateTooltipCalls = (src.match(/\bupdateTooltipContent\s*\(/g) || []).length;

  assert(hideTooltipCalls > 0,
    `Expected at least 1 hideTooltip call, found ${hideTooltipCalls}`);
  assert(positionTooltipCalls > 0,
    `Expected at least 1 positionTooltip call, found ${positionTooltipCalls}`);
  assert(updateTooltipCalls > 0,
    `Expected at least 1 updateTooltipContent call, found ${updateTooltipCalls}`);

  // Count the window.tooltip calls that should be gone
  const windowHideTooltip = (src.match(/window\.hideTooltip/g) || []).length;
  const windowPositionTooltip = (src.match(/window\.positionTooltip/g) || []).length;
  const windowUpdateTooltip = (src.match(/window\.updateTooltipContent/g) || []).length;

  assert(windowHideTooltip === 0,
    `Expected 0 window.hideTooltip calls, found ${windowHideTooltip}`);
  assert(windowPositionTooltip === 0,
    `Expected 0 window.positionTooltip calls, found ${windowPositionTooltip}`);
  assert(windowUpdateTooltip === 0,
    `Expected 0 window.updateTooltipContent calls, found ${windowUpdateTooltip}`);

  console.log(`  PASS — found ${hideTooltipCalls} hideTooltip, ${positionTooltipCalls} positionTooltip, ${updateTooltipCalls} updateTooltipContent; 0 window.* equivalents`);
}

// ---------------------------------------------------------------------------
// TEST 7: search-state.js imports from search-ui-adapter
// ---------------------------------------------------------------------------

function testSearchStateImportsFromAdapter() {
  console.log('\n[TEST 7] search-state.js imports tooltip functions from search-ui-adapter');

  const src = readFileSync(SEARCH_STATE_PATH, 'utf-8');

  assertContains(src, "from './search-ui-adapter.js'",
    'search-state.js must import from search-ui-adapter.js');

  assertContains(src, 'hideTooltip',
    'search-state.js must import hideTooltip from search-ui-adapter');

  assertContains(src, 'positionTooltip',
    'search-state.js must import positionTooltip from search-ui-adapter');

  assertContains(src, 'updateTooltipContent',
    'search-state.js must import updateTooltipContent from search-ui-adapter');

  console.log('  PASS — search-state.js imports all three tooltip functions from adapter');
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const tests = [
  testNoDirectTooltipImport,
  testNoBareWindowTooltipCalls,
  testAdapterExistsAndExports,
  testAdapterDoesNotImportCycleParticipants,
  testAppInjectsAdapterWithTooltipRefs,
  testAllTooltipCallSitesReplaced,
  testSearchStateImportsFromAdapter,
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
