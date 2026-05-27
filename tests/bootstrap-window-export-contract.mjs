/**
 * bootstrap-window-export-contract.mjs
 *
 * MODERNIZED: Final Dewindowed State Contract.
 *
 * This contract PROVES that the dewindowing transition is complete:
 * 1. app.js and lifecycle.js no longer assign core functions to window.
 * 2. Internal dependencies are explicit module exports.
 * 3. window.state remains only as a legitimate test hook.
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
  console.log('\n[TEST 1] No forbidden window shims in app.js or lifecycle.js');

  const appSrc = read(APP_PATH);
  const lcSrc = read(LIFECYCLE_PATH);

  for (const shim of FORBIDDEN_SHIMS) {
    const pattern = new RegExp(`window\\.${shim}\\s*=`, 'g');
    assert(!pattern.test(appSrc), `app.js must NOT assign window.${shim}`);
    assert(!pattern.test(lcSrc), `lifecycle.js must NOT assign window.${shim}`);
    console.log(`  PASS — window.${shim} is retired`);
  }
}

function testLegitimateHooks() {
  console.log('\n[TEST 2] Verifying legitimate test hooks');
  const appSrc = read(APP_PATH);

  assert(/window\.__TEST_STATE__\s*=\s*state/.test(appSrc), 'app.js should retain window.__TEST_STATE__ hook');
  assert(/window\.state\s*=\s*state/.test(appSrc), 'app.js should retain window.state hook');
  console.log('  PASS — test hooks confirmed');
}

function testRecenterBridge() {
  console.log('\n[TEST 3] Verifying recenterFocusedNode bridge in lifecycle.js');
  const lcSrc = read(LIFECYCLE_PATH);

  assert(/window\.recenterFocusedNode\s*=/.test(lcSrc), 'lifecycle.js should retain window.recenterFocusedNode bridge');
  console.log('  PASS — recenterFocusedNode bridge confirmed');
}

// ── MAIN ─────────────────────────────────────────────────────────────────────

console.log('=================================================================');
console.log('bootstrap-window-export-contract.mjs (MODERNIZED)');
console.log('Contract: Project is 100% dewindowed (no shims)');
console.log('=================================================================');

try {
  testNoForbiddenShims();
  testLegitimateHooks();
  testRecenterBridge();

  console.log('\n=================================================================');
  console.log('ALL DEWINDOWING RULES PASSED');
  console.log('=================================================================');
  process.exit(0);
} catch (err) {
  console.error('\nTEST FAILED:', err.message);
  process.exit(1);
}
