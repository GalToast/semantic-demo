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
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(process.cwd());
const APP_PATH = path.join(ROOT, 'js/modules/app.js');
const BRIDGE_REGISTRY_PATH = path.join(ROOT, 'js/modules/bridge-registry.js');
const LIFECYCLE_PATH = path.join(ROOT, 'js/modules/lifecycle.js');
const TESTS_DIR = path.join(ROOT, 'tests');
const THIS_FILE = fileURLToPath(import.meta.url);

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function read(file) {
  return fs.readFileSync(file, 'utf-8');
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath);
    return fullPath;
  });
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
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

const APP_ACTION_KEYS = [
  'search',
  'clearSearch',
  'focusOnNode',
  'setTrailFromSeed',
  'setTrailDepth',
  'setSemanticDiveMode',
  'returnToOverview',
  'resetExperienceState',
  'resetExplorationFocus',
  'refreshCompositionState',
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
  const bridgeSrc = read(BRIDGE_REGISTRY_PATH);

  assert(/window\.__APP_STATE__\s*=\s*state/.test(bridgeSrc), 'bridge-registry.js should retain window.__APP_STATE__ hook');
  assert(/window\.__TEST_STATE__\s*=\s*state/.test(bridgeSrc), 'bridge-registry.js should retain window.__TEST_STATE__ fallback hook');
  assert(!/window\.state\s*=\s*state/.test(appSrc), 'app.js must not reintroduce retired window.state hook');
  assert(!/window\.state\s*=\s*state/.test(bridgeSrc), 'bridge-registry.js must not reintroduce retired window.state hook');
  console.log('  PASS — test hooks confirmed');
}

function testAppActionsNamespace() {
  console.log('\n[TEST 4] Verifying __APP_ACTIONS__ namespace is assigned');
  const appSrc = read(APP_PATH);
  const bridgeSrc = read(BRIDGE_REGISTRY_PATH);

  assert(/window\.__APP_ACTIONS__\s*=\s*\{/.test(bridgeSrc), 'bridge-registry.js should assign window.__APP_ACTIONS__ namespace');
  for (const key of APP_ACTION_KEYS) {
    const objectLiteralKey = new RegExp(`${key}(?::|\\s*[,}])`).test(bridgeSrc);
    const propertyAssignment = new RegExp(`window\\.__APP_ACTIONS__\\.${key}\\s*=`).test(bridgeSrc);
    assert(objectLiteralKey || propertyAssignment, `__APP_ACTIONS__ should contain key: ${key}`);
  }
  assert(
    /setTrailFromSeed:\s*actions\.setTrailFromSeed/.test(bridgeSrc) &&
      /setTrailFromSeed:\s*journeyModule\.setTrailFromSeed/.test(appSrc),
    '__APP_ACTIONS__.setTrailFromSeed should bind journeyModule.setTrailFromSeed through bridge-registry actions'
  );
  console.log('  PASS — __APP_ACTIONS__ namespace verified');
}

function testNoBareAppActionTestCalls() {
  console.log('\n[TEST 5] No bare window app-action test invocations');

  const scanned = walk(TESTS_DIR)
    .filter((file) => /\.(?:mjs|js)$/.test(file))
    .filter((file) => path.resolve(file) !== THIS_FILE);
  const offenders = [];
  const keys = APP_ACTION_KEYS.join('|');
  const bareCallPattern = new RegExp(`window\\.(${keys})\\s*(?:\\?\\.)?\\s*\\(`);
  const fallbackPattern = new RegExp(`\\?\\?\\s*window\\.(${keys})\\b`);

  for (const file of scanned) {
    const src = stripComments(read(file));
    const lines = src.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (bareCallPattern.test(line) || fallbackPattern.test(line)) {
        offenders.push(`${path.relative(ROOT, file)}:${index + 1}: ${line.trim()}`);
      }
    });
  }

  assert(
    offenders.length === 0,
    `test callers must use window.__APP_ACTIONS__ for app actions; offenders:\n${offenders.join('\n')}`
  );
  console.log('  PASS — test app-action calls use __APP_ACTIONS__');
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
  testNoBareAppActionTestCalls();

  console.log('\n=================================================================');
  console.log('ALL DEWINDOWING RULES PASSED');
  console.log('=================================================================');
  process.exit(0);
} catch (err) {
  console.error('\nTEST FAILED:', err.message);
  process.exit(1);
}
