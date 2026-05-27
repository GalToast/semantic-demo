/**
 * keyboard-reset-ownership-contract.mjs
 *
 * MODERNIZED: Final Keyboard Reset Ownership Contract.
 *
 * Verifies that keyboard-help.js receives reset ownership through lifecycle
 * injection and has retired legacy window fallbacks.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const KEYBOARD_HELP_PATH = path.join(ROOT, 'js/modules/keyboard-help.js');
const LIFECYCLE_PATH = path.join(ROOT, 'js/modules/lifecycle.js');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

const src = fs.readFileSync(KEYBOARD_HELP_PATH, 'utf-8');
const lifecycle = fs.readFileSync(LIFECYCLE_PATH, 'utf-8');

console.log('=================================================================');
console.log('keyboard-reset-ownership-contract.mjs (MODERNIZED)');
console.log('=================================================================');

try {
  console.log('\n[TEST 1] keyboard-help exposes reset ownership injection');
  assert(src.includes('export function initKeyboardResetOwnership'), 'initKeyboardResetOwnership is exported');
  assert(src.includes('let _returnToOverview = () => {};'), 'returnToOverview default is inert');
  assert(src.includes('let _resetExplorationFocus = () => {};'), 'resetExplorationFocus default is inert');
  assert(!src.includes("from './lifecycle.js'"), 'keyboard-help does not import lifecycle.js');
  console.log('  PASS — Injection seam confirmed');

  console.log('\n[TEST 2] lifecycle owns injected reset functions without window fallback');
  assert(lifecycle.includes("import { initKeyboardResetOwnership } from './keyboard-help.js';"), 'lifecycle imports keyboard injection initializer');
  assert(lifecycle.includes('initKeyboardResetOwnership({ returnToOverview, resetExplorationFocus });'), 'lifecycle injects reset owners');
  assert(!src.includes('typeof window.returnToOverview'), 'keyboard-help has no returnToOverview window fallback');
  assert(!src.includes('typeof window.resetExplorationFocus'), 'keyboard-help has no resetExplorationFocus window fallback');
  console.log('  PASS — Window fallbacks retired');

  console.log('\n=================================================================');
  console.log('ALL TESTS PASSED');
  console.log('=================================================================');
  process.exit(0);
} catch (err) {
  console.error('\nTEST FAILED:', err.message);
  process.exit(1);
}
