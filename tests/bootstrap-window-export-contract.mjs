/**
 * bootstrap-window-export-contract.mjs
 *
 * MODERNIZED: Bootstrap Window Export Contract.
 *
 * This contract tracks the bootstrap dewindowing transition:
 * 1. lifecycle.js no longer assigns core functions to window.
 * 2. Internal dependencies are explicit module exports.
 * 3. window.state is retired; __APP_STATE__ / __TEST_STATE__ are the state hooks.
 *
 * Usage:
 *   node tests/bootstrap-window-export-contract.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const APP_PATH = path.join(ROOT, 'js/modules/app.js');
const LIFECYCLE_PATH = path.join(ROOT, 'js/modules/lifecycle.js');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function read(file) {
  return fs.readFileSync(file, 'utf-8');
}

const FORBIDDEN_SHIMS = [
  'setMyceliumMode',
  'setTrailDepth',
  'setSemanticDiveMode',
  'applyStoryPrompt',
  'resetExperienceState',
  'returnToOverview',
  'resetExplorationFocus',
  'refreshCompositionState',
  'focusOnPoint',
  'updateExplorationUi',
  'dispatchNavTransition',
  'updateUrlState',
  'switchView'
];

function testNoForbiddenShims() {
  console.log('\n[TEST 1] No forbidden window shims in lifecycle.js');

  const lcSrc = read(LIFECYCLE_PATH);

  for (const shim of FORBIDDEN_SHIMS) {
    const pattern = new RegExp(`window\\.${shim}\\s*=`, 'g');
    assert(!pattern.test(lcSrc), `lifecycle.js must NOT assign window.${shim}`);
    console.log(`  PASS — window.${shim} is retired`);
  }
}

function testLegitimateHooks() {
  console.log('\n[TEST 2] Verifying legitimate test hooks');
  const appSrc = read(APP_PATH);

  assert(/window\.__APP_STATE__\s*=\s*state/.test(appSrc), 'app.js should retain window.__APP_STATE__ hook');
  assert(/window\.__TEST_STATE__\s*=\s*state/.test(appSrc), 'app.js should retain window.__TEST_STATE__ fallback hook');
  assert(!/window\.state\s*=\s*state/.test(appSrc), 'app.js must not reintroduce retired window.state hook');
  console.log('  PASS — test hooks confirmed');
}

function testAppActionsNamespace() {
  console.log('\n[TEST 4] Verifying __APP_ACTIONS__ namespace is assigned');
  const appSrc = read(APP_PATH);

  assert(/window\.__APP_ACTIONS__\s*=\s*\{/.test(appSrc), 'app.js should assign window.__APP_ACTIONS__ namespace');
  const keys = ['search','clearSearch','focusOnNode','setTrailDepth','setSemanticDiveMode','returnToOverview','resetExplorationFocus','refreshCompositionState'];
  for (const key of keys) {
    assert(new RegExp(`${key}(?::|\\s*[,}])`).test(appSrc), `__APP_ACTIONS__ should contain key: ${key}`);
  }
  console.log('  PASS — __APP_ACTIONS__ namespace verified');
}
  function testRecenterBridgeRetired() {
  console.log('\n[TEST 3] Verifying recenterFocusedNode bridge is retired from lifecycle.js');
  const lcSrc = read(LIFECYCLE_PATH);

  assert(!/window\.recenterFocusedNode\s*=/.test(lcSrc), 'lifecycle.js must not reintroduce window.recenterFocusedNode bridge');
  console.log('  PASS — recenterFocusedNode bridge remains retired');
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

console.log('=================================================================');
console.log('bootstrap-window-export-contract.mjs (MODERNIZED)');
console.log('Contract: bootstrap state hook and lifecycle shim ownership');
console.log('=================================================================');

try {
  testNoForbiddenShims();
  testLegitimateHooks();
  testRecenterBridgeRetired();
  testAppActionsNamespace();

  console.log('\n=================================================================');
  console.log('ALL DEWINDOWING RULES PASSED');
  console.log('=================================================================');
  process.exit(0);
} catch (err) {
  console.error('\nTEST FAILED:', err.message);
  process.exit(1);
}
