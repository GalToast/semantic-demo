/**
 * journey-point-color-contract.mjs
 *
 * Source-only contract for the extracted point-color owner.
 */

import fs from 'node:fs';
import path from 'node:path';

const SEMDEMO_ROOT = path.resolve(process.cwd());
const JOURNEY_PATH = path.join(SEMDEMO_ROOT, 'js/modules/journey.js');
const POINT_COLOR_PATH = path.join(SEMDEMO_ROOT, 'js/modules/journey-point-color.js');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function assertContains(src, needle, msg) {
  assert(src.includes(needle), `${msg}: expected "${needle}"`);
}

function assertNotContains(src, needle, msg) {
  assert(!src.includes(needle), `${msg}: unexpected "${needle}"`);
}

function main() {
  console.log('============================================================');
  console.log('journey-point-color-contract.mjs');
  console.log('Source contract: extracted point-color owner');
  console.log('============================================================');

  const journeySrc = fs.readFileSync(JOURNEY_PATH, 'utf-8');
  const pointColorSrc = fs.readFileSync(POINT_COLOR_PATH, 'utf-8');

  assertContains(pointColorSrc, 'export function applyPointFilterColors()', 'point-color exports applyPointFilterColors');
  assertContains(pointColorSrc, 'export function describeThreadLensForPoint(point)', 'point-color exports describeThreadLensForPoint');
  assertContains(journeySrc, "import { applyPointFilterColors, describeThreadLensForPoint } from './journey-point-color.js';", 'journey imports point-color owner');
  assertContains(journeySrc, 'applyPointFilterColors,', 'journey re-exports applyPointFilterColors');
  assertContains(journeySrc, 'describeThreadLensForPoint,', 'journey re-exports describeThreadLensForPoint');

  assertNotContains(journeySrc, 'export function applyPointFilterColors()', 'journey local applyPointFilterColors removed');
  assertNotContains(journeySrc, 'function syncNodeSporeColorsFromPointColors()', 'journey local spore color sync removed');
  assertNotContains(journeySrc, 'export function describeThreadLensForPoint(point)', 'journey local thread lens describer removed');
  assertNotContains(pointColorSrc, "from './journey.js'", 'point-color must not import journey shim');

  assertContains(pointColorSrc, 'function syncNodeSporeColorsFromPointColors()', 'spore color sync remains private in point-color owner');
  assertNotContains(pointColorSrc, 'export function syncNodeSporeColorsFromPointColors', 'spore color sync is not exported from point-color');

  assertContains(pointColorSrc, 'const nodeMinFloor = 0.65', 'focus pocket floor preserved');
  assertContains(pointColorSrc, 'visible ? 1 : 0.08', 'invisible factor preserved');
  assertContains(pointColorSrc, 'i === state.navState.focusedIndex ? 2.14', 'trail focus factor preserved');
  assertContains(pointColorSrc, 'isVisited ? 1.18 : (semanticFocus ? 0.24 : 0.18)', 'trail dim factor preserved');
  assertContains(pointColorSrc, 'isVisited ? 1.28 : (semanticFocus ? 0.32 : 0.22)', 'pocket dim factor preserved');

  assertContains(pointColorSrc, "import { syncSearchStatusForFocus } from './search-lifecycle-adapter.js';", 'search status routes through adapter');
  assertContains(pointColorSrc, 'syncSearchStatusForFocus(topPoint, { fromSearchResult: true, skipTraversalUiUpdate: true });', 'search glow status call preserved');
  assertNotContains(pointColorSrc, 'window.applySearchGlowVisualState', 'retired applySearchGlowVisualState bridge absent');
  assertNotContains(pointColorSrc, 'window.syncSearchStatusForFocus', 'raw search status window bridge absent');

  console.log('\nALL TESTS PASSED');
}

main();
