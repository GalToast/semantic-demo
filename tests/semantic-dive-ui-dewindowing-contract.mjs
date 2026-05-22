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
const SEMANTIC_DIVE_UI_PATH = path.join(SEMDEMO_ROOT, 'js/modules/semantic-dive-ui.js');
const LIFECYCLE_PATH = path.join(SEMDEMO_ROOT, 'js/modules/lifecycle.js');

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

  // semantic-dive-ui.js must import updateExplorationUi from lifecycle.js
  assert(
    /import\s+\{[^}]*\bupdateExplorationUi\b[^}]*\}\s+from\s+['"]\.\/lifecycle\.js['"]/.test(diveSrc),
    'semantic-dive-ui.js must import updateExplorationUi from ./lifecycle.js'
  );

  // semantic-dive-ui.js must NOT have a typeof guard for updateExplorationUi
  // (the direct import replaces it)
  const lines = diveSrc.split('\n');
  const badLines = [];
  lines.forEach((line, i) => {
    if (line.includes('window.updateExplorationUi')) {
      badLines.push(`  line ${i + 1}: ${line.trim()}`);
    }
  });
  assert(badLines.length === 0, `semantic-dive-ui.js must not call window.updateExplorationUi:\n${badLines.join('\n')}`);

  // semantic-dive-ui.js must call updateExplorationUi() (the direct import)
  assert(
    /\bupdateExplorationUi\s*\(\s*\)/.test(diveSrc),
    'semantic-dive-ui.js must call updateExplorationUi() directly'
  );

  // lifecycle.js must NOT import updateExplorationUi from semantic-dive-ui.js
  // (that would create a cycle)
  assert(
    !/import\s+\{[^}]*\bupdateExplorationUi\b[^}]*\}\s+from\s+['"]\.\/semantic-dive-ui\.js['"]/.test(lifecycleSrc),
    'lifecycle.js must NOT import updateExplorationUi from semantic-dive-ui.js (no cycle)'
  );

  console.log('\n=================================================================');
  console.log('ALL TESTS PASSED');
  console.log('=================================================================');
  process.exit(0);
}

main();