/**
 * scene-reveal-camera-dewindowing-contract.mjs
 *
 * Contract test for scene-reveal.js → camera-controls.ts dewindowing.
 * Tests that scene-reveal uses direct named imports for
 * clearAutoRotateResumeTimer, setAutoRotateSuspended, and updateCameraViewportOffset.
 *
 * Run from semantic-demo root:
 *   node tests/scene-reveal-camera-dewindowing-contract.mjs
 *   node tests/run-from-semantic-demo.cjs scene-reveal-camera-dewindowing-contract.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CWD = process.cwd();
const sceneRevealPath = resolve(CWD, 'src/lib/engine/lifecycle.ts');
const cameraControlsPath = resolve(CWD, 'src/lib/engine/camera-controls.ts');
const threeSetupPath = resolve(CWD, 'src/lib/engine/three-engine.ts');

let sceneRevealSrc;
try {
  sceneRevealSrc = readFileSync(sceneRevealPath, 'utf8');
} catch {
  console.error('FAIL: could not read src/lib/engine/lifecycle.ts');
  process.exit(1);
}

const checks = [];

// ---------------------------------------------------------------------------
// Contract A: clearAutoRotateResumeTimer and setAutoRotateSuspended are
// imported directly from camera-controls.ts (not via window)
// ---------------------------------------------------------------------------
checks.push({
  name: 'imports:clearAutoRotateResumeTimer from camera-controls.ts',
  pass: /import\s+\{\s*[^}]*clearAutoRotateResumeTimer[^}]*\}\s+from\s+['"]\.\/camera-controls\.(?:js|ts)['"]/.test(sceneRevealSrc),
});

checks.push({
  name: 'imports:setAutoRotateSuspended from camera-controls.ts',
  pass: /import\s+\{\s*[^}]*setAutoRotateSuspended[^}]*\}\s+from\s+['"]\.\/camera-controls\.(?:js|ts)['"]/.test(sceneRevealSrc),
});

// ---------------------------------------------------------------------------
// Contract B: startSceneReveal calls clearAutoRotateResumeTimer directly
// (not window.clearAutoRotateResumeTimer)
// ---------------------------------------------------------------------------
checks.push({
  name: 'startSceneReveal:calls clearAutoRotateResumeTimer() directly (no window.)',
  pass: /^export\s+function\s+startSceneReveal[^{]*\{[\s\S]{0,900}?clearAutoRotateResumeTimer\s*\(\s*\)/m.test(sceneRevealSrc) &&
        !/window\.clearAutoRotateResumeTimer/.test(sceneRevealSrc),
});

checks.push({
  name: 'startSceneReveal:calls setAutoRotateSuspended(true) directly (no window.)',
  pass: /^export\s+function\s+startSceneReveal[^{]*\{[\s\S]{0,900}?setAutoRotateSuspended\s*\(\s*true\s*\)/m.test(sceneRevealSrc) &&
        !/window\.setAutoRotateSuspended/.test(sceneRevealSrc),
});

// ---------------------------------------------------------------------------
// Contract C: updateCameraViewportOffset is called through the existing direct import.
// ---------------------------------------------------------------------------
checks.push({
  name: 'imports:updateCameraViewportOffset from three-engine.ts',
  pass: /import\s+\{\s*updateCameraViewportOffset\s*\}\s+from\s+['"]\.\/three-engine\.(?:js|ts)['"]/.test(sceneRevealSrc),
});

checks.push({
  name: 'onWindowResize:calls updateCameraViewportOffset() directly (no window.)',
  pass: /^export\s+function\s+onWindowResize[^{]*\{[\s\S]{0,700}?updateCameraViewportOffset\s*\(\s*\)/m.test(sceneRevealSrc) &&
        !/window\.updateCameraViewportOffset/.test(sceneRevealSrc),
});

// ---------------------------------------------------------------------------
// Contract D: camera-controls.ts exports clearAutoRotateResumeTimer and setAutoRotateSuspended
// ---------------------------------------------------------------------------
let cameraControlsSrc;
try {
  cameraControlsSrc = readFileSync(cameraControlsPath, 'utf8');
} catch {
  cameraControlsSrc = '';
}

let threeSetupSrc;
try {
  threeSetupSrc = readFileSync(threeSetupPath, 'utf8');
} catch {
  threeSetupSrc = '';
}

checks.push({
  name: 'camera-controls:exports clearAutoRotateResumeTimer',
  pass: cameraControlsSrc.includes('export function clearAutoRotateResumeTimer'),
});

checks.push({
  name: 'camera-controls:exports setAutoRotateSuspended',
  pass: cameraControlsSrc.includes('export function setAutoRotateSuspended'),
});

checks.push({
  name: 'three-setup:exports updateCameraViewportOffset',
  pass: threeSetupSrc.includes('export function updateCameraViewportOffset'),
});

checks.push({
  name: 'three-setup:does not expose window.updateCameraViewportOffset',
  pass: !/window\.updateCameraViewportOffset\s*=/.test(threeSetupSrc),
});

// ---------------------------------------------------------------------------
// Contract E: No unguarded window.clearAutoRotateResumeTimer or window.setAutoRotateSuspended
// remaining in scene-reveal.js
// ---------------------------------------------------------------------------
checks.push({
  name: 'no residual window.clearAutoRotateResumeTimer in scene-reveal.ts',
  pass: !/window\.clearAutoRotateResumeTimer/.test(sceneRevealSrc),
});

checks.push({
  name: 'no residual window.setAutoRotateSuspended in scene-reveal.ts',
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
  console.log('All checks passed. scene-reveal camera hooks use direct imports.');
  process.exit(0);
}
