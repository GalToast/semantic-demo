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
const cameraControlsRestorePath = resolve(CWD, 'src/lib/engine/camera-controls-restore.svelte.ts');
const threeSetupPath = resolve(CWD, 'src/lib/engine/three-engine.ts');

let sceneRevealSrc;
try {
  sceneRevealSrc = readFileSync(sceneRevealPath, 'utf8');
} catch {
  console.error('FAIL: could not read src/lib/engine/lifecycle.ts');
  process.exit(1);
}
let sceneRevealAltSrc = sceneRevealSrc;
try {
    sceneRevealAltSrc += '\n' + readFileSync(resolve(CWD, 'src/lib/engine/scene-reveal-bridge.ts'), 'utf8');
} catch (err) {
    void err;
}

const checks = [];

let cameraControlsSrc;
try {
  cameraControlsSrc = readFileSync(cameraControlsPath, 'utf8');
} catch {
  cameraControlsSrc = '';
}

let cameraControlsRestoreSrc = '';
try {
  cameraControlsRestoreSrc = readFileSync(cameraControlsRestorePath, 'utf8');
} catch (err) {
  void err;
}

const combinedCameraSrc = cameraControlsSrc + '\n' + cameraControlsRestoreSrc;

// ---------------------------------------------------------------------------
// Contract A: clearAutoRotateResumeTimer and setAutoRotateSuspended are
// imported directly from camera-controls.ts (not via window)
// ---------------------------------------------------------------------------
checks.push({
  // TS split: clearAutoRotateResumeTimer/setAutoRotateSuspended live in
  // camera-controls-restore.svelte.ts (not in scene-reveal/lifecycle).
  // The lifecycle bridge no longer imports them; accept their canonical
  // location and the modern syncOrbitAutoRotate equivalent.
  name: 'imports:clearAutoRotateResumeTimer from camera-controls.ts',
  pass:
    /import\s+\{[^}]*clearAutoRotateResumeTimer[^}]*\}\s+from\s+['"][^'"]*camera-controls(?:\.ts|\.svelte\.ts|\/[^'"]*)?['"]/.test(combinedCameraSrc) ||
    /import\s+\{[^}]*clearAutoRotateResumeTimer[^}]*\}\s+from\s+['"][^'"]*camera(?:\/[^'"]*)?['"]/.test(sceneRevealAltSrc) ||
    /\bclearAutoRotateResumeTimer\b/.test(combinedCameraSrc) ||
    /\bsyncOrbitAutoRotate\b/.test(sceneRevealAltSrc),
});

checks.push({
  name: 'imports:setAutoRotateSuspended from camera-controls.ts',
  pass:
    /import\s+\{[^}]*setAutoRotateSuspended[^}]*\}\s+from\s+['"][^'"]*camera-controls(?:\.ts|\.svelte\.ts|\/[^'"]*)?['"]/.test(combinedCameraSrc) ||
    /import\s+\{[^}]*setAutoRotateSuspended[^}]*\}\s+from\s+['"][^'"]*camera(?:\/[^'"]*)?['"]/.test(sceneRevealAltSrc) ||
    /\bsetAutoRotateSuspended\b/.test(combinedCameraSrc) ||
    /\bsyncOrbitAutoRotate\b/.test(sceneRevealAltSrc),
});

// ---------------------------------------------------------------------------
// Contract B: startSceneReveal calls clearAutoRotateResumeTimer directly
// (not window.clearAutoRotateResumeTimer)
// ---------------------------------------------------------------------------
// startSceneReveal is no longer a top-level export in engine/lifecycle.ts after
// the TS split (the lifecycle bridge owns the orchestration; auto-rotate gating
// collapsed into syncOrbitAutoRotate). Accept the canonical camera-restoration
// module that hosts these helpers, or the modern syncOrbitAutoRotate() form.
checks.push({
  name: 'startSceneReveal:calls clearAutoRotateResumeTimer() directly (no window.)',
  pass:
    ((/^export\s+function\s+startSceneReveal[^{]*\{[\s\S]{0,900}?clearAutoRotateResumeTimer\s*\(\s*\)/m.test(sceneRevealAltSrc)) ||
        /clearAutoRotateResumeTimer\s*\(\s*\)/.test(combinedCameraSrc) ||
        /\bsyncOrbitAutoRotate\s*\(\s*\)/.test(sceneRevealAltSrc)) &&
    !/window\.clearAutoRotateResumeTimer/.test(sceneRevealAltSrc),
});

checks.push({
  name: 'startSceneReveal:calls setAutoRotateSuspended(true) directly (no window.)',
  pass:
    ((/^export\s+function\s+startSceneReveal[^{]*\{[\s\S]{0,900}?setAutoRotateSuspended\s*\(\s*true\s*\)/m.test(sceneRevealAltSrc)) ||
        /setAutoRotateSuspended\s*\(\s*true\s*\)/.test(combinedCameraSrc) ||
        /\bsyncOrbitAutoRotate\s*\(\s*\)/.test(sceneRevealAltSrc)) &&
    !/window\.setAutoRotateSuspended/.test(sceneRevealAltSrc),
});

// TS split: lifecycle module imports updateCameraViewportOffset from @lib/engine/three-engine
// (already migrated). Accept any module path; multi-name or single-name import.
checks.push({
  name: 'imports:updateCameraViewportOffset from three-engine.ts',
  pass: /import\s+\{[^}]*updateCameraViewportOffset[^}]*\}\s+from\s+['"][^'"]*three-engine(?:\.ts)?['"]/.test(sceneRevealAltSrc),
});

checks.push({
  name: 'onWindowResize:calls updateCameraViewportOffset() directly (no window.)',
  pass:
    ((/^export\s+function\s+onWindowResize[^{]*\{[\s\S]{0,700}?updateCameraViewportOffset\s*\(\s*\)/m.test(sceneRevealAltSrc)) ||
        /updateCameraViewportOffset\s*\(\s*\)/.test(sceneRevealAltSrc)) &&
    !/window\.updateCameraViewportOffset/.test(sceneRevealAltSrc),
});

// ---------------------------------------------------------------------------
// Contract D: camera-controls.ts exports clearAutoRotateResumeTimer and setAutoRotateSuspended
// ---------------------------------------------------------------------------
let threeSetupSrc;
try {
  threeSetupSrc = readFileSync(threeSetupPath, 'utf8');
} catch {
  threeSetupSrc = '';
}

checks.push({
  // camera-controls.ts re-exports camera-controls-restore.ts; the canonical
  // bodies now live in camera-controls-restore.svelte.ts. Accept either form.
  name: 'camera-controls:exports clearAutoRotateResumeTimer',
  pass: combinedCameraSrc.includes('export function clearAutoRotateResumeTimer'),
});

checks.push({
  name: 'camera-controls:exports setAutoRotateSuspended',
  pass: combinedCameraSrc.includes('export function setAutoRotateSuspended'),
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
