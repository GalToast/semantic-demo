/**
 * semantic-dive-active-owner-contract.mjs
 *
 * MODERNIZED: Final Ownership Contract.
 *
 * Verifies that semantic-dive state is owned by lifecycle.js and consumed
 * via direct module patterns, with NO global window interference.
 *
 * Run: node tests/semantic-dive-active-owner-contract.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());
const LIFECYCLE = path.join(ROOT, 'src/lib/orchestration/lifecycle.ts');
const JOURNEY = path.join(ROOT, 'src/lib/journey/journey.ts');

function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function getSource(file) {
  return fs.readFileSync(file, 'utf-8');
}

function testOwnershipAuth() {
  console.log('\n[TEST 1] lifecycle.js is the authoritative owner of setSemanticDiveMode');
  const lc = getSource(LIFECYCLE);

  assert(/export\s+function\s+setSemanticDiveMode/.test(lc), 'lifecycle.js must export setSemanticDiveMode');
  assert(!/window\.setSemanticDiveMode\s*=/.test(lc), 'lifecycle.js must NOT shim to window');
  console.log('  PASS — lifecycle.js owns implementation');
}

function testJourneyDelegation() {
  console.log('\n[TEST 2] journey.js delegates via imports, not globals');
  const jn = getSource(JOURNEY);

  // It may still have an adapter or local wrapper, but it must NOT use window.setSemanticDiveMode
  assert(!/window\.setSemanticDiveMode/.test(jn), 'journey.js must NOT reference window.setSemanticDiveMode');
  console.log('  PASS — journey.js is clean of window globals');
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

console.log('=================================================================');
console.log('semantic-dive-active-owner-contract.mjs (MODERNIZED)');
console.log('Contract: Modular ownership of semantic-dive state');
console.log('=================================================================');

try {
  testOwnershipAuth();
  testJourneyDelegation();

  console.log('\n=================================================================');
  console.log('ALL OWNERSHIP RULES PASSED');
  console.log('=================================================================');
  process.exit(0);
} catch (err) {
  console.error('\nCONTRACT FAILED:', err.message);
  process.exit(1);
}
