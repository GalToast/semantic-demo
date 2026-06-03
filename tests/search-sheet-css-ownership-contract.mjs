/**
 * search-sheet-css-ownership-contract.mjs
 *
 * Source-only ownership contract for mobile search/focus-search none, peek,
 * and expanded sheet layout.
 *
 * Ownership rules:
 *   1. data-panel-surface-detail="none|peek|expanded" layout belongs to the
 *      STATE-MACHINE section in collapsed mobile_premium.css.
 *   2. Baseline search result chrome stays in the collapsed mobile owner; the
 *      old mobile_premium_* split files must not be required for the app shell.
 *
 * Usage:
 *   node tests/search-sheet-css-ownership-contract.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const MOBILE_PREMIUM_PATH = path.join(ROOT, 'css/mobile_premium.css');

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

  const mobilePremiumSrc = read(MOBILE_PREMIUM_PATH);

  console.log('\n[TEST] collapsed mobile_premium STATE-MACHINE section owns none/peek/expanded search sheet detail');
  assert(
    /\/\*\s*─── STATE-MACHINE STYLES/.test(mobilePremiumSrc),
    'mobile_premium.css must keep a named STATE-MACHINE STYLES section'
  );
  assert(
    /data-panel-surface-detail="none"\][\s\S]*#search-results\.active/.test(mobilePremiumSrc) &&
      /:not\(\[data-panel-surface-detail\]\)[\s\S]*#search-results\.active/.test(mobilePremiumSrc),
    'mobile_premium.css must own search detail=none and absent-detail results sizing'
  );
  assert(
    /data-panel-surface="search"\]\[data-panel-surface-detail="peek"\][\s\S]*\.search-results\.active/.test(mobilePremiumSrc),
    'mobile_premium.css must own search peek results sizing'
  );
  assert(
    /data-panel-surface="focus-search"\]\[data-panel-surface-detail="peek"\][\s\S]*\.info-panel/.test(mobilePremiumSrc),
    'mobile_premium.css must own focus-search peek drawer geometry'
  );
  assert(
    /data-panel-surface="search"\]\[data-panel-surface-detail="expanded"\][\s\S]*data-panel-surface="focus-search"\]\[data-panel-surface-detail="expanded"\][\s\S]*\.info-panel/.test(mobilePremiumSrc),
    'mobile_premium.css must own search/focus-search expanded drawer geometry'
  );
  assert(
    /data-panel-surface-detail="peek"[\s\S]*\.search-result-name/.test(mobilePremiumSrc),
    'mobile_premium.css must own compact peek result typography'
  );
  console.log('  OK - collapsed state section owns search sheet detail states');

  console.log('\n[TEST] collapsed mobile_premium keeps baseline search chrome');
  assert(
    /\.search-results\.active[\s\S]*border-radius/.test(mobilePremiumSrc) &&
      /\.search-result-item\.top-result[\s\S]*padding/.test(mobilePremiumSrc),
    'mobile_premium.css should keep baseline search result chrome'
  );
  console.log('  OK - baseline chrome exists in the collapsed mobile owner');

  console.log('\n=================================================================');
  console.log('ALL TESTS PASSED');
  console.log('=================================================================');
}

run();
