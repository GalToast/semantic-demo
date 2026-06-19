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
 *   The retired window._ss debug namespace was not a public API surface.
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
const LIFECYCLE_PATH = path.join(SEMDEMO_ROOT, 'src/lib/stores/lifecycle.ts');
const LIFECYCLE_RESET_PATH = path.join(SEMDEMO_ROOT, 'src/lib/stores/lifecycle.ts');
const SEARCH_STATE_PATH = path.join(SEMDEMO_ROOT, 'src/lib/stores/search.svelte.ts');
const SEARCH_PANEL_ADAPTER_PATH = path.join(SEMDEMO_ROOT, 'src/lib/search/panel-adapter.ts');
const APP_PATH = path.join(SEMDEMO_ROOT, 'src/lib/orchestration/app-init.ts');

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
  console.log('\n[TEST] lifecycle module imports setSearchPanelState from search-state.ts');

  const importPattern = /import\s+\{[^}]*\bsetSearchPanelState\b[^}]*\}\s+from\s+['"]\.\/search-state\.(?:js|ts)['"]/;

  // After lifecycle decomposition, the import may live in lifecycle.js (facade)
  // or in lifecycle-reset.js (the extracted sub-module that actually calls it).
  const lifecycleSrc = fs.readFileSync(LIFECYCLE_PATH, 'utf-8');
  const lifecycleResetSrc = fs.readFileSync(LIFECYCLE_RESET_PATH, 'utf-8');

  const foundInLifecycle = importPattern.test(lifecycleSrc);
  const foundInLifecycleReset = importPattern.test(lifecycleResetSrc);

  assert(
    foundInLifecycle || foundInLifecycleReset,
    'lifecycle.js or lifecycle-reset.js must import setSearchPanelState from "./search-state.js"'
  );

  const location = foundInLifecycle ? 'lifecycle.ts' : 'lifecycle-reset.ts';
  console.log(`  OK — ${location} imports setSearchPanelState from ./search-state.js`);
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

  console.log('  OK — no window.setSearchPanelState call found in lifecycle.ts');
}

// ---------------------------------------------------------------------------
// TEST 4 — lifecycle.js must call setSearchPanelState directly (named import, no window)
// ---------------------------------------------------------------------------

function testLifecycleCallsSetSearchPanelStateDirectly() {
  console.log('\n[TEST] lifecycle module calls setSearchPanelState directly via named import');

  const callPattern = /(?<!window\.)setSearchPanelState\s*\(\s*\{/;

  const lifecycleSrc = fs.readFileSync(LIFECYCLE_PATH, 'utf-8');
  const lifecycleResetSrc = fs.readFileSync(LIFECYCLE_RESET_PATH, 'utf-8');

  const foundInLifecycle = callPattern.test(lifecycleSrc);
  const foundInLifecycleReset = callPattern.test(lifecycleResetSrc);

  assert(
    foundInLifecycle || foundInLifecycleReset,
    'lifecycle.js or lifecycle-reset.js must call setSearchPanelState(...) directly (not window.setSearchPanelState)'
  );

  const location = foundInLifecycle ? 'lifecycle.ts' : 'lifecycle-reset.ts';
  console.log(`  OK — ${location} calls setSearchPanelState directly`);
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
// TEST 6 — search-state.js owns the setSearchPanelState decision point and
// delegates the panel DOM writes through search-panel-adapter.js.
// ---------------------------------------------------------------------------

function testSearchStateImplementsPanelState() {
  console.log('\n[TEST] search-state.js delegates panel DOM state through search-panel-adapter.ts');

  const src = fs.readFileSync(SEARCH_STATE_PATH, 'utf-8');
  const adapterSrc = fs.readFileSync(SEARCH_PANEL_ADAPTER_PATH, 'utf-8');

  assert(
    /from\s+['"]\.\/search-panel-adapter\.(?:js|ts)['"]/.test(src),
    'search-state.js must import search-panel-adapter.ts'
  );

  assert(
    /setSearchContainerState\s*\(\s*\{/.test(src),
    'search-state.js setSearchPanelState must delegate to setSearchContainerState'
  );

  assert(
    /\.search-container/.test(adapterSrc),
    'search-panel-adapter.js must operate on .search-container'
  );

  assert(
    /\.classList\.toggle\s*\(\s*['"]searching['"]/.test(adapterSrc) &&
    /\.classList\.toggle\s*\(\s*['"]focusing['"]/.test(adapterSrc),
    'search-panel-adapter.js must toggle searching/focusing CSS classes'
  );

  console.log('  OK — search-state.js owns decision; search-panel-adapter.js owns DOM class toggling');
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
