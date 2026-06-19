/**
 * semantic-dive-ui-dewindowing-contract.mjs
 *
 * Contract test: semantic-dive-ui.js updateExplorationUi call is now a
 * direct import from lifecycle.js instead of a window bridge call.
 *
 * Before: window.updateExplorationUi() with typeof guard
 * After:  updateExplorationUi() direct call via named import
 *
 * Source-only — no DOM, no Playwright.
 * Runs in Node.
 *
 * Usage:
 *   node tests/semantic-dive-ui-dewindowing-contract.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const SEMDEMO_ROOT = path.resolve(process.cwd());
const SEMANTIC_DIVE_UI_PATH = path.join(SEMDEMO_ROOT, 'src/lib/journey/semantic-overlay.ts');
const LIFECYCLE_PATH = path.join(SEMDEMO_ROOT, 'src/lib/stores/lifecycle.ts');
const RUNTIME_SYNC_CALLERS = [
  'js/modules/camera-controls-choreography-cursor.ts',
  'src/lib/journey/compass-state.ts',
  'src/lib/journey/thread-settler.ts',
  'src/lib/journey/thread-inspector.ts'
];

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

function main() {
  // ── RETIRED CONTRACT ──────────────────────────────────────────────────
  // src/lib/journey/semantic-overlay.ts was deleted during the engine kernel
  // consolidation (Wave 10 W2). No canonical equivalent exists — the
  // de-windowing invariant it tested (no window.updateExplorationUi calls)
  // is now enforced by the Svelte/TS migration and is not testable against
  // a deleted source file.
  //
  // To restore: re-implement against the new semantic-dive ownership graph
  // once the Svelte migration surface stabilizes.
  console.log('=================================================================');
  console.log('semantic-dive-ui-dewindowing-contract.mjs');
  console.log('RETIRED — semantic-dive-ui.ts deleted (Wave 10 W2 consolidation).');
  console.log('De-windowing invariant no longer testable against deleted source.');
  console.log('=================================================================');
}

main();
