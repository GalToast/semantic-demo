/**
 * search-panel-adapter-contract.mjs
 *
 * No-resurrection guard and current-owner boundary for the search panel adapter.
 *
 * The old adapter lived at `src/lib/search/panel-adapter.ts` (MISSING).
 * This contract ensures:
 * 1. The new adapter at `src/lib/search/search-panel-adapter.ts` is leaf-like.
 * 2. No code outside the adapter toggles `.search-container` state classes.
 * 3. No code outside the adapter sets `document.body.dataset.searchGlow`.
 * 4. Search UI owners actually delegate container/glow writes to the adapter.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ADAPTER_PATH = path.join(ROOT, 'src/lib/search/search-panel-adapter.ts');
const SEARCH_SRC = path.join(ROOT, 'src/lib/search');
const SEARCH_OWNER_FILES = [
  'state.ts',
  'orchestration.ts',
  'results-ui.ts'
];

function readFileSync(p) {
  if (!fs.existsSync(p)) throw new Error(`ASSERTION FAILED: Source file missing: ${p}`);
  return fs.readFileSync(p, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

console.log('\n[TEST 1] search-panel-adapter.ts is leaf-like (no imports)');
const adapterSrc = readFileSync(ADAPTER_PATH);
const importLines = adapterSrc.split('\n').filter(line => line.trim().startsWith('import'));
assert(importLines.length === 0, `Adapter must be leaf-like; found imports:\n${importLines.join('\n')}`);
assert(!adapterSrc.includes('require('), 'Adapter must not use CommonJS require');
console.log('  PASS');

console.log('\n[TEST 2] search-panel-adapter.ts exports required boundary functions');
assert(adapterSrc.includes('export function getSearchContainer'), 'Missing getSearchContainer');
assert(adapterSrc.includes('export function setSearchContainerState'), 'Missing setSearchContainerState');
assert(adapterSrc.includes('export function setSearchGlowState'), 'Missing setSearchGlowState');
assert(adapterSrc.includes('resultsExpanded?: boolean'), 'Missing typed resultsExpanded container state');
assert(adapterSrc.includes("classList.toggle('has-expanded-results', resultsExpanded)"), 'Adapter must own has-expanded-results container class');
console.log('  PASS');

console.log('\n[TEST 3] search owners do not directly toggle .search-container state classes');
const forbiddenContainerClassToggles = [
  'searching',
  'focusing',
  'has-query',
  'results-rendered',
  'has-expanded-results',
  'search-degraded'
];
for (const fileName of SEARCH_OWNER_FILES) {
  const src = readFileSync(path.join(SEARCH_SRC, fileName));
  for (const className of forbiddenContainerClassToggles) {
    assert(
      !src.includes(`classList.toggle('${className}'`) && !src.includes(`classList.toggle("${className}"`),
      `${fileName} must not directly toggle ${className}; delegate through setSearchContainerState`
    );
  }
}
console.log('  PASS');

console.log('\n[TEST 4] search owners do not set document.body.dataset.searchGlow directly');
for (const fileName of SEARCH_OWNER_FILES) {
  const src = readFileSync(path.join(SEARCH_SRC, fileName));
  assert(!src.includes('document.body.dataset.searchGlow'), `${fileName} must not set searchGlow directly; delegate through setSearchGlowState`);
}
console.log('  PASS');

console.log('\n[TEST 5] results-ui.ts delegates expanded container and glow writes to adapter');
const resultsUiSrc = readFileSync(path.join(SEARCH_SRC, 'results-ui.ts'));
assert(
  /import\s*\{[^}]*setSearchContainerState[^}]*setSearchGlowState[^}]*\}\s*from\s*['"][^'"]*search-panel-adapter-bridge['"]/.test(resultsUiSrc),
  'results-ui.ts must import setSearchContainerState and setSearchGlowState from the adapter bridge'
);
assert(resultsUiSrc.includes('setSearchContainerState({ resultsExpanded: isExpanded })'), 'results-ui.ts must delegate expanded-results container state');
assert(resultsUiSrc.includes('setSearchGlowState(true)'), 'activateSearchGlow must delegate active glow DOM state');
assert(resultsUiSrc.includes('setSearchGlowState(false)'), 'clearSearchGlow must delegate inactive glow DOM state');
console.log('  PASS');

console.log('\nsearch-panel-adapter-contract.mjs passed');
