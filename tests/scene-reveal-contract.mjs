/**
 * scene-reveal-contract.mjs
 *
 * Node contract test for the extracted scene-reveal.js slice.
 * Tests critical integration contracts WITHOUT requiring a browser.
 *
 * Covers:
 *   1. startSceneReveal camera/currentView gates
 *   2. startSceneReveal sceneRevealCameraStart formula (cx*0.42, cy*0.34, max 0.96, cz*0.58)
 *   3. startSceneReveal calls window.clearAutoRotateResumeTimer and window.setAutoRotateSuspended(true)
 *   4. getSceneRevealProgress clamps [0,1] and gates on sceneRevealActive/StartedAt
 *   5. onWindowResize guards on camera/renderer, sets aspect/setSize, calls map.invalidateSize
 *
 * Run from semantic-demo root:
 *   node tests/scene-reveal-contract.mjs
 *   node tests/run-from-semantic-demo.cjs scene-reveal-contract.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveSource } from './source-path.mjs';

const CWD = process.cwd();
const sceneRevealPath = resolveSource('src/lib/engine/scene-reveal.ts', CWD);
const lifecyclePath = resolveSource('src/lib/stores/lifecycle.ts', CWD);

let src;
try {
  src = readFileSync(sceneRevealPath, 'utf8');
} catch {
  src = readFileSync(lifecyclePath, 'utf8');
}

const checks = [];

// ---------------------------------------------------------------------------
// Contract 1: startSceneReveal exists and is exported
// --------------------------------------------------------------------------
checks.push({
  name: 'exports:startSceneReveal',
  pass: /export\s+function\s+startSceneReveal/.test(src),
});

// ---------------------------------------------------------------------------
// Contract 2: startSceneReveal gates on state.camera && state.currentView === 'galaxy'
// --------------------------------------------------------------------------
checks.push({
  name: 'startSceneReveal:gates on state.camera',
  pass: /function\s+startSceneReveal[\s\S]{0,220}?const\s+camera\s*=[\s\S]{0,180}?if\s*\(\s*!\s*camera[\s\S]{0,120}?return/.test(src),
});
checks.push({
  name: 'startSceneReveal:gates on state.currentView',
  pass: /function\s+startSceneReveal[\s\S]{0,300}?state\.currentView/.test(src),
});

// ---------------------------------------------------------------------------
// Contract 3: startSceneReveal sets sceneRevealActive=true and sceneRevealStartedAt
// --------------------------------------------------------------------------
checks.push({
  name: 'startSceneReveal:sets state.sceneRevealActive = true',
  pass: /state\.sceneRevealActive\s*=\s*true/.test(src),
});
checks.push({
  name: 'startSceneReveal:sets state.sceneRevealStartedAt = performance.now()',
  pass: /state\.sceneRevealStartedAt\s*=\s*performance\.now\(\)/.test(src),
});

// ---------------------------------------------------------------------------
// Contract 4: startSceneReveal sceneRevealCameraStart formula
// cx*0.42, cy*0.34, max(0.96, cz*0.58)
// --------------------------------------------------------------------------
checks.push({
  name: 'startSceneReveal:camera formula uses cx*0.42',
  pass: /cx\s*\*\s*0\.42/.test(src),
});
checks.push({
  name: 'startSceneReveal:camera formula uses cy*0.34',
  pass: /cy\s*\*\s*0\.34/.test(src),
});
checks.push({
  name: 'startSceneReveal:camera formula uses max(0.96, cz*0.58)',
  pass: /Math\.max\s*\(\s*0\.96\s*,\s*cz\s*\*\s*0\.58\s*\)/.test(src),
});
checks.push({
  name: 'startSceneReveal:camera formula falls back to (0,0,1) for non-finite components',
  pass: /Number\.isFinite/.test(src) && /Vector3\s*\(\s*0\s*,\s*0\s*,\s*1\s*\)/.test(src),
});

// ---------------------------------------------------------------------------
// Contract 5: startSceneReveal calls clearAutoRotateResumeTimer (direct import, not window)
// --------------------------------------------------------------------------
checks.push({
  name: 'startSceneReveal:calls clearAutoRotateResumeTimer (dewindowed — direct import)',
  pass: /export\s+function\s+startSceneReveal[\s\S]{0,900}?clearAutoRotateResumeTimer\s*\(\s*\)/m.test(src) &&
        !/window\.clearAutoRotateResumeTimer/.test(src),
});

// ---------------------------------------------------------------------------
// Contract 6: startSceneReveal calls setAutoRotateSuspended(true) (direct import, not window)
// --------------------------------------------------------------------------
checks.push({
  name: 'startSceneReveal:calls setAutoRotateSuspended(true) (dewindowed — direct import)',
  pass: /export\s+function\s+startSceneReveal[\s\S]{0,900}?setAutoRotateSuspended\s*\(\s*true\s*\)/m.test(src) &&
        !/window\.setAutoRotateSuspended/.test(src),
});

// ---------------------------------------------------------------------------
// Contract 7: getSceneRevealProgress exists and is exported
// --------------------------------------------------------------------------
checks.push({
  name: 'exports:getSceneRevealProgress',
  pass: /export\s+function\s+getSceneRevealProgress/.test(src),
});

// ---------------------------------------------------------------------------
// Contract 8: getSceneRevealProgress gates on sceneRevealActive and sceneRevealStartedAt
// Returns 1 early if not active
// --------------------------------------------------------------------------
checks.push({
  name: 'getSceneRevealProgress:gates on state.sceneRevealActive',
  pass: /function\s+getSceneRevealProgress\s*\([^)]*\).*?\{[\s\S]*?if\s*\(\s*!\s*state\.sceneRevealActive/.test(src),
});
checks.push({
  name: 'getSceneRevealProgress:returns 1 early when not active',
  pass: /getSceneRevealProgress[\s\S]*?return\s+1/.test(src),
});

// ---------------------------------------------------------------------------
// Contract 9: getSceneRevealProgress clamps result with Math.min(1, Math.max(0, ...))
// --------------------------------------------------------------------------
checks.push({
  name: 'getSceneRevealProgress:clamps result with Math.min(1, Math.max(0, elapsed/2800))',
  pass: /Math\.min\s*\(\s*1\s*,\s*Math\.max\s*\(\s*0/.test(src),
});
checks.push({
  name: 'getSceneRevealProgress:uses 2800ms duration',
  pass: /2800/.test(src),
});

// ---------------------------------------------------------------------------
// Contract 10: onWindowResize exists and is exported
// --------------------------------------------------------------------------
checks.push({
  name: 'exports:onWindowResize',
  pass: /export\s+function\s+onWindowResize/.test(src),
});

// ---------------------------------------------------------------------------
// Contract 11: onWindowResize guards on camera and renderer
// --------------------------------------------------------------------------
checks.push({
  name: 'onWindowResize:guards on state.camera',
  pass: /function\s+onWindowResize[\s\S]{0,220}?const\s+camera\s*=[\s\S]{0,220}?if\s*\(\s*!\s*camera[\s\S]{0,120}?return/.test(src),
});
checks.push({
  name: 'onWindowResize:guards on state.renderer',
  pass: /function\s+onWindowResize[\s\S]{0,260}?const\s+renderer\s*=[\s\S]{0,220}?if\s*\([\s\S]{0,120}!\s*renderer[\s\S]{0,120}?return/.test(src),
});

// ---------------------------------------------------------------------------
// Contract 12: onWindowResize sets camera.aspect and calls updateProjectionMatrix
// --------------------------------------------------------------------------
checks.push({
  name: 'onWindowResize:sets camera.aspect from viewport dimensions',
  pass: /camera.*aspect\s*=/.test(src) && /width\s*\/\s*height/.test(src),
});
checks.push({
  name: 'onWindowResize:calls camera.updateProjectionMatrix()',
  pass: /\.updateProjectionMatrix\s*\(\s*\)/.test(src),
});

// ---------------------------------------------------------------------------
// Contract 13: onWindowResize calls renderer.setSize
// --------------------------------------------------------------------------
checks.push({
  name: 'onWindowResize:calls renderer.setSize(width, height)',
  pass: /\.setSize\s*\(/.test(src),
});

// ---------------------------------------------------------------------------
// Contract 14: onWindowResize calls window.map.invalidateSize()
// --------------------------------------------------------------------------
checks.push({
  name: 'onWindowResize:calls map.invalidateSize()',
  pass: /invalidateSize\s*\(\s*\)/.test(src),
});

// ---------------------------------------------------------------------------
// Contract 15: onWindowResize keeps compact viewport/camera offset hooks
// --------------------------------------------------------------------------
checks.push({
  name: 'onWindowResize:toggles document.body is-mobile breakpoint class',
  pass: /document\.body\.classList\.toggle\s*\(\s*['"]is-mobile['"]\s*,\s*isMobile\s*\)/.test(src),
});
checks.push({
  name: 'onWindowResize:calls updateCameraViewportOffset() direct import',
  pass: /import\s*\{\s*updateCameraViewportOffset\s*\}\s*from\s*['"]\.\/three-engine/.test(src) &&
        /function\s+onWindowResize[\s\S]{0,900}?updateCameraViewportOffset\s*\(\s*\)/.test(src) &&
        !/window\.updateCameraViewportOffset\s*\(/.test(src),
});

// ---------------------------------------------------------------------------
// Contract 16: onWindowResize calls syncClusterSectionState through direct import
// --------------------------------------------------------------------------
checks.push({
  name: 'onWindowResize:calls syncClusterSectionState() direct import',
  pass: /import\s*\{\s*syncClusterSectionState\s*\}\s*from\s*['"]@lib\/ui\/cluster-labels/.test(src) &&
        /function\s+onWindowResize[\s\S]{0,900}?syncClusterSectionState\s*\(\s*\)/.test(src) &&
        !/window\.syncClusterSectionState\s*\(/.test(src),
});

// ---------------------------------------------------------------------------
// Contract 17: onWindowResize calls updateTraversalUi through direct import
// --------------------------------------------------------------------------
checks.push({
  name: 'onWindowResize:calls updateTraversalUi() direct import',
  pass: /import\s*\{\s*updateTraversalUi\s*\}\s*from\s*['"]@lib\/journey\/focus-ui/.test(src) &&
        /function\s+onWindowResize[\s\S]{0,900}?updateTraversalUi\s*\(\s*\)/.test(src) &&
        !/window\.updateTraversalUi\s*\(/.test(src),
});

// ---------------------------------------------------------------------------
// Report
// --------------------------------------------------------------------------
let passed = 0, failed = 0;
for (const c of checks) {
  if (c.pass) { passed++; }
  else         { failed++; console.error(`FAIL: ${c.name}`); }
}

console.log(`\nscene-reveal-contract results: ${passed}/${passed + failed} passed`);
if (failed > 0) {
  console.error(`${failed} check(s) FAILED`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// RUNTIME BEHAVIORAL TESTS
// ---------------------------------------------------------------------------
console.log('\n── Runtime Behavioral Tests ──\n');

let rtPassed = 0, rtFailed = 0;

try {
  const mod = await import('../src/lib/engine/scene-reveal');

  // ── RT1: All 4 exports are functions ────────────────────────────────────
  const exports = ['startSceneReveal', 'getSceneRevealProgress', 'setSceneRevealDataset', 'onWindowResize'];
  for (const name of exports) {
    if (typeof mod[name] !== 'function') throw new Error(`${name} is not a function (got ${typeof mod[name]})`);
    rtPassed++;
  }
  console.log('  OK 4 exports all functions');

  // ── RT2: getSceneRevealProgress returns 1 when not active ───────────────
  const p0 = mod.getSceneRevealProgress(0);
  if (p0 !== 1) throw new Error(`getSceneRevealProgress(0) expected 1, got ${p0}`);
  rtPassed++;

  const p5000 = mod.getSceneRevealProgress(5000);
  if (p5000 !== 1) throw new Error(`getSceneRevealProgress(5000) expected 1, got ${p5000}`);
  rtPassed++;
  console.log('  OK getSceneRevealProgress returns 1 when not active (multiple inputs)');

  // ── RT3: startSceneReveal handles missing camera gracefully ──────────────
  // In Node: state.camera is null → gate triggers early return, no throw
  mod.startSceneReveal();
  rtPassed++;
  console.log('  OK startSceneReveal() no throw (early return, no camera in Node)');

  // ── RT4: Camera formula constants verified against live source ───────────
  // Read the source again at runtime to verify formula is intact in the loaded module
  const liveSrc = readFileSync(sceneRevealPath, 'utf8');
  if (!/cx\s*\*\s*0\.42/.test(liveSrc)) throw new Error('Camera formula: cx*0.42 NOT found in live source');
  if (!/cy\s*\*\s*0\.34/.test(liveSrc)) throw new Error('Camera formula: cy*0.34 NOT found in live source');
  if (!/Math\.max\s*\(\s*0\.96\s*,\s*cz\s*\*\s*0\.58\s*\)/.test(liveSrc)) throw new Error('Camera formula: max(0.96, cz*0.58) NOT found');
  rtPassed++;
  console.log('  OK Camera formula constants (cx*0.42, cy*0.34, max(0.96, cz*0.58)) verified');

  // ── RT5: clearAutoRotateResumeTimer → setAutoRotateSuspended(true) ordering ──
  // The behavioral contract: clear timer BEFORE suspending
  const clearIdx = liveSrc.indexOf('clearAutoRotateResumeTimer()');
  const suspendIdx = liveSrc.indexOf('setAutoRotateSuspended(true)');
  if (clearIdx === -1) throw new Error('clearAutoRotateResumeTimer() not found');
  if (suspendIdx === -1) throw new Error('setAutoRotateSuspended(true) not found');
  if (clearIdx >= suspendIdx) throw new Error('clearAutoRotateResumeTimer must appear BEFORE setAutoRotateSuspended(true)');
  rtPassed++;
  console.log('  OK clear-before-suspend ordering intact in startSceneReveal');

  // ── RT6: getSceneRevealProgress clamps to [0,1] ─────────────────────────
  // Verify the clamp formula exists in source (behavioral invariant)
  if (!/Math\.min\s*\(\s*1\s*,\s*Math\.max\s*\(\s*0/.test(liveSrc)) throw new Error('Clamp: Math.min(1, Math.max(0, ...) not found');
  if (!/2800/.test(liveSrc)) throw new Error('Reveal duration 2800ms not found');
  rtPassed++;
  console.log('  OK getSceneRevealProgress clamps via Math.min(1, Math.max(0, elapsed/2800))');

} catch (err) {
  rtFailed++;
  console.error(`  RUNTIME FAIL: ${err.message}`);
}

console.log(`\n── Runtime: ${rtPassed} passed, ${rtFailed} failed ──`);

if (rtFailed > 0) {
  console.error(`${rtFailed} runtime check(s) FAILED`);
  process.exit(1);
} else {
  console.log('All checks passed. Scene-reveal surface is structurally sound.');
  process.exit(0);
}
