/**
 * scene-reveal-camera-dewindowing-contract.mjs
 *
 * Contract test for scene-reveal.js → camera-controls.js dewindowing.
 * Tests that startSceneReveal uses direct named imports for
 * clearAutoRotateResumeTimer and setAutoRotateSuspended, while
 * updateCameraViewportOffset remains a guarded window call (no cycle).
 *
 * Run from semantic-demo root:
 *   node tests/scene-reveal-camera-dewindowing-contract.mjs
 *   node tests/run-from-semantic-demo.cjs scene-reveal-camera-dewindowing-contract.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CWD = process.cwd();
const sceneRevealPath = resolve(CWD, 'js/modules/scene-reveal.js');
const cameraControlsPath = resolve(CWD, 'js/modules/camera-controls.js');

let sceneRevealSrc;
try {
  sceneRevealSrc = readFileSync(sceneRevealPath, 'utf8');
} catch {
  console.error('FAIL: could not read js/modules/scene-reveal.js');
  process.exit(1);
}

const checks = [];

// ---------------------------------------------------------------------------
// Contract A: clearAutoRotateResumeTimer and setAutoRotateSuspended are
// imported directly from camera-controls.js (not via window)
// ---------------------------------------------------------------------------
checks.push({
  name: 'imports:clearAutoRotateResumeTimer from camera-controls.js',
  pass: /import\s+\{\s*[^}]*clearAutoRotateResumeTimer[^}]*\}\s+from\s+['"]\.\/camera-controls\.js['"]/.test(sceneRevealSrc),
});

checks.push({
  name: 'imports:setAutoRotateSuspended from camera-controls.js',
  pass: /import\s+\{\s*[^}]*setAutoRotateSuspended[^}]*\}\s+from\s+['"]\.\/camera-controls\.js['"]/.test(sceneRevealSrc),
});

// ---------------------------------------------------------------------------
// Contract B: startSceneReveal calls clearAutoRotateResumeTimer directly
// (not window.clearAutoRotateResumeTimer)
// ---------------------------------------------------------------------------
checks.push({
  name: 'startSceneReveal:calls clearAutoRotateResumeTimer() directly (no window.)',
  pass: /^export\s+function\s+startSceneReveal[\s\S]{0,700}?clearAutoRotateResumeTimer\s*\(\s*\)/m.test(sceneRevealSrc) &&
        !/window\.clearAutoRotateResumeTimer/.test(sceneRevealSrc),
});

checks.push({
  name: 'startSceneReveal:calls setAutoRotateSuspended(true) directly (no window.)',
  pass: /^export\s+function\s+startSceneReveal[\s\S]{0,700}?setAutoRotateSuspended\s*\(\s*true\s*\)/m.test(sceneRevealSrc) &&
        !/window\.setAutoRotateSuspended/.test(sceneRevealSrc),
});

// ---------------------------------------------------------------------------
// Contract C: updateCameraViewportOffset remains a guarded window call
// (camera-controls.js cannot be imported — three-setup.js owns it, cycle would
// be introduced if scene-reveal imported from three-setup which imports from
// camera-controls which re-exports back to scene-reveal)
// ---------------------------------------------------------------------------
checks.push({
  name: 'onWindowResize:updateCameraViewportOffset stays as guarded window call',
  pass: /typeof\s+window\.updateCameraViewportOffset\s*===\s*['"]function['"][\s\S]{0,80}?window\.updateCameraViewportOffset\s*\(\s*\)/.test(sceneRevealSrc),
});

// ---------------------------------------------------------------------------
// Contract D: camera-controls.js exports clearAutoRotateResumeTimer and setAutoRotateSuspended
// ---------------------------------------------------------------------------
let cameraControlsSrc;
try {
  cameraControlsSrc = readFileSync(cameraControlsPath, 'utf8');
} catch {
  cameraControlsSrc = '';
}

checks.push({
  name: 'camera-controls:exports clearAutoRotateResumeTimer',
  pass: cameraControlsSrc.includes('export function clearAutoRotateResumeTimer'),
});

checks.push({
  name: 'camera-controls:exports setAutoRotateSuspended',
  pass: cameraControlsSrc.includes('export function setAutoRotateSuspended'),
});

// ---------------------------------------------------------------------------
// Contract E: No unguarded window.clearAutoRotateResumeTimer or window.setAutoRotateSuspended
// remaining in scene-reveal.js
// ---------------------------------------------------------------------------
checks.push({
  name: 'no residual window.clearAutoRotateResumeTimer in scene-reveal.js',
  pass: !/window\.clearAutoRotateResumeTimer/.test(sceneRevealSrc),
});

checks.push({
  name: 'no residual window.setAutoRotateSuspended in scene-reveal.js',
  pass: !/window\.setAutoRotateSuspended/.test(sceneRevealSrc),
});

// ---------------------------------------------------------------------------
// Report
// --------------------------------------------------------------------------
let passed = 0, failed = 0;
for (const c of checks) {
  if (c.pass) { passed++; }
  else         { failed++; console.error(`FAIL: ${c.name}`); }
}

console.log(`\nscene-reveal-camera-dewindowing-contract: ${passed}/${passed + failed} passed`);
if (failed > 0) {
  console.error(`${failed} check(s) FAILED`);
  process.exit(1);
} else {
  console.log('All checks passed. clearAutoRotateResumeTimer/setAutoRotateSuspended dewindowed; updateCameraViewportOffset remains window-gated (no cycle).');
  process.exit(0);
}