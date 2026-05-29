/**
 * three-setup-zero-caller-dewindowing-contract.mjs
 *
 * Verifies that three-setup.js window bridges are retired as module seams:
 * - window.syncNodeSporeColorsFromPointColors
 * - window.triggerSearchHeroMoment
 * - window.triggerCorridorNodeGlow
 * - window.shouldRenderThreads
 * - window.shouldRenderBridgeThreads
 * - window.__semanticScenePerformanceProbe
 *
 * Window exposure is removed; functions only remain exported when another
 * module seam still owns a live caller.
 *
 * Newly retired in this wave:
 *   window.createPoints, window.createMycelium, window.triggerSearchCorridorAnimation,
 *   window.updateMyceliumThreads, window.__keepCorridorFns
 *
 * Preserved (must remain on window for legacy Three math/test helpers):
 *   window.THREE
 *
 * Usage: node tests/three-setup-zero-caller-dewindowing-contract.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CWD = process.cwd();
const threeSetupPath = resolve(CWD, 'js/three-setup.js');

function read(path, label) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    console.error(`FAIL: could not read ${label}`);
    process.exit(1);
  }
}

const src = read(threeSetupPath, 'js/three-setup.js');

// Retired bridges must not appear as window.* =

const RETIRED = [
  'window.syncNodeSporeColorsFromPointColors',
  'window.triggerSearchHeroMoment',
  'window.triggerCorridorNodeGlow',
  'window.shouldRenderThreads',
  'window.shouldRenderBridgeThreads',
  'window.__semanticScenePerformanceProbe',
  'window.createPoints',
  'window.createMycelium',
  'window.triggerSearchCorridorAnimation',
  'window.updateMyceliumThreads',
  'window.__keepCorridorFns',
];

// Preserved bridges must still appear as window.* =

const PRESERVED = [
  'window.THREE',
];

// Functions with live module seams must remain exported.
// Removing window exposure does not automatically preserve a dead export.

// getScenePerformanceProbe is a local (non-exported) function; it was only
// bridged via window.__semanticScenePerformanceProbe which is now retired.
const MUST_REMAIN_EXPORTED = [
  'triggerSearchHeroMoment',
  'triggerCorridorNodeGlow',
  'shouldRenderThreads',
  'shouldRenderBridgeThreads',
  'createPoints',
  'createMycelium',
  'triggerSearchCorridorAnimation',
];

const MUST_BE_LOCAL = ['getScenePerformanceProbe'];

let passed = 0;
let failed = 0;

function check(name, cond) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}`);
  }
}

console.log('\n=== Retired window bridges (must not be window.* =) ===');
for (const bridge of RETIRED) {
  const pattern = bridge.replace(/\./g, '\\$&').replace(/\*/g, '\\*') + '\\s*=';
  check(`${bridge} not exposed`, !new RegExp(pattern).test(src));
}

console.log('\n=== Preserved window bridges (must remain window.* =) ===');
for (const bridge of PRESERVED) {
  const pattern = bridge.replace(/\./g, '\\$&').replace(/\*/g, '\\*') + '\\s*=';
  check(`${bridge} still exposed`, new RegExp(pattern).test(src));
}

console.log('\n=== Functions must remain exported (named export, not window.* =) ===');
for (const fn of MUST_REMAIN_EXPORTED) {
  check(`${fn} is export function`, new RegExp(`export\\s+function\\s+${fn}\\s*\\(`).test(src));
  check(`${fn} not on window`, !new RegExp(`window\\.${fn}\\s*=`).test(src));
}

console.log('\n=== Functions must remain local (getScenePerformanceProbe, not exported) ===');
for (const fn of MUST_BE_LOCAL) {
  check(`${fn} is function declaration (local)`, new RegExp(`function\\s+${fn}\\s*\\(`).test(src));
  check(`${fn} is NOT exported`, !new RegExp(`export\\s+function\\s+${fn}\\s*\\(`).test(src));
  check(`${fn} not on window`, !new RegExp(`window\\.${fn}\\s*=`).test(src));
}

console.log(`\nthree-setup-zero-caller-dewindowing-contract: ${passed}/${passed + failed} passed`);
if (failed > 0) {
  console.error(`${failed} check(s) FAILED`);
  process.exit(1);
}

console.log('All checks passed. Three setup bridges retired; window.THREE remains preserved.');
console.log('\n=================================================================');
process.exit(0);
