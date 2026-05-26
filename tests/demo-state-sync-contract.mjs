/**
 * Contract for the demo/app state synchronization, storage decoupling,
 * and sidebar reveal behaviors.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const microDemoSource = fs.readFileSync(path.join(ROOT, 'js/modules/micro-demo.js'), 'utf8');
const demoControllerSource = fs.readFileSync(path.join(ROOT, 'js/modules/demo-controller.js'), 'utf8');
const eventBindingsSource = fs.readFileSync(path.join(ROOT, 'js/modules/event-bindings.js'), 'utf8');

let passed = 0;
let failed = 0;

function ok(message) {
  console.log(`  ok ${message}`);
  passed += 1;
}

function fail(message) {
  console.log(`  FAIL ${message}`);
  failed += 1;
}

function test(message, fn) {
  try {
    fn();
    ok(message);
  } catch (error) {
    fail(message);
    console.log(`        ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log('=== Running Demo State Sync Contract Checks ===');

test('demo-controller.js imports state from ../state.js', () => {
  assert(/import\s*\{\s*state\s*\}\s*from\s*['"]\.\.\/state\.js['"]/.test(demoControllerSource), 'demo-controller.js must import state');
});

test('demo-controller.js references state.controls instead of window._orbitControls', () => {
  assert(/state\.controls/.test(demoControllerSource), 'demo-controller.js must reference state.controls');
  assert(!/window\._orbitControls/.test(demoControllerSource), 'demo-controller.js must not reference window._orbitControls');
});

test('demo-controller.js does not reference window._app', () => {
  assert(!/window\._app\b/.test(demoControllerSource), 'demo-controller.js must not reference window._app');
});

test('micro-demo.js uses SESSION_STORAGE_KEY of moco_mycelium_demo_session_v1', () => {
  assert(/SESSION_STORAGE_KEY\s*=\s*['"]moco_mycelium_demo_session_v1['"]/.test(microDemoSource), 'micro-demo.js must define SESSION_STORAGE_KEY as moco_mycelium_demo_session_v1');
  assert(!/STORAGE_KEY\s*=\s*['"]moco_mycelium_demo_v1['"]/.test(microDemoSource), 'micro-demo.js must not define STORAGE_KEY as moco_mycelium_demo_v1');
});

test('micro-demo.js checks for demo=force parameter in shouldRunMicroDemo and startMicroDemo', () => {
  const forceMatches = microDemoSource.match(/params\.get\(['"]demo['"]\)\s*===\s*['"]force['"]/g) || [];
  assert(forceMatches.length >= 2, `expected at least two demo=force parameter checks, found ${forceMatches.length}`);
});

test('micro-demo.js uses setInfoPanelOpen(false) at T=7200ms instead of raw slide-in-left manipulation', () => {
  assert(!/classList\.remove\(['"]slide-in-left['"]\)/.test(microDemoSource), 'micro-demo.js must not directly remove slide-in-left class');
  assert(/setInfoPanelOpen\(\s*false\s*\)/.test(microDemoSource), 'micro-demo.js must call setInfoPanelOpen(false) at T=7200ms');
});

test('micro-demo.js calls setInfoPanelOpen(true) via __demoReset (called from _resetAppState)', () => {
  // _resetAppState delegates to __demoReset, which contains all demo state writes
  assert(/_resetAppState\b[\s\S]*?__demoReset\(\)/.test(microDemoSource), '_resetAppState must call __demoReset()');
  assert(/function __demoReset\(\)[\s\S]*?setInfoPanelOpen\(\s*true\s*\)/.test(microDemoSource), '__demoReset must call window.setInfoPanelOpen(true)');
});

test('event-bindings.js defines revealSelectedBusinessCard', () => {
  assert(/export\s+function\s+revealSelectedBusinessCard/.test(eventBindingsSource), 'event-bindings.js must export revealSelectedBusinessCard');
  assert(/revealSelectedBusinessCard\(\)\s*\{[\s\S]*?setInfoPanelOpen\(\s*true\s*\)/.test(eventBindingsSource), 'revealSelectedBusinessCard must call setInfoPanelOpen(true)');
});

console.log(`\n${'-'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'-'.repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);
