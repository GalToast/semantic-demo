/**
 * Contract for the app/demo startup seam.
 *
 * Keeps app.js from re-owning demo node selection or readiness polling.
 * The current path is:
 *   app.js imports demo-controller.js and micro-demo.js
 *   app.js calls demoController.init() once after launch
 *   demo-controller.js owns readiness guards
 *   micro-demo.js owns showcase node selection
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const appSource = fs.readFileSync(path.join(ROOT, 'js/modules/app.js'), 'utf8');
const microDemoSource = fs.readFileSync(path.join(ROOT, 'js/modules/micro-demo.js'), 'utf8');
const demoControllerSource = fs.readFileSync(path.join(ROOT, 'js/modules/demo-controller.js'), 'utf8');

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

test('app imports demo-controller and micro-demo for the active demo path', () => {
  assert(/import\s+[\s\S]*['"]\.\/demo-controller\.js['"]/.test(appSource), 'app.js must import demo-controller.js');
  assert(/import\s+['"]\.\/micro-demo\.js['"]/.test(appSource), 'app.js must import micro-demo.js');
});

test('app does not own showcase pool selection', () => {
  assert(!/\bSHOWCASE_POOL\b/.test(appSource), 'SHOWCASE_POOL must not be defined in app.js');
  assert(!/_selectedDemoIndex/.test(appSource), '_selectedDemoIndex must not be assigned in app.js');
  assert(!/\bshuffleArray\b/.test(appSource), 'demo shuffle helpers must not live in app.js');
});

test('app does not poll overlay readiness for the demo', () => {
  assert(!/pollForOverlayHidden/.test(appSource), 'app.js must not define pollForOverlayHidden');
  assert(!/setInterval\(\s*\(\)\s*=>[\s\S]{0,600}demoController\.init/.test(appSource), 'app.js must not interval-poll before demoController.init');
});

test('app hands off to demoController.init once in the launch path', () => {
  const initCalls = appSource.match(/demoController\?\.init\(\)/g) || appSource.match(/demoController\.init\(\)/g) || [];
  assert(initCalls.length === 1, `expected one optional demoController.init call, found ${initCalls.length}`);
});

test('demo-controller owns scene readiness', () => {
  assert(/function\s+waitForSceneReady\s*\(/.test(demoControllerSource), 'demo-controller.js must define waitForSceneReady');
  assert(/loading-overlay/.test(demoControllerSource), 'demo-controller readiness must check the loading overlay');
});

test('micro-demo owns the active showcase pool', () => {
  assert(/\bconst\s+SHOWCASE_POOL\s*=/.test(microDemoSource), 'micro-demo.js must define the active SHOWCASE_POOL');
  assert(/\bfunction\s+_getDemoNode\s*\(/.test(microDemoSource), 'micro-demo.js must define _getDemoNode');
  assert(!/_selectedDemoIndex/.test(microDemoSource), 'micro-demo.js must not depend on app-selected demo index');
});

test('micro-demo owns captured overview return camera behavior', () => {
  assert(/let\s+_overviewCameraSnapshot\s*=\s*null/.test(microDemoSource), 'micro-demo.js must keep overview snapshot state');
  assert(/function\s+_captureOverviewCameraSnapshot\s*\(/.test(microDemoSource), 'micro-demo.js must capture overview camera pose');
  assert(/function\s+_getOverviewCameraSnapshot\s*\(/.test(microDemoSource), 'micro-demo.js must provide fallback overview pose');
  assert(/function\s+_animateCameraToOverview\s*\(/.test(microDemoSource), 'micro-demo.js must centralize return-to-overview animation');
  assert(/_captureOverviewCameraSnapshot\(\);[\s\S]{0,800}Suspend auto-rotate/.test(microDemoSource) || /_captureOverviewCameraSnapshot\(\);/.test(microDemoSource), 'micro-demo must capture overview before demo camera movement');
});

test('micro-demo return and cancel use captured overview helper', () => {
  assert(/_animateCameraToOverview\(1000\)/.test(microDemoSource), 'scheduled return must use captured overview helper');
  assert(/_animateCameraToOverview\(800\)/.test(microDemoSource), 'cancel return must use captured overview helper');
  const hardcodedOverviewMatches = microDemoSource.match(/new\s+THREE\.Vector3\(\s*0,\s*3\.5,\s*5\s*\)/g) || [];
  assert(hardcodedOverviewMatches.length === 1, `fallback overview camera should be the only hardcoded overview vector, found ${hardcodedOverviewMatches.length}`);
  const hardcodedTargetMatches = microDemoSource.match(/new\s+THREE\.Vector3\(\s*0,\s*0,\s*0\s*\)/g) || [];
  assert(hardcodedTargetMatches.length === 1, `fallback overview target should be the only hardcoded target vector, found ${hardcodedTargetMatches.length}`);
  assert(/prefers-reduced-motion:\s*reduce/.test(microDemoSource), 'return-to-overview helper must consult reduced-motion preference');
  assert(/state\.camera\.position\.copy\(overviewPos\)/.test(microDemoSource), 'reduced-motion return must snap camera position');
  assert(/state\.controls\.target\.copy\(overviewTarget\)/.test(microDemoSource), 'reduced-motion return must snap controls target');
});

console.log(`\n${'-'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'-'.repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);
