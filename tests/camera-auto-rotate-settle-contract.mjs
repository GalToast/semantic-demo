/**
 * camera-auto-rotate-settle-contract.mjs
 *
 * Fast source contract for camera auto-rotate settle behavior. This keeps the
 * seam covered without importing lifecycle.js, whose top-level window bindings
 * make a tiny Node harness unnecessarily brittle.
 */

import fs from 'node:fs';
import path from 'node:path';

const SEMDEMO_ROOT = path.resolve(process.cwd());
const CAMERA_PATH = path.join(SEMDEMO_ROOT, 'js/modules/camera-controls.js');
const SCENE_REVEAL_PATH = path.join(SEMDEMO_ROOT, 'js/modules/scene-reveal.js');

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function assertContains(haystack, needle, label) {
  assert(haystack.includes(needle), `${label}: expected source to contain "${needle}"`);
}

function extractFunction(source, name) {
  const marker = `export function ${name}`;
  const start = source.indexOf(marker);
  assert(start !== -1, `${name} export found`);
  const braceStart = source.indexOf('{', start);
  assert(braceStart !== -1, `${name} opening brace found`);
  let depth = 1;
  let index = braceStart + 1;
  while (index < source.length && depth > 0) {
    if (source[index] === '{') depth++;
    if (source[index] === '}') depth--;
    index++;
  }
  assert(depth === 0, `${name} closing brace found`);
  return source.slice(start, index);
}

const cameraSrc = fs.readFileSync(CAMERA_PATH, 'utf8');
const sceneRevealSrc = fs.readFileSync(SCENE_REVEAL_PATH, 'utf8');

const setSuspended = extractFunction(cameraSrc, 'setAutoRotateSuspended');
const clearTimer = extractFunction(cameraSrc, 'clearAutoRotateResumeTimer');
const scheduleResume = extractFunction(cameraSrc, 'scheduleAutoRotateResume');
const startReveal = extractFunction(sceneRevealSrc, 'startSceneReveal');

console.log('============================================================');
console.log('camera-auto-rotate-settle-contract.mjs');
console.log('Fast contract test: camera auto-rotate settle seam');
console.log('============================================================');

console.log('\n[TEST] startSceneReveal suspends autorotate and clears resume timer');
assertContains(startReveal, "state.currentView !== 'galaxy'", 'startSceneReveal galaxy gate');
assertContains(startReveal, 'window.clearAutoRotateResumeTimer', 'startSceneReveal clears pending resume');
assertContains(startReveal, 'window.setAutoRotateSuspended', 'startSceneReveal calls suspend helper');
assert(
  startReveal.indexOf('window.clearAutoRotateResumeTimer') < startReveal.indexOf('window.setAutoRotateSuspended'),
  'startSceneReveal clears resume timer before suspending autorotate'
);
console.log('  OK startSceneReveal autorotate handoff is intact');

console.log('\n[TEST] setAutoRotateSuspended owns soft-resume timestamp lifecycle');
assertContains(setSuspended, 'state.autoRotateSuspended = suspended', 'suspend flag assignment');
assertContains(setSuspended, 'state.autoRotateSoftResumeStartedAt = 0', 'soft resume clears when suspended');
assertContains(setSuspended, 'state.autoRotateSoftResumeStartedAt = performance.now()', 'soft resume stamps on release');
assertContains(setSuspended, 'syncOrbitAutoRotate()', 'orbit sync after state change');
console.log('  OK soft-resume lifecycle is intact');

console.log('\n[TEST] clearAutoRotateResumeTimer resets timer and due timestamp');
assertContains(clearTimer, 'clearTimeout(state.autoRotateResumeTimer)', 'timer is cleared');
assertContains(clearTimer, 'state.autoRotateResumeTimer = null', 'timer id reset');
assertContains(clearTimer, 'state.autoRotateResumeDueAt = 0', 'due timestamp reset');
console.log('  OK clearAutoRotateResumeTimer reset contract is intact');

console.log('\n[TEST] scheduleAutoRotateResume blocks on all idle-orbit gates');
[
  "window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true",
  '!state.autoRotate',
  "state.currentView !== 'galaxy'",
  'state.focusedNode !== null',
  'state.selectedPoint !== null',
  'state.sceneRevealActive',
  "state.navState.mode !== 'overview'",
  'state.navState.focusPocketMeta?.active',
  'state.trailDepth !== 0'
].forEach((needle) => assertContains(scheduleResume, needle, `scheduleAutoRotateResume gate ${needle}`));
assertContains(scheduleResume, 'state.autoRotateResumeDueAt = performance.now() + delay', 'resume due timestamp set');
assertContains(scheduleResume, 'state.autoRotateResumeTimer = setTimeout', 'resume timer scheduled');
assertContains(scheduleResume, 'setAutoRotateSuspended(false)', 'resume callback releases suspension');
console.log('  OK scheduleAutoRotateResume gate set is intact');

console.log('\n[TEST] resume callback rechecks gates before releasing');
const callbackStart = scheduleResume.indexOf('state.autoRotateResumeTimer = setTimeout');
const callbackBlock = scheduleResume.slice(callbackStart);
[
  'state.autoRotate',
  "state.currentView === 'galaxy'",
  'state.focusedNode === null',
  'state.selectedPoint === null',
  "state.navState.mode === 'overview'",
  '!state.sceneRevealActive',
  '!state.navState.focusPocketMeta?.active',
  'state.trailDepth === 0'
].forEach((needle) => assertContains(callbackBlock, needle, `resume callback gate ${needle}`));
console.log('  OK resume callback rechecks idle gates');

console.log('\n============================================================');
console.log('ALL TESTS PASSED');
console.log('============================================================');
