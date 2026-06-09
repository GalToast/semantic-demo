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
const SEMANTIC_DIVE_UI_PATH = path.join(SEMDEMO_ROOT, 'js/modules/semantic-dive-ui.ts');
const LIFECYCLE_PATH = path.join(SEMDEMO_ROOT, 'js/modules/lifecycle.ts');
const RUNTIME_SYNC_CALLERS = [
  'js/modules/camera-controls-choreography-cursor.ts',
  'js/modules/journey-compass-controller.ts',
  'js/modules/journey-thread-settler.ts',
  'js/modules/thread-inspector.ts'
];

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

function main() {
  console.log('=================================================================');
  console.log('semantic-dive-ui-dewindowing-contract.mjs');
  console.log('Contract: semantic-dive-ui updateExplorationUi de-windowing');
  console.log('=================================================================');

  const diveSrc = fs.readFileSync(SEMANTIC_DIVE_UI_PATH, 'utf-8');
  const lifecycleSrc = fs.readFileSync(LIFECYCLE_PATH, 'utf-8');

  // lifecycle.js must export updateExplorationUi
  assert(
    /^export\s+function\s+updateExplorationUi\s*\(/m.test(lifecycleSrc),
    'lifecycle.js must export updateExplorationUi as a named function'
  );

  // semantic-dive-ui.js must NOT call window.updateExplorationUi
  const lines = diveSrc.split('\n');
  const badLines = [];
  lines.forEach((line, i) => {
    if (line.includes('window.updateExplorationUi')) {
      badLines.push(`  line ${i + 1}: ${line.trim()}`);
    }
  });
  assert(badLines.length === 0, `semantic-dive-ui.js must not call window.updateExplorationUi:\n${badLines.join('\n')}`);

  // lifecycle.js must NOT import updateExplorationUi from semantic-dive-ui.js
  // (that would create a cycle)
  assert(
    !/import\s+\{[^}]*\bupdateExplorationUi\b[^}]*\}\s+from\s+['"]\.\/semantic-dive-ui\.js['"]/.test(lifecycleSrc),
    'lifecycle.js must NOT import updateExplorationUi from semantic-dive-ui.js (no cycle)'
  );

  for (const relativePath of RUNTIME_SYNC_CALLERS) {
    const absolutePath = path.join(SEMDEMO_ROOT, relativePath);
    const src = fs.readFileSync(absolutePath, 'utf-8');
    assert(
      /import\s+\{[^}]*\bsyncSemanticDiveUi\b[^}]*\}\s+from\s+['"]\.\/semantic-dive-ui(\.ts)?['"]/.test(src),
      `${relativePath} must import syncSemanticDiveUi directly from semantic-dive-ui.js`
    );
    assert(
      !src.includes('window.syncSemanticDiveUi'),
      `${relativePath} must not call window.syncSemanticDiveUi`
    );
  }

  assert(
    !/window\.syncSemanticDiveUi\b/.test(lifecycleSrc),
    'lifecycle.js must not retain the retired window.syncSemanticDiveUi compatibility bridge'
  );

  console.log('\n=================================================================');
  console.log('ALL TESTS PASSED');
  console.log('=================================================================');
  process.exit(0);
}

main();
