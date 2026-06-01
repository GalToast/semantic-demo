/**
 * search-sheet-css-ownership-contract.mjs
 *
 * Source-only ownership contract for mobile search/focus-search peek and
 * expanded sheet layout.
 *
 * Ownership rules:
 *   1. data-panel-surface-detail="peek|expanded" layout belongs to
 *      mobile_premium_state.css.
 *   2. mobile_premium_surfaces.css must not regain search-sheet detail
 *      ownership; it may keep generic geometry backstops and map-specific
 *      compact result guards only.
 *   3. mobile_premium_chrome.css owns baseline search result chrome, not
 *      peek/expanded state branching.
 *
 * Usage:
 *   node tests/search-sheet-css-ownership-contract.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const STATE_PATH = path.join(ROOT, 'css/mobile_premium_state.css');
const SURFACES_PATH = path.join(ROOT, 'css/mobile_premium_surfaces.css');
const CHROME_PATH = path.join(ROOT, 'css/mobile_premium_chrome.css');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function run() {
  console.log('=================================================================');
  console.log('search-sheet-css-ownership-contract.mjs');
  console.log('Contract test: mobile search sheet state/style ownership');
  console.log('=================================================================');

  const stateSrc = read(STATE_PATH);
  const surfacesSrc = read(SURFACES_PATH);
  const chromeSrc = read(CHROME_PATH);

  console.log('\n[TEST] mobile_premium_state owns peek/expanded search sheet detail');
  assert(
    /data-panel-surface="search"\]\[data-panel-surface-detail="peek"\][\s\S]*\.search-results\.active/.test(stateSrc),
    'mobile_premium_state.css must own search peek results sizing'
  );
  assert(
    /data-panel-surface="focus-search"\]\[data-panel-surface-detail="peek"\][\s\S]*\.info-panel/.test(stateSrc),
    'mobile_premium_state.css must own focus-search peek drawer geometry'
  );
  assert(
    /data-panel-surface="search"\]\[data-panel-surface-detail="expanded"\][\s\S]*data-panel-surface="focus-search"\]\[data-panel-surface-detail="expanded"\][\s\S]*\.info-panel/.test(stateSrc),
    'mobile_premium_state.css must own search/focus-search expanded drawer geometry'
  );
  assert(
    /data-panel-surface-detail="peek"[\s\S]*\.search-result-name/.test(stateSrc),
    'mobile_premium_state.css must own compact peek result typography'
  );
  console.log('  OK - state layer owns search sheet detail states');

  console.log('\n[TEST] mobile_premium_surfaces does not own search sheet detail state');
  assert(
    !/data-panel-surface-detail/.test(surfacesSrc),
    'mobile_premium_surfaces.css must not contain data-panel-surface-detail rules'
  );
  console.log('  OK - surfaces layer has no search sheet detail selectors');

  console.log('\n[TEST] mobile_premium_chrome remains baseline chrome only');
  assert(
    !/data-panel-surface-detail/.test(chromeSrc),
    'mobile_premium_chrome.css must not branch on peek/expanded detail state'
  );
  assert(
    /\.search-results\.active[\s\S]*border-radius/.test(chromeSrc) &&
      /\.search-result-item\.top-result[\s\S]*padding/.test(chromeSrc),
    'mobile_premium_chrome.css should keep baseline search result chrome'
  );
  console.log('  OK - chrome layer stays state-agnostic');

  console.log('\n=================================================================');
  console.log('ALL TESTS PASSED');
  console.log('=================================================================');
}

run();
