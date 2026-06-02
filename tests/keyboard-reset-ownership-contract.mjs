/**
 * keyboard-reset-ownership-contract.mjs
 *
 * Hardened Keyboard Reset Ownership Contract (post-dewindowing).
 *
 * Proves five guarantees:
 *   1. keyboard-help has no typeof window.returnToOverview / resetExplorationFocus
 *   2. inert defaults are module-local (let _returnToOverview = () => {})
 *   3. app.js injects initKeyboardResetOwnership with real lifecycle functions
 *   4. lifecycle's returnToOverview / resetExplorationFocus are exported function
 *      declarations, not empty stubs
 *   5. keyboard-help calls only _returnToOverview() / _resetExplorationFocus() from
 *      key handlers, never direct lifecycle imports
 *
 * Source-only Node contract - no DOM, no Playwright.
 * Usage: node tests/keyboard-reset-ownership-contract.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const KEYBOARD_HELP_PATH = path.join(ROOT, 'js/modules/keyboard-help.js');
const LIFECYCLE_PATH = path.join(ROOT, 'js/modules/lifecycle.js');
const APP_PATH = path.join(ROOT, 'js/modules/app.js');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

const src = fs.readFileSync(KEYBOARD_HELP_PATH, 'utf-8');
const lifecycle = fs.readFileSync(LIFECYCLE_PATH, 'utf-8');
const appSrc = fs.readFileSync(APP_PATH, 'utf-8');

console.log('=================================================================');
console.log('keyboard-reset-ownership-contract.mjs (HARDENED post-dewindowing)');
console.log('=================================================================');

try {
  // Contract Point 1: No typeof window fallbacks in keyboard-help
  console.log('\n[CONTRACT 1] keyboard-help has no window.resetExplorationFocus fallbacks');
  assert(
    !src.includes('typeof window.returnToOverview'),
    'keyboard-help must not reference window.returnToOverview'
  );
  assert(
    !src.includes('typeof window.resetExplorationFocus'),
    'keyboard-help must not reference window.resetExplorationFocus'
  );
  assert(
    !src.includes('window.returnToOverview'),
    'keyboard-help must not reference window.returnToOverview at all'
  );
  assert(
    !src.includes('window.resetExplorationFocus'),
    'keyboard-help must not reference window.resetExplorationFocus at all'
  );
  console.log('  PASS - no window.* references');

  // Contract Point 2: Inert defaults are module-local
  console.log('\n[CONTRACT 2] inert defaults are module-local');
  assert(
    src.includes('let _returnToOverview = () => {};'),
    'returnToOverview default must be module-local inert () => {}'
  );
  assert(
    src.includes('let _resetExplorationFocus = () => {};'),
    'resetExplorationFocus default must be module-local inert () => {}'
  );
  assert(
    !src.includes('window._returnToOverview'),
    'inert default must not be exposed on window'
  );
  assert(
    !src.includes('window._resetExplorationFocus'),
    'inert default must not be exposed on window'
  );
  console.log('  PASS - inert defaults are module-scoped');

  // Contract Point 3: app.js owns the injection from the real init path
  console.log('\n[CONTRACT 3] app.js injects real named functions');
  assert(
    appSrc.includes("import { initKeyboardShortcutsHint, initKeyboardResetOwnership } from './keyboard-help.js';"),
    'app.js must import initKeyboardResetOwnership from keyboard-help'
  );
  assert(
    appSrc.includes('initKeyboardResetOwnership({ returnToOverview, resetExplorationFocus });'),
    'app.js must call initKeyboardResetOwnership with real named functions from the real init path'
  );
  assert(
    !lifecycle.includes("import { initKeyboardResetOwnership } from './keyboard-help.js';"),
    'lifecycle must not import initKeyboardResetOwnership; app.js owns the injection'
  );
  assert(
    !/export\s+function\s+initEventListeners\s*\(/.test(lifecycle),
    'lifecycle must not export a dead initEventListeners keyboard shim'
  );
  console.log('  PASS - injection seam verified (app.js is the real init caller)');

  // Contract Point 4: lifecycle exports are real function declarations, not stubs
  console.log('\n[CONTRACT 4] lifecycle exports are exported function declarations, not empty stubs');
  const returnToOverviewMatch = lifecycle.match(
    /export\s+function\s+returnToOverview\s*\(\s*\)\s*\{[^}]+\}/,
  );
  assert(returnToOverviewMatch, 'returnToOverview must be an exported function declaration');
  assert(
    !/export\s+const\s+returnToOverview\s*=\s*\(\s*\)\s*=>\s*\{\s*\}/.test(lifecycle) &&
    !/export\s+function\s+returnToOverview\s*\(\s*\)\s*\{\s*\}/.test(lifecycle),
    'returnToOverview must not be an empty stub'
  );

  const rfStart = lifecycle.indexOf('export function resetExplorationFocus');
  assert(rfStart !== -1, 'resetExplorationFocus must be an exported function declaration');
  const rfAfterDecl = lifecycle.slice(rfStart + 'export function resetExplorationFocus'.length);
  const rfBodyStart = rfAfterDecl.indexOf('{');
  assert(rfBodyStart !== -1, 'resetExplorationFocus must have a function body');
  const rfBodySlice = rfAfterDecl.slice(rfBodyStart + 1, rfBodyStart + 1400);
  assert(
    rfBodySlice.includes('state.navState') &&
    rfBodySlice.includes('syncFocusStage') &&
    rfBodySlice.includes('publish'),
    'resetExplorationFocus must have a non-trivial body (state mutations + event publication)'
  );
  assert(
    !/export\s+function\s+resetExplorationFocus\s*\([^)]*\)\s*\{\s*\}/.test(lifecycle),
    'resetExplorationFocus must not be an empty stub'
  );
  console.log('  PASS - returnToOverview and resetExplorationFocus are real exported functions');

  // Contract Point 5: keyboard-help calls only _ prefixed variants from key handlers
  console.log('\n[CONTRACT 5] keyboard-help calls only _returnToOverview / _resetExplorationFocus from key handlers');
  assert(
    !src.includes("from './lifecycle.js'") && !src.includes('from "./lifecycle.js"'),
    'keyboard-help must not import from lifecycle.js (prevents direct coupling)'
  );
  const keyHandlerSections = src.match(/function\s+handleGalaxyKeydown[\s\S]*?(?=export\s+function\s|\z)/);
  assert(keyHandlerSections, 'keyboard-help must define handleGalaxyKeydown');
  const handlerBody = keyHandlerSections[0];
  assert(
    handlerBody.includes('_returnToOverview('),
    'handleGalaxyKeydown must call _returnToOverview(), not the unguarded variant'
  );
  assert(
    handlerBody.includes('_resetExplorationFocus('),
    'handleGalaxyKeydown must call _resetExplorationFocus(), not the unguarded variant'
  );
  const handlerWithoutInjectedCalls = handlerBody
    .replace(/_returnToOverview\s*\(/g, '')
    .replace(/_resetExplorationFocus\s*\(/g, '');
  assert(
    !/\breturnToOverview\s*\(/.test(handlerWithoutInjectedCalls),
    'handleGalaxyKeydown must not call unguarded returnToOverview - only _returnToOverview'
  );
  assert(
    !/\bresetExplorationFocus\s*\(/.test(handlerWithoutInjectedCalls),
    'handleGalaxyKeydown must not call unguarded resetExplorationFocus - only _resetExplorationFocus'
  );
  console.log('  PASS - key handlers use only _ prefixed injected functions');

  console.log('\n=================================================================');
  console.log('ALL CONTRACT POINTS PASSED');
  console.log('=================================================================');
  process.exit(0);
} catch (err) {
  console.error('\nCONTRACT FAILED:', err.message);
  process.exit(1);
}
