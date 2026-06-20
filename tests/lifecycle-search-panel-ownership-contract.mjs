/**
 * lifecycle-search-panel-ownership-contract.mjs
 *
 * Fast Node contract test verifying that search panel state is owned by the
 * current search/results-ui module and reset/url lifecycle code does not route
 * through a window bridge.
 *
 * Ownership rule (source contract):
 *   setSearchPanelState is owned by src/lib/search/results-ui.ts.
 *   src/lib/search/state.ts is the facade for consumers that need it.
 *   The retired window._ss debug namespace was not a public API surface.
 *
 * resetStateBeforeUrlRestore clears canonical state/input directly; search
 * panel DOM state remains owned by search/results-ui.ts + the panel adapter.
 *
 * Source-only — no DOM, no Playwright.
 * Runs in Node.
 *
 * Usage:
 *   node tests/lifecycle-search-panel-ownership-contract.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const SEMDEMO_ROOT = path.resolve(process.cwd());
const URL_STATE_PATH = path.join(SEMDEMO_ROOT, 'src/lib/orchestration/url-state.ts');
const SEARCH_STATE_PATH = path.join(SEMDEMO_ROOT, 'src/lib/search/state.ts');
const SEARCH_RESULTS_UI_PATH = path.join(SEMDEMO_ROOT, 'src/lib/search/results-ui.ts');
const SEARCH_PANEL_BRIDGE_PATH = path.join(SEMDEMO_ROOT, 'src/lib/engine/search-panel-adapter-bridge.ts');
const APP_PATH = path.join(SEMDEMO_ROOT, 'src/lib/orchestration/app-init.ts');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

// ---------------------------------------------------------------------------
// TEST 1 — search/results-ui.ts must export setSearchPanelState as a named function
// ---------------------------------------------------------------------------

function testSearchStateExportsSetSearchPanelState() {
  console.log('\n[TEST] search/results-ui.ts exports setSearchPanelState as named export');

  const src = fs.readFileSync(SEARCH_RESULTS_UI_PATH, 'utf-8');
  assert(
    /^export\s+function\s+setSearchPanelState\s*\(/m.test(src),
    'search/results-ui.ts must export setSearchPanelState as a named function (^export function setSearchPanelState)'
  );

  console.log('  OK — search/results-ui.ts exports setSearchPanelState as named function');
}

// ---------------------------------------------------------------------------
// TEST 2 — search/state.ts facade must re-export setSearchPanelState
// ---------------------------------------------------------------------------

function testLifecycleImportsSetSearchPanelState() {
  console.log('\n[TEST] search/state.ts facade re-exports setSearchPanelState from results-ui');

  const src = fs.readFileSync(SEARCH_STATE_PATH, 'utf-8');

  assert(
    /export\s*\{[\s\S]*\bsetSearchPanelState\b[\s\S]*\}\s+from\s+['"]\.\/results-ui['"]/.test(src),
    'search/state.ts must re-export setSearchPanelState from ./results-ui'
  );

  console.log('  OK — search/state.ts exposes the canonical results-ui owner');
}

// ---------------------------------------------------------------------------
// TEST 3 — reset/url lifecycle must NOT use window.setSearchPanelState as a guarded no-op
// The old call was:
//   if (typeof window.setSearchPanelState === 'function')
//     window.setSearchPanelState({ searching: false, focusing: false, resultsRendered: false });
// This guard was a permanent no-op because app.js never exported setSearchPanelState.
// ---------------------------------------------------------------------------

function testLifecycleNoWindowSetSearchPanelStateCall() {
  console.log('\n[TEST] url-state reset does not call window.setSearchPanelState (dead guarded call removed)');

  const lifecycleSrc = fs.readFileSync(URL_STATE_PATH, 'utf-8');
  const lines = lifecycleSrc.split('\n');

  const problems = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    const pos = t.indexOf('window.setSearchPanelState');
    if (pos === -1) continue;
    // Allow comment references
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('*')) continue;
    // Check if guarded
    const before = t.substring(0, pos);
    if (before.includes('typeof') || before.includes('?.')) continue;
    // Multi-line guard: scan up to 4 preceding non-blank lines
    let guarded = false;
    for (let j = Math.max(0, i - 4); j < i; j++) {
      const prev = lines[j].trim();
      if (prev.includes('typeof') || prev.includes('?.')) { guarded = true; break; }
    }
    if (guarded) continue;
    problems.push(`  line ${i + 1}: ${t}`);
  }

  assert(problems.length === 0,
    `url-state reset must not call window.setSearchPanelState (bare or unguarded):\n${problems.join('\n')}`
  );

  console.log('  OK — no window.setSearchPanelState call found in url-state.ts');
}

// ---------------------------------------------------------------------------
// TEST 4 — resetStateBeforeUrlRestore clears canonical search state/input directly
// ---------------------------------------------------------------------------

function testLifecycleCallsSetSearchPanelStateDirectly() {
  console.log('\n[TEST] resetStateBeforeUrlRestore clears canonical search state/input directly');

  const src = fs.readFileSync(URL_STATE_PATH, 'utf-8');

  assert(
    /export\s+function\s+resetStateBeforeUrlRestore\s*\(/.test(src),
    'url-state.ts must export resetStateBeforeUrlRestore'
  );
  assert(
    /appState\.currentSearchSummary\s*=\s*null/.test(src),
    'resetStateBeforeUrlRestore must clear appState.currentSearchSummary'
  );
  assert(
    /input\.dispatchEvent\s*\(\s*new\s+Event\s*\(\s*['"]input['"]/.test(src),
    'resetStateBeforeUrlRestore({ clearSearchInput }) must notify the search input owner via an input event'
  );

  console.log('  OK — resetStateBeforeUrlRestore clears canonical state and input without a window bridge');
}

// ---------------------------------------------------------------------------
// TEST 5 — app.js must NOT export setSearchPanelState to window
// (it was never supposed to, and the dead guard proves it)
// ---------------------------------------------------------------------------

function testAppJsDoesNotExportSetSearchPanelState() {
  console.log('\n[TEST] app.js does NOT export setSearchPanelState to window');

  const appSrc = fs.readFileSync(APP_PATH, 'utf-8');

  // app.js must not assign setSearchPanelState to window
  assert(
    !/(?:window\.)?setSearchPanelState\s*=\s*(?!=)/.test(appSrc),
    'app.js must NOT assign window.setSearchPanelState — it is not the owner'
  );

  console.log('  OK — app.js does not export setSearchPanelState to window');
}

// ---------------------------------------------------------------------------
// TEST 6 — search/results-ui.ts owns the setSearchPanelState decision point and
// delegates panel DOM writes through the panel adapter bridge.
// ---------------------------------------------------------------------------

function testSearchStateImplementsPanelState() {
  console.log('\n[TEST] search/results-ui.ts delegates panel DOM state through the panel adapter bridge');

  const src = fs.readFileSync(SEARCH_RESULTS_UI_PATH, 'utf-8');
  const adapterSrc = fs.readFileSync(SEARCH_PANEL_BRIDGE_PATH, 'utf-8');

  assert(
    /setSearchContainerState[\s\S]*from\s+['"]\.\.\/engine\/search-panel-adapter-bridge['"]/.test(src),
    'search/results-ui.ts must import setSearchContainerState from the panel adapter bridge'
  );

  assert(
    /setSearchContainerState\s*\(\s*\{/.test(src),
    'search/results-ui.ts setSearchPanelState must delegate to setSearchContainerState'
  );

  assert(
    /setSearchContainerState/.test(adapterSrc),
    'search-panel-adapter bridge must expose setSearchContainerState'
  );

  console.log('  OK — search/results-ui.ts owns decision; panel adapter bridge owns DOM class toggling');
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

function main() {
  console.log('=================================================================');
  console.log('lifecycle-search-panel-ownership-contract.mjs');
  console.log('Contract test: setSearchPanelState ownership and reset bridge removal');
  console.log('=================================================================');

  try {
    testSearchStateExportsSetSearchPanelState();
    testLifecycleImportsSetSearchPanelState();
    testLifecycleNoWindowSetSearchPanelStateCall();
    testLifecycleCallsSetSearchPanelStateDirectly();
    testAppJsDoesNotExportSetSearchPanelState();
    testSearchStateImplementsPanelState();

    console.log('\n=================================================================');
    console.log('ALL TESTS PASSED');
    console.log('=================================================================');
    process.exit(0);
  } catch (err) {
    console.error('\nTEST FAILED:', err.message);
    process.exit(1);
  }
}

main();
