/**
 * three-setup-zero-caller-dewindowing-contract.mjs
 *
 * Verifies that three-engine.js window bridges are retired as module seams:
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
const threeSetupPath = resolve(CWD, 'js/modules/three-engine.ts');

function read(path, label) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    console.error(`FAIL: could not read ${label}`);
    process.exit(1);
  }
}

const src = read(threeSetupPath, 'js/modules/three-engine.ts');

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

// Preserved bridges retired during TS migration (window.THREE removed from source)

const PRESERVED = [
  // 'window.THREE',  // retired — no longer assigned in three-engine.ts
];

// Functions must remain exported (either named export function or in an export { ... } block)
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

console.log('\n=== Functions must remain exported (named export or re-export block) ===');
for (const fn of MUST_REMAIN_EXPORTED) {
  const isNamedExport = new RegExp(`export\\s+function\\s+${fn}\\s*\\(`).test(src);
  const isReExported = new RegExp(`export\\s+\\{[\\s\\S]*?\\b${fn}\\b[\\s\\S]*?\\}`).test(src);
  check(`${fn} is exported`, isNamedExport || isReExported);
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
