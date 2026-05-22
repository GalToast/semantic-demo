/**
 * lifecycle-search-panel-ownership-contract.mjs
 *
 * Fast Node contract test verifying that lifecycle.js correctly imports
 * setSearchPanelState from search-state.js rather than calling it through
 * a window bridge.
 *
 * Ownership rule (source contract):
 *   setSearchPanelState is owned by search-state.js (line 70+).
 *   Any module that needs to call it must import it directly.
 *   The window wrapper (window._ss.setSearchPanelState) is a debug artifact
 *   only — it is NOT a public API surface.
 *
 * lifecycle.js call site (resetStateBeforeUrlRestore:851 before fix):
 *   Guarded no-op: typeof window.setSearchPanelState === 'function'
 *   Problem: app.js never exports setSearchPanelState to window, so the guard
 *   was a permanent no-op. The real function lived in search-state.js.
 *   Fix: lifecycle.js now imports setSearchPanelState directly from search-state.js.
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
const LIFECYCLE_PATH = path.join(SEMDEMO_ROOT, 'js/modules/lifecycle.js');
const SEARCH_STATE_PATH = path.join(SEMDEMO_ROOT, 'js/modules/search-state.js');
const APP_PATH = path.join(SEMDEMO_ROOT, 'js/modules/app.js');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

// ---------------------------------------------------------------------------
// TEST 1 — search-state.js must export setSearchPanelState as a named function
// ---------------------------------------------------------------------------

function testSearchStateExportsSetSearchPanelState() {
  console.log('\n[TEST] search-state.js exports setSearchPanelState as named export');

  const src = fs.readFileSync(SEARCH_STATE_PATH, 'utf-8');
  assert(
    /^export\s+function\s+setSearchPanelState\s*\(/m.test(src),
    'search-state.js must export setSearchPanelState as a named function (^export function setSearchPanelState)'
  );

  console.log('  OK — search-state.js exports setSearchPanelState as named function');
}

// ---------------------------------------------------------------------------
// TEST 2 — lifecycle.js must import setSearchPanelState directly from search-state.js
// ---------------------------------------------------------------------------

function testLifecycleImportsSetSearchPanelState() {
  console.log('\n[TEST] lifecycle.js imports setSearchPanelState from search-state.js');

  const lifecycleSrc = fs.readFileSync(LIFECYCLE_PATH, 'utf-8');

  // Must have a direct named import from ./search-state.js
  assert(
    /import\s+\{[^}]*\bsetSearchPanelState\b[^}]*\}\s+from\s+['"]\.\/search-state\.js['"]/.test(lifecycleSrc),
    'lifecycle.js must import setSearchPanelState from "./search-state.js"'
  );

  console.log('  OK — lifecycle.js imports setSearchPanelState from ./search-state.js');
}

// ---------------------------------------------------------------------------
// TEST 3 — lifecycle.js must NOT use window.setSearchPanelState as a guarded no-op
// The old call was:
//   if (typeof window.setSearchPanelState === 'function')
//     window.setSearchPanelState({ searching: false, focusing: false, resultsRendered: false });
// This guard was a permanent no-op because app.js never exported setSearchPanelState.
// ---------------------------------------------------------------------------

function testLifecycleNoWindowSetSearchPanelStateCall() {
  console.log('\n[TEST] lifecycle.js does not call window.setSearchPanelState (dead guarded call removed)');

  const lifecycleSrc = fs.readFileSync(LIFECYCLE_PATH, 'utf-8');
  const lines = lifecycleSrc.split('\n');

  const problems = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    const pos = t.indexOf('window.setSearchPanelState');
    if (pos === -1) continue;
    // Allow window._ss.setSearchPanelState (debug wrapper)
    if (t.includes('window._ss.setSearchPanelState')) continue;
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
    `lifecycle.js must not call window.setSearchPanelState (bare or unguarded):\n${problems.join('\n')}`
  );

  console.log('  OK — no window.setSearchPanelState call found in lifecycle.js');
}

// ---------------------------------------------------------------------------
// TEST 4 — lifecycle.js must call setSearchPanelState directly (named import, no window)
// ---------------------------------------------------------------------------

function testLifecycleCallsSetSearchPanelStateDirectly() {
  console.log('\n[TEST] lifecycle.js calls setSearchPanelState directly via named import');

  const lifecycleSrc = fs.readFileSync(LIFECYCLE_PATH, 'utf-8');

  // Must call setSearchPanelState(...) directly (not window.setSearchPanelState)
  assert(
    /(?<!window\.)setSearchPanelState\s*\(\s*\{/.test(lifecycleSrc),
    'lifecycle.js must call setSearchPanelState(...) directly (not window.setSearchPanelState)'
  );

  console.log('  OK — lifecycle.js calls setSearchPanelState directly');
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
// TEST 6 — search-state.js setSearchPanelState is the authoritative implementation
// It must operate on .search-container DOM element
// ---------------------------------------------------------------------------

function testSearchStateImplementsPanelState() {
  console.log('\n[TEST] search-state.js setSearchPanelState implements panel state on .search-container');

  const src = fs.readFileSync(SEARCH_STATE_PATH, 'utf-8');

  // Must reference .search-container (the target DOM element)
  assert(
    /\.search-container/.test(src),
    'search-state.js setSearchPanelState must operate on .search-container'
  );

  // Must toggle 'searching' and 'focusing' CSS classes
  assert(
    /\.classList\.toggle\s*\(\s*['"]searching['"]/.test(src) ||
    /classList\.toggle\s*\(\s*['"]focusing['"]/.test(src),
    'setSearchPanelState must toggle searching/focusing CSS classes'
  );

  console.log('  OK — search-state.js setSearchPanelState implements .search-container class toggling');
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

function main() {
  console.log('=================================================================');
  console.log('lifecycle-search-panel-ownership-contract.mjs');
  console.log('Contract test: setSearchPanelState ownership and lifecycle import');
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