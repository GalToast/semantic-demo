/**
 * journey-cluster-accent-dewindowing-contract.mjs
 *
 * Fast Node contract test verifying journey.js uses direct import of
 * applyClusterUiAccent from cluster-ui-accent.js and has no remaining
 * window.applyClusterUiAccent calls outside the app.js compatibility bridge.
 *
 * Source-only — no DOM, no Playwright, no browser.
 * Runs in Node.
 *
 * Usage:
 *   node tests/journey-cluster-accent-dewindowing-contract.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const SEMDEMO_ROOT = path.resolve(process.cwd());
const JOURNEY_PATH = path.join(SEMDEMO_ROOT, 'js/modules/journey.js');
const CLUSTER_UI_ACCENT_PATH = path.join(SEMDEMO_ROOT, 'js/modules/cluster-ui-accent.js');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function assertHasSubstring(src, needle, label) {
  assert(src.includes(needle), `${label}: source must contain "${needle}"`);
}

function assertNotHasSubstring(src, needle, label) {
  assert(!src.includes(needle), `${label}: source must NOT contain "${needle}"`);
}

// ---------------------------------------------------------------------------
// TEST 1: journey.js imports applyClusterUiAccent from cluster-ui-accent.js
// ---------------------------------------------------------------------------

function testImportExists() {
  console.log('\n[TEST] journey.js imports applyClusterUiAccent from cluster-ui-accent.js');

  const src = fs.readFileSync(JOURNEY_PATH, 'utf-8');

  // The import must exist
  assertHasSubstring(src, "import { applyClusterUiAccent } from './cluster-ui-accent.js';",
    'journey.js import from cluster-ui-accent');

  console.log('  OK direct import verified');
}

// ---------------------------------------------------------------------------
// TEST 2: cluster-ui-accent.js exports applyClusterUiAccent
// ---------------------------------------------------------------------------

function testExportExists() {
  console.log('\n[TEST] cluster-ui-accent.js exports applyClusterUiAccent');

  const src = fs.readFileSync(CLUSTER_UI_ACCENT_PATH, 'utf-8');

  // Either "export function applyClusterUiAccent" or "export { applyClusterUiAccent }" satisfies the contract
  const hasDirectExport = src.includes('export function applyClusterUiAccent');
  const hasReExport = src.includes('export { applyClusterUiAccent }') || src.includes('export { applyClusterUiAccent as');
  assert(hasDirectExport || hasReExport, 'cluster-ui-accent must export applyClusterUiAccent (direct or re-export)');

  console.log('  OK export verified');
}

// ---------------------------------------------------------------------------
// TEST 3: journey.js has NO window.applyClusterUiAccent call sites
// ---------------------------------------------------------------------------

function testNoWindowCalls() {
  console.log('\n[TEST] journey.js has no window.applyClusterUiAccent calls');

  const src = fs.readFileSync(JOURNEY_PATH, 'utf-8');

  // window.applyClusterUiAccent should appear nowhere in journey.js
  assertNotHasSubstring(src, 'window.applyClusterUiAccent',
    'journey.js must not call window.applyClusterUiAccent');

  console.log('  OK no window.applyClusterUiAccent calls remain');
}

// ---------------------------------------------------------------------------
// TEST 4: No accidental import of applyClusterUiAccent from the wrong place
// ---------------------------------------------------------------------------

function testNoDuplicateLocalDefinition() {
  console.log('\n[TEST] journey.js does not re-define applyClusterUiAccent locally');

  const src = fs.readFileSync(JOURNEY_PATH, 'utf-8');

  // journey.js must not define its own applyClusterUiAccent
  assertNotHasSubstring(src, 'function applyClusterUiAccent',
    'journey.js must not define local applyClusterUiAccent');
  assertNotHasSubstring(src, 'const applyClusterUiAccent',
    'journey.js must not define const applyClusterUiAccent');

  console.log('  OK no local re-definition found');
}

// ---------------------------------------------------------------------------
// TEST 5: syncFocusStage and updateSelectedBusiness use applyClusterUiAccent
//         directly (not window.applyClusterUiAccent)
// ---------------------------------------------------------------------------

function testDirectUsage() {
  console.log('\n[TEST] syncFocusStage and updateSelectedBusiness call applyClusterUiAccent directly');

  const src = fs.readFileSync(JOURNEY_PATH, 'utf-8');

  // Within syncFocusStage (around lines 1132-1180), applyClusterUiAccent must be called directly
  const syncFocusStageMatch = src.match(/export function syncFocusStage[\s\S]{0,2000}/);
  assert(syncFocusStageMatch, 'syncFocusStage function must exist');
  const syncFocusStageBody = syncFocusStageMatch[0];
  assert(syncFocusStageBody.includes('applyClusterUiAccent(stageCard'),
    'syncFocusStage must call applyClusterUiAccent(stageCard, ...) directly');
  assert(!syncFocusStageBody.includes('window.applyClusterUiAccent'),
    'syncFocusStage must not call window.applyClusterUiAccent');

  // Within updateSelectedBusiness, applyClusterUiAccent(cardEl, point/point) calls must exist directly
  const updateSelectedMatch = src.match(/export function updateSelectedBusiness[\s\S]{0,3000}/);
  assert(updateSelectedMatch, 'updateSelectedBusiness function must exist');
  const updateSelectedBody = updateSelectedMatch[0];
  assert(updateSelectedBody.includes('applyClusterUiAccent(cardEl'),
    'updateSelectedBusiness must call applyClusterUiAccent(cardEl, ...) directly');
  assert(!updateSelectedBody.includes('window.applyClusterUiAccent'),
    'updateSelectedBusiness must not call window.applyClusterUiAccent');

  console.log('  OK direct calls verified in syncFocusStage and updateSelectedBusiness');
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

function main() {
  console.log('================================================================');
  console.log('journey-cluster-accent-dewindowing-contract.mjs');
  console.log('Contract: journey.js uses direct import, no window bridge calls');
  console.log('================================================================');

  try {
    testImportExists();
    testExportExists();
    testNoWindowCalls();
    testNoDuplicateLocalDefinition();
    testDirectUsage();

    console.log('\n================================================================');
    console.log('ALL TESTS PASSED');
    console.log('================================================================');
    process.exit(0);
  } catch (err) {
    console.error('\nTEST FAILED:', err.message);
    process.exit(1);
  }
}

main();