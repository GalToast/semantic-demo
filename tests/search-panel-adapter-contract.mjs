/**
 * search-panel-adapter-contract.mjs
 *
 * Fast Node contract for the search-state -> search-panel-adapter boundary.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CWD = process.cwd();
const SEARCH_STATE_PATH = resolve(CWD, 'js/modules/search-state.ts');
const PANEL_ADAPTER_PATH = resolve(CWD, 'js/modules/search-panel-adapter.ts');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function assertContains(source, needle, label) {
  assert(source.includes(needle), `${label}: expected "${needle}"`);
}

function assertNotContains(source, needle, label) {
  assert(!source.includes(needle), `${label}: should not contain "${needle}"`);
}

function extractFunction(source, functionName) {
  const marker = `export function ${functionName}`;
  const start = source.indexOf(marker);
  assert(start >= 0, `missing export function ${functionName}`);

  const open = source.indexOf('{', start);
  assert(open >= 0, `missing body for ${functionName}`);

  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Could not extract ${functionName}`);
}

function testAdapterExports() {
  const adapter = readFileSync(PANEL_ADAPTER_PATH, 'utf8');
  assertContains(adapter, 'export function getSearchContainer', 'panel adapter exports search container lookup');
  assertContains(adapter, 'export function setSearchContainerState', 'panel adapter exports container state');
  assertContains(adapter, 'export function setSearchGlowState', 'panel adapter exports search glow state');
  assertContains(adapter, 'export function setMobileSearchSheetMode', 'panel adapter exports mobile sheet state');
  assertContains(adapter, 'export function clearMobileSearchSheetState', 'panel adapter exports mobile sheet clear state');
  assertContains(adapter, 'export function setupMobileSearchSheetToggle', 'panel adapter exports mobile sheet toggle setup');
}

function testSearchStateDelegatesPanelDomWrites() {
  const searchState = readFileSync(SEARCH_STATE_PATH, 'utf8');
  assertContains(searchState, "from './search-panel-adapter.ts'", 'search-state imports panel adapter');
  assertContains(searchState, 'setSearchContainerState({', 'search-state delegates container classes');
  assertContains(searchState, 'setSearchGlowState(true)', 'search-state delegates active glow');
  assertContains(searchState, 'setSearchGlowState(false)', 'search-state delegates inactive glow');
  assertContains(searchState, 'setupMobileSearchSheetToggle({ isCompactSearchViewport })', 'search-state delegates mobile sheet setup');

  const setPanel = extractFunction(searchState, 'setSearchPanelState');
  assertNotContains(setPanel, 'classList.toggle', 'setSearchPanelState delegates class toggles');

  const activateGlow = extractFunction(searchState, 'activateSearchGlow');
  const clearGlow = extractFunction(searchState, 'clearSearchGlow');
  assertNotContains(activateGlow, 'document.body.dataset.searchGlow', 'activateSearchGlow delegates body dataset');
  assertNotContains(clearGlow, 'document.body.dataset.searchGlow', 'clearSearchGlow delegates body dataset');
  assert(!/function\s+setMobileSearchSheetMode/.test(searchState), 'search-state.js must not define mobile sheet DOM state helper');
  assert(!/function\s+setupMobileSearchSheetToggle/.test(searchState), 'search-state.js must not define mobile sheet DOM setup helper');
  assertNotContains(searchState, 'document.body.dataset.mobileSearchSheet =', 'search-state delegates mobile sheet dataset writes');
  assertNotContains(searchState, 'document.body.dataset.panelSurfaceDetail =', 'search-state delegates panel surface detail writes');

  const successPath = searchState.slice(searchState.indexOf('renderSearchResultItems(resultsEl, results'));
  assert(
    /setSearchPanelState\(\{\s*searching:\s*false,\s*focusing:\s*false,\s*hasQuery:\s*true,\s*resultsRendered:\s*true\s*\}\);\s*setupMobileSearchSheetToggle\(\{\s*isCompactSearchViewport\s*\}\);/.test(successPath),
    'successful multi-result search must refresh mobile sheet setup after has-query/results-rendered classes are set'
  );
}

function testAdapterIsLeaf() {
  const adapter = readFileSync(PANEL_ADAPTER_PATH, 'utf8');
  const importLines = adapter.split('\n').filter(line => line.trim().startsWith('import'));
  assert(importLines.length === 0, `search-panel-adapter.js must stay leaf-like; found imports:\n${importLines.join('\n')}`);
  assertNotContains(adapter, 'require(', 'search-panel-adapter.js must not use CommonJS require');
}

testAdapterExports();
testSearchStateDelegatesPanelDomWrites();
testAdapterIsLeaf();

console.log('PASS: search panel DOM state is routed through search-panel-adapter.ts');
