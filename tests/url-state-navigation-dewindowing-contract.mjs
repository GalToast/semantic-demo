/**
 * url-state-navigation-dewindowing-contract.mjs
 *
 * Fast Node contract test for the url-state → lifecycle/event-bindings dew-windowing seam.
 *
 * Proves:
 *  1. url-state.js does NOT call window.updateExplorationUi / window.focusOnPoint /
 *     window.recordSemanticLaneSnapshot / window.updateHasQuery / window.applyStoryPrompt /
 *     window.showExperienceToast / window.setSemanticDiveMode / window.setTrailDepth
 *  2. url-navigation-adapter.js exists and exports init + get adapter + all navigation calls
 *  3. url-state.js imports and uses url-navigation-adapter.js for all navigation calls
 *  4. url-navigation-adapter.js has no imports that can recreate cycles
 *  5. app.js calls initUrlNavigationAdapter before the first applyUrlState call
 *  6. restoreDepthFromUrlAfterFocus uses adapter applyDeepTrailMode (not direct window calls)
 *  7. No direct import cycle introduced
 *
 * Run: node tests/url-state-navigation-dewindowing-contract.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CWD = process.cwd();
const URL_STATE_PATH          = resolve(CWD, 'js/modules/url-state.js');
const APP_PATH                = resolve(CWD, 'js/modules/app.js');
const NAV_ADAPTER_PATH        = resolve(CWD, 'js/modules/url-navigation-adapter.js');
const LIFECYCLE_PATH          = resolve(CWD, 'js/modules/lifecycle.js');
const EVENT_BINDINGS_PATH     = resolve(CWD, 'js/modules/event-bindings.js');
const SEARCH_ADAPTER_PATH     = resolve(CWD, 'js/modules/url-search-adapter.js');

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
// TEST 1: url-state.js does NOT call window.updateExplorationUi / focusOnPoint /
//         recordSemanticLaneSnapshot / updateHasQuery / applyStoryPrompt /
//         showExperienceToast / setSemanticDiveMode / setTrailDepth directly
// ---------------------------------------------------------------------------

function testNoDirectWindowNavigationCalls() {
  console.log('\n[TEST 1] url-state.js does NOT call window.navigation/* functions directly');

  const src = readFileSync(URL_STATE_PATH, 'utf-8');

  // These are the navigation/lifecycle bridges that should NOT be called as window.*
  const WINDOW_NAV_FNS = [
    'window.updateExplorationUi',
    'window.focusOnPoint',
    'window.recordSemanticLaneSnapshot',
    'window.updateHasQuery',
    'window.applyStoryPrompt',
    'window.showExperienceToast',
    'window.setSemanticDiveMode',
    'window.setTrailDepth',
  ];

  const problems = [];
  const lines = src.split('\n');
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    for (const fn of WINDOW_NAV_FNS) {
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
    `url-state.js must not call window.navigation/* functions directly.\n${problems.join('\n')}`);

  console.log('  PASS — no bare window.navigation/* calls in url-state.js');
}

// ---------------------------------------------------------------------------
// TEST 2: url-navigation-adapter.js exists and exports init + get + all adapters
// ---------------------------------------------------------------------------

function testAdapterExistsAndExports() {
  console.log('\n[TEST 2] url-navigation-adapter.js exists and exports all required functions');

  const adapterSrc = readFileSync(NAV_ADAPTER_PATH, 'utf-8');

  assertContains(adapterSrc, 'export function initUrlNavigationAdapter',
    'url-navigation-adapter.js must export initUrlNavigationAdapter');
  assertContains(adapterSrc, 'export function getUrlNavigationAdapter',
    'url-navigation-adapter.js must export getUrlNavigationAdapter');
  assertContains(adapterSrc, 'export function updateExplorationUi',
    'url-navigation-adapter.js must export updateExplorationUi adapter');
  assertContains(adapterSrc, 'export function recordSemanticLaneSnapshot',
    'url-navigation-adapter.js must export recordSemanticLaneSnapshot adapter');
  assertContains(adapterSrc, 'export function updateHasQuery',
    'url-navigation-adapter.js must export updateHasQuery adapter');
  assertContains(adapterSrc, 'export function applyStoryPrompt',
    'url-navigation-adapter.js must export applyStoryPrompt adapter');
  assertContains(adapterSrc, 'export function showExperienceToast',
    'url-navigation-adapter.js must export showExperienceToast adapter');
  assertContains(adapterSrc, 'export function focusOnPoint',
    'url-navigation-adapter.js must export focusOnPoint adapter');
  assertContains(adapterSrc, 'export function applyDeepTrailMode',
    'url-navigation-adapter.js must export applyDeepTrailMode');

  console.log('  PASS — adapter exists and exports all required functions');
}

// ---------------------------------------------------------------------------
// TEST 3: url-state.js imports and uses url-navigation-adapter.js
// ---------------------------------------------------------------------------

function testUrlStateUsesAdapter() {
  console.log('\n[TEST 3] url-state.js imports and uses url-navigation-adapter.js');

  const src = readFileSync(URL_STATE_PATH, 'utf-8');

  assertContains(src, "from './url-navigation-adapter.js'",
    'url-state.js must import from url-navigation-adapter.js');
  assertContains(src, 'getUrlNavigationAdapter',
    'url-state.js must call getUrlNavigationAdapter');

  console.log('  PASS — url-state.js uses the navigation adapter');
}

// ---------------------------------------------------------------------------
// TEST 4: url-navigation-adapter.js has no imports that can recreate cycles
// ---------------------------------------------------------------------------

function testAdapterDoesNotImportCycleParticipants() {
  console.log('\n[TEST 4] url-navigation-adapter.js does not import cycle participants');

  const src = readFileSync(NAV_ADAPTER_PATH, 'utf-8');
  const importLines = src.split('\n').filter(l => l.trim().startsWith('import'));

  const forbiddenImports = [];
  importLines.forEach((line) => {
    if (line.includes('camera-controls') || line.includes('url-state') || line.includes('search-state')) {
      forbiddenImports.push(line.trim());
    }
  });

  assert(forbiddenImports.length === 0,
    `url-navigation-adapter.js must not import camera-controls, url-state, or search-state. Found:\n  ${forbiddenImports.join('\n  ')}`);

  console.log('  PASS — adapter has no cycle-participant imports');
}

// ---------------------------------------------------------------------------
// TEST 5: app.js calls initUrlNavigationAdapter before first applyUrlState call
// ---------------------------------------------------------------------------

function testAppInjectsAdapterBeforeApplyUrlState() {
  console.log('\n[TEST 5] app.js calls initUrlNavigationAdapter before first applyUrlState');

  const src = readFileSync(APP_PATH, 'utf-8');
  const lines = src.split('\n');

  let initNavCallLine = -1;
  let applyUrlStateLine = -1;

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.includes('initUrlNavigationAdapter')) initNavCallLine = i;
    if (trimmed.includes('applyUrlState') && !trimmed.includes('import') && !trimmed.includes('//')) applyUrlStateLine = i;
  });

  assert(initNavCallLine !== -1, 'app.js must call initUrlNavigationAdapter');
  assert(applyUrlStateLine !== -1, 'app.js must call applyUrlState');
  assert(initNavCallLine < applyUrlStateLine,
    `app.js must call initUrlNavigationAdapter BEFORE applyUrlState.\n` +
    `  initUrlNavigationAdapter at line ${initNavCallLine + 1}, applyUrlState at line ${applyUrlStateLine + 1}`);

  console.log(`  PASS — initUrlNavigationAdapter at line ${initNavCallLine + 1} < applyUrlState at line ${applyUrlStateLine + 1}`);
}

// ---------------------------------------------------------------------------
// TEST 6: restoreDepthFromUrlAfterFocus uses applyDeepTrailMode (not direct window calls)
// ---------------------------------------------------------------------------

function testRestoreDepthUsesAdapter() {
  console.log('\n[TEST 6] restoreDepthFromUrlAfterFocus uses applyDeepTrailMode adapter');

  const src = readFileSync(URL_STATE_PATH, 'utf-8');

  assertContains(src, 'applyDeepTrailMode',
    'restoreDepthFromUrlAfterFocus must call applyDeepTrailMode from the adapter');

  assertNotContains(src, 'typeof window.setSemanticDiveMode',
    'restoreDepthFromUrlAfterFocus must not check window.setSemanticDiveMode directly');
  assertNotContains(src, 'typeof window.setTrailDepth',
    'restoreDepthFromUrlAfterFocus must not check window.setTrailDepth directly');

  console.log('  PASS — restoreDepthFromUrlAfterFocus uses applyDeepTrailMode');
}

// ---------------------------------------------------------------------------
// TEST 7: No direct import cycle via camera-controls
// ---------------------------------------------------------------------------

function testNoDirectCameraControlsImport() {
  console.log('\n[TEST 7] No direct camera-controls import from url-state');

  const urlSrc = readFileSync(URL_STATE_PATH, 'utf-8');
  const navSrc = readFileSync(NAV_ADAPTER_PATH, 'utf-8');

  // url-state must NOT directly import camera-controls (that would close the cycle:
  //   url-state → camera-controls → lifecycle → url-state)
  assertNotContains(urlSrc, "from './camera-controls.js'",
    'url-state.js must not import camera-controls.js directly');

  // adapter must not import camera-controls, url-state, search-state
  const adapterImportLines = navSrc.split('\n').filter(l => l.trim().startsWith('import'));
  const forbiddenImports = [];
  adapterImportLines.forEach((line) => {
    if (line.includes('camera-controls') || line.includes('url-state') || line.includes('search-state')) {
      forbiddenImports.push(line.trim());
    }
  });
  assert(forbiddenImports.length === 0,
    `url-navigation-adapter.js must not import camera-controls, url-state, or search-state.\n  Found:\n  ${forbiddenImports.join('\n  ')}`);

  console.log('  PASS — no direct camera-controls import from url-state or navigation adapter');
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const tests = [
  testNoDirectWindowNavigationCalls,
  testAdapterExistsAndExports,
  testUrlStateUsesAdapter,
  testAdapterDoesNotImportCycleParticipants,
  testAppInjectsAdapterBeforeApplyUrlState,
  testRestoreDepthUsesAdapter,
  testNoDirectCameraControlsImport,
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
