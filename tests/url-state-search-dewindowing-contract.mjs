/**
 * url-state-search-dewindowing-contract.mjs
 *
 * Fast Node contract test for the url-state → search dew-windowing seam.
 *
 * Proves:
 *  1. url-state.js does NOT import search-state.js directly (no new cycle)
 *  2. url-state.js does NOT call window.search / window.getFilteredIndices /
 *     window.activateSearchGlow / window.syncSearchStatusForFocus /
 *     window.updateSearchStatusMessage / window.updateSearchTrailCue directly
 *  3. url-search-adapter.js exists and exports initUrlSearchAdapter + getUrlSearchAdapter
 *  4. url-state.js imports and uses getUrlSearchAdapter from url-search-adapter.js
 *  5. url-search-adapter.js has no imports that can recreate the cycle
 *  6. app.js calls initUrlSearchAdapter before the first applyUrlState call
 *  7. No new import cycle is created
 *
 * Run: node tests/url-state-search-dewindowing-contract.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CWD = process.cwd();
const URL_STATE_PATH    = resolve(CWD, 'js/modules/url-state.js');
const APP_PATH          = resolve(CWD, 'js/modules/app.js');
const ADAPTER_PATH      = resolve(CWD, 'js/modules/url-search-adapter.js');
const SEARCH_STATE_PATH = resolve(CWD, 'js/modules/search-state.js');
const CAMERA_PATH       = resolve(CWD, 'js/modules/camera-controls.js');

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
// TEST 1: url-state.js does NOT import search-state.js directly
// ---------------------------------------------------------------------------

function testNoDirectSearchStateImport() {
  console.log('\n[TEST 1] url-state.js does NOT import search-state.js directly');

  const src = readFileSync(URL_STATE_PATH, 'utf-8');
  const lines = src.split('\n');

  // Check all import lines for search-state.js
  const badImports = [];
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('import') && trimmed.includes('search-state')) {
      badImports.push(`line ${i + 1}: ${trimmed}`);
    }
  });

  assert(badImports.length === 0,
    `url-state.js must not import search-state.js directly. Found:\n  ${badImports.join('\n  ')}`);

  console.log('  PASS — url-state.js has no direct import of search-state.js');
}

// ---------------------------------------------------------------------------
// TEST 2: url-state.js does NOT call window.search / getFilteredIndices / etc.
// ---------------------------------------------------------------------------

function testNoBareWindowSearchCalls() {
  console.log('\n[TEST 2] url-state.js does NOT call window.search/* functions directly');

  const src = readFileSync(URL_STATE_PATH, 'utf-8');

  // These are the search bridges that should NOT be called as window.*
  const WINDOW_SEARCH_FNS = [
    'window.search',
    'window.getFilteredIndices',
    'window.activateSearchGlow',
    'window.syncSearchStatusForFocus',
    'window.updateSearchStatusMessage',
    'window.updateSearchTrailCue',
    'window.applyFilters',
  ];

  const problems = [];
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    for (const fn of WINDOW_SEARCH_FNS) {
      const pos = trimmed.indexOf(fn);
      if (pos === -1) continue;
      // Allow if it's inside a typeof guard: typeof window.fn === 'function'
      const before = trimmed.substring(0, pos);
      if (before.includes('typeof')) continue;
      // Allow if it's inside a comment
      if (trimmed.trimStart().startsWith('//') || trimmed.trimStart().startsWith('*')) continue;
      problems.push(`  line ${i + 1}: ${trimmed}`);
    }
  });

  assert(problems.length === 0,
    `url-state.js must not call window.search/* functions directly.\n${problems.join('\n')}`);

  console.log('  PASS — no bare window.search/* calls in url-state.js');
}

// ---------------------------------------------------------------------------
// TEST 3: url-search-adapter.js exists and exports initUrlSearchAdapter
// ---------------------------------------------------------------------------

function testAdapterExistsAndExports() {
  console.log('\n[TEST 3] url-search-adapter.js exists and exports init + get adapter');

  const adapterSrc = readFileSync(ADAPTER_PATH, 'utf-8');

  assertContains(adapterSrc, 'export function initUrlSearchAdapter',
    'url-search-adapter.js must export initUrlSearchAdapter');

  assertContains(adapterSrc, 'export function getUrlSearchAdapter',
    'url-search-adapter.js must export getUrlSearchAdapter');

  console.log('  PASS — adapter exists and exports both functions');
}

// ---------------------------------------------------------------------------
// TEST 4: url-state.js imports and uses getUrlSearchAdapter
// ---------------------------------------------------------------------------

function testUrlStateUsesAdapter() {
  console.log('\n[TEST 4] url-state.js imports and uses getUrlSearchAdapter');

  const src = readFileSync(URL_STATE_PATH, 'utf-8');

  assertContains(src, "from './url-search-adapter.js'",
    'url-state.js must import from url-search-adapter.js');

  assertContains(src, 'getUrlSearchAdapter',
    'url-state.js must call getUrlSearchAdapter');

  console.log('  PASS — url-state.js uses the adapter');
}

// ---------------------------------------------------------------------------
// TEST 5: url-search-adapter.js has no imports that can recreate the cycle
// ---------------------------------------------------------------------------

function testAdapterDoesNotImportCycleParticipants() {
  console.log('\n[TEST 5] url-search-adapter.js does not import cycle participants');

  const src = readFileSync(ADAPTER_PATH, 'utf-8');
  const importLines = src.split('\n').filter(l => l.trim().startsWith('import'));

  const forbiddenImports = [];
  importLines.forEach((line) => {
    if (line.includes('camera-controls') || line.includes('url-state') || line.includes('search-state')) {
      forbiddenImports.push(line.trim());
    }
  });

  assert(forbiddenImports.length === 0,
    `url-search-adapter.js must not import camera-controls, url-state, or search-state. Found:\n  ${forbiddenImports.join('\n  ')}`);

  console.log('  PASS — adapter has no cycle-participant imports');
}

// ---------------------------------------------------------------------------
// TEST 6: app.js calls initUrlSearchAdapter before first applyUrlState call
// ---------------------------------------------------------------------------

function testAppInjectsAdapterBeforeApplyUrlState() {
  console.log('\n[TEST 6] app.js calls initUrlSearchAdapter before first applyUrlState');

  const src = readFileSync(APP_PATH, 'utf-8');
  const lines = src.split('\n');

  let initCallLine = -1;
  let applyUrlStateLine = -1;

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.includes('initUrlSearchAdapter')) initCallLine = i;
    if (trimmed.includes('applyUrlState') && !trimmed.includes('import')) applyUrlStateLine = i;
  });

  assert(initCallLine !== -1, 'app.js must call initUrlSearchAdapter');
  assert(applyUrlStateLine !== -1, 'app.js must call applyUrlState');
  assert(initCallLine < applyUrlStateLine,
    `app.js must call initUrlSearchAdapter BEFORE applyUrlState.\n` +
    `  initUrlSearchAdapter at line ${initCallLine + 1}, applyUrlState at line ${applyUrlStateLine + 1}`);

  console.log(`  PASS — initUrlSearchAdapter at line ${initCallLine + 1} < applyUrlState at line ${applyUrlStateLine + 1}`);
}

// ---------------------------------------------------------------------------
// TEST 7: No new import cycle
// ---------------------------------------------------------------------------

function testNoImportCycle() {
  console.log('\n[TEST 7] No new import cycle introduced');

  // Cycle chain: search-state → camera-controls → url-state → search-state?
  // With the adapter, url-state imports url-search-adapter, NOT search-state directly.
  // url-search-adapter imports no cycle participants.

  const searchSrc = readFileSync(SEARCH_STATE_PATH, 'utf-8');
  const cameraSrc = readFileSync(CAMERA_PATH, 'utf-8');
  const adapterSrc = readFileSync(ADAPTER_PATH, 'utf-8');
  const urlSrc = readFileSync(URL_STATE_PATH, 'utf-8');

  // search-state must NOT import url-state
  assertNotContains(searchSrc, 'url-state',
    'search-state.js must not import url-state.js');

  // url-state must NOT directly import search-state (the cycle would be direct)
  assertNotContains(urlSrc, "from './search-state.js'",
    'url-state.js must not import search-state.js directly');

  assertNotContains(urlSrc, "from './camera-controls.js'",
    'url-state.js must not import camera-controls.js directly');

  // adapter must not import camera-controls or url-state (check only import lines, not comments)
  const adapterImportLines = adapterSrc.split('\n').filter(l => l.trim().startsWith('import'));
  const forbiddenImports = [];
  adapterImportLines.forEach((line) => {
    if (line.includes('camera-controls') || line.includes('url-state') || line.includes('search-state')) {
      forbiddenImports.push(line.trim());
    }
  });

  assert(forbiddenImports.length === 0,
    `url-search-adapter.js must not import camera-controls, url-state, or search-state via actual import statements.\n  Found:\n  ${forbiddenImports.join('\n  ')}`);

  console.log('  PASS — no direct cycle path exists through the adapter');
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const tests = [
  testNoDirectSearchStateImport,
  testNoBareWindowSearchCalls,
  testAdapterExistsAndExports,
  testUrlStateUsesAdapter,
  testAdapterDoesNotImportCycleParticipants,
  testAppInjectsAdapterBeforeApplyUrlState,
  testNoImportCycle,
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
