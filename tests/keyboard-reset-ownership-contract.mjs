/**
 * keyboard-reset-ownership-contract.mjs
 *
 * Hardened Keyboard Reset Ownership Contract (post-dewindowing).
 *
 * Proves five guarantees:
 *   1. keyboard-help has no typeof window.returnToOverview / resetExplorationFocus
 *   2. inert defaults are module-local (let _returnToOverview = () => {})
 *   3. orchestration/triggers.ts owns global reset key handling with real lifecycle functions
 *   4. lifecycle exports returnToOverview / resetExplorationFocus from the store lifecycle owner
 *   5. keyboard-help calls only _returnToOverview() / _resetExplorationFocus() from
 *      key handlers, never direct lifecycle imports
 *
 * Source-only Node contract - no DOM, no Playwright.
 * Usage: node tests/keyboard-reset-ownership-contract.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const KEYBOARD_HELP_PATH = path.join(ROOT, 'src/lib/keyboard/keyboard-help.ts');
const LIFECYCLE_PATH = path.join(ROOT, 'src/lib/stores/lifecycle.ts');
const ORCHESTRATION_LIFECYCLE_PATH = path.join(ROOT, 'src/lib/orchestration/lifecycle.ts');
const TRIGGERS_PATH = path.join(ROOT, 'src/lib/orchestration/triggers.ts');

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

const src = fs.readFileSync(KEYBOARD_HELP_PATH, 'utf-8');
const lifecycle = fs.readFileSync(LIFECYCLE_PATH, 'utf-8');
const orchestrationLifecycle = fs.readFileSync(ORCHESTRATION_LIFECYCLE_PATH, 'utf-8');
const triggersSrc = fs.readFileSync(TRIGGERS_PATH, 'utf-8');

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
    /let\s+_returnToOverview(?:\s*:\s*\(\)\s*=>\s*void)?\s*=\s*\(\)\s*=>\s*\{\s*\}\s*;?/.test(src),
    'returnToOverview default must be module-local inert () => {}'
  );
  assert(
    /let\s+_resetExplorationFocus(?:\s*:\s*\(\)\s*=>\s*void)?\s*=\s*\(\)\s*=>\s*\{\s*\}\s*;?/.test(src),
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

  // Contract Point 3: orchestration/triggers.ts owns the real app-level key handling
  console.log('\n[CONTRACT 3] orchestration/triggers.ts handles reset keys with real named functions');
  assert(
    /import\s+\{[\s\S]*\breturnToOverview\b[\s\S]*\bresetExplorationFocus\b[\s\S]*\}\s+from\s+['"]\.\/lifecycle['"]/.test(triggersSrc),
    'triggers.ts must import returnToOverview and resetExplorationFocus from orchestration lifecycle'
  );
  assert(
    /export\s+function\s+handleGlobalKeydown\s*\(/.test(triggersSrc),
    'triggers.ts must export handleGlobalKeydown as the app-level key handler'
  );
  assert(
    /key\s*===\s*['"]Escape['"][\s\S]{0,420}returnToOverview\s*\(/.test(triggersSrc),
    'Escape handling must call returnToOverview through the orchestration lifecycle owner'
  );
  assert(
    /key\s*===\s*['"]Home['"][\s\S]{0,180}returnToOverview\s*\(/.test(triggersSrc),
    'Home handling must call returnToOverview through the orchestration lifecycle owner'
  );
  console.log('  PASS - app-level reset key handling is owned by triggers.ts');

  // Contract Point 4: lifecycle exports are real functions, not stubs
  console.log('\n[CONTRACT 4] lifecycle exports are real functions, not empty stubs');
  assert(
    /export\s+\{[\s\S]*\bresetExplorationFocus\b[\s\S]*\breturnToOverview\b[\s\S]*\}\s+from\s+['"]@lib\/stores\/lifecycle['"]/.test(orchestrationLifecycle),
    'orchestration lifecycle must re-export resetExplorationFocus and returnToOverview from @lib/stores/lifecycle'
  );
  const returnToOverviewMatch = lifecycle.match(
    /export\s+function\s+returnToOverview\s*\(\s*\)(?:\s*:\s*\S[^{]*)?\s*\{[\s\S]*?\n\}/,
  );
  assert(returnToOverviewMatch, 'store lifecycle must define returnToOverview as an exported function declaration');
  assert(
    !/export\s+const\s+returnToOverview\s*=\s*\(\s*\)\s*=>\s*\{\s*\}/.test(lifecycle) &&
    !/export\s+function\s+returnToOverview\s*\(\s*\)(?:\s*:\s*\S[^{]*)?\s*\{\s*\}/.test(lifecycle),
    'returnToOverview must not be an empty stub'
  );
  assert(
    returnToOverviewMatch[0].includes('resetExperienceState()') &&
      returnToOverviewMatch[0].includes("switchView('galaxy')"),
    'returnToOverview must reset the experience and switch back to galaxy view'
  );

  const rfStart = lifecycle.indexOf('export function resetExplorationFocus');
  assert(rfStart !== -1, 'resetExplorationFocus must be an exported function declaration');
  const rfAfterDecl = lifecycle.slice(rfStart + 'export function resetExplorationFocus'.length);
  const rfBodyStart = rfAfterDecl.indexOf('{');
  assert(rfBodyStart !== -1, 'resetExplorationFocus must have a function body');
  const rfBodySlice = rfAfterDecl.slice(rfBodyStart + 1, rfBodyStart + 1800);
  assert(
    rfBodySlice.includes('updateNavState') &&
      rfBodySlice.includes('_setSemanticDiveMode(false)') &&
      rfBodySlice.includes('publish(EVENTS.STATE_RESET'),
    'resetExplorationFocus must own non-trivial nav/focus mutation and state reset publication'
  );
  assert(
    !/export\s+function\s+resetExplorationFocus\s*\([^)]*\)(?:\s*:\s*\S[^{]*)?\s*\{\s*\}/.test(lifecycle),
    'resetExplorationFocus must not be an empty stub'
  );
  console.log('  PASS - returnToOverview and resetExplorationFocus are real exported lifecycle functions');

  // Contract Point 5: keyboard-help calls only _ prefixed variants from key handlers
  console.log('\n[CONTRACT 5] keyboard-help calls only _returnToOverview / _resetExplorationFocus from key handlers');
  assert(
    !src.includes("from './lifecycle.ts'") && !src.includes('from "./lifecycle.js"'),
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
